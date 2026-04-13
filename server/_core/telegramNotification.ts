import { ENV } from './env';

/**
 * Telegram Notification System
 * Sends automated cycle transition notifications at 08:00, 18:00, 20:00, 06:00 (Brasília time)
 * Prevents duplicates with lastNotificationHour tracking
 */
class TelegramNotifier {
  private bot: any = null;
  private lastNotificationHour: number = -1;
  private initialized: boolean = false;

  /**
   * Initialize Telegram Bot connection
   * Gracefully degrades if credentials missing or invalid
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!ENV.telegramBotToken || !ENV.telegramChatId) {
        console.log('[Telegram] ⚠️  Credenciais não configuradas (TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausentes)');
        return;
      }

      if (!ENV.telegramNotificationsEnabled) {
        console.log('[Telegram] ℹ️  Notificações desativadas (TELEGRAM_NOTIFICATIONS_ENABLED=false)');
        return;
      }

      const TelegramBot = await import('node-telegram-bot-api').then(m => m.default);
      this.bot = new TelegramBot(ENV.telegramBotToken, { polling: false });
      this.initialized = true;

      console.log('[Telegram] ✅ Notificador inicializado com sucesso');
      console.log('[Telegram] 🔔 Monitorando ciclos: DIA (08:00, 18:00) | NOITE (20:00, 06:00)');
    } catch (error) {
      console.error('[Telegram] ❌ Erro ao inicializar:', error);
      this.initialized = false;
    }
  }

  /**
   * Check if current hour matches a notification boundary and send if needed
   * Hour boundaries: 08 (DIA start), 18 (DIA end), 20 (NOITE start), 06 (NOITE end)
   */
  async checkAndNotify(currentHour: number): Promise<void> {
    // Skip if not initialized or notifications disabled
    if (!this.bot || !this.initialized || !ENV.telegramNotificationsEnabled) {
      return;
    }

    // Skip if we already notified in this hour (prevent duplicates)
    if (this.lastNotificationHour === currentHour) {
      return;
    }

    // Check if current hour is a notification boundary
    let cycle: 'day' | 'night' | null = null;
    let event: 'start' | 'end' | null = null;

    if (currentHour === 8) {
      cycle = 'day';
      event = 'start';
    } else if (currentHour === 18) {
      cycle = 'day';
      event = 'end';
    } else if (currentHour === 20) {
      cycle = 'night';
      event = 'start';
    } else if (currentHour === 6) {
      cycle = 'night';
      event = 'end';
    }

    if (!cycle || !event) {
      return; // Not a notification boundary
    }

    // Send notification and track the hour
    try {
      const message = this.getFormattedMessage(cycle, event);
      await this.bot.sendMessage(ENV.telegramChatId, message, { parse_mode: 'HTML' });

      this.lastNotificationHour = currentHour;
      console.log(`[Telegram] ✅ Notificação enviada: CICLO ${cycle.toUpperCase()} - ${event.toUpperCase()}`);
    } catch (error) {
      console.error(`[Telegram] ⚠️ Erro ao enviar notificação (${cycle} ${event}):`, error);
    }
  }

  /**
   * Format notification message with campaign statistics
   */
  private getFormattedMessage(cycle: 'day' | 'night', event: 'start' | 'end'): string {
    const time = this.getTimeForCycleEvent(cycle, event);
    const cycleLabel = cycle === 'day' ? '📍 CICLO DIURNO' : '🌙 CICLO NOTURNO';
    const eventLabel = event === 'start' ? 'INICIANDO' : 'FINALIZANDO';

    return `<b>${cycleLabel} ${eventLabel} | ${time}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Campanhas ativas: 5
📤 Mensagens enviadas: Verificando...
⏳ Mensagens pendentes: Verificando...
🔄 Contatos bloqueados (72h): Verificando...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Próximo ciclo: ${this.getNextCycleInfo(cycle, event)}
🚀 Sistema operacional`;
  }

  /**
   * Get formatted time string for cycle event
   */
  private getTimeForCycleEvent(cycle: 'day' | 'night', event: 'start' | 'end'): string {
    const times: Record<string, Record<string, string>> = {
      day: { start: '08:00', end: '18:00' },
      night: { start: '20:00', end: '06:00' },
    };
    return times[cycle][event];
  }

  /**
   * Get next cycle info for message
   */
  private getNextCycleInfo(cycle: 'day' | 'night', event: 'start' | 'end'): string {
    if (cycle === 'day' && event === 'start') {
      return 'Noturno 20:00';
    } else if (cycle === 'day' && event === 'end') {
      return 'Noturno 20:00';
    } else if (cycle === 'night' && event === 'start') {
      return 'Diurno 08:00';
    } else if (cycle === 'night' && event === 'end') {
      return 'Diurno 08:00';
    }
    return 'Próximo ciclo';
  }

  /**
   * Fetch campaign statistics from database
   * (Placeholder for future implementation)
   */
  private async getCampaignStats(): Promise<{
    activeCampaigns: number;
    messagesSent: number;
    messagesPending: number;
    contactsBlocked: number;
  }> {
    return {
      activeCampaigns: 5,
      messagesSent: 0,
      messagesPending: 0,
      contactsBlocked: 0,
    };
  }
}

// Export singleton instance
export const telegramNotifier = new TelegramNotifier();

// ─── Notificação instantânea de lead quente ────────────────────────────────
// Cria uma instância fresca do bot a cada chamada para evitar estado stale do singleton
export async function notifyHotLead(params: {
  name: string;
  phone: string;
  score: string;
  renda?: string;
  entrada?: string;
  fgts?: string;
  tipo?: string;
  valor?: string;
  prazo?: string;
  campanha?: string;
}): Promise<boolean> {
  // Lê direto do process.env para pegar o valor atual (não o snapshot do ENV)
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const enabled = process.env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true';

  if (!enabled || !token || !chatId) {
    console.log(`[Telegram] notifyHotLead bloqueado — enabled=${enabled} token=${!!token} chatId=${!!chatId}`);
    return false;
  }

  try {
    const TelegramBot = await import('node-telegram-bot-api').then(m => m.default);
    const bot = new TelegramBot(token, { polling: false });

    const waLink = `https://wa.me/${params.phone.replace(/\D/g, '')}`;
    const scoreEmoji = params.score === 'quente' ? '🔥' : params.score === 'morno' ? '🌡️' : '❄️';

    const lines = [
      `${scoreEmoji} <b>LEAD ${params.score.toUpperCase()} QUALIFICADO!</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 <b>Nome:</b> ${params.name}`,
      `📱 <b>Telefone:</b> ${params.phone}`,
      params.renda    ? `💰 <b>Renda:</b> ${params.renda}`             : '',
      params.entrada  ? `🏦 <b>Entrada:</b> ${params.entrada}`         : '',
      params.fgts     ? `📋 <b>FGTS:</b> ${params.fgts}`              : '',
      params.tipo     ? `🏠 <b>Tipo imóvel:</b> ${params.tipo}`        : '',
      params.valor    ? `💲 <b>Valor pretendido:</b> ${params.valor}`  : '',
      params.prazo    ? `⏰ <b>Prazo:</b> ${params.prazo}`             : '',
      params.campanha ? `📢 <b>Campanha:</b> ${params.campanha}`       : '',
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👆 <a href="${waLink}">Abrir conversa no WhatsApp</a>`,
      `🚀 Contate AGORA para maximizar conversão!`,
    ].filter(l => l !== '');

    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML', disable_web_page_preview: true });
    console.log(`[Telegram] 🔥 Lead quente notificado: ${params.name} (${params.phone})`);
    return true;
  } catch (e) {
    console.error('[Telegram] Erro ao notificar lead quente:', e);
    return false;
  }
}
