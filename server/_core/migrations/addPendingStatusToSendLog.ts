import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Migration: adiciona status 'pending' ao ENUM de messageSendLog
 *
 * Permite o fluxo pending → sent:
 *   - ANTES do envio: INSERT com status='pending'
 *   - APÓS confirmação Z-API: UPDATE status='sent'
 *   - No boot: pending antigos marcados como 'failed' → slot liberado para retry
 */
export async function addPendingStatusToSendLog() {
  try {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`
      ALTER TABLE messageSendLog
      MODIFY COLUMN status
      ENUM('sent', 'skipped_duplicate', 'failed', 'pending')
      NOT NULL DEFAULT 'sent'
    `);
    console.log('[Migration] ✅ status pending adicionado em messageSendLog');
  } catch (e: any) {
    const msg = String(e?.message || '');
    // Ignorar se já existe (MySQL não retorna erro específico, mas pode falhar em edge cases)
    console.log('[Migration] ℹ️ addPendingStatusToSendLog:', msg.substring(0, 120));
  }
}
