// Acesso seguro ao MySQL pra Zaira. APENAS SELECT — qualquer outro statement
// (INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/TRUNCATE/RENAME/GRANT/REVOKE) e
// rejeitado antes mesmo de chegar no driver. Multi-statement (SQL injection
// classica via ;) tambem e bloqueado por regex de seguranca.

import { count, desc, eq, gte, sql } from "drizzle-orm";
import {
  campaigns,
  campaignContacts,
  contacts,
  leadQualifications,
  messages,
  properties,
} from "../drizzle/schema";
import { getDb } from "./db";

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|create|alter|truncate|rename|grant|revoke|exec|execute|call|merge|replace|load|handler|lock|unlock|set\s+global|set\s+session)\b/i;

export function isSelectQuerySafe(query: string): { ok: boolean; reason?: string } {
  const trimmed = query.trim();
  if (!/^select\b/i.test(trimmed)) {
    return { ok: false, reason: "Apenas queries SELECT sao permitidas" };
  }
  if (trimmed.includes(";") && trimmed.indexOf(";") < trimmed.length - 1) {
    return { ok: false, reason: "Multi-statement nao e permitido" };
  }
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    return { ok: false, reason: "Palavras-chave de modificacao detectadas" };
  }
  return { ok: true };
}

export async function runSafeQuery(query: string): Promise<{
  ok: boolean;
  rows?: any[];
  error?: string;
  rowCount?: number;
}> {
  const safety = isSelectQuerySafe(query);
  if (!safety.ok) return { ok: false, error: safety.reason };

  const db = await getDb();
  if (!db) return { ok: false, error: "Database nao disponivel" };

  try {
    const result = await db.execute(sql.raw(query));
    const rows = Array.isArray(result) ? (result[0] as any[]) : (result as any[]);
    const limited = (rows ?? []).slice(0, 100);
    return { ok: true, rows: limited, rowCount: rows?.length ?? 0 };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Erro desconhecido" };
  }
}

export async function getSystemStats(): Promise<{
  contactsTotal: number;
  campaignsTotal: number;
  propertiesTotal: number;
  messagesLast24h: number;
  qualifiedLeadsLast7d: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      contactsTotal: 0,
      campaignsTotal: 0,
      propertiesTotal: 0,
      messagesLast24h: 0,
      qualifiedLeadsLast7d: 0,
    };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [c, ca, p, m, q] = await Promise.all([
    db.select({ n: count() }).from(contacts),
    db.select({ n: count() }).from(campaigns),
    db.select({ n: count() }).from(properties),
    db.select({ n: count() }).from(messages).where(gte(messages.createdAt, oneDayAgo)),
    db.select({ n: count() }).from(leadQualifications).where(gte(leadQualifications.createdAt, sevenDaysAgo)),
  ]);

  return {
    contactsTotal: Number(c[0]?.n ?? 0),
    campaignsTotal: Number(ca[0]?.n ?? 0),
    propertiesTotal: Number(p[0]?.n ?? 0),
    messagesLast24h: Number(m[0]?.n ?? 0),
    qualifiedLeadsLast7d: Number(q[0]?.n ?? 0),
  };
}

export async function getLeadAnalysis(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byTemperature: Record<string, number>;
  recent: Array<{ name: string | null; phone: string; status: string | null; createdAt: Date | null }>;
}> {
  const db = await getDb();
  if (!db) return { total: 0, byStatus: {}, byTemperature: {}, recent: [] };

  const all: any[] = await db.select().from(contacts).orderBy(desc(contacts.createdAt)).limit(200);

  const byStatus: Record<string, number> = {};
  const byTemperature: Record<string, number> = {};
  for (const row of all) {
    const s = row.status ?? "unknown";
    const t = row.temperature ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    byTemperature[t] = (byTemperature[t] ?? 0) + 1;
  }

  return {
    total: all.length,
    byStatus,
    byTemperature,
    recent: all.slice(0, 10).map((r: any) => ({
      name: r.name ?? null,
      phone: r.phone ?? "",
      status: r.status ?? null,
      createdAt: r.createdAt ?? null,
    })),
  };
}

export async function getCampaignMetrics(): Promise<{
  total: number;
  active: number;
  totalSent: number;
  totalDelivered: number;
  totalReplies: number;
  topCampaigns: Array<{ name: string; sent: number; delivered: number; replies: number }>;
}> {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, totalSent: 0, totalDelivered: 0, totalReplies: 0, topCampaigns: [] };

  const all: any[] = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(50);

  let totalSent = 0;
  let totalDelivered = 0;
  let totalReplies = 0;
  let active = 0;
  for (const c of all) {
    totalSent += Number(c.sentCount ?? 0);
    totalDelivered += Number(c.deliveredCount ?? 0);
    totalReplies += Number(c.replyCount ?? 0);
    if (c.status === "active" || c.status === "running") active++;
  }

  const topCampaigns = all
    .map((c: any) => ({
      name: c.name ?? "(sem nome)",
      sent: Number(c.sentCount ?? 0),
      delivered: Number(c.deliveredCount ?? 0),
      replies: Number(c.replyCount ?? 0),
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5);

  return { total: all.length, active, totalSent, totalDelivered, totalReplies, topCampaigns };
}
