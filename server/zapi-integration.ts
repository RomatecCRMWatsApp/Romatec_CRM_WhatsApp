/**
 * Z-API WhatsApp Integration
 * Gerencia envio de mensagens via Z-API com controle de taxa e retry
 */

import axios from 'axios';

const ZAPI_BASE_URL = 'https://api.z-api.io/instances';

interface SendMessageParams {
  instanceId: string;
  token: string;
  clientToken?: string;
  phone: string;
  message: string;
}

interface ZAPIResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  attempts?: number;
}

/**
 * Enviar mensagem de TEXTO via Z-API COM RETRY AUTOMÁTICO
 * Endpoint correto: /send-text
 * Tenta até 3 vezes com backoff exponencial
 */
export async function sendMessageViaZAPI({
  instanceId,
  token,
  clientToken,
  phone,
  message,
}: SendMessageParams): Promise<ZAPIResponse> {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 2000; // 2 segundos

  // Formatar número
  const cleanPhone = phone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('55')
    ? cleanPhone
    : `55${cleanPhone}`;

  if (!formattedPhone || formattedPhone.length < 12) {
    return { success: false, error: 'Número inválido', attempts: 0 };
  }

  // Headers com Client-Token obrigatório
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        `${ZAPI_BASE_URL}/${instanceId}/token/${token}/send-text`,
        {
          phone: formattedPhone,
          message: message,
        },
        {
          headers,
          timeout: 15000,
        }
      );

      if (response.status === 200 && response.data?.messageId) {
        return {
          success: true,
          messageId: response.data.messageId,
          attempts: attempt,
        };
      }

      // Z-API pode retornar 200 mas com zapiMessageId em vez de messageId
      if (response.status === 200 && (response.data?.zapiMessageId || response.data?.id)) {
        return {
          success: true,
          messageId: response.data.zapiMessageId || response.data.id,
          attempts: attempt,
        };
      }

      // Resposta sem messageId - tentar novamente
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`⏳ Retry ${attempt}/${MAX_RETRIES} em ${delay}ms para ${formattedPhone}`);
        await sleep(delay);
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error?.message || 'Erro desconhecido';
      console.error(`❌ Tentativa ${attempt}/${MAX_RETRIES} falhou para ${formattedPhone}: ${errMsg}`);

      // Não fazer retry em erros de autenticação (401/403)
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return { success: false, error: 'Credenciais Z-API inválidas', attempts: attempt };
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: `Falha após ${MAX_RETRIES} tentativas`,
    attempts: MAX_RETRIES,
  };
}

/**
 * Validar conexão com Z-API (com Client-Token)
 */
export async function validateZAPIConnection(
  instanceId: string,
  token: string,
  clientToken?: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }
    const response = await axios.get(
      `${ZAPI_BASE_URL}/${instanceId}/token/${token}/status`,
      { timeout: 5000, headers }
    );
    return response.status === 200;
  } catch (error) {
    console.error('Erro ao validar conexão Z-API:', error);
    return false;
  }
}

/**
 * Obter status da instância Z-API
 */
export async function getZAPIStatus(
  instanceId: string,
  token: string,
  clientToken?: string
): Promise<{ connected: boolean; phone?: string }> {
  try {
    const headers: Record<string, string> = {};
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }
    const response = await axios.get(
      `${ZAPI_BASE_URL}/${instanceId}/token/${token}/status`,
      { timeout: 5000, headers }
    );

    if (response.status === 200 && response.data?.connected) {
      return { connected: true, phone: response.data.phone };
    }
    return { connected: false };
  } catch (error) {
    return { connected: false };
  }
}

/**
 * Processar webhook de resposta do WhatsApp (Z-API)
 * Chamado quando o cliente responde uma mensagem
 */
export interface WebhookPayload {
  phone: string;
  message: string;
  messageId?: string;
  timestamp?: number;
  isGroup?: boolean;
  senderName?: string;
}

export function parseWebhookPayload(body: any): WebhookPayload | null {
  try {
    // Z-API envia diferentes formatos de webhook
    const phone = body?.phone || body?.from || body?.chatId?.replace('@c.us', '');
    const message = body?.text?.message || body?.message || body?.body || '';
    const messageId = body?.messageId || body?.id;
    const isGroup = body?.isGroup || body?.isGroupMsg || false;

    if (!phone) return null;

    // Ignorar mensagens de grupo
    if (isGroup) return null;

    return {
      phone: phone.replace(/\D/g, ''),
      message,
      messageId,
      timestamp: body?.timestamp || Date.now(),
      isGroup: false,
      senderName: body?.senderName || body?.pushName || '',
    };
  } catch {
    return null;
  }
}

/**
 * Lógica de envio com controle de taxa (2 mensagens por hora)
 */
export class MessageScheduler {
  private instanceId: string;
  private token: string;
  private clientToken?: string;
  private messagesPerHour = 2;
  private delayBetweenMessages = (60 * 60 * 1000) / this.messagesPerHour;

  constructor(instanceId: string, token: string, clientToken?: string) {
    this.instanceId = instanceId;
    this.token = token;
    this.clientToken = clientToken;
  }

  async sendMessagesWithDelay(
    messages: Array<{ phone: string; text: string }>
  ): Promise<Array<{ phone: string; success: boolean; messageId?: string }>> {
    const results = [];

    for (let i = 0; i < messages.length; i++) {
      const { phone, text } = messages[i];

      const result = await sendMessageViaZAPI({
        instanceId: this.instanceId,
        token: this.token,
        clientToken: this.clientToken,
        phone,
        message: text,
      });

      results.push({
        phone,
        success: result.success,
        messageId: result.messageId,
      });

      if (i < messages.length - 1) {
        const variation = this.delayBetweenMessages * 0.3;
        const randomDelay =
          this.delayBetweenMessages + (Math.random() - 0.5) * 2 * variation;
        await sleep(randomDelay);
      }
    }

    return results;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
