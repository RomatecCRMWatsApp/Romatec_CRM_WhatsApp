import { eq } from "drizzle-orm";
import { contacts, properties, campaigns } from "../drizzle/schema";

// Helpers para update/delete
export async function updateContact(id: number, data: any) {
  const db = await require("./db").getDb();
  if (!db) throw new Error("Database not available");
  return db.update(contacts).set(data).where(eq(contacts.id, id));
}

export async function deleteContact(id: number) {
  const db = await require("./db").getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(contacts).where(eq(contacts.id, id));
}

export async function updateProperty(id: number, data: any) {
  const db = await require("./db").getDb();
  if (!db) throw new Error("Database not available");
  return db.update(properties).set(data).where(eq(properties.id, id));
}

export async function deleteProperty(id: number) {
  const db = await require("./db").getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(properties).where(eq(properties.id, id));
}

export async function updateCampaign(id: number, data: any) {
  const db = await require("./db").getDb();
  if (!db) throw new Error("Database not available");
  return db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number) {
  const db = await require("./db").getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(campaigns).where(eq(campaigns.id, id));
}
