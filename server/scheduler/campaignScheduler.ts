import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties, schedulerState as schedulerStateTable } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { registerBotMessage, getFollowUpsToSend, cleanupOldFollowUps } from "../bot-ai";

/**
 * SISTEMA ROMATEC CRM v9.0 - ROTAÇÃO SEQUENCIAL
 *
 * LÓGICA:
 * - 5 campanhas em rotação sequencial por hora
 * - 08h → Camp1 / 09h → Camp2 / 10h → Camp3 / 11h → Camp4 / 12h → Camp5
 * - 13h → Camp1 / 14h → Camp2 / 15h → Camp3 / 16h → Camp4 / 17h → Camp5
 * - Cada campanha envia 2 msgs por ciclo (dia)
 * - Horário: 08h-18h (modo dia) ou 20h-06h (modo noite)
 * - Bloqueio de 72h por contato após envio
 * - 1 msg por hora por campanha ativa
 * - Horário sincronizado com Brasília (GMT-3)
 * - Ao acionar, sincroniza com o ciclo da hora atual
 */

interface SchedulerState {
  isRunning: boolean;
  currentHourKey: string;
  hourNumber: number;
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  startedAt: number;
  campaignStates: CampaignHourState[];
  scheduledSlots: SlotInfo[];
  nightMode: boolean;
}

interface CampaignHourState {
  campaignId: number;
  campaignName: string;
  sentThisHour: boolean;
  lastSentHourKey: string | null;
}

interface SlotInfo {
  campaignId: number;
  campaignName: string;
  minuteLabel: number;
  sent: boolean;
}

// Mapeamento: hora do dia → índice da campanha (0-4)
// Dia: 08-17h (10 horas), Noite: 20-05h (10 horas)
const HOUR_TO_CAMP_INDEX: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4,
  13: 0, 14: 1, 15: 2, 16: 3, 17: 4,
  // Modo noite
  20: 0, 21: 1, 22: 2, 23: 3, 0: 4,
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4,
};

const ACTIVE_HOURS_DAY = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const ACTIVE_HOURS_NIGHT = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5];

export class CampaignScheduler {
  private state: SchedulerState = {
    isRunning: false,
    currentHourKey: '',
    hourNumber: 0,
    totalSent: 0,
    totalFailed: 0,
    totalBlocked: 0,
    startedAt: 0,
    campaignStates: [],
    scheduledSlots: [],
    nightMode: false,
  };

  private checkTimer: NodeJS.Timeout | null = null;
  private slotTimers: NodeJS.Timeout[] = [];
  private isSending: boolean = false;
  private lastVariationIndex: Map<number, number> = new Map();
  private followUpTimer: NodeJS.Timeout | null = null;

  private readonly CHECK_INTERVAL_MS = 60 * 1000;
  private readonly MIN_GAP_MS = 3 * 60 * 1000;
  private readonly MARGIN_MS = 2 * 60 * 1000;
  private readonly HOUR_MS = 60 * 60 * 1000;
  private readonly BLOCK_HOURS = 72;

  // ========== HORÁRIO BRASÍLIA ==========

  private getBrasiliaDate(): Date {
    // Sempre usa o fuso horário de Brasília (America/Sao_Paulo)
    const now = new Date();
    const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    return new Date(brasiliaStr);
  }

  // ========== ESTADO ==========

  private getCurrentHourKey(): string {
    const now = this.getBrasiliaDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
  }

  private getCurrentHour(): number {
    return this.getBrasiliaDate().getHours();
  }

  private isActiveHour(): boolean {
    const hour = this.getCurrentHour();
    const activeHours = this.state.nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
    return activeHours.includes(hour);
  }

  private getCurrentCycleIndex(): number {
    const hour = this.getCurrentHour();
    const activeHours = this.state.nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
    const idx = activeHours.indexOf(hour);
    return idx >= 0 ? idx : -1;
  }

  private getCampaignForCurrentHour(allCampaigns: any[]): any | null {
    const hour = this.getCurrentHour();
    const campIndex = HOUR_TO_CAMP_INDEX[hour];
    if (campIndex === undefined) return null;

    // ═══════════════════════════════════════════════════════════
    // SEQUÊNCIA FIXA: Cada hora tem uma campanha ESPECÍFICA
    // Não rotação — índice direto!
    // ═══════════════════════════════════════════════════════════
    const activePeriod = this.state.nightMode ? 'activeNight' : 'activeDay';
    const campaign = allCampaigns[campIndex];

    // Validar se campanha existe e está elegível
    if (!campaign) {
      console.log(`⚠️  Campanha no índice ${campIndex} não encontrada`);
      return null;
    }

    if (campaign.status !== 'running' || !campaign[activePeriod]) {
      console.log(`⚠️  ${campaign.name}: não elegível (status=${campaign.status}, ${activePeriod}=${campaign[activePeriod]})`);
      return null;
    }

    return campaign;
  }

  private async saveStateToDB() {
    try {
      const db = await getDb();
      if (!db) return;
      const status = this.state.isRunning ? 'running' : 'stopped';
      const stateJson = {
        hourNumber: this.state.hourNumber,
        totalSent: this.state.totalSent,
        totalFailed: this.state.totalFailed,
        startedAt: this.state.startedAt,
        nightMode: this.state.nightMode,
        campaignStates: this.state.campaignStates,
        scheduledSlots: this.state.scheduledSlots,
      };
      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      if (rows[0]) {
        await db.update(schedulerStateTable).set({ status, cycleNumber: this.state.hourNumber, stateJson, updatedAt: new Date() }).where(eq(schedulerStateTable.id, 1));
      } else {
        await db.insert(schedulerStateTable).values({ id: 1, status, cycleNumber: this.state.hourNumber, stateJson, messagesThisCycle: this.state.totalSent });
      }
      console.log(`💾 Estado salvo: ${status} | Ciclo ${this.state.hourNumber + 1}/10`);
    } catch (e) {
      console.error('❌ Erro ao salvar estado:', e);
    }
  }

  private async loadStateFromDB() {
    try {
      const db = await getDb();
      if (!db) return;
      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      if (rows[0] && rows[0].status === 'running') {
        const json = rows[0].stateJson as any;
        if (json) {
          this.state.hourNumber = json.hourNumber || 0;
          this.state.totalSent = json.totalSent || 0;
          this.state.totalFailed = json.totalFailed || 0;
          this.state.startedAt = json.startedAt || Date.now();
          this.state.nightMode = json.nightMode || false;
          this.state.campaignStates = json.campaignStates || [];
        }
        console.log(`✅ Estado restaurado: Ciclo ${this.state.hourNumber + 1}/10`);
      } else {
        console.log('📋 Nenhum estado salvo - scheduler parado');
      }
    } catch (e) {
      console.error('❌ Erro ao carregar estado:', e);
    }
  }

  // ========== CONTROLE ==========

  async start(nightMode = false) {
    if (this.state.isRunning) {
      console.log('⚠️ Scheduler já está rodando - parando antes de reiniciar');
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.state.nightMode = nightMode;
    this.state.isRunning = true;
    this.state.startedAt = Date.now();
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;
    this.state.currentHourKey = '';
    this.state.campaignStates = [];
    this.state.scheduledSlots = [];

    // Sincronizar ciclo com a hora atual de Brasília
    const currentHour = this.getCurrentHour();
    const activeHours = nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
    const cycleIdx = activeHours.indexOf(currentHour);
    if (cycleIdx >= 0) {
      this.state.hourNumber = cycleIdx;
      console.log(`🕐 Brasília: ${currentHour}h → Ciclo ${cycleIdx + 1}/10`);
    } else {
      this.state.hourNumber = 0;
      console.log(`⏰ Fora do horário ativo (hora atual Brasília: ${currentHour}h)`);
    }

    console.log(`🚀 Iniciando sistema ROMATEC CRM v9.0...`);
    console.log(`📏 REGRA: Rotação sequencial | Ciclo 10h | ${nightMode ? 'Modo Noite 20h-06h' : 'Modo Dia 08h-18h'}`);

    await this.syncCampaignsWithProperties();
    await this.initCampaignStates();

    await this.saveStateToDB();
    this.startCheckLoop();

    await this.checkAndSend();

    console.log(`✅ Scheduler v9.0 iniciado - Verificação a cada 1 minuto`);
  }

  stop() {
    console.log('⏹️ Parando scheduler...');
    this.state.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    for (const timer of this.slotTimers) {
      clearTimeout(timer);
    }
    this.slotTimers = [];

    if (this.followUpTimer) {
      clearInterval(this.followUpTimer);
      this.followUpTimer = null;
    }

    this.saveStateToDB().catch(() => {});
    console.log('⏹️ Scheduler COMPLETAMENTE parado');
  }

  private startCheckLoop() {
    this.checkTimer = setInterval(async () => {
      if (!this.state.isRunning) return;
      await this.checkAndSend();
    }, this.CHECK_INTERVAL_MS);
  }

  // ========== LÓGICA PRINCIPAL ==========

  private async checkAndSend() {
    if (!this.state.isRunning) return;

    const currentHourKey = this.getCurrentHourKey();

    if (currentHourKey !== this.state.currentHourKey) {
      // Nova hora!
      this.state.currentHourKey = currentHourKey;

      // Auto-ativar/desativar ciclos (08h, 18h, 20h, 06h)
      const brasiliaHour = parseInt(currentHourKey.split('-')[3], 10);
      await this.autoToggleCycles(brasiliaHour);

      // Sincronizar ciclo com a hora real de Brasília
      const cycleIdx = this.getCurrentCycleIndex();
      if (cycleIdx >= 0) {
        this.state.hourNumber = cycleIdx;
        console.log(`\n🕐 === NOVA HORA (Brasília): ${currentHourKey} | Ciclo ${this.state.hourNumber + 1}/10 ===`);
      } else {
        console.log(`\n🕐 === NOVA HORA (Brasília): ${currentHourKey} | FORA DO HORÁRIO ATIVO ===`);
        return;
      }

      // Resetar slots e estados das campanhas
      this.state.campaignStates = this.state.campaignStates.map(cs => ({
        ...cs,
        sentThisHour: false,
      }));
      this.state.scheduledSlots = [];

      // Cancelar timers antigos
      for (const timer of this.slotTimers) clearTimeout(timer);
      this.slotTimers = [];

      if (!this.isActiveHour()) {
        console.log(`😴 Fora do horário ativo — aguardando próxima hora`);
        await this.saveStateToDB();
        return;
      }

      await this.syncCampaignsWithProperties();
      await this.initCampaignStates();
      await this.scheduleHourSend();
      await this.saveStateToDB();

      // Relatório de hora
      await this.sendCycleReport();
    }

    // Primeira execução
    if (!this.state.currentHourKey || this.state.currentHourKey === '') {
      this.state.currentHourKey = currentHourKey;
      if (this.isActiveHour()) {
        await this.initCampaignStates();
        await this.scheduleHourSend();
        await this.saveStateToDB();
      }
    }
  }

  private async scheduleHourSend() {
    const db = await getDb();
    if (!db) return;

    const allCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
    const campaign = this.getCampaignForCurrentHour(allCampaigns);

    if (!campaign) {
      console.log('⚠️ Nenhuma campanha para esta hora');
      return;
    }

    const hour = this.getCurrentHour();
    const campIndex = HOUR_TO_CAMP_INDEX[hour];

    console.log(`📤 Hora ${hour}h (Brasília) → Campanha: ${campaign.name} (ciclo ${campIndex !== undefined ? campIndex + 1 : '?'}/10)`);

    // Verificar se já enviou nesta hora
    const campState = this.state.campaignStates.find(cs => cs.campaignId === campaign.id);
    if (campState?.sentThisHour) {
      console.log(`✅ ${campaign.name} já enviou nesta hora`);
      return;
    }

    // Agendar envio ALEATÓRIO nos primeiros 15 minutos da hora
    // Fluxo: 15 min envio + 45 min qualificação = 60 min total
    const now = this.getBrasiliaDate();
    const minutesIntoHour = now.getMinutes();
    const secondsIntoHour = minutesIntoHour * 60 + now.getSeconds();

    // Janela de envio: 0-15 minutos da hora (aleatória)
    const SEND_WINDOW_START = 0; // início da hora
    const SEND_WINDOW_END = 15; // 15 minutos

    // Gerar minuto aleatório entre 0-15
    const randomMinute = SEND_WINDOW_START + Math.floor(Math.random() * (SEND_WINDOW_END - SEND_WINDOW_START + 1));

    // Calcular delay até o minuto aleatório
    const delayMinutes = randomMinute - minutesIntoHour;
    const delaySeconds = delayMinutes * 60 - secondsIntoHour;
    const delayMs = Math.max(1000, delaySeconds * 1000);

    const remainingMs = this.HOUR_MS - (secondsIntoHour * 1000);

    if (delayMs > remainingMs) {
      console.log(`⚠️ Sem tempo suficiente para envio aleatório — pulando`);
      return;
    }

    const slot: SlotInfo = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      minuteLabel: randomMinute,
      sent: false,
    };
    this.state.scheduledSlots = [slot];

    console.log(`🎲 ${campaign.name} → envio aleatório no minuto ${randomMinute} (em ${Math.round(delayMs / 60000)}min)`);
    console.log(`   ⏱️ Fluxo: 15min envio + 45min qualificação = 60min/hora`);

    const timer = setTimeout(async () => {
      if (!this.state.isRunning) return;
      const cs = this.state.campaignStates.find(s => s.campaignId === campaign.id);
      if (cs?.sentThisHour) return;
      await this.sendMessageForCampaign(campaign.id);
    }, delayMs);

    this.slotTimers.push(timer);
    await this.saveStateToDB();
  }

  private async sendMessageForCampaign(campaignId: number) {
    if (this.isSending) return;
    this.isSending = true;

    try {
      const db = await getDb();
      if (!db) return;

      const campResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
      const campaign = campResult[0];
      if (!campaign) return;

      // PROTEÇÃO: Verificar NOVAMENTE se já enviou esta hora (dupla verificação)
      const campState = this.state.campaignStates.find(cs => cs.campaignId === campaignId);
      if (campState?.sentThisHour) {
        console.log(`⚠️ PROTEÇÃO: ${campaign.name} já foi enviado nesta hora, cancelando`);
        return;
      }

      const contact = await this.getNextContact(campaignId);
      if (!contact) {
        console.log(`⚠️ ${campaign.name}: sem contatos disponíveis`);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // VERIFICAÇÃO CRÍTICA: 1 mensagem por CAMPANHA por hora + 1 por CONTATO
      // ═══════════════════════════════════════════════════════════════════════
      const { messageSendLog } = await import('../../drizzle/schema');
      const cleanPhone = contact.phone.replace(/\D/g, '');
      const now = new Date();
      const nowUnix = Math.floor(now.getTime() / 1000);
      const cycleHour = Math.floor(nowUnix / 3600) * 3600;
      const hourLabel = new Date(cycleHour * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      // 1) Verificar se ESTA CAMPANHA já enviou nesta hora (proteção de DB, sobrevive a restart)
      const campSentLog = await db
        .select()
        .from(messageSendLog)
        .where(
          and(
            eq(messageSendLog.campaignId, campaignId),
            eq(messageSendLog.cycleHour, cycleHour),
            eq(messageSendLog.status, 'sent')
          )
        )
        .limit(1);

      if (campSentLog.length > 0) {
        console.log(`⚠️ PROTEÇÃO DB: ${campaign.name} já enviou nesta hora (${hourLabel}) — cancelando duplicata`);
        const cs = this.state.campaignStates.find(s => s.campaignId === campaignId);
        if (cs) { cs.sentThisHour = true; cs.lastSentHourKey = this.state.currentHourKey; }
        return;
      }

      // 2) Verificar se esse CONTATO já recebeu mensagem neste ciclo de hora
      const existingLog = await db
        .select()
        .from(messageSendLog)
        .where(
          and(
            eq(messageSendLog.contactPhone, cleanPhone),
            eq(messageSendLog.cycleHour, cycleHour)
          )
        )
        .limit(1);

      if (existingLog.length > 0) {
        console.log(`⏭️ ${campaign.name} → ${contact.name}: JÁ RECEBEU MENSAGEM NESTA HORA (${hourLabel})`);
        await db.insert(messageSendLog).values({
          contactPhone: cleanPhone,
          campaignId,
          sentAt: now,
          cycleHour,
          status: 'skipped_duplicate',
          reason: `Contato já recebeu mensagem em ${hourLabel}`,
        }).catch(() => {});
        return;
      }

      const messageText = await this.getMessageVariation(campaignId);
      if (!messageText) {
        console.log(`⚠️ ${campaign.name}: sem variações de mensagem`);
        return;
      }

      const personalized = this.personalizeMessage(messageText, contact);

      console.log(`\n📨 Enviando: ${campaign.name} → ${contact.name} (${contact.phone})`);

      const result = await this.sendViaZAPI(contact.phone, personalized);

      if (result === 'sent') {
        // ═══════════════════════════════════════════════════════════════════════
        // REGISTRAR NO LOG CRÍTICO: messageSendLog
        // ═══════════════════════════════════════════════════════════════════════
        const { messageSendLog } = await import('../../drizzle/schema');
        const now = new Date();
        const nowUnix = Math.floor(now.getTime() / 1000);
        const cycleHour = Math.floor(nowUnix / 3600) * 3600;

        try {
          await db.insert(messageSendLog).values({
            contactPhone: cleanPhone,
            campaignId,
            sentAt: now,
            cycleHour,
            status: 'sent',
            reason: null,
          });
          console.log(`📊 [SendLog] Registrado: ${cleanPhone} em ciclo ${new Date(cycleHour * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        } catch (logErr) {
          // Se falhar por duplicata (constraint única), é porque outro envio já registrou
          // Isso é BOM — significa que o DB evitou uma duplicata
          if ((logErr as any)?.message?.includes('Duplicate')) {
            console.warn(`⚠️ [SendLog] Duplicata detectada e bloqueada pelo DB para ${cleanPhone}`);
          } else {
            console.error(`❌ [SendLog] Erro ao registrar:`, logErr);
          }
        }

        // Marcar como enviado
        await db.update(campaignContacts)
          .set({ status: 'sent', messagesSent: 1, lastMessageSent: new Date() })
          .where(and(
            eq(campaignContacts.campaignId, campaignId),
            eq(campaignContacts.contactId, contact.id)
          ));

        // Bloquear contato por 72h
        const blockedUntil = new Date(Date.now() + this.BLOCK_HOURS * 60 * 60 * 1000);
        await db.update(contacts).set({ blockedUntil }).where(eq(contacts.id, contact.id));

        // Registrar mensagem
        await db.insert(messages).values({
          campaignId,
          contactId: contact.id,
          propertyId: campaign.propertyId,
          messageText: personalized,
          status: 'sent',
          sentAt: new Date(),
        });

        await db.update(campaigns).set({ sentCount: (campaign.sentCount || 0) + 1 }).where(eq(campaigns.id, campaignId));

        this.state.totalSent++;

        // Marcar campanha como enviou nesta hora
        const cs = this.state.campaignStates.find(s => s.campaignId === campaignId);
        if (cs) {
          cs.sentThisHour = true;
          cs.lastSentHourKey = this.state.currentHourKey;
          console.log(`🔒 ${campaign.name} MARCADO como enviado nesta hora (${this.state.currentHourKey})`);
        }

        const slot = this.state.scheduledSlots.find(s => s.campaignId === campaignId);
        if (slot) slot.sent = true;

        console.log(`✅ Enviado com sucesso! Total hoje: ${this.state.totalSent}`);

        // Registrar para bot
        await registerBotMessage(contact.phone, contact.name || '', campaignId, personalized);

        await this.updateContactHistory(contact.id, campaignId);

        // ─── FOLLOW-UP: enviar link do imóvel 1-2 minutos depois ───
        const linkMsg = await this.getPropertyLinkMessage(campaignId);
        if (linkMsg) {
          const delayMs = 60000 + Math.floor(Math.random() * 60000); // 60-120 segundos
          const followUpPhone = contact.phone;
          console.log(`⏳ Link do imóvel agendado para ${followUpPhone} em ${Math.round(delayMs / 1000)}s`);
          setTimeout(async () => {
            try {
              await this.sendViaZAPI(followUpPhone, linkMsg);
              console.log(`🔗 Link enviado para ${followUpPhone}`);
            } catch (e) {
              console.error(`❌ Erro ao enviar link follow-up:`, e);
            }
          }, delayMs);
        }
      } else if (result === 'failed') {
        this.state.totalFailed++;
        await db.insert(messages).values({
          campaignId,
          contactId: contact.id,
          propertyId: campaign.propertyId,
          messageText: personalized,
          status: 'failed',
          sentAt: new Date(),
        });
        console.log(`❌ Falha no envio`);
      } else {
        // Número inválido — pular para próximo
        await db.update(campaignContacts)
          .set({ status: 'failed' })
          .where(and(
            eq(campaignContacts.campaignId, campaignId),
            eq(campaignContacts.contactId, contact.id)
          ));
      }

      await this.saveStateToDB();
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
    } finally {
      this.isSending = false;
    }
  }

  // ========== SINCRONIZAÇÃO ==========

  private async syncCampaignsWithProperties() {
    try {
      const db = await getDb();
      if (!db) return;

      const activeProperties = await db.select().from(properties).where(eq(properties.status, 'available'));
      const existingCampaigns = await db.select().from(campaigns);
      const existingPropertyIds = existingCampaigns.map(c => c.propertyId);

      const sharedUsedIds = new Set<number>();
      for (const prop of activeProperties) {
        if (!existingPropertyIds.includes(prop.id)) {
          console.log(`➕ Criando campanha: ${prop.denomination}`);
          const variations = this.generateMessageVariations(prop);
          const result = await db.insert(campaigns).values({
            propertyId: prop.id,
            name: prop.denomination,
            messageVariations: variations,
            totalContacts: 2,
            sentCount: 0,
            failedCount: 0,
            messagesPerHour: 1,
            status: 'running',
            startDate: new Date(),
          });
          const campaignId = Number((result as any)[0].insertId);
          await this.assignContactsToCampaign(campaignId, sharedUsedIds);
        }
      }

      // Pausar campanhas sem imóvel ativo
      const activePropertyIds = activeProperties.map(p => p.id);
      for (const camp of existingCampaigns) {
        if (!activePropertyIds.includes(camp.propertyId)) {
          await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, camp.id));
        } else if (camp.status === 'paused') {
          await db.update(campaigns).set({ status: 'running' }).where(eq(campaigns.id, camp.id));
        }
      }

      const running = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
      console.log(`✅ ${running.length} campanhas ativas`);
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
    }
  }

  private async initCampaignStates() {
    const db = await getDb();
    if (!db) return;

    const allCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
    const currentHourKey = this.getCurrentHourKey();

    // ═══════════════════════════════════════════════════════════
    // FILTRO: Apenas campanhas ativas para este ciclo (máx 5)
    // ═══════════════════════════════════════════════════════════
    const activePeriod = this.state.nightMode ? 'activeNight' : 'activeDay';
    const eligibleCampaigns = allCampaigns.filter(camp => camp[activePeriod] === true);

    console.log(`📊 Iniciando campanhas elegíveis: ${eligibleCampaigns.length}/5 no ciclo ${this.state.nightMode ? 'NOITE 🌙' : 'DIA ☀️'}`);

    this.state.campaignStates = eligibleCampaigns.map(camp => {
      const existing = this.state.campaignStates.find(cs => cs.campaignId === camp.id);
      return {
        campaignId: camp.id,
        campaignName: camp.name,
        sentThisHour: existing?.lastSentHourKey === currentHourKey ? true : false,
        lastSentHourKey: existing?.lastSentHourKey || null,
      };
    });
  }

  // ========== CONTATOS ==========

  private async assignContactsToCampaign(campaignId: number, globalUsedIds?: Set<number>) {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const allContacts = await db.select().from(contacts).where(eq(contacts.status, 'active'));
    const unblocked = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);

    // Excluir contatos já usados em outras campanhas
    const existingAssignments = await db.select().from(campaignContacts);
    const alreadyUsed = new Set<number>(existingAssignments.map(cc => cc.contactId));
    if (globalUsedIds) globalUsedIds.forEach(id => alreadyUsed.add(id));

    const available = unblocked.filter(c => !alreadyUsed.has(c.id));

    if (available.length < 2) {
      console.warn(`⚠️ Apenas ${available.length} contatos disponíveis sem repetição para campanha ${campaignId}`);
    }

    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 2);

    for (const contact of selected) {
      if (globalUsedIds) globalUsedIds.add(contact.id);
      await db.insert(campaignContacts).values({
        campaignId,
        contactId: contact.id,
        messagesSent: 0,
        status: 'pending',
      });
    }

    console.log(`📱 ${selected.length} contatos designados para campanha ${campaignId}`);
  }

  private async getNextContact(campaignId: number) {
    const db = await getDb();
    if (!db) return null;

    const ccList = await db.select().from(campaignContacts)
      .where(and(
        eq(campaignContacts.campaignId, campaignId),
        eq(campaignContacts.status, 'pending')
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

  // ========== MENSAGENS ==========

  private personalizeMessage(messageText: string, contact: { name: string; phone: string }): string {
    const firstName = (contact.name || '').split(' ')[0].trim();
    let personalized = messageText;

    if (firstName && firstName.length > 1) {
      // Suporta ambos os formatos: {NOME} e {{NOME}}
      personalized = personalized.replace(/\{\{NOME\}\}/g, firstName);
      personalized = personalized.replace(/\{NOME\}/g, firstName);
    } else {
      // Remove placeholders se não houver nome
      personalized = personalized.replace(/\{\{NOME\}\},?\s*/g, '');
      personalized = personalized.replace(/\{NOME\},?\s*/g, '');
    }
    return personalized;
  }

  private async getMessageVariation(campaignId: number): Promise<string | null> {
    const db = await getDb();
    if (!db) return null;

    const result = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    const campaign = result[0];

    if (!campaign?.messageVariations) {
      return null;
    }

    // Parsing JSON string to array com fallback robusto
    let variations: string[] = [];
    try {
      const parsed = JSON.parse(campaign.messageVariations as string);
      variations = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // Fallback 1: Tenta usar o valor como uma mensagem simples
      const rawValue = String(campaign.messageVariations).trim();
      if (rawValue && rawValue.length > 5) {
        console.warn(`⚠️ messageVariations malformada para campanha ${campaignId}, usando como texto: "${rawValue.substring(0, 50)}..."`);
        variations = [rawValue];
      } else {
        console.warn(`⚠️ Erro ao fazer parse de messageVariations para campanha ${campaignId}:`, e);
        return null;
      }
    }

    if (variations.length === 0) {
      return null;
    }

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

  private generateMessageVariations(prop: any): string[] {
    const priceFormatted = Number(prop.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const denom = prop.denomination || '';
    const city = prop.address?.split(',').pop()?.trim() || 'Açailândia';

    const isChacara = denom.toLowerCase().includes('chacara') || denom.toLowerCase().includes('chácar') || denom.toLowerCase().includes('giuliano');

    // ─── MENSAGENS SEM LINK — o link é enviado como follow-up 1-2 min depois ───

    if (isChacara) {
      return [
        `Oi {{NOME}}! 👋\n\nPassando pra te contar de uma oportunidade aqui em Açailândia que tá chamando muito a atenção.\n\n*${denom}* — chácaras de *~1.000m²*, com privacidade total e natureza ao redor.\n\n💰 Por apenas *R$ ${priceFormatted}*\n\nRestam poucas unidades. Tem interesse em saber mais? 😊`,
        `Boa tarde, {{NOME}}! 🌿\n\nTenho uma opção interessante pra te apresentar: *${denom}*.\n\nSão chácaras de *~1.000m²* em Açailândia, perfeitas pra quem busca tranquilidade ou investimento.\n\n🏷️ Valor: *R$ ${priceFormatted}*\n\nPosso te mandar os detalhes completos?`,
        `{{NOME}}, bom dia! ☀️\n\nVocê já pensou em ter um espaço verde só seu? 🌳\n\n*${denom}* tem chácaras de *~1.000m²* disponíveis em Açailândia por *R$ ${priceFormatted}*.\n\nSão últimas unidades. Quer que eu reserve uma visita?`,
        `Oi {{NOME}}! Tudo bem? 😊\n\nEstou com uma novidade que pode te interessar bastante.\n\n🌿 *${denom}* — Açailândia/MA\n📐 ~1.000m² por chácara\n💰 *R$ ${priceFormatted}*\n\nSe quiser, posso te explicar como funciona o financiamento. É bem acessível!`,
        `{{NOME}}, boa noite! 🌙\n\nSabia que ainda dá pra ter uma chácara em Açailândia com financiamento facilitado?\n\n*${denom}* — lotes de *~1.000m²* por *R$ ${priceFormatted}*\n\nGostaria de conversar sobre as condições?`,
        `Oi {{NOME}}! 👋\n\nTenho algo especial pra te mostrar hoje.\n\n*${denom}* é um condomínio de chácaras exclusivo em Açailândia, com lotes de *~1.000m²* cada.\n\n💰 A partir de *R$ ${priceFormatted}* — com opção de financiamento!\n\nAcontece muito interesse esse mês. Posso te passar mais informações?`,
      ];
    }

    return [
      `Oi {{NOME}}! 👋\n\nTenho uma oportunidade que pode ser exatamente o que você procura.\n\n🏠 *${denom}*\n📍 ${city}\n💰 *R$ ${priceFormatted}*\n\nAinda tem unidades disponíveis. Posso te contar mais?`,
      `Boa tarde, {{NOME}}! 😊\n\nPassando pra apresentar o *${denom}*, um imóvel que tá gerando bastante interesse aqui em ${city}.\n\n💰 Valor: *R$ ${priceFormatted}*\n\nCondições de financiamento bem atrativas. Tem interesse em saber como funciona?`,
      `{{NOME}}, tudo bem? 🙂\n\nEstou com um imóvel disponível em ${city} que achei que vale a pena te mostrar.\n\n*${denom}*\n💰 *R$ ${priceFormatted}*\n\nSeria uma boa hora pra conversar sobre isso?`,
      `Oi {{NOME}}! ☀️\n\nSabia que o *${denom}* em ${city} ainda tem unidades disponíveis?\n\n🏠 Valor: *R$ ${priceFormatted}*\n\nFinanciamento facilitado com parcelas que cabem no seu orçamento.\n\nQuer que eu faça uma simulação pra você?`,
      `Boa noite, {{NOME}}! 🌙\n\nVi que você pode estar buscando um imóvel em ${city}. Tenho uma opção excelente:\n\n🏡 *${denom}*\n💰 *R$ ${priceFormatted}*\n\nPosso te enviar mais detalhes?`,
      `Olá, {{NOME}}! 👋\n\nEstou representando a *Romatec Imóveis* e tenho uma oportunidade em ${city} que pode te interessar.\n\n🏠 *${denom}* — *R$ ${priceFormatted}*\n\nSe quiser, posso agendar uma visita sem compromisso. O que você acha?`,
    ];
  }

  // Gera a mensagem de follow-up com o link (enviada 1-2 min depois)
  private async getPropertyLinkMessage(campaignId: number): Promise<string | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
      const camp = result[0];
      if (!camp?.propertyId) return null;
      const propResult = await db.select().from(properties).where(eq(properties.id, camp.propertyId)).limit(1);
      const prop = propResult[0];
      if (!prop) return null;
      const slug = (prop as any).publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const url = `https://romateccrmwhatsapp-production.up.railway.app/imovel/${slug}`;
      return `📸 *Veja as fotos e detalhes completos aqui:*\n${url}`;
    } catch {
      return null;
    }
  }

  // Auto-ativar/desativar ciclos nos horários programados
  private async autoToggleCycles(brasiliaHour: number) {
    try {
      const db = await getDb();
      if (!db) return;

      if (brasiliaHour === 8) {
        // Ativar ciclo DIA: ligar activeDay em todas as campanhas running (máx 5)
        const running = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
        const toActivate = running.slice(0, 5);
        for (const c of toActivate) {
          await db.update(campaigns).set({ activeDay: true }).where(eq(campaigns.id, c.id));
        }
        console.log(`☀️ [Auto-Ciclo] 08:00 — CICLO DIA INICIADO | ${toActivate.length} campanhas ativadas`);
        this.state.nightMode = false;
      } else if (brasiliaHour === 18) {
        // Encerrar ciclo DIA
        await db.update(campaigns).set({ activeDay: false });
        console.log(`🌆 [Auto-Ciclo] 18:00 — CICLO DIA ENCERRADO`);
      } else if (brasiliaHour === 20) {
        // Ativar ciclo NOITE
        const running = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
        const toActivate = running.slice(0, 5);
        for (const c of toActivate) {
          await db.update(campaigns).set({ activeNight: true }).where(eq(campaigns.id, c.id));
        }
        console.log(`🌙 [Auto-Ciclo] 20:00 — CICLO NOITE INICIADO | ${toActivate.length} campanhas ativadas`);
        this.state.nightMode = true;
      } else if (brasiliaHour === 6) {
        // Encerrar ciclo NOITE
        await db.update(campaigns).set({ activeNight: false });
        console.log(`🌅 [Auto-Ciclo] 06:00 — CICLO NOITE ENCERRADO`);
      }
    } catch (err) {
      console.error('[Auto-Ciclo] Erro:', err);
    }
  }

  // ========== Z-API ==========

  private async sendViaZAPI(phone: string, message: string): Promise<'sent' | 'failed' | 'invalid'> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      let formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Auto-fix: 12 dígitos = número BR antigo sem o 9 (ex: 5599XXXXXXXX → 55999XXXXXXXX)
      if (formattedPhone.length === 12 && formattedPhone.startsWith('55')) {
        formattedPhone = formattedPhone.slice(0, 4) + '9' + formattedPhone.slice(4);
        console.log(`📱 Auto-fix telefone 12→13: ${phone} → ${formattedPhone}`);
      }

      if (formattedPhone.length !== 13 || formattedPhone[4] !== '9') {
        console.warn(`⚠️ Número inválido (${formattedPhone.length}d): ${phone} → pulando`);
        return 'invalid';
      }

      const { getCompanyConfig } = await import('../db');
      const config = await getCompanyConfig();

      if (config?.zApiInstanceId && config?.zApiToken) {
        const { sendMessageViaZAPI } = await import('../zapi-integration');
        const result = await sendMessageViaZAPI({
          instanceId: config.zApiInstanceId,
          token: config.zApiToken,
          clientToken: config.zApiClientToken || undefined,
          phone,
          message,
        });
        console.log(`📨 [Z-API] ${phone}: ${result.success ? '✅' : '❌'}`);
        return result.success ? 'sent' : 'failed';
      } else {
        console.log(`📨 [SIMULADO] ${phone}: "${message.substring(0, 50)}..."`);
        return 'sent';
      }
    } catch (error) {
      console.error('❌ Erro Z-API:', error);
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
      const { getCompanyConfig } = await import('../db');
      const config = await getCompanyConfig();
      if (!config?.zApiInstanceId || !config?.zApiToken) return;

      const hour = this.getCurrentHour();
      const cycleIdx = this.getCurrentCycleIndex();
      const db = await getDb();
      if (!db) return;

      const allCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
      const campIndex = HOUR_TO_CAMP_INDEX[hour] ?? -1;
      const activeCamp = allCampaigns[campIndex % allCampaigns.length];

      const OWNER_PHONE = config.phone || '5599991811246';
      const report = [
        `📊 *RELATÓRIO HORA ${hour}h (Brasília) - ROMATEC CRM v9.0*`,
        `🕐 *${this.getBrasiliaDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}*`,
        ``,
        `🔄 *Ciclo atual:* ${cycleIdx >= 0 ? cycleIdx + 1 : '?'}/10`,
        `📨 *Campanha desta hora:* ${activeCamp?.name || 'Nenhuma'}`,
        `✅ *Enviadas hoje:* ${this.state.totalSent}`,
        `❌ *Falhas:* ${this.state.totalFailed}`,
        ``,
        `${this.state.nightMode ? '🌙 Modo Noite (20h-06h)' : '☀️ Modo Dia (08h-18h)'}`,
      ].join('\n');

      const { sendMessageViaZAPI } = await import('../zapi-integration');
      await sendMessageViaZAPI({
        instanceId: config.zApiInstanceId,
        token: config.zApiToken,
        clientToken: config.zApiClientToken || undefined,
        phone: OWNER_PHONE,
        message: report,
      });
    } catch (e) {
      console.error('❌ Erro ao enviar relatório:', e);
    }
  }

  // ========== GETTERS ==========

  getState() {
    const now = Date.now();
    const uptimeMs = this.state.isRunning ? now - this.state.startedAt : 0;
    const uptimeHours = String(Math.floor(uptimeMs / 3600000)).padStart(2, '0');
    const uptimeMinutes = String(Math.floor((uptimeMs % 3600000) / 60000)).padStart(2, '0');
    const uptimeSeconds = String(Math.floor((uptimeMs % 60000) / 1000)).padStart(2, '0');

    const brasiliaNow = this.getBrasiliaDate();
    const currentMinute = brasiliaNow.getMinutes();
    const currentSecond = brasiliaNow.getSeconds();
    const remainingSeconds = (60 - currentMinute - 1) * 60 + (60 - currentSecond);

    const nextHour = new Date(brasiliaNow);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const nextCycleFormatted = `${String(nextHour.getHours()).padStart(2, '0')}:00`;

    const startedAtFormatted = this.state.startedAt
      ? new Date(this.state.startedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--:--:--';

    const cycleIndex = this.getCurrentCycleIndex();

    const h = brasiliaNow.getHours();
    let systemPhase: 'active_day' | 'active_night' | 'standby' | 'blocked';
    if (h >= 6 && h < 8) systemPhase = 'blocked';
    else if (h >= 8 && h < 18) systemPhase = 'active_day';
    else if (h >= 18 && h < 20) systemPhase = 'standby';
    else systemPhase = 'active_night';

    return {
      isRunning: this.state.isRunning,
      hourNumber: this.state.hourNumber,
      currentHourKey: this.state.currentHourKey,
      nightMode: this.state.nightMode,
      campaignStates: this.state.campaignStates,
      scheduledSlots: this.state.scheduledSlots,
      secondsUntilNextCycle: remainingSeconds,
      cycleDurationSeconds: 3600,
      uptimeFormatted: `${uptimeHours}:${uptimeMinutes}:${uptimeSeconds}`,
      startedAtFormatted,
      nextCycleFormatted,
      currentCycleIndex: cycleIndex,
      totalCycles: 10,
      brasiliaHour: h,
      systemPhase,
    };
  }

  getStats() {
    const sentThisHour = this.state.campaignStates.filter(cs => cs.sentThisHour).length;
    const activeCamps = this.state.campaignStates.length;
    const cycleIndex = this.getCurrentCycleIndex();
    const totalCycles = 10;

    return {
      cycleNumber: this.state.hourNumber,
      currentCycleIndex: cycleIndex,
      totalCycles,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: this.state.totalBlocked,
      messagesThisHour: sentThisHour,
      maxMessagesPerHour: 1,
      maxMessagesThisCycle: activeCamps,
      scheduledSlots: this.state.scheduledSlots,
      cycleProgress: cycleIndex >= 0 ? `${cycleIndex + 1}/${totalCycles}` : 'Fora do horário',
    };
  }
}

export const campaignScheduler = new CampaignScheduler();

// Auto-restore
(async () => {
  try {
    const db = await getDb();
    if (!db) return;
    console.log('🔍 Verificando estado do scheduler no banco...');
    const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
    if (rows[0]?.status === 'running') {
      console.log('🔄 Auto-restaurando scheduler...');
      const json = rows[0].stateJson as any;
      const nightMode = json?.nightMode || false;
      await campaignScheduler.start(nightMode);
    } else {
      console.log('📋 Estado salvo: stopped - scheduler permanece parado');
    }
  } catch (e) {
    console.error('❌ Erro no auto-restore:', e);
  }
})();
