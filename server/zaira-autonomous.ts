// Loop autonomo da Zaira: a cada ZAIRA_CHECK_INTERVAL (default 5min) faz
// um sweep de saude — Railway producao + leads quentes + workflow CI. Se
// detectar anomalia, registra na operationHistory e (se Telegram estiver
// configurado) notifica o CEO. NAO escreve no DB nem aciona Claude — e
// puramente monitoramento.

import { ENV } from "./_core/env";
import { getCampaignMetrics, getLeadAnalysis, getSystemStats } from "./zaira-db-access";
import { getRecentWorkflows } from "./zaira-github";
import { getRailwayStatus } from "./zaira-railway";

export interface OperationLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  severity: "info" | "warning" | "error";
}

const _operationHistory: OperationLog[] = [];
let _ticker: NodeJS.Timeout | null = null;
let _agentRunning = false;
let _lastSweepAt: Date | null = null;

export function isAgentRunning(): boolean {
  return _agentRunning;
}

export function getLastSweepAt(): Date | null {
  return _lastSweepAt;
}

export function getOperationHistory(limit = 100): OperationLog[] {
  return _operationHistory.slice(-Math.min(limit, _operationHistory.length)).reverse();
}

export function addOperation(action: string, details: string, severity: OperationLog["severity"] = "info"): OperationLog {
  const entry: OperationLog = {
    id: `op_${_operationHistory.length + 1}_${Date.now()}`,
    timestamp: new Date().toISOString(),
    action,
    details,
    severity,
  };
  _operationHistory.push(entry);
  if (_operationHistory.length > 500) _operationHistory.splice(0, _operationHistory.length - 500);
  return entry;
}

async function notifyTelegram(text: string): Promise<void> {
  if (!ENV.telegramBotToken || !ENV.telegramChatId) return;
  try {
    const axios = (await import("axios")).default;
    await axios.post(
      `https://api.telegram.org/bot${ENV.telegramBotToken}/sendMessage`,
      {
        chat_id: ENV.telegramChatId,
        text,
        parse_mode: "Markdown",
      },
      { timeout: 8000 },
    );
  } catch {
    // silencioso — falha de notificacao nao deve quebrar o sweep
  }
}

async function runSweep(): Promise<void> {
  _lastSweepAt = new Date();

  // 1) Railway producao
  try {
    const ry = await getRailwayStatus();
    if (!ry.online) {
      addOperation("railway_check", `OFFLINE: ${ry.error ?? ry.statusCode}`, "error");
      await notifyTelegram(`🚨 *ZAIRA*: Railway producao OFFLINE\n${ry.url}\n${ry.error ?? `HTTP ${ry.statusCode}`}`);
    } else if ((ry.latencyMs ?? 0) > 5000) {
      addOperation("railway_check", `Latencia alta: ${ry.latencyMs}ms`, "warning");
    }
  } catch (e: any) {
    addOperation("railway_check", `Erro no check: ${e?.message}`, "error");
  }

  // 2) Stats gerais
  try {
    const stats = await getSystemStats();
    if (stats.contactsTotal === 0 && stats.campaignsTotal === 0) {
      addOperation("system_stats", "Banco vazio detectado", "warning");
    }
  } catch (e: any) {
    addOperation("system_stats", `Erro: ${e?.message}`, "error");
  }

  // 3) Workflows GitHub
  try {
    const wf = await getRecentWorkflows(5);
    if (wf.ok && wf.runs) {
      const failed = wf.runs.find((r) => r.conclusion === "failure");
      if (failed) {
        addOperation("ci_check", `Workflow falhou: ${failed.name} (branch ${failed.branch})`, "warning");
      }
    }
  } catch {
    // GitHub opcional — falha silenciosa
  }

  // 4) Leads quentes — info apenas
  try {
    const leads = await getLeadAnalysis();
    const hot = leads.byTemperature["hot"] ?? leads.byTemperature["quente"] ?? 0;
    if (hot > 0) {
      addOperation("leads_hot", `${hot} leads quentes na base`, "info");
    }
  } catch {
    // info — nao bloqueia
  }

  // 5) Campanhas ativas
  try {
    const camps = await getCampaignMetrics();
    if (camps.active > 0) {
      addOperation("campaigns_active", `${camps.active} campanhas ativas, ${camps.totalSent} envios`, "info");
    }
  } catch {
    // info
  }
}

export function startAutonomousLoop(): void {
  if (_ticker) {
    console.log("[Zaira] Loop autonomo ja esta rodando");
    return;
  }
  _agentRunning = true;
  addOperation("agent_started", `Loop autonomo iniciado (intervalo ${ENV.zairaCheckInterval}ms)`, "info");
  console.log(`🤖 [Zaira] Loop autonomo iniciado (a cada ${Math.round(ENV.zairaCheckInterval / 1000)}s)`);

  // Primeiro sweep apos 30s pra dar tempo do app subir
  setTimeout(() => {
    runSweep().catch((e) => console.error("[Zaira] sweep error:", e));
  }, 30000);

  _ticker = setInterval(() => {
    runSweep().catch((e) => console.error("[Zaira] sweep error:", e));
  }, ENV.zairaCheckInterval);
}

export function stopAutonomousLoop(): void {
  if (_ticker) {
    clearInterval(_ticker);
    _ticker = null;
  }
  _agentRunning = false;
  addOperation("agent_stopped", "Loop autonomo parado", "info");
  console.log("🤖 [Zaira] Loop autonomo parado");
}
