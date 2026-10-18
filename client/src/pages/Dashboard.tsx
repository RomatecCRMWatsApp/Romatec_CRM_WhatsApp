import { useMemo, useState, useEffect, lazy, Suspense, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, Settings, LogOut, WifiOff, TrendingUp, Building2, BarChart3, CheckCircle2, XCircle, RefreshCw, UserPlus, Flame, ChevronRight, MessageCircle, ExternalLink, Activity, Zap, Clock, Images } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "/icon-512x512.png";

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

const ORIGEM_LABEL: Record<string, string> = {
  instagram_ads: "Anúncio Instagram/Facebook",
  instagram_dm: "Direct Instagram",
  instagram_bio: "Link da bio / landing",
  site: "Site",
  indicacao: "Indicação",
  whatsapp: "WhatsApp",
};

const SCORE_STYLE: Record<string, string> = {
  quente: "bg-red-500/15 text-red-300 border-red-500/30",
  morno: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  frio: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

function timeAgo(date?: string | Date | null): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function isToday(date?: string | Date | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center text-xl font-black">R</div>;
  }
  return <img src={LOGO_URL} alt="Romatec" onError={() => setFailed(true)} className="h-11 w-auto object-contain rounded-lg" />;
}

/** Status real do WhatsApp: discreto quando ok, com motivo e passos quando não */
function WhatsAppStatusPanel() {
  const [, navigate] = useLocation();
  const [force, setForce] = useState(false);
  const status = trpc.companyConfig.whatsappStatus.useQuery({ force }, { refetchInterval: 60000 });
  const testZApi = trpc.companyConfig.testZApiConnection.useMutation();

  const verificar = async () => {
    setForce(true);
    const r = await status.refetch();
    setForce(false);
    if (r.data?.state === "connected") {
      // Retoma o agendador se ele tinha sido pausado pela queda do Z-API
      const t = await testZApi.mutateAsync().catch(() => null);
      toast.success(t?.message?.includes("retomado") ? "WhatsApp conectado! Envios retomados." : "WhatsApp conectado!");
    } else if (r.data) {
      toast.error(r.data.title);
    }
  };

  const s = status.data;
  const checking = status.isFetching || testZApi.isPending;

  if (!s) {
    return (
      <div className="glass-card p-4 flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Verificando o WhatsApp...
      </div>
    );
  }

  if (s.state === "connected") {
    return (
      <div className="glass-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-300">WhatsApp conectado</p>
            <p className="text-xs text-muted-foreground">Verificado {timeAgo(s.checkedAt)} · campanhas, bot e boas-vindas de leads funcionando</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={verificar} disabled={checking} className="text-muted-foreground">
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-5">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="p-2.5 rounded-lg bg-red-500/20 self-start">
          <WifiOff className="h-6 w-6 text-red-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-red-200">{s.title}</p>
          <p className="text-sm text-red-100/80 mt-0.5">{s.detail}</p>
          {s.steps.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {s.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-red-50/90">
                  <span className="flex-shrink-0 h-5 w-5 rounded-full bg-red-500/30 text-red-100 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-red-200/50 mt-3">Verificado {timeAgo(s.checkedAt)}</p>
        </div>
        <div className="flex flex-row md:flex-col gap-2 shrink-0">
          <Button size="sm" onClick={verificar} disabled={checking} className="bg-red-600 hover:bg-red-700 text-white">
            <RefreshCw className={`mr-1.5 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Verificando..." : "Verificar agora"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/settings")} className="border-red-400/40 text-red-100 hover:bg-red-500/20">
            <Settings className="mr-1.5 h-4 w-4" /> Configurações
          </Button>
          <Button size="sm" variant="outline" asChild className="border-red-400/40 text-red-100 hover:bg-red-500/20">
            <a href="https://app.z-api.io" target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" /> Painel Z-API</a>
          </Button>
        </div>
      </div>
    </div>
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
  const { data: leadsData } = trpc.leads.list.useQuery({ limit: 200 }, { refetchInterval: 60000 });
  const { data: perfData } = trpc.performance.getStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Manter dados estáveis para evitar re-render dos gráficos
  const [stablePerfData, setStablePerfData] = useState<any>(null);
  useEffect(() => {
    if (perfData) {
      setStablePerfData(perfData);
    }
  }, [perfData]);

  const activeCampaigns = campaigns?.filter((c: any) => c.status === "running").length || 0;
  const leads = leadsData?.leads ?? [];
  const leadsHoje = useMemo(() => leads.filter((l: any) => isToday(l.createdAt)).length, [leads]);
  const ultimosLeads = useMemo(
    () => [...leads].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [leads],
  );

  const kpis = [
    { label: "Leads novos hoje", value: leadsHoje, hint: `${leadsData?.stats.total ?? 0} no total`, icon: UserPlus, accent: "text-emerald-300", route: "/leads" },
    { label: "Leads quentes", value: leadsData?.stats.quente ?? 0, hint: "prontos para o corretor", icon: Flame, accent: "text-red-300", route: "/leads" },
    { label: "Clientes", value: contacts?.length ?? 0, hint: "na base de contatos", icon: Users, accent: "text-sky-300", route: "/contacts" },
    { label: "Imóveis", value: properties?.length ?? 0, hint: `${activeCampaigns} em campanha ativa`, icon: Building2, accent: "text-amber-300", route: "/properties" },
  ];

  const atalhos = [
    { label: "Leads", desc: "Atender e qualificar", icon: Flame, route: "/leads" },
    { label: "Clientes", desc: "Base de contatos", icon: Users, route: "/contacts" },
    { label: "Imóveis", desc: "Cadastro e fotos", icon: Building2, route: "/properties" },
    { label: "Materiais", desc: "Artes, vídeos e folders para divulgar", icon: Images, route: "/materiais" },
    { label: "Campanhas", desc: "Disparos no WhatsApp", icon: Send, route: "/campaigns" },
    { label: "Desempenho", desc: "Relatórios", icon: BarChart3, route: "/performance" },
    { label: "Configurações", desc: "Z-API, Telegram, empresa", icon: Settings, route: "/settings" },
  ];

  const totals = stablePerfData?.totals || { sent: 0, failed: 0, pending: 0, blocked: 0, successRate: 0, avgPerDay: 0, activeCampaigns: 0 };
  const hojeRaw = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const hoje = hojeRaw.charAt(0).toUpperCase() + hojeRaw.slice(1);
  const primeiroNome = (user?.name || "").split(" ")[0];

  return (
    <div className="min-h-screen bg-background">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
        <div className="container py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo />
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold leading-tight">Romatec CRM</h1>
              <p className="text-white/70 text-xs md:text-sm truncate">{primeiroNome ? `Olá, ${primeiroNome} · ` : ""}{hoje}</p>
            </div>
          </div>
          <Button onClick={() => logoutMutation.mutate()} variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/15 shrink-0">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        <WhatsAppStatusPanel />

        {/* Indicadores do dia */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <button
              key={k.label}
              onClick={() => navigate(k.route)}
              className="glass-card p-4 text-left hover:border-emerald-500/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={`h-4 w-4 ${k.accent}`} />
              </div>
              <p className="text-3xl font-bold text-foreground mt-2">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.hint}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Últimos leads */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-400" /> Últimos leads
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => navigate("/leads")} className="text-emerald-300 hover:text-emerald-200">
                Ver todos <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {ultimosLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum lead ainda. Os cadastros do Instagram e da landing aparecem aqui.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {ultimosLeads.map((l: any) => {
                    const nome = l.contactName || l.nome || "Sem nome";
                    const phone = String(l.phone || "").replace(/\D/g, "");
                    return (
                      <li key={l.id} className="py-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-sm font-bold shrink-0">
                          {nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate">{nome}</p>
                            {l.score && (
                              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${SCORE_STYLE[l.score] || ""}`}>{l.score}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {ORIGEM_LABEL[l.origem] || "WhatsApp"}
                            {l.campanhaOrigem ? ` · ${l.campanhaOrigem}` : ""} · {timeAgo(l.createdAt)}
                          </p>
                        </div>
                        {phone && (
                          <Button size="sm" variant="outline" asChild className="shrink-0 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                            <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" title={`Abrir conversa com ${nome}`}>
                              <MessageCircle className="h-4 w-4 md:mr-1.5" /><span className="hidden md:inline">WhatsApp</span>
                            </a>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Atalhos */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-foreground text-base">Ir para</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {atalhos.map(a => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.route)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <a.icon className="h-4 w-4 text-emerald-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              <div className="border-t border-border mt-2 pt-3 px-3">
                <p className="text-xs text-muted-foreground">{config?.companyName || "Romatec"}</p>
                <p className="text-xs text-muted-foreground/70">{[config?.phone, config?.address].filter(Boolean).join(" · ")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campanhas */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <BarChart3 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Campanhas no WhatsApp</h2>
                <p className="text-xs text-muted-foreground">{activeCampaigns} ativa(s) · atualizado a cada 30 segundos</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => navigate("/campaigns")} className="text-emerald-300 hover:text-emerald-200">
              Gerenciar <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Enviadas</span>
                <Send className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold text-emerald-400">{totals.sent}</p>
              <p className="text-xs text-muted-foreground mt-1">com sucesso</p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Taxa de sucesso</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-3xl font-bold text-emerald-400">{totals.successRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">de {totals.sent + totals.failed} tentativas</p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Média por dia</span>
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-3xl font-bold text-amber-400">{totals.avgPerDay}</p>
              <p className="text-xs text-muted-foreground mt-1">últimos 7 dias</p>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Falhas</span>
                <XCircle className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-3xl font-bold text-red-400">{totals.failed}</p>
              <p className="text-xs text-muted-foreground mt-1">{totals.blocked} bloqueada(s)</p>
            </div>
          </div>

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

        <div className="text-center pb-2">
          <span className="text-xs text-muted-foreground/40 select-none">Romatec CRM v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}
