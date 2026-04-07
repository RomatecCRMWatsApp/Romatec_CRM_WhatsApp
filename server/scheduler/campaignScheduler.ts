import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties, schedulerState as schedulerStateTable } from "../../drizzle/schema";
import { eq, and, isNull, or, lte } from "drizzle-orm";

  /**
   * SISTEMA DINÂMICO DE CAMPANHAS v5.0 - CICLO DIÁRIO 24H
   * 
   * REGRAS:
   * 1. Cada campanha tem seu próprio messagesPerHour (1-10, padrão 2)
   * 2. No ciclo de 60 min, o par ativo envia: camp1.messagesPerHour + camp2.messagesPerHour msgs
   * 3. As msgs são distribuídas em SLOTS ALEATÓRIOS dentro dos 60 min
   * 4. Mínimo 3 min entre msgs (segurança anti-ban)
   * 5. Rotação de pares: Par 1 → Par 2 → Par 1...
   * 6. Contatos por campanha = messagesPerHour × 24 (1mph=24, 2mph=48, 3mph=72...)
   * 7. Bloqueio de 72h por contato após envio
   * 8. Ciclo de 60 min começa quando clica PLAY
   * 9. CICLO DIÁRIO = 24 ciclos (24 horas). Ao final, encerra e inicia novo dia.
   * 10. Números inválidos são pulados sem contar como falha.
   */

interface MessageSlot {
  campaignId: number;
  campaignName: string;
  delayMs: number; // delay desde o início do ciclo
  minuteLabel: number; // minuto aproximado (para log)
}

interface SchedulerState {
  isRunning: boolean;
  cycleNumber: number;
  messagesThisCycle: number;
  maxMessagesThisCycle: number; // total dinâmico (camp1.mph + camp2.mph)
  lastMessageSentAt: number;
  cycleStartTime: number;
  startedAt: number;
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  currentPairIndex: number;
  totalPairs: number;
  currentCampaignNames: string[];
  // Status de envio para a UI
  lastSentCampaignName: string;
  lastSentAt: number;
  // Slots agendados para o ciclo atual
  scheduledSlots: { campaignName: string; minuteLabel: number; sent: boolean }[];
}

class CampaignScheduler {
  private state: SchedulerState = {
    isRunning: false,
    cycleNumber: 0,
    messagesThisCycle: 0,
    maxMessagesThisCycle: 0,
    lastMessageSentAt: 0,
    cycleStartTime: Date.now(),
    startedAt: Date.now(),
    totalSent: 0,
    totalFailed: 0,
    totalBlocked: 0,
    currentPairIndex: 0,
    totalPairs: 0,
    currentCampaignNames: [],
    lastSentCampaignName: "",
    lastSentAt: 0,
    scheduledSlots: [],
  };

  private cycleTimer: NodeJS.Timeout | null = null;
  private slotTimers: NodeJS.Timeout[] = []; // timers para cada slot de msg
  private isSending: boolean = false;
  private isSyncing: boolean = false;

  // ========== CONSTANTES ==========
  private readonly CYCLE_DURATION_MS = 60 * 60 * 1000; // 60 minutos
  private readonly MIN_GAP_MS = 3 * 60 * 1000; // mínimo 3 min entre msgs (segurança)
  private readonly MARGIN_MS = 2 * 60 * 1000; // margem de 2 min no início e fim do ciclo
  private readonly MAX_CYCLES_PER_DAY = 24; // 24 ciclos = 1 dia completo
  // ====================================

  // Rastrear última variação usada por campanha
  private lastVariationIndex: Map<number, number> = new Map();

  // ========== PERSISTÊNCIA NO BANCO ==========

  /**
   * Salva estado atual no banco (chamado a cada mudança importante)
   */
  async saveStateToDB() {
    try {
      const db = await getDb();
      if (!db) return;

      const status = this.state.isRunning ? 'running' : 'stopped';
      const stateJson = {
        totalSent: this.state.totalSent,
        totalFailed: this.state.totalFailed,
        totalBlocked: this.state.totalBlocked,
        totalPairs: this.state.totalPairs,
        currentCampaignNames: this.state.currentCampaignNames,
        maxMessagesThisCycle: this.state.maxMessagesThisCycle,
        scheduledSlots: this.state.scheduledSlots,
        lastSentCampaignName: this.state.lastSentCampaignName,
        lastSentAt: this.state.lastSentAt,
      };

      const dataToSave = {
        status: status as 'stopped' | 'running' | 'paused',
        currentPairIndex: this.state.currentPairIndex,
        cycleNumber: this.state.cycleNumber,
        messagesThisCycle: this.state.messagesThisCycle,
        startedAt: this.state.startedAt ? new Date(this.state.startedAt) : null,
        cycleStartedAt: this.state.cycleStartTime ? new Date(this.state.cycleStartTime) : null,
        stateJson,
      };

      // Upsert: tentar update primeiro, se não existir, inserir
      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      if (rows.length === 0) {
        await db.insert(schedulerStateTable).values({ id: 1, ...dataToSave });
        console.log(`💾 Estado CRIADO no banco: ${status} | Ciclo ${this.state.cycleNumber + 1} | Par ${this.state.currentPairIndex + 1}`);
      } else {
        await db.update(schedulerStateTable).set(dataToSave).where(eq(schedulerStateTable.id, 1));
        console.log(`💾 Estado salvo no banco: ${status} | Ciclo ${this.state.cycleNumber + 1} | Par ${this.state.currentPairIndex + 1}`);
      }
    } catch (error) {
      console.error('❌ Erro ao salvar estado:', error);
    }
  }

  /**
   * Restaura estado do banco e retoma se estava rodando
   * Chamado automaticamente no boot do servidor
   */
  async restoreAndResume() {
    try {
      const db = await getDb();
      if (!db) return;

      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      const saved = rows[0];

      if (!saved) {
        console.log('📋 Nenhum estado salvo encontrado - scheduler parado');
        return;
      }

      if (saved.status !== 'running') {
        console.log(`📋 Estado salvo: ${saved.status} - scheduler permanece parado`);
        return;
      }

      // Estava rodando! Restaurar e retomar
      console.log('🔄 AUTO-RESTART: Scheduler estava rodando antes do deploy!');
      console.log(`📋 Restaurando: Ciclo ${saved.cycleNumber + 1} | Par ${saved.currentPairIndex + 1}`);

      const stateJson = (saved.stateJson || {}) as Record<string, any>;

      // Restaurar contadores acumulados
      this.state.totalSent = stateJson.totalSent || 0;
      this.state.totalFailed = stateJson.totalFailed || 0;
      this.state.totalBlocked = stateJson.totalBlocked || 0;
      this.state.totalPairs = stateJson.totalPairs || 0;
      this.state.currentCampaignNames = stateJson.currentCampaignNames || [];

      // Iniciar um NOVO ciclo (não tentar retomar o ciclo antigo, pois os timers se perderam)
      // Mas manter o cycleNumber e pairIndex para continuar de onde parou
      this.state.cycleNumber = saved.cycleNumber;
      this.state.currentPairIndex = saved.currentPairIndex;

      // Iniciar como se fosse um novo start, mas preservando contadores
      const preservedSent = this.state.totalSent;
      const preservedFailed = this.state.totalFailed;
      const preservedBlocked = this.state.totalBlocked;
      const preservedCycle = this.state.cycleNumber;

      await this.syncCampaignsWithProperties();

      const now = Date.now();
      this.state.isRunning = true;
      this.state.cycleStartTime = now;
      this.state.startedAt = saved.startedAt ? saved.startedAt.getTime() : now;
      this.state.messagesThisCycle = 0;
      this.state.maxMessagesThisCycle = 0;
      this.state.lastMessageSentAt = 0;
      this.state.scheduledSlots = [];
      this.state.lastSentCampaignName = '';
      this.state.lastSentAt = 0;

      // Restaurar contadores preservados
      this.state.totalSent = preservedSent;
      this.state.totalFailed = preservedFailed;
      this.state.totalBlocked = preservedBlocked;
      this.state.cycleNumber = preservedCycle;

      this.lastVariationIndex.clear();

      console.log('✅ AUTO-RESTART completo! Iniciando novo ciclo...');
      console.log(`📊 Contadores restaurados: ${preservedSent} enviadas, ${preservedFailed} falhas`);

      await this.executeCycle();
      this.scheduleNextCycle();
      await this.saveStateToDB();
    } catch (error) {
      console.error('❌ Erro ao restaurar estado:', error);
    }
  }

  // ========== FIM PERSISTÊNCIA ==========

  /**
   * Inicia o scheduler
   */
  async start() {
    if (this.state.isRunning) {
      console.log("⚠️ Scheduler já está rodando - parando antes de reiniciar");
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("🚀 Iniciando sistema dinâmico de campanhas v4.0...");
    console.log("📏 msgs/hora CONFIGURÁVEL por campanha");

    await this.syncCampaignsWithProperties();

    const now = Date.now();
    this.state.isRunning = true;
    this.state.cycleStartTime = now;
    this.state.startedAt = now;
    this.state.cycleNumber = 0;
    this.state.messagesThisCycle = 0;
    this.state.maxMessagesThisCycle = 0;
    this.state.lastMessageSentAt = 0;
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;
    this.state.lastSentCampaignName = "";
    this.state.lastSentAt = 0;
    this.state.scheduledSlots = [];
    this.lastVariationIndex.clear();

    console.log("✅ Scheduler v4.0 iniciado - Ciclo 1 começa AGORA");

    await this.executeCycle();
    this.scheduleNextCycle();
    await this.saveStateToDB();
  }

  /**
   * Para o scheduler completamente
   */
  stop() {
    console.log("⏹️ Parando scheduler...");

    this.state.isRunning = false;
    this.isSending = false;
    this.isSyncing = false;

    // Cancelar TODOS os timers de slots
    for (const timer of this.slotTimers) {
      clearTimeout(timer);
    }
    this.slotTimers = [];

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }

    this.state.messagesThisCycle = 0;
    this.state.maxMessagesThisCycle = 0;
    this.state.lastMessageSentAt = 0;
    this.state.cycleNumber = 0;
    this.state.scheduledSlots = [];
    this.lastVariationIndex.clear();

    console.log("⏹️ Scheduler COMPLETAMENTE parado");
    this.saveStateToDB().catch(e => console.error('Erro ao salvar estado no stop:', e));
  }

  /**
   * SINCRONIZAÇÃO: Campanhas = Imóveis ativos
   */
  async syncCampaignsWithProperties() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const db = await getDb();
      if (!db) { this.isSyncing = false; return; }

      const activeProperties = await db.select().from(properties).where(eq(properties.status, "available"));
      const existingCampaigns = await db.select().from(campaigns);

      // Criar campanhas para imóveis novos
      const existingPropertyIds = existingCampaigns.map(c => c.propertyId);
      const newProperties = activeProperties.filter(p => !existingPropertyIds.includes(p.id));

      for (const prop of newProperties) {
        console.log(`➕ Criando campanha: ${prop.denomination}`);
        const variations = this.generateMessageVariations(prop);

        const result = await db.insert(campaigns).values({
          propertyId: prop.id,
          name: prop.denomination,
          messageVariations: variations,
          totalContacts: 24, // messagesPerHour(2) × 12 = 24
          sentCount: 0,
          failedCount: 0,
          messagesPerHour: 2, // padrão 2 msgs/hora
          status: "running",
          startDate: new Date(),
        });

        const campaignId = Number(result[0].insertId);
        await this.assignContactsToCampaign(campaignId);
      }

      // Pausar/reativar campanhas conforme imóveis
      const activePropertyIds = activeProperties.map(p => p.id);
      for (const campaign of existingCampaigns) {
        if (!activePropertyIds.includes(campaign.propertyId)) {
          await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, campaign.id));
        } else if (campaign.status === "paused") {
          await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, campaign.id));
        }
      }

      const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));
      this.state.totalPairs = Math.ceil(runningCampaigns.length / 2);
      console.log(`✅ ${runningCampaigns.length} campanhas ativas, ${this.state.totalPairs} pares`);
    } catch (error) {
      console.error("❌ Erro na sincronização:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Gera variações de mensagem com copywriting profissional
   */
  private generateMessageVariations(prop: any): string[] {
    const priceFormatted = Number(prop.price).toLocaleString("pt-BR");
    const slug = prop.publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const siteUrl = `https://romatecwa-2uygcczr.manus.space/imovel/${slug}`;

    return [
      `🏠 {{NOME}}, *${prop.denomination}* - Restam poucas unidades!\n\nValor: *R$ ${priceFormatted}*\nLocal: ${prop.address}\n\n📸 Veja fotos, planta e localização:\n${siteUrl}\n\n⚡ Condições especiais para os primeiros interessados. Posso te passar mais detalhes?`,
      `{{NOME}}, você já conhece o *${prop.denomination}*? 🔑\n\nUm dos imóveis mais procurados da região de ${prop.address}.\n\n💰 A partir de *R$ ${priceFormatted}*\n\n👉 Confira tudo aqui: ${siteUrl}\n\nPosso reservar uma visita exclusiva pra você?`,
      `📊 {{NOME}}, o *${prop.denomination}* já recebeu mais de 50 consultas este mês!\n\nMotivo? Localização privilegiada em ${prop.address} + preço competitivo.\n\n🏷️ *R$ ${priceFormatted}*\n\n🔗 Veja todos os detalhes: ${siteUrl}\n\nNão perca essa oportunidade. Me chama!`,
      `💡 {{NOME}}, sabia que imóveis nessa região valorizaram mais de 30% nos últimos anos?\n\n*${prop.denomination}* - ${prop.address}\nValor atual: *R$ ${priceFormatted}*\n\n📲 Fotos e detalhes completos: ${siteUrl}\n\nQuero te mostrar por que esse é o melhor momento pra investir. Posso te ligar?`,
      `🔥 {{NOME}}, *OPORTUNIDADE REAL*\n\n*${prop.denomination}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\n✅ Financiamento facilitado\n✅ Documentação em dia\n✅ Pronto pra morar/construir\n\n👉 Veja agora: ${siteUrl}\n\nResponde "SIM" que te envio todas as condições!`,
      `⏰ {{NOME}}, última chance!\n\n*${prop.denomination}* em ${prop.address} está com condições especiais que vencem em breve.\n\n🏷️ *R$ ${priceFormatted}* (parcelas que cabem no bolso)\n\n📸 Veja fotos e planta: ${siteUrl}\n\nJá temos interessados. Garanta o seu antes que acabe!`,
      `🏡 {{NOME}}, imagine sua família no lugar perfeito...\n\n*${prop.denomination}* - ${prop.address}\nValor: *R$ ${priceFormatted}*\n\nLocalização estratégica, segurança e qualidade de vida.\n\n🔗 Conheça cada detalhe: ${siteUrl}\n\nVamos conversar sobre como realizar esse sonho?`,
      `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${prop.denomination}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\nPoucos sabem dessa oportunidade. Estou compartilhando com um grupo seleto de clientes.\n\n📲 Detalhes completos: ${siteUrl}\n\nTem interesse? Me responde que te explico tudo!`,
      `✨ {{NOME}}, procurando imóvel com ótimo custo-benefício?\n\n*${prop.denomination}* em ${prop.address}\n\n🏷️ *R$ ${priceFormatted}*\n📋 Documentação 100% regularizada\n🏦 Aceita financiamento\n\n👉 Veja fotos e localização: ${siteUrl}\n\nPosso simular as parcelas pra você. É só me chamar!`,
      `🤔 {{NOME}}, você está buscando imóvel na região de ${prop.address}?\n\nTenho uma opção que pode ser exatamente o que procura:\n\n*${prop.denomination}* - *R$ ${priceFormatted}*\n\n📸 Veja tudo aqui: ${siteUrl}\n\nMe conta o que você precisa que te ajudo a encontrar o imóvel ideal!`,
      `📌 {{NOME}}, comparou preços na região?\n\n*${prop.denomination}* está abaixo da média do mercado:\n💰 *R$ ${priceFormatted}*\n📍 ${prop.address}\n\nE o melhor: condições facilitadas de pagamento.\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,
      `🚨 {{NOME}}, *ATENÇÃO*\n\n*${prop.denomination}* - ${prop.address}\n\nEste imóvel está gerando muito interesse e pode sair do mercado a qualquer momento.\n\n🏷️ *R$ ${priceFormatted}*\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta sua visita. Me chama agora!`,
    ];
  }

  /**
   * Atribui 12 contatos aleatórios (não bloqueados) a uma campanha
   */
  private async assignContactsToCampaign(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
    const unblockedContacts = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);

    // totalContacts = messagesPerHour × 12
    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    const mph = campaign[0]?.messagesPerHour || 2;
    const neededContacts = mph * 12;

    if (unblockedContacts.length < neededContacts) {
      console.warn(`⚠️ Apenas ${unblockedContacts.length} contatos desbloqueados disponíveis (precisa de ${neededContacts})`);
    }

    const shuffled = [...unblockedContacts].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, neededContacts);

    for (const contact of selected) {
      await db.insert(campaignContacts).values({
        campaignId,
        contactId: contact.id,
        messagesSent: 0,
        status: "pending",
      });
    }

    console.log(`📱 ${selected.length} contatos designados para campanha ${campaignId}`);
  }

  /**
   * ========== GERAÇÃO DE SLOTS ALEATÓRIOS ==========
   * Distribui N mensagens em slots aleatórios dentro de 60 min
   * com mínimo de MIN_GAP_MS entre cada slot
   */
  private generateSlots(camp1: any, camp2: any | null, pendingCamp1: number = 999, pendingCamp2: number = 999): MessageSlot[] {
    // Limitar msgs/hora pelo número de contatos PENDENTES (proteção anti-duplicação)
    const rawMph1 = Math.max(1, Math.min(10, camp1.messagesPerHour || 2));
    const rawMph2 = camp2 ? Math.max(1, Math.min(10, camp2.messagesPerHour || 2)) : 0;
    const mph1 = Math.min(rawMph1, pendingCamp1);
    const mph2 = camp2 ? Math.min(rawMph2, pendingCamp2) : 0;
    const totalMsgs = mph1 + mph2;

    if (mph1 < rawMph1) console.log(`⚠️ ${camp1.name}: msgs/hora limitado de ${rawMph1} → ${mph1} (apenas ${pendingCamp1} contatos pendentes)`);
    if (camp2 && mph2 < rawMph2) console.log(`⚠️ ${camp2.name}: msgs/hora limitado de ${rawMph2} → ${mph2} (apenas ${pendingCamp2} contatos pendentes)`);

    if (totalMsgs === 0) {
      console.log(`⏭️ Nenhum contato pendente neste par, pulando ciclo`);
      return [];
    }

    // Criar lista de msgs: camp1 primeiro, depois camp2
    const msgList: { campaignId: number; campaignName: string }[] = [];
    for (let i = 0; i < mph1; i++) {
      msgList.push({ campaignId: camp1.id, campaignName: camp1.name });
    }
    if (camp2) {
      for (let i = 0; i < mph2; i++) {
        msgList.push({ campaignId: camp2.id, campaignName: camp2.name });
      }
    }

    // Embaralhar a lista para alternar campanhas aleatoriamente
    const shuffled = [...msgList].sort(() => Math.random() - 0.5);

    // Gerar slots de tempo aleatórios com mínimo de MIN_GAP_MS entre eles
    const availableWindow = this.CYCLE_DURATION_MS - (2 * this.MARGIN_MS);
    const minGapBetween = this.MIN_GAP_MS;

    // Calcular espaço necessário
    const totalGapNeeded = (totalMsgs - 1) * minGapBetween;

    if (totalGapNeeded > availableWindow) {
      // Se não cabe com gap de 3 min, reduzir gap proporcionalmente
      const adjustedGap = Math.floor(availableWindow / totalMsgs);
      console.warn(`⚠️ Gap reduzido para ${Math.round(adjustedGap / 60000)} min (${totalMsgs} msgs em 60 min)`);

      return shuffled.map((msg, idx) => ({
        ...msg,
        delayMs: this.MARGIN_MS + (idx * adjustedGap),
        minuteLabel: Math.round((this.MARGIN_MS + (idx * adjustedGap)) / 60000),
      }));
    }

    // Gerar slots aleatórios com gap mínimo
    const slots: number[] = [];
    for (let i = 0; i < totalMsgs; i++) {
      let attempts = 0;
      let slot: number;

      do {
        slot = this.MARGIN_MS + Math.floor(Math.random() * availableWindow);
        attempts++;
      } while (
        attempts < 100 &&
        slots.some(s => Math.abs(s - slot) < minGapBetween)
      );

      // Fallback: distribuir uniformemente se não conseguir aleatório
      if (attempts >= 100) {
        slot = this.MARGIN_MS + Math.floor((availableWindow / (totalMsgs + 1)) * (i + 1));
      }

      slots.push(slot);
    }

    // Ordenar slots cronologicamente
    slots.sort((a, b) => a - b);

    return shuffled.map((msg, idx) => ({
      ...msg,
      delayMs: slots[idx],
      minuteLabel: Math.round(slots[idx] / 60000),
    }));
  }

  /**
   * Executa um ciclo: distribui msgs do par ativo em slots aleatórios
   */
  private async executeCycle() {
    if (!this.state.isRunning) return;

    console.log(`\n⏰ === CICLO ${this.state.cycleNumber + 1} ===`);

    await this.syncCampaignsWithProperties();

    const db = await getDb();
    if (!db) return;

    const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

    if (runningCampaigns.length < 1) {
      console.error("❌ Nenhuma campanha ativa. Aguardando...");
      return;
    }

    // Calcular pares
    const completePairs = Math.floor(runningCampaigns.length / 2);
    const hasOddCampaign = runningCampaigns.length % 2 !== 0;
    const totalPairs = hasOddCampaign ? completePairs + 1 : completePairs;
    this.state.totalPairs = totalPairs;
    this.state.currentPairIndex = totalPairs > 0 ? this.state.cycleNumber % totalPairs : 0;

    let camp1: any;
    let camp2: any | null = null;

    if (runningCampaigns.length === 1) {
      camp1 = runningCampaigns[0];
      camp2 = null;
    } else if (this.state.currentPairIndex < completePairs) {
      const pairStart = this.state.currentPairIndex * 2;
      camp1 = runningCampaigns[pairStart];
      camp2 = runningCampaigns[pairStart + 1];
    } else {
      // Par extra para campanha ímpar
      camp1 = runningCampaigns[runningCampaigns.length - 1];
      camp2 = runningCampaigns[0];
      console.log(`🔄 Par extra (campanha ímpar): ${camp1.name} + ${camp2.name}`);
    }

    this.state.currentCampaignNames = camp2 ? [camp1.name, camp2.name] : [camp1.name];

    // Contar contatos PENDENTES de cada campanha (proteção anti-duplicação)
    const pendingCamp1 = await this.countPendingContacts(camp1.id);
    const pendingCamp2 = camp2 ? await this.countPendingContacts(camp2.id) : 0;
    console.log(`📊 Contatos pendentes: ${camp1.name}=${pendingCamp1}, ${camp2 ? `${camp2.name}=${pendingCamp2}` : 'solo'}`);

    // Gerar slots aleatórios LIMITADOS pelos contatos pendentes
    const slots = this.generateSlots(camp1, camp2, pendingCamp1, pendingCamp2);
    const totalMsgsThisCycle = slots.length;
    this.state.maxMessagesThisCycle = totalMsgsThisCycle;
    this.state.messagesThisCycle = 0;

    // Salvar slots para a UI
    this.state.scheduledSlots = slots.map(s => ({
      campaignName: s.campaignName,
      minuteLabel: s.minuteLabel,
      sent: false,
    }));

    const mph1 = camp1.messagesPerHour || 2;
    const mph2 = camp2 ? (camp2.messagesPerHour || 2) : 0;

    console.log(`📤 Par ${this.state.currentPairIndex + 1}/${totalPairs}: ${camp1.name} (${mph1} msgs/h) + ${camp2 ? `${camp2.name} (${mph2} msgs/h)` : 'solo'}`);
    console.log(`📊 Total: ${totalMsgsThisCycle} msgs neste ciclo`);
    console.log(`🕐 Slots: ${slots.map(s => `${s.campaignName}@${s.minuteLabel}min`).join(' → ')}`);

    // Cancelar timers de slots anteriores
    for (const timer of this.slotTimers) {
      clearTimeout(timer);
    }
    this.slotTimers = [];

    // Agendar cada slot
    const currentCycleNumber = this.state.cycleNumber;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotIndex = i;

      const timer = setTimeout(async () => {
        // Verificar se ainda estamos no mesmo ciclo e rodando
        if (!this.state.isRunning) {
          console.log(`🛑 Slot ${slotIndex + 1} cancelado: scheduler parado`);
          return;
        }
        if (this.state.cycleNumber !== currentCycleNumber) {
          console.log(`🛑 Slot ${slotIndex + 1} cancelado: ciclo mudou`);
          return;
        }

        // Buscar campanha atualizada do DB
        const campResult = await db.select().from(campaigns).where(eq(campaigns.id, slot.campaignId)).limit(1);
        const campaign = campResult[0];
        if (!campaign) {
          console.log(`⚠️ Campanha ${slot.campaignId} não encontrada`);
          return;
        }

        console.log(`\n📨 Slot ${slotIndex + 1}/${totalMsgsThisCycle}: ${slot.campaignName} (minuto ~${slot.minuteLabel})`);
        await this.sendMessageForCampaign(campaign);

        // Marcar slot como enviado
        if (this.state.scheduledSlots[slotIndex]) {
          this.state.scheduledSlots[slotIndex].sent = true;
        }
      }, slot.delayMs);

      this.slotTimers.push(timer);
    }
  }

  /**
   * Personaliza mensagem com dados do contato
   */
  private personalizeMessage(messageText: string, contact: { name: string; phone: string }): string {
    const firstName = (contact.name || '').split(' ')[0].trim();
    
    let personalized = messageText;
    if (firstName && firstName.length > 1) {
      personalized = personalized.replace(/{{NOME}}/g, firstName);
    } else {
      personalized = personalized.replace(/{{NOME}},?\s*/g, '');
    }
    
    return personalized;
  }

  /**
   * Envia 1 mensagem para 1 contato (com LOCK)
   */
  private async sendMessageForCampaign(campaign: any) {
    if (this.isSending) {
      console.log(`🚫 LOCK: envio já em andamento, aguardando...`);
      // Esperar até 30s pelo lock liberar
      let waitCount = 0;
      while (this.isSending && waitCount < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        waitCount++;
      }
      if (this.isSending) {
        console.log(`🚫 LOCK: timeout após 30s, ignorando`);
        return;
      }
    }

    this.isSending = true;

    try {
      const db = await getDb();
      if (!db) { this.isSending = false; return; }

      const contact = await this.getNextContact(campaign.id);
      if (!contact) {
        console.warn(`⚠️ Nenhum contato disponível para ${campaign.name}`);
        this.state.totalBlocked++;
        await this.resetCampaignContacts(campaign.id);
        this.isSending = false;
        return;
      }

      const rawMessage = await this.getMessageVariation(campaign.id);
      if (!rawMessage) {
        console.error(`❌ Sem variações de mensagem para ${campaign.name}`);
        this.state.totalFailed++;
        this.isSending = false;
        return;
      }

      const messageText = this.personalizeMessage(rawMessage, contact);

      const sendResult = await this.sendViaZAPI(contact.phone, messageText);

      // Número inválido: pular sem contar como falha
      if (sendResult === 'invalid') {
        await db.update(campaignContacts)
          .set({ status: "failed" })
          .where(and(
            eq(campaignContacts.campaignId, campaign.id),
            eq(campaignContacts.contactId, contact.id)
          ));
        console.log(`⚠️ Número inválido ${contact.phone} - pulado (não conta como falha de envio)`);
        this.isSending = false;
        return;
      }

      if (sendResult === 'sent') {
        await db.insert(messages).values({
          campaignId: campaign.id,
          contactId: contact.id,
          propertyId: campaign.propertyId,
          messageText,
          status: "sent",
          sentAt: new Date(),
        });

        await db.update(campaignContacts)
          .set({ status: "sent", messagesSent: 1, lastMessageSent: new Date() })
          .where(and(
            eq(campaignContacts.campaignId, campaign.id),
            eq(campaignContacts.contactId, contact.id)
          ));

        await db.update(campaigns)
          .set({ sentCount: (campaign.sentCount || 0) + 1 })
          .where(eq(campaigns.id, campaign.id));

        // Bloquear contato por 72h
        await db.update(contacts)
          .set({ blockedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) })
          .where(eq(contacts.id, contact.id));

        await this.updateContactHistory(contact.id, campaign.id);

        this.state.messagesThisCycle++;
        this.state.lastMessageSentAt = Date.now();
        this.state.totalSent++;
        this.state.lastSentCampaignName = campaign.name;
        this.state.lastSentAt = Date.now();

        console.log(`✅ [${this.state.messagesThisCycle}/${this.state.maxMessagesThisCycle}] Enviado para ${contact.phone} (${contact.name}) - ${campaign.name}`);
        this.saveStateToDB().catch(e => console.error('Erro ao salvar estado após envio:', e));
      } else {
        await db.update(campaignContacts)
          .set({ status: "failed" })
          .where(and(
            eq(campaignContacts.campaignId, campaign.id),
            eq(campaignContacts.contactId, contact.id)
          ));

        await db.update(campaigns)
          .set({ failedCount: (campaign.failedCount || 0) + 1 })
          .where(eq(campaigns.id, campaign.id));

        this.state.messagesThisCycle++;
        this.state.totalFailed++;
        console.error(`❌ Falha ao enviar para ${contact.phone} (erro de rede/API)`);
        this.saveStateToDB().catch(e => console.error('Erro ao salvar estado após falha:', e));
      }
    } catch (error) {
      console.error("❌ Erro no envio:", error);
      this.state.totalFailed++;
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Conta contatos pendentes de uma campanha (para limitar msgs/hora)
   */
  private async countPendingContacts(campaignId: number): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;

      const ccList = await db.select().from(campaignContacts)
        .where(and(
          eq(campaignContacts.campaignId, campaignId),
          eq(campaignContacts.status, "pending")
        ));

      // Filtrar contatos não bloqueados
      const now = new Date();
      let count = 0;
      for (const cc of ccList) {
        const result = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
        const contact = result[0];
        if (contact && (!contact.blockedUntil || contact.blockedUntil <= now)) {
          count++;
        }
      }
      return count;
    } catch (error) {
      console.error("Erro ao contar pendentes:", error);
      return 0;
    }
  }

  /**
   * Obtém próximo contato disponível
   */
  private async getNextContact(campaignId: number) {
    const db = await getDb();
    if (!db) return null;

    const ccList = await db.select().from(campaignContacts)
      .where(and(
        eq(campaignContacts.campaignId, campaignId),
        eq(campaignContacts.status, "pending")
      ));

    const now = new Date();
    const shuffled = [...ccList].sort(() => Math.random() - 0.5);

    for (const cc of shuffled) {
      const result = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
      const contact = result[0];
      if (!contact) continue;
      if (contact.blockedUntil && contact.blockedUntil > now) continue;
      return contact;
    }

    return null;
  }

  /**
   * Reset contatos de uma campanha
   */
  private async resetCampaignContacts(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    console.log(`🔄 Resetando contatos da campanha ${campaignId}...`);
    await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
    await this.assignContactsToCampaign(campaignId);
    console.log(`✅ Contatos resetados`);
  }

  /**
   * Obtém variação de mensagem aleatória (sem repetição consecutiva)
   */
  private async getMessageVariation(campaignId: number): Promise<string | null> {
    const db = await getDb();
    if (!db) return null;

    const result = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    const campaign = result[0];

    if (!campaign?.messageVariations || (campaign.messageVariations as string[]).length === 0) {
      return null;
    }

    const variations = campaign.messageVariations as string[];
    const lastIndex = this.lastVariationIndex.get(campaignId) ?? -1;

    let newIndex: number;
    if (variations.length <= 1) {
      newIndex = 0;
    } else {
      do {
        newIndex = Math.floor(Math.random() * variations.length);
      } while (newIndex === lastIndex);
    }

    this.lastVariationIndex.set(campaignId, newIndex);
    return variations[newIndex];
  }

  /**
   * Envia mensagem via Z-API
   */
  private async sendViaZAPI(phone: string, message: string): Promise<'sent' | 'failed' | 'invalid'> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Validação estrita: celular BR = 13 dígitos, 5º dígito = 9
      if (formattedPhone.length !== 13 || formattedPhone[4] !== '9') {
        console.warn(`⚠️ Número inválido (${formattedPhone.length}d): ${phone} → pulando`);
        return 'invalid';
      }

      const { getCompanyConfig } = await import("../db");
      const config = await getCompanyConfig();

      if (config?.zApiInstanceId && config?.zApiToken) {
        const { sendMessageViaZAPI } = await import("../zapi-integration");
        const result = await sendMessageViaZAPI({
          instanceId: config.zApiInstanceId,
          token: config.zApiToken,
          clientToken: config.zApiClientToken || undefined,
          phone,
          message,
        });
        console.log(`📨 [Z-API] ${phone}: ${result.success ? "✅" : "❌"}`);
        return result.success ? 'sent' : 'failed';
      } else {
        console.log(`📨 [SIMULADO] ${phone}: "${message.substring(0, 50)}..."`);
        return 'sent';
      }
    } catch (error) {
      console.error("❌ Erro Z-API:", error);
      return 'failed';
    }
  }

  /**
   * Atualiza histórico
   */
  private async updateContactHistory(contactId: number, campaignId: number) {
    const db = await getDb();
    if (!db) return;

    const existing = await db.select().from(contactCampaignHistory)
      .where(and(
        eq(contactCampaignHistory.contactId, contactId),
        eq(contactCampaignHistory.campaignId, campaignId)
      )).limit(1);

    if (existing[0]) {
      await db.update(contactCampaignHistory)
        .set({ lastCampaignId: campaignId, sentAt: new Date() })
        .where(eq(contactCampaignHistory.id, existing[0].id));
    } else {
      await db.insert(contactCampaignHistory).values({
        contactId,
        campaignId,
        lastCampaignId: campaignId,
        sentAt: new Date(),
      });
    }
  }

  /**
   * Envia relatório do ciclo via WhatsApp para o dono
   */
  private async sendCycleReport() {
    try {
      const OWNER_PHONE = '5599991811246'; // José Romário
      const now = new Date();
      const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      const data = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const db = await getDb();
      if (!db) return;

      // Buscar stats de todas as campanhas
      const allCampaigns = await db.select().from(campaigns);
      let totalSent = 0;
      let totalFailed = 0;
      let totalPending = 0;
      let totalContacts = 0;
      const campStats: string[] = [];

      for (const camp of allCampaigns) {
        const ccList = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
        const sent = ccList.filter(c => c.status === 'sent').length;
        const pending = ccList.filter(c => c.status === 'pending').length;
        const failed = ccList.filter(c => c.status === 'failed').length;
        totalSent += sent;
        totalFailed += failed;
        totalPending += pending;
        totalContacts += ccList.length;

        campStats.push(`  • ${camp.name}: ${sent}/${ccList.length} enviadas | ${pending} pendentes | ${failed} falhas`);
      }

      const cycleNum = this.state.cycleNumber + 1;
      const parAtual = this.state.currentCampaignNames.join(' + ');
      const msgsNoCiclo = this.state.messagesThisCycle;
      const maxMsgs = this.state.maxMessagesThisCycle;
      const taxaSucesso = totalContacts > 0 ? ((totalSent / totalContacts) * 100).toFixed(1) : '0.0';

      // Calcular horário do próximo ciclo
      const nextCycleTime = new Date(Date.now() + 60000); // próximo ciclo começa em ~1 min
      const nextCycleHora = nextCycleTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

      const report = [
        `📊 *RELATÓRIO ROMATEC CRM*`,
        `📅 ${data} às ${hora}`,
        ``,
        `🔄 *Ciclo ${cycleNum} finalizado*`,
        `👥 Par: ${parAtual}`,
        `📨 Msgs neste ciclo: ${msgsNoCiclo}/${maxMsgs}`,
        ``,
        `📊 *Resumo Geral:*`,
        `  ✅ Enviadas: ${totalSent}/${totalContacts}`,
        `  ⏳ Pendentes: ${totalPending}`,
        `  ❌ Falhas: ${totalFailed}`,
        `  🎯 Taxa: ${taxaSucesso}%`,
        ``,
        `🏠 *Por Campanha:*`,
        ...campStats,
        ``,
        `⏭️ *Próximo ciclo:* ${nextCycleHora}`,
      ].join('\n');

      const sent = await this.sendViaZAPI(OWNER_PHONE, report);
      if (sent) {
        console.log(`📊 Relatório do ciclo ${cycleNum} enviado para ${OWNER_PHONE}`);
      } else {
        console.error(`❌ Falha ao enviar relatório do ciclo ${cycleNum} para ${OWNER_PHONE}`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar relatório:', error);
    }
  }

  /**
   * Agenda próximo ciclo em EXATAMENTE 60 minutos
   * Após 24 ciclos (1 dia), encerra e inicia novo dia automaticamente
   */
  private scheduleNextCycle() {
    if (!this.state.isRunning) return;

    const elapsed = Date.now() - this.state.cycleStartTime;
    const remaining = Math.max(0, this.CYCLE_DURATION_MS - elapsed);

    console.log(`⏳ Próximo ciclo em ${Math.round(remaining / 60000)} minutos (Ciclo ${this.state.cycleNumber + 1}/${this.MAX_CYCLES_PER_DAY})`);

    this.cycleTimer = setTimeout(async () => {
      if (!this.state.isRunning) return;

      // 📊 Enviar relatório do ciclo que acabou
      await this.sendCycleReport();

      // Cancelar timers de slots do ciclo anterior
      for (const timer of this.slotTimers) {
        clearTimeout(timer);
      }
      this.slotTimers = [];

      // Avançar para próximo ciclo
      this.state.cycleNumber++;

      // Verificar se completou 24 ciclos (1 dia)
      if (this.state.cycleNumber >= this.MAX_CYCLES_PER_DAY) {
        console.log(`\n🌟 === DIA COMPLETO! ${this.MAX_CYCLES_PER_DAY} ciclos finalizados ===`);
        console.log(`📊 Total do dia: ${this.state.totalSent} enviadas, ${this.state.totalFailed} falhas`);
        
        // Enviar relatório diário consolidado
        await this.sendDailyReport();

        // Resetar para novo dia
        this.state.cycleNumber = 0;
        this.state.totalSent = 0;
        this.state.totalFailed = 0;
        this.state.totalBlocked = 0;
        console.log(`🚀 Novo dia iniciado automaticamente!`);
      }

      this.state.cycleStartTime = Date.now();
      this.state.messagesThisCycle = 0;
      this.state.maxMessagesThisCycle = 0;
      this.state.lastMessageSentAt = 0;
      this.state.scheduledSlots = [];

      console.log(`\n🔄 === CICLO ${this.state.cycleNumber + 1}/${this.MAX_CYCLES_PER_DAY} ===`);

      await this.executeCycle();
      this.scheduleNextCycle();
      await this.saveStateToDB();
    }, remaining);
  }

  /**
   * Envia relatório diário consolidado (após 24 ciclos)
   */
  private async sendDailyReport() {
    try {
      const OWNER_PHONE = '5599991811246';
      const now = new Date();
      const data = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const db = await getDb();
      if (!db) return;

      const allCampaigns = await db.select().from(campaigns);
      let totalSent = 0;
      let totalFailed = 0;
      let totalPending = 0;
      const campStats: string[] = [];

      for (const camp of allCampaigns) {
        const ccList = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
        const sent = ccList.filter(c => c.status === 'sent').length;
        const pending = ccList.filter(c => c.status === 'pending').length;
        const failed = ccList.filter(c => c.status === 'failed').length;
        totalSent += sent;
        totalFailed += failed;
        totalPending += pending;
        campStats.push(`  • ${camp.name}: ${sent} enviadas | ${pending} pendentes | ${failed} falhas`);
      }

      const taxaSucesso = (totalSent + totalFailed) > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1) : '0.0';

      const report = [
        `🌟 *RELATÓRIO DIÁRIO ROMATEC CRM*`,
        `📅 ${data}`,
        ``,
        `✅ *24 ciclos completos (1 dia)*`,
        ``,
        `📊 *Resumo do Dia:*`,
        `  ✅ Enviadas: ${totalSent}`,
        `  ❌ Falhas: ${totalFailed}`,
        `  ⏳ Pendentes: ${totalPending}`,
        `  🎯 Taxa de Sucesso: ${taxaSucesso}%`,
        ``,
        `🏠 *Por Campanha:*`,
        ...campStats,
        ``,
        `🚀 *Novo dia iniciado automaticamente!*`,
      ].join('\n');

      await this.sendViaZAPI(OWNER_PHONE, report);
      console.log(`🌟 Relatório diário enviado!`);
    } catch (error) {
      console.error('❌ Erro ao enviar relatório diário:', error);
    }
  }

  /**
   * Retorna estado atual para a UI
   */
  getState() {
    const now = Date.now();
    
    const elapsedInCycle = now - this.state.cycleStartTime;
    const remainingInCycle = Math.max(0, this.CYCLE_DURATION_MS - elapsedInCycle);
    const secondsUntilNextCycle = Math.floor(remainingInCycle / 1000);

    const uptimeMs = now - this.state.startedAt;
    const uptimeHours = String(Math.floor(uptimeMs / 3600000)).padStart(2, '0');
    const uptimeMinutes = String(Math.floor((uptimeMs % 3600000) / 60000)).padStart(2, '0');
    const uptimeSeconds = String(Math.floor((uptimeMs % 60000) / 1000)).padStart(2, '0');

    const nextCycleTime = new Date(this.state.cycleStartTime + this.CYCLE_DURATION_MS);

    return {
      ...this.state,
      // Compatibilidade com a UI
      messagesThisHour: this.state.messagesThisCycle,
      maxMessagesPerHour: this.state.maxMessagesThisCycle,
      secondsUntilNextCycle,
      cycleDurationSeconds: Math.floor(this.CYCLE_DURATION_MS / 1000),
      maxCyclesPerDay: this.MAX_CYCLES_PER_DAY,
      cycleProgress: `${this.state.cycleNumber + 1}/${this.MAX_CYCLES_PER_DAY}`,
      uptimeMs,
      uptimeFormatted: `${uptimeHours}:${uptimeMinutes}:${uptimeSeconds}`,
      startedAtFormatted: new Date(this.state.startedAt).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' 
      }),
      nextCycleFormatted: nextCycleTime.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' 
      }),
      activePair: {
        index: this.state.currentPairIndex,
        campaigns: this.state.currentCampaignNames,
      },
    };
  }

  /**
   * Retorna estatísticas
   */
  getStats() {
    const uptimeMs = Date.now() - this.state.startedAt;
    const hours = Math.floor(uptimeMs / (60 * 60 * 1000));
    const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
    const total = this.state.totalSent + this.state.totalFailed;
    const successRate = total > 0 ? (this.state.totalSent / total) * 100 : 0;

    return {
      isRunning: this.state.isRunning,
      cycleNumber: this.state.cycleNumber,
      messagesThisHour: this.state.messagesThisCycle,
      maxMessagesPerHour: this.state.maxMessagesThisCycle,
      lastMessageSentAt: this.state.lastMessageSentAt,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: this.state.totalBlocked,
      currentPairIndex: this.state.currentPairIndex,
      totalPairs: this.state.totalPairs,
      currentCampaignNames: this.state.currentCampaignNames,
      scheduledSlots: this.state.scheduledSlots,
      uptime: `${hours}h ${minutes}m`,
      successRate: `${successRate.toFixed(2)}%`,
    };
  }
}

export const campaignScheduler = new CampaignScheduler();
