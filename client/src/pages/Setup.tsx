import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Building2, Wifi, Bell, CheckCircle2, ChevronRight, ChevronLeft,
  Loader2, XCircle, WifiOff, Bot,
} from "lucide-react";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663438352331/2uYgCCZRKgbanKmmzr4z87/Capturadetela2026-04-02172521_ffb58bed.png";

const STEPS = [
  { id: 1, label: "Empresa",   icon: Building2 },
  { id: 2, label: "WhatsApp",  icon: Wifi },
  { id: 3, label: "Extras",    icon: Bell },
];

// ── helpers ────────────────────────────────────────────────────────────────
function StepDot({ step, current }: { step: (typeof STEPS)[0]; current: number }) {
  const done = current > step.id;
  const active = current === step.id;
  const Icon = step.icon;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
          done
            ? "bg-emerald-600 border-emerald-600 text-white"
            : active
            ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
            : "bg-slate-800 border-slate-600 text-slate-500"
        }`}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <span
        className={`text-xs font-medium ${
          active ? "text-emerald-400" : done ? "text-emerald-600" : "text-slate-500"
        }`}
      >
        {step.label}
      </span>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <div
      className={`flex-1 h-0.5 mt-5 transition-all ${
        done ? "bg-emerald-600" : "bg-slate-700"
      }`}
    />
  );
}

// ── main component ─────────────────────────────────────────────────────────
export default function Setup() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  const [empresa, setEmpresa] = useState({ companyName: "", phone: "", address: "" });
  const [zapi, setZapi]       = useState({ zApiInstanceId: "", zApiToken: "", zApiClientToken: "" });
  const [extras, setExtras]   = useState({ telegramBotToken: "", telegramChatId: "", openAiApiKey: "" });

  const [zapiStatus, setZapiStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const update = trpc.companyConfig.update.useMutation();
  const testZApi = trpc.companyConfig.testZApiConnection.useMutation();

  // ── salva step atual e avança ──────────────────────────────────────────
  async function handleNext() {
    try {
      if (step === 1) {
        if (!empresa.companyName.trim()) { toast.error("Nome da empresa obrigatório"); return; }
        if (!empresa.phone.trim())       { toast.error("Telefone obrigatório"); return; }
        await update.mutateAsync(empresa);
        setStep(2);
      } else if (step === 2) {
        if (zapi.zApiInstanceId || zapi.zApiToken) {
          await update.mutateAsync(zapi);
        }
        setStep(3);
      } else if (step === 3) {
        if (extras.telegramBotToken || extras.telegramChatId || extras.openAiApiKey) {
          await update.mutateAsync(extras);
        }
        toast.success("Sistema configurado com sucesso!");
        navigate("/dashboard");
      }
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
  }

  async function handleTestZApi() {
    if (!zapi.zApiInstanceId || !zapi.zApiToken) {
      toast.error("Preencha Instance ID e Token antes de testar");
      return;
    }
    setZapiStatus("testing");
    await update.mutateAsync(zapi);
    testZApi.mutate(undefined, {
      onSuccess: (data) => setZapiStatus(data.success ? "ok" : "fail"),
      onError:   ()     => setZapiStatus("fail"),
    });
  }

  const saving = update.isPending;

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4">
      {/* Card */}
      <div className="w-full max-w-lg">
        {/* Logo + título */}
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="Romatec CRM" className="h-16 mx-auto mb-3 rounded-xl" />
          <h1 className="text-2xl font-bold text-white">Configuração inicial</h1>
          <p className="text-slate-400 text-sm mt-1">Configure o sistema antes de começar a usar</p>
        </div>

        {/* Progress steps */}
        <div className="flex items-start mb-8 px-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="contents">
              <StepDot step={s} current={step} />
              {i < STEPS.length - 1 && <StepLine done={step > s.id} />}
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-xl">

          {/* ── STEP 1: Empresa ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" /> Dados da Empresa
              </h2>
              <div className="space-y-1">
                <Label className="text-slate-300">Nome da empresa <span className="text-red-400">*</span></Label>
                <Input
                  value={empresa.companyName}
                  onChange={(e) => setEmpresa({ ...empresa, companyName: e.target.value })}
                  placeholder="Romatec Consultoria Imobiliária"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Telefone / WhatsApp <span className="text-red-400">*</span></Label>
                <Input
                  value={empresa.phone}
                  onChange={(e) => setEmpresa({ ...empresa, phone: e.target.value })}
                  placeholder="5598912345678"
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">Formato: código do país + DDD + número (sem +)</p>
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Endereço <span className="text-slate-500">(opcional)</span></Label>
                <Input
                  value={empresa.address}
                  onChange={(e) => setEmpresa({ ...empresa, address: e.target.value })}
                  placeholder="Rua São Raimundo, 15 – Centro, Açailândia – MA"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: Z-API WhatsApp ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Wifi className="w-5 h-5 text-emerald-400" /> Conexão WhatsApp (Z-API)
              </h2>
              <p className="text-xs text-slate-400">Obtenha as credenciais em <span className="text-emerald-400">app.z-api.io</span> → sua instância</p>
              <div className="space-y-1">
                <Label className="text-slate-300">Instance ID</Label>
                <Input
                  value={zapi.zApiInstanceId}
                  onChange={(e) => setZapi({ ...zapi, zApiInstanceId: e.target.value })}
                  placeholder="3A20xxxxxxxxxxxxxxxx"
                  className="bg-slate-800 border-slate-600 text-white font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Token</Label>
                <Input
                  type="password"
                  value={zapi.zApiToken}
                  onChange={(e) => setZapi({ ...zapi, zApiToken: e.target.value })}
                  placeholder="••••••••••••••••••••"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-slate-300">Client Token <span className="text-slate-500">(opcional)</span></Label>
                <Input
                  type="password"
                  value={zapi.zApiClientToken}
                  onChange={(e) => setZapi({ ...zapi, zApiClientToken: e.target.value })}
                  placeholder="••••••••••••••••••••"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              {/* Test button */}
              <Button
                variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-400"
                onClick={handleTestZApi}
                disabled={zapiStatus === "testing"}
              >
                {zapiStatus === "testing" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando…</>
                ) : zapiStatus === "ok" ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />Conectado!</>
                ) : zapiStatus === "fail" ? (
                  <><XCircle className="w-4 h-4 mr-2 text-red-400" />Falhou — verifique os dados</>
                ) : (
                  <><WifiOff className="w-4 h-4 mr-2" />Testar conexão Z-API</>
                )}
              </Button>
              <p className="text-xs text-slate-500 text-center">Pode pular e configurar depois em Configurações</p>
            </div>
          )}

          {/* ── STEP 3: Extras ──────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-emerald-400" /> Notificações & IA
                <span className="text-xs text-slate-500 font-normal">(opcional)</span>
              </h2>

              {/* Telegram */}
              <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-400" /> Telegram — alertas do sistema
                </p>
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">Bot Token</Label>
                  <Input
                    value={extras.telegramBotToken}
                    onChange={(e) => setExtras({ ...extras, telegramBotToken: e.target.value })}
                    placeholder="110201543:AAHdqTcv..."
                    className="bg-slate-700 border-slate-600 text-white text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">Chat ID</Label>
                  <Input
                    value={extras.telegramChatId}
                    onChange={(e) => setExtras({ ...extras, telegramChatId: e.target.value })}
                    placeholder="-1001234567890"
                    className="bg-slate-700 border-slate-600 text-white text-sm font-mono"
                  />
                </div>
              </div>

              {/* OpenAI */}
              <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-400" /> OpenAI — qualificação de leads por IA
                </p>
                <div className="space-y-1">
                  <Label className="text-slate-400 text-xs">API Key</Label>
                  <Input
                    type="password"
                    value={extras.openAiApiKey}
                    onChange={(e) => setExtras({ ...extras, openAiApiKey: e.target.value })}
                    placeholder="sk-••••••••••••••••"
                    className="bg-slate-700 border-slate-600 text-white text-sm font-mono"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center">
                Tudo pode ser alterado depois em <span className="text-emerald-400">Configurações</span>
              </p>
            </div>
          )}

          {/* ── Navigation buttons ───────────────────────────────────────── */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <Button
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300"
                onClick={() => setStep(step - 1)}
                disabled={saving}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
            )}
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleNext}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : step === 3 ? (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Concluir setup</>
              ) : (
                <>Próximo <ChevronRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">
          Romatec CRM v1.1.1 · romateccrm.com
        </p>
      </div>
    </div>
  );
}
