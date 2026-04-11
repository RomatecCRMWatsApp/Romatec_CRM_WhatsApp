import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Play, Zap, Settings2, CheckCircle2, Clock, AlertCircle, Loader2, ArrowLeft, Timer, BarChart3, Send, Users, Pause } from "lucide-react";
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
        setResetKey(prev => prev + 1);
      } catch (e) {
        console.warn('[Reset] Erro ao refetch:', e);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
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
  const allCampaigns = useMemo(() => (campaignDetails.data || []).filter((c: any) => !String(c.name || '').startsWith('TESTE_AUTO')), [campaignDetails.data]);
  const hourNumber = useMemo(() => stats?.cycleNumber || 0, [stats?.cycleNumber]);
  const campaignStates = useMemo(() => stateData?.campaignStates || [], [stateData?.campaignStates]);
  const sentThisHour = useMemo(() => stats?.messagesThisHour || 0, [stats?.messagesThisHour]);
  const totalCampsActive = useMemo(() => stats?.maxMessagesPerHour || 0, [stats?.maxMessagesPerHour]);

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

  const timeProgressPercent = cycleDuration > 0 ? Math.round(((cycleDuration - localTimer) / cycleDuration) * 100) : 0;

  const handleStart = useCallback(() => {
    if (allCampaigns.length < 1) return;
    startScheduler.mutate();
  }, [allCampaigns.length, startScheduler]);

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
      <div className="bg-gradient-to-r from-[#0a2e1a] via-[#1a5c2e] to-[#0d3d1f] border-b border-emerald-900/50 p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-white">
                <Send className="h-7 w-7 text-emerald-400" />
                <span>Romatec CRM Campanhas</span>
              </h1>
              <p className="text-emerald-300/70 text-sm mt-1">
                1 msg/campanha/hora | Ciclo de 10 horas | {allCampaigns.length} campanhas
              </p>
            </div>
          </div>
          <div>
            {isRunning ? (
              <span className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />RODANDO
              </span>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-red-500/20 border border-red-500/40 text-red-400">
                <span className="w-3 h-3 rounded-full bg-red-400" />PARADO
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
              <BarChart3 className="h-5 w-5 text-emerald-400" />Painel de Controle
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${isRunning ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30"}`}>
              {isRunning ? "Ativo" : "Parado"}
            </span>
          </div>

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

          {isRunning && (
            <div className="p-5 rounded-xl bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-purple-900/30 border border-purple-500/20 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-purple-300 flex items-center gap-2">
                    <Timer className="h-5 w-5" />Próxima Hora em:
                  </p>
                  <p className="text-xs text-purple-400/60 mt-1">
                    Hora {hourNumber + 1}/10 | {sentThisHour}/{totalCampsActive} campanhas enviaram
                  </p>
                </div>
                <span className="text-5xl font-mono font-bold text-purple-400 tabular-nums">
                  {formatTimer(localTimer)}
                </span>
              </div>
              <div className="w-full bg-purple-900/40 rounded-full h-2 mb-4">
                <div className="bg-gradient-to-r from-purple-500 to-purple-400 h-2 rounded-full transition-all duration-1000" style={{ width: `${timeProgressPercent}%` }} />
              </div>
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
                  <p className="text-xs text-muted-foreground">Próxima hora</p>
                  <p className="text-sm font-bold text-purple-300">{stateData?.nextCycleFormatted || "--:--"}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">Enviadas nesta hora:</span>
                <span className="font-bold text-purple-300">{sentThisHour}/{totalCampsActive}</span>
                {totalCampsActive > 0 && sentThisHour >= totalCampsActive && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">Hora completa!</span>
                )}
              </div>
              {(stats as any)?.scheduledSlots && (stats as any).scheduledSlots.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {(stats as any).scheduledSlots.map((slot: any, idx: number) => (
                    <span key={idx} className={`text-xs px-2 py-0.5 rounded-full font-mono border ${slot.sent ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 line-through" : "bg-purple-500/15 text-purple-300 border-purple-500/30"}`}>
                      {slot.campaignName.substring(0, 10)}@{slot.minuteLabel}min
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-xl border border-border/30 mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{nightMode ? "🌙 Modo Noite 20h-06h" : "☀️ Modo Dia 08h-18h"}</p>
              <p className="text-xs text-muted-foreground">{nightMode ? "Enviando das 20h às 06h" : "Enviando das 08h às 18h"}</p>
            </div>
            <button onClick={() => { setNightMode(n => !n); toast.success(!nightMode ? "🌙 Modo Noite ativado!" : "☀️ Modo Dia ativado!"); }} className={"relative w-14 h-7 rounded-full transition-all " + (nightMode ? "bg-indigo-600" : "bg-emerald-500")}>
              <span className={"absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all " + (nightMode ? "left-7" : "left-0.5")} />
            </button>
          </div>

          <div className="flex gap-3">
            {!isRunning ? (
              <button onClick={handleStart} disabled={allCampaigns.length < 1} className="flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed">
                <Play className="h-4 w-4" /> Iniciar Campanhas
              </button>
            ) : (
              <button onClick={() => stopScheduler.mutate()} className="flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg">
                <Pause className="h-4 w-4" /> Pausar Campanhas
              </button>
            )}
            <button onClick={() => { if (isRunning) { toast.error("Pare o scheduler antes de redefinir!"); return; } if (confirm("Tem certeza? Isso vai limpar TUDO e começar do zero.")) { resetScheduler.mutate(); } }} disabled={isRunning} className="h-12 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed">
              Redefinir
            </button>
          </div>
        </div>

        {allCampaigns.length > 0 && isRunning && (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground mb-4">
              <Zap className="h-5 w-5 text-amber-400" />Status por Hora - Todas as Campanhas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" key={`hour-status-${resetKey}`}>
              {allCampaigns.filter((c: any) => c.status === "running").map((campaign: any) => {
                const campState = campaignStates.find((cs: any) => cs.campaignName === campaign.name);
                const hasSent = campState?.sentThisHour || false;
                return (
                  <div key={`hour-${campaign.id}`} className={`p-4 rounded-xl border transition-all ${hasSent ? "bg-emerald-500/10 border-emerald-500/40" : "bg-amber-500/10 border-amber-500/30"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block w-3 h-3 rounded-full ${hasSent ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                      <h3 className={`font-bold text-sm ${hasSent ? "text-emerald-400" : "text-amber-400"}`}>{hasSent ? "ENVIOU" : "AGUARDANDO"}</h3>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-bold border ${hasSent ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}>{hasSent ? "1/1" : "0/1"}</span>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border inline-block ${hasSent ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-amber-500/15 border-amber-500/30 text-amber-300"}`}>{campaign.name}</span>
                    <p className="text-xs text-muted-foreground mt-2">1 msg/hora | {campaign.sentCount || 0}/{campaign.totalContacts || 2} total</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5 text-emerald-400" />Monitoramento em Tempo Real
          </h2>
          {allCampaigns.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Settings2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground mb-4 text-lg">Nenhuma campanha configurada</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" key={`campaigns-${resetKey}-${allCampaigns.length}`}>
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
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ campaign, isRunning, hourNumber, cycleTimer, cycleDuration, campaignStates, schedulerStartedAt, todayMessages, expanded, onToggle, onToggleActive }: {
  campaign: any; isRunning: boolean; hourNumber: number; cycleTimer: number; cycleDuration: number; campaignStates: any[]; schedulerStartedAt: string | null; todayMessages: any[]; expanded: boolean; onToggle: () => void; onToggleActive: (active: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const isActive = campaign.status === "running";
  const campState = campaignStates.find((cs: any) => cs.campaignName === campaign.name);
  const hasSentThisHour = campState?.sentThisHour || false;
  const contactsList: any[] = campaign.contacts || [];
  const sentCount = campaign.sentCount || 0;
  const pendingCount = campaign.pendingCount || 0;
  const totalContacts = campaign.totalContacts || 2;
  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;
  const timePercent = cycleDuration > 0 ? Math.round(((cycleDuration - cycleTimer) / cycleDuration) * 100) : 0;

  let statusText = "Agendado";
  let ledClass = "bg-muted-foreground/30";
  let borderAccent = "border-l-muted/50";
  let cardBg = "";
  let statusBadge = "bg-secondary/50 text-muted-foreground border-border/50";

  if (!isActive) { statusText = "Pausada"; cardBg = "opacity-50"; borderAccent = "border-l-muted/50"; }
  else if (hasSentThisHour) { statusText = "Enviou nesta hora"; ledClass = "bg-emerald-400 shadow-lg shadow-emerald-400/50"; borderAccent = "border-l-emerald-500"; cardBg = "ring-1 ring-emerald-500/20"; statusBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"; }
  else if (isRunning) { statusText = "Aguardando envio"; ledClass = "bg-amber-400 animate-pulse"; borderAccent = "border-l-amber-500"; cardBg = "ring-1 ring-amber-500/20"; statusBadge = "bg-amber-500/15 text-amber-400 border-amber-500/30"; }
  else { statusText = "Ativo"; ledClass = "bg-blue-400"; borderAccent = "border-l-blue-500"; statusBadge = "bg-blue-500/15 text-blue-400 border-blue-500/30"; }

  return (
    <div className={`glass-card border-l-4 ${borderAccent} ${cardBg} hover:shadow-xl transition-all`}>
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full ${ledClass}`} />
            <div>
              <h3 className="text-lg font-bold text-foreground">{String(campaign.name || '')}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${statusBadge}`}>{statusText}</span>
                <span className="text-xs text-muted-foreground">Imóvel: {String(campaign.propertyName || '')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isActive && isRunning && (
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold tabular-nums ${hasSentThisHour ? "text-emerald-400" : "text-amber-400"}`}>{formatTimer(cycleTimer)}</span>
                <p className="text-xs text-muted-foreground">Próxima hora</p>
              </div>
            )}
            {!isActive && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Pausado</span>
                <Switch checked={isActive} onCheckedChange={onToggleActive} disabled={isRunning} />
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 p-2.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
          <span className="text-xs font-semibold text-indigo-300">Regra:</span>
          <span className="text-sm font-bold text-indigo-200">1 msg/hora</span>
          <span className="text-xs text-indigo-400/60 ml-1">× 10 horas = 10 contatos/ciclo</span>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground font-medium">Progresso do Ciclo (10h)</p>
            <p className={`text-sm font-bold ${progressPercent === 100 ? "text-amber-400" : "text-emerald-400"}`}>{progressPercent}%</p>
          </div>
          <div className="progress-bar">
            <div className={`progress-fill ${progressPercent === 100 ? "bg-gradient-to-r from-amber-500 to-orange-500" : ""}`} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {isActive && isRunning && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground font-medium">Tempo da Hora</p>
              <p className="text-sm font-bold text-blue-400">{timePercent}%</p>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-2">
              <div className="h-2 rounded-full transition-all duration-1000 bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: `${timePercent}%` }} />
            </div>
          </div>
        )}

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
            <p className="text-xs text-muted-foreground">Hora Atual</p>
            <p className="text-xl font-bold text-purple-400">{hourNumber + 1}<span className="text-sm text-muted-foreground">/10</span></p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <p className="text-xs text-muted-foreground">Esta Hora</p>
            <p className="text-xl font-bold text-blue-400">
              {hasSentThisHour ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-5 w-5" /> Enviou</span> : <span className="text-amber-400 flex items-center gap-1"><Clock className="h-5 w-5" /> Pendente</span>}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Iniciado: {schedulerStartedAt || "--:--:--"} | 1 msg/hora × 2 horas = {totalContacts} contatos
        </p>

        <button onClick={onToggle} className="w-full flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border/50 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Contatos ({sentCount}/{totalContacts})</span>
            <span className="text-xs text-muted-foreground">{sentCount} enviados | {pendingCount} aguardando</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
            {contactsList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum contato designado</p>
            ) : (
              contactsList.map((contact: any) => (
                <div key={`contact-${contact.id}`} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${contact.status === "sent" ? "bg-emerald-500/10 border-emerald-500/20" : contact.status === "failed" ? "bg-red-500/10 border-red-500/20" : "bg-secondary/20 border-border/30"}`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${contact.status === "sent" ? "bg-emerald-500 border-emerald-500" : contact.status === "failed" ? "bg-red-500 border-red-500" : "border-muted-foreground/30"}`}>
                    {contact.status === "sent" && <CheckCircle2 className="h-3 w-3 text-white" />}
                    {contact.status === "failed" && <AlertCircle className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-sm font-mono font-semibold min-w-[130px] text-foreground/80">{String(contact.phone || '')}</span>
                  <span className="text-sm text-muted-foreground truncate flex-1">({String(contact.name || '')})</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {contact.status === "sent" ? <span className="text-xs text-emerald-400 font-mono bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/20">{formatTime(contact.sentAt)}</span> : contact.status === "failed" ? <span className="text-xs text-red-400 bg-red-500/15 px-2 py-0.5 rounded border border-red-500/20">Falha</span> : <Clock className="h-4 w-4 text-amber-400/60" />}
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
