import { int, bigint, smallint, tinyint, mysqlEnum, mysqlTable, text, longtext, timestamp, datetime, date, time, varchar, char, decimal, boolean, json, index, uniqueIndex, primaryKey } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

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
  /** Senha provisória (recrutamento): no 1º login a pessoa troca a senha; vence em senhaProvisoriaExpira */
  // Padrão como SQL (0), não como valor JS: o "false" iria como parâmetro em todo insert de users e o SQLite dos testes recusa
  trocarSenha: boolean("trocarSenha").default(sql`0`).notNull(),
  senhaProvisoriaExpira: datetime("senhaProvisoriaExpira"),
  /** Entra na roleta de leads (responsável por lead novo) */
  recebeLeads: boolean("recebeLeads").default(false).notNull(),
  // ─── Cadastro completo (shared/cadastro.ts) — o contrato puxa do corretor (intermediador) ───
  creciUf: varchar("creciUf", { length: 2 }),
  /** Instagram do usuário, sem @ (opcional; nas peças, sem ele vai o institucional @avalieimob) */
  instagram: varchar("instagram", { length: 40 }),
  cpf: varchar("cpf", { length: 11 }),
  rg: varchar("rg", { length: 20 }),
  rgOrgao: varchar("rgOrgao", { length: 30 }),
  nacionalidade: varchar("nacionalidade", { length: 40 }),
  estadoCivil: varchar("estadoCivil", { length: 30 }),
  enderecoLogradouro: varchar("enderecoLogradouro", { length: 160 }),
  enderecoNumero: varchar("enderecoNumero", { length: 20 }),
  enderecoComplemento: varchar("enderecoComplemento", { length: 80 }),
  enderecoBairro: varchar("enderecoBairro", { length: 80 }),
  enderecoCidade: varchar("enderecoCidade", { length: 80 }),
  enderecoUf: varchar("enderecoUf", { length: 2 }),
  enderecoCep: varchar("enderecoCep", { length: 8 }),
  /** Validade da certidão de quitação do CRECI (o arquivo fica em usuarioDocumentos) */
  certidaoCreciValidade: varchar("certidaoCreciValidade", { length: 10 }),
  fotoUrl: varchar("fotoUrl", { length: 500 }),
  // ─── v1.6.0 (shared/cadastro.ts, shared/qualificacao.ts) ───
  /** Sobe quando o perfil muda: tokens com versão antiga deixam de valer (sessão encerrada) */
  sessaoVersao: int("sessaoVersao").default(0).notNull(),
  /** "M" | "F" — concordância na qualificação do contrato */
  sexo: varchar("sexo", { length: 1 }),
  profissao: varchar("profissao", { length: 80 }),
  paisOrigem: varchar("paisOrigem", { length: 60 }),
  /** "RNM" | "PASSAPORTE" (estrangeiro) */
  docEstrangeiroTipo: varchar("docEstrangeiroTipo", { length: 12 }),
  docEstrangeiroNumero: varchar("docEstrangeiroNumero", { length: 30 }),
  ultimoLeadAt: timestamp("ultimoLeadAt"),
  /** v1.7.0 — tela de descanso: minutos sem interação (0 = desativada) */
  descansoMinutos: int("descansoMinutos").default(3).notNull(),
  /** Desativado com histórico (contratos, leads, financeiro): fora da lista da Equipe, sem apagar */
  arquivadoEm: timestamp("arquivadoEm"),
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
  /** Rótulos das ruas do projeto (importados do DXF): nome, posição UTM/geo e inclinação */
  ruas: json("ruas").$type<{ nome: string; e: number; n: number; lon: number; lat: number; angulo: number }[]>(),
  /** Perímetro do empreendimento (DXF): vértices UTM e polígono [lon,lat] */
  perimetro: json("perimetro").$type<{ verticesUtm: [number, number][]; poligono: [number, number][]; areaM2: number; perimetroM: number }>(),
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
  /** Preço de tabela do simulador (interno; shared/simulador.ts) */
  precoTabela: decimal("precoTabela", { precision: 12, scale: 2 }),
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
  // ─── Contratos (v1.9.0) ───
  /** Contrato que segura a reserva do lote */
  contratoReservaId: int("contratoReservaId"),
  /** Descrição perimetral escrita à mão; vazio = gerada do DXF (memorialDoLote) */
  memorialTexto: text("memorialTexto"),
  viaFrente: varchar("viaFrente", { length: 60 }),
  /** Matrícula própria do lote (depois do registro do parcelamento) */
  matricula: varchar("matricula", { length: 30 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uqLote: uniqueIndex("uq_lote").on(t.empreendimentoId, t.codigo),
}));

/** Documentos do usuário (certidão do CRECI, RG, CPF…) — no banco, só abrem com login */
export const usuarioDocumentos = mysqlTable("usuarioDocumentos", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  tipo: varchar("tipo", { length: 30 }).notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  mime: varchar("mime", { length: 100 }),
  tamanhoBytes: int("tamanhoBytes"),
  conteudoBase64: longtext("conteudoBase64").notNull(),
  validade: varchar("validade", { length: 10 }),
  enviadoPor: int("enviadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // ─── Credenciais (v1.6.0) ───
  /** "usuario" | "conjuge" */
  titular: varchar("titular", { length: 10 }).default("usuario").notNull(),
  /** Nº CNAI, nº do documento… */
  numero: varchar("numero", { length: 30 }),
  /** Cartão CRECI: link de verificação on-line (selo ✓ na qualificação) */
  linkVerificacao: varchar("linkVerificacao", { length: 500 }),
  /** Certidão CRECI: link de emissão/renovação */
  linkEmissao: varchar("linkEmissao", { length: 500 }),
  anexarDocumentos: boolean("anexarDocumentos").default(true).notNull(),
  exibirPerfil: boolean("exibirPerfil").default(false).notNull(),
  alertaEnviadoEm: varchar("alertaEnviadoEm", { length: 10 }),
  /** Miniatura 400 px (WEBP) da página 1 */
  thumbBase64: text("thumbBase64"),
  paginasQtd: int("paginasQtd"),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow(),
  /** Certidão CRECI: data de emissão (AAAA-MM-DD) — vai para a qualificação do corretor no contrato */
  emissao: varchar("emissao", { length: 10 }),
}, (t) => ({
  idxUsuario: index("idx_usudoc_usuario").on(t.usuarioId, t.tipo),
}));

/** Páginas PNG (1600 px) convertidas de cada documento (PDF: até 2 — frente e verso) */
export const usuarioDocumentoPaginas = mysqlTable("usuarioDocumentoPaginas", {
  id: int("id").autoincrement().primaryKey(),
  documentoId: int("documentoId").notNull(),
  n: int("n").notNull(),
  pngBase64: longtext("pngBase64").notNull(),
}, (t) => ({
  uqPagina: uniqueIndex("ux_pagina").on(t.documentoId, t.n),
}));

/** Cônjuge / companheiro(a) do usuário (contrato) */
export const usuarioConjuge = mysqlTable("usuarioConjuge", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  nome: varchar("nome", { length: 150 }).notNull(),
  sexo: varchar("sexo", { length: 1 }),
  cpf: varchar("cpf", { length: 11 }).notNull(),
  rg: varchar("rg", { length: 14 }),
  rgOrgao: varchar("rgOrgao", { length: 20 }),
  nacionalidade: varchar("nacionalidade", { length: 12 }).default("brasileira").notNull(),
  paisOrigem: varchar("paisOrigem", { length: 60 }),
  docEstrangeiroTipo: varchar("docEstrangeiroTipo", { length: 12 }),
  docEstrangeiroNumero: varchar("docEstrangeiroNumero", { length: 30 }),
  profissao: varchar("profissao", { length: 80 }),
  dataNascimento: varchar("dataNascimento", { length: 10 }),
  telefone: varchar("telefone", { length: 11 }),
  email: varchar("email", { length: 150 }),
  regimeBens: varchar("regimeBens", { length: 30 }),
  dataCasamento: varchar("dataCasamento", { length: 10 }),
  uniaoDataInicio: varchar("uniaoDataInicio", { length: 10 }),
  uniaoRegistrada: boolean("uniaoRegistrada").default(false).notNull(),
  mesmoEndereco: boolean("mesmoEndereco").default(true).notNull(),
  cep: varchar("cep", { length: 8 }),
  logradouro: varchar("logradouro", { length: 150 }),
  numero: varchar("numero", { length: 10 }),
  complemento: varchar("complemento", { length: 80 }),
  bairro: varchar("bairro", { length: 80 }),
  cidade: varchar("cidade", { length: 80 }),
  uf: varchar("uf", { length: 2 }),
  ativo: boolean("ativo").default(true).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uqUsuario: uniqueIndex("ux_conjuge_usuario").on(t.usuarioId),
}));

/** Foto de perfil (WEBP 512×512) — no banco, como os documentos */
export const usuarioFoto = mysqlTable("usuarioFoto", {
  usuarioId: int("usuarioId").primaryKey(),
  mime: varchar("mime", { length: 30 }).notNull(),
  conteudoBase64: text("conteudoBase64").notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
});

/** Links e prazos das credenciais (link_certidao_<UF>, certidao_validade_dias, …) */
export const configCredenciais = mysqlTable("configCredenciais", {
  chave: varchar("chave", { length: 60 }).primaryKey(),
  valor: varchar("valor", { length: 500 }).notNull(),
});

/** Pacote base de permissões por perfil e módulo (shared/permissoes.ts) */
export const permissoesPerfil = mysqlTable("permissoesPerfil", {
  id: int("id").autoincrement().primaryKey(),
  perfil: varchar("perfil", { length: 20 }).notNull(),
  modulo: varchar("modulo", { length: 40 }).notNull(),
  permitido: boolean("permitido").default(true).notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uqPerfil: uniqueIndex("uq_perm_perfil").on(t.perfil, t.modulo),
}));

/** Módulo ligado/desligado para um corretor (prevalece sobre o pacote base) */
export const permissoesUsuario = mysqlTable("permissoesUsuario", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  modulo: varchar("modulo", { length: 40 }).notNull(),
  permitido: boolean("permitido").notNull(),
  atualizadoPor: int("atualizadoPor"),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uqUsuario: uniqueIndex("uq_perm_usuario").on(t.usuarioId, t.modulo),
}));

/** Empreendimentos/imóveis habilitados para cada corretor (+ % de comissão do corretor, opcional) */
export const acessosCorretor = mysqlTable("acessosCorretor", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  tipo: mysqlEnum("tipo", ["empreendimento", "imovel"]).notNull(),
  refId: int("refId").notNull(),
  comissaoPct: decimal("comissaoPct", { precision: 6, scale: 4 }),
  habilitadoPor: int("habilitadoPor"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  uqAcesso: uniqueIndex("uq_acesso").on(t.usuarioId, t.tipo, t.refId),
}));

/** Condições do financiamento direto por empreendimento (simulador; reajuste sem deploy) */
export const condicoesPagamento = mysqlTable("condicoesPagamento", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  precoBase: decimal("precoBase", { precision: 12, scale: 2 }).notNull(),
  areaBaseM2: decimal("areaBaseM2", { precision: 10, scale: 2 }).notNull(),
  toleranciaAreaM2: decimal("toleranciaAreaM2", { precision: 10, scale: 2 }).default("1.00").notNull(),
  entradaPct: decimal("entradaPct", { precision: 6, scale: 4 }).notNull(),
  entradaMaxParcelas: int("entradaMaxParcelas").notNull(),
  descontoAvistaPct: decimal("descontoAvistaPct", { precision: 6, scale: 4 }).notNull(),
  /** Desconto em R$ do à vista total (lote pago de uma vez) */
  descontoAvistaTotal: decimal("descontoAvistaTotal", { precision: 12, scale: 2 }).default("10000.00").notNull(),
  jurosAaEfetivo: decimal("jurosAaEfetivo", { precision: 6, scale: 4 }).notNull(),
  metodo: mysqlEnum("metodo", ["PRICE"]).default("PRICE").notNull(),
  prazos: json("prazos").$type<number[]>().notNull(),
  comissaoTotalPct: decimal("comissaoTotalPct", { precision: 6, scale: 4 }).notNull(),
  comissaoCorretorPct: decimal("comissaoCorretorPct", { precision: 6, scale: 4 }).notNull(),
  comissao1aParcelaPct: decimal("comissao1aParcelaPct", { precision: 6, scale: 4 }).notNull(),
  vigenteDesde: varchar("vigenteDesde", { length: 10 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
});

/** Simulações gravadas (valores em centavos) — vinculadas ao lead quando houver */
export const simulacoes = mysqlTable("simulacoes", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  loteId: int("loteId").notNull(),
  leadId: int("leadId"),
  usuarioId: int("usuarioId"),
  entradaParcelas: int("entradaParcelas").notNull(),
  prazoSaldo: int("prazoSaldo").notNull(),
  precoCents: int("precoCents").notNull(),
  entradaCents: int("entradaCents").notNull(),
  saldoCents: int("saldoCents").notNull(),
  parcelaSaldoCents: int("parcelaSaldoCents").notNull(),
  totalPagoCents: int("totalPagoCents").notNull(),
  payload: json("payload"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  idxLead: index("idx_sim_lead").on(t.leadId),
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

/** Respostas automáticas no WhatsApp por empreendimento (server/autoresposta) — começa DESLIGADO */
export const autoRespostaConfig = mysqlTable("autoRespostaConfig", {
  empreendimentoId: int("empreendimentoId").primaryKey(),
  ativo: boolean("ativo").default(sql`0`).notNull(),
  /** Data limite da condição; vazio = "de lançamento e pode mudar sem aviso" (nunca inventar data) */
  condicaoValidaAte: date("condicaoValidaAte", { mode: "string" }),
  /** Aviso legal com {{variaveis}}; vazio = o padrão de shared/autoresposta.ts */
  avisoLegal: text("avisoLegal"),
  /** Chácara âncora da divulgação (vazio = área padrão das condições) */
  loteAncora: varchar("loteAncora", { length: 10 }),
  entradaParcelas: int("entradaParcelas").default(6).notNull(),
  atualizadoPor: int("atualizadoPor"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Texto de cada intenção (com {{variaveis}}) e as mídias que vão depois dele */
export const autoRespostaTextos = mysqlTable("autoRespostaTextos", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  intencao: varchar("intencao", { length: 40 }).notNull(),
  texto: text("texto").notNull(),
  /** Códigos separados por vírgula (OFERTA,CONDICOES…) */
  midias: varchar("midias", { length: 200 }),
  ativo: boolean("ativo").default(sql`1`).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({ uq: uniqueIndex("uq_autoresp_texto").on(t.empreendimentoId, t.intencao) }));

/** Biblioteca de mídias de divulgação (folders, mapa, PDF) por código */
export const autoRespostaMidias = mysqlTable("autoRespostaMidias", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  /** imagem | pdf */
  tipo: varchar("tipo", { length: 10 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 200 }),
  legenda: varchar("legenda", { length: 500 }),
  ativo: boolean("ativo").default(sql`1`).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({ uq: uniqueIndex("uq_autoresp_midia").on(t.empreendimentoId, t.codigo) }));

/** Despesas do fluxo de caixa (saídas). Nunca apagadas: cancelada fica no histórico. Recorrência = uma linha por mês, mesmo grupo */
export const financeiroDespesas = mysqlTable("financeiroDespesas", {
  id: int("id").autoincrement().primaryKey(),
  /** null = despesa geral do escritório */
  empreendimentoId: int("empreendimentoId"),
  descricao: varchar("descricao", { length: 200 }).notNull(),
  categoria: varchar("categoria", { length: 30 }).notNull(),
  fornecedor: varchar("fornecedor", { length: 120 }),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  vencimento: varchar("vencimento", { length: 10 }).notNull(),
  /** aberta | paga | cancelada */
  status: varchar("status", { length: 12 }).default("aberta").notNull(),
  pagoEm: varchar("pagoEm", { length: 10 }),
  valorPago: decimal("valorPago", { precision: 12, scale: 2 }),
  formaPagamento: varchar("formaPagamento", { length: 20 }),
  /** Recorrência: grupo e "3/12" */
  grupo: varchar("grupo", { length: 24 }),
  parcela: varchar("parcela", { length: 10 }),
  comprovanteUrl: varchar("comprovanteUrl", { length: 500 }),
  observacao: text("observacao"),
  criadoPor: int("criadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Mensagens da Z-API já recebidas (messageId): reenvio da Z-API ou outra cópia do servidor não respondem de novo */
export const zapiMensagensVistas = mysqlTable("zapiMensagensVistas", {
  messageId: varchar("messageId", { length: 120 }).primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Link pessoal da página de oferta (/o/:slug?l=token) — saber quem abriu e quantas vezes */
export const linksOferta = mysqlTable("linksOferta", {
  token: varchar("token", { length: 24 }).primaryKey(),
  leadId: int("leadId").notNull(),
  empreendimentoId: int("empreendimentoId").notNull(),
  aberturas: int("aberturas").default(0).notNull(),
  primeiraAberturaAt: timestamp("primeiraAberturaAt"),
  ultimaAberturaAt: timestamp("ultimaAberturaAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uq: uniqueIndex("uq_link_oferta_lead").on(t.leadId, t.empreendimentoId) }));

/** Régua do robô (24 h escassez, 72 h follow-up, 7 dias três livres) por lead; some quando o lead sai do robô */
export const autoRespostaRegua = mysqlTable("autoRespostaRegua", {
  leadId: int("leadId").primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  /** Base da régua: a última mensagem do lead */
  desde: timestamp("desde").notNull(),
  passo: int("passo").default(0).notNull(),
  proximoAt: timestamp("proximoAt"),
  /** Mensagens automáticas seguidas sem resposta do lead (máx. 3) */
  seguidas: int("seguidas").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

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
  /** Dados do formulário do link de agendamento (shared/mensagensAgendamento.ts → DadosPedido) */
  pedidoJson: text("pedidoJson"),
  /** Quando a confirmação saiu pelo WhatsApp do sistema (automática ou reenviada) */
  confirmacaoEnviadaAt: timestamp("confirmacaoEnviadaAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  idxQuando: index("idx_visita_quando").on(t.quando),
  idxLead: index("idx_visita_lead").on(t.leadId),
}));

// ─── Camada SaaS (shared/saas.ts) — fase 1: planos, cupons, assinaturas, trial, talonários ───

/** Configurações da camada SaaS (licenciamento_ativo, cortesia_ate…) */
export const saasConfig = mysqlTable("saasConfig", {
  chave: varchar("chave", { length: 60 }).primaryKey(),
  valor: text("valor"),
  atualizadoPor: int("atualizadoPor"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const saasPlanos = mysqlTable("saasPlanos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  publico: varchar("publico", { length: 15 }).notNull(),
  nome: varchar("nome", { length: 80 }).notNull(),
  precoMensal: decimal("precoMensal", { precision: 10, scale: 2 }).notNull(),
  precoAnual: decimal("precoAnual", { precision: 10, scale: 2 }),
  storageGb: int("storageGb").notNull().default(5),
  incluiAvalieimob: boolean("incluiAvalieimob").notNull().default(sql`0`),
  unico: boolean("unico").notNull().default(sql`0`),
  conteudo: text("conteudo"),
  ativo: boolean("ativo").notNull().default(sql`1`),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uqCodigo: uniqueIndex("uq_saas_plano").on(t.codigo) }));

/** Cupons (portados do AvalieImob): valor fixo, percentual ou preço fixo por plano; limite de usos; validade; ciclos */
export const saasCupons = mysqlTable("saasCupons", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull(),
  /** PERCENTUAL | VALOR_FIXO | PRECO_FIXO */
  tipo: varchar("tipo", { length: 12 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull().default("0"),
  precosFixosJson: text("precosFixosJson"),
  planoAlvo: varchar("planoAlvo", { length: 40 }),
  limiteUsos: int("limiteUsos").notNull().default(1),
  usosRealizados: int("usosRealizados").notNull().default(0),
  validade: datetime("validade"),
  /** Quantos ciclos o desconto vale (1 = só a 1ª mensalidade, como no AvalieImob) */
  duracaoCiclos: int("duracaoCiclos").notNull().default(1),
  /** ativo | utilizado | expirado | cancelado */
  status: varchar("status", { length: 12 }).notNull().default("ativo"),
  descricao: varchar("descricao", { length: 200 }),
  criadoPor: int("criadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({ uqCodigo: uniqueIndex("uq_saas_cupom").on(t.codigo) }));

export const saasAssinaturas = mysqlTable("saasAssinaturas", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  planoId: int("planoId").notNull(),
  empreendimentoId: int("empreendimentoId"),
  /** usuarioId:empreendimentoId (0 = corretor) — o UNIQUE do MySQL não barra NULL repetido */
  chave: varchar("chave", { length: 40 }).notNull(),
  origem: varchar("origem", { length: 15 }).notNull(),
  ciclo: varchar("ciclo", { length: 8 }).notNull().default("MENSAL"),
  status: varchar("status", { length: 20 }).notNull(),
  precoOverride: decimal("precoOverride", { precision: 10, scale: 2 }),
  cupomId: int("cupomId"),
  ciclosCupomRestantes: int("ciclosCupomRestantes"),
  trialFim: datetime("trialFim"),
  periodoFim: datetime("periodoFim"),
  diasTolerancia: int("diasTolerancia").notNull().default(3),
  contratoGestaoNr: varchar("contratoGestaoNr", { length: 40 }),
  mpPreapprovalId: varchar("mpPreapprovalId", { length: 64 }),
  /** Lembretes já enviados ("trial:3", "cortesia:1"…) */
  lembretesJson: text("lembretesJson"),
  motivo: varchar("motivo", { length: 300 }),
  /** Fase 2: CARTAO_RECORRENTE | PIX | BOLETO (escolhido no checkout) */
  metodo: varchar("metodo", { length: 20 }),
  /** Cancelada pelo assinante: vale até periodoFim e não renova */
  cancelarNoFim: boolean("cancelarNoFim").notNull().default(sql`0`),
  /** Checkout no cartão ainda não pago: { planoId, ciclo, metodo, cupomId, preapprovalId } — aplicado no 1º pagamento dessa assinatura do MP */
  checkoutPendenteJson: text("checkoutPendenteJson"),
  /** Acesso ao AvalieImob já informado a ele: ATIVO | SUSPENSO (null = nunca provisionado) — server/saas/avalieimob.ts */
  avalieimobEstado: varchar("avalieimobEstado", { length: 10 }),
  avalieimobErro: varchar("avalieimobErro", { length: 300 }),
  version: int("version").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({ uqChave: uniqueIndex("uq_saas_assinatura").on(t.chave), idxStatus: index("idx_saas_status_fim").on(t.status, t.periodoFim) }));

export const saasFaturas = mysqlTable("saasFaturas", {
  id: int("id").autoincrement().primaryKey(),
  assinaturaId: int("assinaturaId").notNull(),
  competencia: varchar("competencia", { length: 7 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  incluiImplantacao: boolean("incluiImplantacao").notNull().default(sql`0`),
  /** CARTAO_RECORRENTE | PIX | BOLETO | MANUAL */
  metodo: varchar("metodo", { length: 20 }).notNull(),
  /** ABERTA | PAGA | VENCIDA | CANCELADA | ESTORNADA */
  status: varchar("status", { length: 12 }).notNull().default("ABERTA"),
  vencimento: date("vencimento", { mode: "string" }).notNull(),
  pagoEm: datetime("pagoEm"),
  mpPaymentId: varchar("mpPaymentId", { length: 64 }),
  linkPagamento: varchar("linkPagamento", { length: 500 }),
  /** Pix copia e cola */
  pixCopiaCola: text("pixCopiaCola"),
  modo: varchar("modo", { length: 10 }),
  /** Fatura de upgrade (diferença proporcional): paga, troca o plano para este e NÃO estende o período */
  upgradePlanoId: int("upgradePlanoId"),
  /** Escolha do checkout (Pix/boleto): { planoId, ciclo, metodo, cupomId } — vai para a assinatura só quando esta fatura é paga */
  escolhaJson: text("escolhaJson"),
  nfseId: int("nfseId"),
  observacao: varchar("observacao", { length: 300 }),
  criadoPor: int("criadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uqComp: uniqueIndex("uq_saas_fatura_comp").on(t.assinaturaId, t.competencia) }));

/** Fila de NFS-e: uma por fatura paga, com os dados do tomador congelados no pagamento (emissão manual por enquanto) */
export const saasNfse = mysqlTable("saasNfse", {
  id: int("id").autoincrement().primaryKey(),
  faturaId: int("faturaId").notNull(),
  assinaturaId: int("assinaturaId").notNull(),
  usuarioId: int("usuarioId").notNull(),
  /** PENDENTE | EMITIDA | CANCELADA */
  status: varchar("status", { length: 10 }).notNull().default("PENDENTE"),
  competencia: varchar("competencia", { length: 7 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  itemServico: varchar("itemServico", { length: 10 }).notNull(),
  discriminacao: varchar("discriminacao", { length: 500 }).notNull(),
  tomadorNome: varchar("tomadorNome", { length: 160 }).notNull(),
  tomadorDoc: varchar("tomadorDoc", { length: 14 }),
  tomadorEmail: varchar("tomadorEmail", { length: 160 }),
  tomadorTelefone: varchar("tomadorTelefone", { length: 20 }),
  tomadorEndereco: varchar("tomadorEndereco", { length: 300 }),
  numero: varchar("numero", { length: 30 }),
  codigoVerificacao: varchar("codigoVerificacao", { length: 60 }),
  emitidaEm: datetime("emitidaEm"),
  emitidaPor: int("emitidaPor"),
  observacao: varchar("observacao", { length: 300 }),
  /** Emissão automática (server/saas/spedy.ts): provedor 'spedy', id e status lá, ambiente, links e a mensagem da prefeitura */
  provedor: varchar("provedor", { length: 12 }),
  externoId: varchar("externoId", { length: 64 }),
  externoStatus: varchar("externoStatus", { length: 20 }),
  ambiente: varchar("ambiente", { length: 12 }),
  pdfUrl: varchar("pdfUrl", { length: 300 }),
  xmlUrl: varchar("xmlUrl", { length: 300 }),
  mensagem: varchar("mensagem", { length: 500 }),
  enviadaEm: datetime("enviadaEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({ uqFatura: uniqueIndex("uq_saas_nfse_fatura").on(t.faturaId), idxStatus: index("idx_saas_nfse_status").on(t.status) }));

/** Webhook do Mercado Pago: um registro por evento (idempotência) e reprocessamento dos que falharam */
export const saasEventosPagamento = mysqlTable("saasEventosPagamento", {
  id: int("id").autoincrement().primaryKey(),
  provedor: varchar("provedor", { length: 20 }).notNull().default("mercadopago"),
  eventoId: varchar("eventoId", { length: 120 }).notNull(),
  tipo: varchar("tipo", { length: 60 }).notNull(),
  recursoId: varchar("recursoId", { length: 64 }),
  payloadJson: text("payloadJson"),
  processado: boolean("processado").notNull().default(sql`0`),
  tentativas: int("tentativas").notNull().default(0),
  erro: text("erro"),
  recebidoEm: timestamp("recebidoEm").defaultNow().notNull(),
  processadoEm: datetime("processadoEm"),
}, (t) => ({ uqEvento: uniqueIndex("uq_saas_evento").on(t.eventoId) }));

/** Um trial por CPF/CNPJ */
export const saasTrials = mysqlTable("saasTrials", {
  cpfCnpj: varchar("cpfCnpj", { length: 18 }).primaryKey(),
  usuarioId: int("usuarioId"),
  usadoEm: timestamp("usadoEm").defaultNow().notNull(),
});

/** LOGIN, BLOQUEIO_402, CHECKOUT_INICIADO, PAGAMENTO_CONFIRMADO, DESBLOQUEIO, TRIAL_INICIADO, TRIAL_EXPIRADO… */
export const auditoriaAcesso = mysqlTable("auditoriaAcesso", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  evento: varchar("evento", { length: 30 }).notNull(),
  detalheJson: text("detalheJson"),
  ip: varchar("ip", { length: 45 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({ idxUsuario: index("idx_aud_acesso_usuario").on(t.usuarioId, t.criadoEm) }));

/** Corretor sem assinatura (modo arcaico): só registro, sem login */
export const corretoresExternos = mysqlTable("corretoresExternos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 150 }).notNull(),
  cpf: varchar("cpf", { length: 11 }).notNull(),
  creci: varchar("creci", { length: 20 }),
  creciUf: varchar("creciUf", { length: 2 }),
  telefone: varchar("telefone", { length: 20 }),
  email: varchar("email", { length: 160 }),
  observacao: varchar("observacao", { length: 300 }),
  recrutamentoId: int("recrutamentoId"),
  ativo: boolean("ativo").notNull().default(sql`1`),
  criadoPor: int("criadoPor"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({ uqCpf: uniqueIndex("uq_corretor_externo_cpf").on(t.cpf) }));

/** Bloco numerado de contratos ou recibos entregue a um corretor (externo ou com login) */
export const talonarios = mysqlTable("talonarios", {
  id: int("id").autoincrement().primaryKey(),
  /** CONTRATO | RECIBO */
  tipo: varchar("tipo", { length: 10 }).notNull(),
  numeroInicial: int("numeroInicial").notNull(),
  numeroFinal: int("numeroFinal").notNull(),
  externoId: int("externoId"),
  usuarioId: int("usuarioId"),
  entregueEm: date("entregueEm", { mode: "string" }).notNull(),
  entreguePor: int("entreguePor").notNull(),
  observacao: varchar("observacao", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const talonarioFolhas = mysqlTable("talonarioFolhas", {
  talonarioId: int("talonarioId").notNull(),
  numero: int("numero").notNull(),
  /** EM_BRANCO | UTILIZADA | CANCELADA | EXTRAVIADA */
  status: varchar("status", { length: 12 }).notNull().default("EM_BRANCO"),
  contratoId: int("contratoId"),
  referencia: varchar("referencia", { length: 160 }),
  arquivoNome: varchar("arquivoNome", { length: 200 }),
  arquivoMime: varchar("arquivoMime", { length: 60 }),
  arquivoBase64: longtext("arquivoBase64"),
  lancadoPor: int("lancadoPor"),
  lancadoEm: datetime("lancadoEm"),
}, (t) => ({ pk: primaryKey({ columns: [t.talonarioId, t.numero] }) }));

/**
 * Recrutamento (shared/recrutamento.ts): convite com link do formulário público; o candidato preenche e anexa
 * os documentos; o administrador aprova e o sistema cria o acesso com senha provisória.
 */
export const recrutamentos = mysqlTable("recrutamentos", {
  id: int("id").autoincrement().primaryKey(),
  /** corretor | secretario | empreendedor */
  perfil: varchar("perfil", { length: 15 }).notNull(),
  nome: varchar("nome", { length: 150 }).notNull(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  email: varchar("email", { length: 160 }),
  empreendimentoSlug: varchar("empreendimentoSlug", { length: 80 }),
  /** Link do formulário (capacidade só deste candidato) */
  token: varchar("token", { length: 64 }).notNull(),
  tokenExpira: datetime("tokenExpira").notNull(),
  /** convidado | preenchido | aprovado | recusado | cancelado */
  status: varchar("status", { length: 12 }).notNull().default("convidado"),
  dadosJson: longtext("dadosJson"),
  usuarioId: int("usuarioId"),
  criadoPor: int("criadoPor").notNull(),
  enviadoEm: datetime("enviadoEm"),
  preenchidoEm: datetime("preenchidoEm"),
  decididoEm: datetime("decididoEm"),
  decididoPor: int("decididoPor"),
  motivo: varchar("motivo", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  uqToken: uniqueIndex("uq_recrutamento_token").on(t.token),
}));

/** Documentos que o candidato anexou (um por tipo); na aprovação vão para usuarioDocumentos/usuarioFoto */
export const recrutamentoDocs = mysqlTable("recrutamentoDocs", {
  id: int("id").autoincrement().primaryKey(),
  recrutamentoId: int("recrutamentoId").notNull(),
  /** Tipo de shared/cadastro (cartao_creci, certidao_creci, cnh…) ou "foto" */
  tipo: varchar("tipo", { length: 30 }).notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  mime: varchar("mime", { length: 60 }).notNull(),
  tamanhoBytes: int("tamanhoBytes").notNull(),
  conteudoBase64: longtext("conteudoBase64").notNull(),
  validade: date("validade", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqTipo: uniqueIndex("uq_recrutamento_doc").on(t.recrutamentoId, t.tipo),
}));

/** Reuniões com clientes (shared/reunioes.ts): transcrição e resumo; o áudio não fica guardado */
export const reunioes = mysqlTable("reunioes", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId"),
  titulo: varchar("titulo", { length: 160 }).notNull(),
  /** presencial | ligacao | video */
  tipo: varchar("tipo", { length: 15 }).notNull().default("presencial"),
  /** gravando | processando | pronta | erro */
  status: varchar("status", { length: 15 }).notNull().default("gravando"),
  criadoPor: int("criadoPor").notNull(),
  /** O cliente foi avisado da gravação (LGPD) */
  consentimento: boolean("consentimento").notNull().default(false),
  duracaoSeg: int("duracaoSeg").notNull().default(0),
  transcricao: longtext("transcricao"),
  /** ResumoReuniao em JSON */
  resumoJson: text("resumoJson"),
  erro: varchar("erro", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => ({
  idxLead: index("idx_reuniao_lead").on(t.leadId),
  idxAutor: index("idx_reuniao_autor").on(t.criadoPor),
}));

/** Partes da gravação (alguns minutos cada), transcritas ao chegar */
export const reuniaoPartes = mysqlTable("reuniaoPartes", {
  id: int("id").autoincrement().primaryKey(),
  reuniaoId: int("reuniaoId").notNull(),
  ordem: int("ordem").notNull(),
  duracaoSeg: int("duracaoSeg").notNull().default(0),
  texto: longtext("texto"),
  erro: varchar("erro", { length: 300 }),
  /** Áudio só enquanto a transcrição não sai (ex.: OpenAI sem crédito); apagado ao transcrever */
  audioBase64: longtext("audioBase64"),
  mime: varchar("mime", { length: 60 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqParte: uniqueIndex("uq_reuniao_parte").on(t.reuniaoId, t.ordem),
}));

/** Convites de reunião com confirmação de presença (shared/convites.ts) — não confundir com `reunioes` (gravação) */
export const reunioesAgenda = mysqlTable("reunioesAgenda", {
  id: int("id").autoincrement().primaryKey(),
  titulo: varchar("titulo", { length: 160 }).notNull(),
  empreendimentoId: int("empreendimentoId"),
  quando: timestamp("quando").notNull(),
  local: varchar("local", { length: 250 }),
  linkVideo: varchar("linkVideo", { length: 300 }),
  descricao: text("descricao"),
  /** Link geral (/reuniao/<tokenGeral>): quem abre informa nome e telefone */
  tokenGeral: varchar("tokenGeral", { length: 24 }).notNull(),
  /** Folder/material da reunião (imagem ou PDF, até 10 MB), mostrado na página de confirmação */
  folderMime: varchar("folderMime", { length: 40 }),
  folderNome: varchar("folderNome", { length: 160 }),
  folderBase64: longtext("folderBase64"),
  criadoPor: int("criadoPor").notNull(),
  canceladaEm: timestamp("canceladaEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqToken: uniqueIndex("uq_reuniao_agenda_token").on(t.tokenGeral),
  ixEmp: index("ix_reuniao_agenda_emp").on(t.empreendimentoId, t.quando),
}));

/** Convidados e respostas: da lista (link individual) ou de quem respondeu pelo link geral */
export const reuniaoConvidados = mysqlTable("reuniaoConvidados", {
  id: int("id").autoincrement().primaryKey(),
  reuniaoId: int("reuniaoId").notNull(),
  nome: varchar("nome", { length: 120 }).notNull(),
  /** 55 + DDD + número, só dígitos */
  telefone: varchar("telefone", { length: 15 }).notNull(),
  token: varchar("token", { length: 24 }).notNull(),
  /** lista | link_geral */
  origem: varchar("origem", { length: 12 }).notNull().default("lista"),
  /** pendente | confirmado | recusado */
  status: varchar("status", { length: 12 }).notNull().default("pendente"),
  respondidoEm: timestamp("respondidoEm"),
  conviteEnviadoEm: timestamp("conviteEnviadoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  uqToken: uniqueIndex("uq_reuniao_conv_token").on(t.token),
  uqFone: uniqueIndex("uq_reuniao_conv_fone").on(t.reuniaoId, t.telefone),
}));

/** Modelos de mensagem editáveis (chave → texto); sem linha, vale o padrão do código */
export const modelosMensagem = mysqlTable("modelosMensagem", {
  chave: varchar("chave", { length: 60 }).primaryKey(),
  texto: text("texto").notNull(),
  atualizadoPor: int("atualizadoPor"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

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

/** v1.7.0 — notas de versão (RELEASE_NOTES.md ou publicadas pelo admin) e quem já leu */
export const systemRelease = mysqlTable("systemRelease", {
  id: int("id").autoincrement().primaryKey(),
  versao: varchar("versao", { length: 20 }).notNull(),
  /** major | minor | patch */
  tipo: varchar("tipo", { length: 10 }).notNull().default("patch"),
  titulo: varchar("titulo", { length: 150 }).notNull(),
  /** { novo, melhorias, correcoes, avisos } */
  itens: json("itens").notNull(),
  obrigatoria: boolean("obrigatoria").default(false).notNull(),
  /** todos | admin | secretario | corretor | empreendedor */
  publico: varchar("publico", { length: 20 }).notNull().default("todos"),
  publicadoEm: timestamp("publicadoEm").defaultNow().notNull(),
  /** null = RELEASE_NOTES.md (deploy) */
  publicadoPor: int("publicadoPor"),
  /** Texto do bloco no RELEASE_NOTES.md já importado (só reimporta quando o arquivo muda) */
  hashArquivo: varchar("hashArquivo", { length: 64 }),
  ativo: boolean("ativo").default(true).notNull(),
}, (t) => ({
  uxVersao: uniqueIndex("ux_release_versao").on(t.versao),
}));

export const systemReleaseLeitura = mysqlTable("systemReleaseLeitura", {
  releaseId: int("releaseId").notNull(),
  usuarioId: int("usuarioId").notNull(),
  lidoEm: timestamp("lidoEm").defaultNow().notNull(),
}, (t) => ({
  uxLeitura: uniqueIndex("ux_release_leitura").on(t.releaseId, t.usuarioId),
}));

/** Notificações do sininho (v1.8.0): uma linha por destinatário; chave evita repetir o mesmo evento */
export const notificacoes = mysqlTable("notificacoes", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  /** atualizacao_sistema | reserva | venda_contrato | liberacao (shared/notificacoes.ts) */
  tipo: varchar("tipo", { length: 30 }).notNull(),
  titulo: varchar("titulo", { length: 160 }).notNull(),
  mensagem: varchar("mensagem", { length: 500 }).notNull(),
  url: varchar("url", { length: 300 }),
  empreendimentoId: int("empreendimentoId"),
  loteId: int("loteId"),
  /** Ex.: "v1.8.0" no aviso de sistema — não notifica a mesma versão duas vezes */
  chave: varchar("chave", { length: 80 }),
  lidaEm: timestamp("lidaEm"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixUsuario: index("ix_notif_usuario").on(t.usuarioId, t.id),
  ixChave: index("ix_notif_chave").on(t.tipo, t.chave),
}));

/** Inscrições de Web Push (um registro por aparelho/navegador; endpoint único) */
export const pushInscricoes = mysqlTable("pushInscricoes", {
  id: int("id").autoincrement().primaryKey(),
  usuarioId: int("usuarioId").notNull(),
  /** sha256 do endpoint (o endpoint é longo demais para índice único) */
  endpointHash: varchar("endpointHash", { length: 64 }).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh", { length: 200 }).notNull(),
  auth: varchar("auth", { length: 100 }).notNull(),
  userAgent: varchar("userAgent", { length: 300 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().notNull(),
}, (t) => ({
  uxEndpoint: uniqueIndex("ux_push_endpoint").on(t.endpointHash),
  ixUsuario: index("ix_push_usuario").on(t.usuarioId),
}));

// ════════════════════ Contratos, assinatura e cobrança (v1.9.0 — server/_core/migrations/addContratos.ts) ════════════════════

/** Arquivos do módulo (PDFs, versões, documentos das pessoas): no banco, porque o disco do Railway some a cada deploy */
export const contratoArquivos = mysqlTable("contratoArquivos", {
  /** Ex.: contratos/12/v3.pdf — é o valor gravado nas colunas "arquivo" */
  chave: varchar("chave", { length: 255 }).primaryKey(),
  mime: varchar("mime", { length: 60 }).notNull(),
  bytes: int("bytes").notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  conteudoBase64: longtext("conteudoBase64").notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});

/** Configuração jurídica do empreendimento: pré-preenche os campos emp_* e vend_* do contrato */
export const empJuridico = mysqlTable("empJuridico", {
  empreendimentoId: int("empreendimentoId").primaryKey(),
  /** Chaves emp_* (templates/defaults_empreendimento.json) + limites da portaria */
  defaultsJson: json("defaultsJson").$type<Record<string, unknown>>().notNull(),
  /** PF | PJ */
  vendedoraTipo: varchar("vendedoraTipo", { length: 2 }).default("PF").notNull(),
  /** Chaves vend_* / tit_* */
  vendedoraJson: json("vendedoraJson").$type<Record<string, unknown>>().notNull(),
  modeloCpcv: varchar("modeloCpcv", { length: 120 }).default("MODELO-CPCV-BOM-JARDIMS-v2.docx").notNull(),
  modeloVersao: varchar("modeloVersao", { length: 30 }).default("CPCV-BJ v2.0").notNull(),
  /** Pasta templates/marca/<slug> (cabeçalho, marca d'água, rodapé) */
  marcaSlug: varchar("marcaSlug", { length: 40 }).default("bomjardims").notNull(),
  /** Titular da conta Asaas da chave do empreendimento — beneficiário dos boletos (lido de /myAccount; muda ao trocar a chave) */
  asaasBeneficiario: json("asaasBeneficiario").$type<{ nome: string; cpfCnpj: string; agenciaConta: string; atualizadoEm: string; chave: string }>(),
  atualizadoPor: int("atualizadoPor"),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
});

/** Numeração dos contratos por ano (BJ-2026-0001) */
export const contratoSeq = mysqlTable("contratoSeq", {
  ano: smallint("ano").primaryKey(),
  ultimo: int("ultimo").notNull(),
});

export const contratos = mysqlTable("contratos", {
  id: int("id").autoincrement().primaryKey(),
  numero: varchar("numero", { length: 20 }).notNull(),
  empreendimentoId: int("empreendimentoId").notNull(),
  loteId: int("loteId"),
  loteCodigo: varchar("loteCodigo", { length: 10 }).notNull(),
  leadId: int("leadId"),
  corretorUserId: int("corretorUserId").notNull(),
  /** Plano do simulador congelado na emissão */
  simulacaoJson: json("simulacaoJson").$type<Record<string, unknown>>().notNull(),
  /** Contexto completo do merge (snapshot) */
  dadosJson: json("dadosJson").$type<Record<string, unknown>>().notNull(),
  /** Campos emp_* alterados só neste contrato */
  overridesJson: json("overridesJson").$type<Record<string, unknown>>(),
  /** rascunho | minuta | apto_assinatura | em_assinatura | assinado | ativo | quitado | distratado | cancelado */
  status: varchar("status", { length: 20 }).default("rascunho").notNull(),
  /** eletronica | manuscrita */
  modoAssinatura: varchar("modoAssinatura", { length: 12 }).default("eletronica").notNull(),
  codigoVerificacao: char("codigoVerificacao", { length: 12 }).notNull(),
  /** Chave em contratoArquivos */
  pdfAtual: varchar("pdfAtual", { length: 255 }),
  hashAtual: char("hashAtual", { length: 64 }),
  asaasCustomerId: varchar("asaasCustomerId", { length: 40 }),
  usoLiberado: boolean("usoLiberado").default(false).notNull(),
  usoLiberadoEm: datetime("usoLiberadoEm"),
  criadoPor: int("criadoPor"),
  /** Envio para assinatura (v1.12) */
  assinaturaIniciadaEm: datetime("assinaturaIniciadaEm"),
  /** Manifesto de assinaturas (Anexo VII) — chave em contratoArquivos */
  manifestoArquivo: varchar("manifestoArquivo", { length: 255 }),
  /** Cancelamento (v1.14): só o administrador, com a senha de login (step-up) */
  canceladoEm: datetime("canceladoEm"),
  canceladoPor: int("canceladoPor"),
  canceladoMotivo: varchar("canceladoMotivo", { length: 300 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uxNumero: uniqueIndex("ux_contrato_numero").on(t.numero),
  uxCodigo: uniqueIndex("ux_contrato_codigo").on(t.codigoVerificacao),
  ixLote: index("ix_contrato_lote").on(t.empreendimentoId, t.loteCodigo, t.status),
  ixStatus: index("ix_contrato_status").on(t.status),
  ixCorretor: index("ix_contrato_corretor").on(t.corretorUserId),
}));

/** Versões do PDF — nunca sobrescritas */
export const contratoVersoes = mysqlTable("contratoVersoes", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  versao: int("versao").notNull(),
  /** gerado | carimbo_avancada:<id> | icp:<id> | govbr:<id> | manuscrito */
  etapa: varchar("etapa", { length: 40 }).notNull(),
  arquivo: varchar("arquivo", { length: 255 }).notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  bytes: int("bytes").notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  uxVersao: uniqueIndex("ux_contrato_versao").on(t.contratoId, t.versao),
}));

export const assinaturaSignatarios = mysqlTable("assinaturaSignatarios", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** vendedora | titular | comprador | conjuge | comprador2 | intermediadora | corretor_parceiro | testemunha1 | testemunha2 */
  papel: varchar("papel", { length: 20 }).notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  cpf: char("cpf", { length: 11 }).notNull(),
  email: varchar("email", { length: 160 }),
  whatsapp: varchar("whatsapp", { length: 20 }),
  /** avancada | govbr | icp_a1 | manuscrita */
  metodo: varchar("metodo", { length: 12 }),
  ordem: tinyint("ordem").notNull(),
  /** pendente | convidado | assinado | recusado */
  status: varchar("status", { length: 12 }).default("pendente").notNull(),
  /** Link individual (base64url de 32 bytes) */
  token: char("token", { length: 43 }).notNull(),
  assinadoEm: datetime("assinadoEm"),
  /** IP, UA, geo, canal do OTP, série/emissor/CPF do certificado */
  evidenciasJson: json("evidenciasJson").$type<Record<string, unknown>>(),
  /** Validade do link individual (15 dias) */
  expiraEm: datetime("expiraEm"),
  /** 1 = gov.br sem CPF no certificado: conferido pelo nome, revisar */
  revisaoManual: tinyint("revisaoManual").default(0).notNull(),
}, (t) => ({
  uxToken: uniqueIndex("ux_signatario_token").on(t.token),
  ixContrato: index("ix_signatario_contrato").on(t.contratoId),
}));

/** Onde cada papel assina no PDF (contratoId nulo = gabarito do modelo) — coordenadas 0..1, origem no canto inferior esquerdo */
export const assinaturaPosicoes = mysqlTable("assinaturaPosicoes", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId"),
  modeloVersao: varchar("modeloVersao", { length: 30 }),
  papel: varchar("papel", { length: 30 }).notNull(),
  /** 1-based; -1 = última página */
  pagina: int("pagina").notNull(),
  x: decimal("x", { precision: 6, scale: 5 }).notNull(),
  y: decimal("y", { precision: 6, scale: 5 }).notNull(),
  w: decimal("w", { precision: 6, scale: 5 }).notNull(),
  h: decimal("h", { precision: 6, scale: 5 }).notNull(),
}, (t) => ({
  ixPos: index("ix_pos").on(t.contratoId, t.modeloVersao),
}));

export const assinaturaOtp = mysqlTable("assinaturaOtp", {
  signatarioId: int("signatarioId").primaryKey(),
  codigoHash: char("codigoHash", { length: 64 }).notNull(),
  expiraEm: datetime("expiraEm").notNull(),
  tentativas: tinyint("tentativas").default(0).notNull(),
});

/** Trilha de auditoria da assinatura */
export const assinaturaEventos = mysqlTable("assinaturaEventos", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  signatarioId: int("signatarioId"),
  /** convite_enviado | link_aberto | otp_enviado | otp_ok | assinado | upload_govbr | erro */
  evento: varchar("evento", { length: 40 }).notNull(),
  ip: varchar("ip", { length: 45 }),
  userAgent: varchar("userAgent", { length: 255 }),
  detalhe: json("detalhe").$type<Record<string, unknown>>(),
  criadoEm: timestamp("criadoEm", { fsp: 3 }).defaultNow().notNull(),
}, (t) => ({
  ixContrato: index("ix_ev_contrato").on(t.contratoId),
}));

export const cobrancas = mysqlTable("cobrancas", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** entrada | saldo | avista | antecipacao */
  tipo: varchar("tipo", { length: 12 }).notNull(),
  numero: smallint("numero").notNull(),
  total: smallint("total").notNull(),
  vencimento: date("vencimento", { mode: "string" }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  jurosParcela: decimal("jurosParcela", { precision: 12, scale: 2 }),
  amortizacao: decimal("amortizacao", { precision: 12, scale: 2 }),
  saldoDevedor: decimal("saldoDevedor", { precision: 12, scale: 2 }),
  splitValor: decimal("splitValor", { precision: 12, scale: 2 }).default("0").notNull(),
  asaasPaymentId: varchar("asaasPaymentId", { length: 40 }),
  nossoNumero: varchar("nossoNumero", { length: 30 }),
  linhaDigitavel: varchar("linhaDigitavel", { length: 60 }),
  codigoBarras: char("codigoBarras", { length: 44 }),
  pixPayload: text("pixPayload"),
  bankSlipUrl: varchar("bankSlipUrl", { length: 255 }),
  /** prevista | emitida | paga | vencida | cancelada | estornada */
  status: varchar("status", { length: 12 }).default("prevista").notNull(),
  pagoEm: date("pagoEm", { mode: "string" }),
  valorPago: decimal("valorPago", { precision: 12, scale: 2 }),
  // ─── Bloco Financeiro (v1.10.0) — saldoDevedor é o "saldo após" a parcela ───
  /** Valor e vencimento antes da 1ª 2ª via (gravados uma vez só) */
  valorOriginal: decimal("valorOriginal", { precision: 12, scale: 2 }),
  vencimentoOriginal: date("vencimentoOriginal", { mode: "string" }),
  segundaViaEm: datetime("segundaViaEm"),
  /** PIX | BOLETO (do webhook) */
  formaPagamento: varchar("formaPagamento", { length: 12 }),
  /** Dados do Asaas usados na lâmina, como vieram (linha digitável, código de barras, nosso número, PIX) */
  asaasSnapshot: json("asaasSnapshot").$type<Record<string, unknown>>(),
}, (t) => ({
  uxParcela: uniqueIndex("ux_cobranca_parcela").on(t.contratoId, t.tipo, t.numero),
  uxAsaas: uniqueIndex("ux_cobranca_asaas").on(t.asaasPaymentId),
  ixVenc: index("ix_cobranca_venc").on(t.status, t.vencimento),
}));

/** Webhook do Asaas: eventId único torna o processamento idempotente */
export const asaasWebhookLog = mysqlTable("asaasWebhookLog", {
  eventId: varchar("eventId", { length: 60 }).primaryKey(),
  evento: varchar("evento", { length: 40 }).notNull(),
  paymentId: varchar("paymentId", { length: 40 }),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  processado: boolean("processado").default(false).notNull(),
  recebidoEm: timestamp("recebidoEm").defaultNow().notNull(),
});

/** Comprador, cônjuge, 2º comprador, representante… (cadastro completo do contrato — spec §13) */
export const pessoas = mysqlTable("pessoas", {
  id: int("id").autoincrement().primaryKey(),
  /** PF | PJ */
  tipo: varchar("tipo", { length: 2 }).default("PF").notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  nomeSocial: varchar("nomeSocial", { length: 160 }),
  /** Só dígitos */
  cpfCnpj: varchar("cpfCnpj", { length: 14 }).notNull(),
  rg: varchar("rg", { length: 20 }),
  rgOrgao: varchar("rgOrgao", { length: 20 }),
  rgUf: char("rgUf", { length: 2 }),
  rgEmissao: date("rgEmissao", { mode: "string" }),
  cnh: varchar("cnh", { length: 20 }),
  nascimento: date("nascimento", { mode: "string" }),
  naturalidade: varchar("naturalidade", { length: 80 }),
  nacionalidade: varchar("nacionalidade", { length: 40 }).default("brasileira").notNull(),
  /** F | M | O */
  sexo: varchar("sexo", { length: 1 }),
  filiacaoMae: varchar("filiacaoMae", { length: 160 }),
  filiacaoPai: varchar("filiacaoPai", { length: 160 }),
  /** solteiro | casado | uniao_estavel | divorciado | separado | viuvo */
  estadoCivil: varchar("estadoCivil", { length: 20 }),
  /** comunhao_parcial | comunhao_universal | separacao_total | separacao_obrigatoria | participacao_final */
  regimeBens: varchar("regimeBens", { length: 30 }),
  /** Cartório, livro, folha, data */
  pactoAntenupcial: varchar("pactoAntenupcial", { length: 160 }),
  dataCasamento: date("dataCasamento", { mode: "string" }),
  profissao: varchar("profissao", { length: 80 }),
  empregador: varchar("empregador", { length: 120 }),
  /** Só o administrador vê */
  rendaMensal: decimal("rendaMensal", { precision: 12, scale: 2 }),
  email: varchar("email", { length: 160 }),
  email2: varchar("email2", { length: 160 }),
  telefone1: varchar("telefone1", { length: 20 }),
  telefone1Whatsapp: boolean("telefone1Whatsapp").default(true).notNull(),
  telefone2: varchar("telefone2", { length: 20 }),
  telefone2Whatsapp: boolean("telefone2Whatsapp").default(false).notNull(),
  cep: char("cep", { length: 8 }),
  logradouro: varchar("logradouro", { length: 160 }),
  numero: varchar("numero", { length: 10 }),
  complemento: varchar("complemento", { length: 80 }),
  bairro: varchar("bairro", { length: 80 }),
  cidade: varchar("cidade", { length: 80 }),
  uf: char("uf", { length: 2 }),
  /** whatsapp | email | telefone | correio */
  canalPreferido: varchar("canalPreferido", { length: 10 }).default("whatsapp").notNull(),
  horarioContato: varchar("horarioContato", { length: 40 }),
  lgpdConsentimentoEm: datetime("lgpdConsentimentoEm"),
  lgpdConsentimentoIp: varchar("lgpdConsentimentoIp", { length: 45 }),
  lgpdMarketing: boolean("lgpdMarketing").default(false).notNull(),
  leadId: int("leadId"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  uxDoc: uniqueIndex("ux_pessoa_doc").on(t.cpfCnpj),
  ixLead: index("ix_pessoa_lead").on(t.leadId),
}));

export const contratoPessoas = mysqlTable("contratoPessoas", {
  contratoId: int("contratoId").notNull(),
  pessoaId: int("pessoaId").notNull(),
  /** comprador | conjuge | comprador2 | conjuge2 | representante | procurador */
  papel: varchar("papel", { length: 14 }).notNull(),
  fracao: decimal("fracao", { precision: 5, scale: 2 }),
}, (t) => ({
  pk: primaryKey({ columns: [t.contratoId, t.pessoaId, t.papel] }),
}));

export const pessoaReferencias = mysqlTable("pessoaReferencias", {
  id: int("id").autoincrement().primaryKey(),
  pessoaId: int("pessoaId").notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  relacao: varchar("relacao", { length: 40 }).notNull(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  email: varchar("email", { length: 160 }),
});

export const pessoaDocumentos = mysqlTable("pessoaDocumentos", {
  id: int("id").autoincrement().primaryKey(),
  pessoaId: int("pessoaId").notNull(),
  /** rg_cnh_frente | rg_cnh_verso | cpf | comprovante_residencia | certidao_nascimento | certidao_casamento | pacto_antenupcial |
   *  declaracao_uniao_estavel | comprovante_renda | contrato_social | cartao_cnpj | procuracao | foto_3x4 | outro */
  tipo: varchar("tipo", { length: 30 }).notNull(),
  arquivo: varchar("arquivo", { length: 255 }).notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  mime: varchar("mime", { length: 60 }).notNull(),
  validadoPor: int("validadoPor"),
  validadoEm: datetime("validadoEm"),
  enviadoEm: timestamp("enviadoEm").defaultNow().notNull(),
}, (t) => ({
  ixPessoa: index("ix_pdoc_pessoa").on(t.pessoaId),
}));

/** Dependentes da chácara (até 6 além do titular e do cônjuge — spec §14) */
export const chacaraDependentes = mysqlTable("chacaraDependentes", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  /** conjuge | filho | enteado | pai_mae | irmao | neto | outro */
  parentesco: varchar("parentesco", { length: 10 }).notNull(),
  cpf: char("cpf", { length: 11 }),
  nascimento: date("nascimento", { mode: "string" }),
  telefone1: varchar("telefone1", { length: 20 }),
  telefone2: varchar("telefone2", { length: 20 }),
  email: varchar("email", { length: 160 }),
  foto: varchar("foto", { length: 255 }),
  ativo: boolean("ativo").default(true).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});

/** Anexos do contrato: documentos do comprador, do cônjuge e dos dependentes (server/contratos/anexos.ts) */
export const contratoAnexos = mysqlTable("contratoAnexos", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** comprador | conjuge | dependente */
  alvo: varchar("alvo", { length: 12 }).notNull(),
  /** dependente: chacaraDependentes.id (null para comprador/cônjuge) */
  dependenteId: int("dependenteId"),
  /** shared/contratos TIPOS_ANEXO */
  tipo: varchar("tipo", { length: 30 }).notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  /** chave em contratoArquivos */
  arquivo: varchar("arquivo", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 60 }).notNull(),
  bytes: int("bytes").notNull(),
  enviadoPor: int("enviadoPor").notNull(),
  enviadoEm: timestamp("enviadoEm").defaultNow().notNull(),
}, (t) => ({ ixContrato: index("ix_canexo_contrato").on(t.contratoId) }));

/** Carteira de chacreiro (CR80 com QR) */
export const carteiras = mysqlTable("carteiras", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** comprador | conjuge | dependente */
  titularTipo: varchar("titularTipo", { length: 10 }).notNull(),
  /** pessoas.id ou chacaraDependentes.id */
  titularId: int("titularId").notNull(),
  /** BJ-A01-01 … */
  numero: varchar("numero", { length: 20 }).notNull(),
  qrToken: char("qrToken", { length: 32 }).notNull(),
  validade: date("validade", { mode: "string" }).notNull(),
  /** ativa | bloqueada | cancelada */
  status: varchar("status", { length: 10 }).default("ativa").notNull(),
  emitidaEm: timestamp("emitidaEm").defaultNow().notNull(),
}, (t) => ({
  uxNumero: uniqueIndex("ux_carteira_numero").on(t.numero),
  uxQr: uniqueIndex("ux_carteira_qr").on(t.qrToken),
}));

export const eventosAutorizacoes = mysqlTable("eventosAutorizacoes", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** chacara | area_vivencia | quadra_e */
  local: varchar("local", { length: 14 }).notNull(),
  dataEvento: date("dataEvento", { mode: "string" }).notNull(),
  horaInicio: time("horaInicio").notNull(),
  horaFim: time("horaFim").notNull(),
  descricao: varchar("descricao", { length: 160 }).notNull(),
  convidadosSolicitados: smallint("convidadosSolicitados").notNull(),
  convidadosAutorizados: smallint("convidadosAutorizados"),
  somAmplificado: boolean("somAmplificado").default(false).notNull(),
  /** solicitado | autorizado | negado | cancelado | realizado */
  status: varchar("status", { length: 12 }).default("solicitado").notNull(),
  decididoPor: int("decididoPor"),
  decididoEm: datetime("decididoEm"),
  motivo: varchar("motivo", { length: 255 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});

// ════════════════════ Bloco Financeiro v1.0 (v1.10.0 — server/_core/migrations/addFinanceiro.ts) ════════════════════

/** Um recibo por cobrança paga (índice único em cobrancaId: webhook repetido não duplica) */
/** Pagamento lançado à mão (PIX/transferência/dinheiro fora do boleto), com o comprovante — v1.26.0 */
export const pagamentosManuais = mysqlTable("pagamentosManuais", {
  id: int("id").autoincrement().primaryKey(),
  /** PIX | TRANSFERENCIA | DINHEIRO | CARTAO | OUTRO */
  forma: varchar("forma", { length: 14 }).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  pagoEm: datetime("pagoEm").notNull(),
  /** E2E do PIX / AUT-NSU — único: o mesmo comprovante não dá baixa duas vezes */
  idTransacao: varchar("idTransacao", { length: 80 }),
  pagadorNome: varchar("pagadorNome", { length: 160 }),
  pagadorCpfParcial: varchar("pagadorCpfParcial", { length: 20 }),
  pagadorInstituicao: varchar("pagadorInstituicao", { length: 120 }),
  /** Quando quem pagou não é o comprador/cônjuge (pai, filho, empresa…) */
  vinculoPagador: varchar("vinculoPagador", { length: 120 }),
  urlRecibo: varchar("urlRecibo", { length: 300 }),
  observacao: varchar("observacao", { length: 500 }),
  lancadoPor: int("lancadoPor").notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  uxTransacao: uniqueIndex("ux_pagman_transacao").on(t.idTransacao),
}));

/** Quanto do pagamento foi para cada parcela (um PIX pode quitar parcelas de mais de um contrato) */
export const pagamentoRateio = mysqlTable("pagamentoRateio", {
  id: int("id").autoincrement().primaryKey(),
  pagamentoId: int("pagamentoId").notNull(),
  cobrancaId: int("cobrancaId").notNull(),
  contratoId: int("contratoId").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  reciboId: int("reciboId"),
}, (t) => ({
  ixPagamento: index("ix_rateio_pagamento").on(t.pagamentoId),
  uxCobranca: uniqueIndex("ux_rateio_cobranca").on(t.cobrancaId),
}));

/**
 * Recibos do CRM. A tabela é "crm_recibos": "recibos" já existe no banco compartilhado com a ZAYRA (outro esquema)
 * e o CREATE IF NOT EXISTS do CRM nunca a criou (v1.30.6). Não usar o nome "recibos" no CRM.
 */
export const recibos = mysqlTable("crm_recibos", {
  id: int("id").autoincrement().primaryKey(),
  /** REC-BJ-AAAA-NNNNNN */
  numero: varchar("numero", { length: 24 }).notNull(),
  cobrancaId: int("cobrancaId").notNull(),
  contratoId: int("contratoId").notNull(),
  /** XXXX-XXXX-XXXX — exigido para abrir o PDF pela verificação pública */
  codigoVerif: char("codigoVerif", { length: 14 }).notNull(),
  valorPago: decimal("valorPago", { precision: 12, scale: 2 }).notNull(),
  pagoEm: date("pagoEm", { mode: "string" }).notNull(),
  pdfArquivo: varchar("pdfArquivo", { length: 255 }),
  enviadoEm: datetime("enviadoEm"),
  envioErro: varchar("envioErro", { length: 255 }),
  /** Recibo nunca é apagado: o cancelamento (só admin, com senha) marca e fica na auditoria */
  canceladoEm: datetime("canceladoEm"),
  canceladoPor: int("canceladoPor"),
  canceladoMotivo: varchar("canceladoMotivo", { length: 300 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  uxNumero: uniqueIndex("ux_recibo_numero").on(t.numero),
  uxCobranca: uniqueIndex("ux_recibo_cobranca").on(t.cobrancaId),
  ixContrato: index("ix_recibo_contrato").on(t.contratoId),
}));

/** Declaração anual de quitação de débitos (Lei 12.007/2009) */
export const declaracoesQuitacao = mysqlTable("declaracoesQuitacao", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  anoRef: smallint("anoRef").notNull(),
  /** emitida | retida (débito em aberto no ano) */
  status: varchar("status", { length: 10 }).default("emitida").notNull(),
  motivo: varchar("motivo", { length: 255 }),
  valorTotal: decimal("valorTotal", { precision: 12, scale: 2 }),
  pdfArquivo: varchar("pdfArquivo", { length: 255 }),
  enviadoEm: datetime("enviadoEm"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  uxDeclaracao: uniqueIndex("ux_declaracao").on(t.contratoId, t.anoRef),
}));

/** IPCA mensal (IBGE/SIDRA, tabela 1737, variável 63) — "AAAA-MM" → variação % no mês */
export const indicesIpca = mysqlTable("indicesIpca", {
  competencia: char("competencia", { length: 7 }).primaryKey(),
  variacao: decimal("variacao", { precision: 8, scale: 4 }).notNull(),
  fonte: varchar("fonte", { length: 40 }).default("IBGE/SIDRA 1737").notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
});

/**
 * Pedido de cancelamento do contrato (corretor/secretária → administrador). O administrador
 * cancela ele mesmo, com a senha; o pedido fica como "atendida" ou "recusada" (nunca é apagado).
 */
export const contratoSolicitacoes = mysqlTable("contratoSolicitacoes", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** cancelamento */
  tipo: varchar("tipo", { length: 20 }).notNull(),
  motivo: varchar("motivo", { length: 300 }).notNull(),
  solicitanteId: int("solicitanteId").notNull(),
  /** pendente | atendida | recusada */
  status: varchar("status", { length: 12 }).notNull(),
  resolvidoPor: int("resolvidoPor"),
  resolvidoEm: datetime("resolvidoEm"),
  resposta: varchar("resposta", { length: 300 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixContrato: index("ix_solic_contrato").on(t.contratoId, t.status),
}));

/** Auditoria do bloco financeiro: geração, download, 2ª via, reenvio (só INSERT; no MySQL, gatilhos barram UPDATE/DELETE) */
export const financeiroAuditoria = mysqlTable("financeiroAuditoria", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  acao: varchar("acao", { length: 40 }).notNull(),
  contratoId: int("contratoId"),
  cobrancaId: int("cobrancaId"),
  usuarioId: int("usuarioId"),
  /** perfil | link | webhook | job | publico */
  origem: varchar("origem", { length: 20 }).notNull(),
  ip: varchar("ip", { length: 45 }),
  detalhe: json("detalhe").$type<Record<string, unknown>>(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixContrato: index("ix_fin_aud_contrato").on(t.contratoId, t.id),
}));

export const eventosConvidados = mysqlTable("eventosConvidados", {
  id: int("id").autoincrement().primaryKey(),
  eventoId: int("eventoId").notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  documento: varchar("documento", { length: 20 }).notNull(),
  telefone: varchar("telefone", { length: 20 }),
  placa: varchar("placa", { length: 10 }),
  /** 001–100, atribuído na portaria */
  crachaNumero: smallint("crachaNumero"),
  entradaEm: datetime("entradaEm"),
  saidaEm: datetime("saidaEm"),
});

/** Campanha de vendas por empreendimento (shared/ranking.ts): prazo definido pelo administrador; encerrada → ranking congelado */
export const rankingCampanhas = mysqlTable("rankingCampanhas", {
  empreendimentoId: int("empreendimentoId").primaryKey(),
  /** indeterminado | data | estoque */
  modo: varchar("modo", { length: 14 }).default("indeterminado").notNull(),
  dataEncerramento: varchar("dataEncerramento", { length: 10 }),
  premio: varchar("premio", { length: 200 }),
  /** Encerramento automático (data ou estoque): classificação congelada para a apuração */
  encerradaEm: datetime("encerradaEm"),
  motivoEncerramento: varchar("motivoEncerramento", { length: 12 }),
  congeladoJson: text("congeladoJson"),
  atualizadoPor: int("atualizadoPor"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Cliques e cadastros das páginas de campanha (ex.: /obras-bom-jardim): corretor do rodízio e origem, para medir a campanha */
export const campanhaCliques = mysqlTable("campanhaCliques", {
  id: int("id").autoincrement().primaryKey(),
  campanha: varchar("campanha", { length: 60 }).notNull(),
  /** cadastro | valor | visita */
  acao: varchar("acao", { length: 12 }).notNull(),
  corretorId: int("corretorId"),
  utmSource: varchar("utmSource", { length: 100 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixCampanha: index("ix_campanha_cliques").on(t.campanha, t.criadoEm),
}));

/** Links de divulgação cadastrados pelo escritório (shared/linksDivulgacao.ts; os fixos ficam no código) */
export const linksDivulgacao = mysqlTable("linksDivulgacao", {
  id: int("id").autoincrement().primaryKey(),
  titulo: varchar("titulo", { length: 120 }).notNull(),
  descricao: varchar("descricao", { length: 300 }),
  url: varchar("url", { length: 500 }).notNull(),
  utmSource: varchar("utmSource", { length: 60 }),
  utmCampaign: varchar("utmCampaign", { length: 60 }),
  textoWhatsapp: text("textoWhatsapp").notNull(),
  empreendimento: varchar("empreendimento", { length: 80 }),
  destaque: boolean("destaque").default(false).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  criadoPor: int("criadoPor"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});

/** Fila de espera por chácara (server/lotes/filaEspera.ts): quando a reserva cai, o 1º da fila é avisado */
export const loteFilaEspera = mysqlTable("loteFilaEspera", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  loteId: int("loteId").notNull(),
  loteCodigo: varchar("loteCodigo", { length: 10 }).notNull(),
  leadId: int("leadId"),
  nome: varchar("nome", { length: 160 }).notNull(),
  telefone: varchar("telefone", { length: 20 }),
  corretorId: int("corretorId"),
  /** aguardando | avisado | convertido | desistiu */
  status: varchar("status", { length: 12 }).default("aguardando").notNull(),
  avisadoEm: timestamp("avisadoEm"),
  observacao: varchar("observacao", { length: 300 }),
  criadoPor: int("criadoPor"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixLote: index("ix_fila_espera_lote").on(t.loteId, t.status, t.criadoEm),
}));

/** Andamento da obra por empreendimento (portal do comprador /c/:codigo › Obra) — publicado pelo escritório */
export const obraAtualizacoes = mysqlTable("obraAtualizacoes", {
  id: int("id").autoincrement().primaryKey(),
  empreendimentoId: int("empreendimentoId").notNull(),
  titulo: varchar("titulo", { length: 160 }).notNull(),
  texto: text("texto").notNull(),
  /** % geral da obra nesta data (0–100) */
  percentual: int("percentual"),
  /** Foto (chave em contratoArquivos) */
  fotoArquivo: varchar("fotoArquivo", { length: 255 }),
  data: varchar("data", { length: 10 }).notNull(),
  criadoPor: int("criadoPor"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixEmp: index("ix_obra_emp").on(t.empreendimentoId, t.data),
}));

/** Chamados do comprador (portal /c/:codigo › Chamados), respondidos pelo escritório (Vendas › Portal do comprador) */
export const portalChamados = mysqlTable("portalChamados", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** duvida | financeiro | antecipacao | documento | obra | outro */
  tipo: varchar("tipo", { length: 20 }).notNull(),
  assunto: varchar("assunto", { length: 160 }).notNull(),
  mensagem: text("mensagem").notNull(),
  /** Antecipação: parcelas e valores simulados */
  dadosJson: text("dadosJson"),
  /** aberto | respondido | fechado */
  status: varchar("status", { length: 12 }).default("aberto").notNull(),
  resposta: text("resposta"),
  respondidoPor: int("respondidoPor"),
  respondidoEm: timestamp("respondidoEm"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  ixContrato: index("ix_chamado_contrato").on(t.contratoId, t.criadoEm),
  ixStatus: index("ix_chamado_status").on(t.status),
}));

/** Termos aditivos ao CPCV (renegociação de parcelas — server/financeiro/renegociacao.ts): assinatura do comprador por código no WhatsApp */
export const contratoAditivos = mysqlTable("contratoAditivos", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId").notNull(),
  /** 1, 2, 3… por contrato */
  numero: int("numero").notNull(),
  tipo: varchar("tipo", { length: 20 }).default("renegociacao").notNull(),
  /** aguardando | assinado | cancelado */
  status: varchar("status", { length: 12 }).default("aguardando").notNull(),
  /** Renegociacao (shared/renegociacao.ts) */
  dadosJson: text("dadosJson").notNull(),
  pdfArquivo: varchar("pdfArquivo", { length: 255 }).notNull(),
  pdfSha256: char("pdfSha256", { length: 64 }).notNull(),
  pdfAssinadoArquivo: varchar("pdfAssinadoArquivo", { length: 255 }),
  token: char("token", { length: 32 }).notNull(),
  otpHash: char("otpHash", { length: 64 }),
  otpExpira: datetime("otpExpira"),
  otpTentativas: int("otpTentativas").default(0).notNull(),
  otpEnvios: int("otpEnvios").default(0).notNull(),
  assinadoEm: datetime("assinadoEm"),
  assinaturaIp: varchar("assinaturaIp", { length: 64 }),
  assinaturaUa: varchar("assinaturaUa", { length: 300 }),
  /** Aplicação nas cobranças: canceladas, criadas, emitidas no Asaas, falhas */
  resultadoJson: text("resultadoJson"),
  criadoPor: int("criadoPor"),
  canceladoPor: int("canceladoPor"),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
}, (t) => ({
  uxNumero: uniqueIndex("ux_aditivo_numero").on(t.contratoId, t.numero),
  uxToken: uniqueIndex("ux_aditivo_token").on(t.token),
}));

/** Sequências de follow-up por etapa do funil (shared/followupSequencias.ts) — sem linha = sequência padrão da etapa */
export const followUpSequencias = mysqlTable("followUpSequencias", {
  etapa: varchar("etapa", { length: 30 }).primaryKey(),
  ativo: boolean("ativo").default(true).notNull(),
  passosJson: text("passosJson").notNull(),
  atualizadoPor: int("atualizadoPor"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Horários de visita oferecidos pelo robô na conversa (server/autoresposta/visitaConversa.ts) — vale 48 h */
export const visitaOfertas = mysqlTable("visitaOfertas", {
  leadId: int("leadId").primaryKey(),
  opcoesJson: text("opcoesJson").notNull(),
  expiraEm: datetime("expiraEm").notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
});
