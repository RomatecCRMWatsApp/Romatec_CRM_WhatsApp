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

  // ========== ESTADO ==========

  private getCurrentHourKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
  }

  private getCurrentHour(): number {
    return new Date().getHours();
  }

  private isActiveHour(): boolean {
    const hour = this.getCurrentHour();
    const activeHours = this.state.nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
    return activeHours.includes(hour);
  }

  private getCampaignForCurrentHour(allCampaigns: any[]): any | null {
    const hour = this.getCurrentHour();
    const campIndex = HOUR_TO_CAMP_INDEX[hour];
    if (campIndex === undefined) return null;
    const running = allCampaigns.filter(c => c.status === 'running');
    if (running.length === 0) return null;
    return running[campIndex % running.length] || null;
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
      console.log(`💾 Estado salvo: ${status} | Hora ${this.state.hourNumber + 1}/10`);
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
        console.log(`✅ Estado restaurado: Hora ${this.state.hourNumber + 1}/10`);
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
    this.state.hourNumber = 0;
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;
    this.state.currentHourKey = '';
    this.state.campaignStates = [];
    this.state.scheduledSlots = [];

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
      this.state.hourNumber++;

      console.log(`\n🕐 === NOVA HORA: ${currentHourKey} ===`);

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

    console.log(`📤 Hora ${hour}h → Campanha: ${campaign.name} (índice ${campIndex})`);

    // Verificar se já enviou nesta hora
    const campState = this.state.campaignStates.find(cs => cs.campaignId === campaign.id);
    if (campState?.sentThisHour) {
      console.log(`✅ ${campaign.name} já enviou nesta hora`);
      return;
    }

    // Agendar envio em momento aleatório dentro da hora
    const now = new Date();
    const minutesIntoHour = now.getMinutes();
    const secondsIntoHour = minutesIntoHour * 60 + now.getSeconds();
    const remainingMs = this.HOUR_MS - (secondsIntoHour * 1000);

    if (remainingMs < this.MARGIN_MS * 2) {
      console.log(`⚠️ Pouco tempo restante na hora — pulando`);
      return;
    }

    const minDelay = this.MARGIN_MS;
    const maxDelay = remainingMs - this.MARGIN_MS;
    const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay));
    const minuteLabel = Math.round(delay / 60000) + minutesIntoHour;

    const slot: SlotInfo = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      minuteLabel,
      sent: false,
    };
    this.state.scheduledSlots = [slot];

    console.log(`📨 ${campaign.name} → ~${Math.round(delay / 60000)} min`);

    const timer = setTimeout(async () => {
      if (!this.state.isRunning) return;
      const cs = this.state.campaignStates.find(s => s.campaignId === campaign.id);
      if (cs?.sentThisHour) return;
      await this.sendMessageForCampaign(campaign.id);
    }, delay);

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

      const contact = await this.getNextContact(campaignId);
      if (!contact) {
        console.log(`⚠️ ${campaign.name}: sem contatos disponíveis`);
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
        }

        const slot = this.state.scheduledSlots.find(s => s.campaignId === campaignId);
        if (slot) slot.sent = true;

        console.log(`✅ Enviado com sucesso! Total hoje: ${this.state.totalSent}`);

        // Registrar para bot
        await registerBotMessage(contact.phone, contact.name || '', campaignId, personalized);

        await this.updateContactHistory(contact.id, campaignId);
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
          await this.assignContactsToCampaign(campaignId);
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

    this.state.campaignStates = allCampaigns.map(camp => {
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

  private async assignContactsToCampaign(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const allContacts = await db.select().from(contacts).where(eq(contacts.status, 'active'));
    const unblocked = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);

    const neededContacts = 2; // 2 por campanha por ciclo

    if (unblocked.length < neededContacts) {
      console.warn(`⚠️ Apenas ${unblocked.length} contatos disponíveis`);
    }

    const shuffled = [...unblocked].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, neededContacts);

    for (const contact of selected) {
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
      personalized = personalized.replace(/{{NOME}}/g, firstName);
    } else {
      personalized = personalized.replace(/{{NOME}},?\s*/g, '');
    }
    return personalized;
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

  private generateMessageVariations(prop: any): string[] {
    const priceFormatted = Number(prop.price).toLocaleString('pt-BR');
    const slug = prop.publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const siteUrl = `https://romateccrmwhatsapp-production.up.railway.app/imovel/${slug}`;
    const denom = prop.denomination || '';

    const isChacara = denom.toLowerCase().includes('chacara') || denom.toLowerCase().includes('chácar') || denom.toLowerCase().includes('giuliano');

    if (isChacara) {
      return [
        `🌿 {{NOME}}, *${denom}* - Chácaras exclusivas em Açailândia!\n\n🏡 Cada chácara: *~1.000m²* por apenas *R$ ${priceFormatted}*\n⚠️ *Restam apenas 3 unidades!*\n\n📸 Veja fotos e localização: ${siteUrl}\n\nGaranta a sua antes que acabe!`,
        `{{NOME}}, já conhece o *${denom}*? 🌳\n\nChácaras de *~1.000m²* por *R$ ${priceFormatted}*\n🚨 *Apenas 3 disponíveis*\n\n👉 Confira: ${siteUrl}\n\nNão perca essa oportunidade!`,
        `🔥 {{NOME}}, *OPORTUNIDADE RARA*\n\n*${denom}* - Açailândia/MA\n🏡 ~1.000m² por *R$ ${priceFormatted}*\n⚠️ *Restam apenas 3 unidades!*\n\n📲 Veja agora: ${siteUrl}`,
        `⏰ {{NOME}}, *ÚLTIMAS UNIDADES*!\n\n*${denom}*: ~1.000m² por *R$ ${priceFormatted}*\n🚨 Apenas 3 disponíveis\n\n📸 Detalhes: ${siteUrl}`,
        `🏡 {{NOME}}, imagine ter sua própria chácara...\n\n*${denom}* - ~1.000m²\nValor: *R$ ${priceFormatted}*\n\n🔗 Conheça: ${siteUrl}`,
        `💎 {{NOME}}, oportunidade *ÚNICA* em Açailândia!\n\n*${denom}*\n📐 ~1.000m² | 💰 *R$ ${priceFormatted}*\n🔴 *3 já vendidas!* Restam 3.\n\n👉 Veja: ${siteUrl}`,
      ];
    }

    return [
      `🏠 {{NOME}}, *${denom}* - Restam poucas unidades!\n\nValor: *R$ ${priceFormatted}*\nLocal: ${prop.address}\n\n📸 Veja fotos e localização:\n${siteUrl}\n\nPosso te passar mais detalhes?`,
      `{{NOME}}, você já conhece o *${denom}*? 🔑\n\n💰 A partir de *R$ ${priceFormatted}*\n\n👉 Confira: ${siteUrl}\n\nPosso reservar uma visita exclusiva pra você?`,
      `🔥 {{NOME}}, *OPORTUNIDADE REAL*\n\n*${denom}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\n👉 Veja agora: ${siteUrl}`,
      `⏰ {{NOME}}, última chance!\n\n*${denom}* em ${prop.address}\n🏷️ *R$ ${priceFormatted}*\n\n📸 Veja fotos: ${siteUrl}`,
      `🏡 {{NOME}}, imagine sua família no lugar perfeito...\n\n*${denom}* - ${prop.address}\nValor: *R$ ${priceFormatted}*\n\n🔗 Conheça: ${siteUrl}`,
      `🚨 {{NOME}}, *ATENÇÃO*\n\n*${denom}* está gerando muito interesse!\n🏷️ *R$ ${priceFormatted}*\n\n📲 Veja antes que acabe: ${siteUrl}`,
    ];
  }

  // ========== Z-API ==========

  private async sendViaZAPI(phone: string, message: string): Promise<'sent' | 'failed' | 'invalid'> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

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
      const db = await getDb();
      if (!db) return;

      const allCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
      const campIndex = HOUR_TO_CAMP_INDEX[hour] ?? -1;
      const activeCamp = allCampaigns[campIndex % allCampaigns.length];

      const OWNER_PHONE = config.phone || '5599991811246';
      const report = [
        `📊 *RELATÓRIO HORA ${hour}h - ROMATEC CRM v9.0*`,
        `🕐 *${new Date().toLocaleTimeString('pt-BR')}*`,
        ``,
        `📨 *Campanha desta hora:* ${activeCamp?.name || 'Nenhuma'}`,
        `✅ *Enviadas hoje:* ${this.state.totalSent}`,
        `❌ *Falhas:* ${this.state.totalFailed}`,
        ``,
        `${this.state.nightMode ? '🌙 Modo Noite' : '☀️ Modo Dia'}`,
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

    const currentMinute = new Date().getMinutes();
    const currentSecond = new Date().getSeconds();
    const remainingSeconds = (60 - currentMinute - 1) * 60 + (60 - currentSecond);

    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const nextCycleFormatted = `${String(nextHour.getHours()).padStart(2, '0')}:00`;

    const startedAtFormatted = this.state.startedAt
      ? new Date(this.state.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '--:--:--';

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
    };
  }

  getStats() {
    const sentThisHour = this.state.campaignStates.filter(cs => cs.sentThisHour).length;
    const activeCamps = this.state.campaignStates.length;

    return {
      cycleNumber: this.state.hourNumber,
      totalSent: this.state.totalSent,
      totalFailed: this.state.totalFailed,
      totalBlocked: this.state.totalBlocked,
      messagesThisHour: sentThisHour,
      maxMessagesPerHour: 1,
      maxMessagesThisCycle: activeCamps,
      scheduledSlots: this.state.scheduledSlots,
      cycleProgress: `${this.state.hourNumber}/10`,
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
