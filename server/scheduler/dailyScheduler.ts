import { getDb } from "../db";
import { campaigns, campaignContacts, messageSendLog } from "../../drizzle/schema";
import { eq, lt, or, gt } from "drizzle-orm";
import { campaignScheduler } from "./campaignScheduler";

export const DAILY_SCHEDULE = {
  RESET_START: "08:00",
  RESET_END: "18:00",
  FULL_RESTART: "20:00",
  PREP_PAUSE: "06:00",
  resetActions: {
    clearCounters: true,
    resetLeadQueues: true,
    reloadNewContacts: true,
    clearScheduledCampaigns: true,
  }
};

class DailyScheduler {
  private timer: NodeJS.Timeout | null = null;
  private firedToday: Set<string> = new Set();
  private readonly CHECK_INTERVAL_MS = 60 * 1000;

  private getBrasiliaDate(): Date {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  }

  private dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  start() {
    if (this.timer) return;
    console.log("📅 [DailyScheduler] Iniciado");
    console.log("   08:00-18:00 → ATIVO DIA");
    console.log("   18:00-20:00 → STANDBY/RESET");
    console.log("   20:00-06:00 → ATIVO NOITE");
    console.log("   06:00-08:00 → PAUSA/PREP");
    this.timer = setInterval(() => void this.tick(), this.CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("📅 [DailyScheduler] Parado");
  }

  private async tick() {
    const now = this.getBrasiliaDate();
    const h = now.getHours();
    const m = now.getMinutes();
    const day = this.dayKey(now);

    if (h === 8 && m === 0) {
      const key = `${day}-start-day`;
      if (!this.firedToday.has(key)) {
        this.firedToday.add(key);
        await this.startDayMode();
      }
    } else if (h === 18 && m === 0) {
      const key = `${day}-start-reset`;
      if (!this.firedToday.has(key)) {
        this.firedToday.add(key);
        await this.startResetMode();
      }
    } else if (h === 20 && m === 0) {
      const key = `${day}-start-night`;
      if (!this.firedToday.has(key)) {
        this.firedToday.add(key);
        await this.startNightMode();
      }
    } else if (h === 6 && m === 0) {
      const key = `${day}-start-pause`;
      if (!this.firedToday.has(key)) {
        this.firedToday.add(key);
        await this.startPauseMode();
      }
    }

    for (const key of this.firedToday) {
      if (!key.startsWith(day)) this.firedToday.delete(key);
    }
  }

  private async startDayMode() {
    console.log("☀️  [DailyScheduler] 08:00 — ATIVO DIA");
    const db = await getDb();
    if (!db) return;
    try {
      await db.update(campaigns).set({ activeDay: true, activeNight: false }).where(eq(campaigns.status, "running"));
      console.log("   ✅ activeDay=true, activeNight=false");
      if (!campaignScheduler.getState().isRunning) {
        await campaignScheduler.start(false);
        console.log("   ✅ CampaignScheduler reiniciado (modo dia)");
      }
    } catch (err) {
      console.error("   ❌ Erro ao iniciar dia:", err);
    }
  }

  private async startResetMode() {
    console.log("🔄 [DailyScheduler] 18:00 → 20:00 — STANDBY/RESET");
    const db = await getDb();
    if (!db) {
      console.error("   ❌ DB indisponível");
      return;
    }
    try {
      await db.update(campaigns).set({ activeDay: false, activeNight: false }).where(eq(campaigns.status, "running"));
      console.log("   ✅ Campanhas desativadas");
      await db.update(campaigns).set({ sentCount: 0 }).where(eq(campaigns.status, "running"));
      console.log("   ✅ sentCount zerado");
      await db.update(campaignContacts).set({ status: "pending", messagesSent: 0 }).where(eq(campaignContacts.status, "blocked"));
      console.log("   ✅ Contatos bloqueados → pending");
      const cutoffHour = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 3600000);
      await db.delete(messageSendLog).where(or(
        gt(messageSendLog.cycleHour, 1000000),        // formato legado (epoch-seconds)
        lt(messageSendLog.cycleHour, cutoffHour)      // mais de 25h atrás (novo formato)
      ));
      console.log("   ✅ messageSendLog antigo limpo");
      await db.delete(campaignContacts).where(eq(campaignContacts.status, "pending"));
      console.log("   ✅ Filas pending limpas");
      console.log("   🕐 Aguardando 20:00...");
    } catch (err) {
      console.error("   ❌ Erro no reset:", err);
    }
  }

  private async startNightMode() {
    console.log("🌙 [DailyScheduler] 20:00 — ATIVO NOITE");
    const db = await getDb();
    if (!db) return;
    try {
      await db.update(campaigns).set({ activeNight: true, activeDay: false }).where(eq(campaigns.status, "running"));
      console.log("   ✅ activeNight=true, activeDay=false");
      if (campaignScheduler.getState().isRunning) {
        campaignScheduler.stop();
        await new Promise(r => setTimeout(r, 500));
      }
      await campaignScheduler.start(true);
      console.log("   ✅ CampaignScheduler reiniciado (modo noite)");
      await this.notifyPhaseChange("🌙 CICLO NOITE INICIADO", [
        "✅ 100% online",
        "✅ Contadores zerados",
        "✅ Leads desbloqueados",
        "✅ Contatos novos carregados",
        "",
        "🚀 Trabalhando intenso 20h-06h...",
      ]);
    } catch (err) {
      console.error("   ❌ Erro ao iniciar noite:", err);
    }
  }

  private async startPauseMode() {
    console.log("⏸️  [DailyScheduler] 06:00 — PAUSA/PREP");
    try {
      const db = await getDb();
      if (db) {
        await db.update(campaigns).set({ activeDay: false, activeNight: false }).where(eq(campaigns.status, "running"));
        console.log("   ✅ Campanhas desativadas");
      }
      campaignScheduler.stop();
      console.log("   ✅ CampaignScheduler parado");
      console.log("   🕐 Aguardando 08:00...");
    } catch (err) {
      console.error("   ❌ Erro ao pausar:", err);
    }
  }

  private async notifyPhaseChange(title: string, items: string[]) {
    try {
      const { getCompanyConfig } = await import("../db");
      const { sendMessageViaZAPI } = await import("../zapi-integration");
      const config = await getCompanyConfig();
      if (!config?.zApiInstanceId || !config?.zApiToken || !config?.phone) return;
      const msg = [`🤖 *ROMATEC CRM — ${title}*`, "", ...items].join("\n");
      await sendMessageViaZAPI({
        instanceId: config.zApiInstanceId,
        token: config.zApiToken,
        clientToken: config.zApiClientToken || undefined,
        phone: config.phone,
        message: msg,
      });
    } catch {
      // não crítico
    }
  }
}

export const dailyScheduler = new DailyScheduler();
