import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Play, Square, RotateCcw, Zap, Settings2, CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * REGRAS:
 * - EXATAMENTE 2 mensagens por hora (1 de cada campanha do par)
 * - Intervalo aleatório 10-30 min entre as 2
 * - Rotação de pares: (1+2) → (3+4) → (1+2)...
 * - 12 contatos por campanha = 48 contatos total
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
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Campaigns() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(null);
  const [cycleTimer, setCycleTimer] = useState(3600); // 1 hora em segundos
  const [isSettingUp, setIsSettingUp] = useState(false);

  // tRPC queries
  const schedulerState = trpc.scheduler.getState.useQuery(undefined, {
    refetchInterval: 5000, // Atualizar a cada 5s
  });
  const campaignsList = trpc.campaigns.list.useQuery();
  const propertiesList = trpc.properties.list.useQuery();

  // tRPC mutations
  const autoSetup = trpc.campaigns.autoSetup.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.campaigns.length} campanhas criadas com ${data.totalContacts} contatos!`);
      campaignsList.refetch();
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
      toast.success("Scheduler iniciado! 2 mensagens por hora, loop infinito 24/7");
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

  // Cronômetro do ciclo
  useEffect(() => {
    if (!schedulerState.data?.state?.isRunning) return;

    const interval = setInterval(() => {
      setCycleTimer((prev) => {
        if (prev <= 0) return 3600; // Reset para 1 hora
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [schedulerState.data?.state?.isRunning]);

  // Resetar timer quando muda o ciclo
  useEffect(() => {
    if (schedulerState.data?.state?.cycleNumber !== undefined) {
      // Calcular tempo restante até próxima hora
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const remaining = Math.floor((nextHour.getTime() - now.getTime()) / 1000);
      setCycleTimer(remaining);
    }
  }, [schedulerState.data?.state?.cycleNumber]);

  const isRunning = schedulerState.data?.state?.isRunning || false;
  const stats = schedulerState.data?.stats;
  const activeCampaigns = schedulerState.data?.activeCampaigns || [];
  const todayMessages = schedulerState.data?.todayMessages || [];
  const allCampaigns = campaignsList.data || [];

  // Calcular par atual
  const cycleNumber = stats?.cycleNumber || 0;
  const totalPairs = Math.ceil(allCampaigns.length / 2);
  const currentPairIndex = totalPairs > 0 ? cycleNumber % totalPairs : 0;

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

  const handleStop = () => {
    stopScheduler.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a5c2e] to-[#2d8a4e] text-white p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              Campanhas de Vendas
            </h1>
            <p className="text-white/80 mt-1">Sistema de automação WhatsApp - EXATAMENTE 2 mensagens por hora</p>
          </div>
          <Button onClick={() => navigate("/dashboard")} variant="outline" className="text-white border-white/30 hover:bg-white/10">
            Voltar
          </Button>
        </div>
      </div>

      <div className="container py-8">

        {/* Status Global */}
        <Card className="mb-8 border-2 border-green-200">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2">
                {isRunning ? (
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                ) : (
                  <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                )}
                Status do Scheduler
              </CardTitle>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${isRunning ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {isRunning ? "RODANDO 24/7" : "PARADO"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-xs text-slate-600 mb-1">Ciclo Atual</p>
                <p className="text-3xl font-bold text-blue-600">{cycleNumber + 1}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg text-center">
                <p className="text-xs text-slate-600 mb-1">Enviadas Hoje</p>
                <p className="text-3xl font-bold text-green-600">{stats?.totalSent || 0}</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg text-center">
                <p className="text-xs text-slate-600 mb-1">Falhas</p>
                <p className="text-3xl font-bold text-red-600">{stats?.totalFailed || 0}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg text-center">
                <p className="text-xs text-slate-600 mb-1">Taxa Sucesso</p>
                <p className="text-3xl font-bold text-purple-600">{stats?.successRate || "0.00%"}</p>
              </div>
            </div>

            {/* Cronômetro */}
            {isRunning && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-purple-600" />
                    <span className="font-semibold text-purple-800">Próximo Ciclo em:</span>
                  </div>
                  <span className="text-4xl font-mono font-bold text-purple-600">{formatTimer(cycleTimer)}</span>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Iniciado: {stats?.uptime || "--"} | Ciclos: {cycleNumber + 1} de 1 hora | Intervalo aleatório: {stats?.randomInterval || "--"} min
                </div>
              </div>
            )}

            {/* Botões de Controle */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Button
                onClick={handleAutoSetup}
                disabled={isSettingUp}
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
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold h-12"
                >
                  <Play className="mr-2 h-4 w-4" /> Iniciar
                </Button>
              ) : (
                <Button
                  onClick={handleStop}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold h-12"
                >
                  <Square className="mr-2 h-4 w-4" /> Parar
                </Button>
              )}

              <Button
                onClick={() => {
                  handleAutoSetup();
                }}
                disabled={isRunning}
                variant="outline"
                className="h-12 font-semibold"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Resetar Campanhas
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Ciclos Section */}
        {allCampaigns.length >= 2 && (
          <Card className="mb-8 border-2 border-blue-200">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="text-xl">Ciclos de Campanhas</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pares de campanhas */}
                {Array.from({ length: Math.ceil(allCampaigns.length / 2) }).map((_, pairIdx) => {
                  const camp1 = allCampaigns[pairIdx * 2];
                  const camp2 = allCampaigns[pairIdx * 2 + 1];
                  const isCurrentPair = currentPairIndex === pairIdx && isRunning;
                  const isNextPair = (currentPairIndex + 1) % totalPairs === pairIdx && isRunning;

                  return (
                    <div
                      key={pairIdx}
                      className={`p-4 rounded-lg border-2 ${
                        isCurrentPair
                          ? "bg-green-50 border-green-400"
                          : isNextPair
                          ? "bg-yellow-50 border-yellow-300"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block w-3 h-3 rounded-full ${
                          isCurrentPair ? "bg-green-500 animate-pulse" : isNextPair ? "bg-yellow-500" : "bg-slate-400"
                        }`} />
                        <h3 className="font-bold text-lg">
                          {isCurrentPair ? "ENVIANDO AGORA" : isNextPair ? "PRÓXIMO" : `Par ${pairIdx + 1}`}
                        </h3>
                      </div>
                      <p className="text-sm text-slate-700">
                        {camp1?.name || "?"} + {camp2?.name || "?"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Cada campanha envia 1 mensagem = 2 mensagens por hora
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monitoramento em Tempo Real */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Monitoramento em Tempo Real</h2>
          {allCampaigns.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-500 mb-4">Nenhuma campanha configurada</p>
              <Button onClick={handleAutoSetup} disabled={isSettingUp} className="bg-purple-600 hover:bg-purple-700 text-white">
                {isSettingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                Auto Configurar Campanhas
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {allCampaigns.map((campaign, idx) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  index={idx}
                  isRunning={isRunning}
                  currentPairIndex={currentPairIndex}
                  totalPairs={totalPairs}
                  cycleTimer={cycleTimer}
                  cycleNumber={cycleNumber}
                  expanded={expandedCampaign === campaign.id}
                  onToggle={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mensagens de Hoje */}
        {todayMessages.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Mensagens Enviadas Hoje ({todayMessages.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {todayMessages.map((msg: any) => (
                  <div key={msg.id} className="flex items-center gap-3 p-2 bg-green-50 rounded border border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-mono">{formatTime(msg.sentAt)}</span>
                    <span className="text-sm text-slate-600 truncate">{msg.messageText?.substring(0, 60)}...</span>
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
 * Card de cada campanha com monitoramento
 */
function CampaignCard({
  campaign,
  index,
  isRunning,
  currentPairIndex,
  totalPairs,
  cycleTimer,
  cycleNumber,
  expanded,
  onToggle,
}: {
  campaign: any;
  index: number;
  isRunning: boolean;
  currentPairIndex: number;
  totalPairs: number;
  cycleTimer: number;
  cycleNumber: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pairIndex = Math.floor(index / 2);
  const isInCurrentPair = pairIndex === currentPairIndex && isRunning;
  const isInNextPair = pairIndex === (currentPairIndex + 1) % totalPairs && isRunning;

  // Buscar contatos desta campanha
  const campaignContacts = trpc.campaigns.getContacts.useQuery(
    { campaignId: campaign.id },
    { enabled: expanded, refetchInterval: expanded ? 5000 : false }
  );

  const contactsList = campaignContacts.data || [];
  const sentCount = contactsList.filter((c: any) => c.status === "sent").length;
  const pendingCount = contactsList.filter((c: any) => c.status === "pending").length;
  const totalContacts = contactsList.length || campaign.totalContacts || 12;

  // Status visual
  let statusText = "Agendado";
  let statusColor = "text-slate-600";
  let borderColor = "border-slate-200";
  let bgColor = "bg-white";

  if (isInCurrentPair) {
    statusText = "Enviando";
    statusColor = "text-green-600";
    borderColor = "border-green-400";
    bgColor = "bg-green-50/30";
  } else if (isInNextPair) {
    statusText = "Aguardando";
    statusColor = "text-yellow-600";
    borderColor = "border-yellow-300";
    bgColor = "bg-yellow-50/30";
  } else if (campaign.status === "running") {
    statusText = "Ativo";
    statusColor = "text-blue-600";
    borderColor = "border-blue-200";
  }

  const progressPercent = totalContacts > 0 ? Math.round((sentCount / totalContacts) * 100) : 0;

  return (
    <Card className={`hover:shadow-lg transition-all border-l-4 ${borderColor} ${bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-block w-3 h-3 rounded-full ${
              isInCurrentPair ? "bg-green-500 animate-pulse" : isInNextPair ? "bg-yellow-500" : "bg-slate-400"
            }`} />
            <div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
              <p className={`text-xs font-semibold ${statusColor}`}>{statusText}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isInCurrentPair && (
              <div className="text-right">
                <p className="text-3xl font-mono font-bold text-green-600">{formatTimer(cycleTimer)}</p>
                <p className="text-xs text-slate-500">Cronômetro (1 hora)</p>
              </div>
            )}
            <button onClick={onToggle} className="p-1 hover:bg-slate-100 rounded">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Progresso */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-600">Progresso do Ciclo</p>
            <p className="text-sm font-bold">{progressPercent}%</p>
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
          <div className="p-2 bg-blue-50 rounded">
            <p className="text-xs text-slate-600">Enviadas</p>
            <p className="text-xl font-bold text-blue-600">{sentCount}/{totalContacts}</p>
          </div>
          <div className="p-2 bg-orange-50 rounded">
            <p className="text-xs text-slate-600">Faltam</p>
            <p className="text-xl font-bold text-orange-600">{pendingCount}</p>
          </div>
          <div className="p-2 bg-purple-50 rounded">
            <p className="text-xs text-slate-600">Ciclo Atual</p>
            <p className="text-xl font-bold text-purple-600">{cycleNumber + 1}</p>
          </div>
          <div className="p-2 bg-green-50 rounded">
            <p className="text-xs text-slate-600">Taxa do Dia</p>
            <p className="text-xl font-bold text-green-600">
              {totalContacts > 0 ? `${((sentCount / totalContacts) * 100).toFixed(1)}%` : "0.0%"}
            </p>
            <p className="text-xs text-slate-500">Meta: {totalContacts} msg/dia</p>
          </div>
        </div>

        {/* Próximo Ciclo */}
        {isInCurrentPair && (
          <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg mb-4 border border-purple-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-purple-800 flex items-center gap-1">
                <Clock className="h-4 w-4" /> Próximo Ciclo em:
              </p>
              <span className="text-2xl font-mono font-bold text-purple-600">{formatTimer(cycleTimer)}</span>
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-slate-600 mb-3">
          Iniciado: {campaign.startDate ? formatTime(campaign.startDate) : "--:--:--"} | Ciclos: {totalContacts} ciclos de 1 hora = {totalContacts} horas
        </p>

        {/* Lista de Contatos Expandível */}
        {expanded && (
          <div className="mt-4 pt-4 border-t">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Contatos ({sentCount}/{totalContacts})</p>
                <p className="text-xs text-slate-600">{sentCount} enviados | {pendingCount} aguardando</p>
              </div>

              {campaignContacts.isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : contactsList.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nenhum contato designado</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {contactsList.map((contact: any) => (
                    <div
                      key={contact.id}
                      className={`flex items-center gap-3 p-3 rounded border ${
                        contact.status === "sent"
                          ? "bg-green-50 border-green-200"
                          : contact.status === "failed"
                          ? "bg-red-50 border-red-200"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      {/* Checkbox */}
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
                      <span className="text-sm font-mono font-semibold min-w-[140px]">
                        {contact.phone}
                      </span>

                      {/* Nome */}
                      <span className="text-sm text-slate-600 truncate flex-1">
                        ({contact.name})
                      </span>

                      {/* Status / Horário */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {contact.status === "sent" ? (
                          <span className="text-xs text-green-600 font-mono">
                            {formatTime(contact.lastMessageSent)}
                          </span>
                        ) : contact.status === "failed" ? (
                          <span className="text-xs text-red-600">Falha</span>
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
