import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Migration: remove registros de messageSendLog no formato antigo de cycleHour
 *
 * Formato antigo: epoch-seconds (ex: 1776081600) — números > 1.000.000
 * Formato novo:   horas absolutas desde epoch (ex: 493488) — números < 100.000
 *
 * Registros no formato antigo causavam falsos positivos: o scheduler bloqueava
 * campanhas do dia atual porque o valor epoch-seconds de um dia anterior coincidia
 * com algum cycleHour novo quando filtrado sem verificar a magnitude do número.
 */
export async function cleanupOldCycleHourFormat() {
  try {
    const db = await getDb();
    if (!db) return;

    // Apaga registros antigos (formato epoch-seconds) e registros com mais de 25h no novo formato
    const currentCycleHour = Math.floor(Date.now() / 3600000);
    const cutoffHour = currentCycleHour - 25;

    await db.execute(sql`
      DELETE FROM messageSendLog
      WHERE cycleHour > 1000000
         OR cycleHour < ${cutoffHour}
    `);
    console.log('[Migration] ✅ cleanupOldCycleHourFormat: registros legados removidos');
  } catch (e: any) {
    console.error('[Migration] Erro cleanupOldCycleHourFormat:', e?.message?.substring(0, 120));
  }
}
