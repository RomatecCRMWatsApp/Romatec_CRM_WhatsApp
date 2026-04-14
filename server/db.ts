import { eq } from "drizzle-orm";
import { InsertUser, users, contacts, InsertContact, properties, InsertProperty, campaigns, InsertCampaign, companyConfig, InsertCompanyConfig } from "../drizzle/schema";
import { ENV } from './_core/env';

// ─── Driver detection ─────────────────────────────────────────────────────
let _db: any = null;
let _dbDriver: 'mysql' | 'sqlite' = 'mysql';

export function getDbDriver(): 'mysql' | 'sqlite' { return _dbDriver; }

export async function getDb(): Promise<any> {
  if (_db) return _db;

  // ── SQLite (modo local / Electron) ────────────────────────────────────
  if (process.env.DATABASE_DRIVER === 'sqlite') {
    try {
      const BetterSQLite3 = (await import('better-sqlite3')).default;
      const { drizzle } = await import('drizzle-orm/better-sqlite3');
      const dbPath = process.env.SQLITE_PATH || './romatec-crm.db';
      const sqlite = new BetterSQLite3(dbPath);
      sqlite.pragma('journal_mode = WAL'); // melhor performance concorrente
      sqlite.pragma('foreign_keys = ON');
      _db = drizzle(sqlite);
      _dbDriver = 'sqlite';
      console.log(`[Database] SQLite conectado: ${dbPath}`);
      // Criar tabelas na primeira execução
      const { initSqliteTables } = await import('./_core/migrations/initSqlite');
      initSqliteTables(sqlite);
    } catch (error) {
      console.error("[Database] SQLite falhou:", error);
      _db = null;
    }
    return _db;
  }

  // ── MySQL (Railway / produção) ────────────────────────────────────────
  if (process.env.DATABASE_URL) {
    try {
      const { drizzle } = await import('drizzle-orm/mysql2');
      const { createPool } = await import('mysql2/promise');
      const rawUrl = process.env.DATABASE_URL || '';
      const cleanUrl = rawUrl.startsWith('DATABASE_URL=') ? rawUrl.replace('DATABASE_URL=', '') : rawUrl;
      const url = new URL(cleanUrl);
      const pool = createPool({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace('/', ''),
        ssl: { rejectUnauthorized: false },
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      _db = drizzle(pool);
      _dbDriver = 'mysql';
      console.log("[Database] MySQL pool conectado");
    } catch (error) {
      console.error("[Database] MySQL falhou:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    if (getDbDriver() === 'sqlite') {
      await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
    } else {
      await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllContacts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts);
}

export async function getContactById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(contacts).values(data);
  const insertId = (result as any)[0]?.insertId;
  return { ...result, id: insertId };
}

export async function getAllProperties() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(properties);
}

export async function getPropertyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createProperty(data: InsertProperty) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(properties).values(data);
  const insertId = (result as any)[0]?.insertId;
  return { ...result, id: insertId };
}

export async function getAllCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns);
}

export async function getCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCampaign(data: InsertCampaign) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(campaigns).values(data);
  const insertId = (result as any)[0]?.insertId;
  return { ...result, id: insertId };
}

export async function getCompanyConfig() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companyConfig).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateCompanyConfig(data: Partial<InsertCompanyConfig>) {
  const db = await getDb();
  if (!db) return undefined;
  const config = await getCompanyConfig();
  if (!config) return db.insert(companyConfig).values(data as InsertCompanyConfig);
  return db.update(companyConfig).set(data).where(eq(companyConfig.id, config.id));
}
