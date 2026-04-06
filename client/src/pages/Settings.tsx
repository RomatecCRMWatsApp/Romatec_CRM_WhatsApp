import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, ArrowLeft, Save, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Settings() {
  const [, navigate] = useLocation();
  const { data: config, refetch } = trpc.companyConfig.get.useQuery();
  const updateMutation = trpc.companyConfig.update.useMutation({
    onSuccess: () => { toast.success("Configurações salvas!"); refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const testZApi = trpc.companyConfig.testZApiConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success("Z-API conectado!"); refetch(); }
      else toast.error("Falha: " + data.message);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const [form, setForm] = useState({
    companyName: "", phone: "", address: "",
    zApiInstanceId: "", zApiToken: "",
  });

  useEffect(() => {
    if (config) {
      setForm({
        companyName: config.companyName || "",
        phone: config.phone || "",
        address: config.address || "",
        zApiInstanceId: config.zApiInstanceId || "",
        zApiToken: config.zApiToken || "",
      });
    }
  }, [config]);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white p-6">
        <div className="container flex items-center justify-between">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <SettingsIcon className="h-8 w-8" /> Configurações
          </h1>
          <Button onClick={() => navigate("/dashboard")} variant="outline" className="border-white text-white hover:bg-white/20">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      <div className="container py-8 space-y-6 max-w-2xl">
        {/* Empresa */}
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-foreground">Dados da Empresa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Nome da Empresa</Label>
              <Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Endereço</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="bg-secondary border-border" />
            </div>
          </CardContent>
        </Card>

        {/* Z-API */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground">Integração Z-API (WhatsApp)</CardTitle>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                config?.zApiConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              }`}>
                {config?.zApiConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {config?.zApiConnected ? "Conectado" : "Desconectado"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Instance ID</Label>
              <Input value={form.zApiInstanceId} onChange={e => setForm(f => ({ ...f, zApiInstanceId: e.target.value }))} placeholder="Seu Instance ID da Z-API" className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Token</Label>
              <Input type="password" value={form.zApiToken} onChange={e => setForm(f => ({ ...f, zApiToken: e.target.value }))} placeholder="Seu Token da Z-API" className="bg-secondary border-border" />
            </div>
            <Button
              onClick={() => testZApi.mutate()}
              variant="outline"
              disabled={testZApi.isPending}
              className="w-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${testZApi.isPending ? "animate-spin" : ""}`} />
              {testZApi.isPending ? "Testando..." : "Testar Conexão"}
            </Button>
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-lg font-bold"
        >
          <Save className="mr-2 h-5 w-5" />
          {updateMutation.isPending ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
