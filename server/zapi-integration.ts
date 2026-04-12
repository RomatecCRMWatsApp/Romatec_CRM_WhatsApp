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

  // Validação estrita: celular BR = 55 + DDD(2) + 9 + 8dígitos = 13 dígitos
  // Rejeitar fixos (12 dígitos), números curtos e números longos demais
  if (!formattedPhone || formattedPhone.length !== 13) {
    console.warn(`⚠️ Número inválido (${formattedPhone.length} dígitos, esperado 13): ${formattedPhone}`);
    return { success: false, error: `Número inválido: ${formattedPhone} (${formattedPhone.length} dígitos, esperado 13 para celular BR)`, attempts: 0 };
  }
  // Verificar se o 5º dígito é 9 (indicativo de celular)
  if (formattedPhone[4] !== '9') {
    console.warn(`⚠️ Número não parece celular (5º dígito não é 9): ${formattedPhone}`);
    return { success: false, error: `Número não é celular: ${formattedPhone}`, attempts: 0 };
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
  audioUrl?: string;
  isAudio?: boolean;
}

export function parseWebhookPayload(body: any): WebhookPayload | null {
  try {
    // Log raw payload para debug
    console.log('[Webhook] Raw payload:', JSON.stringify(body).substring(0, 500));

    // Z-API envia diferentes formatos de webhook
    const phone = body?.phone || body?.from || body?.chatId?.replace('@c.us', '');
    
    // Extrair mensagem - Z-API pode enviar em vários formatos
    // text.message pode ser string ou objeto, body.message pode ser objeto
    let rawMessage = body?.text?.message || body?.text?.body || body?.text || body?.message || body?.body || '';
    
    // Garantir que message seja SEMPRE string
    if (typeof rawMessage === 'object' && rawMessage !== null) {
      // Se for objeto, tentar extrair .message, .body, .text ou converter para string
      rawMessage = rawMessage.message || rawMessage.body || rawMessage.text || rawMessage.caption || JSON.stringify(rawMessage);
    }
    const message = String(rawMessage || '');
    
    const messageId = body?.messageId || body?.id;
    const isGroup = body?.isGroup || body?.isGroupMsg || false;

    // Ignorar se não tem phone
    if (!phone) {
      console.log('[Webhook] Ignorado: sem phone');
      return null;
    }

    // Ignorar mensagens de grupo
    if (isGroup) {
      console.log('[Webhook] Ignorado: mensagem de grupo');
      return null;
    }

    // Ignorar se fromMe (mensagem enviada por nós mesmos)
    if (body?.fromMe === true) {
      console.log('[Webhook] Ignorado: fromMe=true');
      return null;
    }

    // Detectar áudio
    const audioUrl = body?.audio?.audioUrl || body?.audioUrl || body?.mediaUrl || '';
    const isAudio = body?.isAudio || body?.type === 'audio' || body?.type === 'ptt' || !!audioUrl;

    console.log(`[Webhook] Parsed: phone=${phone}, message="${message.substring(0, 50)}", isAudio=${isAudio}`);

    return {
      phone: phone.replace(/\D/g, ''),
      message,
      messageId,
      timestamp: body?.timestamp || Date.now(),
      isGroup: false,
      senderName: body?.senderName || body?.pushName || '',
      audioUrl: audioUrl || undefined,
      isAudio,
    };
  } catch (err) {
    console.error('[Webhook] Erro ao parsear payload:', err);
    return null;
  }
}

/**
 * Enviar mensagem com BOTÕES INTERATIVOS via Z-API
 * Fallback para texto puro se Z-API não suportar botões
 */
export interface ButtonOption {
  id: string;
  label: string;
}

export async function sendButtonsViaZAPI({
  instanceId,
  token,
  clientToken,
  phone,
  message,
  buttons,
  footer,
}: SendMessageParams & { buttons: ButtonOption[]; footer?: string }): Promise<ZAPIResponse> {
  const cleanPhone = phone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  if (!formattedPhone || formattedPhone.length !== 13 || formattedPhone[4] !== '9') {
    return { success: false, error: `Numero invalido: ${formattedPhone}`, attempts: 0 };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) headers['Client-Token'] = clientToken;

  // Tentar endpoint de botões da Z-API
  try {
    const response = await axios.post(
      `${ZAPI_BASE_URL}/${instanceId}/token/${token}/send-button-list`,
      {
        phone: formattedPhone,
        message,
        buttonList: {
          buttons: buttons.map((b, i) => ({
            id: b.id || String(i + 1),
            label: b.label,
          })),
        },
        footer: footer || 'Romatec Imoveis',
      },
      { headers, timeout: 15000 }
    );

    if (response.status === 200 && (response.data?.messageId || response.data?.zapiMessageId)) {
      console.log(`[Z-API] Botoes enviados para ${formattedPhone}`);
      return { success: true, messageId: response.data.messageId || response.data.zapiMessageId, attempts: 1 };
    }
  } catch (btnError: any) {
    console.warn(`[Z-API] Botoes nao suportados, usando texto puro: ${btnError?.message}`);
  }

  // Fallback: texto com opcoes numeradas
  const btnText = buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
  const fullMsg = `${message}\n\n${btnText}`;
  return sendMessageViaZAPI({ instanceId, token, clientToken, phone, message: fullMsg });
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
