import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: reuniaoConvidados.checkinEm — entrada do convidado registrada na recepção do evento. Idempotente (só ADD COLUMN). */
export async function addCheckinEvento(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`ALTER TABLE reuniaoConvidados ADD COLUMN checkinEm TIMESTAMP NULL`);
    console.log('[Migration] ✅ addCheckinEvento');
  } catch (e: any) {
    const code = e?.code ?? e?.cause?.code;
    if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(String(e?.message ?? e?.cause?.message ?? ''))) console.warn('[Migration] addCheckinEvento:', e?.message);
  }
}
