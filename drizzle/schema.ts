import { int, mysqlEnum, mysqlTable, text, longtext, timestamp, varchar, decimal, boolean, json, index, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** Hash scrypt da senha ("scrypt$sal$hash") — ver server/auth-security.ts */
  passwordScrypt: varchar("password_hash", { length: 255 }),
  /** Hash antigo (SHA-256 hex, sem sal); convertido para scrypt no próximo login */
  passwordHash: varchar("passwordHash", { length: 64 }),
  /** Equipe (shared/equipe.ts): admin | equipe | empreendedor. Vazio = deduzido do role */
  perfil: varchar("perfil", { length: 20 }),
  /** Login dos colaboradores: número do CRECI (só dígitos) */
  creci: varchar("creci", { length: 20 }),
  telefone: varchar("telefone", { length: 20 }),
  /** Empreendedor: só vê os gráficos de leads e as artes deste empreendimento */
  empreendimentoSlug: varchar("empreendimentoSlug", { length: 80 }),
  ativo: boolean("ativo").default(true).notNull(),
  /** Convite de primeiro acesso: sha256 do token (o token em si só vai no link) */
  conviteHash: varchar("conviteHash", { length: 64 }),
  conviteExpira: timestamp("conviteExpira"),
  /** Entra na roleta de leads (responsável por lead novo) */
  recebeLeads: boolean("recebeLeads").default(false).notNull(),
  ultimoLeadAt: timestamp("ultimoLeadAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabela de Contatos
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  status: mysqlEnum("status", ["active", "blocked", "inactive"]).default("active").notNull(),
  blockedUntil: timestamp("blockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// Tabela de Imóveis
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  denomination: varchar("denomination", { length: 255 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 2 }),
  cep: varchar("cep", { length: 10 }),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  offerPrice: decimal("offerPrice", { precision: 12, scale: 2 }),
  description: text("description"),
  images: json("images").$type<string[]>(),
  videoUrl: text("videoUrl"),
  plantaBaixaUrl: text("plantaBaixaUrl"),
  areaConstruida: decimal("areaConstruida", { precision: 10, scale: 2 }),
  areaCasa: decimal("areaCasa", { precision: 10, scale: 2 }),
  areaTerreno: decimal("areaTerreno", { precision: 10, scale: 2 }),
  bedrooms: int("bedrooms"),
  bathrooms: int("bathrooms"),
  garageSpaces: int("garageSpaces"),
  propertyType: varchar("propertyType", { length: 100 }),
  publicSlug: varchar("publicSlug", { length: 255 }),
  finalidade: varchar("finalidade", { length: 20 }).default("venda").notNull(),
  /** Código curto de atribuição (IMV-0001): vai na mensagem pré-preenchida do WhatsApp */
  codigo: varchar("codigo", { length: 12 }),
  /** false = landing e mensagens mostram "Valor sob consulta" e o score ignora faixa_valor x preço */
  exibirPreco: boolean("exibirPreco").default(true).notNull(),
  status: mysqlEnum("status", ["available", "sold", "inactive"]).default("available").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

// Tabela de Campanhas
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "running", "paused", "completed"]).default("draft").notNull(),
  messageVariations: json("messageVariations").$type<string[]>(),
  totalContacts: int("totalContacts").default(2),
  sentCount: int("sentCount").default(0),
  failedCount: int("failedCount").default(0),
  messagesPerHour: int("messagesPerHour").default(1), // msgs/hora configurável: 1-5
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  // ═══════════════════════════════════════════════════════════
  // NOVA FEATURE: Habilitação por ciclo (máx 5 campanhas ativas/ciclo)
  // ═══════════════════════════════════════════════════════════
  activeDay: boolean("activeDay").default(false).notNull(),    // Ativo no ciclo dia (08h-18h)
  activeNight: boolean("activeNight").default(false).notNull(), // Ativo no ciclo noite (20h-06h)
  cycleActivationUpdatedAt: timestamp("cycleActivationUpdatedAt").defaultNow().onUpdateNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

// Tabela de Contatos por Campanha
export const campaignContacts = mysqlTable("campaignContacts", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  messagesSent: int("messagesSent").default(0),
  lastMessageSent: timestamp("lastMessageSent"),
  status: mysqlEnum("status", ["pending", "sent", "failed", "blocked"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignContact = typeof campaignContacts.$inferSelect;
export type InsertCampaignContact = typeof campaignContacts.$inferInsert;

// Tabela de Mensagens
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  contactId: int("contactId").notNull(),
  propertyId: int("propertyId").notNull(),
  messageText: text("messageText").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "delivered", "failed", "blocked"]).default("pending").notNull(),
  zApiMessageId: varchar("zApiMessageId", { length: 255 }),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// Tabela de Configurações da Empresa
export const companyConfig = mysqlTable("companyConfig", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  address: text("address"),
  zApiInstanceId: varchar("zApiInstanceId", { length: 255 }),
  zApiToken: varchar("zApiToken", { length: 255 }),
  zApiClientToken: varchar("zApiClientToken", { length: 255 }),
  zApiConnected: boolean("zApiConnected").default(false),
  zApiLastChecked: timestamp("zApiLastChecked"),
  telegramBotToken: varchar("telegramBotToken", { length: 255 }),
  telegramChatId: varchar("telegramChatId", { length: 100 }),
  openAiApiKey: varchar("openAiApiKey", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyConfig = typeof companyConfig.$inferSelect;
export type InsertCompanyConfig = typeof companyConfig.$inferInsert;

// Tabela de Interações (para IA)
export const interactions = mysqlTable("interactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  contactId: int("contactId").notNull(),
  campaignId: int("campaignId").notNull(),
  responseText: text("responseText"),
  sentiment: mysqlEnum("sentiment", ["positive", "negative", "neutral", "unknown"]).default("unknown"),
  responseTime: int("responseTime"), // em segundos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = typeof interactions.$inferInsert;

// Tabela de Histórico de Campanhas por Contato
export const contactCampaignHistory = mysqlTable("contactCampaignHistory", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull(),
  campaignId: int("campaignId").notNull(),
  lastCampaignId: int("lastCampaignId"), // última campanha enviada
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactCampaignHistory = typeof contactCampaignHistory.$inferSelect;
export type InsertContactCampaignHistory = typeof contactCampaignHistory.$inferInsert;

// Tabela de Ciclos de Campanhas
export const campaignSchedules = mysqlTable("campaignSchedules", {
  id: int("id").autoincrement().primaryKey(),
  hourCycle: int("hourCycle").default(0).notNull(),
  campaign1Id: int("campaign1Id").notNull(),
  campaign2Id: int("campaign2Id").notNull(),
  message1SentAt: timestamp("message1SentAt"),
  message2SentAt: timestamp("message2SentAt"),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CampaignSchedule = typeof campaignSchedules.$inferSelect;
export type InsertCampaignSchedule = typeof campaignSchedules.$inferInsert;

// Tabela de Variações de Mensagens
export const messageVariations = mysqlTable("messageVariations", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  messageText: text("messageText").notNull(),
  messageOrder: int("messageOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MessageVariation = typeof messageVariations.$inferSelect;
export type InsertMessageVariation = typeof messageVariations.$inferInsert;

// Tabela de Relatórios Diários
export const dailyReports = mysqlTable("dailyReports", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(),
  totalSent: int("totalSent").default(0).notNull(),
  totalFailed: int("totalFailed").default(0).notNull(),
  totalBlocked: int("totalBlocked").default(0).notNull(),
  executionTime: int("executionTime").default(0).notNull(),
  successRate: decimal("successRate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = typeof dailyReports.$inferInsert;

// Tabela de Estado do Scheduler (persistência para auto-restart)
export const schedulerState = mysqlTable("schedulerState", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["stopped", "running", "paused"]).default("stopped").notNull(),
  currentPairIndex: int("currentPairIndex").default(0).notNull(),
  cycleNumber: int("cycleNumber").default(0).notNull(),
  messagesThisCycle: int("messagesThisCycle").default(0).notNull(),
  startedAt: timestamp("startedAt"),
  cycleStartedAt: timestamp("cycleStartedAt"),
  stateJson: json("stateJson").$type<Record<string, any>>(), // dados extras (slots, campanhas enviadas, etc)
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SchedulerState = typeof schedulerState.$inferSelect;
export type InsertSchedulerState = typeof schedulerState.$inferInsert;

// Tabela de Qualificacao de Leads (Bot IA)
export const leadQualifications = mysqlTable("leadQualifications", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId"),
  campaignId: int("campaignId"),
  phone: varchar("phone", { length: 20 }).notNull(),

  // ═══════════════════════════════════════════════════════════════════════
  // QUALIFICACAO — 10 PERGUNTAS (JSON para flexibilidade)
  // ═══════════════════════════════════════════════════════════════════════
  answers: json("answers").$type<{
    nome?: string;                      // Pergunta 1: Nome completo
    rendaMensal?: string;               // Pergunta 2: Renda mensal bruta
    financiamentoAtivo?: string;        // Pergunta 3: Possui financiamento ativo?
    fgtsDisponivel?: string;            // Pergunta 4: FGTS disponível + tempo de carteira
    entradaDisponivel?: string;         // Pergunta 5: Entrada disponível
    tipoImovelBusca?: string;           // Pergunta 6: Tipo de imóvel (casa/apto/comercial)
    regiaoBairro?: string;              // Pergunta 7: Região/bairro
    valorImovelPretendido?: string;     // Pergunta 8: Valor pretendido
    isMoradiaOuInvestimento?: string;   // Pergunta 9: Moradia própria ou investimento?
    prazoPrefido?: string;              // Pergunta 10: Prazo ideal para fechar
    tipoEmprego?: string;               // Extra: tipo de emprego
    restricaoCPF?: string;              // Extra: restrição no CPF
  }>(),

  // ═══════════════════════════════════════════════════════════════════════
  // CAMPOS LEGADOS (compatibilidade)
  // ═══════════════════════════════════════════════════════════════════════
  nome: varchar("nome", { length: 255 }),
  valorParcela: varchar("valorParcela", { length: 100 }),
  valorEntrada: varchar("valorEntrada", { length: 100 }),
  tipoEmprego: varchar("tipoEmprego", { length: 100 }),
  restricaoCPF: varchar("restricaoCPF", { length: 100 }),
  prazo: varchar("prazo", { length: 100 }),
  primeiroImovel: varchar("primeiroImovel", { length: 100 }),

  // ═══════════════════════════════════════════════════════════════════════
  // STATUS E SCORING
  // ═══════════════════════════════════════════════════════════════════════
  stage: varchar("stage", { length: 50 }).default("qual_etapa_1"),  // Estágio atual de qualificação
  score: mysqlEnum("score", ["quente", "morno", "frio"]).notNull().default("frio"),
  campanhaOrigem: varchar("campanhaOrigem", { length: 255 }),

  // ═══════════════════════════════════════════════════════════════════════
  // ORIGEM DO LEAD (Instagram / landing / WhatsApp)
  // ═══════════════════════════════════════════════════════════════════════
  // whatsapp | instagram_ads | instagram_dm | instagram_bio | site | indicacao
  origem: varchar("origem", { length: 30 }).default("whatsapp"),
  instagramUserId: varchar("instagramUserId", { length: 64 }),       // IGSID do Direct
  metaLeadId: varchar("metaLeadId", { length: 64 }).unique(),        // id do leadgen (dedupe de webhook)
  propertyId: int("propertyId"),                                      // lote/loteamento de interesse
  utm: json("utm").$type<{ source?: string; medium?: string; campaign?: string; content?: string; referrer?: string; paginaEntrada?: string; gclid?: string; gbraid?: string; wbraid?: string; fbclid?: string }>(),
  empreendimentoSlug: varchar("empreendimentoSlug", { length: 80 }),  // ex.: bom-jardims (atendimento humano, sem bot genérico)
  loteCodigo: varchar("loteCodigo", { length: 10 }),                  // chácara clicada no mapa (ex.: B07)
  leadScore: int("leadScore"),                                        // 0–100 (≥ 60 = quente)
  consentimento: json("consentimento").$type<{ at: string; texto: string; origem: string; ip?: string }>(), // LGPD
  // ── Captação v1 (server/leads): funil, atribuição 1º/último toque, slots de qualificação ──
  funil: varchar("funil", { length: 20 }).default("comprador"),        // comprador | proprietario
  origemCanal: varchar("origemCanal", { length: 30 }),                 // 1º toque (nunca sobrescrito)
  origemCampanhaId: int("origemCampanhaId"),
  ultimoCanal: varchar("ultimoCanal", { length: 30 }),                 // último toque
  ultimaCampanhaId: int("ultimaCampanhaId"),
  slots: json("slots").$type<Record<string, { valor: string; fonte: "ia" | "bot" | "form" | "manual"; at: string }>>(),
  tags: json("tags").$type<string[]>(),
  /** Coluna do kanban (§12.1); null = deduzida do stage do bot */
  etapa: varchar("etapa", { length: 30 }),
  motivoPerda: varchar("motivoPerda", { length: 120 }),
  /** Corretor assumiu a conversa: o bot não responde até devolver */
  humano: boolean("humano").default(false),
  /** Qualificação por IA (§7.3): modo atual, perguntas feitas e falhas seguidas da IA */
  modoQualificacao: varchar("modoQualificacao", { length: 10 }).default("ia"),
  perguntasIa: int("perguntasIa").default(0),
  falhasIa: int("falhasIa").default(0),
  /** Detalhamento regra → pontos do leadScore atual (server/leads/score.ts) */
  scoreDetalhe: json("scoreDetalhe").$type<{ regras: string; detalhes: Record<string, number>; at: string }>(),
  /** Follow-up persistente (server/leads/followup.ts): passo já enviado e quando sai o próximo */
  followUpPasso: int("followUpPasso").default(0),
  proximoFollowUpAt: timestamp("proximoFollowUpAt"),
  /** Tentativas do passo atual que falharam no envio e o último erro (auditoria) */
  followUpTentativas: int("followUpTentativas").default(0),
  followUpErro: varchar("followUpErro", { length: 255 }),
  /** Corretor responsável (users.id) e prazo de atendimento humano (server/leads/sla.ts) */
  responsavelId: int("responsavelId"),
  aguardandoCorretorDesde: timestamp("aguardandoCorretorDesde"),
  atendidoAt: timestamp("atendidoAt"),
  alertaSlaNivel: int("alertaSlaNivel").default(0),

  lastActivityAt: timestamp("lastActivityAt").defaultNow(),          // Último evento (para timeout)
  blockedUntil: timestamp("blockedUntil"),                           // Bloqueado até (para leads que pediram para parar)
  discardReason: varchar("discardReason", { length: 255 }),         // Motivo do descarte (se foi descartado)

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadQualification = typeof leadQualifications.$inferSelect;
export type InsertLeadQualification = typeof leadQualifications.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// TABELA CRÍTICA: Message Send Log - Garante 1 msg/contato/hora
// ═══════════════════════════════════════════════════════════════════════
// Enforça que cada contato recebe NO MÁXIMO 1 mensagem por ciclo de hora
// Unique constraint em (contact_phone, cycle_hour) é a última linha de defesa
export const messageSendLog = mysqlTable(
  "messageSendLog",
  {
    id: int("id").autoincrement().primaryKey(),
    // Telefone do contato (sem formatação, apenas dígitos)
    contactPhone: varchar("contactPhone", { length: 20 }).notNull(),
    // ID da campanha que enviou
    campaignId: int("campaignId").notNull(),
    // Quando foi enviado
    sentAt: timestamp("sentAt").defaultNow().notNull(),
    // UNIX timestamp arredondado para a hora (ex: 1681234800 = 2023-04-12 02:00:00 UTC)
    // Calcula como: FLOOR(UNIX_TIMESTAMP(sentAt) / 3600) * 3600
    // Isso permite detectar se já foi enviado no mesmo ciclo de hora
    cycleHour: int("cycleHour").notNull(),
    // Status do envio
    status: mysqlEnum("status", ["sent", "skipped_duplicate", "failed", "pending"]).default("sent").notNull(),
    // Motivo se foi pulado/falhou
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    // Impede dois registros com mesmo contato na mesma hora
    uniquePerHour: uniqueIndex("unique_contact_cycle_hour").on(
      table.contactPhone,
      table.cycleHour
    ),
    // Impede a mesma campanha enviar mais de uma vez na mesma hora (lock entre processos)
    uniqueCampaignCycle: uniqueIndex("unique_campaign_cycle_hour").on(
      table.campaignId,
      table.cycleHour
    ),
    // Índices para performance
    idxContactPhone: index("idx_contactPhone").on(table.contactPhone),
    idxCycleHour: index("idx_cycleHour").on(table.cycleHour),
    idxSentAt: index("idx_sentAt").on(table.sentAt),
  })
);

export type MessageSendLog = typeof messageSendLog.$inferSelect;
export type InsertMessageSendLog = typeof messageSendLog.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════
// EMPREENDIMENTOS (loteamentos / condomínios de chácaras) e seus LOTES
// ═══════════════════════════════════════════════════════════════════════
export const empreendimentos = mysqlTable("empreendimentos", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  nome: varchar("nome", { length: 160 }).notNull(),
  fase: varchar("fase", { length: 30 }).default("pre_lancamento").notNull(),
  municipio: varchar("municipio", { length: 80 }),
  uf: varchar("uf", { length: 2 }),
  endereco: text("endereco"),
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lon: decimal("lon", { precision: 10, scale: 7 }),
  areaHa: decimal("areaHa", { precision: 10, scale: 4 }),
  totalLotes: int("totalLotes"),
  lotesComercializaveis: int("lotesComercializaveis"),
  // Trava de preço: enquanto false, nenhuma rota/página/mensagem pública mostra valores
  precosPublicos: boolean("precosPublicos").default(false).notNull(),
  /** Registro do parcelamento/condomínio no cartório (vazio = sem registro: aviso fixo na tela) */
  registroMatricula: varchar("registroMatricula", { length: 60 }),
  registroCartorio: varchar("registroCartorio", { length: 160 }),
  /** Fuso UTM do projeto (Açailândia = 23 Sul) */
  utmFuso: int("utmFuso").default(23),
  responsavelTecnico: varchar("responsavelTecnico", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Empreendimento = typeof empreendimentos.$inferSelect;

export const LOTE_STATUS = ["disponivel", "reservado", "em_negociacao", "vendido", "nao_comercializavel"] as const;

export const lotes = mysqlTable("lotes", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  codigo: varchar("codigo", { length: 10 }).notNull(),
  quadra: varchar("quadra", { length: 2 }),
  numero: int("numero"),
  areaM2: decimal("areaM2", { precision: 10, scale: 2 }),
  perimetroM: decimal("perimetroM", { precision: 10, scale: 2 }),
  destinacao: varchar("destinacao", { length: 30 }),
  comercializavel: boolean("comercializavel").default(true).notNull(),
  status: mysqlEnum("status", LOTE_STATUS).default("disponivel").notNull(),
  reservadoAte: timestamp("reservadoAte"),
  // Uso interno — só sai na API pública se empreendimentos.precosPublicos = true
  precoAvistaRef: decimal("precoAvistaRef", { precision: 12, scale: 2 }),
  precoFinanciadoRef: decimal("precoFinanciadoRef", { precision: 12, scale: 2 }),
  latCentro: decimal("latCentro", { precision: 10, scale: 7 }),
  lonCentro: decimal("lonCentro", { precision: 10, scale: 7 }),
  dossiePdf: varchar("dossiePdf", { length: 120 }),
  // ─── Controle de vendas (interno; server/lotes/vendas.ts) ───
  /** disponivel | bloqueado | interesse | reservado | entrada | vendido_parcelado | vendido_avista | quitado */
  situacao: varchar("situacao", { length: 20 }).default("disponivel"),
  leadId: int("leadId"),
  corretorId: int("corretorId"),
  clienteNome: varchar("clienteNome", { length: 160 }),
  valorVenda: decimal("valorVenda", { precision: 12, scale: 2 }),
  valorEntrada: decimal("valorEntrada", { precision: 12, scale: 2 }),
  numParcelas: int("numParcelas"),
  dataSituacao: timestamp("dataSituacao"),
  observacao: varchar("observacao", { length: 500 }),
  /** Geometria do projeto (DXF): vértices UTM [E,N] no sentido horário e polígono [lon,lat] */
  verticesUtm: json("verticesUtm").$type<[number, number][]>(),
  poligono: json("poligono").$type<[number, number][]>(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uqLote: uniqueIndex("uq_lote").on(t.empreendimentoId, t.codigo),
}));

/** Histórico de cada mudança de situação do lote (quem, quando, para quem) */
export const loteHistorico = mysqlTable("loteHistorico", {
  id: int("id").autoincrement().primaryKey(),
  loteId: int("loteId").notNull(),
  de: varchar("de", { length: 20 }),
  para: varchar("para", { length: 20 }).notNull(),
  leadId: int("leadId"),
  corretorId: int("corretorId"),
  usuarioId: int("usuarioId"),
  detalhe: varchar("detalhe", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idxLote: index("idx_lotehist_lote").on(t.loteId),
}));

/** Arquivos do empreendimento (licenças, projeto, escrituras…) — guardados no banco, download só com login */
export const empreendimentoArquivos = mysqlTable("empreendimentoArquivos", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  categoria: varchar("categoria", { length: 30 }).notNull().default("outro"),
  mime: varchar("mime", { length: 100 }),
  tamanhoBytes: int("tamanhoBytes"),
  conteudoBase64: longtext("conteudoBase64").notNull(),
  enviadoPor: int("enviadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idxEmp: index("idx_emparq_emp").on(t.empreendimentoId),
}));

export type Lote = typeof lotes.$inferSelect;

// ─── Captação v1: campanhas com código (#IG-OUT26-CHAC) e interesse lead × imóvel ───
export const leadCampanhas = mysqlTable("leadCampanhas", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(),
  nome: varchar("nome", { length: 160 }).notNull(),
  canal: varchar("canal", { length: 30 }).notNull(),
  funil: varchar("funil", { length: 20 }).default("comprador").notNull(),
  propertyId: int("propertyId"),
  empreendimentoSlug: varchar("empreendimentoSlug", { length: 80 }),
  metaFormId: varchar("metaFormId", { length: 40 }),
  googleFormId: varchar("googleFormId", { length: 40 }),
  utmSource: varchar("utmSource", { length: 60 }),
  utmCampaign: varchar("utmCampaign", { length: 120 }),
  gastoTotal: decimal("gastoTotal", { precision: 12, scale: 2 }).default("0").notNull(),
  inicio: timestamp("inicio"),
  fim: timestamp("fim"),
  ativa: boolean("ativa").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadCampanha = typeof leadCampanhas.$inferSelect;

/** Rastreio da landing /i/:codigo e do QR /q/:codigo (só com consentimento de cookies) */
export const leadEventos = mysqlTable("leadEventos", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId"),                                   // null = visitante anônimo
  visitanteId: varchar("visitanteId", { length: 36 }),     // cookie first-party rmt_vid
  tipo: varchar("tipo", { length: 40 }).notNull(),
  propertyId: int("propertyId"),
  campanhaId: int("campanhaId"),
  dados: json("dados").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
}, (t) => ({
  idxLead: index("idx_evento_lead").on(t.leadId, t.createdAt),
  idxVisitante: index("idx_evento_visitante").on(t.visitanteId),
}));

/** Conversa do lead no WhatsApp (contexto da IA e tela do lead) */
export const leadMensagens = mysqlTable("leadMensagens", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  direcao: varchar("direcao", { length: 3 }).notNull(),        // in | out
  autor: varchar("autor", { length: 10 }).notNull(),           // lead | ia | bot | sistema
  texto: text("texto").notNull(),
  createdAt: timestamp("createdAt", { fsp: 3 }).defaultNow().notNull(),
}, (t) => ({
  idxLead: index("idx_msg_lead").on(t.leadId, t.createdAt),
}));

/** Visitas agendadas com o lead (agenda — server/leads/visitas.ts) */
export const leadVisitas = mysqlTable("leadVisitas", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  propertyId: int("propertyId"),
  quando: timestamp("quando").notNull(),
  local: varchar("local", { length: 200 }),
  /** agendada | confirmada | realizada | nao_veio | cancelada */
  status: varchar("status", { length: 15 }).notNull().default("agendada"),
  observacao: varchar("observacao", { length: 500 }),
  responsavelId: int("responsavelId"),
  criadoPor: int("criadoPor"),
  /** Controle dos avisos automáticos (cada um sai uma vez) */
  lembreteClienteAt: timestamp("lembreteClienteAt"),
  avisoCorretorAt: timestamp("avisoCorretorAt"),
  resultadoPedidoAt: timestamp("resultadoPedidoAt"),
  confirmadaAt: timestamp("confirmadaAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  idxQuando: index("idx_visita_quando").on(t.quando),
  idxLead: index("idx_visita_lead").on(t.leadId),
}));

/** Histórico do score: grava só quando o valor muda */
export const leadScoreHistorico = mysqlTable("leadScoreHistorico", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  score: int("score").notNull(),
  classe: varchar("classe", { length: 10 }).notNull(),
  regras: varchar("regras", { length: 20 }).notNull(),
  detalhes: json("detalhes").$type<Record<string, number>>().notNull(),
  motivo: varchar("motivo", { length: 60 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idxLead: index("idx_score_lead").on(t.leadId, t.createdAt),
}));

export const leadInteresses = mysqlTable("leadInteresses", {
  leadId: int("leadId").notNull(),
  propertyId: int("propertyId").notNull(),
  campanhaId: int("campanhaId"),
  primeiroContatoAt: timestamp("primeiroContatoAt").defaultNow().notNull(),
}, (t) => ({
  uqInteresse: uniqueIndex("uq_lead_interesse").on(t.leadId, t.propertyId),
}));

/** Materiais de divulgação (artes, vídeos, folder, mapa) por imóvel ou empreendimento */
export const materiais = mysqlTable("materiais", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId"),
  empreendimentoSlug: varchar("empreendimentoSlug", { length: 80 }),
  titulo: varchar("titulo", { length: 160 }).notNull(),
  /** feed | status | card | video | folder | mapa | render | outro */
  tipo: varchar("tipo", { length: 20 }).notNull().default("outro"),
  url: text("url").notNull(),
  mime: varchar("mime", { length: 80 }),
  tamanhoBytes: int("tamanhoBytes"),
  /** false = peça bloqueada (ex.: mostra condições/preço) — aparece no CRM, mas marcada "não divulgar" */
  liberado: boolean("liberado").default(true).notNull(),
  observacao: varchar("observacao", { length: 255 }),
  ordem: int("ordem").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  idxProperty: index("idx_material_property").on(t.propertyId),
  idxEmp: index("idx_material_emp").on(t.empreendimentoSlug),
}));

export type Material = typeof materiais.$inferSelect;
