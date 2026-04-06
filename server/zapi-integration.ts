/**
 * Z-API WhatsApp Integration
 * Gerencia envio de mensagens via Z-API com controle de taxa
 */

import axios from 'axios';

const ZAPI_BASE_URL = 'https://api.z-api.io/instances';

interface SendMessageParams {
  instanceId: string;
  token: string;
  phone: string;
  message: string;
}

interface ZAPIResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Enviar mensagem via Z-API
 */
export async function sendMessageViaZAPI({
  instanceId,
  token,
  phone,
  message,
}: SendMessageParams): Promise<ZAPIResponse> {
  try {
    // Formatar número: remover caracteres especiais e garantir formato correto
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') 
      ? cleanPhone 
      : `55${cleanPhone}`;

    const response = await axios.post(
      `${ZAPI_BASE_URL}/${instanceId}/token/${token}/send-message`,
      {
        phone: formattedPhone,
        message: message,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.status === 200 && response.data?.messageId) {
      return {
        success: true,
        messageId: response.data.messageId,
      };
    }

    return {
      success: false,
      error: 'Falha ao enviar mensagem',
    };
  } catch (error) {
    console.error('Erro ao enviar mensagem via Z-API:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Validar conexão com Z-API
 */
export async function validateZAPIConnection(
  instanceId: string,
  token: string
): Promise<boolean> {
  try {
    const response = await axios.get(
      `${ZAPI_BASE_URL}/${instanceId}/token/${token}/status`,
      {
        timeout: 5000,
      }
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
  token: string
): Promise<{ connected: boolean; phone?: string }> {
  try {
    const response = await axios.get(
      `${ZAPI_BASE_URL}/${instanceId}/token/${token}/status`,
      {
        timeout: 5000,
      }
    );

    if (response.status === 200 && response.data?.connected) {
      return {
        connected: true,
        phone: response.data.phone,
      };
    }

    return { connected: false };
  } catch (error) {
    console.error('Erro ao obter status Z-API:', error);
    return { connected: false };
  }
}

/**
 * Lógica de envio com controle de taxa (2 mensagens por hora)
 */
export class MessageScheduler {
  private instanceId: string;
  private token: string;
  private messagesPerHour = 2;
  private delayBetweenMessages = (60 * 60 * 1000) / this.messagesPerHour; // 30 minutos

  constructor(instanceId: string, token: string) {
    this.instanceId = instanceId;
    this.token = token;
  }

  /**
   * Enviar mensagens com delay para evitar bloqueios
   */
  async sendMessagesWithDelay(
    messages: Array<{ phone: string; text: string }>
  ): Promise<Array<{ phone: string; success: boolean; messageId?: string }>> {
    const results = [];

    for (let i = 0; i < messages.length; i++) {
      const { phone, text } = messages[i];

      // Enviar mensagem
      const result = await sendMessageViaZAPI({
        instanceId: this.instanceId,
        token: this.token,
        phone,
        message: text,
      });

      results.push({
        phone,
        success: result.success,
        messageId: result.messageId,
      });

      // Adicionar delay entre mensagens (exceto na última)
      if (i < messages.length - 1) {
        // Adicionar variação aleatória (±30%) para evitar padrões
        const variation = this.delayBetweenMessages * 0.3;
        const randomDelay =
          this.delayBetweenMessages +
          (Math.random() - 0.5) * 2 * variation;

        await this.sleep(randomDelay);
      }
    }

    return results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
