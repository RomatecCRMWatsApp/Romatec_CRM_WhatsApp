import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Migration: limpa messageSendLog e adiciona UNIQUE INDEX (campaignId, cycleHour)
 *
 * messageSendLog é uma tabela de controle operacional (não guarda histórico crítico).
 * Limpar garante que o índice seja criado sem falha por duplicatas residuais.
 */
export async function addUniqueCampaignCycleHour() {
  const db = await getDb();
  if (!db) return;

  // Verificar se o índice já existe — se sim, não fazer nada
  try {
    const rows: any[] = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'messageSendLog'
        AND INDEX_NAME   = 'unique_campaign_cycle_hour'
    `) as any;
    const cnt = rows?.[0]?.[0]?.cnt ?? rows?.[0]?.cnt ?? 0;
    if (Number(cnt) > 0) {
      console.log('[Migration] ℹ️ unique_campaign_cycle_hour já existe — OK');
      return;
    }
  } catch {
    // continua para tentar criar
  }

  // Limpar tabela inteira (tabela de controle, sem dados críticos)
  try {
    await db.execute(sql`DELETE FROM messageSendLog WHERE 1=1`);
    console.log('[Migration] 🧹 messageSendLog limpo para criação do índice');
  } catch (e: any) {
    console.warn('[Migration] ⚠️ Falha ao limpar messageSendLog:', String(e?.message || '').substring(0, 80));
  }

  // Criar o índice único
  try {
    await db.execute(sql`
      ALTER TABLE messageSendLog
      ADD UNIQUE INDEX unique_campaign_cycle_hour (campaignId, cycleHour)
    `);
    console.log('[Migration] ✅ unique_campaign_cycle_hour criado em messageSendLog');
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('Duplicate key name') || msg.includes('already exists')) {
      console.log('[Migration] ℹ️ unique_campaign_cycle_hour já existe — OK');
    } else {
      console.error('[Migration] Erro addUniqueCampaignCycleHour:', msg.substring(0, 120));
    }
  }
}
