import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

export async function addFinalidadeToProperties() {
  try {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`ALTER TABLE properties ADD COLUMN finalidade VARCHAR(20) NOT NULL DEFAULT 'venda'`);
    console.log('[Migration] ✅ finalidade adicionada em properties');
  } catch (e: any) {
    if (e?.message?.includes('Duplicate column') || e?.cause?.code === 'ER_DUP_FIELDNAME') {
      console.log('[Migration] ℹ️ finalidade já existe');
    } else {
      console.error('[Migration] Erro addFinalidadeToProperties:', e?.message);
    }
  }
}
