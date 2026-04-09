import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties, schedulerState as schedulerStateTable } from "../../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { registerBotMessage, getFollowUpsToSend, cleanupOldFollowUps } from "../bot-ai";

/**
 * SCHEDULER ROMATEC v8.0 - ROTAÇÃO SEQUENCIAL 08h-18h
 *
 * - Ciclo de 10 horas: 08h às 18h
 * - A cada hora, UMA campanha envia (rotação sequencial)
 * - 5 campanhas × 2 rodadas = 10 horas por dia
 * - Hora 1→camp0, Hora 2→camp1, ..., Hora 5→camp4, Hora 6→camp0 (2ª rodada)...
 * - Cada campanha envia EXATAMENTE 2 mensagens por dia
 * - Fora do horário (18h-08h): nada é enviado
 * - Bloqueio de 72h por contato
 */

const HORA_INICIO = 8;
const HORA_FIM = 18;
const TOTAL_HORAS = HORA_FIM - HORA_INICIO;
const OWNER_PHONE = '5599991811246';

interface SchedulerState {
  isRunning: boolean;
  currentCampaignIndex: number;
  currentRound: number;
  totalSent: number;
  totalFailed: number;
  startedAt: number;
  currentHourKey: string;
  campaignOrder: number[];
  scheduledSlots: { campaignName: string; minuteLabel: number; sent: boolean }[];
  lastSentCampaignName: string;
  lastSentAt: number;
}

class CampaignScheduler {
  private state: SchedulerState = {
    isRunning: false,
    currentCampaignIndex: 0,
    currentRound: 1,
    totalSent: 0,
    totalFailed: 0,
    startedAt: Date.now(),
    currentHourKey: '',
    campaignOrder: [],
    scheduledSlots: [],
    lastSentCampaignName: '',
    lastSentAt: 0,
  };

  private checkTimer: NodeJS.Timeout | null = null;
  private slotTimer: NodeJS.Timeout | null = null;
  private followUpTimer: NodeJS.Timeout | null = null;
  private isSending: boolean = false;
  private lastVariationIndex: Map<number, number> = new Map();

  private getCurrentHourKey(): string {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}`;
  }

  private getCurrentHourBR(): number {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours();
  }

  private isWithinOperatingHours(): boolean {
    const h = this.getCurrentHourBR();
    return h >= HORA_INICIO && h < HORA_FIM;
  }

  async saveStateToDB() {
    try {
      const db = await getDb();
      if (!db) return;
      const status = this.state.isRunning ? 'running' : 'stopped';
      const stateJson = { ...this.state };
      const dataToSave = {
        status: status as 'stopped'|'running'|'paused',
        currentPairIndex: this.state.currentCampaignIndex,
        cycleNumber: this.state.currentRound,
        messagesThisCycle: this.state.totalSent,
        startedAt: this.state.startedAt ? new Date(this.state.startedAt) : null,
        cycleStartedAt: new Date(),
        stateJson,
      };
      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      if (rows.length === 0) {
        await db.insert(schedulerStateTable).values({ id: 1, ...dataToSave });
      } else {
        await db.update(schedulerStateTable).set(dataToSave).where(eq(schedulerStateTable.id, 1));
      }
    } catch (e) { console.error('Erro ao salvar estado:', e); }
  }

  async restoreAndResume() {
    try {
      const db = await getDb();
      if (!db) return;
      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      const saved = rows[0];
      if (!saved || saved.status !== 'running') return;
      console.log('🔄 AUTO-RESTART scheduler...');
      const s = (saved.stateJson || {}) as any;
      this.state = { ...this.state, ...s, isRunning: true, startedAt: saved.startedAt ? saved.startedAt.getTime() : Date.now() };
      await this.syncCampaignOrder();
      this.startCheckLoop();
      this.startFollowUpLoop();
      await this.saveStateToDB();
      console.log(`✅ Restaurado: camp[${this.state.currentCampaignIndex}] rodada ${this.state.currentRound}`);
    } catch (e) { console.error('Erro ao restaurar:', e); }
  }

  async start() {
    if (this.state.isRunning) { this.stop(); await new Promise(r => setTimeout(r, 500)); }
    console.log('🚀 Scheduler v8.0 — Rotação 08h-18h');
    this.state = {
      isRunning: true, currentCampaignIndex: 0, currentRound: 1,
      totalSent: 0, totalFailed: 0, startedAt: Date.now(),
      currentHourKey: '', campaignOrder: [], scheduledSlots: [],
      lastSentCampaignName: '', lastSentAt: 0,
    };
    this.lastVariationIndex.clear();
    await this.syncCampaignOrder();
    await this.assignContactsToAllCampaigns();
    console.log(`📋 Campanhas: [${this.state.campaignOrder.join(' → ')}]`);
    console.log(`⏰ Operando das ${HORA_INICIO}h às ${HORA_FIM}h`);
    this.startCheckLoop();
    this.startFollowUpLoop();
    await this.checkAndSend();
    await this.saveStateToDB();
  }

  stop() {
    this.state.isRunning = false;
    this.isSending = false;
    if (this.slotTimer) { clearTimeout(this.slotTimer); this.slotTimer = null; }
    if (this.checkTimer) { clearInterval(this.checkTimer); this.checkTimer = null; }
    if (this.followUpTimer) { clearInterval(this.followUpTimer); this.followUpTimer = null; }
    this.state.scheduledSlots = [];
    this.saveStateToDB().catch(console.error);
    console.log('⏹️ Scheduler parado.');
  }

  private startCheckLoop() {
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(async () => {
      if (!this.state.isRunning) return;
      await this.checkAndSend();
    }, 60 * 1000);
  }

  private async checkAndSend() {
    if (!this.state.isRunning) return;
    const currentHour = this.getCurrentHourKey();
    const hourBR = this.getCurrentHourBR();

    if (!this.isWithinOperatingHours()) {
      if (hourBR === HORA_FIM && currentHour !== this.state.currentHourKey) {
        await this.resetDailyCycle();
      }
      return;
    }

    if (currentHour === this.state.currentHourKey) {
      if (!this.slotTimer && this.state.scheduledSlots.length === 0) {
        await this.scheduleCurrentHour();
      }
      return;
    }

    console.log(`\n🕐 NOVA HORA: ${hourBR}h`);
    this.state.currentHourKey = currentHour;
    if (this.slotTimer) { clearTimeout(this.slotTimer); this.slotTimer = null; }
    this.state.scheduledSlots = [];
    await this.scheduleCurrentHour();
    await this.saveStateToDB();
  }

  private async scheduleCurrentHour() {
    if (this.state.campaignOrder.length === 0) {
      await this.syncCampaignOrder();
      if (this.state.campaignOrder.length === 0) return;
    }

    const campaignId = this.state.campaignOrder[this.state.currentCampaignIndex];
    if (!campaignId) return;

    const db = await getDb();
    if (!db) return;

    const campResult = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    const campaign = campResult[0];
    if (!campaign || campaign.status !== 'running') {
      console.log(`⚠️ Campanha ${campaignId} inativa — avançando`);
      this.advanceCampaignIndex();
      return;
    }

    const now = new Date();
    const minutesLeft = 60 - now.getMinutes() - 3;
    const delayMinutes = minutesLeft <= 2 ? 1 : 2 + Math.floor(Math.random() * Math.min(minutesLeft - 2, 50));
    const delayMs = delayMinutes * 60 * 1000;

    console.log(`📨 [${this.getCurrentHourBR()}h] ${campaign.name} → em ${delayMinutes}min (rodada ${this.state.currentRound})`);

    this.state.scheduledSlots = [{ campaignName: campaign.name, minuteLabel: delayMinutes, sent: false }];

    const campIdToSend = campaignId;
    this.slotTimer = setTimeout(async () => {
      if (!this.state.isRunning || !this.isWithinOperatingHours()) return;

      // Anti-duplicata
      const hourStart = new Date(); hourStart.setMinutes(0, 0, 0);
      const sentInDb = await db.select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(eq(messages.campaignId, campIdToSend), eq(messages.status, 'sent'), gte(messages.sentAt, hourStart)));
      if ((sentInDb[0]?.count || 0) > 0) {
        console.log(`🛑 ${campaign.name}: já enviou esta hora — avançando`);
        this.advanceCampaignIndex();
        this.state.scheduledSlots = [];
        await this.saveStateToDB();
        return;
      }

      const campFresh = await db.select().from(campaigns).where(eq(campaigns.id, campIdToSend)).limit(1);
      if (!campFresh[0] || campFresh[0].status !== 'running') {
        this.advanceCampaignIndex();
        this.state.scheduledSlots = [];
        return;
      }

      await this.sendMessageForCampaign(campFresh[0]);
      if (this.state.scheduledSlots[0]) this.state.scheduledSlots[0].sent = true;
      this.advanceCampaignIndex();
      this.slotTimer = null;
      await this.saveStateToDB();
    }, delayMs);
  }

  private advanceCampaignIndex() {
    const total = this.state.campaignOrder.length;
    if (total === 0) return;
    this.state.currentCampaignIndex++;
    if (this.state.currentCampaignIndex >= total) {
      this.state.currentCampaignIndex = 0;
      this.state.currentRound++;
      console.log(`🔄 Rodada ${this.state.currentRound} — voltando para camp[0]`);
    }
  }

  private async resetDailyCycle() {
    console.log(`\n🌙 FIM DO DIA — Resetando ciclo`);
    this.state.currentHourKey = this.getCurrentHourKey();
    this.state.currentCampaignIndex = 0;
    this.state.currentRound = 1;
    this.state.scheduledSlots = [];
    await this.assignContactsToAllCampaigns();
    await this.saveStateToDB();
    await this.sendDailyReport();
    console.log(`✅ Ciclo resetado — começa amanhã às ${HORA_INICIO}h`);
  }

  async syncCampaignOrder() {
    const db = await getDb();
    if (!db) return;
    const running = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
    const valid = running.filter(c => !c.name.startsWith('TESTE'));
    const newIds = valid.map(c => c.id);
    const newIdSet = new Set(newIds);
    const ordered = this.state.campaignOrder.filter(id => newIdSet.has(id));
    for (const id of newIds) { if (!ordered.includes(id)) ordered.push(id); }
    this.state.campaignOrder = ordered;
    console.log(`📋 Ordem: [${ordered.map(id => valid.find(c=>c.id===id)?.name||id).join(' → ')}]`);
  }

  async syncCampaignsWithProperties() {
    const db = await getDb();
    if (!db) return;
    const activeProps = await db.select().from(properties).where(eq(properties.status, 'available'));
    const existingCamps = await db.select().from(campaigns);
    const existingPropIds = existingCamps.map(c => c.propertyId);
    for (const prop of activeProps) {
      if (!existingPropIds.includes(prop.id)) {
        const result = await db.insert(campaigns).values({
          propertyId: prop.id, name: prop.denomination,
          messageVariations: this.generateMessageVariations(prop),
          totalContacts: 2, sentCount: 0, failedCount: 0,
          messagesPerHour: 1, status: 'running', startDate: new Date(),
        });
        await this.assignContactsToCampaign(Number(result[0].insertId), 2);
      }
    }
    const activePropIds = activeProps.map(p => p.id);
    for (const camp of existingCamps) {
      if (!activePropIds.includes(camp.propertyId) && camp.status === 'running') {
        await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, camp.id));
      } else if (activePropIds.includes(camp.propertyId) && camp.status === 'paused') {
        await db.update(campaigns).set({ status: 'running' }).where(eq(campaigns.id, camp.id));
      }
    }
    await this.syncCampaignOrder();
  }

  private async assignContactsToAllCampaigns() {
    const db = await getDb();
    if (!db) return;
    const running = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
    for (const camp of running) {
      if (camp.name.startsWith('TESTE')) continue;
      const pending = await db.select().from(campaignContacts)
        .where(and(eq(campaignContacts.campaignId, camp.id), eq(campaignContacts.status, 'pending')));
      if (pending.length >= 2) continue;
      await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
      await this.assignContactsToCampaign(camp.id, 2);
    }
  }

  private async assignContactsToCampaign(campaignId: number, count = 2) {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const all = await db.select().from(contacts).where(eq(contacts.status, 'active'));
    const available = all.filter(c => !c.blockedUntil || c.blockedUntil <= now);
    const selected = [...available].sort(() => Math.random() - 0.5).slice(0, count);
    for (const c of selected) {
      await db.insert(campaignContacts).values({ campaignId, contactId: c.id, messagesSent: 0, status: 'pending' });
    }
    console.log(`📱 ${selected.length} contatos → campanha ${campaignId}`);
  }

  private personalizeMessage(text: string, contact: { name: string }): string {
    const firstName = (contact.name || '').split(' ')[0].trim();
    return firstName && firstName.length > 1
      ? text.replace(/{{NOME}}/g, firstName)
      : text.replace(/{{NOME}},?\s*/g, '');
  }

  private async sendMessageForCampaign(campaign: any) {
    if (this.isSending) {
      let w = 0;
      while (this.isSending && w < 30) { await new Promise(r => setTimeout(r, 1000)); w++; }
      if (this.isSending) return;
    }
    this.isSending = true;
    try {
      const db = await getDb();
      if (!db) { this.isSending = false; return; }
      const contact = await this.getNextContact(campaign.id);
      if (!contact) {
        console.warn(`⚠️ Sem contatos para ${campaign.name}`);
        await this.assignContactsToCampaign(campaign.id, 2);
        this.state.totalFailed++;
        return;
      }
      const raw = await this.getMessageVariation(campaign.id);
      if (!raw) { this.state.totalFailed++; return; }
      const msg = this.personalizeMessage(raw, contact);
      const result = await this.sendViaZAPI(contact.phone, msg);
      if (result === 'invalid') {
        await db.update(campaignContacts).set({ status: 'failed' })
          .where(and(eq(campaignContacts.campaignId, campaign.id), eq(campaignContacts.contactId, contact.id)));
        return;
      }
      if (result === 'sent') {
        const blockedUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await db.update(contacts).set({ blockedUntil }).where(eq(contacts.id, contact.id));
        await db.update(campaignContacts).set({ status: 'sent', messagesSent: 1 })
          .where(and(eq(campaignContacts.campaignId, campaign.id), eq(campaignContacts.contactId, contact.id)));
        await db.update(campaigns).set({ sentCount: (campaign.sentCount||0)+1 }).where(eq(campaigns.id, campaign.id));
        await db.insert(messages).values({ campaignId: campaign.id, contactId: contact.id, propertyId: campaign.propertyId, message: msg, status: 'sent', sentAt: new Date() });
        await registerBotMessage(contact.phone, msg);
        await this.updateContactHistory(contact.id, campaign.id);
        this.state.totalSent++;
        this.state.lastSentCampaignName = campaign.name;
        this.state.lastSentAt = Date.now();
        console.log(`✅ [${campaign.name}] → ${contact.name} | Total: ${this.state.totalSent}`);
      } else {
        await db.update(campaignContacts).set({ status: 'failed' })
          .where(and(eq(campaignContacts.campaignId, campaign.id), eq(campaignContacts.contactId, contact.id)));
        await db.update(campaigns).set({ failedCount: (campaign.failedCount||0)+1 }).where(eq(campaigns.id, campaign.id));
        this.state.totalFailed++;
      }
    } catch (e) { console.error('Erro no envio:', e); this.state.totalFailed++; }
    finally { this.isSending = false; }
  }

  private async getNextContact(campaignId: number) {
    const db = await getDb();
    if (!db) return null;
    const pending = await db.select().from(campaignContacts)
      .where(and(eq(campaignContacts.campaignId, campaignId), eq(campaignContacts.status, 'pending')));
    const now = new Date();
    for (const cc of pending) {
      const r = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
      const c = r[0];
      if (!c || (c.blockedUntil && c.blockedUntil > now)) continue;
      return c;
    }
    return null;
  }

  private async getMessageVariation(campaignId: number): Promise<string|null> {
    const db = await getDb();
    if (!db) return null;
    const r = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    const camp = r[0];
    if (!camp?.messageVariations || !(camp.messageVariations as string[]).length) return null;
    const vars = camp.messageVariations as string[];
    const last = this.lastVariationIndex.get(campaignId) ?? -1;
    let idx = 0;
    if (vars.length > 1) { do { idx = Math.floor(Math.random()*vars.length); } while (idx === last); }
    this.lastVariationIndex.set(campaignId, idx);
    return vars[idx];
  }

  private async sendViaZAPI(phone: string, message: string): Promise<'sent'|'failed'|'invalid'> {
    try {
      const clean = phone.replace(/\D/g, '');
      const fmt = clean.startsWith('55') ? clean : `55${clean}`;
      if (fmt.length !== 13 || fmt[4] !== '9') return 'invalid';
      const { getCompanyConfig } = await import('../db');
      const config = await getCompanyConfig();
      if (config?.zApiInstanceId && config?.zApiToken) {
        const { sendMessageViaZAPI } = await import('../zapi-integration');
        const r = await sendMessageViaZAPI({ instanceId: config.zApiInstanceId, token: config.zApiToken, clientToken: config.zApiClientToken||undefined, phone, message });
        return r.success ? 'sent' : 'failed';
      }
      console.log(`📨 [SIMULADO] ${phone}: "${message.substring(0,50)}..."`);
      return 'sent';
    } catch (e) { console.error('Erro Z-API:', e); return 'failed'; }
  }

  private async updateContactHistory(contactId: number, campaignId: number) {
    const db = await getDb();
    if (!db) return;
    const ex = await db.select().from(contactCampaignHistory)
      .where(and(eq(contactCampaignHistory.contactId, contactId), eq(contactCampaignHistory.campaignId, campaignId))).limit(1);
    if (ex[0]) {
      await db.update(contactCampaignHistory).set({ lastCampaignId: campaignId, sentAt: new Date() }).where(eq(contactCampaignHistory.id, ex[0].id));
    } else {
      await db.insert(contactCampaignHistory).values({ contactId, campaignId, lastCampaignId: campaignId, sentAt: new Date() });
    }
  }

  private generateMessageVariations(prop: any): string[] {
    const price = Number(prop.price).toLocaleString('pt-BR');
    const slug = prop.publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `https://romateccrmwhatsapp-production.up.railway.app/imovel/${slug}`;
    const name = prop.denomination || '';
    const isChacara = name.toLowerCase().includes('chacara') || name.toLowerCase().includes('chácar') || name.toLowerCase().includes('giuliano');

    if (isChacara) {
      return [
        `🌿 {{NOME}}, *${name}* - Chácaras em Açailândia!\n\n🏡 ~1.000m² por *R$ ${price}*\n⚠️ *Restam 3 unidades!*\n\n📸 ${url}\n\nGarante a sua!`,
        `{{NOME}}, *${name}*! 🌳\n\n~1.000m² | *R$ ${price}*\n🚨 *Apenas 3 disponíveis!*\n\n👉 ${url}\n\nNão perca!`,
        `🔥 {{NOME}}, OPORTUNIDADE!\n\n*${name}* - R$ ${price}\n⚠️ 3 de 6 já vendidas!\n\n📲 ${url}\n\nResponde "SIM"!`,
        `⏰ {{NOME}}, últimas unidades!\n\n*${name}*: ~1.000m² | *R$ ${price}*\n\n📸 ${url}\n\nMe chama!`,
        `💎 {{NOME}}, chácara dos sonhos!\n\n*${name}* | *R$ ${price}*\n🔴 Restam só 3!\n\n👉 ${url}\n\nNão deixe pra depois!`,
        `🆕 {{NOME}}, condomínio exclusivo!\n\n*${name}*: ~1.000m² | *R$ ${price}*\n🚨 Últimas unidades!\n\n📲 ${url}\n\nTem interesse?`,
      ];
    }

    return [
      `🏠 {{NOME}}, *${name}* - Oportunidade!\n\nValor: *R$ ${price}*\n📍 ${prop.address}\n\n📸 ${url}\n\nPosso te ajudar?`,
      `{{NOME}}, você conhece *${name}*? 🔑\n\n💰 *R$ ${price}* | ${prop.address}\n\n👉 ${url}\n\nPosso reservar visita?`,
      `🔥 {{NOME}}, OPORTUNIDADE REAL!\n\n*${name}* | *R$ ${price}*\n✅ Financiamento disponível\n\n👉 ${url}\n\nResponde "SIM"!`,
      `⏰ {{NOME}}, última chance!\n\n*${name}* - *R$ ${price}*\n\n📸 ${url}\n\nGarante sua visita!`,
      `🏡 {{NOME}}, imagine morar aqui...\n\n*${name}* - ${prop.address}\n💰 *R$ ${price}*\n\n🔗 ${url}\n\nVamos conversar?`,
      `📊 {{NOME}}, *${name}* com alta procura!\n\n💰 *R$ ${price}*\n\n🔗 ${url}\n\nMe chama!`,
    ];
  }

  private async sendDailyReport() {
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const allCamps = await db.select().from(campaigns);
      const stats: string[] = [];
      for (const c of allCamps) {
        const cc = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, c.id));
        stats.push(`  • ${c.name}: ${cc.filter(x=>x.status==='sent').length} enviadas`);
      }
      const report = [`📊 *RELATÓRIO DIÁRIO - ROMATEC*`, `📅 ${now.toLocaleDateString('pt-BR')}`, ``, `✅ Enviadas: ${this.state.totalSent}`, `❌ Falhas: ${this.state.totalFailed}`, ``, ...stats, ``, `🚀 Novo ciclo às ${HORA_INICIO}h!`].join('\n');
      await this.sendViaZAPI(OWNER_PHONE, report);
    } catch (e) { console.error('Erro relatório:', e); }
  }

  private startFollowUpLoop() {
    if (this.followUpTimer) clearInterval(this.followUpTimer);
    this.followUpTimer = setInterval(async () => {
      if (!this.state.isRunning) return;
      try {
        const fus = getFollowUpsToSend();
        for (const fu of fus) {
          await new Promise(r => setTimeout(r, 30000));
          await this.sendViaZAPI(fu.phone, fu.message);
        }
        cleanupOldFollowUps();
      } catch (e) { console.error('Erro follow-up:', e); }
    }, 5 * 60 * 1000);
  }

  getState() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const h = now.getHours();
    const isOperating = h >= HORA_INICIO && h < HORA_FIM;
    const remaining = (60 - now.getMinutes() - 1) * 60 + (60 - now.getSeconds());
    const uptimeMs = Date.now() - this.state.startedAt;
    const uh = String(Math.floor(uptimeMs/3600000)).padStart(2,'0');
    const um = String(Math.floor((uptimeMs%3600000)/60000)).padStart(2,'0');
    const us = String(Math.floor((uptimeMs%60000)/1000)).padStart(2,'0');
    const total = this.state.campaignOrder.length;

    return {
      ...this.state,
      isOperating, hourBR: h,
      horaAtualCiclo: isOperating ? h - HORA_INICIO + 1 : 0,
      totalHorasCiclo: TOTAL_HORAS,
      messagesThisHour: this.state.scheduledSlots.filter(s=>s.sent).length,
      maxMessagesPerHour: 1,
      messagesThisCycle: this.state.totalSent,
      maxMessagesThisCycle: total * 2,
      secondsUntilNextCycle: remaining,
      cycleDurationSeconds: 3600,
      maxCyclesPerDay: TOTAL_HORAS,
      cycleNumber: this.state.currentRound,
      cycleProgress: `${this.state.currentCampaignIndex+1}/${total}`,
      currentPairIndex: this.state.currentCampaignIndex,
      totalPairs: total,
      currentCampaignNames: this.state.campaignOrder.map(String),
      uptimeMs,
      uptimeFormatted: `${uh}:${um}:${us}`,
      startedAtFormatted: new Date(this.state.startedAt).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'America/Sao_Paulo' }),
      nextCycleFormatted: `${String((h+1)%24).padStart(2,'0')}:00`,
      activePair: { index: this.state.currentCampaignIndex, campaigns: this.state.campaignOrder.map(String) },
      campaignStates: this.state.campaignOrder.map((id, idx) => ({
        campaignId: id, campaignName: `Camp ${id}`,
        sentThisHour: idx < this.state.currentCampaignIndex,
        lastSentHourKey: null,
      })),
    };
  }

  getStats() {
    const uptimeMs = Date.now() - this.state.startedAt;
    const total = this.state.totalSent + this.state.totalFailed;
    return {
      isRunning: this.state.isRunning,
      cycleNumber: this.state.currentRound,
      messagesThisHour: this.state.scheduledSlots.filter(s=>s.sent).length,
      maxMessagesPerHour: 1,
      lastMessageSentAt: this.state.lastSentAt,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: 0,
      currentPairIndex: this.state.currentCampaignIndex,
      totalPairs: this.state.campaignOrder.length,
      currentCampaignNames: [`Camp ${this.state.campaignOrder[this.state.currentCampaignIndex]}`],
      scheduledSlots: this.state.scheduledSlots,
      uptime: `${Math.floor(uptimeMs/3600000)}h ${Math.floor((uptimeMs%3600000)/60000)}m`,
      successRate: `${total > 0 ? ((this.state.totalSent/total)*100).toFixed(2) : 0}%`,
    };
  }
}

export const campaignScheduler = new CampaignScheduler();
