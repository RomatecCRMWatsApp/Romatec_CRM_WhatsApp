import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import {
  ChevronDown, ChevronUp, Play, Zap, Settings2, CheckCircle2,
  Clock, AlertCircle, Loader2, ArrowLeft, Timer, BarChart3,
  Send, Users, Pause
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * SISTEMA v6.0 - 5 CAMPANHAS INDEPENDENTES
 * - Cada campanha envia 1 msg/hora
 * - Ciclo de 10 horas
 * - Sem rotação de pares
 * - Todas as campanhas enviam a cada hora
 */

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTime(date: Date | string | null): string {
  if (!date) return "--:--:--";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "--:--:--";
  }
}

export default function Campaigns() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [nightMode, setNightMode] = useState(false);

  const schedulerState = trpc.scheduler.getState.useQuery(undefined, {
    refetchInterval: isResetting ? false : 5000,
  });
  const campaignDetails = trpc.scheduler.getCampaignDetails.useQuery(undefined, {
    refetchInterval: isResetting ? false : 5000,
  });

  // Sincronizar nightMode com o estado do backend
  useEffect(() => {
    if (schedulerState.data?.state?.nightMode !== undefined) {
      setNightMode(schedulerState.data.state.nightMode);
    }
  }, [schedulerState.data?.state?.nightMode]);

  useEffect(() => {
    if (schedulerState.data !== undefined && campaignDetails.data !== undefined) {
      setIsLoading(false);
    }
  }, [schedulerState.data, campaignDetails.data]);

  const startScheduler = trpc.scheduler.start.useMutation({
    onSuccess: () => {
      toast.success("Scheduler iniciado! 1 msg/campanha/hora, ciclo 10h");
      schedulerState.refetch();
      campaignDetails.refetch();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const stopScheduler = trpc.scheduler.stop.useMutation({
    onSuccess: () => {
      toast.success("Scheduler parado!");
      schedulerState.refetch();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  // ═══════════════════════════════════════════════════════════
  // Hooks para ativação por ciclo (DIA/NOITE)
  // ═══════════════════════════════════════════════════════════
  const cycleStatus = trpc.campaigns.getCycleStatus.useQuery();

  const toggleCycleActivation = trpc.campaigns.toggleCycleActivation.useMutation({
    onSuccess: () => {
      cycleStatus.refetch();
      toast.success("Ciclo de campanha atualizado!");
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const handleNightModeToggle = async (newMode: boolean) => {
    setNightMode(newMode);
    const isRunning = schedulerState.data?.state?.isRunning;

    if (isRunning) {
      // Scheduler está rodando: para e reinicia com novo nightMode
      stopScheduler.mutate(undefined, {
        onSuccess: () => {
          setTimeout(() => {
            startScheduler.mutate({ nightMode: newMode }, {
              onSuccess: () => {
                toast.success(newMode ? "🌙 Modo Noite ativado e scheduler reiniciado!" : "☀️ Modo Dia ativado e scheduler reiniciado!");
              }
            });
          }, 1000);
        }
      });
    } else {
      // Scheduler está PARADO: inicia com novo nightMode para persistir a escolha
      startScheduler.mutate({ nightMode: newMode }, {
        onSuccess: () => {
          toast.success(newMode ? "🌙 Modo Noite ativado e scheduler iniciado!" : "☀️ Modo Dia ativado e scheduler iniciado!");
        },
        onError: (error) => {
          toast.error(`Erro ao aplicar modo: ${error.message}`);
        }
      });
    }
  };

  const utils = trpc.useUtils();
  const resetScheduler = trpc.scheduler.reset.useMutation({
    onMutate: () => {
      setIsResetting(true);
      setExpandedCampaign(null);
    },
    onSuccess: async () => {
      try {
        await utils.scheduler.getCampaignDetails.invalidate();
        await utils.scheduler.getState.invalidate();
        await utils.scheduler.getCampaignDetails.refetch();
        await utils.scheduler.getState.refetch();
        setResetKey((prev) => prev + 1);
      } catch (e) {
        console.warn("[Reset] Erro ao refetch:", e);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      setIsResetting(false);
      toast.success("Campanhas resetadas com novos contatos! Clique em Iniciar.");
    },
    onError: (error) => {
      setIsResetting(false);
      toast.error(`Erro: ${error.message}`);
    },
  });

  const toggleCampaign = trpc.scheduler.toggleCampaign.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      campaignDetails.refetch();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const isRunning = useMemo(() => schedulerState.data?.state?.isRunning || false, [schedulerState.data?.state?.isRunning]);
  const stats = useMemo(() => schedulerState.data?.stats, [schedulerState.data?.stats]);
  const stateData = useMemo(() => schedulerState.data?.state, [schedulerState.data?.state]);
  const todayMessages = useMemo(() => schedulerState.data?.todayMessages || [], [schedulerState.data?.todayMessages]);
  const allCampaigns = useMemo(
    () => (campaignDetails.data || []).filter((c: any) => !String(c.name || "").startsWith("TESTE_AUTO")),
    [campaignDetails.data]
  );
  const hourNumber = useMemo(() => stats?.cycleNumber || 0, [stats?.cycleNumber]);
  const campaignStates = useMemo(() => stateData?.campaignStates || [], [stateData?.campaignStates]);
  const sentThisHour = useMemo(() => stats?.messagesThisHour || 0, [stats?.messagesThisHour]);
  const totalCampsActive = useMemo(() => stats?.maxMessagesPerHour || 0, [stats?.maxMessagesPerHour]);

  const totals = useMemo(() => {
    const totalSent = allCampaigns.reduce((sum: number, c: any) => sum + (c.sentCount || 0), 0);
    const totalPending = allCampaigns.reduce((sum: number, c: any) => sum + (c.pendingCount || 0), 0);
    const totalFailed = allCampaigns.reduce((sum: number, c: any) => sum + (c.failedCount || 0), 0);
    // Usa sentCount + pendingCount + failedCount como total real de contatos atribuídos
    // evitando o valor fixo de totalContacts que pode vir inflado do backend
    const totalContacts = totalSent + totalPending + totalFailed;
    const successRate = totalContacts > 0 ? ((totalSent / totalContacts) * 100).toFixed(1) : "0.0";
    return { totalContacts, totalSent, totalPending, totalFailed, successRate };
  }, [allCampaigns]);

  const cycleDuration = stateData?.cycleDurationSeconds || 3600;
  const [localTimer, setLocalTimer] = useState(cycleDuration);

  useEffect(() => {
    if (stateData?.secondsUntilNextCycle !== undefined) {
      setLocalTimer(stateData.secondsUntilNextCycle);
    }
  }, [stateData?.secondsUntilNextCycle]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setLocalTimer((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const timeProgressPercent = cycleDuration > 0 ? Math.round(((cycleDuration - localTimer) / cycleDuration) * 100) : 0;

  const handleStart = useCallback(() => {
    if (allCampaigns.length < 1) return;
    startScheduler.mutate({ nightMode });
  }, [allCampaigns.length, startScheduler, nightMode]);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedCampaign((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080f0a" }}>
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4" style={{ color: "#3ec87a" }} />
          <p style={{ color: "#4a7a55", fontSize: "14px", letterSpacing: "0.05em" }}>
            Carregando campanhas...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#080f0a", color: "#e8f5e9" }}>
      {/* == HEADER == */}
      <div
        style={{
          background: "linear-gradient(135deg, #0a1f11 0%, #163322 50%, #0a1f11 100%)",
          borderBottom: "1px solid #1a3520",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#5a9a6a",
            }}
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: "#e8f5e9",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                margin: 0,
              }}
            >
              <Send size={16} style={{ color: "#3ec87a" }} />
              Romatec CRM Campanhas
            </h1>
            <p style={{ fontSize: "11px", color: "#3a6a45", margin: "2px 0 0" }}>
              1 msg/campanha/hora • Ciclo de 10 horas • {allCampaigns.length} campanhas
            </p>
          </div>
        </div>

        {isRunning ? (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              background: "rgba(62,200,122,0.12)",
              border: "1px solid rgba(62,200,122,0.25)",
              color: "#3ec87a",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#3ec87a",
                animation: "rmt-pulse 1.5s infinite",
              }}
            />
            RODANDO
          </span>
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              background: "rgba(220,60,60,0.12)",
              border: "1px solid rgba(220,60,60,0.25)",
              color: "#f07070",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#f07070",
              }}
            />
            PARADO
          </span>
        )}
      </div>

      <style>{`
        @keyframes rmt-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes rmt-amber-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .rmt-card {
          background: #0d1f12;
          border: 1px solid #1a3520;
          border-radius: 12px;
          padding: 16px;
        }
        .rmt-metric {
          background: #080f0a;
          border: 1px solid #162a1c;
          border-radius: 10px;
          padding: 10px 8px;
          text-align: center;
        }
        .rmt-metric-highlight {
          background: #141008;
          border: 1px solid #2e2408;
        }
        .rmt-mini-stat {
          background: #080f0a;
          border: 1px solid #162a1c;
          border-radius: 8px;
          padding: 8px 10px;
        }
        .rmt-contacts-btn {
          width: 100%;
          background: #080f0a;
          border: 1px solid #162a1c;
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          color: #5a8a70;
          font-size: 11px;
          transition: background 0.15s;
        }
        .rmt-contacts-btn:hover { background: #0f1f14; }
        .rmt-btn-start {
          flex: 1;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, #1e6b30, #155224);
          border: 1px solid #2a8a40;
          color: #c8f0d0;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          letter-spacing: 0.02em;
          transition: all 0.15s;
        }
        .rmt-btn-start:hover { background: linear-gradient(135deg, #237535, #1a5e2a); }
        .rmt-btn-start:disabled { opacity: 0.4; cursor: not-allowed; }
        .rmt-btn-pause {
          flex: 1;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6b1e1e, #521515);
          border: 1px solid #8a2a2a;
          color: #f0c8c8;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.15s;
        }
        .rmt-btn-pause:hover { background: linear-gradient(135deg, #752323, #5e1a1a); }
        .rmt-btn-reset {
          height: 42px;
          padding: 0 18px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6b4a1e, #523815);
          border: 1px solid #8a6a2a;
          color: #f0d8c8;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .rmt-btn-reset:hover { background: linear-gradient(135deg, #755223, #5e3e1a); }
        .rmt-btn-reset:disabled { opacity: 0.4; cursor: not-allowed; }
        .rmt-prog-bar {
          height: 4px;
          background: #0a1a0f;
          border-radius: 3px;
          overflow: hidden;
        }
        .rmt-prog-fill {
          height: 100%;
          border-radius: 3px;
          background: #1e6b30;
          transition: width 0.5s ease;
        }
        .rmt-camp-card {
          background: #0d1f12;
          border: 1px solid #1a3520;
          border-left: 3px solid #1e6b30;
          border-radius: 12px;
          padding: 14px;
          transition: box-shadow 0.2s;
        }
        .rmt-camp-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
        .rmt-rule-row {
          background: #070d09;
          border: 1px solid #122018;
          border-radius: 7px;
          padding: 6px 10px;
          font-size: 10px;
          color: #3a6a45;
          margin-bottom: 10px;
        }
        .rmt-slot-pill {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 10px;
          font-family: monospace;
          border: 1px solid;
        }
      `}</style>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* == PAINEL DE CONTROLE == */}
        <div className="rmt-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <h2
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#7abf8a",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <BarChart3 size={14} style={{ color: "#3ec87a" }} />
              Painel de controle
            </h2>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "20px",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.05em",
                ...(isRunning
                  ? { background: "rgba(62,200,122,0.1)", border: "1px solid rgba(62,200,122,0.2)", color: "#3ec87a" }
                  : { background: "rgba(220,60,60,0.1)", border: "1px solid rgba(220,60,60,0.2)", color: "#f07070" }),
              }}
            >
              {isRunning ? "ATIVO" : "PARADO"}
            </span>
          </div>

          {/* Métricas */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "8px",
              marginBottom: "14px",
            }}
          >
            {[
              { icon: Users, label: "Total contatos", value: totals.totalContacts, color: "#5ba4e8", extra: "" },
              { icon: CheckCircle2, label: "Enviadas", value: totals.totalSent, color: "#3ec87a", extra: "" },
              { icon: Clock, label: "Restantes", value: totals.totalPending, color: "#e8a83e", extra: "highlight" },
              { icon: AlertCircle, label: "Falhas", value: totals.totalFailed, color: "#e85a5a", extra: "" },
              { icon: BarChart3, label: "Taxa sucesso", value: `${totals.successRate}%`, color: "#a07ee8", extra: "" },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`rmt-metric${stat.extra === "highlight" ? " rmt-metric-highlight" : ""}`}
              >
                <stat.icon size={13} style={{ color: stat.color, marginBottom: "4px" }} />
                <p style={{ fontSize: "9px", color: "#3a5a40", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 3px" }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: "20px", fontWeight: 600, color: stat.color, margin: 0 }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Timer (apenas quando rodando) */}
          {isRunning && (
            <div
              style={{
                background: "#0a0f1a",
                border: "1px solid #1a2040",
                borderRadius: "10px",
                padding: "14px",
                marginBottom: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div>
                  <p style={{ fontSize: "11px", color: "#7a7ae8", display: "flex", alignItems: "center", gap: "5px", margin: "0 0 3px", fontWeight: 600 }}>
                    <Timer size={13} /> Próxima hora em:
                  </p>
                  <p style={{ fontSize: "10px", color: "#3a3a6a", margin: 0 }}>
                    Hora {hourNumber + 1}/10    {sentThisHour}/{totalCampsActive} campanhas enviaram
                  </p>
                </div>
                <span
                  style={{
                    fontSize: "32px",
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: "#8a7ae8",
                    letterSpacing: "0.05em",
                  }}
                >
                  {formatTimer(localTimer)}
                </span>
              </div>
              <div className="rmt-prog-bar" style={{ background: "#0f1020" }}>
                <div className="rmt-prog-fill" style={{ width: `${timeProgressPercent}%`, background: "linear-gradient(90deg, #5a4ae8, #8a7ae8)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginTop: "10px" }}>
                {[
                  { label: "Início às", value: stateData?.startedAtFormatted || "--:--:--" },
                  { label: "Rodando há", value: stateData?.uptimeFormatted || "00:00:00" },
                  { label: "Próxima hora", value: stateData?.nextCycleFormatted || "--:--" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "7px",
                      padding: "6px 8px",
                      textAlign: "center",
                    }}
                  >
                    <p style={{ fontSize: "9px", color: "#3a3a5a", margin: "0 0 2px" }}>{item.label}</p>
                    <p style={{ fontSize: "11px", fontWeight: 600, color: "#8a7ae8", margin: 0 }}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "11px" }}>
                <span style={{ color: "#3a3a5a" }}>Enviadas nesta hora:</span>
                <span style={{ fontWeight: 600, color: "#8a7ae8" }}>{sentThisHour}/{totalCampsActive}</span>
                {totalCampsActive > 0 && sentThisHour >= totalCampsActive && (
                  <span style={{ fontSize: "10px", background: "rgba(62,200,122,0.12)", color: "#3ec87a", padding: "2px 8px", borderRadius: "10px", border: "1px solid rgba(62,200,122,0.2)" }}>
                    Hora completa!
                  </span>
                )}
              </div>
              {(stats as any)?.scheduledSlots?.length > 0 && (
                <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" }}>
                  {(stats as any).scheduledSlots.map((slot: any, idx: number) => (
                    <span
                      key={idx}
                      className="rmt-slot-pill"
                      style={
                        slot.sent
                          ? { background: "rgba(62,200,122,0.1)", color: "#3ec87a", borderColor: "rgba(62,200,122,0.2)", textDecoration: "line-through" }
                          : { background: "rgba(138,122,232,0.1)", color: "#8a7ae8", borderColor: "rgba(138,122,232,0.2)" }
                      }
                    >
                      {slot.campaignName.substring(0, 10)}@{slot.minuteLabel}min
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modo dia/noite */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#080f0a",
              border: "1px solid #162a1c",
              borderRadius: "10px",
              padding: "10px 14px",
              marginBottom: "12px",
            }}
          >
            <div>
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#a8d5b0", margin: "0 0 2px" }}>
                {nightMode ? "🌙 Modo noite 20h—06h" : "☀️ Modo dia 08h—18h"}
              </p>
              <p style={{ fontSize: "10px", color: "#3a5a40", margin: 0 }}>
                {nightMode ? "Enviando das 20h às 06h" : "Enviando das 08h às 18h"}
              </p>
            </div>
            <button
              onClick={() => handleNightModeToggle(!nightMode)}
              style={{
                width: "40px",
                height: "22px",
                borderRadius: "11px",
                background: nightMode ? "#3a3a8a" : "#1e6b30",
                border: "none",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  width: "18px",
                  height: "18px",
                  background: "#fff",
                  borderRadius: "50%",
                  position: "absolute",
                  top: "2px",
                  left: nightMode ? "20px" : "2px",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>

          {/* Botões */}
          <div style={{ display: "flex", gap: "10px" }}>
            {!isRunning ? (
              <button onClick={handleStart} disabled={allCampaigns.length < 1} className="rmt-btn-start">
                <Play size={13} /> Iniciar campanhas
              </button>
            ) : (
              <button onClick={() => stopScheduler.mutate()} className="rmt-btn-pause">
                <Pause size={13} /> Pausar campanhas
              </button>
            )}
            <button
              onClick={() => {
                if (isRunning) { toast.error("Pare o scheduler antes de redefinir!"); return; }
                if (confirm("Tem certeza? Isso vai limpar TUDO e começar do zero.")) {
                  resetScheduler.mutate();
                }
              }}
              disabled={isRunning}
              className="rmt-btn-reset"
            >
              Redefinir
            </button>
          </div>
        </div>

        {/* == STATUS POR HORA (apenas quando rodando) == */}
        {allCampaigns.length > 0 && isRunning && (
          <div className="rmt-card">
            <h2
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#c8a040",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <Zap size={13} style={{ color: "#e8a83e" }} />
              Status por hora (todas as campanhas)
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px" }}
              key={`hour-status-${resetKey}`}
            >
              {allCampaigns
                .filter((c: any) => c.status === "running")
                .map((campaign: any) => {
                  const campState = campaignStates.find((cs: any) => cs.campaignName === campaign.name);
                  const hasSent = campState?.sentThisHour || false;
                  return (
                    <div
                      key={`hour-${campaign.id}`}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        border: `1px solid ${hasSent ? "rgba(62,200,122,0.25)" : "rgba(232,168,62,0.2)"}`,
                        background: hasSent ? "rgba(62,200,122,0.06)" : "rgba(232,168,62,0.06)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px" }}>
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: hasSent ? "#3ec87a" : "#e8a83e",
                            flexShrink: 0,
                            animation: hasSent ? "none" : "rmt-amber-pulse 1.5s infinite",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            color: hasSent ? "#3ec87a" : "#e8a83e",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {hasSent ? "ENVIOU" : "AGUARDANDO"}
                        </span>
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: "9px",
                            padding: "1px 6px",
                            borderRadius: "8px",
                            fontWeight: 700,
                            background: hasSent ? "rgba(62,200,122,0.12)" : "rgba(232,168,62,0.12)",
                            border: `1px solid ${hasSent ? "rgba(62,200,122,0.2)" : "rgba(232,168,62,0.2)"}`,
                            color: hasSent ? "#3ec87a" : "#e8a83e",
                          }}
                        >
                          {hasSent ? "1/1" : "0/1"}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: hasSent ? "#5ad890" : "#e8c060",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        {campaign.name}
                      </span>
                      <p style={{ fontSize: "9px", color: "#3a5a40", margin: 0 }}>
                        1 msg/hora • {campaign.sentCount || 0}/{campaign.totalContacts || 2} total
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* == MONITORAMENTO == */}
        <div>
          <h2
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#7abf8a",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <BarChart3 size={14} style={{ color: "#3ec87a" }} />
            Monitoramento em tempo real
          </h2>

          {allCampaigns.length === 0 ? (
            <div className="rmt-card" style={{ textAlign: "center", padding: "32px" }}>
              <Settings2 size={32} style={{ color: "#2a4a30", margin: "0 auto 12px" }} />
              <p style={{ color: "#3a5a40", fontSize: "14px", margin: 0 }}>Nenhuma campanha configurada</p>
            </div>
          ) : (
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}
              key={`campaigns-${resetKey}-${allCampaigns.length}`}
            >
              {allCampaigns.map((campaign: any) => (
                <CampaignCard
                  key={`camp-${campaign.id}`}
                  campaign={campaign}
                  isRunning={isRunning}
                  hourNumber={hourNumber}
                  cycleTimer={localTimer}
                  cycleDuration={cycleDuration}
                  campaignStates={campaignStates}
                  schedulerStartedAt={stateData?.startedAtFormatted || null}
                  todayMessages={todayMessages}
                  expanded={expandedCampaign === campaign.id}
                  onToggle={() => handleToggleExpand(campaign.id)}
                  onToggleActive={(active: boolean) => toggleCampaign.mutate({ campaignId: campaign.id, active })}
                  cycleStatus={cycleStatus}
                  toggleCycleActivation={toggleCycleActivation}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// CAMPAIGN CARD
// ============================================
function CampaignCard({
  campaign, isRunning, hourNumber, cycleTimer, cycleDuration,
  campaignStates, schedulerStartedAt, todayMessages, expanded, onToggle, onToggleActive,
  cycleStatus, toggleCycleActivation,
}: {
  campaign: any; isRunning: boolean; hourNumber: number; cycleTimer: number;
  cycleDuration: number; campaignStates: any[]; schedulerStartedAt: string | null;
  todayMessages: any[]; expanded: boolean; onToggle: () => void; onToggleActive: (active: boolean) => void;
  cycleStatus: any; toggleCycleActivation: any;
}) {
  const isActive = campaign.status === "running";
  const campState = campaignStates.find((cs: any) => cs.campaignName === campaign.name);
  const hasSentThisHour = campState?.sentThisHour || false;
  const contactsList: any[] = campaign.contactDetails || [];
  const sentCount = campaign.sentCount || 0;
  const pendingCount = campaign.pendingCount || 0;
  const failedCount = campaign.failedCount || 0;
  // Total real = contatos efetivamente atribuídos (evita valor inflado do backend)
  const totalContacts = (sentCount + pendingCount + failedCount) || campaign.totalContacts || 0;
  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;
  const timePercent = cycleDuration > 0 ? Math.round(((cycleDuration - cycleTimer) / cycleDuration) * 100) : 0;

  // Tema visual da campanha
  let borderColor = "#1e6b30";
  let ledColor = "#5ba4e8";
  let ledAnim = false;
  let statusLabel = "Ativo";
  let statusStyle: React.CSSProperties = {
    background: "rgba(91,164,232,0.1)",
    border: "1px solid rgba(91,164,232,0.2)",
    color: "#8ac8f8",
  };
  let cardOpacity = 1;

  if (!isActive) {
    borderColor = "#1a2a1c";
    ledColor = "#2a4a30";
    statusLabel = "Pausada";
    statusStyle = { background: "rgba(80,80,80,0.1)", border: "1px solid rgba(80,80,80,0.2)", color: "#6a6a6a" };
    cardOpacity = 0.55;
  } else if (hasSentThisHour) {
    borderColor = "#1e7a40";
    ledColor = "#3ec87a";
    statusLabel = "Enviou esta hora";
    statusStyle = { background: "rgba(62,200,122,0.1)", border: "1px solid rgba(62,200,122,0.2)", color: "#3ec87a" };
  } else if (isRunning) {
    borderColor = "#7a6010";
    ledColor = "#e8a83e";
    ledAnim = true;
    statusLabel = "Aguardando envio";
    statusStyle = { background: "rgba(232,168,62,0.1)", border: "1px solid rgba(232,168,62,0.2)", color: "#e8c060" };
  }

  return (
    <div
      className="rmt-camp-card"
      style={{ borderLeftColor: borderColor, opacity: cardOpacity }}
    >
      {/* Cabeçalho do card */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: ledColor,
              marginTop: "5px",
              flexShrink: 0,
              animation: ledAnim ? "rmt-amber-pulse 1.5s infinite" : "none",
            }}
          />
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#d8f0dc", margin: "0 0 3px" }}>
              {String(campaign.name || "")}
            </h3>
            <p style={{ fontSize: "10px", color: "#3a5a40", margin: 0 }}>
              Imóvel: {String(campaign.propertyName || "")}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span style={{ fontSize: "9px", padding: "2px 8px", borderRadius: "10px", fontWeight: 600, letterSpacing: "0.03em", ...statusStyle }}>
            {statusLabel}
          </span>
          {!isActive && (
            <Switch checked={isActive} onCheckedChange={onToggleActive} disabled={isRunning} />
          )}
        </div>
      </div>

      {/* Regra */}
      <div className="rmt-rule-row">
        Regra: <span style={{ color: "#5aaa70", fontWeight: 600 }}>1 msg/hora</span>
        {" "} 10 horas = 10 contatos/ciclo
        {isActive && isRunning && (
          <span
            style={{
              float: "right",
              fontFamily: "monospace",
              fontWeight: 700,
              color: hasSentThisHour ? "#3ec87a" : "#e8a83e",
              fontSize: "11px",
            }}
          >
            {formatTimer(cycleTimer)}
          </span>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CICLO ACTIVATION TOGGLES - Nova Feature: Máx 5 por ciclo */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {cycleStatus.data && (
        <div style={{
          marginTop: "10px",
          padding: "8px",
          background: "rgba(0, 0, 0, 0.3)",
          borderRadius: "6px",
          border: "1px solid rgba(94, 168, 112, 0.2)",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
          }}>
            {/* CICLO DIA */}
            <button
              onClick={() => {
                const newState = !(campaign.activeDay || false);
                toggleCycleActivation.mutate({
                  campaignId: campaign.id,
                  period: "day",
                  active: newState,
                });
              }}
              disabled={
                toggleCycleActivation.isPending ||
                (!campaign.activeDay && cycleStatus.data.dayCount >= 5)
              }
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                border: `2px solid ${campaign.activeDay ? "#3ec87a" : "#555"}`,
                background: campaign.activeDay ? "rgba(62, 200, 122, 0.25)" : "rgba(50, 50, 50, 0.5)",
                color: campaign.activeDay ? "#3ec87a" : "#888",
                fontSize: "12px",
                fontWeight: 700,
                cursor: (!campaign.activeDay && cycleStatus.data.dayCount >= 5) ? "not-allowed" : "pointer",
                opacity: (!campaign.activeDay && cycleStatus.data.dayCount >= 5) ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s ease",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
              title={!campaign.activeDay && cycleStatus.data.dayCount >= 5
                ? "Limite de 5 campanhas no ciclo DIA atingido"
                : campaign.activeDay
                ? "Clique para desativar ciclo DIA"
                : "Clique para ativar ciclo DIA"}
            >
              <span style={{ fontSize: "14px" }}>☀️</span>
              {campaign.activeDay ? "ATIVO" : "INATIVO"}
            </button>

            {/* CICLO NOITE */}
            <button
              onClick={() => {
                const newState = !(campaign.activeNight || false);
                toggleCycleActivation.mutate({
                  campaignId: campaign.id,
                  period: "night",
                  active: newState,
                });
              }}
              disabled={
                toggleCycleActivation.isPending ||
                (!campaign.activeNight && cycleStatus.data.nightCount >= 5)
              }
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                border: `2px solid ${campaign.activeNight ? "#3ec87a" : "#555"}`,
                background: campaign.activeNight ? "rgba(62, 200, 122, 0.25)" : "rgba(50, 50, 50, 0.5)",
                color: campaign.activeNight ? "#3ec87a" : "#888",
                fontSize: "12px",
                fontWeight: 700,
                cursor: (!campaign.activeNight && cycleStatus.data.nightCount >= 5) ? "not-allowed" : "pointer",
                opacity: (!campaign.activeNight && cycleStatus.data.nightCount >= 5) ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s ease",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
              title={!campaign.activeNight && cycleStatus.data.nightCount >= 5
                ? "Limite de 5 campanhas no ciclo NOITE atingido"
                : campaign.activeNight
                ? "Clique para desativar ciclo NOITE"
                : "Clique para ativar ciclo NOITE"}
            >
              <span style={{ fontSize: "14px" }}>🌙</span>
              {campaign.activeNight ? "ATIVO" : "INATIVO"}
            </button>
          </div>

          {/* Contador de campanhas ativas */}
          <div style={{
            marginTop: "6px",
            fontSize: "9px",
            color: "#3a5a40",
            textAlign: "center",
            display: "flex",
            justifyContent: "space-around",
          }}>
            <span>DIA: {cycleStatus.data.dayCount}/5</span>
            <span>NOITE: {cycleStatus.data.nightCount}/5</span>
          </div>
        </div>
      )}

      {/* Barra de progresso do ciclo */}
      <div style={{ marginBottom: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#3a5a40", marginBottom: "4px" }}>
          <span>Progresso do ciclo (10h)</span>
          <span style={{ color: progressPercent === 100 ? "#e8a83e" : "#3ec87a", fontWeight: 600 }}>
            {progressPercent}%
          </span>
        </div>
        <div className="rmt-prog-bar">
          <div
            className="rmt-prog-fill"
            style={{
              width: `${progressPercent}%`,
              background: progressPercent === 100 ? "linear-gradient(90deg, #7a5010, #c87820)" : "#1e6b30",
            }}
          />
        </div>
      </div>

      {/* Barra de tempo da hora (apenas ativo+rodando) */}
      {isActive && isRunning && (
        <div style={{ marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#3a5a40", marginBottom: "4px" }}>
            <span>Tempo da hora</span>
            <span style={{ color: "#5ba4e8", fontWeight: 600 }}>{timePercent}%</span>
          </div>
          <div className="rmt-prog-bar">
            <div className="rmt-prog-fill" style={{ width: `${timePercent}%`, background: "linear-gradient(90deg, #1a407a, #3a70c8)" }} />
          </div>
        </div>
      )}

      {/* Mini stats 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
        <div className="rmt-mini-stat">
          <p style={{ fontSize: "9px", color: "#3a5a40", margin: "0 0 2px" }}>Enviadas</p>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#3ec87a", margin: 0 }}>
            {sentCount}<span style={{ fontSize: "11px", color: "#2a4a30" }}>/{totalContacts}</span>
          </p>
        </div>
        <div className="rmt-mini-stat">
          <p style={{ fontSize: "9px", color: "#3a5a40", margin: "0 0 2px" }}>Faltam</p>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#e8a83e", margin: 0 }}>{pendingCount}</p>
        </div>
        <div className="rmt-mini-stat">
          <p style={{ fontSize: "9px", color: "#3a5a40", margin: "0 0 2px" }}>Hora atual</p>
          <p style={{ fontSize: "16px", fontWeight: 600, color: "#a07ee8", margin: 0 }}>
            {hourNumber + 1}<span style={{ fontSize: "11px", color: "#3a2a5a" }}>/10</span>
          </p>
        </div>
        <div className="rmt-mini-stat">
          <p style={{ fontSize: "9px", color: "#3a5a40", margin: "0 0 2px" }}>Esta hora</p>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "3px" }}>
            {hasSentThisHour ? (
              <>
                <CheckCircle2 size={13} style={{ color: "#3ec87a" }} />
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#3ec87a" }}>Enviou</span>
              </>
            ) : (
              <>
                <Clock size={13} style={{ color: "#e8a83e" }} />
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#e8a83e" }}>Pendente</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info texto */}
      <p style={{ fontSize: "9px", color: "#2a4a30", marginBottom: "8px" }}>
        Iniciado: {schedulerStartedAt || "--:--:--"}    {campaign.messagesPerHour || 1} msg/hora  {Math.round(cycleDuration / 3600)}h = {totalContacts} contatos
      </p>

      {/* Botúo contatos */}
      <button onClick={onToggle} className="rmt-contacts-btn">
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Users size={12} style={{ color: "#3a6a45" }} />
          <span style={{ fontWeight: 600, color: "#6a9a7a" }}>
            Contatos ({sentCount}/{totalContacts})
          </span>
          <span style={{ color: "#2a4a30" }}>
            {sentCount} enviados • {pendingCount} aguardando
          </span>
        </div>
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {/* Lista de contatos expandida */}
      {expanded && (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "5px", maxHeight: "320px", overflowY: "auto" }}>
          {contactsList.length === 0 ? (
            <p style={{ fontSize: "12px", color: "#3a5a40", textAlign: "center", padding: "16px 0" }}>
              Nenhum contato designado
            </p>
          ) : (
            contactsList.map((contact: any) => (
              <div
                key={`contact-${contact.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: `1px solid ${
                    contact.status === "sent"
                      ? "rgba(62,200,122,0.15)"
                      : contact.status === "failed"
                      ? "rgba(220,60,60,0.15)"
                      : "rgba(26,53,32,0.8)"
                  }`,
                  background:
                    contact.status === "sent"
                      ? "rgba(62,200,122,0.05)"
                      : contact.status === "failed"
                      ? "rgba(220,60,60,0.05)"
                      : "rgba(8,15,10,0.8)",
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "4px",
                    border: `1px solid ${
                      contact.status === "sent" ? "#3ec87a" : contact.status === "failed" ? "#e85a5a" : "#1a3520"
                    }`,
                    background:
                      contact.status === "sent"
                        ? "rgba(62,200,122,0.2)"
                        : contact.status === "failed"
                        ? "rgba(220,60,60,0.2)"
                        : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {contact.status === "sent" && <CheckCircle2 size={10} style={{ color: "#3ec87a" }} />}
                  {contact.status === "failed" && <AlertCircle size={10} style={{ color: "#e85a5a" }} />}
                </div>
                <span style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 600, minWidth: "120px", color: "#8ab5a0" }}>
                  {String(contact.phone || "")}
                </span>
                <span style={{ fontSize: "11px", color: "#3a5a40", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {String(contact.name || "")}
                </span>
                <div style={{ flexShrink: 0 }}>
                  {contact.status === "sent" ? (
                    <span style={{ fontSize: "10px", color: "#3ec87a", fontFamily: "monospace", background: "rgba(62,200,122,0.08)", padding: "2px 6px", borderRadius: "6px", border: "1px solid rgba(62,200,122,0.15)" }}>
                      {formatTime(contact.sentAt)}
                    </span>
                  ) : contact.status === "failed" ? (
                    <span style={{ fontSize: "10px", color: "#e85a5a", background: "rgba(220,60,60,0.08)", padding: "2px 6px", borderRadius: "6px", border: "1px solid rgba(220,60,60,0.15)" }}>
                      Falha
                    </span>
                  ) : (
                    <Clock size={12} style={{ color: "#3a5a40" }} />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

