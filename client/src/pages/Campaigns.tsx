import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Play, Square, RotateCcw, Zap, Settings2, CheckCircle2, Clock, AlertCircle, Loader2, ArrowLeft, Timer, BarChart3, Send, Users, Pause } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * REGRAS DO SISTEMA:
 * - MÁXIMO 2 mensagens por hora (limite rígido)
 * - Intervalo mínimo 20 min entre mensagens
 * - Rotação de pares: (1+2) → (3+4) → (1+2)...
 * - 12 contatos por campanha
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

  // tRPC queries - polling a cada 5s para status mais responsivo
  const schedulerState = trpc.scheduler.getState.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const campaignDetails = trpc.scheduler.getCampaignDetails.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // Marcar como carregado quando os dados chegarem
  useEffect(() => {
    if (schedulerState.data !== undefined && campaignDetails.data !== undefined) {
      setIsLoading(false);
    }
  }, [schedulerState.data, campaignDetails.data]);

  // tRPC mutations
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
      // Invalidar cache completamente para forçar refetch limpo
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

  // Dados estáveis com useMemo
  const isRunning = useMemo(() => schedulerState.data?.state?.isRunning || false, [schedulerState.data?.state?.isRunning]);
  const stats = useMemo(() => schedulerState.data?.stats, [schedulerState.data?.stats]);
  const stateData = useMemo(() => schedulerState.data?.state, [schedulerState.data?.state]);
  const todayMessages = useMemo(() => schedulerState.data?.todayMessages || [], [schedulerState.data?.todayMessages]);
  // Filtrar campanhas de teste (TESTE_AUTO) que não devem aparecer na UI
  const allCampaigns = useMemo(() => (campaignDetails.data || []).filter((c: any) => !String(c.name || '').startsWith('TESTE_AUTO')), [campaignDetails.data]);
  const cycleNumber = useMemo(() => stats?.cycleNumber || 0, [stats?.cycleNumber]);
  const runningCampaigns = useMemo(() => allCampaigns.filter((c: any) => c.status === "running"), [allCampaigns]);
  const totalPairs = useMemo(() => Math.ceil(runningCampaigns.length / 2), [runningCampaigns.length]);
  
  // Usar currentPairIndex do backend (fonte da verdade)
  const currentPairIndex = useMemo(() => {
    if (stateData?.activePair?.index !== undefined) return stateData.activePair.index;
    return totalPairs > 0 ? cycleNumber % totalPairs : 0;
  }, [stateData?.activePair?.index, cycleNumber, totalPairs]);

  // Nomes do par ativo do backend
  const activePairNames = useMemo(() => {
    return stateData?.activePair?.campaigns || [];
  }, [stateData?.activePair?.campaigns]);

  // Totais estáveis
  const totals = useMemo(() => {
    const totalContacts = allCampaigns.reduce((sum: number, c: any) => sum + (c.totalContacts || 0), 0);
    const totalSent = allCampaigns.reduce((sum: number, c: any) => sum + (c.sentCount || 0), 0);
    const totalPending = allCampaigns.reduce((sum: number, c: any) => sum + (c.pendingCount || 0), 0);
    const totalFailed = allCampaigns.reduce((sum: number, c: any) => sum + (c.failedCount || 0), 0);
    const successRate = totalContacts > 0 ? ((totalSent / totalContacts) * 100).toFixed(1) : "0.0";
    return { totalContacts, totalSent, totalPending, totalFailed, successRate };
  }, [allCampaigns]);

  // Cronômetro local baseado em secondsUntilNextCycle do backend
  const [localTimer, setLocalTimer] = useState(3600);
  
  useEffect(() => {
    if (stateData?.secondsUntilNextCycle !== undefined) {
      setLocalTimer(stateData.secondsUntilNextCycle);
    }
  }, [stateData?.secondsUntilNextCycle]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setLocalTimer((prev) => (prev <= 0 ? 3600 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

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

  // LOADING STATE: só renderiza quando dados chegaram
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">Carregando campanhas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header com Status LED */}
      <div className="bg-gradient-to-r from-[#1a5c2e] to-[#2d8a4e] text-white p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/dashboard")} variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Send className="h-7 w-7" />
                <span>Campanhas WhatsApp</span>
              </h1>
              <p className="text-white/80 text-sm mt-1">
                <span>MAX 2 msgs/hora | Intervalo 20-40 min | Ciclo 24h/dia, 7 dias/semana</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <span className="flex items-center gap-2 bg-green-500/30 border border-green-400 px-4 py-2 rounded-full text-sm font-bold animate-pulse">
                <span className="w-3 h-3 rounded-full bg-green-400 shadow-lg shadow-green-400/50" />
                <span>RODANDO</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 bg-red-500/30 border border-red-400 px-4 py-2 rounded-full text-sm font-bold">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span>PARADO</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">

        {/* Painel de Controle */}
        <Card className="border-2 border-green-200 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-green-700" />
                <span>Painel de Controle</span>
              </CardTitle>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${isRunning ? "bg-green-100 text-green-700 border border-green-300" : "bg-red-100 text-red-700 border border-red-300"}`}>
                <span>{isRunning ? "Ativo 24/7" : "Parado"}</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-100">
                <Users className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Total Contatos</p>
                <p className="text-2xl font-bold text-blue-600">{totals.totalContacts}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center border border-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Enviadas</p>
                <p className="text-2xl font-bold text-green-600">{totals.totalSent}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-center border border-orange-100">
                <Clock className="h-4 w-4 text-orange-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Restantes</p>
                <p className="text-2xl font-bold text-orange-600">{totals.totalPending}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center border border-red-100">
                <AlertCircle className="h-4 w-4 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Falhas</p>
                <p className="text-2xl font-bold text-red-600">{totals.totalFailed}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg text-center border border-purple-100">
                <BarChart3 className="h-4 w-4 text-purple-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Taxa Sucesso</p>
                <p className="text-2xl font-bold text-purple-600">{totals.successRate}%</p>
              </div>
            </div>

            {/* Cronômetro e Info de Tempo - SEMPRE visível quando rodando */}
            {isRunning && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 mb-6">
                {/* Linha 1: Cronômetro grande */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-purple-800 flex items-center gap-2">
                      <Timer className="h-5 w-5" />
                      <span>Próximo Ciclo em:</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      <span>Ciclo {cycleNumber + 1} | Par {currentPairIndex + 1} de {totalPairs}</span>
                    </p>
                  </div>
                  <span className="text-5xl font-mono font-bold text-purple-600 tabular-nums">{formatTimer(localTimer)}</span>
                </div>
                <div className="w-full bg-purple-100 rounded-full h-2 mb-3">
                  <div
                    className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${((3600 - localTimer) / 3600) * 100}%` }}
                  />
                </div>
                {/* Linha 2: Info de tempo detalhada */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 bg-white/60 rounded-lg">
                    <p className="text-xs text-slate-500">Iniciou às</p>
                    <p className="text-sm font-bold text-purple-700">{stateData?.startedAtFormatted || "--:--:--"}</p>
                  </div>
                  <div className="p-2 bg-white/60 rounded-lg">
                    <p className="text-xs text-slate-500">Rodando há</p>
                    <p className="text-sm font-bold text-purple-700">{stateData?.uptimeFormatted || "00:00:00"}</p>
                  </div>
                  <div className="p-2 bg-white/60 rounded-lg">
                    <p className="text-xs text-slate-500">Próximo ciclo</p>
                    <p className="text-sm font-bold text-purple-700">{stateData?.nextCycleFormatted || "--:--:--"}</p>
                  </div>
                </div>
                {/* Linha 3: Msgs enviadas nesta hora */}
                <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                  <span className="text-slate-500">Msgs nesta hora:</span>
                  <span className="font-bold text-purple-700">{stats?.messagesThisHour || 0}/{stats?.maxMessagesPerHour || 2}</span>
                  {(stats?.messagesThisHour || 0) >= 2 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ciclo completo</span>
                  )}
                </div>
              </div>
            )}

            {/* Botões de Controle */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                onClick={handleAutoSetup}
                disabled={isSettingUp || isRunning}
                className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold h-12"
              >
                {isSettingUp ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span>Configurando...</span></span>
                ) : (
                  <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /><span>Auto</span></span>
                )}
              </Button>

              {!isRunning ? (
                <Button
                  onClick={handleStart}
                  disabled={allCampaigns.length < 2}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold h-12"
                >
                  <span className="flex items-center gap-2"><Play className="h-4 w-4" /><span>Iniciar</span></span>
                </Button>
              ) : (
                <Button
                  onClick={() => stopScheduler.mutate()}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold h-12"
                >
                  <span className="flex items-center gap-2"><Pause className="h-4 w-4" /><span>Pausar</span></span>
                </Button>
              )}

              <Button
                onClick={() => {
                  if (isRunning) {
                    toast.error("Pare o scheduler antes de redefinir!");
                    return;
                  }
                  if (confirm("Tem certeza? Isso vai limpar TUDO e começar do zero com 12 novos contatos por campanha.")) {
                    resetScheduler.mutate();
                  }
                }}
                className={`h-12 font-semibold border-2 ${
                  isRunning
                    ? "bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed"
                    : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-orange-400"
                }`}
              >
                {resetScheduler.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span>Resetando...</span></span>
                ) : (
                  <span className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /><span>Redefinir</span></span>
                )}
              </Button>

              <Button
                onClick={() => {
                  if (!isRunning) {
                    toast.error("O scheduler já está parado!");
                    return;
                  }
                  if (confirm("Tem certeza que deseja PARAR TUDO? As campanhas serão pausadas.")) {
                    stopScheduler.mutate();
                  }
                }}
                className={`h-12 font-semibold border-2 ${
                  !isRunning
                    ? "bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed"
                    : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white border-red-500"
                }`}
              >
                {stopScheduler.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span>Parando...</span></span>
                ) : (
                  <span className="flex items-center gap-2"><Square className="h-4 w-4" /><span>Parar Tudo</span></span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rotação de Pares - com destaque do par ativo */}
        {runningCampaigns.length >= 2 && (
          <Card className="border-2 border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-600" />
                <span>Rotação de Pares - Ciclo Atual</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" key={`pairs-${runningCampaigns.length}`}>
                {Array.from({ length: totalPairs }).map((_, pairIdx) => {
                  const camp1 = runningCampaigns[pairIdx * 2];
                  const camp2 = runningCampaigns[pairIdx * 2 + 1];
                  
                  // Verificar se este par está ativo usando dados do backend
                  const isCurrentPair = isRunning && (
                    currentPairIndex === pairIdx ||
                    (activePairNames.length > 0 && camp1 && activePairNames.includes(camp1.name))
                  );
                  const isNextPair = isRunning && !isCurrentPair && (currentPairIndex + 1) % totalPairs === pairIdx && totalPairs > 1;

                  return (
                    <div
                      key={`pair-${pairIdx}-${camp1?.id || 0}-${camp2?.id || 0}`}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isCurrentPair
                          ? "bg-green-50 border-green-500 shadow-lg shadow-green-200 ring-2 ring-green-300"
                          : isNextPair
                          ? "bg-yellow-50 border-yellow-400 shadow-md shadow-yellow-100"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block w-4 h-4 rounded-full ${
                          isCurrentPair ? "bg-green-500 animate-pulse shadow-lg shadow-green-400/50" : isNextPair ? "bg-yellow-500 animate-pulse" : "bg-slate-300"
                        }`} />
                        <h3 className={`font-bold text-sm ${
                          isCurrentPair ? "text-green-800" : isNextPair ? "text-yellow-800" : "text-slate-600"
                        }`}>
                          <span>{isCurrentPair ? "ENVIANDO AGORA" : isNextPair ? "PRÓXIMO PAR" : `Par ${pairIdx + 1}`}</span>
                        </h3>
                        {isCurrentPair && (
                          <span className="ml-auto text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold">
                            ATIVO
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded text-sm font-bold border ${
                          isCurrentPair ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-slate-200"
                        }`}>
                          <span>{camp1?.name || "?"}</span>
                        </span>
                        <span className="text-slate-400 font-bold">+</span>
                        <span className={`px-3 py-1.5 rounded text-sm font-bold border ${
                          isCurrentPair ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-slate-200"
                        }`}>
                          <span>{camp2?.name || camp1?.name || "?"}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        <span>1 msg de cada = 2 msgs/hora</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monitoramento em Tempo Real */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-green-700" />
            <span>Monitoramento em Tempo Real</span>
          </h2>
          {allCampaigns.length === 0 ? (
            <Card className="p-8 text-center border-2 border-dashed border-slate-300">
              <Settings2 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 mb-4 text-lg">Nenhuma campanha configurada</p>
              <p className="text-slate-400 text-sm mb-6">Clique em "Auto Configurar" para criar campanhas automaticamente baseadas nos imóveis cadastrados</p>
              <Button onClick={handleAutoSetup} disabled={isSettingUp} className="bg-purple-600 hover:bg-purple-700 text-white">
                {isSettingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                <span>Auto Configurar Campanhas</span>
              </Button>
            </Card>
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
                  cycleNumber={cycleNumber}
                  runningCampaigns={runningCampaigns}
                  activePairNames={activePairNames}
                  expanded={expandedCampaign === campaign.id}
                  onToggle={() => handleToggleExpand(campaign.id)}
                  onToggleActive={(active: boolean) => toggleCampaign.mutate({ campaignId: campaign.id, active })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mensagens de Hoje */}
        {todayMessages.length > 0 && (
          <Card className="border-2 border-green-200">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span>Mensagens Enviadas Hoje ({todayMessages.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {todayMessages.map((msg: any) => (
                  <div key={`msg-${msg.id}`} className="flex items-center gap-3 p-2 bg-green-50 rounded border border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-mono text-green-700">{formatTime(msg.sentAt)}</span>
                    <span className="text-sm text-slate-600 truncate">
                      <span>{String(msg.messageText || '').substring(0, 80)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Card de cada campanha - componente separado para evitar re-render do pai
 */
function CampaignCard({
  campaign,
  isRunning,
  currentPairIndex,
  totalPairs,
  cycleTimer,
  cycleNumber,
  runningCampaigns,
  activePairNames,
  expanded,
  onToggle,
  onToggleActive,
}: {
  campaign: any;
  isRunning: boolean;
  currentPairIndex: number;
  totalPairs: number;
  cycleTimer: number;
  cycleNumber: number;
  runningCampaigns: any[];
  activePairNames: string[];
  expanded: boolean;
  onToggle: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const isActive = campaign.status === "running";
  
  // Verificar se esta campanha está no par ativo usando dados do backend
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
  const totalContacts = campaign.totalContacts || 12;
  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;

  let statusText = "Agendado";
  let statusBadgeClass = "bg-slate-100 text-slate-600";
  let borderColor = "border-l-slate-300";
  let bgColor = "";

  if (!isActive) {
    statusText = "Pausada";
    statusBadgeClass = "bg-gray-100 text-gray-500";
    borderColor = "border-l-gray-300";
    bgColor = "opacity-60";
  } else if (isInCurrentPair) {
    statusText = "Enviando";
    statusBadgeClass = "bg-green-100 text-green-700 border border-green-300";
    borderColor = "border-l-green-500";
    bgColor = "bg-green-50/50 ring-1 ring-green-200";
  } else if (isInNextPair) {
    statusText = "Próximo";
    statusBadgeClass = "bg-yellow-100 text-yellow-700 border border-yellow-300";
    borderColor = "border-l-yellow-500";
    bgColor = "bg-yellow-50/30";
  } else {
    statusText = "Ativo";
    statusBadgeClass = "bg-blue-100 text-blue-600";
    borderColor = "border-l-blue-400";
  }

  return (
    <Card className={`hover:shadow-lg transition-all border-l-4 ${borderColor} ${bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full ${
              isInCurrentPair ? "bg-green-500 animate-pulse shadow-lg shadow-green-400/50" : isInNextPair ? "bg-yellow-500 animate-pulse" : isActive ? "bg-blue-400" : "bg-gray-300"
            }`} />
            <div>
              <CardTitle className="text-lg">
                <span>{String(campaign.name || '')}</span>
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass}`}>
                  {isInCurrentPair && <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />}
                  <span>{statusText}</span>
                </span>
                <span className="text-xs text-slate-400">
                  <span>Imovel: {String(campaign.propertyName || '')}</span>
                </span>
              </div>
            </div>
          </div>
          {/* Cronômetro de 1 hora no canto superior direito */}
          <div className="flex items-center gap-3">
            {isActive && (
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <span className="text-2xl">⏱</span>
                  <span className={`text-2xl font-mono font-bold tabular-nums ${
                    isInCurrentPair ? "text-green-600" : "text-slate-400"
                  }`}>{formatTimer(cycleTimer)}</span>
                </div>
                <p className="text-xs text-slate-400">Cronômetro (1 hora)</p>
              </div>
            )}
            {!isActive && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Pausado</span>
                <Switch
                  checked={isActive}
                  onCheckedChange={onToggleActive}
                  disabled={isRunning}
                />
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Progresso */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-600 font-medium">Progresso do Ciclo</p>
            <p className={`text-sm font-bold ${progressPercent === 100 ? "text-orange-600" : "text-green-700"}`}>{progressPercent}%</p>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${progressPercent === 100 ? "bg-gradient-to-r from-orange-400 to-orange-600" : "bg-gradient-to-r from-green-400 to-green-600"}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-2 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-slate-500">Enviadas</p>
            <p className="text-xl font-bold text-green-600">{sentCount}<span className="text-sm text-slate-400">/{totalContacts}</span></p>
          </div>
          <div className="p-2 bg-orange-50 rounded-lg border border-orange-100">
            <p className="text-xs text-slate-500">Faltam</p>
            <p className="text-xl font-bold text-orange-600">{pendingCount}</p>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
            <p className="text-xs text-slate-500">Ciclo Atual</p>
            <p className="text-xl font-bold text-purple-600">{cycleNumber + 1}<span className="text-sm text-slate-400">/{totalContacts}</span></p>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-xs text-slate-500">Taxa do Dia</p>
            <p className="text-xl font-bold text-blue-600">
              <span>{totalContacts > 0 ? `${((sentCount / totalContacts) * 100).toFixed(1)}%` : "0.0%"}</span>
            </p>
            <p className="text-xs text-slate-400">Meta: {totalContacts} msg/dia</p>
          </div>
        </div>

        {/* Cronômetro inline para campanha do par ativo */}
        {isInCurrentPair && (
          <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg mb-4 border border-green-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-green-800 flex items-center gap-1">
                <Timer className="h-4 w-4" />
                <span>Próximo Ciclo em:</span>
              </p>
              <span className="text-2xl font-mono font-bold text-green-600 tabular-nums">{formatTimer(cycleTimer)}</span>
            </div>
          </div>
        )}

        {/* Info de início */}
        <p className="text-xs text-slate-500 mb-3">
          <span>Iniciado: {campaign.startDate ? formatTime(campaign.startDate) : "--:--:--"} | Ciclos: {totalContacts} de 1 hora = {totalContacts} horas</span>
        </p>

        {/* Toggle Lista de Contatos */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold">Contatos ({sentCount}/{totalContacts})</span>
            <span className="text-xs text-slate-400">{sentCount} enviados | {pendingCount} aguardando</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {/* Lista de Contatos Expandível */}
        {expanded && (
          <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto" key={`contacts-${campaign.id}-${contactsList.length}`}>
            {contactsList.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum contato designado</p>
            ) : (
              contactsList.map((contact: any) => (
                <div
                  key={`contact-${contact.id}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    contact.status === "sent"
                      ? "bg-green-50 border-green-200"
                      : contact.status === "failed"
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    contact.status === "sent"
                      ? "bg-green-500 border-green-500"
                      : contact.status === "failed"
                      ? "bg-red-500 border-red-500"
                      : "border-slate-300"
                  }`}>
                    {contact.status === "sent" && <CheckCircle2 className="h-3 w-3 text-white" />}
                    {contact.status === "failed" && <AlertCircle className="h-3 w-3 text-white" />}
                  </div>

                  <span className="text-sm font-mono font-semibold min-w-[130px]">
                    <span>{String(contact.phone || '')}</span>
                  </span>

                  <span className="text-sm text-slate-600 truncate flex-1">
                    <span>({String(contact.name || '')})</span>
                  </span>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {contact.status === "sent" ? (
                      <span className="text-xs text-green-600 font-mono bg-green-100 px-2 py-0.5 rounded">
                        <span>{formatTime(contact.sentAt)}</span>
                      </span>
                    ) : contact.status === "failed" ? (
                      <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
                        <span>Falha</span>
                      </span>
                    ) : (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
