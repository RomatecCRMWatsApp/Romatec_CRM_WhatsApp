/**
 * ROMATEC CRM v9.0 — Gerenciamento de contatos (atribuição, bloqueio, próximo contato)
 *
 * BUG FIX: getNextContact agora atribui novos contatos quando os atuais estão esgotados,
 * incluindo durante mid-cycle. O reset de turno chama assignNewContactsToCampaign para
 * garantir 2 NOVOS contatos após cada turno.
 */

import { getDb } from '../db';
import { contacts, campaignContacts } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { CONTACTS_PER_CAMPAIGN } from './constants';

/**
 * Retorna o próximo contato 'pending' para uma campanha.
 * Se não houver nenhum, atribui novos contatos da pool global.
 */
export async function getNextContact(campaignId: number): Promise<typeof contacts.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  let ccList = await db.select().from(campaignContacts)
    .where(and(
      eq(campaignContacts.campaignId, campaignId),
      eq(campaignContacts.status, 'pending')
    ));

  if (ccList.length === 0) {
    // BUG FIX: Sem contatos pending — atribuir novos da pool geral (mid-cycle safe)
    console.log(`📥 [ContactMgr] Sem contatos pending — atribuindo novos para campanha ${campaignId}`);
    await assignContactsToCampaign(campaignId);

    ccList = await db.select().from(campaignContacts)
      .where(and(
        eq(campaignContacts.campaignId, campaignId),
        eq(campaignContacts.status, 'pending')
      ));
  }

  const shuffled = [...ccList].sort(() => Math.random() - 0.5);
  for (const cc of shuffled) {
    const result = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
    const contact = result[0];
    if (!contact || contact.status !== 'active') continue;
    return contact;
  }

  return null;
}

/**
 * Atribui até CONTACTS_PER_CAMPAIGN contatos livres para uma campanha.
 * "Livre" = não está em campaignContacts de nenhuma outra campanha.
 * globalUsedIds evita duplicação ao criar campanhas em lote.
 */
export async function assignContactsToCampaign(
  campaignId: number,
  globalUsedIds?: Set<number>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const allContacts = await db.select().from(contacts).where(eq(contacts.status, 'active'));

  const existingAssignments = await db.select().from(campaignContacts);
  const alreadyUsed = new Set<number>(existingAssignments.map(cc => cc.contactId));
  if (globalUsedIds) globalUsedIds.forEach(id => alreadyUsed.add(id));

  const available = allContacts.filter(c => !alreadyUsed.has(c.id));

  if (available.length < CONTACTS_PER_CAMPAIGN) {
    console.warn(`⚠️ [ContactMgr] Apenas ${available.length} contatos disponíveis para campanha ${campaignId}`);
  }

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, CONTACTS_PER_CAMPAIGN);

  for (const contact of selected) {
    if (globalUsedIds) globalUsedIds.add(contact.id);
    await db.insert(campaignContacts).values({
      campaignId,
      contactId: contact.id,
      messagesSent: 0,
      status: 'pending',
    });
  }

  console.log(`📱 [ContactMgr] ${selected.length} contato(s) designado(s) para campanha ${campaignId}`);
}

/**
 * Reset de turno: remove todos os contatos pending/blocked da campanha
 * e atribui CONTACTS_PER_CAMPAIGN novos contatos da pool global.
 *
 * BUG FIX: Era o que faltava no startResetMode/startNightMode — sem isso,
 * os mesmos 2 contatos voltavam na fila seguinte (nunca eram rotacionados).
 */
export async function assignNewContactsForShiftReset(campaignId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Remover vínculos existentes (pending e blocked)
  const { campaignContacts: cc } = await import('../../drizzle/schema');
  await db.delete(cc).where(eq(cc.campaignId, campaignId));

  console.log(`🔄 [ContactMgr] Contatos anteriores removidos para campanha ${campaignId} — atribuindo novos`);
  await assignContactsToCampaign(campaignId);
}

/**
 * Desbloqueio por resposta: marca contato como 'pending' em todas as campanhas
 * onde estava 'blocked' (chamado pelo webhook quando lead responde).
 */
export async function unblockContactByReply(contactId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(campaignContacts)
    .set({ status: 'pending', messagesSent: 0 })
    .where(and(
      eq(campaignContacts.contactId, contactId),
      eq(campaignContacts.status, 'blocked')
    ));

  console.log(`🔓 [ContactMgr] Contato ${contactId} desbloqueado por resposta`);
}
