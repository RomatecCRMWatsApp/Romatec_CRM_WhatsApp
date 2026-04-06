import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties } from "../../drizzle/schema";
import { eq, and, isNull, or, lte } from "drizzle-orm";

/**
 * SISTEMA DINÂMICO DE CAMPANHAS - VINCULADO A IMÓVEIS
 * 
 * REGRAS:
 * 1. Campanhas = Imóveis ativos (status "available")
 * 2. EXATAMENTE 2 mensagens por hora (1 de cada campanha do par)
 * 3. Pares dinâmicos: se 4 imóveis = 2 pares, se 6 = 3 pares, etc.
 * 4. Rotação: Par1 → Par2 → Par3 → Par1... (loop infinito)
 * 5. 12 contatos por campanha
 * 6. Intervalo aleatório 10-30 min entre as 2 mensagens
 * 7. Bloqueio de 72h por contato após envio
 * 8. Mensagens variadas para evitar detecção
 * 9. Quando novo imóvel é cadastrado, entra automaticamente no ciclo
 * 10. Quando imóvel é vendido/removido, sai automaticamente do ciclo
 */

interface SchedulerState {
  isRunning: boolean;
  cycleNumber: number;
  messagesThisHour: number;
  randomInterval: number;
  cycleStartTime: number;
  startedAt: number;
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  currentPairIndex: number;
  totalPairs: number;
  currentCampaignNames: string[];
}

class CampaignScheduler {
  private state: SchedulerState = {
    isRunning: false,
    cycleNumber: 0,
    messagesThisHour: 0,
    randomInterval: 0,
    cycleStartTime: Date.now(),
    startedAt: Date.now(),
    totalSent: 0,
    totalFailed: 0,
    totalBlocked: 0,
    currentPairIndex: 0,
    totalPairs: 0,
    currentCampaignNames: [],
  };

  private hourlyTimer: NodeJS.Timeout | null = null;
  private messageTimer: NodeJS.Timeout | null = null;

  /**
   * Inicia o scheduler - sincroniza campanhas com imóveis e começa o loop
   */
  async start() {
    if (this.state.isRunning) {
      console.log("⚠️ Scheduler já está rodando");
      return;
    }

    console.log("🚀 Iniciando sistema dinâmico de campanhas...");

    // Sincronizar campanhas com imóveis ativos
    await this.syncCampaignsWithProperties();

    this.state.isRunning = true;
    this.state.cycleStartTime = Date.now();
    this.state.startedAt = Date.now();
    this.state.cycleNumber = 0;
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;

    console.log("✅ Scheduler iniciado - Loop infinito 24/7");

    // Executar primeiro ciclo imediatamente
    await this.executeCycle();

    // Agendar próximos ciclos
    this.scheduleNextCycle();
  }

  /**
   * Para o scheduler
   */
  stop() {
    this.state.isRunning = false;
    if (this.hourlyTimer) {
      clearTimeout(this.hourlyTimer);
      this.hourlyTimer = null;
    }
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
    console.log("⏹️ Scheduler parado");
  }

  /**
   * SINCRONIZAÇÃO DINÂMICA: Campanhas = Imóveis ativos
   * - Cria campanha para cada imóvel novo
   * - Remove campanhas de imóveis vendidos/inativos
   * - Designa 12 contatos para cada campanha nova
   */
  async syncCampaignsWithProperties() {
    const db = await getDb();
    if (!db) return;

    console.log("🔄 Sincronizando campanhas com imóveis...");

    // 1. Buscar imóveis ativos
    const activeProperties = await db.select().from(properties).where(eq(properties.status, "available"));
    console.log(`📊 ${activeProperties.length} imóveis ativos encontrados`);

    // 2. Buscar campanhas existentes
    const existingCampaigns = await db.select().from(campaigns);

    // 3. Criar campanhas para imóveis novos (sem campanha)
    const existingPropertyIds = existingCampaigns.map(c => c.propertyId);
    const newProperties = activeProperties.filter(p => !existingPropertyIds.includes(p.id));

    for (const prop of newProperties) {
      console.log(`➕ Criando campanha para imóvel: ${prop.denomination}`);

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

      // Designar 12 contatos aleatórios
      await this.assignContactsToCampaign(campaignId);
    }

    // 4. Pausar campanhas de imóveis vendidos/inativos
    const activePropertyIds = activeProperties.map(p => p.id);
    for (const campaign of existingCampaigns) {
      if (!activePropertyIds.includes(campaign.propertyId)) {
        console.log(`⏸️ Pausando campanha de imóvel vendido/inativo: ${campaign.name}`);
        await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, campaign.id));
      } else if (campaign.status === "paused") {
        // Reativar se imóvel voltou a ficar disponível
        console.log(`▶️ Reativando campanha: ${campaign.name}`);
        await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, campaign.id));
      }
    }

    // 5. Atualizar estado
    const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));
    this.state.totalPairs = Math.ceil(runningCampaigns.length / 2);
    console.log(`✅ Sincronização completa: ${runningCampaigns.length} campanhas ativas, ${this.state.totalPairs} pares`);
  }

  /**
   * Gera variações de mensagem para um imóvel
   */
  private generateMessageVariations(prop: any): string[] {
    const priceFormatted = Number(prop.price).toLocaleString("pt-BR");
    return [
      `Olá! Temos uma excelente oportunidade para você: ${prop.denomination} em ${prop.address}. Imóvel com ótimas condições. Quer saber mais?`,
      `Boa tarde! O imóvel ${prop.denomination} está disponível por R$ ${priceFormatted}. Localizado em ${prop.address}. Posso enviar mais detalhes?`,
      `Ei! Você conhece o ${prop.denomination}? É um imóvel incrível em ${prop.address}. Valor: R$ ${priceFormatted}. Vamos conversar?`,
      `Oportunidade única! ${prop.denomination} - ${prop.address}. Condições especiais de pagamento. Quer agendar uma visita?`,
      `Bom dia! Estamos com o ${prop.denomination} disponível. Localização privilegiada em ${prop.address}. Valor a partir de R$ ${priceFormatted}. Interesse?`,
      `Novidade! ${prop.denomination} acaba de entrar no mercado. ${prop.address}. Ótimo investimento por R$ ${priceFormatted}. Quer conhecer?`,
    ];
  }

  /**
   * Designa 12 contatos aleatórios para uma campanha
   */
  private async assignContactsToCampaign(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    // Buscar contatos ativos que não estão bloqueados
    const now = new Date();
    const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));

    // Buscar contatos já designados para outras campanhas
    const alreadyAssigned = await db.select().from(campaignContacts);
    const assignedContactIds = new Set(alreadyAssigned.map(cc => cc.contactId));

    // Filtrar contatos disponíveis (não designados para outra campanha)
    let available = allContacts.filter(c => !assignedContactIds.has(c.id));

    // Se não houver contatos suficientes não designados, usar todos
    if (available.length < 12) {
      available = allContacts;
    }

    // Embaralhar e pegar 12
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 12);

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
   * Executa um ciclo (1 hora = EXATAMENTE 2 mensagens)
   */
  private async executeCycle() {
    if (!this.state.isRunning) return;

    console.log(`\n⏰ === CICLO ${this.state.cycleNumber + 1} ===`);

    // Sincronizar campanhas com imóveis a cada ciclo
    await this.syncCampaignsWithProperties();

    // Resetar contador
    this.state.messagesThisHour = 0;
    this.state.randomInterval = this.generateRandomInterval();

    // Obter campanhas ativas
    const db = await getDb();
    if (!db) return;

    const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

    if (runningCampaigns.length < 2) {
      console.error("❌ Menos de 2 campanhas ativas. Aguardando...");
      return;
    }

    // Calcular par atual
    const totalPairs = Math.ceil(runningCampaigns.length / 2);
    this.state.totalPairs = totalPairs;
    this.state.currentPairIndex = this.state.cycleNumber % totalPairs;

    const pairStart = this.state.currentPairIndex * 2;
    const camp1 = runningCampaigns[pairStart];
    const camp2 = runningCampaigns[pairStart + 1] || runningCampaigns[0]; // Se ímpar, usa o primeiro

    this.state.currentCampaignNames = [camp1.name, camp2.name];

    console.log(`📤 Par ${this.state.currentPairIndex + 1}/${totalPairs}: ${camp1.name} + ${camp2.name}`);
    console.log(`⏳ Intervalo aleatório: ${this.state.randomInterval} minutos`);

    // MENSAGEM 1: Enviar imediatamente
    console.log(`\n📨 Mensagem 1/${2}: ${camp1.name}`);
    await this.sendMessageForCampaign(camp1);

    // MENSAGEM 2: Enviar após intervalo aleatório (10-30 min)
    if (this.messageTimer) clearTimeout(this.messageTimer);

    const delayMs = this.state.randomInterval * 60 * 1000;
    console.log(`⏳ Aguardando ${this.state.randomInterval} min para mensagem 2...`);

    this.messageTimer = setTimeout(async () => {
      if (!this.state.isRunning) return;
      console.log(`\n📨 Mensagem 2/${2}: ${camp2.name}`);
      await this.sendMessageForCampaign(camp2);
      console.log(`✅ Ciclo ${this.state.cycleNumber + 1} completo! EXATAMENTE 2 mensagens enviadas.`);
    }, delayMs);
  }

  /**
   * Envia 1 mensagem para 1 contato de uma campanha
   */
  private async sendMessageForCampaign(campaign: any) {
    try {
      const db = await getDb();
      if (!db) return;

      // Obter próximo contato disponível
      const contact = await this.getNextContact(campaign.id);
      if (!contact) {
        console.warn(`⚠️ Nenhum contato disponível para ${campaign.name}`);
        this.state.totalBlocked++;

        // Tentar resetar contatos se todos foram usados
        await this.resetCampaignContacts(campaign.id);
        return;
      }

      // Obter variação de mensagem aleatória
      const messageText = await this.getMessageVariation(campaign.id);
      if (!messageText) {
        console.error(`❌ Sem variações de mensagem para ${campaign.name}`);
        this.state.totalFailed++;
        return;
      }

      // Enviar mensagem (simulado por enquanto, Z-API será integrado)
      const success = await this.sendViaZAPI(contact.phone, messageText);

      if (success) {
        // Registrar envio no banco
        await db.insert(messages).values({
          campaignId: campaign.id,
          contactId: contact.id,
          propertyId: campaign.propertyId,
          messageText,
          status: "sent",
          sentAt: new Date(),
        });

        // Atualizar status do contato na campanha
        await db.update(campaignContacts)
          .set({
            status: "sent",
            messagesSent: 1,
            lastMessageSent: new Date(),
          })
          .where(and(
            eq(campaignContacts.campaignId, campaign.id),
            eq(campaignContacts.contactId, contact.id)
          ));

        // Atualizar contagem da campanha
        await db.update(campaigns)
          .set({ sentCount: (campaign.sentCount || 0) + 1 })
          .where(eq(campaigns.id, campaign.id));

        // Bloquear contato por 72h
        await db.update(contacts)
          .set({
            blockedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          })
          .where(eq(contacts.id, contact.id));

        // Registrar histórico
        await this.updateContactHistory(contact.id, campaign.id);

        this.state.messagesThisHour++;
        this.state.totalSent++;
        console.log(`✅ Enviado para ${contact.phone} (${contact.name})`);
      } else {
        // Registrar falha
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

    for (const cc of ccList) {
      const result = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
      const contact = result[0];
      if (!contact) continue;

      // Verificar bloqueio de 72h
      if (contact.blockedUntil && contact.blockedUntil > now) {
        continue;
      }

      return contact;
    }

    return null;
  }

  /**
   * Reset contatos de uma campanha quando todos foram usados
   */
  private async resetCampaignContacts(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    console.log(`🔄 Resetando contatos da campanha ${campaignId}...`);

    // Resetar status para pending
    await db.update(campaignContacts)
      .set({ status: "pending", messagesSent: 0 })
      .where(eq(campaignContacts.campaignId, campaignId));

    // Designar novos contatos aleatórios
    await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
    await this.assignContactsToCampaign(campaignId);

    console.log(`✅ Contatos resetados para campanha ${campaignId}`);
  }

  /**
   * Obtém variação de mensagem aleatória
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
    return variations[Math.floor(Math.random() * variations.length)];
  }

  /**
   * Envia mensagem via Z-API (ou simula)
   */
  private async sendViaZAPI(phone: string, message: string): Promise<boolean> {
    try {
      const { getCompanyConfig } = await import("../db");
      const config = await getCompanyConfig();

      if (config?.zApiInstanceId && config?.zApiToken) {
        // Envio REAL via Z-API (com Client-Token)
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
        // Simulação (Z-API não configurado)
        console.log(`📨 [SIMULADO] ${phone}: "${message.substring(0, 50)}..."`);
        return true;
      }
    } catch (error) {
      console.error("❌ Erro Z-API:", error);
      return false;
    }
  }

  /**
   * Atualiza histórico de campanha do contato
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
   * Gera intervalo aleatório entre 10-30 minutos
   */
  private generateRandomInterval(): number {
    return Math.floor(Math.random() * (30 - 10 + 1)) + 10;
  }

  /**
   * Agenda próximo ciclo (próxima hora cheia)
   */
  private scheduleNextCycle() {
    if (!this.state.isRunning) return;

    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const timeUntilNextHour = nextHour.getTime() - now.getTime();

    console.log(`⏳ Próximo ciclo em ${Math.round(timeUntilNextHour / 60000)} minutos`);

    this.hourlyTimer = setTimeout(async () => {
      if (!this.state.isRunning) return;

      this.state.cycleNumber++;
      this.state.cycleStartTime = Date.now();

      await this.executeCycle();
      this.scheduleNextCycle();
    }, timeUntilNextHour);
  }

  /**
   * Retorna estado atual
   */
  getState() {
    const now = Date.now();
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const secondsUntilNextCycle = Math.max(0, Math.floor((nextHour.getTime() - now) / 1000));

    return {
      ...this.state,
      secondsUntilNextCycle,
      uptimeMs: now - this.state.startedAt,
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
      messagesThisHour: this.state.messagesThisHour,
      randomInterval: this.state.randomInterval,
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
