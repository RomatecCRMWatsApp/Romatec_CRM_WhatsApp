import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties } from "../../drizzle/schema";
import { eq, and, isNull, or, lte } from "drizzle-orm";

/**
 * SISTEMA DINÂMICO DE CAMPANHAS - VINCULADO A IMÓVEIS
 * 
 * REGRAS RÍGIDAS (NUNCA VIOLAR):
 * 1. MÁXIMO ABSOLUTO: 2 mensagens por ciclo de 60 minutos (1 de cada campanha do par)
 * 2. MÍNIMO 20 minutos entre mensagens (intervalo aleatório 20-40 min)
 * 3. Rotação de pares: Par 1 (ALACIDE + Mod_Vaz-01) → Par 2 (Mod_Vaz-02 + Mod_Vaz-03) → Par 1...
 * 4. 12 contatos por campanha
 * 5. Bloqueio de 72h por contato após envio
 * 6. Mensagens variadas para evitar detecção
 * 7. Ciclo de 60 min começa quando clica PLAY, não na hora cheia do relógio
 * 
 * CORREÇÕES v3.0 (06/04/2026):
 * - FIX CRÍTICO: Ciclo baseado no momento do Play (60 min exatos), não na hora cheia
 * - FIX CRÍTICO: messagesThisHour NUNCA é zerado pelo executeCycle(), só pelo timer de 60 min
 * - FIX CRÍTICO: executeCycle() verifica messagesThisHour ANTES de enviar, não zera
 * - FIX: camp1 e camp2 são explicitamente definidos pelo par (não depende de ordem do array)
 */

interface SchedulerState {
  isRunning: boolean;
  cycleNumber: number;
  messagesThisCycle: number; // renomeado de messagesThisHour para clareza
  lastMessageSentAt: number; // timestamp da última msg enviada
  cycleStartTime: number; // quando o ciclo atual começou
  startedAt: number; // quando o Play foi clicado
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  currentPairIndex: number;
  totalPairs: number;
  currentCampaignNames: string[];
  // Status de envio para a UI
  lastSentCampaignName: string; // nome da última campanha que enviou
  lastSentAt: number; // timestamp do último envio bem-sucedido
}

class CampaignScheduler {
  private state: SchedulerState = {
    isRunning: false,
    cycleNumber: 0,
    messagesThisCycle: 0,
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
  };

  private cycleTimer: NodeJS.Timeout | null = null; // timer para próximo ciclo (60 min)
  private messageTimer: NodeJS.Timeout | null = null; // timer para msg 2 do par
  private isSending: boolean = false; // LOCK: impede envio simultâneo
  private isSyncing: boolean = false; // LOCK de sincronização

  // ========== LIMITE RÍGIDO ==========
  private readonly MAX_MESSAGES_PER_CYCLE = 2; // 1 de cada campanha do par
  private readonly CYCLE_DURATION_MS = 60 * 60 * 1000; // 60 minutos exatos
  private readonly MIN_INTERVAL_MINUTES = 20; // mínimo 20 min entre msgs
  private readonly MAX_INTERVAL_MINUTES = 40; // máximo 40 min entre msgs
  // ====================================

  // Rastrear última variação usada por campanha (evitar repetição)
  private lastVariationIndex: Map<number, number> = new Map();

  /**
   * Inicia o scheduler - ciclo começa AGORA
   */
  async start() {
    // Se já está rodando, parar primeiro para evitar timers duplicados
    if (this.state.isRunning) {
      console.log("⚠️ Scheduler já está rodando - parando antes de reiniciar");
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("🚀 Iniciando sistema dinâmico de campanhas...");
    console.log(`📏 LIMITE RÍGIDO: ${this.MAX_MESSAGES_PER_CYCLE} msgs/ciclo de 60min, intervalo ${this.MIN_INTERVAL_MINUTES}-${this.MAX_INTERVAL_MINUTES} min`);

    await this.syncCampaignsWithProperties();

    const now = Date.now();
    this.state.isRunning = true;
    this.state.cycleStartTime = now;
    this.state.startedAt = now;
    this.state.cycleNumber = 0;
    this.state.messagesThisCycle = 0;
    this.state.lastMessageSentAt = 0;
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;
    this.state.lastSentCampaignName = "";
    this.state.lastSentAt = 0;
    this.lastVariationIndex.clear();

    console.log("✅ Scheduler iniciado - Ciclo 1 começa AGORA");

    // Executar primeiro ciclo imediatamente
    await this.executeCycle();

    // Agendar próximo ciclo em EXATAMENTE 60 minutos a partir de AGORA
    this.scheduleNextCycle();
  }

  /**
   * Para o scheduler completamente
   */
  stop() {
    console.log("⏹️ Parando scheduler...");

    // 1. Marcar como não rodando IMEDIATAMENTE
    this.state.isRunning = false;
    this.isSending = false;
    this.isSyncing = false;

    // 2. Cancelar TODOS os timers
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
      console.log("🛑 Timer da mensagem 2 cancelado");
    }

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
      console.log("🛑 Timer do próximo ciclo cancelado");
    }

    // 3. Resetar contadores
    this.state.messagesThisCycle = 0;
    this.state.lastMessageSentAt = 0;
    this.state.cycleNumber = 0;
    this.lastVariationIndex.clear();

    console.log("⏹️ Scheduler COMPLETAMENTE parado - todos os timers cancelados, estado resetado");
  }

  /**
   * SINCRONIZAÇÃO: Campanhas = Imóveis ativos
   */
  async syncCampaignsWithProperties() {
    if (this.isSyncing) {
      console.log("⚠️ Sincronização já em andamento, ignorando");
      return;
    }

    this.isSyncing = true;

    try {
      const db = await getDb();
      if (!db) { this.isSyncing = false; return; }

      console.log("🔄 Sincronizando campanhas com imóveis...");

      const activeProperties = await db.select().from(properties).where(eq(properties.status, "available"));
      console.log(`📊 ${activeProperties.length} imóveis ativos`);

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
          totalContacts: 12,
          sentCount: 0,
          failedCount: 0,
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

    // Filtrar contatos bloqueados
    const unblockedContacts = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);

    if (unblockedContacts.length < 12) {
      console.warn(`⚠️ Apenas ${unblockedContacts.length} contatos desbloqueados disponíveis (precisamos de 12)`);
    }

    // Embaralhar e pegar 12
    const shuffled = [...unblockedContacts].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 12);

    for (const contact of selected) {
      await db.insert(campaignContacts).values({
        campaignId,
        contactId: contact.id,
        messagesSent: 0,
        status: "pending",
      });
    }

    console.log(`📱 ${selected.length} contatos designados (aleatórios, ${unblockedContacts.length} desbloqueados disponíveis)`);
  }

  /**
   * ========== VERIFICAÇÃO RÍGIDA DE LIMITE ==========
   * Retorna true se pode enviar, false se NÃO pode
   */
  private canSendMessage(): boolean {
    // REGRA 1: Máximo 2 msgs por ciclo de 60 min
    if (this.state.messagesThisCycle >= this.MAX_MESSAGES_PER_CYCLE) {
      console.log(`🚫 BLOQUEADO: já enviou ${this.state.messagesThisCycle}/${this.MAX_MESSAGES_PER_CYCLE} msgs neste ciclo`);
      return false;
    }

    // REGRA 2: Mínimo 20 min desde última msg (só verifica se já enviou pelo menos 1)
    if (this.state.messagesThisCycle > 0 && this.state.lastMessageSentAt > 0) {
      const minutesSinceLastMsg = (Date.now() - this.state.lastMessageSentAt) / (60 * 1000);
      if (minutesSinceLastMsg < this.MIN_INTERVAL_MINUTES) {
        console.log(`🚫 BLOQUEADO: apenas ${minutesSinceLastMsg.toFixed(1)} min desde última msg (mínimo ${this.MIN_INTERVAL_MINUTES} min)`);
        return false;
      }
    }

    // REGRA 3: Lock de envio (impede corrida)
    if (this.isSending) {
      console.log(`🚫 BLOQUEADO: envio em andamento (lock ativo)`);
      return false;
    }

    return true;
  }

  /**
   * Executa um ciclo: EXATAMENTE 2 mensagens (1 de cada campanha do par)
   * 
   * IMPORTANTE: NÃO zera messagesThisCycle aqui!
   * O contador só é zerado pelo timer de 60 min no scheduleNextCycle()
   */
  private async executeCycle() {
    if (!this.state.isRunning) return;

    // VERIFICAÇÃO: Se já enviou 2 msgs neste ciclo, NÃO enviar mais
    if (this.state.messagesThisCycle >= this.MAX_MESSAGES_PER_CYCLE) {
      console.log(`🚫 Ciclo ${this.state.cycleNumber + 1}: já enviou ${this.state.messagesThisCycle} msgs, aguardando próximo ciclo`);
      return;
    }

    console.log(`\n⏰ === CICLO ${this.state.cycleNumber + 1} ===`);

    await this.syncCampaignsWithProperties();

    const db = await getDb();
    if (!db) return;

    const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

    if (runningCampaigns.length < 2) {
      console.error("❌ Menos de 2 campanhas ativas. Aguardando...");
      return;
    }

    // Calcular pares
    const completePairs = Math.floor(runningCampaigns.length / 2);
    const hasOddCampaign = runningCampaigns.length % 2 !== 0;
    const totalPairs = hasOddCampaign ? completePairs + 1 : completePairs;
    this.state.totalPairs = totalPairs;
    this.state.currentPairIndex = this.state.cycleNumber % totalPairs;

    let camp1: any;
    let camp2: any;

    if (this.state.currentPairIndex < completePairs) {
      // Par completo normal
      const pairStart = this.state.currentPairIndex * 2;
      camp1 = runningCampaigns[pairStart];
      camp2 = runningCampaigns[pairStart + 1];
    } else {
      // Par extra para campanha ímpar (última + primeira)
      camp1 = runningCampaigns[runningCampaigns.length - 1];
      camp2 = runningCampaigns[0];
      console.log(`🔄 Par extra (campanha ímpar): ${camp1.name} + ${camp2.name}`);
    }

    this.state.currentCampaignNames = [camp1.name, camp2.name];

    // Gerar intervalo aleatório entre 20-40 min para msg 2
    const intervalMinutes = this.generateRandomInterval();

    console.log(`📤 Par ${this.state.currentPairIndex + 1}/${totalPairs}: ${camp1.name} + ${camp2.name}`);
    console.log(`⏳ Intervalo entre msgs: ${intervalMinutes} minutos`);

    // ===== MENSAGEM 1: Enviar da campanha 1 do par =====
    if (this.canSendMessage()) {
      console.log(`\n📨 Mensagem 1/2: ${camp1.name}`);
      await this.sendMessageForCampaign(camp1);
    } else {
      console.log(`🚫 Mensagem 1/2 BLOQUEADA pelo limite`);
      return; // Se msg 1 bloqueada, não agendar msg 2
    }

    // ===== MENSAGEM 2: Agendar da campanha 2 do par com intervalo =====
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }

    const delayMs = intervalMinutes * 60 * 1000;
    console.log(`⏳ Mensagem 2/2 (${camp2.name}) agendada para daqui ${intervalMinutes} min`);

    // Salvar cycleNumber atual para validar no callback
    const scheduledCycleNumber = this.state.cycleNumber;

    this.messageTimer = setTimeout(async () => {
      // Verificar se ainda estamos no mesmo ciclo e rodando
      if (!this.state.isRunning) {
        console.log(`🛑 Mensagem 2/2 cancelada: scheduler parado`);
        return;
      }

      if (this.state.cycleNumber !== scheduledCycleNumber) {
        console.log(`🛑 Mensagem 2/2 cancelada: ciclo mudou (era ${scheduledCycleNumber + 1}, agora ${this.state.cycleNumber + 1})`);
        return;
      }

      // VERIFICAÇÃO RÍGIDA antes de enviar msg 2
      if (this.canSendMessage()) {
        console.log(`\n📨 Mensagem 2/2: ${camp2.name}`);
        await this.sendMessageForCampaign(camp2);
        console.log(`✅ Ciclo ${this.state.cycleNumber + 1} completo! ${this.state.messagesThisCycle}/${this.MAX_MESSAGES_PER_CYCLE} msgs enviadas.`);
      } else {
        console.log(`🚫 Mensagem 2/2 BLOQUEADA pelo limite`);
      }
    }, delayMs);
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
   * Envia 1 mensagem para 1 contato (com LOCK e verificação tripla)
   */
  private async sendMessageForCampaign(campaign: any) {
    // LOCK: impede envio simultâneo
    if (this.isSending) {
      console.log(`🚫 LOCK: envio já em andamento, ignorando`);
      return;
    }

    // VERIFICAÇÃO FINAL: NUNCA ultrapassar o limite
    if (this.state.messagesThisCycle >= this.MAX_MESSAGES_PER_CYCLE) {
      console.log(`🚫 LIMITE ATINGIDO: ${this.state.messagesThisCycle}/${this.MAX_MESSAGES_PER_CYCLE} - NÃO enviando`);
      return;
    }

    this.isSending = true; // ATIVAR LOCK

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

      // PERSONALIZAR mensagem com nome do contato
      const messageText = this.personalizeMessage(rawMessage, contact);

      // ENVIAR
      const success = await this.sendViaZAPI(contact.phone, messageText);

      if (success) {
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

        // ATUALIZAR CONTADORES (RÍGIDO)
        this.state.messagesThisCycle++;
        this.state.lastMessageSentAt = Date.now();
        this.state.totalSent++;
        this.state.lastSentCampaignName = campaign.name;
        this.state.lastSentAt = Date.now();

        console.log(`✅ [${this.state.messagesThisCycle}/${this.MAX_MESSAGES_PER_CYCLE}] Enviado para ${contact.phone} (${contact.name}) - Campanha: ${campaign.name}`);
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

        this.state.totalFailed++;
        console.error(`❌ Falha ao enviar para ${contact.phone}`);
      }
    } catch (error) {
      console.error("❌ Erro no envio:", error);
      this.state.totalFailed++;
    } finally {
      this.isSending = false; // LIBERAR LOCK
    }
  }

  /**
   * Obtém próximo contato disponível (não bloqueado, status pending)
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

    // Embaralhar para não seguir ordem fixa
    const shuffled = [...ccList].sort(() => Math.random() - 0.5);

    for (const cc of shuffled) {
      const result = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
      const contact = result[0];
      if (!contact) continue;

      if (contact.blockedUntil && contact.blockedUntil > now) {
        continue;
      }

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

    console.log(`🔄 Resetando contatos da campanha ${campaignId} (filtrando bloqueados)...`);
    await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
    await this.assignContactsToCampaign(campaignId);
    console.log(`✅ Contatos resetados (apenas desbloqueados)`);
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
  private async sendViaZAPI(phone: string, message: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      if (formattedPhone.length < 13) {
        console.warn(`⚠️ Telefone inválido (${formattedPhone.length} dígitos, mínimo 13 para celular BR): ${phone}`);
        if (formattedPhone.length < 12) {
          console.error(`❌ Telefone muito curto (${formattedPhone.length} dígitos): ${phone}`);
          return false;
        }
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
        return result.success;
      } else {
        console.log(`📨 [SIMULADO] ${phone}: "${message.substring(0, 50)}..."`);
        return true;
      }
    } catch (error) {
      console.error("❌ Erro Z-API:", error);
      return false;
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
   * Gera intervalo aleatório entre 20-40 minutos
   */
  private generateRandomInterval(): number {
    return Math.floor(Math.random() * (this.MAX_INTERVAL_MINUTES - this.MIN_INTERVAL_MINUTES + 1)) + this.MIN_INTERVAL_MINUTES;
  }

  /**
   * Agenda próximo ciclo em EXATAMENTE 60 minutos a partir do início do ciclo atual
   * NÃO baseado na hora cheia do relógio!
   */
  private scheduleNextCycle() {
    if (!this.state.isRunning) return;

    // Calcular tempo restante: 60 min desde o início do ciclo atual
    const elapsed = Date.now() - this.state.cycleStartTime;
    const remaining = Math.max(0, this.CYCLE_DURATION_MS - elapsed);

    console.log(`⏳ Próximo ciclo em ${Math.round(remaining / 60000)} minutos (${Math.round(remaining / 1000)}s)`);

    this.cycleTimer = setTimeout(async () => {
      if (!this.state.isRunning) return;

      // LIMPAR messageTimer do ciclo anterior
      if (this.messageTimer) {
        clearTimeout(this.messageTimer);
        this.messageTimer = null;
        console.log("🛑 Timer da mensagem 2 do ciclo anterior cancelado (novo ciclo iniciando)");
      }

      // Avançar para próximo ciclo
      this.state.cycleNumber++;
      this.state.cycleStartTime = Date.now(); // Novo ciclo começa AGORA
      this.state.messagesThisCycle = 0; // RESET contador - APENAS aqui, no timer de 60 min
      this.state.lastMessageSentAt = 0; // Reset para permitir msg 1 sem esperar 20 min

      console.log(`\n🔄 === NOVO CICLO ${this.state.cycleNumber + 1} - messagesThisCycle ZERADO ===`);

      await this.executeCycle();
      this.scheduleNextCycle(); // Agendar próximo ciclo em mais 60 min
    }, remaining);
  }

  /**
   * Retorna estado atual para a UI
   */
  getState() {
    const now = Date.now();
    
    // Calcular segundos restantes no ciclo atual (60 min desde cycleStartTime)
    const elapsedInCycle = now - this.state.cycleStartTime;
    const remainingInCycle = Math.max(0, this.CYCLE_DURATION_MS - elapsedInCycle);
    const secondsUntilNextCycle = Math.floor(remainingInCycle / 1000);

    // Calcular uptime formatado
    const uptimeMs = now - this.state.startedAt;
    const uptimeHours = String(Math.floor(uptimeMs / 3600000)).padStart(2, '0');
    const uptimeMinutes = String(Math.floor((uptimeMs % 3600000) / 60000)).padStart(2, '0');
    const uptimeSeconds = String(Math.floor((uptimeMs % 60000) / 1000)).padStart(2, '0');

    // Calcular horário previsto do próximo ciclo
    const nextCycleTime = new Date(this.state.cycleStartTime + this.CYCLE_DURATION_MS);

    return {
      ...this.state,
      // Compatibilidade com a UI (renomear messagesThisCycle para messagesThisHour)
      messagesThisHour: this.state.messagesThisCycle,
      secondsUntilNextCycle,
      cycleDurationSeconds: Math.floor(this.CYCLE_DURATION_MS / 1000),
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
      maxMessagesPerHour: this.MAX_MESSAGES_PER_CYCLE,
      lastMessageSentAt: this.state.lastMessageSentAt,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: this.state.totalBlocked,
      currentPairIndex: this.state.currentPairIndex,
      totalPairs: this.state.totalPairs,
      currentCampaignNames: this.state.currentCampaignNames,
      uptime: `${hours}h ${minutes}m`,
      successRate: `${successRate.toFixed(2)}%`,
    };
  }
}

export const campaignScheduler = new CampaignScheduler();
