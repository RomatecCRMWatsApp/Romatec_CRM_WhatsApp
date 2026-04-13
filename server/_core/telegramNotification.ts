import { getDb } from '../db';
import { campaigns, messages, messageSendLog, schedulerState as schedulerStateTable } from '../../drizzle/schema';
import { eq, gte, sql } from 'drizzle-orm';

/**
 * Telegram Notification System
 * Sends automated cycle transition notifications at 08:00, 18:00, 20:00, 06:00 (Brasília time)
 * Prevents duplicates using DB persistence (survives server restarts)
 */
class TelegramNotifier {
  private getBrasiliaDate(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  }

  /**
   * Check if current hour matches a notification boundary and send if needed
   * Hour boundaries: 08 (DIA start), 18 (DIA end), 20 (NOITE start), 06 (NOITE end)
   */
  async checkAndNotify(currentHour: number): Promise<void> {
    let cycle: 'day' | 'night' | null = null;
    let event: 'start' | 'end' | null = null;
    if (currentHour === 8)       { cycle = 'day';   event = 'start'; }
    else if (currentHour === 18) { cycle = 'day';   event = 'end';   }
    else if (currentHour === 20) { cycle = 'night'; event = 'start'; }
    else if (currentHour === 6)  { cycle = 'night'; event = 'end';   }
    if (!cycle || !event) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    // Chave de deduplicação: ano-mês-dia-hora (única por hora por dia)
    const now = this.getBrasiliaDate();
    const dedupKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${currentHour}`;

    try {
      const db = await getDb();
      if (!db) return;

      // Verificar no DB se já enviamos essa notificação hoje (persiste entre restarts)
      const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
      const stateJson = (rows[0]?.stateJson as Record<string, any>) || {};
      if (stateJson.lastCycleNotif === dedupKey) {
        console.log(`[Telegram] Notificação ${cycle} ${event} já enviada (${dedupKey}), pulando`);
        return;
      }

      // Buscar estatísticas reais do DB
      const stats = await this.fetchStats(db);

      // Montar mensagem
      const cycleLabel = cycle === 'day' ? '☀️ CICLO DIURNO' : '🌙 CICLO NOTURNO';
      const eventLabel = event === 'start' ? 'INICIANDO' : 'FINALIZANDO';
      const timeLabel = { day: { start: '08:00', end: '18:00' }, night: { start: '20:00', end: '06:00' } }[cycle][event];
      const nextCycle = (cycle === 'night') ? 'Diurno 08:00' : 'Noturno 20:00';

      const message = `<b>${cycleLabel} ${eventLabel} | ${timeLabel}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Campanhas ativas: ${stats.activeCampaigns}
📤 Mensagens enviadas hoje: ${stats.messagesSentToday}
🔄 Contatos bloqueados (72h): ${stats.contactsBlocked}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Próximo ciclo: ${nextCycle}
🚀 Sistema operacional`;

      // Enviar
      const TelegramBot = await import('node-telegram-bot-api').then(m => m.default);
      const bot = new TelegramBot(token, { polling: false });
      await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      console.log(`[Telegram] ✅ Notificação enviada: ${cycle.toUpperCase()} ${event.toUpperCase()}`);

      // Persistir chave de deduplicação no DB (evita reenvio mesmo após restart)
      await db.update(schedulerStateTable)
        .set({ stateJson: { ...stateJson, lastCycleNotif: dedupKey } })
        .where(eq(schedulerStateTable.id, 1));

    } catch (error) {
      console.error(`[Telegram] ⚠️ Erro ao enviar notificação (${cycle} ${event}):`, error);
    }
  }

  private async fetchStats(db: any): Promise<{
    activeCampaigns: number;
    messagesSentToday: number;
    contactsBlocked: number;
  }> {
    try {
      // Início do dia em Brasília
      const now = this.getBrasiliaDate();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      // Campanhas ativas
      const activeCamps = await db.select({ count: sql<number>`COUNT(*)` })
        .from(campaigns)
        .where(eq(campaigns.status, 'running'));
      const activeCampaigns = Number(activeCamps[0]?.count ?? 0);

      // Mensagens enviadas hoje (via messageSendLog — registros de envio de campanhas)
      const sentToday = await db.select({ count: sql<number>`COUNT(*)` })
        .from(messageSendLog)
        .where(gte(messageSendLog.sentAt, todayStart));
      const messagesSentToday = Number(sentToday[0]?.count ?? 0);

      // Contatos bloqueados nas últimas 72h (distintos por telefone)
      const cutoff72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const blocked = await db.select({ count: sql<number>`COUNT(DISTINCT contactPhone)` })
        .from(messageSendLog)
        .where(gte(messageSendLog.sentAt, cutoff72h));
      const contactsBlocked = Number(blocked[0]?.count ?? 0);

      return { activeCampaigns, messagesSentToday, contactsBlocked };
    } catch {
      return { activeCampaigns: 0, messagesSentToday: 0, contactsBlocked: 0 };
    }
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
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log(`[Telegram] notifyHotLead bloqueado — token=${!!token} chatId=${!!chatId}`);
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
