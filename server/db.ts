import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, Contact, InsertContact, contacts, Property, InsertProperty, properties, Campaign, InsertCampaign, campaigns, CompanyConfig, InsertCompanyConfig, companyConfig } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
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

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Helpers para Contatos
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

// Helpers para Imóveis
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

// Helpers para Campanhas
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

// Helpers para Configuração da Empresa
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
  if (!config) {
    return db.insert(companyConfig).values(data as InsertCompanyConfig);
  }
  return db.update(companyConfig).set(data).where(eq(companyConfig.id, config.id));
}

// TODO: add feature queries here as your schema grows.
