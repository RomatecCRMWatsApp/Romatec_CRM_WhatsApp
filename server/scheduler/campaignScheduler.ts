// @module CampaignScheduler — Orquestrador puro (coordena todos os módulos do scheduler)

/**
 * ROMATEC CRM v9.0 - ROTAÇÃO SEQUENCIAL
 *
 * LÓGICA:
 * - 5 campanhas em rotação sequencial por hora
 * - 08h → Camp1 / 09h → Camp2 / 10h → Camp3 / 11h → Camp4 / 12h → Camp5
 * - 13h → Camp1 / 14h → Camp2 / 15h → Camp3 / 16h → Camp4 / 17h → Camp5
 * - Cada campanha envia 1 msg por hora (ciclo)
 * - Horário: 08h-18h (modo dia) ou 20h-06h (modo noite)
 * - Bloqueio por MAX_ATTEMPTS_NO_RESPONSE sem resposta
 * - Horário sincronizado com Brasília (GMT-3)
 */

import { getDb } from '../db';
import { campaigns, messageSendLog } from '../../drizzle/schema';
import { eq, and, asc } from 'drizzle-orm';
import { saveStateToDB, loadStateFromDB, getDBStatus } from './stateManager';
import { sendViaZAPI, personalizeMessage } from './messageDispatcher';
import {
  getCurrentHour,
  getCurrentHourKey,
  isActiveHour,
  getCurrentCycleIndex,
  getAutoNightMode,
  getCampaignForCurrentHour,
  syncCycleIndexWithCurrentHour,
} from './modules/cycleManager';
import {
  autoToggleCycles,
  fixActiveFlagsForCurrentShift,
  getSystemPhase,
} from './modules/shiftManager';
import {
  calcSlotDelayMs,
  checkCampAlreadySentThisHour,
  checkContactAlreadySentThisHour,
  preSendLog,
  confirmSend,
  recordFailedSend,
  getPropertyLinkMessage,
} from './modules/dispatchManager';
import {
  getNextContact,
  updateContactHistory,
} from './modules/contactManager';
import {
  initCampaignStates,
  syncCampaignsWithProperties,
  fixActiveFlagsForMode,
  getMessageVariation,
} from './modules/resetManager';
import { startFollowUpLoop, stopFollowUpLoop } from './modules/followUpManager';
import { registerBotDispatch } from './modules/qualificationBot';
import { notifyMessageSent } from '../_core/telegramNotification';
import { getBrasiliaDate, formatUptime } from './utils';
import { HOUR_TO_CAMP_INDEX, CHECK_INTERVAL_MS, MAX_HOURS_PER_CYCLE } from './constants';
import type { SchedulerState, SchedulerStateSnapshot, SchedulerStats } from './types/campaign.types';

export class CampaignScheduler {
  private static instance: CampaignScheduler | null = null;
  private static isStarting: boolean = false;

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

  static getInstance(): CampaignScheduler {
    if (!CampaignScheduler.instance) {
      CampaignScheduler.instance = new CampaignScheduler();
    }
    return CampaignScheduler.instance;
  }

  // ========== CONTROLE SINGLETON ==========

  async start(forcedNightMode?: boolean): Promise<void> {
    if (this.state.isRunning || CampaignScheduler.isStarting) {
      console.log('⚠️ [SINGLETON] Scheduler já está rodando/iniciando — ignorando segunda inicialização');
      return;
    }
    CampaignScheduler.isStarting = true;

    try {
      const nightMode = forcedNightMode !== undefined ? forcedNightMode : getAutoNightMode();
      this.state.nightMode = nightMode;
      this.state.isRunning = true;
      this.state.startedAt = Date.now();
      this.state.totalSent = 0;
      this.state.totalFailed = 0;
      this.state.totalBlocked = 0;
      this.state.currentHourKey = '';
      this.state.campaignStates = [];
      this.state.scheduledSlots = [];

      this.state.hourNumber = syncCycleIndexWithCurrentHour(nightMode);

      console.log(`🚀 Iniciando sistema ROMATEC CRM v9.0...`);
      console.log(`📏 REGRA: Rotação sequencial | Ciclo 10h | ${nightMode ? 'Modo Noite 20h-06h' : 'Modo Dia 08h-18h'}`);

      this.cleanupAllTimers();

      await syncCampaignsWithProperties();
      this.state.campaignStates = await initCampaignStates(this.state.campaignStates, nightMode);

      this.state.currentHourKey = getCurrentHourKey();

      if (isActiveHour(nightMode)) {
        await this.scheduleHourSend();
      }

      await saveStateToDB(this.state);
      this.startCheckLoop();
      startFollowUpLoop(() => this.state.isRunning);

      console.log(`✅ Scheduler v9.0 iniciado - Verificação a cada 1 minuto`);
    } finally {
      CampaignScheduler.isStarting = false;
    }
  }

  stop(): void {
    console.log('⏹️ Parando scheduler...');
    this.state.isRunning = false;
    this.cleanupAllTimers();
    stopFollowUpLoop();
    saveStateToDB(this.state).catch(() => {});
    console.log('⏹️ Scheduler COMPLETAMENTE parado');
  }

  /** Restaura estado do DB e retoma se estava rodando (chamado no startup) */
  async restoreAndResume(): Promise<void> {
    if (this.state.isRunning) {
      console.log('🔄 [Restore] Scheduler já rodando — ignorando chamada duplicada');
      return;
    }
    try {
      const savedState = await loadStateFromDB();
      if (savedState) {
        Object.assign(this.state, savedState);
      }

      const dbStatus = await getDBStatus();
      if (dbStatus === 'running') {
        const nightMode = getAutoNightMode();
        const brasiliaHour = getCurrentHour();
        await fixActiveFlagsForCurrentShift(brasiliaHour);
        console.log(`🔄 [Restore] Estado: running | Ciclo ${this.state.hourNumber + 1}/10 | ${nightMode ? 'NOITE' : 'DIA'}`);
        await this.start(nightMode);
      } else {
        console.log('📋 [Restore] Scheduler estava parado — não reiniciado');
      }
    } catch (e) {
      console.error('❌ Erro no restoreAndResume:', e);
    }
  }

  // ========== LOOPS INTERNOS ==========

  private startCheckLoop(): void {
    this.checkTimer = setInterval(async () => {
      if (!this.state.isRunning) return;
      await this.checkAndSend();
    }, CHECK_INTERVAL_MS);
  }

  private cleanupAllTimers(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    for (const timer of this.slotTimers) clearTimeout(timer);
    this.slotTimers = [];
  }

  // ========== LÓGICA PRINCIPAL ==========

  private async checkAndSend(): Promise<void> {
    if (!this.state.isRunning) return;

    const currentHourKey = getCurrentHourKey();

    if (currentHourKey !== this.state.currentHourKey) {
      this.state.currentHourKey = currentHourKey;

      const brasiliaHour = parseInt(currentHourKey.split('-')[3], 10);
      await autoToggleCycles(brasiliaHour, (v) => { this.state.nightMode = v; });

      const cycleIdx = getCurrentCycleIndex(this.state.nightMode);
      if (cycleIdx >= 0) {
        this.state.hourNumber = cycleIdx;
        console.log(`\n🕐 === NOVA HORA (Brasília): ${currentHourKey} | Ciclo ${this.state.hourNumber + 1}/10 ===`);
      } else {
        console.log(`\n🕐 === NOVA HORA (Brasília): ${currentHourKey} | FORA DO HORÁRIO ATIVO ===`);
        return;
      }

      this.state.campaignStates = this.state.campaignStates.map(cs => ({ ...cs, sentThisHour: false }));
      this.state.scheduledSlots = [];
      for (const timer of this.slotTimers) clearTimeout(timer);
      this.slotTimers = [];

      if (!isActiveHour(this.state.nightMode)) {
        console.log(`😴 Fora do horário ativo — aguardando próxima hora`);
        await saveStateToDB(this.state);
        return;
      }

      await syncCampaignsWithProperties();
      this.state.campaignStates = await initCampaignStates(this.state.campaignStates, this.state.nightMode);
      await this.scheduleHourSend();
      await saveStateToDB(this.state);
      await this.sendCycleReport();
    }

    if (!this.state.currentHourKey || this.state.currentHourKey === '') {
      this.state.currentHourKey = currentHourKey;
      if (isActiveHour(this.state.nightMode)) {
        this.state.campaignStates = await initCampaignStates(this.state.campaignStates, this.state.nightMode);
        await this.scheduleHourSend();
        await saveStateToDB(this.state);
      }
    }
  }

  // ========== AGENDAMENTO DO SLOT ==========

  private async scheduleHourSend(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    const hour = getCurrentHour();
    const campIndex = HOUR_TO_CAMP_INDEX[hour];

    await fixActiveFlagsForMode(this.state.nightMode);

    const allCampaigns = await db.select().from(campaigns)
      .where(eq(campaigns.status, 'running'))
      .orderBy(asc(campaigns.id));

    console.log(`📋 [Slot ${hour}h] Índice esperado: ${campIndex} | Campanhas running: ${allCampaigns.length} | Modo: ${this.state.nightMode ? 'NOITE' : 'DIA'}`);

    let campaign = getCampaignForCurrentHour(allCampaigns, this.state.nightMode);
    const activePeriod = this.state.nightMode ? 'activeNight' : 'activeDay';

    if (!campaign && campIndex !== undefined) {
      for (let offset = 1; offset < allCampaigns.length; offset++) {
        const tryIdx = (campIndex + offset) % allCampaigns.length;
        const candidate = allCampaigns[tryIdx];
        if (candidate?.status === 'running' && (candidate as any)[activePeriod]) {
          campaign = candidate;
          console.log(`🔄 [Slot ${hour}h] Campanha primária indisponível → fallback índice ${tryIdx}: ${candidate.name}`);
          break;
        }
      }
    }

    if (!campaign) {
      console.log(`⚠️ [Slot ${hour}h] SLOT VAZIO — nenhuma campanha elegível`);
      return;
    }

    console.log(`📤 Hora ${hour}h → Campanha: ${campaign.name}`);

    const campState = this.state.campaignStates.find(cs => cs.campaignId === campaign!.id);
    if (campState?.sentThisHour) {
      console.log(`✅ ${campaign.name} já enviou nesta hora — pulando agendamento`);
      return;
    }

    const scheduleCycleHour = Math.floor(Date.now() / 3600000);
    if (await checkCampAlreadySentThisHour(db, campaign.id, scheduleCycleHour)) {
      console.log(`🔒 [Schedule Guard DB] ${campaign.name}: já agendado/enviado no banco — pulando`);
      const cs = this.state.campaignStates.find(s => s.campaignId === campaign!.id);
      if (cs) cs.sentThisHour = true;
      return;
    }

    const { delayMs, randomMinute } = calcSlotDelayMs();
    const slot = { campaignId: campaign.id, campaignName: campaign.name, minuteLabel: randomMinute, sent: false };
    this.state.scheduledSlots = [slot];

    const sendInLabel = delayMs < 60000 ? `${Math.round(delayMs / 1000)}s` : `${Math.round(delayMs / 60000)}min`;
    console.log(`🎲 ${campaign.name} → envio aleatório no minuto ${randomMinute} (em ${sendInLabel})`);
    console.log(`   ⏱️ Fluxo: 15min envio + 45min qualificação = 60min/hora`);

    const timer = setTimeout(async () => {
      if (!this.state.isRunning) return;
      const cs = this.state.campaignStates.find(s => s.campaignId === campaign!.id);
      if (cs?.sentThisHour) {
        console.log(`⚠️ [Timer ${hour}h] ${campaign!.name}: já enviou nesta hora — cancelando`);
        return;
      }
      const dispatchCycleHour = Math.floor(Date.now() / 3600000);
      const dbCheck = await getDb().then(d => d?.select({ status: messageSendLog.status })
        .from(messageSendLog)
        .where(and(eq(messageSendLog.campaignId, campaign!.id), eq(messageSendLog.cycleHour, dispatchCycleHour), eq(messageSendLog.status, 'sent')))
        .limit(1));
      if (dbCheck && dbCheck.length > 0) {
        console.log(`⚠️ [Timer ${hour}h] ${campaign!.name}: 'sent' no DB — cancelando (processo concorrente enviou)`);
        if (cs) cs.sentThisHour = true;
        return;
      }
      console.log(`⏰ [Timer ${hour}h] ${campaign!.name}: disparando envio agora`);
      await this.sendMessageForCampaign(campaign!.id);
    }, delayMs);

    this.slotTimers.push(timer);
    await saveStateToDB(this.state);
  }

  // ========== ENVIO DE MENSAGEM ==========

  private async sendMessageForCampaign(campaignId: number): Promise<void> {
    if (this.isSending) {
      console.log(`⚠️ [Send] isSending=true — slot bloqueado. Hora: ${getCurrentHour()}h`);
      return;
    }
    this.isSending = true;
    console.log(`🚀 [Send] Campanha ${campaignId}: iniciando (hora ${getCurrentHour()}h, ciclo ${this.state.hourNumber + 1}/10)`);

    try {
      const db = await getDb();
      if (!db) return;

      const campResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
      const campaign = campResult[0];
      if (!campaign) {
        console.log(`⚠️ [Send] Campanha ${campaignId} não encontrada`);
        return;
      }

      const campState = this.state.campaignStates.find(cs => cs.campaignId === campaignId);
      if (campState?.sentThisHour) {
        console.log(`⚠️ PROTEÇÃO: ${campaign.name} já enviou nesta hora`);
        return;
      }

      const contact = await getNextContact(campaignId);
      if (!contact) {
        console.log(`⚠️ ${campaign.name}: sem contatos disponíveis`);
        return;
      }

      const cleanPhoneStr = contact.phone.replace(/\D/g, '');
      const cycleHour = Math.floor(Date.now() / 3600000);
      const hourLabel = new Date(cycleHour * 3600000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      if (await checkCampAlreadySentThisHour(db, campaignId, cycleHour)) {
        console.log(`⚠️ PROTEÇÃO DB: ${campaign.name} já enviou nesta hora (${hourLabel})`);
        if (campState) { campState.sentThisHour = true; campState.lastSentHourKey = this.state.currentHourKey; }
        return;
      }

      if (await checkContactAlreadySentThisHour(db, cleanPhoneStr, cycleHour)) {
        console.log(`⏭️ ${campaign.name} → ${contact.name}: JÁ RECEBEU MENSAGEM NESTA HORA (${hourLabel})`);
        return;
      }

      const messageText = await getMessageVariation(campaignId, this.lastVariationIndex);
      if (!messageText) {
        console.log(`⚠️ ${campaign.name}: sem variações de mensagem`);
        return;
      }

      const linkMsg = await getPropertyLinkMessage(campaignId);
      const fullText = linkMsg ? `${messageText}\n\n${linkMsg}` : messageText;
      const personalized = personalizeMessage(fullText, contact);

      await preSendLog(db, cleanPhoneStr, campaignId, cycleHour);

      console.log(`\n📨 Enviando: ${campaign.name} → ${contact.name} (${contact.phone})`);

      const result = await sendViaZAPI(contact.phone, personalized, async () => {
        this.stop();
      });

      if (result === 'sent') {
        await confirmSend({
          db,
          campaign,
          contact,
          cleanPhone: cleanPhoneStr,
          personalized,
          cycleHour,
          state: this.state,
          onMarkSent: (id) => {
            const cs = this.state.campaignStates.find(s => s.campaignId === id);
            if (cs) { cs.sentThisHour = true; cs.lastSentHourKey = this.state.currentHourKey; }
            this.state.totalSent++;
          },
          onMarkSlotSent: (id) => {
            const slot = this.state.scheduledSlots.find(s => s.campaignId === id);
            if (slot) slot.sent = true;
          },
        });

        await registerBotDispatch(contact.phone, contact.name || '', campaignId, personalized);
        await updateContactHistory(contact.id, campaignId);
      } else if (result === 'failed') {
        this.state.totalFailed++;
        await recordFailedSend({ db, campaign, contact, cleanPhone: cleanPhoneStr, personalized, cycleHour, reason: 'zapi_error' });
        console.log(`❌ Falha no envio`);
      } else {
        await recordFailedSend({ db, campaign, contact, cleanPhone: cleanPhoneStr, personalized, cycleHour, reason: 'invalid_phone' });
      }

      await saveStateToDB(this.state);
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
    } finally {
      this.isSending = false;
    }
  }

  // ========== RELATÓRIO ==========

  private async sendCycleReport(): Promise<void> {
    try {
      const { getCompanyConfig } = await import('../db');
      const config = await getCompanyConfig();
      if (!config?.zApiInstanceId || !config?.zApiToken) return;

      const hour = getCurrentHour();
      const cycleIdx = getCurrentCycleIndex(this.state.nightMode);
      const db = await getDb();
      if (!db) return;

      const allCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
      const campIndex = HOUR_TO_CAMP_INDEX[hour] ?? -1;
      const activeCamp = allCampaigns[campIndex % allCampaigns.length];
      const OWNER_PHONE = config.phone || '5599991811246';

      const report = [
        `📊 *RELATÓRIO HORA ${hour}h (Brasília) - ROMATEC CRM v9.0*`,
        `🕐 *${getBrasiliaDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}*`,
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

  // ========== GETTERS PÚBLICOS ==========

  getState(): SchedulerStateSnapshot {
    const now = Date.now();
    const uptimeMs = this.state.isRunning ? now - this.state.startedAt : 0;
    const brasiliaNow = getBrasiliaDate();
    const currentMinute = brasiliaNow.getMinutes();
    const currentSecond = brasiliaNow.getSeconds();
    const remainingSeconds = (60 - currentMinute - 1) * 60 + (60 - currentSecond);

    const nextHour = new Date(brasiliaNow);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);

    const h = brasiliaNow.getHours();
    const cycleIndex = getCurrentCycleIndex(this.state.nightMode);

    return {
      isRunning: this.state.isRunning,
      hourNumber: this.state.hourNumber,
      currentHourKey: this.state.currentHourKey,
      nightMode: this.state.nightMode,
      campaignStates: this.state.campaignStates,
      scheduledSlots: this.state.scheduledSlots,
      secondsUntilNextCycle: remainingSeconds,
      cycleDurationSeconds: 3600,
      uptimeFormatted: formatUptime(uptimeMs),
      startedAtFormatted: this.state.startedAt
        ? new Date(this.state.startedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '--:--:--',
      nextCycleFormatted: `${String(nextHour.getHours()).padStart(2, '0')}:00`,
      currentCycleIndex: cycleIndex,
      totalCycles: MAX_HOURS_PER_CYCLE,
      brasiliaHour: h,
      systemPhase: getSystemPhase(h),
    };
  }

  getStats(): SchedulerStats {
    const sentThisHour = this.state.campaignStates.filter(cs => cs.sentThisHour).length;
    const cycleIndex = getCurrentCycleIndex(this.state.nightMode);

    return {
      cycleNumber: this.state.hourNumber,
      currentCycleIndex: cycleIndex,
      totalCycles: MAX_HOURS_PER_CYCLE,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: this.state.totalBlocked,
      messagesThisHour: sentThisHour,
      maxMessagesPerHour: 1,
      maxMessagesThisCycle: this.state.campaignStates.length,
      scheduledSlots: this.state.scheduledSlots,
      cycleProgress: cycleIndex >= 0 ? `${cycleIndex + 1}/${MAX_HOURS_PER_CYCLE}` : 'Fora do horário',
    };
  }
}

export const campaignScheduler = CampaignScheduler.getInstance();
// SINGLETON: restoreAndResume() + dailyScheduler compartilham a mesma instância
// Evita race condition de dupla inicialização — start() retorna silenciosamente se já rodando
