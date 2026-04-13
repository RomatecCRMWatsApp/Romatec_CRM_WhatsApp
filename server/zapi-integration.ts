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
  let formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  // Auto-fix: 12 dígitos = número BR antigo sem o 9 (ex: 5599XXXXXXXX → 55999XXXXXXXX)
  if (formattedPhone.length === 12 && formattedPhone.startsWith('55')) {
    formattedPhone = formattedPhone.slice(0, 4) + '9' + formattedPhone.slice(4);
    console.log(`📱 Auto-fix telefone 12→13 dígitos: ${formattedPhone}`);
  }

  // Validação: celular BR = 55 + DDD(2) + 9 + 8dígitos = 13 dígitos
  if (!formattedPhone || formattedPhone.length !== 13) {
    console.warn(`⚠️ Número inválido (${formattedPhone.length}d): ${formattedPhone}`);
    return { success: false, error: `Número inválido: ${formattedPhone} (${formattedPhone.length} dígitos)`, attempts: 0 };
  }
  // Verificar se o 5º dígito é 9 (celular)
  if (formattedPhone[4] !== '9') {
    console.warn(`⚠️ Número não é celular (5º dígito≠9): ${formattedPhone}`);
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
    // ═══════════════════════════════════════════════════════════════
    // FASE 1: LOGGING INICIAL
    // ═══════════════════════════════════════════════════════════════
    const fullPayload = JSON.stringify(body);
    console.log('\n[Webhook] ╔═══════════════════════════════════════════╗');
    console.log('[Webhook] ║ WEBHOOK Z-API RECEBIDO                    ║');
    console.log('[Webhook] ╚═══════════════════════════════════════════╝');
    console.log(`[Webhook] Tamanho: ${fullPayload.length} chars`);
    console.log(`[Webhook] Chaves: ${Object.keys(body).join(', ')}`);

    // Se houver estrutura aninhada, log adicional
    if (body?.text && typeof body.text === 'object') {
      console.log('[Webhook] Estrutura text:', JSON.stringify(body.text).substring(0, 300));
    }
    if (body?.data && typeof body.data === 'object') {
      console.log('[Webhook] Estrutura data:', JSON.stringify(body.data).substring(0, 300));
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 2: EXTRAIR PHONE (múltiplas tentativas)
    // ═══════════════════════════════════════════════════════════════
    const phone =
      body?.phone ||
      body?.from ||
      body?.chatId?.replace('@c.us', '') ||
      body?.data?.phone ||
      body?.jid?.replace('@s.whatsapp.net', '') ||
      '';

    if (!phone) {
      console.log('[Webhook] ❌ Nenhum phone encontrado. Payload:', fullPayload.substring(0, 500));
      return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 3: EXTRAIR MENSAGEM (múltiplas tentativas)
    // ═══════════════════════════════════════════════════════════════
    let rawMessage =
      body?.text?.message ||
      body?.text?.body ||
      body?.text ||
      body?.message ||
      body?.body ||
      body?.data?.message ||
      body?.data?.text ||
      body?.content ||
      '';

    // Converter objeto para string se necessário
    if (typeof rawMessage === 'object' && rawMessage !== null) {
      rawMessage = rawMessage.message || rawMessage.body || rawMessage.text || rawMessage.caption || '';
    }
    const message = String(rawMessage || '').trim();

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: DETECTAR TIPO DE EVENTO E FILTROS
    // ═══════════════════════════════════════════════════════════════
    const eventType = body?.event || body?.type || body?.data?.event || body?.status || 'unknown';
    const fromMe = body?.fromMe === true || body?.data?.fromMe === true || false;
    const isGroup = body?.isGroup === true || body?.isGroupMsg === true || body?.data?.isGroup === true || false;

    console.log(`[Webhook] Phone: ${phone}`);
    console.log(`[Webhook] Event: ${eventType}`);
    console.log(`[Webhook] Message length: ${message.length}`);
    console.log(`[Webhook] From me: ${fromMe}, Is group: ${isGroup}`);

    // Regra 1: Ignorar mensagens enviadas por nós
    if (fromMe) {
      console.log('[Webhook] 🚫 Ignorado: é mensagem nossa (fromMe=true)');
      return null;
    }

    // Regra 2: Ignorar mensagens de grupo
    if (isGroup) {
      console.log('[Webhook] 🚫 Ignorado: é mensagem de grupo');
      return null;
    }

    // Regra 3: Ignorar status callbacks
    if (['sent', 'delivered', 'read', 'failed', 'error', 'message_status', 'message.status'].includes(eventType.toLowerCase())) {
      console.log(`[Webhook] 🚫 Ignorado: é status callback (${eventType})`);
      return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 5: EXTRAIR ÁUDIO
    // ═══════════════════════════════════════════════════════════════
    const audioUrl =
      body?.audio?.audioUrl ||
      body?.audioUrl ||
      body?.mediaUrl ||
      body?.data?.audioUrl ||
      body?.media?.url ||
      '';

    const isAudio =
      body?.isAudio === true ||
      ['audio', 'ptt', 'voice'].includes(body?.type?.toLowerCase() || '') ||
      body?.data?.isAudio === true ||
      !!audioUrl;

    // ═══════════════════════════════════════════════════════════════
    // FASE 6: VALIDAR CONTEÚDO
    // ═══════════════════════════════════════════════════════════════
    if (!message && !isAudio) {
      console.log('[Webhook] ⚠️  Mensagem vazia (não é áudio)');
      console.log('[Webhook] Payload:', fullPayload.substring(0, 800));
      return null;
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 7: RETORNAR COM SUCESSO
    // ═══════════════════════════════════════════════════════════════
    const messageId = body?.messageId || body?.id || body?.data?.messageId || '';
    const senderName = body?.senderName || body?.pushName || body?.data?.senderName || body?.contact?.name || '';

    console.log(`[Webhook] ✅ Parseado com sucesso`);
    console.log(`[Webhook] → Phone: ${phone}`);
    console.log(`[Webhook] → Message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
    console.log('[Webhook] → Ready for processing\n');

    return {
      phone: phone.replace(/\D/g, ''),
      message,
      messageId,
      timestamp: body?.timestamp || body?.data?.timestamp || Date.now(),
      isGroup: false,
      senderName,
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
  let formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  if (formattedPhone.length === 12 && formattedPhone.startsWith('55')) {
    formattedPhone = formattedPhone.slice(0, 4) + '9' + formattedPhone.slice(4);
  }

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
