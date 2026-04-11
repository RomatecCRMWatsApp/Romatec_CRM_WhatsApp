import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties, schedulerState as schedulerStateTable } from "../../drizzle/schema";
import { eq, and, isNull, or, lte, gte, sql } from "drizzle-orm";
import { registerBotMessage, getFollowUpsToSend, cleanupOldFollowUps } from "../bot-ai";

/**
   * SISTEMA RESTRITIVO DE CAMPANHAS v8.0 - CICLO 10H + FOLLOW-UP
 * 
 * REGRA PRINCIPAL: Cada campanha envia APENAS 1 mensagem por hora.
 * 
 * LÓGICA:
 * 1. Todas as campanhas ativas participam de cada hora
 * 2. Cada campanha envia EXATAMENTE 1 mensagem por hora → bloqueia até próxima hora
 * 3. Controle por hora atual (YYYY-MM-DD-HH) + flag sentThisHour
 * 4. Ciclo = 2 horas (1 ciclo por dia)
 * 5. Cada campanha = 2 contatos (1 msg/hora × 2 horas)
 * 6. Mensagens distribuídas em momentos aleatórios dentro da hora
 * 7. Mínimo 3 min entre envios (segurança anti-ban)
 * 8. Bloqueio de 72h por contato após envio
 * 9. Relatório enviado ao dono a cada hora e ao final do ciclo
 * 10. Estado salvo no banco para persistir entre reinícios
 */

interface CampaignHourState {
  campaignId: number;
  campaignName: string;
  sentThisHour: boolean;
  lastSentHourKey: string | null;
}

interface SchedulerState {
  isRunning: boolean;
  hourNumber: number; // 0-11 dentro do ciclo
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  startedAt: number;
  currentHourKey: string;
  campaignStates: CampaignHourState[];
  // UI
  lastSentCampaignName: string;
  lastSentAt: number;
  scheduledSlots: { campaignName: string; minuteLabel: number; sent: boolean }[];
}

class CampaignScheduler {
  private state: SchedulerState = {
    isRunning: false,
    hourNumber: 0,
    totalSent: 0,
    totalFailed: 0,
    totalBlocked: 0,
    startedAt: Date.now(),
    currentHourKey: '',
    campaignStates: [],
    lastSentCampaignName: '',
    lastSentAt: 0,
    scheduledSlots: [],
  };

  private checkTimer: NodeJS.Timeout | null = null;
  private slotTimers: NodeJS.Timeout[] = [];
  private isSending: boolean = false;
  private isSyncing: boolean = false;

  // Constantes
  private readonly MAX_HOURS_PER_CYCLE = 2; // 2 horas por ciclo
  private readonly CHECK_INTERVAL_MS = 60 * 1000; // verificar a cada 1 minuto
  private readonly MIN_GAP_MS = 3 * 60 * 1000; // mínimo 3 min entre msgs
  private readonly MARGIN_MS = 2 * 60 * 1000; // margem 2 min início/fim da hora
  private readonly HOUR_MS = 60 * 60 * 1000; // 1 hora em ms

  // Rastrear última variação usada por campanha
  private lastVariationIndex: Map<number, number> = new Map();

  // Timer do follow-up automático
  private followUpTimer: NodeJS.Timeout | null = null;

  // ========== CONTROLE DE HORA ==========

  /**
   * Gera chave única da hora atual: YYYY-MM-DD-HH
   */
  private getCurrentHourKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
  }

  /**
   * Reseta flags de todas as campanhas quando muda a hora
   */
  private resetCampaignsIfNewHour(): boolean {
    const currentHour = this.getCurrentHourKey();
    
    if (currentHour === this.state.currentHourKey) {
      return false; // mesma hora, nada a fazer
    }

    // Nova hora! Resetar flags
    console.log(`\n🕐 === NOVA HORA: ${currentHour} ===`);
    this.state.currentHourKey = currentHour;
    
    for (const cs of this.state.campaignStates) {
      if (cs.lastSentHourKey !== currentHour) {
        cs.sentThisHour = false;
      }
    }

    return true;
  }

  // ========== PERSISTÊNCIA NO BANCO ==========

  async saveStateToDB() {
    try {
      const db = await getDb();
      if (!db) return;

      const status = this.state.isRunning ? 'running' : 'stopped';
      const stateJson = {
        totalSent: this.state.totalSent,
        totalFailed: this.state.totalFailed,
        totalBlocked: this.state.totalBlocked,
        currentHourKey: this.state.currentHourKey,
        campaignStates: this.state.campaignStates,
        lastSentCampaignName: this.state.lastSentCampaignName,
        lastSentAt: this.state.lastSentAt,
        scheduledSlots: this.state.scheduledSlots,
      };

      const dataToSave = {
        status: status as 'stopped' | 'running' | 'paused',
        currentPairIndex: 0,
        cycleNumber: this.state.hourNumber,
        messagesThisCycle: this.state.campaignStates.filter(c => c.sentThisHour).length,
        startedAt: this.state.startedAt ? new Date(this.state.startedAt) : null,
        cycleStartedAt: new Date(),
        stateJson,
      };

      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      if (rows.length === 0) {
        await db.insert(schedulerStateTable).values({ id: 1, ...dataToSave });
        console.log(`💾 Estado CRIADO no banco: ${status} | Hora ${this.state.hourNumber + 1}/${this.MAX_HOURS_PER_CYCLE}`);
      } else {
        await db.update(schedulerStateTable).set(dataToSave).where(eq(schedulerStateTable.id, 1));
        console.log(`💾 Estado salvo: ${status} | Hora ${this.state.hourNumber + 1}/${this.MAX_HOURS_PER_CYCLE}`);
      }
    } catch (error) {
      console.error('❌ Erro ao salvar estado:', error);
    }
  }

  /**
   * Restaura estado do banco e retoma se estava rodando
   */
  async restoreAndResume() {
    try {
      const db = await getDb();
      if (!db) return;

      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      const saved = rows[0];

      if (!saved) {
        console.log('📋 Nenhum estado salvo - scheduler parado');
        return;
      }

      if (saved.status !== 'running') {
        console.log(`📋 Estado salvo: ${saved.status} - scheduler permanece parado`);
        return;
      }

      console.log('🔄 AUTO-RESTART: Scheduler estava rodando!');
      
      const stateJson = (saved.stateJson || {}) as Record<string, any>;

      // Restaurar contadores
      this.state.totalSent = stateJson.totalSent || 0;
      this.state.totalFailed = stateJson.totalFailed || 0;
      this.state.totalBlocked = stateJson.totalBlocked || 0;
      this.state.hourNumber = saved.cycleNumber || 0;
      this.state.campaignStates = stateJson.campaignStates || [];
      this.state.currentHourKey = stateJson.currentHourKey || '';

      // Iniciar
      this.state.isRunning = true;
      this.state.startedAt = saved.startedAt ? saved.startedAt.getTime() : Date.now();

      await this.syncCampaignsWithProperties();
      await this.initCampaignStates();

      console.log(`✅ AUTO-RESTART completo! Hora ${this.state.hourNumber + 1}/${this.MAX_HOURS_PER_CYCLE}`);
      console.log(`📊 Restaurado: ${this.state.totalSent} enviadas, ${this.state.totalFailed} falhas`);

      // Reagendar envios pendentes desta hora
      const pending = this.state.campaignStates.filter(cs => !cs.sentThisHour);
      if (pending.length > 0) {
        console.log(`📤 Reagendando ${pending.length} envios pendentes após restart`);
        await this.scheduleHourSends();
      } else {
        console.log(`✅ Todas as campanhas já enviaram nesta hora`);
      }

      this.startCheckLoop();
      this.startFollowUpLoop();
      await this.saveStateToDB();
    } catch (error) {
      console.error('❌ Erro ao restaurar estado:', error);
    }
  }

  // ========== CONTROLE PRINCIPAL ==========

  /**
   * Inicia o scheduler
   */
  async start() {
    if (this.state.isRunning) {
      console.log("⚠️ Scheduler já está rodando - parando antes de reiniciar");
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("🚀 Iniciando sistema RESTRITIVO v6.0...");
    console.log("📏 REGRA: 1 mensagem por campanha por hora | Ciclo 2h");

    await this.syncCampaignsWithProperties();

    this.state.isRunning = true;
    this.state.startedAt = Date.now();
    this.state.hourNumber = 0;
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;
    this.state.currentHourKey = '';
    this.state.lastSentCampaignName = '';
    this.state.lastSentAt = 0;
    this.state.scheduledSlots = [];
    this.lastVariationIndex.clear();

    // Inicializar estados das campanhas
    await this.initCampaignStates();

    console.log("✅ Scheduler v6.0 iniciado - Verificação a cada 1 minuto");

    // Executar imediatamente a primeira verificação
    await this.checkAndSend();
    
    // Iniciar loop de verificação
    this.startCheckLoop();
    this.startFollowUpLoop();
    
    await this.saveStateToDB();
  }

  /**
   * Para o scheduler
   */
  stop() {
    console.log("⏹️ Parando scheduler...");

    this.state.isRunning = false;
    this.isSending = false;
    this.isSyncing = false;

    for (const timer of this.slotTimers) {
      clearTimeout(timer);
    }
    this.slotTimers = [];

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.state.scheduledSlots = [];
    this.lastVariationIndex.clear();

    // Parar follow-up timer
    if (this.followUpTimer) {
      clearInterval(this.followUpTimer);
      this.followUpTimer = null;
    }

    console.log("⏹️ Scheduler COMPLETAMENTE parado");
    this.saveStateToDB().catch(e => console.error('Erro ao salvar estado no stop:', e));
  }

  /**
   * Loop principal: verifica a cada 1 minuto
   */
  private startCheckLoop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(async () => {
      if (!this.state.isRunning) return;
      await this.checkAndSend();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Verificação principal: reseta hora se necessário e agenda envios
   */
  private async checkAndSend() {
    if (!this.state.isRunning) return;

    const isNewHour = this.resetCampaignsIfNewHour();

    if (isNewHour) {
      // Nova hora! Incrementar contador
      this.state.hourNumber++;

      // Verificar se completou 10 horas (1 ciclo)
      if (this.state.hourNumber >= this.MAX_HOURS_PER_CYCLE) {
        console.log(`\n🌟 === CICLO DE ${this.MAX_HOURS_PER_CYCLE}H COMPLETO! ===`);
        console.log(`📊 Total: ${this.state.totalSent} enviadas, ${this.state.totalFailed} falhas`);
        
        await this.sendDailyReport();

        // Resetar para novo ciclo
        this.state.hourNumber = 0;
        this.state.totalSent = 0;
        this.state.totalFailed = 0;
        this.state.totalBlocked = 0;
        console.log(`🚀 Novo ciclo de ${this.MAX_HOURS_PER_CYCLE}h iniciado!`);
      }

      // Sincronizar campanhas
      await this.syncCampaignsWithProperties();
      await this.initCampaignStates();

      // Agendar envios para esta hora
      await this.scheduleHourSends();
      
      // Enviar relatório da hora anterior
      await this.sendCycleReport();
      
      await this.saveStateToDB();
    }

    // Se é a primeira execução (sem hourKey ainda), agendar
    if (!this.state.currentHourKey) {
      this.state.currentHourKey = this.getCurrentHourKey();
      await this.initCampaignStates();
      await this.scheduleHourSends();
      await this.saveStateToDB();
      return;
    }

    // Verificar se há campanhas pendentes sem timer agendado (sempre verificar)
    const pending = this.state.campaignStates.filter(cs => !cs.sentThisHour);
    const hasActiveTimers = this.slotTimers.length > 0;
    if (pending.length > 0 && !hasActiveTimers && this.state.currentHourKey) {
      console.log(`⚠️ ${pending.length} campanhas pendentes sem timer - reagendando`);
      await this.scheduleHourSends();
      await this.saveStateToDB();
    }
  }

  /**
   * Inicializa estados das campanhas ativas
   * CORREÇÃO v7: verifica mensagens REAIS no banco para evitar duplicatas após restart
   */
  private async initCampaignStates() {
    const db = await getDb();
    if (!db) return;

    const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));
    const currentHour = this.getCurrentHourKey();

    // Calcular início da hora atual para verificar no banco
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

    // Preservar estados existentes, adicionar novos
    const newStates: CampaignHourState[] = [];
    
    for (const camp of runningCampaigns) {
      const existing = this.state.campaignStates.find(cs => cs.campaignId === camp.id);
      
      // VERIFICAÇÃO NO BANCO: checar se já enviou nesta hora
      const sentInDb = await db.select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(
          eq(messages.campaignId, camp.id),
          eq(messages.status, 'sent'),
          gte(messages.sentAt, hourStart)
        ));
      const alreadySentInDb = (sentInDb[0]?.count || 0) > 0;

      if (existing) {
        const sentFromState = existing.lastSentHourKey === currentHour ? existing.sentThisHour : false;
        // Usar OR: se o estado OU o banco dizem que já enviou, marcar como enviado
        const sentThisHour = sentFromState || alreadySentInDb;
        if (alreadySentInDb && !sentFromState) {
          console.log(`🔍 ${camp.name}: banco confirma envio nesta hora (estado não sabia)`);
        }
        newStates.push({
          ...existing,
          campaignName: camp.name,
          sentThisHour,
          lastSentHourKey: sentThisHour ? currentHour : existing.lastSentHourKey,
        });
      } else {
        if (alreadySentInDb) {
          console.log(`🔍 ${camp.name}: banco confirma envio nesta hora (campanha nova no estado)`);
        }
        newStates.push({
          campaignId: camp.id,
          campaignName: camp.name,
          sentThisHour: alreadySentInDb,
          lastSentHourKey: alreadySentInDb ? currentHour : null,
        });
      }
    }

    this.state.campaignStates = newStates;
    console.log(`📋 ${newStates.length} campanhas ativas | ${newStates.filter(c => c.sentThisHour).length} já enviaram nesta hora (verificado no banco)`);
  }

  /**
   * Agenda envios de TODAS as campanhas que ainda não enviaram nesta hora
   * Distribui em momentos aleatórios com gap mínimo de 3 min
   */
  private async scheduleHourSends() {
    // Cancelar timers anteriores
    for (const timer of this.slotTimers) {
      clearTimeout(timer);
    }
    this.slotTimers = [];

    const pendingCampaigns = this.state.campaignStates.filter(cs => !cs.sentThisHour);
    
    if (pendingCampaigns.length === 0) {
      console.log(`✅ Todas as campanhas já enviaram nesta hora`);
      return;
    }

    // Calcular quanto tempo resta na hora atual
    const now = new Date();
    const minutesIntoHour = now.getMinutes();
    const remainingMs = (60 - minutesIntoHour) * 60 * 1000;
    
    // Se restam menos de 3 min, não agendar (esperar próxima hora)
    if (remainingMs < 3 * 60 * 1000) {
      console.log(`⏳ Menos de 3 min restantes na hora, aguardando próxima hora`);
      return;
    }

    // Gerar slots aleatórios dentro do tempo restante
    const totalMsgs = pendingCampaigns.length;
    const availableWindow = remainingMs - this.MARGIN_MS;
    
    // Embaralhar campanhas para ordem aleatória
    const shuffled = [...pendingCampaigns].sort(() => Math.random() - 0.5);

    // Gerar delays aleatórios com gap mínimo
    const delays: number[] = [];
    for (let i = 0; i < totalMsgs; i++) {
      let attempts = 0;
      let delay: number;

      do {
        delay = Math.floor(Math.random() * Math.max(1, availableWindow));
        attempts++;
      } while (
        attempts < 100 &&
        delays.some(d => Math.abs(d - delay) < this.MIN_GAP_MS)
      );

      // Fallback: distribuir uniformemente
      if (attempts >= 100) {
        delay = Math.floor((availableWindow / (totalMsgs + 1)) * (i + 1));
      }

      delays.push(delay);
    }

    // Ordenar cronologicamente
    delays.sort((a, b) => a - b);

    // Salvar slots para UI
    this.state.scheduledSlots = shuffled.map((cs, idx) => ({
      campaignName: cs.campaignName,
      minuteLabel: Math.round(delays[idx] / 60000),
      sent: false,
    }));

    console.log(`📤 Agendando ${totalMsgs} envios nesta hora:`);
    
    for (let i = 0; i < shuffled.length; i++) {
      const cs = shuffled[i];
      const delay = delays[i];
      const slotIndex = i;

      console.log(`  📨 ${cs.campaignName} → ~${Math.round(delay / 60000)} min`);

      const timer = setTimeout(async () => {
        if (!this.state.isRunning) return;

        // VERIFICAÇÃO TRIPLA v7: checar flag + banco antes de enviar
        const campState = this.state.campaignStates.find(c => c.campaignId === cs.campaignId);
        if (!campState || campState.sentThisHour) {
          console.log(`🛑 ${cs.campaignName}: já enviou nesta hora (flag), pulando`);
          return;
        }

        const db = await getDb();
        if (!db) return;

        // VERIFICAÇÃO NO BANCO: última linha de defesa contra duplicatas
        const hourStart = new Date();
        hourStart.setMinutes(0, 0, 0);
        const sentInDb = await db.select({ count: sql<number>`count(*)` })
          .from(messages)
          .where(and(
            eq(messages.campaignId, cs.campaignId),
            eq(messages.status, 'sent'),
            gte(messages.sentAt, hourStart)
          ));
        if ((sentInDb[0]?.count || 0) > 0) {
          console.log(`🛑 ${cs.campaignName}: banco confirma envio nesta hora, BLOQUEANDO duplicata`);
          campState.sentThisHour = true;
          campState.lastSentHourKey = this.getCurrentHourKey();
          return;
        }

        const campResult = await db.select().from(campaigns).where(eq(campaigns.id, cs.campaignId)).limit(1);
        const campaign = campResult[0];
        if (!campaign || campaign.status !== 'running') {
          console.log(`⚠️ ${cs.campaignName}: não está ativa, pulando`);
          return;
        }

        console.log(`\n📨 Enviando: ${cs.campaignName} (hora ${this.state.hourNumber + 1}/${this.MAX_HOURS_PER_CYCLE})`);
        
        await this.sendMessageForCampaign(campaign);

        // 🔴 TRAVA: marcar como enviado nesta hora
        campState.sentThisHour = true;
        campState.lastSentHourKey = this.getCurrentHourKey();

        // Marcar slot como enviado na UI (por nome da campanha, mais confiável que índice)
        const slot = this.state.scheduledSlots.find(s => s.campaignName === cs.campaignName);
        if (slot) {
          slot.sent = true;
        }

        await this.saveStateToDB();
      }, delay);

      this.slotTimers.push(timer);
    }
  }

  // ========== SINCRONIZAÇÃO ==========

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
          totalContacts: 2, // 1 msg/hora × 2 horas = 2 contatos
          sentCount: 0,
          failedCount: 0,
          messagesPerHour: 1, // RESTRITIVO: sempre 1
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
      console.log(`✅ ${runningCampaigns.length} campanhas ativas`);
    } catch (error) {
      console.error("❌ Erro na sincronização:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  // ========== GERAÇÃO DE VARIAÇÕES ==========

  private generateMessageVariations(prop: any): string[] {
    const priceFormatted = Number(prop.price).toLocaleString("pt-BR");
    const slug = prop.publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const siteUrl = `https://romateccrmwhatsapp-production.up.railway.app/imovel/${slug}`;
    const denom = prop.denomination || '';

    // Detectar se é chácara para mensagem de escassez
    const isChacara = denom.toLowerCase().includes('chacara') || denom.toLowerCase().includes('chácar') || denom.toLowerCase().includes('giuliano');

    if (isChacara) {
      return [
        `🌿 {{NOME}}, *${denom}* - Chácaras exclusivas em Açailândia!\n\n🏡 Cada chácara: *~1.000m²* por apenas *R$ ${priceFormatted}*\n⚠️ *Restam apenas 3 unidades!* São 6 no total e estão saindo rápido.\n\n📸 Veja fotos e localização: ${siteUrl}\n\nGaranta a sua antes que acabe!`,
        `{{NOME}}, já conhece o *${denom}*? 🌳\n\nSão chácaras de *~1.000m²* cada, perfeitas pra quem busca tranquilidade e espaço.\n\n💰 *R$ ${priceFormatted}* por unidade\n🚨 *Apenas 3 disponíveis* (de 6 no total)\n\n👉 Confira: ${siteUrl}\n\nNão perca essa oportunidade única!`,
        `🔥 {{NOME}}, *OPORTUNIDADE RARA*\n\n*${denom}* - Açailândia/MA\n🏡 Chácaras de ~1.000m²\n💰 *R$ ${priceFormatted}* cada\n\n⚠️ *Das 6 unidades, restam apenas 3!*\n✅ Ideal pra lazer, moradia ou investimento\n\n📲 Veja agora: ${siteUrl}\n\nResponde "SIM" que te passo todos os detalhes!`,
        `⏰ {{NOME}}, *ÚLTIMAS UNIDADES*!\n\n*${denom}*: chácaras de ~1.000m² em Açailândia.\n\n💰 *R$ ${priceFormatted}* por chácara\n🚨 Apenas *3 de 6* ainda disponíveis\n\nO condomínio está vendendo rápido. Quem garante primeiro, escolhe o melhor lote.\n\n📸 Detalhes: ${siteUrl}\n\nMe chama agora!`,
        `🏡 {{NOME}}, imagine ter sua própria chácara...\n\n*${denom}* - ~1.000m² de puro sossego em Açailândia.\nValor: *R$ ${priceFormatted}*\n\n⚠️ *Restam só 3 unidades!* Não vai durar muito.\n\n🔗 Conheça: ${siteUrl}\n\nVamos conversar sobre como garantir a sua?`,
        `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${denom}* - Chácaras em condomínio fechado\n📍 Açailândia/MA\n📐 ~1.000m² cada\n💰 *R$ ${priceFormatted}*\n\n🚨 *Apenas 3 restantes* de 6 unidades!\n\n📲 Detalhes: ${siteUrl}\n\nTem interesse? Me responde!`,
        `✨ {{NOME}}, procurando chácara com ótimo custo-benefício?\n\n*${denom}*: ~1.000m² por *R$ ${priceFormatted}*\n📍 Condomínio em Açailândia/MA\n\n⚠️ *Só restam 3 de 6 unidades*\n✅ Documentação regularizada\n\n👉 Veja: ${siteUrl}\n\nPosso te passar mais detalhes!`,
        `🤔 {{NOME}}, já pensou em investir em chácara?\n\n*${denom}* - Açailândia/MA\n~1.000m² por apenas *R$ ${priceFormatted}*\n\n📊 Das 6 unidades, *3 já foram vendidas*!\nValorização garantida na região.\n\n📸 Veja tudo: ${siteUrl}\n\nMe conta se tem interesse!`,
        `📌 {{NOME}}, comparou preços de chácaras na região?\n\n*${denom}*: ~1.000m² por *R$ ${priceFormatted}*\nIsso está *abaixo da média* do mercado!\n\n🚨 *Restam apenas 3 unidades* de 6\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,
        `🚨 {{NOME}}, *ATENÇÃO*\n\n*${denom}* está gerando muito interesse!\n\n🏡 Chácaras de ~1.000m² - *R$ ${priceFormatted}* cada\n⚠️ *Apenas 3 de 6 unidades disponíveis*\n\nPode sair do mercado a qualquer momento.\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta a sua agora!`,
        `💎 {{NOME}}, oportunidade *ÚNICA* em Açailândia!\n\n*${denom}*\n📐 ~1.000m² por chácara\n💰 *R$ ${priceFormatted}*\n🏡 Condomínio com apenas 6 unidades\n\n🔴 *3 já vendidas!* Restam 3.\n\n👉 Veja: ${siteUrl}\n\nNão deixe pra depois!`,
        `🌿 {{NOME}}, sua chácara dos sonhos está aqui!\n\n*${denom}* - Condomínio exclusivo\n📍 Açailândia/MA\n📐 ~1.000m² cada unidade\n💰 *R$ ${priceFormatted}*\n\n⚠️ *Últimas 3 unidades!*\n\n📸 Fotos e mapa: ${siteUrl}\n\nMe chama que te explico tudo!`,
      ];
    }

    // Variações genéricas para outros imóveis
    return [
      `🏠 {{NOME}}, *${denom}* - Restam poucas unidades!\n\nValor: *R$ ${priceFormatted}*\nLocal: ${prop.address}\n\n📸 Veja fotos, planta e localização:\n${siteUrl}\n\n⚡ Condições especiais para os primeiros interessados. Posso te passar mais detalhes?`,
      `{{NOME}}, você já conhece o *${denom}*? 🔑\n\nUm dos imóveis mais procurados da região de ${prop.address}.\n\n💰 A partir de *R$ ${priceFormatted}*\n\n👉 Confira tudo aqui: ${siteUrl}\n\nPosso reservar uma visita exclusiva pra você?`,
      `📊 {{NOME}}, o *${denom}* já recebeu mais de 50 consultas este mês!\n\nMotivo? Localização privilegiada em ${prop.address} + preço competitivo.\n\n🏷️ *R$ ${priceFormatted}*\n\n🔗 Veja todos os detalhes: ${siteUrl}\n\nNão perca essa oportunidade. Me chama!`,
      `💡 {{NOME}}, sabia que imóveis nessa região valorizaram mais de 30% nos últimos anos?\n\n*${denom}* - ${prop.address}\nValor atual: *R$ ${priceFormatted}*\n\n📲 Fotos e detalhes completos: ${siteUrl}\n\nQuero te mostrar por que esse é o melhor momento pra investir. Posso te ligar?`,
      `🔥 {{NOME}}, *OPORTUNIDADE REAL*\n\n*${denom}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\n✅ Financiamento facilitado\n✅ Documentação em dia\n✅ Pronto pra morar/construir\n\n👉 Veja agora: ${siteUrl}\n\nResponde "SIM" que te envio todas as condições!`,
      `⏰ {{NOME}}, última chance!\n\n*${denom}* em ${prop.address} está com condições especiais que vencem em breve.\n\n🏷️ *R$ ${priceFormatted}* (parcelas que cabem no bolso)\n\n📸 Veja fotos e planta: ${siteUrl}\n\nJá temos interessados. Garanta o seu antes que acabe!`,
      `🏡 {{NOME}}, imagine sua família no lugar perfeito...\n\n*${denom}* - ${prop.address}\nValor: *R$ ${priceFormatted}*\n\nLocalização estratégica, segurança e qualidade de vida.\n\n🔗 Conheça cada detalhe: ${siteUrl}\n\nVamos conversar sobre como realizar esse sonho?`,
      `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${denom}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\nPoucos sabem dessa oportunidade. Estou compartilhando com um grupo seleto de clientes.\n\n📲 Detalhes completos: ${siteUrl}\n\nTem interesse? Me responde que te explico tudo!`,
      `✨ {{NOME}}, procurando imóvel com ótimo custo-benefício?\n\n*${denom}* em ${prop.address}\n\n🏷️ *R$ ${priceFormatted}*\n📋 Documentação 100% regularizada\n🏦 Aceita financiamento\n\n👉 Veja fotos e localização: ${siteUrl}\n\nPosso simular as parcelas pra você. É só me chamar!`,
      `🤔 {{NOME}}, você está buscando imóvel na região de ${prop.address}?\n\nTenho uma opção que pode ser exatamente o que procura:\n\n*${denom}* - *R$ ${priceFormatted}*\n\n📸 Veja tudo aqui: ${siteUrl}\n\nMe conta o que você precisa que te ajudo a encontrar o imóvel ideal!`,
      `📌 {{NOME}}, comparou preços na região?\n\n*${denom}* está abaixo da média do mercado:\n💰 *R$ ${priceFormatted}*\n📍 ${prop.address}\n\nE o melhor: condições facilitadas de pagamento.\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,
      `🚨 {{NOME}}, *ATENÇÃO*\n\n*${denom}* - ${prop.address}\n\nEste imóvel está gerando muito interesse e pode sair do mercado a qualquer momento.\n\n🏷️ *R$ ${priceFormatted}*\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta sua visita. Me chama agora!`,
    ];
  }

  // ========== CONTATOS ==========

  private async assignContactsToCampaign(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
    const unblockedContacts = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);

    const neededContacts = 2; // 1 msg/hora × 2 horas = 2

    if (unblockedContacts.length < neededContacts) {
      console.warn(`⚠️ Apenas ${unblockedContacts.length} contatos disponíveis (precisa de ${neededContacts})`);
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

  // ========== ENVIO ==========

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

  private async sendMessageForCampaign(campaign: any) {
    if (this.isSending) {
      console.log(`🚫 LOCK: envio já em andamento, aguardando...`);
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
        console.log(`⚠️ Número inválido ${contact.phone} - pulado`);
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

        this.state.totalSent++;
        this.state.lastSentCampaignName = campaign.name;
        this.state.lastSentAt = Date.now();

        // Registrar para follow-up automático
        registerBotMessage(contact.phone, contact.name);

        console.log(`✅ Enviado para ${contact.phone} (${contact.name}) - ${campaign.name}`);
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
      this.isSending = false;
    }
  }

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

  private async resetCampaignContacts(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    console.log(`🔄 Resetando contatos da campanha ${campaignId}...`);
    await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
    await this.assignContactsToCampaign(campaignId);
    console.log(`✅ Contatos resetados`);
  }

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

  // ========== Z-API ==========

  private async sendViaZAPI(phone: string, message: string): Promise<'sent' | 'failed' | 'invalid'> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Validação: celular BR = 13 dígitos, 5º dígito = 9
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

  // ========== HISTÓRICO ==========

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

  // ========== RELATÓRIOS ==========

  private async sendCycleReport() {
    try {
      const OWNER_PHONE = '5599991811246';
      const now = new Date();
      const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
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
        campStats.push(`  • ${camp.name}: ${sent}/${ccList.length} enviadas | ${pending} pendentes`);
      }

      const sentThisHour = this.state.campaignStates.filter(c => c.sentThisHour).length;
      const totalCamps = this.state.campaignStates.length;

      const report = [
        `📊 *RELATÓRIO ROMATEC CRM*`,
        `📅 ${data} às ${hora}`,
        ``,
        `🕐 *Hora ${this.state.hourNumber}/${this.MAX_HOURS_PER_CYCLE}*`,
        `📨 Enviadas nesta hora: ${sentThisHour}/${totalCamps} campanhas`,
        ``,
        `📊 *Resumo Geral:*`,
        `  ✅ Enviadas: ${totalSent}`,
        `  ⏳ Pendentes: ${totalPending}`,
        `  ❌ Falhas: ${totalFailed}`,
        ``,
        `🏠 *Por Campanha:*`,
        ...campStats,
        ``,
        `⏭️ *Próxima hora:* envio automático`,
      ].join('\n');

      await this.sendViaZAPI(OWNER_PHONE, report);
      console.log(`📊 Relatório da hora ${this.state.hourNumber} enviado`);
    } catch (error) {
      console.error('❌ Erro ao enviar relatório:', error);
    }
  }

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
        `🌟 *RELATÓRIO CICLO ${this.MAX_HOURS_PER_CYCLE}H - ROMATEC CRM*`,
        `📅 ${data}`,
        ``,
        `✅ *${this.MAX_HOURS_PER_CYCLE} horas completas*`,
        ``,
        `📊 *Resumo:*`,
        `  ✅ Enviadas: ${totalSent}`,
        `  ❌ Falhas: ${totalFailed}`,
        `  ⏳ Pendentes: ${totalPending}`,
        `  🎯 Taxa: ${taxaSucesso}%`,
        ``,
        `🏠 *Por Campanha:*`,
        ...campStats,
        ``,
        `🚀 *Novo ciclo de ${this.MAX_HOURS_PER_CYCLE}h iniciado!*`,
      ].join('\n');

      await this.sendViaZAPI(OWNER_PHONE, report);
      console.log(`🌟 Relatório do ciclo enviado!`);
    } catch (error) {
      console.error('❌ Erro ao enviar relatório:', error);
    }
  }

  // ========== ESTADO PARA UI ==========

  getState() {
    const now = Date.now();
    // Calcular próxima hora cheia no fuso de Brasília
    const nowBR = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentMinute = nowBR.getMinutes();
    const currentSecond = nowBR.getSeconds();
    const remainingSeconds = (60 - currentMinute - 1) * 60 + (60 - currentSecond);
    const nextHour = (nowBR.getHours() + 1) % 24;

    const uptimeMs = now - this.state.startedAt;
    const uptimeHours = String(Math.floor(uptimeMs / 3600000)).padStart(2, '0');
    const uptimeMinutes = String(Math.floor((uptimeMs % 3600000) / 60000)).padStart(2, '0');
    const uptimeSeconds = String(Math.floor((uptimeMs % 60000) / 1000)).padStart(2, '0');

    const sentThisHour = this.state.campaignStates.filter(c => c.sentThisHour).length;
    const totalCamps = this.state.campaignStates.length;

    return {
      ...this.state,
      // Compatibilidade com a UI existente
      messagesThisHour: sentThisHour,
      maxMessagesPerHour: totalCamps,
      messagesThisCycle: sentThisHour,
      maxMessagesThisCycle: totalCamps,
      secondsUntilNextCycle: remainingSeconds,
      cycleDurationSeconds: 3600,
      maxCyclesPerDay: this.MAX_HOURS_PER_CYCLE,
      cycleNumber: this.state.hourNumber,
      cycleProgress: `${this.state.hourNumber + 1}/${this.MAX_HOURS_PER_CYCLE}`,
      currentPairIndex: 0,
      totalPairs: 1,
      currentCampaignNames: this.state.campaignStates.map(c => c.campaignName),
      uptimeMs,
      uptimeFormatted: `${uptimeHours}:${uptimeMinutes}:${uptimeSeconds}`,
      startedAtFormatted: new Date(this.state.startedAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo'
      }),
      nextCycleFormatted: `${String(nextHour).padStart(2, '0')}:00`,
      activePair: {
        index: 0,
        campaigns: this.state.campaignStates.map(c => c.campaignName),
      },
    };
  }

  // ========== FOLLOW-UP AUTOMÁTICO ==========

  /**
   * Inicia loop de verificação de follow-ups (a cada 5 min)
   */
  private startFollowUpLoop() {
    if (this.followUpTimer) {
      clearInterval(this.followUpTimer);
    }

    this.followUpTimer = setInterval(async () => {
      if (!this.state.isRunning) return;
      await this.processFollowUps();
    }, 5 * 60 * 1000); // Verificar a cada 5 minutos
  }

  /**
   * Processa e envia follow-ups pendentes
   */
  private async processFollowUps() {
    try {
      const followUps = getFollowUpsToSend();
      if (followUps.length === 0) return;

      console.log(`📤 [Follow-up] ${followUps.length} mensagens de acompanhamento para enviar`);

      for (const fu of followUps) {
        // Esperar 30s entre follow-ups para não parecer spam
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        const result = await this.sendViaZAPI(fu.phone, fu.message);
        if (result === 'sent') {
          console.log(`✅ [Follow-up] Etapa ${fu.step}/3 enviada para ${fu.phone}`);
        } else {
          console.log(`❌ [Follow-up] Falha ao enviar etapa ${fu.step} para ${fu.phone}`);
        }
      }

      // Limpar follow-ups antigos
      cleanupOldFollowUps();
    } catch (error) {
      console.error('❌ [Follow-up] Erro:', error);
    }
  }

  getStats() {
    const uptimeMs = Date.now() - this.state.startedAt;
    const hours = Math.floor(uptimeMs / (60 * 60 * 1000));
    const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
    const total = this.state.totalSent + this.state.totalFailed;
    const successRate = total > 0 ? (this.state.totalSent / total) * 100 : 0;

    const sentThisHour = this.state.campaignStates.filter(c => c.sentThisHour).length;
    const totalCamps = this.state.campaignStates.length;

    return {
      isRunning: this.state.isRunning,
      cycleNumber: this.state.hourNumber,
      messagesThisHour: sentThisHour,
      maxMessagesPerHour: totalCamps,
      lastMessageSentAt: this.state.lastSentAt,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: this.state.totalBlocked,
      currentPairIndex: 0,
      totalPairs: 1,
      currentCampaignNames: this.state.campaignStates.map(c => c.campaignName),
      scheduledSlots: this.state.scheduledSlots,
      uptime: `${hours}h ${minutes}m`,
      successRate: `${successRate.toFixed(2)}%`,
    };
  }
}

export const campaignScheduler = new CampaignScheduler();
