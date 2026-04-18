import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Limpeza pontual: remove o envio duplicado de Thalita (Mod_Vaz-03, 17/Apr/2026 22h)
 *
 * O processo antigo enviou para Poliana (22:01) e o novo processo enviou para Thalita
 * (22:21) no mesmo slot, violando a regra de 1 msg/hora por campanha.
 *
 * Ação:
 * - Remove o registro duplicado de Thalita no messageSendLog
 * - Reseta o status de Thalita em campaignContacts para 'pending' (volta à fila)
 */
export async function cleanupThalitaDuplicateSend() {
  const db = await getDb();
  if (!db) return;
  try {
    // Remove o registro duplicado de Thalita na campanha Mod_Vaz-03
    await db.execute(sql`
      DELETE FROM messageSendLog
      WHERE campaignId = 60150
        AND contactPhone = '5599991299285'
        AND sentAt >= '2026-04-17 22:00:00'
        AND sentAt < '2026-04-17 23:00:00'
    `);

    // Reseta status de Thalita em campaignContacts → volta para fila de envios
    await db.execute(sql`
      UPDATE campaignContacts
      SET status = 'pending', messagesSent = GREATEST(messagesSent - 1, 0)
      WHERE campaignId = 60150
        AND contactId = (
          SELECT id FROM contacts
          WHERE REPLACE(phone, '-', '') LIKE '%5599991299285%'
          LIMIT 1
        )
    `);

    console.log('[Migration] ✅ cleanupThalitaDuplicateSend: registro duplicado removido, contato resetado');
  } catch (e: any) {
    // Não crítico — provavelmente já foi limpo manualmente
    console.log('[Migration] ℹ️ cleanupThalitaDuplicateSend:', String(e?.message || '').substring(0, 120));
  }
}
