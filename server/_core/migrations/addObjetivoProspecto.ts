import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Prospecção B2B com dois objetivos (AvalieImob e Parceria Bom Jardims): coluna prospectos.objetivo.
 * Idempotente e não destrutiva (só ADD COLUMN); os prospectos existentes ficam como "avalieimob", que era o único uso.
 */
export async function addObjetivoProspecto(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql.raw(`ALTER TABLE prospectos ADD COLUMN objetivo VARCHAR(20) NOT NULL DEFAULT 'avalieimob' AFTER categoria`));
    console.log('[Migration] ✅ addObjetivoProspecto');
  } catch (e: any) {
    const code = e?.code ?? e?.cause?.code ?? '';
    if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.warn('[Migration] addObjetivoProspecto:', e?.message);
  }
}
