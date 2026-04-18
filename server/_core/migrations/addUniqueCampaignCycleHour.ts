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
  try {
    await db.execute(sql`
      ALTER TABLE messageSendLog
      ADD UNIQUE INDEX unique_campaign_cycle_hour (campaignId, cycleHour)
    `);
    console.log('[Migration] ✅ unique_campaign_cycle_hour adicionado em messageSendLog');
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('Duplicate key name') || msg.includes('already exists')) {
      console.log('[Migration] ℹ️ unique_campaign_cycle_hour já existe');
    } else if (msg.includes('Duplicate entry')) {
      // Existem registros duplicados — limpar antes de criar o índice
      console.log('[Migration] ⚠️ Registros duplicados encontrados — limpando antes de criar índice...');
      try {
        await db.execute(sql`
          DELETE t1 FROM messageSendLog t1
          INNER JOIN messageSendLog t2
          WHERE t1.id > t2.id
            AND t1.campaignId = t2.campaignId
            AND t1.cycleHour = t2.cycleHour
        `);
        await db.execute(sql`
          ALTER TABLE messageSendLog
          ADD UNIQUE INDEX unique_campaign_cycle_hour (campaignId, cycleHour)
        `);
        console.log('[Migration] ✅ Duplicatas removidas e índice criado');
      } catch (e2: any) {
        console.error('[Migration] Erro ao limpar duplicatas:', String(e2?.message || '').substring(0, 120));
      }
    } else {
      console.error('[Migration] Erro addUniqueCampaignCycleHour:', msg.substring(0, 120));
    }
  }
}
