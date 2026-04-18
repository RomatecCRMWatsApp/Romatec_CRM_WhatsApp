import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Migration: adiciona UNIQUE INDEX (campaignId, cycleHour) em messageSendLog
 *
 * Garante que cada campanha envie no máximo 1 mensagem por hora ao nível do banco,
 * bloqueando o problema de double-send em deploys zero-downtime (dois processos
 * Node.js rodam simultaneamente durante o deploy do Railway).
 */
export async function addUniqueCampaignCycleHour() {
  const db = await getDb();
  if (!db) return;

  // Passo 1: remover duplicatas ANTES de criar o índice (manter o mais recente)
  try {
    await db.execute(sql`
      DELETE m1 FROM messageSendLog m1
      INNER JOIN messageSendLog m2
        ON m1.campaignId = m2.campaignId
       AND m1.cycleHour  = m2.cycleHour
       AND m1.id < m2.id
    `);
    console.log('[Migration] ✅ Dedup (campaignId, cycleHour): duplicatas antigas removidas');
  } catch (e: any) {
    console.warn('[Migration] ⚠️ Dedup falhou (não crítico):', String(e?.message || '').substring(0, 120));
  }

  // Passo 2: criar o índice único
  try {
    await db.execute(sql`
      ALTER TABLE messageSendLog
      ADD UNIQUE INDEX unique_campaign_cycle_hour (campaignId, cycleHour)
    `);
    console.log('[Migration] ✅ unique_campaign_cycle_hour adicionado em messageSendLog');
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('Duplicate key name') || msg.includes('already exists')) {
      console.log('[Migration] ℹ️ unique_campaign_cycle_hour já existe — OK');
    } else {
      console.error('[Migration] Erro addUniqueCampaignCycleHour:', msg.substring(0, 120));
    }
  }
}
