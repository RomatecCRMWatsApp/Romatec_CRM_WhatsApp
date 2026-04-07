import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Home, Send, Settings, LogOut, Wifi, WifiOff, TrendingUp, Building2, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663438352331/2uYgCCZRKgbanKmmzr4z87/Capturadetela2026-04-02172521_ffb58bed.png";

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

  const activeCampaigns = campaigns?.filter(c => c.status === "running").length || 0;

  const stats = [
    { label: "Clientes", value: contacts?.length || 0, icon: Users, color: "emerald", route: "/contacts" },
    { label: "Imóveis", value: properties?.length || 0, icon: Building2, color: "amber", route: "/properties" },
    { label: "Campanhas", value: activeCampaigns, icon: Send, color: "blue", route: "/campaigns" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white p-6">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="Romatec" className="h-14 w-auto object-contain rounded-lg" />
            <div>
              <h1 className="text-2xl font-bold">Romatec CRM - <span className="font-normal italic">Customer Relationship Management</span></h1>
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

        {/* Z-API Status + Quick Actions */}
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
              <p className="text-xs text-muted-foreground">{config?.phone || "—"}</p>
              <p className="text-xs text-muted-foreground">{config?.address || "—"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Clientes", icon: Users, route: "/contacts", color: "bg-emerald-600 hover:bg-emerald-700" },
            { label: "Imóveis", icon: Building2, route: "/properties", color: "bg-amber-600 hover:bg-amber-700" },
            { label: "Campanhas", icon: Send, route: "/campaigns", color: "bg-blue-600 hover:bg-blue-700" },
            { label: "Performance", icon: BarChart3, route: "/performance", color: "bg-purple-600 hover:bg-purple-700" },
            { label: "Configurações", icon: Settings, route: "/settings", color: "bg-gray-600 hover:bg-gray-700" },
          ].map(item => (
            <Button key={item.label} onClick={() => navigate(item.route)} className={`${item.color} h-14 text-white font-bold`}>
              <item.icon className="mr-2 h-5 w-5" /> {item.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
