import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Play, Square, RotateCcw, Zap, Settings2, CheckCircle2, Clock, AlertCircle, Loader2, ArrowLeft, Timer, BarChart3, Send, Users, Pause } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * REGRAS DO SISTEMA v4.0 - DARK PREMIUM:
 * - msgs/hora CONFIGURÁVEL por campanha (1-10, padrão 2)
 * - Slots aleatórios distribuídos dentro de 60 min
 * - Mínimo 3 min entre msgs (segurança anti-ban)
 * - Rotação de pares: (1+2) → (3+4) → (1+2)...
 * - Contatos por campanha = msgs/hora × 12 (1=12, 2=24, 3=36...)
 * - Loop infinito 24/7
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
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const schedulerState = trpc.scheduler.getState.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const campaignDetails = trpc.scheduler.getCampaignDetails.useQuery(undefined, {
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (schedulerState.data !== undefined && campaignDetails.data !== undefined) {
      setIsLoading(false);
    }
  }, [schedulerState.data, campaignDetails.data]);

  const autoSetup = trpc.campaigns.autoSetup.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.campaigns.length} campanhas criadas com ${data.totalContacts} contatos!`);
      campaignDetails.refetch();
      schedulerState.refetch();
      setIsSettingUp(false);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
      setIsSettingUp(false);
    },
  });

  const startScheduler = trpc.scheduler.start.useMutation({
    onSuccess: () => {
      toast.success("Scheduler iniciado! Loop infinito 24/7");
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

  const utils = trpc.useUtils();
  const resetScheduler = trpc.scheduler.reset.useMutation({
    onSuccess: () => {
      toast.success("Campanhas resetadas com novos contatos! Clique em Iniciar.");
      utils.scheduler.getCampaignDetails.invalidate();
      utils.scheduler.getState.invalidate();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
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
  const allCampaigns = useMemo(() => (campaignDetails.data || []).filter((c: any) => !String(c.name || '').startsWith('TESTE_AUTO')), [campaignDetails.data]);
  const cycleNumber = useMemo(() => stats?.cycleNumber || 0, [stats?.cycleNumber]);
  const runningCampaigns = useMemo(() => allCampaigns.filter((c: any) => c.status === "running"), [allCampaigns]);
  const totalPairs = useMemo(() => Math.ceil(runningCampaigns.length / 2), [runningCampaigns.length]);

  const currentPairIndex = useMemo(() => {
    if (stateData?.activePair?.index !== undefined) return stateData.activePair.index;
    return totalPairs > 0 ? cycleNumber % totalPairs : 0;
  }, [stateData?.activePair?.index, cycleNumber, totalPairs]);

  const activePairNames = useMemo(() => {
    return stateData?.activePair?.campaigns || [];
  }, [stateData?.activePair?.campaigns]);

  const totals = useMemo(() => {
    const totalContacts = allCampaigns.reduce((sum: number, c: any) => sum + (c.totalContacts || 0), 0);
    const totalSent = allCampaigns.reduce((sum: number, c: any) => sum + (c.sentCount || 0), 0);
    const totalPending = allCampaigns.reduce((sum: number, c: any) => sum + (c.pendingCount || 0), 0);
    const totalFailed = allCampaigns.reduce((sum: number, c: any) => sum + (c.failedCount || 0), 0);
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

  // Progresso do tempo: 0% no início → 100% quando ciclo completa
  const timeProgressPercent = cycleDuration > 0 ? Math.round(((cycleDuration - localTimer) / cycleDuration) * 100) : 0;

  const handleAutoSetup = useCallback(() => {
    setIsSettingUp(true);
    autoSetup.mutate();
  }, [autoSetup]);

  const handleStart = useCallback(() => {
    if (allCampaigns.length < 2) {
      toast.error("Configure as campanhas primeiro! Clique em 'Auto Configurar'");
      return;
    }
    startScheduler.mutate();
  }, [allCampaigns.length, startScheduler]);

  const handleReset = useCallback(() => {
    if (isRunning) {
      toast.error("Pare o scheduler antes de resetar!");
      return;
    }
    resetScheduler.mutate();
  }, [isRunning, resetScheduler]);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedCampaign((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">Carregando campanhas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header Premium Dark */}
      <div className="bg-gradient-to-r from-[#0a2e1a] via-[#1a5c2e] to-[#0d3d1f] border-b border-emerald-900/50 p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-white">
                <Send className="h-7 w-7 text-emerald-400" />
                <span>Romatec CRM Campanhas WhatsApp</span>
              </h1>
              <p className="text-emerald-300/70 text-sm mt-1">
                msgs/hora configurável por campanha | Ciclo 24h/dia, 7 dias/semana
              </p>
            </div>
          </div>
          <div>
            {isRunning ? (
              <span className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse" />
                RODANDO
              </span>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-red-500/20 border border-red-500/40 text-red-400">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                PARADO
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">

        {/* Painel de Controle - Dark */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Painel de Controle
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              isRunning
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-red-500/15 text-red-400 border border-red-500/30"
            }`}>
              {isRunning ? "Ativo 24/7" : "Parado"}
            </span>
          </div>

          {/* Stats Grid - Dark */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { icon: Users, label: "Total Contatos", value: totals.totalContacts, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
              { icon: CheckCircle2, label: "Enviadas", value: totals.totalSent, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { icon: Clock, label: "Restantes", value: totals.totalPending, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
              { icon: AlertCircle, label: "Falhas", value: totals.totalFailed, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
              { icon: BarChart3, label: "Taxa Sucesso", value: `${totals.successRate}%`, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
            ].map((stat) => (
              <div key={stat.label} className={`p-3 rounded-xl text-center border ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color} mx-auto mb-1`} />
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Cronômetro Principal - Dark */}
          {isRunning && (
            <div className="p-5 rounded-xl bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-purple-900/30 border border-purple-500/20 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-purple-300 flex items-center gap-2">
                    <Timer className="h-5 w-5" />
                    Próximo Ciclo em:
                  </p>
                  <p className="text-xs text-purple-400/60 mt-1">
                    Ciclo {cycleNumber + 1} | Par {currentPairIndex + 1} de {totalPairs}
                  </p>
                </div>
                <span className="text-5xl font-mono font-bold text-purple-400 tabular-nums text-glow-green" style={{ textShadow: '0 0 20px rgba(168, 85, 247, 0.5)' }}>
                  {formatTimer(localTimer)}
                </span>
              </div>
              {/* Barra de progresso do ciclo */}
              <div className="w-full bg-purple-900/40 rounded-full h-2 mb-4">
                <div
                  className="bg-gradient-to-r from-purple-500 to-purple-400 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${timeProgressPercent}%` }}
                />
              </div>
              {/* Info de tempo */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-muted-foreground">Início às</p>
                  <p className="text-sm font-bold text-purple-300">{stateData?.startedAtFormatted || "--:--:--"}</p>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-muted-foreground">Rodando há</p>
                  <p className="text-sm font-bold text-purple-300">{stateData?.uptimeFormatted || "00:00:00"}</p>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-xs text-muted-foreground">Próximo ciclo</p>
                  <p className="text-sm font-bold text-purple-300">{stateData?.nextCycleFormatted || "--:--:--"}</p>
                </div>
              </div>
              {/* Msgs neste ciclo */}
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">Msgs neste ciclo:</span>
                <span className="font-bold text-purple-300">{stats?.messagesThisHour || 0}/{stats?.maxMessagesPerHour || 0}</span>
                {(stats?.maxMessagesPerHour || 0) > 0 && (stats?.messagesThisHour || 0) >= (stats?.maxMessagesPerHour || 0) && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">Ciclo completo</span>
                )}
              </div>
              {/* Slots agendados */}
              {(stats as any)?.scheduledSlots && (stats as any).scheduledSlots.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {(stats as any).scheduledSlots.map((slot: any, idx: number) => (
                    <span key={idx} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                      slot.sent
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 line-through"
                        : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                    }`}>
                      {slot.campaignName.substring(0, 8)}@{slot.minuteLabel}min
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Botões de Controle - Dark */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={handleAutoSetup}
              disabled={isSettingUp || isRunning}
              className="h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white shadow-lg shadow-purple-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSettingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Auto
            </button>

            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={allCampaigns.length < 2}
                className="h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-lg shadow-emerald-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4" /> Iniciar
              </button>
            ) : (
              <button
                onClick={() => stopScheduler.mutate()}
                className="h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-900/30"
              >
                <Pause className="h-4 w-4" /> Pausar
              </button>
            )}

            <button
              onClick={() => {
                if (isRunning) {
                  toast.error("Pare o scheduler antes de redefinir!");
                  return;
                }
                if (confirm("Tem certeza? Isso vai limpar TUDO e começar do zero com novos contatos (msgs/hora × 12 por campanha).")) {
                  resetScheduler.mutate();
                }
              }}
              disabled={isRunning}
              className={`h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                isRunning
                  ? "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-900/30"
              }`}
            >
              {resetScheduler.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Redefinir
            </button>

            <button
              onClick={() => {
                if (!isRunning) {
                  toast.error("O scheduler já está parado!");
                  return;
                }
                if (confirm("Tem certeza que deseja PARAR TUDO? As campanhas serão pausadas.")) {
                  stopScheduler.mutate();
                }
              }}
              disabled={!isRunning}
              className={`h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                !isRunning
                  ? "bg-secondary/50 text-muted-foreground cursor-not-allowed"
                  : "bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 text-white shadow-lg shadow-red-900/30"
              }`}
            >
              {stopScheduler.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Parar Tudo
            </button>
          </div>
        </div>

        {/* Rotação de Pares - Dark */}
        {runningCampaigns.length >= 2 && (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground mb-4">
              <Zap className="h-5 w-5 text-amber-400" />
              Rotação de Pares - Ciclo Atual
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" key={`pairs-${runningCampaigns.length}`}>
              {Array.from({ length: totalPairs }).map((_, pairIdx) => {
                const camp1 = runningCampaigns[pairIdx * 2];
                const camp2 = runningCampaigns[pairIdx * 2 + 1];
                const isCurrentPair = isRunning && (
                  currentPairIndex === pairIdx ||
                  (activePairNames.length > 0 && camp1 && activePairNames.includes(camp1.name))
                );
                const isNextPair = isRunning && !isCurrentPair && (currentPairIndex + 1) % totalPairs === pairIdx && totalPairs > 1;

                return (
                  <div
                    key={`pair-${pairIdx}-${camp1?.id || 0}-${camp2?.id || 0}`}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrentPair
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-500/30"
                        : isNextPair
                        ? "bg-amber-500/10 border-amber-500/30 shadow-md shadow-amber-900/10"
                        : "bg-secondary/30 border-border/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`inline-block w-4 h-4 rounded-full ${
                        isCurrentPair ? "bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" : isNextPair ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/30"
                      }`} />
                      <h3 className={`font-bold text-sm ${
                        isCurrentPair ? "text-emerald-400" : isNextPair ? "text-amber-400" : "text-muted-foreground"
                      }`}>
                        {isCurrentPair ? "ENVIANDO AGORA" : isNextPair ? "PRÓXIMO PAR" : `Par ${pairIdx + 1}`}
                      </h3>
                      {isCurrentPair && (
                        <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                          ATIVO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                        isCurrentPair ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-secondary/50 border-border/50 text-foreground/70"
                      }`}>
                        {camp1?.name || "?"}
                      </span>
                      <span className="text-muted-foreground font-bold">+</span>
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                        isCurrentPair ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-secondary/50 border-border/50 text-foreground/70"
                      }`}>
                        {camp2?.name || camp1?.name || "?"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {(() => {
                        const c1mph = allCampaigns.find((c: any) => c.name === camp1?.name)?.messagesPerHour || 2;
                        const c2mph = camp2 ? (allCampaigns.find((c: any) => c.name === camp2?.name)?.messagesPerHour || 2) : 0;
                        return `${c1mph}+${c2mph} = ${c1mph + c2mph} msgs/hora`;
                      })()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Monitoramento em Tempo Real - Dark */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
            Monitoramento em Tempo Real
          </h2>
          {allCampaigns.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Settings2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground mb-4 text-lg">Nenhuma campanha configurada</p>
              <p className="text-muted-foreground text-sm mb-6">Clique em "Auto Configurar" para criar campanhas automaticamente</p>
              <button onClick={handleAutoSetup} disabled={isSettingUp} className="btn-premium">
                {isSettingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                Auto Configurar Campanhas
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" key={`campaigns-${allCampaigns.length}`}>
              {allCampaigns.map((campaign: any) => (
                <CampaignCard
                  key={`camp-${campaign.id}`}
                  campaign={campaign}
                  isRunning={isRunning}
                  currentPairIndex={currentPairIndex}
                  totalPairs={totalPairs}
                  cycleTimer={localTimer}
                  cycleDuration={cycleDuration}
                  cycleNumber={cycleNumber}
                  runningCampaigns={runningCampaigns}
                  activePairNames={activePairNames}
                  schedulerStartedAt={stateData?.startedAtFormatted || null}
                  expanded={expandedCampaign === campaign.id}
                  onToggle={() => handleToggleExpand(campaign.id)}
                  onToggleActive={(active: boolean) => toggleCampaign.mutate({ campaignId: campaign.id, active })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mensagens de Hoje - Dark */}
        {todayMessages.length > 0 && (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground mb-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Mensagens Enviadas Hoje ({todayMessages.length})
            </h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {todayMessages.map((msg: any) => (
                <div key={`msg-${msg.id}`} className="flex items-center gap-3 p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-mono text-emerald-300">{formatTime(msg.sentAt)}</span>
                  <span className="text-sm text-foreground/70 truncate">
                    {String(msg.messageText || '').substring(0, 80)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Card de cada campanha - Dark Premium
 */
function CampaignCard({
  campaign,
  isRunning,
  currentPairIndex,
  totalPairs,
  cycleTimer,
  cycleDuration,
  cycleNumber,
  runningCampaigns,
  activePairNames,
  schedulerStartedAt,
  expanded,
  onToggle,
  onToggleActive,
}: {
  campaign: any;
  isRunning: boolean;
  currentPairIndex: number;
  totalPairs: number;
  cycleTimer: number;
  cycleDuration: number;
  cycleNumber: number;
  runningCampaigns: any[];
  activePairNames: string[];
  schedulerStartedAt: string | null;
  expanded: boolean;
  onToggle: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const [editingMph, setEditingMph] = useState(false);
  const [mphValue, setMphValue] = useState(campaign.messagesPerHour || 2);
  const utils = trpc.useUtils();

  const updateMph = trpc.scheduler.updateMessagesPerHour.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setEditingMph(false);
      utils.scheduler.getCampaignDetails.invalidate();
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  useEffect(() => {
    setMphValue(campaign.messagesPerHour || 2);
  }, [campaign.messagesPerHour]);

  const isActive = campaign.status === "running";

  const isInCurrentPair = isRunning && isActive && (
    activePairNames.includes(campaign.name) ||
    (() => {
      const runningIdx = runningCampaigns.findIndex((c: any) => c.id === campaign.id);
      const pairIndex = runningIdx >= 0 ? Math.floor(runningIdx / 2) : -1;
      return pairIndex === currentPairIndex;
    })()
  );

  const runningIdx = runningCampaigns.findIndex((c: any) => c.id === campaign.id);
  const pairIndex = runningIdx >= 0 ? Math.floor(runningIdx / 2) : -1;
  const isInNextPair = isRunning && isActive && !isInCurrentPair && pairIndex === (currentPairIndex + 1) % totalPairs && totalPairs > 1;

  const contactsList: any[] = campaign.contacts || [];
  const sentCount = campaign.sentCount || 0;
  const pendingCount = campaign.pendingCount || 0;
  const mph = campaign.messagesPerHour || 2;
  const totalContacts = campaign.totalContacts || (mph * 12);
  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;
  const hasSentThisCycle = sentCount > 0;

  // Progresso do tempo do ciclo - CORRIGIDO: usa cycleDuration real
  const timePercent = cycleDuration > 0 ? Math.round(((cycleDuration - cycleTimer) / cycleDuration) * 100) : 0;

  // Cores e status baseados no estado
  let statusText = "Agendado";
  let ledClass = "bg-muted-foreground/30";
  let borderAccent = "border-l-muted/50";
  let cardBg = "";
  let statusBadge = "bg-secondary/50 text-muted-foreground border-border/50";

  if (!isActive) {
    statusText = "Pausada";
    cardBg = "opacity-50";
    ledClass = "bg-muted-foreground/30";
    statusBadge = "bg-secondary/50 text-muted-foreground border-border/50";
    borderAccent = "border-l-muted/50";
  } else if (isInCurrentPair && hasSentThisCycle) {
    statusText = "Enviado";
    ledClass = "bg-emerald-400 shadow-lg shadow-emerald-400/50";
    borderAccent = "border-l-emerald-500";
    cardBg = "ring-1 ring-emerald-500/20";
    statusBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (isInCurrentPair) {
    statusText = "Enviando";
    ledClass = "bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50";
    borderAccent = "border-l-emerald-500";
    cardBg = "ring-1 ring-emerald-500/30";
    statusBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (isInNextPair) {
    statusText = "Próximo";
    ledClass = "bg-amber-400 animate-pulse shadow-lg shadow-amber-400/30";
    borderAccent = "border-l-amber-500";
    cardBg = "ring-1 ring-amber-500/20";
    statusBadge = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  } else {
    statusText = "Ativo";
    ledClass = "bg-blue-400";
    borderAccent = "border-l-blue-500";
    statusBadge = "bg-blue-500/15 text-blue-400 border-blue-500/30";
  }

  return (
    <div className={`glass-card border-l-4 ${borderAccent} ${cardBg} hover:shadow-xl transition-all`}>
      {/* Header do Card */}
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full ${ledClass}`} />
            <div>
              <h3 className="text-lg font-bold text-foreground">{String(campaign.name || '')}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge}`}>
                  {isInCurrentPair && <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />}
                  {statusText}
                </span>
                <span className="text-xs text-muted-foreground">
                  Imovel: {String(campaign.propertyName || '')}
                </span>
              </div>
            </div>
          </div>
          {/* Cronômetro no canto */}
          <div className="flex items-center gap-3">
            {isActive && (
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold tabular-nums ${
                  isInCurrentPair ? "text-emerald-400" : "text-muted-foreground/50"
                }`}>{formatTimer(cycleTimer)}</span>
                <p className="text-xs text-muted-foreground">Cronômetro (1 hora)</p>
              </div>
            )}
            {!isActive && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Pausado</span>
                <Switch
                  checked={isActive}
                  onCheckedChange={onToggleActive}
                  disabled={isRunning}
                />
              </div>
            )}
          </div>
        </div>

        {/* Campo msgs/hora - Dark */}
        <div className="mt-3 flex items-center gap-3 p-2.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
          <span className="text-xs font-semibold text-indigo-300">msgs/hora:</span>
          {editingMph ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-indigo-500/30 rounded-lg overflow-hidden">
                <button
                  onClick={() => setMphValue(Math.max(1, mphValue - 1))}
                  className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-sm transition-colors"
                >-</button>
                <span className="px-3 py-1 text-lg font-bold text-indigo-200 bg-secondary/50 min-w-[40px] text-center">{mphValue}</span>
                <button
                  onClick={() => setMphValue(Math.min(10, mphValue + 1))}
                  className="px-2.5 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-bold text-sm transition-colors"
                >+</button>
              </div>
              <button
                onClick={() => updateMph.mutate({ campaignId: campaign.id, messagesPerHour: mphValue })}
                disabled={updateMph.isPending}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors"
              >{updateMph.isPending ? '...' : 'Salvar'}</button>
              <button
                onClick={() => { setEditingMph(false); setMphValue(campaign.messagesPerHour || 2); }}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >Cancelar</button>
            </div>
          ) : (
            <button
              onClick={() => setEditingMph(true)}
              className="flex items-center gap-1 px-3 py-1 bg-secondary/50 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/10 transition-colors"
            >
              <span className="text-xl font-bold text-indigo-300">{campaign.messagesPerHour || 2}</span>
              <span className="text-xs text-indigo-400/60 ml-1">×12 = {(campaign.messagesPerHour || 2) * 12} contatos</span>
            </button>
          )}
        </div>
      </div>

      {/* Content do Card */}
      <div className="px-5 pb-5">
        {/* Progresso do Ciclo (msgs enviadas) */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground font-medium">Progresso do Ciclo</p>
            <p className={`text-sm font-bold ${progressPercent === 100 ? "text-amber-400" : "text-emerald-400"}`}>{progressPercent}%</p>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${progressPercent === 100 ? "bg-gradient-to-r from-amber-500 to-orange-500" : ""}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Barra de Tempo - CORRIGIDA: percentual acompanha a barra */}
        {isActive && isRunning && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground font-medium">Tempo do Ciclo</p>
              <p className="text-sm font-bold text-blue-400">{timePercent}%</p>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-1000 bg-gradient-to-r from-blue-500 to-blue-400"
                style={{ width: `${timePercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats Grid - Dark */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <p className="text-xs text-muted-foreground">Enviadas</p>
            <p className="text-xl font-bold text-emerald-400">{sentCount}<span className="text-sm text-muted-foreground">/{totalContacts}</span></p>
          </div>
          <div className="p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <p className="text-xs text-muted-foreground">Faltam</p>
            <p className="text-xl font-bold text-amber-400">{pendingCount}</p>
          </div>
          <div className="p-2.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <p className="text-xs text-muted-foreground">Ciclo Atual</p>
            <p className="text-xl font-bold text-purple-400">{cycleNumber + 1}<span className="text-sm text-muted-foreground">/{totalContacts}</span></p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <p className="text-xs text-muted-foreground">Taxa do Dia</p>
            <p className="text-xl font-bold text-blue-400">
              {totalContacts > 0 ? `${((sentCount / totalContacts) * 100).toFixed(1)}%` : "0.0%"}
            </p>
            <p className="text-xs text-muted-foreground">Meta: {totalContacts} msg/dia</p>
          </div>
        </div>

        {/* Cronômetro inline para par ativo */}
        {isInCurrentPair && (
          <div className="p-3 bg-emerald-500/10 rounded-lg mb-4 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
                <Timer className="h-4 w-4" />
                Próximo Ciclo em:
              </p>
              <span className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">{formatTimer(cycleTimer)}</span>
            </div>
          </div>
        )}

        {/* Info de início - CORRIGIDO: usa horário do scheduler */}
        <p className="text-xs text-muted-foreground mb-3">
          Iniciado: {schedulerStartedAt || "--:--:--"} | {mph} msgs/h × 12 ciclos = {totalContacts} contatos | 12 horas
        </p>

        {/* Toggle Lista de Contatos - Dark */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Contatos ({sentCount}/{totalContacts})</span>
            <span className="text-xs text-muted-foreground">{sentCount} enviados | {pendingCount} aguardando</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {/* Lista de Contatos Expandível - Dark */}
        {expanded && (
          <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto" key={`contacts-${campaign.id}-${contactsList.length}`}>
            {contactsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum contato designado</p>
            ) : (
              contactsList.map((contact: any) => (
                <div
                  key={`contact-${contact.id}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    contact.status === "sent"
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : contact.status === "failed"
                      ? "bg-red-500/10 border-red-500/20"
                      : "bg-secondary/20 border-border/30"
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    contact.status === "sent"
                      ? "bg-emerald-500 border-emerald-500"
                      : contact.status === "failed"
                      ? "bg-red-500 border-red-500"
                      : "border-muted-foreground/30"
                  }`}>
                    {contact.status === "sent" && <CheckCircle2 className="h-3 w-3 text-white" />}
                    {contact.status === "failed" && <AlertCircle className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-sm font-mono font-semibold min-w-[130px] text-foreground/80">
                    {String(contact.phone || '')}
                  </span>
                  <span className="text-sm text-muted-foreground truncate flex-1">
                    ({String(contact.name || '')})
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {contact.status === "sent" ? (
                      <span className="text-xs text-emerald-400 font-mono bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/20">
                        {formatTime(contact.sentAt)}
                      </span>
                    ) : contact.status === "failed" ? (
                      <span className="text-xs text-red-400 bg-red-500/15 px-2 py-0.5 rounded border border-red-500/20">
                        Falha
                      </span>
                    ) : (
                      <Clock className="h-4 w-4 text-amber-400/60" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
