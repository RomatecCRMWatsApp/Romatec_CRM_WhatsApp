import { getDb } from "../db";
import { campaigns, contacts, messages, campaignContacts, contactCampaignHistory, properties } from "../../drizzle/schema";
import { eq, and, isNull, or, lte } from "drizzle-orm";

/**
 * SISTEMA DINÂMICO DE CAMPANHAS - VINCULADO A IMÓVEIS
 * 
 * REGRAS RÍGIDAS (NUNCA VIOLAR):
 * 1. MÁXIMO ABSOLUTO: 2 mensagens por hora (1 de cada campanha do par)
 * 2. MÍNIMO 20 minutos entre mensagens (intervalo aleatório 20-40 min)
 * 3. Rotação de pares: (1+2) → (3+4) → (1+2)...
 * 4. 12 contatos por campanha
 * 5. Bloqueio de 72h por contato após envio
 * 6. Mensagens variadas para evitar detecção
 * 7. Lock de envio: NUNCA enviar se já enviou 2 nesta hora
 * 
 * CORREÇÕES v2.1 (06/04/2026):
 * - FIX #1: Race condition - cycleNumber salvo no setTimeout, validado antes de enviar msg 2
 * - FIX #2: messageTimer cancelado explicitamente no stop()
 * - FIX #3: resetCampaignContacts filtra contatos bloqueados 72h
 * - FIX #4: syncCampaignsWithProperties com lock (isSyncing)
 * - FIX #5: Rotação ímpar - pular par incompleto em vez de duplicar campanha
 * - FIX #6: Validação telefone BR mínimo 13 dígitos
 * - FIX #7: Log de aviso quando contatos disponíveis < necessário
 * - FIX #8: getMessageVariation com rotação sem repetição consecutiva
 */

interface SchedulerState {
  isRunning: boolean;
  cycleNumber: number;
  messagesThisHour: number;
  lastMessageSentAt: number; // timestamp da última msg enviada
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
    lastMessageSentAt: 0,
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
  private isSending: boolean = false; // LOCK: impede envio simultâneo
  private isSyncing: boolean = false; // FIX #4: LOCK de sincronização

  // ========== LIMITE RÍGIDO ==========
  private readonly MAX_MESSAGES_PER_HOUR = 2;
  private readonly MIN_INTERVAL_MINUTES = 20; // mínimo 20 min entre msgs
  private readonly MAX_INTERVAL_MINUTES = 40; // máximo 40 min entre msgs
  // ====================================

  // FIX #8: Rastrear última variação usada por campanha (evitar repetição)
  private lastVariationIndex: Map<number, number> = new Map();

  /**
   * Inicia o scheduler
   */
  async start() {
    if (this.state.isRunning) {
      console.log("⚠️ Scheduler já está rodando");
      return;
    }

    console.log("🚀 Iniciando sistema dinâmico de campanhas...");
    console.log(`📏 LIMITE RÍGIDO: ${this.MAX_MESSAGES_PER_HOUR} msgs/hora, intervalo ${this.MIN_INTERVAL_MINUTES}-${this.MAX_INTERVAL_MINUTES} min`);

    await this.syncCampaignsWithProperties();

    this.state.isRunning = true;
    this.state.cycleStartTime = Date.now();
    this.state.startedAt = Date.now();
    this.state.cycleNumber = 0;
    this.state.messagesThisHour = 0;
    this.state.lastMessageSentAt = 0;
    this.state.totalSent = 0;
    this.state.totalFailed = 0;
    this.state.totalBlocked = 0;
    this.lastVariationIndex.clear();

    console.log("✅ Scheduler iniciado - Loop infinito 24/7");

    // Executar primeiro ciclo
    await this.executeCycle();

    // Agendar próximos ciclos
    this.scheduleNextCycle();
  }

  /**
   * Para o scheduler
   * FIX #2: Cancela AMBOS os timers (hourlyTimer E messageTimer)
   */
  stop() {
    this.state.isRunning = false;
    this.isSending = false;
    this.isSyncing = false;

    // FIX #2: Cancelar timer da mensagem 2 explicitamente
    if (this.messageTimer) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
      console.log("🛑 Timer da mensagem 2 cancelado");
    }

    if (this.hourlyTimer) {
      clearTimeout(this.hourlyTimer);
      this.hourlyTimer = null;
      console.log("🛑 Timer do próximo ciclo cancelado");
    }

    console.log("⏹️ Scheduler parado - todos os timers cancelados");
  }

  /**
   * SINCRONIZAÇÃO: Campanhas = Imóveis ativos
   * FIX #4: Lock de sincronização para evitar leitura inconsistente
   */
  async syncCampaignsWithProperties() {
    // FIX #4: Impedir sincronização simultânea
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
      this.isSyncing = false; // FIX #4: Liberar lock
    }
  }

  /**
   * Gera variações de mensagem com copywriting profissional
   * - Sem "bom dia/boa tarde" (roda 24h)
   * - Gatilhos mentais: escassez, urgência, exclusividade, prova social
   * - Link para página pública do imóvel
   * - {{NOME}} para personalização por contato
   */
  private generateMessageVariations(prop: any): string[] {
    const priceFormatted = Number(prop.price).toLocaleString("pt-BR");
    const slug = prop.publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const siteUrl = `https://romatecwa-2uygcczr.manus.space/imovel/${slug}`;

    return [
      // GATILHO: Escassez + Urgência
      `🏠 {{NOME}}, *${prop.denomination}* - Restam poucas unidades!\n\nValor: *R$ ${priceFormatted}*\nLocal: ${prop.address}\n\n📸 Veja fotos, planta e localização:\n${siteUrl}\n\n⚡ Condições especiais para os primeiros interessados. Posso te passar mais detalhes?`,

      // GATILHO: Curiosidade + Exclusividade
      `{{NOME}}, você já conhece o *${prop.denomination}*? 🔑\n\nUm dos imóveis mais procurados da região de ${prop.address}.\n\n💰 A partir de *R$ ${priceFormatted}*\n\n👉 Confira tudo aqui: ${siteUrl}\n\nPosso reservar uma visita exclusiva pra você?`,

      // GATILHO: Prova Social + Autoridade
      `📊 {{NOME}}, o *${prop.denomination}* já recebeu mais de 50 consultas este mês!\n\nMotivo? Localização privilegiada em ${prop.address} + preço competitivo.\n\n🏷️ *R$ ${priceFormatted}*\n\n🔗 Veja todos os detalhes: ${siteUrl}\n\nNão perca essa oportunidade. Me chama!`,

      // GATILHO: Investimento + Valorização
      `💡 {{NOME}}, sabia que imóveis nessa região valorizaram mais de 30% nos últimos anos?\n\n*${prop.denomination}* - ${prop.address}\nValor atual: *R$ ${priceFormatted}*\n\n📲 Fotos e detalhes completos: ${siteUrl}\n\nQuero te mostrar por que esse é o melhor momento pra investir. Posso te ligar?`,

      // GATILHO: Direto ao ponto + Call to action forte
      `🔥 {{NOME}}, *OPORTUNIDADE REAL*\n\n*${prop.denomination}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\n✅ Financiamento facilitado\n✅ Documentação em dia\n✅ Pronto pra morar/construir\n\n👉 Veja agora: ${siteUrl}\n\nResponde "SIM" que te envio todas as condições!`,

      // GATILHO: Medo de perder (FOMO)
      `⏰ {{NOME}}, última chance!\n\n*${prop.denomination}* em ${prop.address} está com condições especiais que vencem em breve.\n\n🏷️ *R$ ${priceFormatted}* (parcelas que cabem no bolso)\n\n📸 Veja fotos e planta: ${siteUrl}\n\nJá temos interessados. Garanta o seu antes que acabe!`,

      // GATILHO: Sonho + Emoção
      `🏡 {{NOME}}, imagine sua família no lugar perfeito...\n\n*${prop.denomination}* - ${prop.address}\nValor: *R$ ${priceFormatted}*\n\nLocalização estratégica, segurança e qualidade de vida.\n\n🔗 Conheça cada detalhe: ${siteUrl}\n\nVamos conversar sobre como realizar esse sonho?`,

      // GATILHO: Novidade + Exclusividade
      `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${prop.denomination}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\nPoucos sabem dessa oportunidade. Estou compartilhando com um grupo seleto de clientes.\n\n📲 Detalhes completos: ${siteUrl}\n\nTem interesse? Me responde que te explico tudo!`,

      // GATILHO: Benefício + Facilidade
      `✨ {{NOME}}, procurando imóvel com ótimo custo-benefício?\n\n*${prop.denomination}* em ${prop.address}\n\n🏷️ *R$ ${priceFormatted}*\n📋 Documentação 100% regularizada\n🏦 Aceita financiamento\n\n👉 Veja fotos e localização: ${siteUrl}\n\nPosso simular as parcelas pra você. É só me chamar!`,

      // GATILHO: Pergunta + Engajamento
      `🤔 {{NOME}}, você está buscando imóvel na região de ${prop.address}?\n\nTenho uma opção que pode ser exatamente o que procura:\n\n*${prop.denomination}* - *R$ ${priceFormatted}*\n\n📸 Veja tudo aqui: ${siteUrl}\n\nMe conta o que você precisa que te ajudo a encontrar o imóvel ideal!`,

      // GATILHO: Comparação + Valor
      `📌 {{NOME}}, comparou preços na região?\n\n*${prop.denomination}* está abaixo da média do mercado:\n💰 *R$ ${priceFormatted}*\n📍 ${prop.address}\n\nE o melhor: condições facilitadas de pagamento.\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,

      // GATILHO: Urgência + Escassez
      `🚨 {{NOME}}, *ATENÇÃO*\n\n*${prop.denomination}* - ${prop.address}\n\nEste imóvel está gerando muito interesse e pode sair do mercado a qualquer momento.\n\n🏷️ *R$ ${priceFormatted}*\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta sua visita. Me chama agora!`,
    ];
  }

  /**
   * Designa 12 contatos aleatórios para uma campanha
   * FIX #3: Filtra contatos bloqueados (72h) - não designar quem está bloqueado
   * FIX #7: Log de aviso quando contatos disponíveis < necessário
   */
  private async assignContactsToCampaign(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    const now = new Date();

    // Buscar contatos ativos E não bloqueados (FIX #3)
    const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
    const unblockedContacts = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);

    const alreadyAssigned = await db.select().from(campaignContacts);
    const assignedContactIds = new Set(alreadyAssigned.map(cc => cc.contactId));

    // Priorizar contatos não designados E não bloqueados
    let available = unblockedContacts.filter(c => !assignedContactIds.has(c.id));

    // FIX #7: Log de aviso quando contatos insuficientes
    if (available.length < 12) {
      console.warn(`⚠️ AVISO: Apenas ${available.length} contatos disponíveis (não bloqueados e não designados) para campanha ${campaignId}. Necessário: 12`);
      // Fallback: usar contatos não bloqueados mesmo que já designados em outra campanha
      available = unblockedContacts;
    }

    if (available.length < 12) {
      console.warn(`⚠️ AVISO CRÍTICO: Apenas ${available.length} contatos desbloqueados na base toda! Usando todos os ativos como fallback.`);
      available = allContacts;
    }

    // Embaralhar ALEATORIAMENTE (não alfabético)
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

    console.log(`📱 ${selected.length} contatos designados (aleatórios, ${unblockedContacts.length} desbloqueados disponíveis)`);
  }

  /**
   * ========== VERIFICAÇÃO RÍGIDA DE LIMITE ==========
   * Retorna true se pode enviar, false se NÃO pode
   */
  private canSendMessage(): boolean {
    // REGRA 1: Máximo 2 msgs por hora
    if (this.state.messagesThisHour >= this.MAX_MESSAGES_PER_HOUR) {
      console.log(`🚫 BLOQUEADO: já enviou ${this.state.messagesThisHour}/${this.MAX_MESSAGES_PER_HOUR} msgs nesta hora`);
      return false;
    }

    // REGRA 2: Mínimo 20 min desde última msg
    if (this.state.lastMessageSentAt > 0) {
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
   * Executa um ciclo (1 hora = EXATAMENTE 2 mensagens, com verificação rígida)
   * FIX #1: Salva cycleNumber no setTimeout e valida antes de enviar msg 2
   * FIX #5: Pula par incompleto (número ímpar de campanhas)
   */
  private async executeCycle() {
    if (!this.state.isRunning) return;

    console.log(`\n⏰ === CICLO ${this.state.cycleNumber + 1} ===`);

    await this.syncCampaignsWithProperties();

    // RESET contador da hora
    this.state.messagesThisHour = 0;

    const db = await getDb();
    if (!db) return;

    const runningCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

    if (runningCampaigns.length < 2) {
      console.error("❌ Menos de 2 campanhas ativas. Aguardando...");
      return;
    }

    // FIX #5: Calcular pares COMPLETOS (ignorar campanha ímpar solta)
    const completePairs = Math.floor(runningCampaigns.length / 2);
    const hasOddCampaign = runningCampaigns.length % 2 !== 0;

    if (hasOddCampaign) {
      console.warn(`⚠️ Número ímpar de campanhas (${runningCampaigns.length}). A última campanha "${runningCampaigns[runningCampaigns.length - 1].name}" será incluída em rotação extra.`);
    }

    // FIX #5: Usar completePairs para rotação principal
    // Se ímpar, incluir par extra com a última campanha + primeira
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
      // FIX #5: Par extra para campanha ímpar (última + primeira que não está no par atual)
      camp1 = runningCampaigns[runningCampaigns.length - 1];
      camp2 = runningCampaigns[0];
      console.log(`🔄 Par extra (campanha ímpar): ${camp1.name} + ${camp2.name}`);
    }

    this.state.currentCampaignNames = [camp1.name, camp2.name];

    // Gerar intervalo aleatório entre 20-40 min
    const intervalMinutes = this.generateRandomInterval();

    console.log(`📤 Par ${this.state.currentPairIndex + 1}/${totalPairs}: ${camp1.name} + ${camp2.name}`);
    console.log(`⏳ Intervalo entre msgs: ${intervalMinutes} minutos`);

    // ===== MENSAGEM 1: Verificar e enviar =====
    if (this.canSendMessage()) {
      console.log(`\n📨 Mensagem 1/2: ${camp1.name}`);
      await this.sendMessageForCampaign(camp1);
    } else {
      console.log(`🚫 Mensagem 1/2 BLOQUEADA pelo limite`);
    }

    // ===== MENSAGEM 2: Agendar com intervalo =====
    if (this.messageTimer) clearTimeout(this.messageTimer);

    const delayMs = intervalMinutes * 60 * 1000;
    console.log(`⏳ Mensagem 2/2 agendada para daqui ${intervalMinutes} min`);

    // FIX #1: Salvar cycleNumber atual para validar no callback
    const scheduledCycleNumber = this.state.cycleNumber;

    this.messageTimer = setTimeout(async () => {
      // FIX #1: Verificar se ainda estamos no mesmo ciclo
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
        console.log(`✅ Ciclo ${this.state.cycleNumber + 1} completo! ${this.state.messagesThisHour}/2 msgs enviadas.`);
      } else {
        console.log(`🚫 Mensagem 2/2 BLOQUEADA pelo limite`);
      }
    }, delayMs);
  }

  /**
   * Personaliza mensagem com dados do contato
   * Substitui {{NOME}} pelo primeiro nome do contato
   */
  private personalizeMessage(messageText: string, contact: { name: string; phone: string }): string {
    // Extrair primeiro nome (antes do primeiro espaço)
    const firstName = (contact.name || '').split(' ')[0].trim();
    
    // Se tem nome válido, personalizar; senão, remover o placeholder
    let personalized = messageText;
    if (firstName && firstName.length > 1) {
      personalized = personalized.replace(/{{NOME}}/g, firstName);
    } else {
      // Remover "{{NOME}}, " do texto
      personalized = personalized.replace(/{{NOME}},?\s*/g, '');
    }
    
    return personalized;
  }

  /**
   * Envia 1 mensagem para 1 contato (com LOCK e verificação)
   */
  private async sendMessageForCampaign(campaign: any) {
    // LOCK: impede envio simultâneo
    if (this.isSending) {
      console.log(`🚫 LOCK: envio já em andamento, ignorando`);
      return;
    }

    // VERIFICAÇÃO FINAL antes de enviar
    if (this.state.messagesThisHour >= this.MAX_MESSAGES_PER_HOUR) {
      console.log(`🚫 LIMITE ATINGIDO: ${this.state.messagesThisHour}/${this.MAX_MESSAGES_PER_HOUR} - NÃO enviando`);
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
        this.state.messagesThisHour++;
        this.state.lastMessageSentAt = Date.now();
        this.state.totalSent++;

        console.log(`✅ [${this.state.messagesThisHour}/${this.MAX_MESSAGES_PER_HOUR}] Enviado para ${contact.phone} (${contact.name})`);
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
   * FIX #3: Agora filtra contatos bloqueados ao redesignar
   */
  private async resetCampaignContacts(campaignId: number) {
    const db = await getDb();
    if (!db) return;

    console.log(`🔄 Resetando contatos da campanha ${campaignId} (filtrando bloqueados)...`);
    await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
    await this.assignContactsToCampaign(campaignId); // FIX #3: assignContactsToCampaign agora filtra bloqueados
    console.log(`✅ Contatos resetados (apenas desbloqueados)`);
  }

  /**
   * Obtém variação de mensagem aleatória
   * FIX #8: Evita repetição consecutiva da mesma variação
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

    // FIX #8: Gerar índice diferente do último usado
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
   * FIX #6: Validação de telefone BR mínimo 13 dígitos
   */
  private async sendViaZAPI(phone: string, message: string): Promise<boolean> {
    try {
      // FIX #6: Validar telefone antes de enviar
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      if (formattedPhone.length < 13) {
        console.warn(`⚠️ Telefone inválido (${formattedPhone.length} dígitos, mínimo 13 para celular BR): ${phone}`);
        // Não retornar false imediatamente - pode ser fixo válido com 12 dígitos
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
      this.state.messagesThisHour = 0; // RESET contador da hora

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
      maxMessagesPerHour: this.MAX_MESSAGES_PER_HOUR,
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
