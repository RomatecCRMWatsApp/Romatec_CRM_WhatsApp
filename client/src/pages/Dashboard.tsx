import { useMemo, useState, useEffect, lazy, Suspense, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, Settings, LogOut, Wifi, WifiOff, TrendingUp, Building2, BarChart3, CheckCircle2, XCircle, Activity, Zap, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663438352331/2uYgCCZRKgbanKmmzr4z87/Capturadetela2026-04-02172521_ffb58bed.png";

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

/**
 * Componente de gráficos separado para isolar Recharts do DOM principal
 * e evitar o erro insertBefore durante re-renders
 */
function PerformanceCharts({ perfData }: { perfData: any }) {
  // Importar Recharts dinamicamente para evitar conflitos de DOM
  const [Recharts, setRecharts] = useState<any>(null);
  // ID único por instância para evitar conflito de IDs no SVG (bug insertBefore)
  const uid = useRef(`grad_${Math.random().toString(36).substring(2, 8)}`).current;

  useEffect(() => {
    import("recharts").then((mod) => {
      setRecharts(mod);
    });
  }, []);

  const last7Days = useMemo(() => {
    if (!perfData?.byDay) return [];
    return perfData.byDay.slice(-7).map((d: any) => ({
      ...d,
      label: new Date(d.date + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
    }));
  }, [perfData?.byDay]);

  const last30Days = useMemo(() => {
    if (!perfData?.byDay) return [];
    return perfData.byDay.map((d: any) => ({
      ...d,
      label: new Date(d.date + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  }, [perfData?.byDay]);

  const pieData = useMemo(() => {
    if (!perfData?.totals) return [];
    return [
      { name: "Enviadas", value: perfData.totals.sent, color: COLORS.emerald },
      { name: "Falhas", value: perfData.totals.failed, color: COLORS.red },
      { name: "Pendentes", value: perfData.totals.pending, color: COLORS.gold },
      { name: "Bloqueadas", value: perfData.totals.blocked, color: COLORS.muted },
    ].filter((d: any) => d.value > 0);
  }, [perfData?.totals]);

  const hourData = useMemo(() => {
    if (!perfData?.byHour) return [];
    return perfData.byHour.map((h: any) => ({
      ...h,
      label: `${String(h.hour).padStart(2, "0")}h`,
    }));
  }, [perfData?.byHour]);

  const byCampaign = perfData?.byCampaign || [];

  if (!Recharts) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } = Recharts;

  const CustomTooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#1a1f2e", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "6px 12px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
        <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ fontSize: 13, fontWeight: 600, color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Gráficos - Linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-card p-5">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            Envios - Últimos 7 Dias
          </h3>
          <div className="h-[250px]">
            {last7Days.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7Days} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltipContent />} />
                  <Bar dataKey="sent" name="Enviadas" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failed" name="Falhas" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Distribuição de Status
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
                    label={({ name, value }: any) => `${name}: ${value}`}
                    labelLine={{ stroke: "#6b7280" }}
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum dado disponível ainda</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gráficos - Linha 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-card p-5">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            Evolução - Últimos 30 Dias
          </h3>
          <div className="h-[250px]">
            {last30Days.length > 0 ? (
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
                  <Tooltip content={<CustomTooltipContent />} />
                  <Area type="monotone" dataKey="sent" name="Enviadas" stroke={COLORS.emerald} fill={`url(#${uid})`} strokeWidth={2} />
                  <Line type="monotone" dataKey="failed" name="Falhas" stroke={COLORS.red} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            )}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-400" />
            Distribuição por Hora do Dia
          </h3>
          <div className="h-[250px]">
            {hourData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={{ stroke: "#374151" }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltipContent />} />
                  <Bar dataKey="count" name="Mensagens" fill={COLORS.purple} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            )}
          </div>
        </div>
      </div>

      {/* Performance por Campanha */}
      <div className="glass-card p-5">
        <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-400" />
          Performance por Campanha
        </h3>

        {byCampaign.length > 0 && (
          <div className="h-[200px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCampaign} layout="vertical" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={{ stroke: "#374151" }} width={100} />
                <Tooltip content={<CustomTooltipContent />} />
                <Bar dataKey="sent" name="Enviadas" fill={COLORS.emerald} radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="failed" name="Falhas" fill={COLORS.red} radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="pending" name="Pendentes" fill={COLORS.gold} radius={[0, 4, 4, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {byCampaign.map((camp: any, idx: number) => (
            <div key={`camp-perf-${camp.id}`} className="p-4 rounded-xl bg-secondary/30 border border-border/30">
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
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-gray-500/15 text-muted-foreground"
                }`}>
                  {camp.status === "running" ? "ATIVA" : "PAUSADA"}
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-secondary/50 mb-3 overflow-hidden">
                <div className="h-full flex">
                  <div
                    className="h-full bg-emerald-500 transition-all"
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
                  <p className="text-lg font-bold text-emerald-400">{camp.sent}</p>
                  <p className="text-[10px] text-muted-foreground">Enviadas</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{camp.failed}</p>
                  <p className="text-[10px] text-muted-foreground">Falhas</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400">{camp.pending}</p>
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
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => window.location.href = "/",
  });

  const { data: contacts } = trpc.contacts.list.useQuery();
  const { data: properties } = trpc.properties.list.useQuery();
  const { data: campaigns } = trpc.campaigns.list.useQuery();
  const { data: config } = trpc.companyConfig.get.useQuery();
  const { data: perfData, isLoading: perfLoading } = trpc.performance.getStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Manter dados estáveis para evitar re-render dos gráficos
  const [stablePerfData, setStablePerfData] = useState<any>(null);
  useEffect(() => {
    if (perfData) {
      setStablePerfData(perfData);
    }
  }, [perfData]);

  const activeCampaigns = campaigns?.filter(c => c.status === "running").length || 0;

  const stats = useMemo(() => [
    { label: "Clientes", value: contacts?.length || 0, icon: Users, color: "emerald", route: "/contacts" },
    { label: "Imóveis", value: properties?.length || 0, icon: Building2, color: "amber", route: "/properties" },
    { label: "Campanhas", value: activeCampaigns, icon: Send, color: "blue", route: "/campaigns" },
  ], [contacts?.length, properties?.length, activeCampaigns]);

  const totals = stablePerfData?.totals || { sent: 0, failed: 0, pending: 0, blocked: 0, successRate: 0, avgPerDay: 0, activeCampaigns: 0 };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="Romatec" className="h-14 w-auto object-contain rounded-lg" />
            <div>
              <h1 className="text-2xl font-bold">Romatec CRM - <span className="font-normal italic">Gestão de Relacionamento com o Cliente</span></h1>
              <p className="text-white/80 text-sm">Sistema de Gestão de Clientes + Vendas</p>
              <p className="text-white/50 text-xs mt-0.5">CEO José Romário P Bezerra</p>
            </div>
          </div>
          <Button onClick={() => logoutMutation.mutate()} variant="outline" className="border-white/30 text-white hover:bg-white/20">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>

      <div className="container py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map(s => (
            <Card key={s.label} className="bg-card border-border cursor-pointer hover:border-emerald-500/50 transition-colors" onClick={() => navigate(s.route)}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-3xl font-bold text-foreground mt-1">{s.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl bg-${s.color}-500/20`}>
                    <s.icon className={`h-6 w-6 text-${s.color}-400`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Z-API Status + Empresa */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-foreground text-lg">Status WhatsApp</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {config?.zApiConnected ? (
                  <><Wifi className="h-8 w-8 text-emerald-400" /><div><p className="font-bold text-emerald-400">Conectado</p><p className="text-xs text-muted-foreground">Z-API ativo</p></div></>
                ) : (
                  <><WifiOff className="h-8 w-8 text-red-400" /><div><p className="font-bold text-red-400">Desconectado</p><p className="text-xs text-muted-foreground">Configure em Configurações</p></div></>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-foreground text-lg">Empresa</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm text-foreground font-medium">{config?.companyName || "Romatec"}</p>
              <p className="text-xs text-muted-foreground">{config?.phone || "â€”"}</p>
              <p className="text-xs text-muted-foreground">{config?.address || "â€”"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Clientes", icon: Users, route: "/contacts", color: "bg-emerald-600 hover:bg-emerald-700" },
            { label: "Imóveis", icon: Building2, route: "/properties", color: "bg-amber-600 hover:bg-amber-700" },
            { label: "Campanhas", icon: Send, route: "/campaigns", color: "bg-blue-600 hover:bg-blue-700" },
            { label: "Desempenho", icon: BarChart3, route: "/performance", color: "bg-purple-600 hover:bg-purple-700" },
            { label: "Configurações", icon: Settings, route: "/settings", color: "bg-gray-600 hover:bg-gray-700" },
          ].map(item => (
            <Button key={item.label} onClick={() => navigate(item.route)} className={`${item.color} h-14 text-white font-bold`}>
              <item.icon className="mr-2 h-5 w-5" /> {item.label}
            </Button>
          ))}
        </div>

        {/* PAINEL DE DESEMPENHO */}
        <div className="pt-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <BarChart3 className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Desempenho das Campanhas</h2>
              <p className="text-xs text-muted-foreground">Atualizado automaticamente a cada 30 segundos</p>
            </div>
          </div>

          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Total Enviadas</span>
                <Send className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold text-emerald-400">{totals.sent}</p>
              <p className="text-xs text-muted-foreground mt-1">com sucesso</p>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Taxa de Sucesso</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold text-emerald-400">{totals.successRate} %</p>
              <p className="text-xs text-muted-foreground mt-1">de {totals.sent + totals.failed} tentativas</p>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Média/Dia</span>
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-3xl font-bold text-amber-400">{totals.avgPerDay}</p>
              <p className="text-xs text-muted-foreground mt-1">mensagens nos últimos 7 dias</p>
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

          {/* Gráficos - componente isolado */}
          {stablePerfData ? (
            <PerformanceCharts perfData={stablePerfData} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Carregando gráficos...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



