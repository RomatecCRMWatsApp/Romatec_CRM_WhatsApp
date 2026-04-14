/**
 * Altera plantaBaixaUrl de TEXT para MEDIUMTEXT (suporta base64 de PDFs até ~16MB)
 */
import { getDb } from '../../db';

export async function enlargePlantaBaixaUrl() {
  try {
    const db = await getDb();
    if (!db) return;
    const conn = (db as any).session?.client?.pool?.query
      ? null
      : (db as any);

    // Executar via query raw
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`ALTER TABLE properties MODIFY COLUMN plantaBaixaUrl MEDIUMTEXT`);
    console.log('[Migration] ✅ plantaBaixaUrl → MEDIUMTEXT');
  } catch (e: any) {
    if (e?.message?.includes('MEDIUMTEXT')) {
      console.log('[Migration] ℹ️ plantaBaixaUrl já é MEDIUMTEXT');
    } else {
      console.error('[Migration] Erro enlargePlantaBaixaUrl:', e?.message);
    }
  }
}
