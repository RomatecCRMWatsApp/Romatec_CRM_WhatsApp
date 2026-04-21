/**
 * ROMATEC CRM v9.0 — Qualificação do bot (janela de 45 min após dispatch)
 *
 * Follow-ups de persuasão: T+5/15/25/35/44 min
 */

import { registerBotMessage, getFollowUpsToSend, cleanupOldFollowUps } from '../bot-ai';
import { sendViaZAPI } from './messageDispatcher';

/** Registra uma mensagem enviada no bot para iniciar a janela de qualificação */
export async function registerBotDispatch(
  phone: string,
  name: string,
  campaignId: number,
  messageText: string
): Promise<void> {
  await registerBotMessage(phone, name, campaignId, messageText);
}

/** Processa e envia todos os follow-ups pendentes (T+5/15/25/35/44 min) */
export async function processFollowUps(): Promise<void> {
  try {
    cleanupOldFollowUps();
    const dues = getFollowUpsToSend();
    for (const { phone, message, step } of dues) {
      try {
        await sendViaZAPI(phone, message);
        console.log(`🎯 Follow-up T+step${step} enviado para ${phone}`);
      } catch (e) {
        console.error(`❌ Erro follow-up step${step} para ${phone}:`, e);
      }
    }
  } catch (e) {
    console.error('❌ Erro no processamento de follow-ups:', e);
  }
}
