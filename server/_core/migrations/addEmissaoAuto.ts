import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: contratos.entradaPagaNoAto — entrada recebida na assinatura (sem boleto). Idempotente (só ADD COLUMN). */
export async function addEmissaoAuto(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`ALTER TABLE contratos ADD COLUMN entradaPagaNoAto BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log('[Migration] ✅ addEmissaoAuto');
  } catch (e: any) {
    const code = e?.code ?? e?.cause?.code;
    if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(String(e?.message ?? e?.cause?.message ?? ''))) console.warn('[Migration] addEmissaoAuto:', e?.message);
  }
}
