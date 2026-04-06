import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json } from "drizzle-orm/mysql-core";

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
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  images: json("images").$type<string[]>(),
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
  totalContacts: int("totalContacts").default(12),
  sentCount: int("sentCount").default(0),
  failedCount: int("failedCount").default(0),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
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
  zApiConnected: boolean("zApiConnected").default(false),
  zApiLastChecked: timestamp("zApiLastChecked"),
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
