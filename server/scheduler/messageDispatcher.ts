/**
 * ROMATEC CRM v9.0 — Envio de mensagens via Z-API
 */

import type { SendResult } from './types';
import { MAX_ZAPI_FAILS } from './constants';

let zapiConsecutiveFails = 0;

/** Reseta o contador de falhas Z-API (chamado após envio bem-sucedido) */
export function resetZApiFailCount(): void {
  zapiConsecutiveFails = 0;
}

/** Retorna o número atual de falhas Z-API consecutivas */
export function getZApiFailCount(): number {
  return zapiConsecutiveFails;
}

/**
 * Envia mensagem via Z-API ou simulação.
 * Retorna 'sent', 'failed' ou 'invalid' (número de telefone inválido).
 */
export async function sendViaZAPI(
  phone: string,
  message: string,
  onAutoStop?: () => Promise<void>
): Promise<SendResult> {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    let formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Auto-fix: 12 dígitos = número BR antigo sem o 9 (ex: 5599XXXXXXXX → 55999XXXXXXXX)
    if (formattedPhone.length === 12 && formattedPhone.startsWith('55')) {
      formattedPhone = formattedPhone.slice(0, 4) + '9' + formattedPhone.slice(4);
      console.log(`📱 Auto-fix telefone 12→13: ${phone} → ${formattedPhone}`);
    }

    if (formattedPhone.length !== 13 || formattedPhone[4] !== '9') {
      console.warn(`⚠️ Número inválido (${formattedPhone.length}d): ${phone} → pulando`);
      return 'invalid';
    }

    const { getCompanyConfig } = await import('../db');
    const config = await getCompanyConfig();

    if (config?.zApiInstanceId && config?.zApiToken) {
      const { sendMessageViaZAPI } = await import('../zapi-integration');
      const result = await sendMessageViaZAPI({
        instanceId: config.zApiInstanceId,
        token: config.zApiToken,
        clientToken: config.zApiClientToken || undefined,
        phone,
        message,
      });
      console.log(`📨 [Z-API] ${phone}: ${result.success ? '✅' : '❌'}`);

      if (result.success) {
        zapiConsecutiveFails = 0;
        return 'sent';
      } else {
        zapiConsecutiveFails++;
        console.warn(`⚠️ [Z-API] Falha consecutiva ${zapiConsecutiveFails}/${MAX_ZAPI_FAILS}`);
        if (zapiConsecutiveFails >= MAX_ZAPI_FAILS && onAutoStop) {
          await handleZApiDown(config, onAutoStop);
        }
        return 'failed';
      }
    } else {
      console.log(`📨 [SIMULADO] ${phone}: "${message.substring(0, 50)}..."`);
      return 'sent';
    }
  } catch (error) {
    console.error('❌ Erro Z-API:', error);
    zapiConsecutiveFails++;
    return 'failed';
  }
}

/** Chamado quando Z-API falha MAX_ZAPI_FAILS vezes seguidas */
async function handleZApiDown(config: any, onAutoStop: () => Promise<void>): Promise<void> {
  console.error(`🚨 [Z-API] ${MAX_ZAPI_FAILS} falhas consecutivas — pausando scheduler automaticamente`);
  await onAutoStop();

  try {
    const { setZApiAutopausedFlag } = await import('./stateManager');
    await setZApiAutopausedFlag(true);
  } catch (e) {
    console.error('[Z-API] Erro ao salvar zapiAutopaused:', e);
  }

  try {
    const { updateCompanyConfig } = await import('../db');
    await updateCompanyConfig({ zApiConnected: false });
  } catch (e) {
    console.error('[Z-API] Erro ao atualizar status no banco:', e);
  }

  try {
    const { notifyZApiDown } = await import('../_core/telegramNotification');
    await notifyZApiDown().catch(e => console.warn('[Telegram] notifyZApiDown falhou:', e));
  } catch (e) {
    console.warn('[Telegram] Erro ao importar notifyZApiDown:', e);
  }
}

/**
 * Personaliza a mensagem com o nome do contato.
 * Suporta {NOME} e {{NOME}}.
 */
export function personalizeMessage(messageText: string, contact: { name: string; phone: string }): string {
  const firstName = (contact.name || '').split(' ')[0].trim();
  let personalized = messageText;

  if (firstName && firstName.length > 1) {
    personalized = personalized.replace(/\{\{NOME\}\}/g, firstName);
    personalized = personalized.replace(/\{NOME\}/g, firstName);
  } else {
    personalized = personalized.replace(/\{\{NOME\}\},?\s*/g, '');
    personalized = personalized.replace(/\{NOME\},?\s*/g, '');
  }
  return personalized;
}
