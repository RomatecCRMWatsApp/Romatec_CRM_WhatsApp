import { useState, useEffect, useMemo } from "react";
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
 * - EXATAMENTE 2 mensagens por hora (1 de cada campanha do par)
 * - Intervalo aleatório 10-30 min entre as 2
 * - Rotação de pares: (1+2) → (3+4) → (1+2)...
 * - 12 contatos por campanha
 * - Loop infinito 24/7
 * - Campanhas vinculadas a imóveis (dinâmico)
 */

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTime(date: Date | string | null): string {
  if (!date) return "--:--:--";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Campaigns() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(null);
  const [cycleTimer, setCycleTimer] = useState(3600);
  const [isSettingUp, setIsSettingUp] = useState(false);

  // tRPC queries
  const schedulerState = trpc.scheduler.getState.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const campaignDetails = trpc.scheduler.getCampaignDetails.useQuery(undefined, {
    refetchInterval: 5000,
  });

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

  const resetScheduler = trpc.scheduler.reset.useMutation({
    onSuccess: () => {
      toast.success("Campanhas resetadas com novos contatos!");
      campaignDetails.refetch();
      schedulerState.refetch();
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

  // Cronômetro do ciclo
  useEffect(() => {
    if (!schedulerState.data?.state?.isRunning) return;
    const interval = setInterval(() => {
      setCycleTimer((prev) => {
        if (prev <= 0) return 3600;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [schedulerState.data?.state?.isRunning]);

  // Resetar timer quando muda o ciclo
  useEffect(() => {
    if (schedulerState.data?.state?.cycleNumber !== undefined) {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const remaining = Math.floor((nextHour.getTime() - now.getTime()) / 1000);
      setCycleTimer(remaining);
    }
  }, [schedulerState.data?.state?.cycleNumber]);

  const isRunning = schedulerState.data?.state?.isRunning || false;
  const stats = schedulerState.data?.stats;
  const todayMessages = schedulerState.data?.todayMessages || [];
  const allCampaigns = useMemo(() => campaignDetails.data || [], [campaignDetails.data]);

  // Calcular par atual
  const cycleNumber = stats?.cycleNumber || 0;
  const runningCampaigns = allCampaigns.filter((c: any) => c.status === "running");
  const totalPairs = Math.ceil(runningCampaigns.length / 2);
  const currentPairIndex = totalPairs > 0 ? cycleNumber % totalPairs : 0;

  // Calcular totais
  const totalContacts = allCampaigns.reduce((sum: number, c: any) => sum + (c.totalContacts || 0), 0);
  const totalSent = allCampaigns.reduce((sum: number, c: any) => sum + (c.sentCount || 0), 0);
  const totalPending = allCampaigns.reduce((sum: number, c: any) => sum + (c.pendingCount || 0), 0);
  const totalFailed = allCampaigns.reduce((sum: number, c: any) => sum + (c.failedCount || 0), 0);
  const successRate = totalContacts > 0 ? ((totalSent / totalContacts) * 100).toFixed(1) : "0.0";

  const handleAutoSetup = () => {
    setIsSettingUp(true);
    autoSetup.mutate();
  };

  const handleStart = () => {
    if (allCampaigns.length < 2) {
      toast.error("Configure as campanhas primeiro! Clique em 'Auto Configurar'");
      return;
    }
    startScheduler.mutate();
  };

  const handleReset = () => {
    if (isRunning) {
      toast.error("Pare o scheduler antes de resetar!");
      return;
    }
    resetScheduler.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a5c2e] to-[#2d8a4e] text-white p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/dashboard")} variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Send className="h-7 w-7" /> Campanhas WhatsApp
              </h1>
              <p className="text-white/80 text-sm mt-1">EXATAMENTE 2 mensagens por hora | Loop infinito 24/7</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-2 bg-green-500/20 border border-green-400/50 px-3 py-1.5 rounded-full text-sm">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                RODANDO
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
                Painel de Controle
              </CardTitle>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${isRunning ? "bg-green-100 text-green-700 border border-green-300" : "bg-red-100 text-red-700 border border-red-300"}`}>
                {isRunning ? "Ativo 24/7" : "Parado"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-100">
                <Users className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Total Contatos</p>
                <p className="text-2xl font-bold text-blue-600">{totalContacts}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center border border-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Enviadas</p>
                <p className="text-2xl font-bold text-green-600">{totalSent}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-center border border-orange-100">
                <Clock className="h-4 w-4 text-orange-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Restantes</p>
                <p className="text-2xl font-bold text-orange-600">{totalPending}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center border border-red-100">
                <AlertCircle className="h-4 w-4 text-red-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Falhas</p>
                <p className="text-2xl font-bold text-red-600">{totalFailed}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg text-center border border-purple-100">
                <BarChart3 className="h-4 w-4 text-purple-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Taxa Sucesso</p>
                <p className="text-2xl font-bold text-purple-600">{successRate}%</p>
              </div>
            </div>

            {/* Cronômetro Global */}
            {isRunning && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-purple-800 flex items-center gap-2">
                      <Timer className="h-5 w-5" /> Próximo Ciclo em:
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Ciclo {cycleNumber + 1} | Par {currentPairIndex + 1} de {totalPairs}
                    </p>
                  </div>
                  <span className="text-5xl font-mono font-bold text-purple-600 tabular-nums">{formatTimer(cycleTimer)}</span>
                </div>
                <div className="mt-3 w-full bg-purple-100 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-purple-400 to-purple-600 h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${((3600 - cycleTimer) / 3600) * 100}%` }}
                  />
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
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Configurando...</>
                ) : (
                  <><Settings2 className="mr-2 h-4 w-4" /> Auto Configurar</>
                )}
              </Button>

              {!isRunning ? (
                <Button
                  onClick={handleStart}
                  disabled={allCampaigns.length < 2}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold h-12"
                >
                  <Play className="mr-2 h-4 w-4" /> Iniciar
                </Button>
              ) : (
                <Button
                  onClick={() => stopScheduler.mutate()}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold h-12"
                >
                  <Pause className="mr-2 h-4 w-4" /> Pausar
                </Button>
              )}

              <Button
                onClick={handleReset}
                disabled={isRunning}
                variant="outline"
                className="h-12 font-semibold border-2"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Resetar
              </Button>

              <Button
                onClick={() => stopScheduler.mutate()}
                disabled={!isRunning}
                variant="outline"
                className="h-12 font-semibold border-2 border-red-200 text-red-600 hover:bg-red-50"
              >
                <Square className="mr-2 h-4 w-4" /> Parar Tudo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rotação de Pares */}
        {runningCampaigns.length >= 2 && (
          <Card className="border-2 border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-600" />
                Rotação de Pares - Ciclo Atual
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: totalPairs }).map((_, pairIdx) => {
                  const camp1 = runningCampaigns[pairIdx * 2];
                  const camp2 = runningCampaigns[pairIdx * 2 + 1];
                  const isCurrentPair = currentPairIndex === pairIdx && isRunning;
                  const isNextPair = (currentPairIndex + 1) % totalPairs === pairIdx && isRunning && totalPairs > 1;

                  return (
                    <div
                      key={pairIdx}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        isCurrentPair
                          ? "bg-green-50 border-green-400 shadow-md shadow-green-100"
                          : isNextPair
                          ? "bg-yellow-50 border-yellow-300"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block w-3 h-3 rounded-full ${
                          isCurrentPair ? "bg-green-500 animate-pulse" : isNextPair ? "bg-yellow-500" : "bg-slate-400"
                        }`} />
                        <h3 className="font-bold">
                          {isCurrentPair ? "ENVIANDO AGORA" : isNextPair ? "PRÓXIMO PAR" : `Par ${pairIdx + 1}`}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-white rounded text-sm font-medium border">{camp1?.name || "?"}</span>
                        <span className="text-slate-400">+</span>
                        <span className="px-2 py-1 bg-white rounded text-sm font-medium border">{camp2?.name || camp1?.name || "?"}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">1 msg de cada = 2 msgs/hora</p>
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
            Monitoramento em Tempo Real
          </h2>
          {allCampaigns.length === 0 ? (
            <Card className="p-8 text-center border-2 border-dashed border-slate-300">
              <Settings2 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500 mb-4 text-lg">Nenhuma campanha configurada</p>
              <p className="text-slate-400 text-sm mb-6">Clique em "Auto Configurar" para criar campanhas automaticamente baseadas nos imóveis cadastrados</p>
              <Button onClick={handleAutoSetup} disabled={isSettingUp} className="bg-purple-600 hover:bg-purple-700 text-white">
                {isSettingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                Auto Configurar Campanhas
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {allCampaigns.map((campaign: any, idx: number) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  index={idx}
                  isRunning={isRunning}
                  currentPairIndex={currentPairIndex}
                  totalPairs={totalPairs}
                  cycleTimer={cycleTimer}
                  cycleNumber={cycleNumber}
                  runningCampaigns={runningCampaigns}
                  expanded={expandedCampaign === campaign.id}
                  onToggle={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)}
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
                Mensagens Enviadas Hoje ({todayMessages.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {todayMessages.map((msg: any) => (
                  <div key={msg.id} className="flex items-center gap-3 p-2 bg-green-50 rounded border border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-mono text-green-700">{formatTime(msg.sentAt)}</span>
                    <span className="text-sm text-slate-600 truncate">{msg.messageText?.substring(0, 80)}...</span>
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
 * Card de cada campanha com monitoramento em tempo real
 */
function CampaignCard({
  campaign,
  index,
  isRunning,
  currentPairIndex,
  totalPairs,
  cycleTimer,
  cycleNumber,
  runningCampaigns,
  expanded,
  onToggle,
  onToggleActive,
}: {
  campaign: any;
  index: number;
  isRunning: boolean;
  currentPairIndex: number;
  totalPairs: number;
  cycleTimer: number;
  cycleNumber: number;
  runningCampaigns: any[];
  expanded: boolean;
  onToggle: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  // Encontrar posição no array de campanhas ativas
  const runningIdx = runningCampaigns.findIndex((c: any) => c.id === campaign.id);
  const pairIndex = runningIdx >= 0 ? Math.floor(runningIdx / 2) : -1;
  const isInCurrentPair = pairIndex === currentPairIndex && isRunning && campaign.status === "running";
  const isInNextPair = pairIndex === (currentPairIndex + 1) % totalPairs && isRunning && campaign.status === "running" && totalPairs > 1;
  const isActive = campaign.status === "running";

  const contactsList = campaign.contacts || [];
  const sentCount = campaign.sentCount || 0;
  const pendingCount = campaign.pendingCount || 0;
  const failedCount = campaign.failedCount || 0;
  const totalContacts = campaign.totalContacts || 12;
  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;

  // Status visual
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
    statusBadgeClass = "bg-green-100 text-green-700";
    borderColor = "border-l-green-500";
    bgColor = "bg-green-50/30";
  } else if (isInNextPair) {
    statusText = "Aguardando";
    statusBadgeClass = "bg-yellow-100 text-yellow-700";
    borderColor = "border-l-yellow-500";
    bgColor = "bg-yellow-50/20";
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
              isInCurrentPair ? "bg-green-500 animate-pulse" : isInNextPair ? "bg-yellow-500 animate-pulse" : isActive ? "bg-blue-400" : "bg-gray-300"
            }`} />
            <div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass}`}>{statusText}</span>
                <span className="text-xs text-slate-400">Imóvel: {campaign.propertyName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle Ativo/Pausado */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{isActive ? "Ativo" : "Pausado"}</span>
              <Switch
                checked={isActive}
                onCheckedChange={onToggleActive}
                disabled={isRunning}
              />
            </div>
            {isInCurrentPair && (
              <div className="text-right">
                <p className="text-3xl font-mono font-bold text-green-600 tabular-nums">{formatTimer(cycleTimer)}</p>
                <p className="text-xs text-slate-500">Cronômetro (1 hora)</p>
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
            <p className="text-sm font-bold text-green-700">{progressPercent}%</p>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-green-400 to-green-600 h-3 rounded-full transition-all duration-500"
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
              {totalContacts > 0 ? `${((sentCount / totalContacts) * 100).toFixed(1)}%` : "0.0%"}
            </p>
            <p className="text-xs text-slate-400">Meta: {totalContacts} msg/dia</p>
          </div>
        </div>

        {/* Próximo Ciclo */}
        {isInCurrentPair && (
          <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg mb-4 border border-purple-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-purple-800 flex items-center gap-1">
                <Timer className="h-4 w-4" /> Próximo Ciclo em:
              </p>
              <span className="text-2xl font-mono font-bold text-purple-600 tabular-nums">{formatTimer(cycleTimer)}</span>
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-slate-500 mb-3">
          Iniciado: {campaign.startDate ? formatTime(campaign.startDate) : "--:--:--"} | Ciclos: {totalContacts} de 1 hora = {totalContacts} horas
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
          <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
            {contactsList.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhum contato designado</p>
            ) : (
              contactsList.map((contact: any) => (
                <div
                  key={contact.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    contact.status === "sent"
                      ? "bg-green-50 border-green-200"
                      : contact.status === "failed"
                      ? "bg-red-50 border-red-200"
                      : "bg-white border-slate-200"
                  }`}
                >
                  {/* Checkbox visual */}
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

                  {/* Telefone */}
                  <span className="text-sm font-mono font-semibold min-w-[130px]">
                    {contact.phone}
                  </span>

                  {/* Nome */}
                  <span className="text-sm text-slate-600 truncate flex-1">
                    ({contact.name})
                  </span>

                  {/* Status / Horário */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {contact.status === "sent" ? (
                      <span className="text-xs text-green-600 font-mono bg-green-100 px-2 py-0.5 rounded">
                        {formatTime(contact.sentAt)}
                      </span>
                    ) : contact.status === "failed" ? (
                      <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">Falha</span>
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
