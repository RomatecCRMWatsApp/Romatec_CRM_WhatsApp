import { eq } from "drizzle-orm";
import { InsertUser, users, contacts, InsertContact, properties, InsertProperty, campaigns, InsertCampaign, companyConfig, InsertCompanyConfig } from "../drizzle/schema";
import { ENV } from './_core/env';

// ─── Driver detection ─────────────────────────────────────────────────────
let _db: any = null;
let _dbDriver: 'mysql' | 'sqlite' = 'mysql';
/** Conexão em andamento: chamadas simultâneas na partida esperam a mesma (antes cada uma podia abrir um pool próprio) */
let _abrindo: Promise<any> | null = null;
let _pool: any = null;
/** Requisições que tiveram de esperar conexão desde a última leitura (evento 'enqueue' do mysql2) */
let _esperas = 0;

const inteiro = (v: string | undefined, padrao: number, min: number, max: number) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/**
 * Pool MySQL (processo Node persistente no Railway: um pool por processo, reaproveitado).
 * - connectionLimit 10 (DB_POOL_LIMITE): valor que já estava em produção; réplicas × limite deve caber no max_connections do MySQL.
 * - queueLimit 500 (DB_POOL_FILA): antes ilimitado; acima disso a requisição falha na hora em vez de acumular memória e espera.
 * - keep-alive: evita sockets mortos pelo proxy após períodos ociosos (ECONNRESET na primeira consulta depois da pausa).
 * - idleTimeout 60 s / maxIdle: devolve conexões ociosas sem fechar o pool a cada consulta.
 */
export function opcoesPool(env: Record<string, string | undefined> = process.env) {
  const limite = inteiro(env.DB_POOL_LIMITE, 10, 1, 50);
  return {
    waitForConnections: true,
    connectionLimit: limite,
    maxIdle: Math.min(limite, inteiro(env.DB_POOL_OCIOSAS, 5, 0, 50)),
    idleTimeout: 60_000,
    queueLimit: inteiro(env.DB_POOL_FILA, 500, 0, 10_000),
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  };
}

/** Situação do pool para diagnóstico (sem dados de conexão) */
export function situacaoPool(): { driver: 'mysql' | 'sqlite'; limite?: number; emUso?: number; livres?: number; fila?: number; esperas?: number } {
  if (_dbDriver === 'sqlite' || !_pool) return { driver: _dbDriver };
  const p = _pool.pool ?? _pool; // mysql2/promise embrulha o pool de callbacks
  const total = p._allConnections?.length ?? 0, livres = p._freeConnections?.length ?? 0;
  const esperas = _esperas; _esperas = 0;
  return { driver: 'mysql', limite: p.config?.connectionLimit, emUso: total - livres, livres, fila: p._connectionQueue?.length ?? 0, esperas };
}

/** Encerramento controlado (SIGTERM do deploy): espera as consultas em curso e fecha o pool */
export async function fecharDb(): Promise<void> {
  const p = _pool; _pool = null; _db = null; _abrindo = null;
  if (p) await p.end().catch(() => undefined);
}

export function getDbDriver(): 'mysql' | 'sqlite' { return _dbDriver; }

/**
 * Transação no MySQL; no SQLite dos testes (better-sqlite3 só aceita transação síncrona) roda direto no banco.
 */
export function transacao<T>(db: any, f: (tx: any) => Promise<T>): Promise<T> {
  return _dbDriver === 'sqlite' ? f(db) : db.transaction(f);
}

export async function getDb(): Promise<any> {
  if (_db) return _db;
  if (!_abrindo) _abrindo = abrirDb().finally(() => { _abrindo = null; });
  return _abrindo;
}

async function abrirDb(): Promise<any> {
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
      // O esquema é MySQL (boolean): no SQLite, true/false viram 1/0 (o better-sqlite3 não aceita booleano)
      const preparar = sqlite.prepare.bind(sqlite);
      const conv = (v: unknown): unknown => (typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) ? v.map(conv) : v);
      (sqlite as any).prepare = (fonte: string) => {
        // defaultNow() do esquema MySQL gera now(), que o SQLite não tem
        const st: any = preparar(fonte.replace(/\bnow\(\)/gi, 'CURRENT_TIMESTAMP'));
        for (const m of ['run', 'get', 'all', 'iterate'] as const) {
          const orig = st[m].bind(st);
          st[m] = (...args: unknown[]) => orig(...args.map(conv));
        }
        return st;
      };
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
        ...opcoesPool(),
      });
      _pool = pool;
      pool.on('enqueue', () => { _esperas++; });
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
