import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, index, uniqueIndex } from "drizzle-orm/mysql-core";

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
