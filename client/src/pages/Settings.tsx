import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, ArrowLeft, Save, Wifi, WifiOff, RefreshCw, Lock, Eye, EyeOff, User, Send, CheckCircle2, XCircle, MessageSquare, Bot, Bell } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Settings() {
  const [, navigate] = useLocation();
  const { data: config, refetch } = trpc.companyConfig.get.useQuery();
  const { data: me } = trpc.auth.me.useQuery();

  const updateMutation = trpc.companyConfig.update.useMutation({
    onSuccess: () => { toast.success("Configurações salvas!"); refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const testZApi = trpc.companyConfig.testZApiConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(data.message); refetch(); }
      else toast.error(data.message);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const sendTestMessage = trpc.zapi.sendMessage.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("✅ Mensagem enviada com sucesso!");
        setTestResult({ success: true, message: "Mensagem enviada!" });
      } else {
        toast.error("❌ Falha: " + (data.error || "Erro desconhecido"));
        setTestResult({ success: false, message: data.error || "Erro" });
      }
    },
    onError: (e) => {
      toast.error("Erro: " + e.message);
      setTestResult({ success: false, message: e.message });
    },
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setPassForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const [form, setForm] = useState({
    companyName: "", phone: "", address: "",
    zApiInstanceId: "", zApiToken: "", zApiClientToken: "",
    telegramBotToken: "", telegramChatId: "", openAiApiKey: "",
  });

  const [passForm, setPassForm] = useState({
    currentPassword: "", newPassword: "", confirmPassword: "",
  });

  const [showPass, setShowPass] = useState({
    current: false, new: false, confirm: false,
  });

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("🏠 Teste de conexão Z-API - Romatec CRM. Se recebeu esta mensagem, o sistema está funcionando perfeitamente! ✅");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (config) {
      setForm({
        companyName: config.companyName || "",
        phone: config.phone || "",
        address: config.address || "",
        zApiInstanceId: config.zApiInstanceId || "",
        zApiToken: config.zApiToken || "",
        zApiClientToken: config.zApiClientToken || "",
        telegramBotToken: (config as any).telegramBotToken || "",
        telegramChatId: (config as any).telegramChatId || "",
        openAiApiKey: (config as any).openAiApiKey || "",
      });
    }
  }, [config]);

  const handleChangePassword = () => {
    if (!passForm.newPassword || passForm.newPassword.length < 6) {
      toast.error("Nova senha deve ter pelo menos 6 caracteres!");
      return;
    }
    if (passForm.newPassword !== passForm.confirmPassword) {
      toast.error("Senhas não conferem!");
      return;
    }
    changePassword.mutate({
      currentPassword: passForm.currentPassword,
      newPassword: passForm.newPassword,
    });
  };

  const handleSendTest = () => {
    if (!testPhone.trim()) {
      toast.error("Digite um número de telefone!");
      return;
    }
    if (!testMessage.trim()) {
      toast.error("Digite uma mensagem!");
      return;
    }
    setTestResult(null);
    // Formatar número
    const clean = testPhone.replace(/\D/g, '');
    const formatted = clean.startsWith('55') ? clean : `55${clean}`;
    sendTestMessage.mutate({ phone: formatted, message: testMessage });
  };

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

        {/* Dados da Empresa */}
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
              <Input value={form.zApiInstanceId} onChange={e => setForm(f => ({ ...f, zApiInstanceId: e.target.value }))} placeholder="Ex: 3F0D313A38C952B7106F6A1199C38405" className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Token da Instância</Label>
              <Input type="password" value={form.zApiToken} onChange={e => setForm(f => ({ ...f, zApiToken: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Client-Token (Segurança)</Label>
              <Input type="password" value={form.zApiClientToken} onChange={e => setForm(f => ({ ...f, zApiClientToken: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <Button
              onClick={() => updateMutation.mutate(form, { onSuccess: () => testZApi.mutate() })}
              variant="outline"
              disabled={testZApi.isPending || updateMutation.isPending}
              className="w-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${testZApi.isPending ? "animate-spin" : ""}`} />
              {testZApi.isPending ? "Testando..." : "Salvar e Testar Conexão"}
            </Button>
          </CardContent>
        </Card>

        {/* Teste de Envio Z-API */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-400" />
              Teste de Envio WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Envie uma mensagem de teste para verificar se o WhatsApp está funcionando corretamente.
            </p>

            <div>
              <Label className="text-muted-foreground text-xs">Número de Destino</Label>
              <Input
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="Ex: 99991234567 ou +5599991234567"
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground mt-1">DDD + número (com ou sem +55)</p>
            </div>

            <div>
              <Label className="text-muted-foreground text-xs">Mensagem de Teste</Label>
              <textarea
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Resultado do teste */}
            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {testResult.success
                  ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  : <XCircle className="h-5 w-5 flex-shrink-0" />
                }
                <span className="text-sm font-medium">{testResult.message}</span>
              </div>
            )}

            <Button
              onClick={handleSendTest}
              disabled={sendTestMessage.isPending || !config?.zApiConnected}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {sendTestMessage.isPending ? (
                <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" /> Enviar Mensagem de Teste</>
              )}
            </Button>

            {!config?.zApiConnected && (
              <p className="text-xs text-amber-400 text-center">
                ⚠️ Z-API não está conectado. Salve e teste a conexão primeiro.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Telegram + OpenAI */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-400" />
              Notificações e IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Telegram */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="text-lg">📲</span> Telegram Bot
              </p>
              <p className="text-xs text-muted-foreground">
                Notificações de envio, leads quentes e alertas do sistema via Telegram.
              </p>
              <div>
                <Label className="text-muted-foreground text-xs">Bot Token</Label>
                <Input
                  type="password"
                  value={form.telegramBotToken}
                  onChange={e => setForm(f => ({ ...f, telegramBotToken: e.target.value }))}
                  placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                  className="bg-secondary border-border font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">Obtido via @BotFather no Telegram</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Chat ID</Label>
                <Input
                  value={form.telegramChatId}
                  onChange={e => setForm(f => ({ ...f, telegramChatId: e.target.value }))}
                  placeholder="-1001234567890 ou 123456789"
                  className="bg-secondary border-border font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">ID do grupo ou canal que receberá as notificações</p>
              </div>
            </div>

            <div className="border-t border-border/50" />

            {/* OpenAI */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bot className="h-4 w-4 text-emerald-400" /> OpenAI (Bot IA)
              </p>
              <p className="text-xs text-muted-foreground">
                Chave usada pelo bot para qualificar leads e responder automaticamente no WhatsApp.
              </p>
              <div>
                <Label className="text-muted-foreground text-xs">API Key</Label>
                <Input
                  type="password"
                  value={form.openAiApiKey}
                  onChange={e => setForm(f => ({ ...f, openAiApiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="bg-secondary border-border font-mono text-xs"
                />
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Login / Senha */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-400" />
              Acesso ao Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg border border-border/50">
              <div className="p-2 rounded-full bg-emerald-500/20">
                <User className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{me?.name || "Usuário"}</p>
                <p className="text-xs text-muted-foreground">{me?.email || "—"}</p>
              </div>
              <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {me?.role === "admin" ? "Administrador" : "Usuário"}
              </span>
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-sm font-semibold text-foreground">Alterar Senha</p>

              <div>
                <Label className="text-muted-foreground text-xs">Senha Atual</Label>
                <div className="relative">
                  <Input
                    type={showPass.current ? "text" : "password"}
                    value={passForm.currentPassword}
                    onChange={e => setPassForm(f => ({ ...f, currentPassword: e.target.value }))}
                    placeholder="Digite a senha atual"
                    className="bg-secondary border-border pr-10"
                  />
                  <button type="button" onClick={() => setShowPass(s => ({ ...s, current: !s.current }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Nova Senha</Label>
                <div className="relative">
                  <Input
                    type={showPass.new ? "text" : "password"}
                    value={passForm.newPassword}
                    onChange={e => setPassForm(f => ({ ...f, newPassword: e.target.value }))}
                    placeholder="Mínimo 6 caracteres"
                    className="bg-secondary border-border pr-10"
                  />
                  <button type="button" onClick={() => setShowPass(s => ({ ...s, new: !s.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-xs">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Input
                    type={showPass.confirm ? "text" : "password"}
                    value={passForm.confirmPassword}
                    onChange={e => setPassForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Repita a nova senha"
                    className="bg-secondary border-border pr-10"
                  />
                  <button type="button" onClick={() => setShowPass(s => ({ ...s, confirm: !s.confirm }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={changePassword.isPending || !passForm.newPassword}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Lock className="mr-2 h-4 w-4" />
                {changePassword.isPending ? "Alterando..." : "Alterar Senha"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Salvar */}
        <Button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 text-lg font-bold"
        >
          <Save className="mr-2 h-5 w-5" />
          {updateMutation.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>

        {/* Informações do sistema */}
        <div className="border border-border rounded-xl p-4 bg-card/50">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Informações do Sistema</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Versão</span>
              <span className="text-foreground font-mono font-medium">v{__APP_VERSION__}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plataforma</span>
              <span className="text-foreground">Web · romateccrm.com</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Banco de dados</span>
              <span className="text-emerald-400">MySQL · Railway</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
