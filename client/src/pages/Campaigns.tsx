import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Play, Square, RotateCcw, Zap, Settings2, CheckCircle2, Clock, AlertCircle, Loader2, ArrowLeft, Timer, BarChart3, Send, Users, Pause } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * SISTEMA v6.0 - 5 CAMPANHAS INDEPENDENTES
 * - Cada campanha envia 1 msg/hora
 * - Ciclo de 12 horas
 * - Sem rotaÃƒÂ§ÃƒÂ£o de pares
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

    onSuccess: (data) => {
      toast.success(`${data.campaigns.length} campanhas criadas com ${data.totalContacts} contatos!`);
      campaignDetails.refetch();
      schedulerState.refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const startScheduler = trpc.scheduler.start.useMutation({
    onSuccess: () => {
      toast.success("Scheduler iniciado! 1 msg/campanha/hora, ciclo 12h");
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

  // Campanhas que enviaram nesta hora (do estado do scheduler)
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
    if (allCampaigns.length < 1) {
      toast.error("Configure as campanhas primeiro! Clique em 'Auto Configurar'");
      return;
    }
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
      {/* Header Premium Dark */}
      <div className="bg-gradient-to-r from-[#0a2e1a] via-[#1a5c2e] to-[#0d3d1f] border-b border-emerald-900/50 p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">


            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={allCampaigns.length < 1}
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
                if (confirm("Tem certeza? Isso vai limpar TUDO e comeÃƒÂ§ar do zero com novos contatos.")) {
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
              {(resetScheduler.isPending || isResetting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {isResetting ? 'Redefinindo...' : 'Redefinir'}
            </button>

            <button
              onClick={() => {
                if (!isRunning) {
                  toast.error("O scheduler jÃƒÂ¡ estÃƒÂ¡ parado!");
                  return;
                }
                if (confirm("Tem certeza que deseja PARAR TUDO? As campanhas serÃƒÂ£o pausadas.")) {
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

        {/* Status das 5 Campanhas nesta Hora */}
        {allCampaigns.length > 0 && isRunning && (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-foreground mb-4">
              <Zap className="h-5 w-5 text-amber-400" />
              Status por Hora - Todas as Campanhas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" key={`hour-status-${resetKey}`}>
              {allCampaigns.filter((c: any) => c.status === "running").map((campaign: any) => {
                const campState = campaignStates.find((cs: any) => cs.campaignName === campaign.name);
                const hasSent = campState?.sentThisHour || false;

                return (
                  <div
                    key={`hour-${campaign.id}`}
                    className={`p-4 rounded-xl border transition-all ${
                      hasSent
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-900/20"
                        : "bg-amber-500/10 border-amber-500/30 shadow-md shadow-amber-900/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block w-3 h-3 rounded-full ${
                        hasSent ? "bg-emerald-400 shadow-lg shadow-emerald-400/50" : "bg-amber-400 animate-pulse shadow-lg shadow-amber-400/30"
                      }`} />
                      <h3 className={`font-bold text-sm ${
                        hasSent ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        {hasSent ? "ENVIOU" : "AGUARDANDO"}
                      </h3>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-bold border ${
                        hasSent
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                      }`}>
                        {hasSent ? "1/1" : "0/1"}
                      </span>
                    </div>
                    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border inline-block ${
                      hasSent ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                    }`}>
                      {campaign.name}
                    </span>
                    <p className="text-xs text-muted-foreground mt-2">
                      1 msg/hora | {campaign.sentCount || 0}/{campaign.totalContacts || 12} total
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Monitoramento em Tempo Real */}
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
                Auto Configurar Campanhas
              </button>
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

/**
 * Card de cada campanha - v6.0
 */
function CampaignCard({
  campaign,
  isRunning,
  hourNumber,
  cycleTimer,
  cycleDuration,
  campaignStates,
  schedulerStartedAt,
  todayMessages,
  expanded,
  onToggle,
  onToggleActive,
}: {
  campaign: any;
  isRunning: boolean;
  hourNumber: number;
  cycleTimer: number;
  cycleDuration: number;
  campaignStates: any[];
  schedulerStartedAt: string | null;
  todayMessages: any[];
  expanded: boolean;
  onToggle: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const [editingMph, setEditingMph] = useState(false);
  const [mphValue, setMphValue] = useState(campaign.messagesPerHour || 1);
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
    setMphValue(campaign.messagesPerHour || 1);
  }, [campaign.messagesPerHour]);

  const isActive = campaign.status === "running";
  const campState = campaignStates.find((cs: any) => cs.campaignName === campaign.name);
  const hasSentThisHour = campState?.sentThisHour || false;

  const contactsList: any[] = campaign.contacts || [];
  const sentCount = campaign.sentCount || 0;
  const pendingCount = campaign.pendingCount || 0;
  const totalContacts = campaign.totalContacts || 12;
  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;

  const timePercent = cycleDuration > 0 ? Math.round(((cycleDuration - cycleTimer) / cycleDuration) * 100) : 0;

  // Status e cores
  let statusText = "Agendado";
  let ledClass = "bg-muted-foreground/30";
  let borderAccent = "border-l-muted/50";
  let cardBg = "";
  let statusBadge = "bg-secondary/50 text-muted-foreground border-border/50";

  if (!isActive) {
    statusText = "Pausada";
    cardBg = "opacity-50";
    statusBadge = "bg-secondary/50 text-muted-foreground border-border/50";
    borderAccent = "border-l-muted/50";
  } else if (hasSentThisHour) {
    statusText = "Enviou nesta hora";
    ledClass = "bg-emerald-400 shadow-lg shadow-emerald-400/50";
    borderAccent = "border-l-emerald-500";
    cardBg = "ring-1 ring-emerald-500/20";
    statusBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (isRunning) {
    statusText = "Aguardando envio";
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
                  {statusText}
                </span>
                <span className="text-xs text-muted-foreground">
                  ImÃƒÂ³vel: {String(campaign.propertyName || '')}
                </span>
              </div>
            </div>
          </div>
          {/* Timer no canto */}
          <div className="flex items-center gap-3">
            {isActive && isRunning && (
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold tabular-nums ${
                  hasSentThisHour ? "text-emerald-400" : "text-amber-400"
                }`}>{formatTimer(cycleTimer)}</span>
                <p className="text-xs text-muted-foreground">PrÃƒÂ³xima hora</p>
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

        {/* Campo msgs/hora (fixo em 1 para v6.0) */}
        <div className="mt-3 flex items-center gap-3 p-2.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
          <span className="text-xs font-semibold text-indigo-300">Regra:</span>
          <span className="text-sm font-bold text-indigo-200">1 msg/hora</span>
          <span className="text-xs text-indigo-400/60 ml-1">Ãƒâ€” 12 horas = 12 contatos/ciclo</span>
        </div>
      </div>

      {/* Content do Card */}
      <div className="px-5 pb-5">
        {/* Progresso do Ciclo (msgs enviadas) */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground font-medium">Progresso do Ciclo (12h)</p>
            <p className={`text-sm font-bold ${progressPercent === 100 ? "text-amber-400" : "text-emerald-400"}`}>{progressPercent}%</p>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${progressPercent === 100 ? "bg-gradient-to-r from-amber-500 to-orange-500" : ""}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Barra de Tempo da Hora */}
        {isActive && isRunning && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground font-medium">Tempo da Hora</p>
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

        {/* Stats Grid */}
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
            <p className="text-xl font-bold text-purple-400">{hourNumber + 1}<span className="text-sm text-muted-foreground">/12</span></p>
          </div>
          <div className="p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <p className="text-xs text-muted-foreground">Esta Hora</p>
            <p className="text-xl font-bold text-blue-400">
              {hasSentThisHour ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-5 w-5" /> Enviou
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <Clock className="h-5 w-5" /> Pendente
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ConfirmaÃƒÂ§ÃƒÂ£o de envio nesta hora - mostra contato e horÃƒÂ¡rio */}
        {(() => {
          // Encontrar o ÃƒÂºltimo contato enviado nesta campanha
          const sentContact = (campaign.contacts || []).find((c: any) => c.status === "sent" && c.sentAt);
          const lastSentContact = (campaign.contacts || [])
            .filter((c: any) => c.status === "sent" && c.sentAt)
            .sort((a: any, b: any) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
          
          if (hasSentThisHour && lastSentContact) {
            return (
              <div className="p-3 bg-emerald-500/10 rounded-lg mb-4 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-emerald-400">Enviado com sucesso!</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-mono">
                      {formatTime(lastSentContact.sentAt)}
                    </span>
                    <span className="text-sm text-emerald-200 font-medium truncate max-w-[180px]">
                      {lastSentContact.name}
                    </span>
                    <span className="text-xs text-emerald-400/60 font-mono">
                      {lastSentContact.phone}
                    </span>
                  </div>
                </div>
              </div>
            );
          } else if (hasSentThisHour) {
            return (
              <div className="p-3 bg-emerald-500/10 rounded-lg mb-4 border border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">Mensagem enviada nesta hora!</span>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Info */}
        <p className="text-xs text-muted-foreground mb-3">
          Iniciado: {schedulerStartedAt || "--:--:--"} | 1 msg/hora Ãƒâ€” 12 horas = {totalContacts} contatos
        </p>

        {/* Toggle Lista de Contatos */}
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

        {/* Lista de Contatos ExpandÃƒÂ­vel */}
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
