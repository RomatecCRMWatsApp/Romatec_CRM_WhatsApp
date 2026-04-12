import TelegramBot from 'node-telegram-bot-api';
import { ENV } from './env';
import { getDb } from '../db';
import { campaigns, messages, campaignContacts, contacts } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

interface CampaignStats {
  activeCount: number;
  totalSentToday: number;
  totalPendingToday: number;
  totalBlockedCount: number;
}

type CycleType = 'day' | 'night';
type CycleEvent = 'start' | 'end';

class TelegramNotifier {
  private bot: TelegramBot | null = null;
  private lastNotificationHour: number = -1;
  private enabled: boolean = false;

  /**
   * Initialize Telegram bot connection
   * Called once at server startup
   */
  async initialize(): Promise<void> {
    if (!ENV.telegramBotToken || !ENV.telegramChatId) {
      console.log('[Telegram] ⏭️  Credenciais não configuradas — notificações desativadas');
      this.enabled = false;
      return;
    }

    if (!ENV.telegramNotificationsEnabled) {
      console.log('[Telegram] 🔇 Notificações desativadas por ENV (TELEGRAM_NOTIFICATIONS_ENABLED !== true)');
      this.enabled = false;
      return;
    }

    try {
      this.bot = new TelegramBot(ENV.telegramBotToken, { polling: false });
      this.enabled = true;
      console.log('[Telegram] ✅ Inicializado com sucesso — aguardando eventos de ciclo');
    } catch (error) {
      console.error('[Telegram] ❌ Erro ao inicializar:', error);
      this.enabled = false;
    }
  }

  /**
   * Check if current hour matches a cycle boundary and send notification if needed
   * Called every minute by the main loop
   */
  async checkAndNotify(currentHour: number): Promise<void> {
    if (!this.enabled || !this.bot) return;

    // Hour matches one of the four boundaries
    const boundaries: Record<number, { cycle: CycleType; event: CycleEvent }> = {
      8: { cycle: 'day', event: 'start' },
      18: { cycle: 'day', event: 'end' },
      20: { cycle: 'night', event: 'start' },
      6: { cycle: 'night', event: 'end' },
    };

    if (!(currentHour in boundaries)) {
      return; // Not a boundary hour
    }

    // Prevent duplicate notifications within same hour
    if (currentHour === this.lastNotificationHour) {
      return;
    }

    this.lastNotificationHour = currentHour;

    try {
      const { cycle, event } = boundaries[currentHour];
      const message = await this.getFormattedMessage(cycle, event);

      if (ENV.telegramChatId) {
        await this.bot.sendMessage(ENV.telegramChatId, message, { parse_mode: 'HTML' });
        console.log(`[Telegram] ✅ Notificação enviada: ${cycle.toUpperCase()} ${event.toUpperCase()} às ${String(currentHour).padStart(2, '0')}:00`);
      }
    } catch (error) {
      console.error('[Telegram] ⚠️  Erro ao enviar notificação:', error);
      // Don't rethrow — let scheduler continue
    }
  }

  /**
   * Format a cycle notification message with campaign statistics
   */
  private async getFormattedMessage(cycle: CycleType, event: CycleEvent): Promise<string> {
    const stats = await this.getCampaignStats();

    const timeDisplay = {
      day: { start: '08:00', end: '18:00' },
      night: { start: '20:00', end: '06:00' },
    };

    const eventLabel = event === 'start' ? 'INICIANDO' : 'TERMINANDO';
    const cycleLabel = cycle === 'day' ? 'DIURNO' : 'NOTURNO';
    const cycleEmoji = cycle === 'day' ? '☀️' : '🌙';
    const time = timeDisplay[cycle][event];

    const nextCycle = cycle === 'day' ? 'Noturno' : 'Diurno';
    const nextTime = cycle === 'day' ? '20:00' : '08:00';

    return `<b>${cycleEmoji} CICLO ${cycleLabel} ${eventLabel} | ${time}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>✅ Campanhas ativas:</b> ${stats.activeCount}
<b>📤 Mensagens enviadas (hoje):</b> ${stats.totalSentToday}
<b>⏳ Mensagens pendentes:</b> ${stats.totalPendingToday}
<b>🔄 Contatos bloqueados (72h):</b> ${stats.totalBlockedCount}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Próximo ciclo: ${nextCycle} ${nextTime}`;
  }

  /**
   * Fetch current campaign statistics from database
   */
  private async getCampaignStats(): Promise<CampaignStats> {
    try {
      const db = await getDb();
      if (!db) {
        return this.getEmptyStats();
      }

      // Get active campaigns
      const activeCamps = await db.select().from(campaigns).where(eq(campaigns.status, 'active'));

      // Get today's messages (since 00:00 Brasília time)
      const brasiliaDate = new Date();
      const brasiliaStr = brasiliaDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const todayDate = new Date(brasiliaStr);
      todayDate.setHours(0, 0, 0, 0);

      const todayMessages = await db
        .select()
        .from(messages)
        .where(and(
          eq(messages.status, 'sent'),
          // SQLite uses datetime strings, so compare as dates
        ));

      // Count today's messages (filter in code since date comparison is complex in ORM)
      const sentToday = todayMessages.filter(msg => {
        const msgDate = new Date(msg.createdAt);
        const msgStr = msgDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const msgDateBrasilia = new Date(msgStr);
        msgDateBrasilia.setHours(0, 0, 0, 0);
        return msgDateBrasilia.getTime() === todayDate.getTime();
      }).length;

      // Count pending messages
      const pendingMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.status, 'pending'));

      // Count blocked contacts (those with a block record in last 72h)
      const sevenTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const blockedContacts = await db
        .select()
        .from(contacts)
        .where(eq(contacts.status, 'blocked'));

      // Count only those blocked in last 72 hours
      const recentlyBlocked = blockedContacts.filter(c => {
        const lastUpdate = new Date(c.blockedUntil || c.updatedAt);
        return lastUpdate > sevenTwoHoursAgo;
      }).length;

      return {
        activeCount: activeCamps.length,
        totalSentToday: sentToday,
        totalPendingToday: pendingMessages.length,
        totalBlockedCount: recentlyBlocked,
      };
    } catch (error) {
      console.error('[Telegram] Erro ao buscar estatísticas:', error);
      return this.getEmptyStats();
    }
  }

  /**
   * Return empty stats as fallback
   */
  private getEmptyStats(): CampaignStats {
    return {
      activeCount: 0,
      totalSentToday: 0,
      totalPendingToday: 0,
      totalBlockedCount: 0,
    };
  }
}

// Singleton instance
export const telegramNotifier = new TelegramNotifier();
