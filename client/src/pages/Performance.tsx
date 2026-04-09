import { useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  Area, AreaChart,
} from "recharts";
import {
  ArrowLeft, TrendingUp, Send, AlertTriangle, Clock, BarChart3,
  CheckCircle2, XCircle, Activity, Zap,
} from "lucide-react";

const COLORS = {
  emerald: "#10b981",
  emeraldDark: "#059669",
  gold: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
  pink: "#ec4899",
  muted: "#6b7280",
};

const CAMPAIGN_COLORS = [COLORS.emerald, COLORS.gold, COLORS.blue, COLORS.purple, COLORS.cyan, COLORS.pink];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1f2e] border border-emerald/20 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function Performance() {
  const [, navigate] = useLocation();
  const uid = useRef(`perf_${Math.random().toString(36).substring(2, 8)}`).current;
  const { data, isLoading } = trpc.performance.getStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Formatar dados dos Ãºltimos 7 dias para o grÃ¡fico de linha
  const last7Days = useMemo(() => {
    if (!data?.byDay) return [];
    return data.byDay.slice(-7).map(d => ({
      ...d,
      label: new Date(d.date + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
    }));
  }, [data?.byDay]);

  // Formatar dados dos Ãºltimos 30 dias
  const last30Days = useMemo(() => {
    if (!data?.byDay) return [];
    return data.byDay.map(d => ({
      ...d,
      label: new Date(d.date + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [data?.byDay]);

  // Dados para grÃ¡fico de pizza (status geral)
  const pieData = useMemo(() => {
    if (!data?.totals) return [];
    return [
      { name: "Enviadas", value: data.totals.sent, color: COLORS.emerald },
      { name: "Falhas", value: data.totals.failed, color: COLORS.red },
      { name: "Pendentes", value: data.totals.pending, color: COLORS.gold },
      { name: "Bloqueadas", value: data.totals.blocked, color: COLORS.muted },
    ].filter(d => d.value > 0);
  }, [data?.totals]);

  // Dados por hora
  const hourData = useMemo(() => {
    if (!data?.byHour) return [];
    return data.byHour.map(h => ({
      ...h,
      label: `${String(h.hour).padStart(2, "0")}h`,
    }));
  }, [data?.byHour]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald/30 border-t-emerald rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dados de performance...</p>
        </div>
      </div>
    );
  }

  const totals = data?.totals || { sent: 0, failed: 0, pending: 0, blocked: 0, successRate: 0, avgPerDay: 0, activeCampaigns: 0 };
  const byCampaign = data?.byCampaign || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-dark/80 via-emerald/60 to-emerald-dark/80 border-b border-emerald/20">
        <div className="container py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                Dashboard de Performance
              </h1>
              <p className="text-white/70 text-sm mt-0.5">
                Romatec CRM - AnÃ¡lise de campanhas WhatsApp
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* Cards de Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Enviadas</span>
              <Send className="h-4 w-4 text-emerald" />
            </div>
            <p className="text-3xl font-bold text-emerald text-glow-green">{totals.sent}</p>
            <p className="text-xs text-muted-foreground mt-1">mensagens com sucesso</p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Taxa de Sucesso</span>
              <CheckCircle2 className="h-4 w-4 text-emerald" />
            </div>
            <p className="text-3xl font-bold text-emerald text-glow-green">{totals.successRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">de {totals.sent + totals.failed} tentativas</p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">MÃ©dia/Dia</span>
              <TrendingUp className="h-4 w-4 text-gold" />
            </div>
            <p className="text-3xl font-bold text-gold text-glow-gold">{totals.avgPerDay}</p>
            <p className="text-xs text-muted-foreground mt-1">msgs nos Ãºltimos 7 dias</p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Falhas</span>
              <XCircle className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-3xl font-bold text-red-400">{totals.failed}</p>
            <p className="text-xs text-muted-foreground mt-1">{totals.blocked} bloqueadas</p>
          </div>
        </div>

        {/* GrÃ¡ficos - Linha 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GrÃ¡fico: Envios Ãºltimos 7 dias */}
          <div className="glass-card p-5">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald" />
              Envios - Ãšltimos 7 Dias
            </h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7Days} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="sent" name="Enviadas" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Falhas" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* GrÃ¡fico: Status Geral (Pizza) */}
          <div className="glass-card p-5">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-gold" />
              DistribuiÃ§Ã£o de Status
            </h3>
            <div className="h-[250px] flex items-center">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={{ stroke: "#6b7280" }}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum dado disponÃ­vel ainda</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GrÃ¡ficos - Linha 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GrÃ¡fico: EvoluÃ§Ã£o 30 dias */}
          <div className="glass-card p-5">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              EvoluÃ§Ã£o - Ãšltimos 30 Dias
            </h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last30Days}>
                  <defs>
                    <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.emerald} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={{ stroke: "#374151" }} interval={4} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="sent" name="Enviadas" stroke={COLORS.emerald} fill={`url(#${uid})`} strokeWidth={2} />
                  <Line type="monotone" dataKey="failed" name="Falhas" stroke={COLORS.red} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* GrÃ¡fico: DistribuiÃ§Ã£o por Hora */}
          <div className="glass-card p-5">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              DistribuiÃ§Ã£o por Hora do Dia
            </h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={{ stroke: "#374151" }} interval={2} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Mensagens" fill={COLORS.purple} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tabela de Campanhas */}
        <div className="glass-card p-5">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald" />
            Performance por Campanha
          </h3>

          {/* GrÃ¡fico de barras horizontais por campanha */}
          <div className="h-[200px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCampaign} layout="vertical" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="sent" name="Enviadas" fill={COLORS.emerald} radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="failed" name="Falhas" fill={COLORS.red} radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="pending" name="Pendentes" fill={COLORS.gold} radius={[0, 4, 4, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cards detalhados por campanha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {byCampaign.map((camp, idx) => (
              <div key={camp.id} className="p-4 rounded-xl bg-secondary/30 border border-border/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CAMPAIGN_COLORS[idx % CAMPAIGN_COLORS.length] }}
                    />
                    <h4 className="font-bold text-foreground text-sm">{camp.name}</h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    camp.status === "running"
                      ? "bg-emerald/15 text-emerald"
                      : "bg-muted/15 text-muted-foreground"
                  }`}>
                    {camp.status === "running" ? "ATIVA" : "PAUSADA"}
                  </span>
                </div>

                {/* Barra de progresso */}
                <div className="w-full h-2 rounded-full bg-secondary/50 mb-3 overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="h-full bg-emerald transition-all"
                      style={{ width: `${camp.total > 0 ? (camp.sent / camp.total) * 100 : 0}%` }}
                    />
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{ width: `${camp.total > 0 ? (camp.failed / camp.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald">{camp.sent}</p>
                    <p className="text-[10px] text-muted-foreground">Enviadas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-400">{camp.failed}</p>
                    <p className="text-[10px] text-muted-foreground">Falhas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gold">{camp.pending}</p>
                    <p className="text-[10px] text-muted-foreground">Pendentes</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{camp.successRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Sucesso</p>
                  </div>
                </div>

                <div className="mt-2 text-center">
                  <span className="text-[10px] text-muted-foreground">
                    {camp.messagesPerHour} msgs/hora | {camp.total} contatos
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BotÃ£o voltar */}
        <div className="text-center pb-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="btn-premium px-6 py-3 rounded-xl inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}


