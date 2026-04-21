// @module DispatchManager — Agendamento e disparo de mensagens com timing aleatório (0-15min)

/**
 * ROMATEC CRM v9.0 — Gerenciamento de disparo de mensagens
 *
 * Responsabilidades:
 * - Agendamento do slot de envio com minuto aleatório (0-15)
 * - DB guard duplo (schedule + dispatch) para zero-downtime deploys
 * - Envio personalizado com link de imóvel incluso
 * - Atualização de contadores pós-envio (sentCount, campaignContacts, messageSendLog)
 * - Notificações pós-envio (Telegram, bot de qualificação, histórico)
 */

import { getDb } from '../../db';
import {
  campaigns,
  contacts,
  messages,
  campaignContacts,
  messageSendLog,
  properties,
} from '../../../drizzle/schema';
import { eq, and, ne } from 'drizzle-orm';
import { notifyMessageSent } from '../../_core/telegramNotification';
import { getBrasiliaDate } from '../utils';
import { SEND_WINDOW_END_MIN, MAX_ATTEMPTS_NO_RESPONSE, MAX_HOURS_PER_CYCLE } from '../constants';
import type { SchedulerState, SlotInfo } from '../types/campaign.types';

/**
 * Calcula o delay em ms até o minuto aleatório dentro da janela 0-SEND_WINDOW_END_MIN.
 * Retorna mínimo de 1000ms para evitar disparo imediato acidental.
 */
export function calcSlotDelayMs(): { delayMs: number; randomMinute: number } {
  const now = getBrasiliaDate();
  const minutesIntoHour = now.getMinutes();
  const secondsIntoHour = minutesIntoHour * 60 + now.getSeconds();
  const randomMinute = Math.floor(Math.random() * (SEND_WINDOW_END_MIN + 1));
  const targetSecondInHour = randomMinute * 60;
  const delaySeconds = targetSecondInHour - secondsIntoHour;
  const delayMs = Math.max(1000, delaySeconds * 1000);
  return { delayMs, randomMinute };
}

/** Pré-registra envio como 'pending' no messageSendLog antes de chamar Z-API */
export async function preSendLog(db: any, cleanPhone: string, campaignId: number, cycleHour: number): Promise<void> {
  const now = new Date();
  try {
    await db.insert(messageSendLog).values({
      contactPhone: cleanPhone,
      campaignId,
      sentAt: now,
      cycleHour,
      status: 'pending',
    });
  } catch (pendingErr: any) {
    if (String(pendingErr?.message).includes('Duplicate')) {
      await db.update(messageSendLog)
        .set({ status: 'pending', contactPhone: cleanPhone, sentAt: now })
        .where(and(
          eq(messageSendLog.campaignId, campaignId),
          eq(messageSendLog.cycleHour, cycleHour),
          ne(messageSendLog.status, 'sent')
        ));
    }
  }
}

/** Verifica se a campanha já enviou nesta hora (guard de DB) */
export async function checkCampAlreadySentThisHour(db: any, campaignId: number, cycleHour: number): Promise<boolean> {
  const rows = await db
    .select({ status: messageSendLog.status })
    .from(messageSendLog)
    .where(and(
      eq(messageSendLog.campaignId, campaignId),
      eq(messageSendLog.cycleHour, cycleHour),
      ne(messageSendLog.status, 'failed')
    ))
    .limit(1);
  return rows.length > 0;
}

/** Verifica se o contato (phone) já recebeu mensagem confirmada nesta hora */
export async function checkContactAlreadySentThisHour(db: any, cleanPhone: string, cycleHour: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(messageSendLog)
    .where(and(
      eq(messageSendLog.contactPhone, cleanPhone),
      eq(messageSendLog.cycleHour, cycleHour),
      ne(messageSendLog.status, 'pending')
    ))
    .limit(1);
  return rows.length > 0;
}

/**
 * Confirma envio bem-sucedido: pending→sent, atualiza campaignContacts,
 * insere em messages, incrementa sentCount e dispara notificações.
 */
export async function confirmSend(params: {
  db: any;
  campaign: any;
  contact: any;
  cleanPhone: string;
  personalized: string;
  cycleHour: number;
  state: SchedulerState;
  onMarkSent: (campaignId: number) => void;
  onMarkSlotSent: (campaignId: number) => void;
}): Promise<void> {
  const { db, campaign, contact, cleanPhone, personalized, cycleHour, state, onMarkSent, onMarkSlotSent } = params;

  // pending → sent
  try {
    await db.update(messageSendLog)
      .set({ status: 'sent', reason: null })
      .where(and(
        eq(messageSendLog.contactPhone, cleanPhone),
        eq(messageSendLog.cycleHour, cycleHour)
      ));
    const hourLabel = new Date(cycleHour * 3600000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log(`📊 [DispatchMgr] Confirmado: ${cleanPhone} em ciclo ${hourLabel}`);
  } catch (logErr) {
    console.error(`❌ [DispatchMgr] Erro ao confirmar envio:`, logErr);
  }

  // Incrementar contador sem-resposta
  const ccRow = await db.select().from(campaignContacts)
    .where(and(eq(campaignContacts.campaignId, campaign.id), eq(campaignContacts.contactId, contact.id)))
    .limit(1);
  const newCount = (ccRow[0]?.messagesSent || 0) + 1;
  const reachedLimit = newCount >= MAX_ATTEMPTS_NO_RESPONSE;

  await db.update(campaignContacts)
    .set({
      status: reachedLimit ? 'blocked' : 'pending',
      messagesSent: newCount,
      lastMessageSent: new Date(),
    })
    .where(and(
      eq(campaignContacts.campaignId, campaign.id),
      eq(campaignContacts.contactId, contact.id)
    ));

  if (reachedLimit) {
    console.log(`🚫 [DispatchMgr] ${contact.name}: ${newCount} msgs sem resposta → bloqueado`);
  }

  // Registrar mensagem
  await db.insert(messages).values({
    campaignId: campaign.id,
    contactId: contact.id,
    propertyId: campaign.propertyId,
    messageText: personalized,
    status: 'sent',
    sentAt: new Date(),
  });

  await db.update(campaigns).set({ sentCount: (campaign.sentCount || 0) + 1 }).where(eq(campaigns.id, campaign.id));

  onMarkSent(campaign.id);
  onMarkSlotSent(campaign.id);

  console.log(`✅ [DispatchMgr] Enviado! Total: ${state.totalSent + 1}`);

  // Notificar Telegram
  notifyMessageSent({
    contactName: contact.name || contact.phone,
    contactPhone: contact.phone,
    campaignName: campaign.name,
    messageText: personalized,
    cycleHour: state.hourNumber,
    maxCycle: MAX_HOURS_PER_CYCLE,
    messagesSent: newCount,
  }).catch(e => console.warn('[Telegram] notifyMessageSent falhou (não crítico):', e));
}

/** Registra falha de envio no messageSendLog e na tabela messages */
export async function recordFailedSend(params: {
  db: any;
  campaign: any;
  contact: any;
  cleanPhone: string;
  personalized: string;
  cycleHour: number;
  reason: 'zapi_error' | 'invalid_phone';
}): Promise<void> {
  const { db, campaign, contact, cleanPhone, personalized, cycleHour, reason } = params;

  await db.update(messageSendLog)
    .set({ status: 'failed', reason })
    .where(and(eq(messageSendLog.contactPhone, cleanPhone), eq(messageSendLog.cycleHour, cycleHour)));

  if (reason === 'invalid_phone') {
    await db.update(campaignContacts)
      .set({ status: 'failed' })
      .where(and(
        eq(campaignContacts.campaignId, campaign.id),
        eq(campaignContacts.contactId, contact.id)
      ));
    return;
  }

  await db.insert(messages).values({
    campaignId: campaign.id,
    contactId: contact.id,
    propertyId: campaign.propertyId,
    messageText: personalized,
    status: 'failed',
    sentAt: new Date(),
  });
}

/** Busca o link do imóvel da campanha e retorna a mensagem formatada */
export async function getPropertyLinkMessage(campaignId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const campRows = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    const camp = campRows[0];
    if (!camp?.propertyId) return null;
    const propRows = await db.select().from(properties).where(eq(properties.id, camp.propertyId)).limit(1);
    const prop = propRows[0];
    if (!prop) return null;
    const slug = (prop as any).publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `https://romateccrm.com/imovel/${slug}`;
    return `📸 *Veja as fotos e detalhes completos aqui:*\n${url}`;
  } catch {
    return null;
  }
}
