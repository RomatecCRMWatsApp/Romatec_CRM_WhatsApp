// @module ContactManager — Busca, atribuição e desbloqueio de contatos por campanha

/**
 * ROMATEC CRM v9.0 — Gerenciamento de contatos (atribuição, bloqueio, próximo contato)
 *
 * Re-exporta as funções já implementadas em ../contactManager.ts (módulo raiz)
 * e adiciona updateContactHistory para manter histórico de contato×campanha.
 */

export {
  getNextContact,
  assignContactsToCampaign,
  assignNewContactsForShiftReset,
  unblockContactByReply,
} from '../contactManager';

import { getDb } from '../../db';
import { contactCampaignHistory } from '../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Atualiza (ou cria) o histórico de contato × campanha após envio bem-sucedido.
 */
export async function updateContactHistory(contactId: number, campaignId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db.select().from(contactCampaignHistory)
    .where(and(
      eq(contactCampaignHistory.contactId, contactId),
      eq(contactCampaignHistory.campaignId, campaignId)
    )).limit(1);

  if (existing[0]) {
    await db.update(contactCampaignHistory)
      .set({ lastCampaignId: campaignId, sentAt: new Date() })
      .where(eq(contactCampaignHistory.id, existing[0].id));
  } else {
    await db.insert(contactCampaignHistory).values({
      contactId,
      campaignId,
      lastCampaignId: campaignId,
      sentAt: new Date(),
    });
  }
}
