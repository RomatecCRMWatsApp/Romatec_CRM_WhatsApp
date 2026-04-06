import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Play, Pause, RotateCcw, Zap, Trash2, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

// Mock data for properties
const PROPERTIES = [
  { id: 1, name: "Mod_Vaz-01", status: "sending", contacts: 12 },
  { id: 2, name: "Mod_Vaz-02", status: "sending", contacts: 12 },
  { id: 3, name: "Mod_Vaz-03", status: "sending", contacts: 12 },
  { id: 4, name: "ALACIDE", status: "sending", contacts: 12 },
];

const CAMPAIGN_MESSAGES = [
  {
    id: 1,
    property: "Mod_Vaz-01",
    status: "Agendado",
    message: "Mod_Vaz-01 está disponível em Açailândia. Venha conferir este novo empreendimento com ótimas características. Clique aqui para visualizar fotos e detalhes completos.",
    total: 12,
    sent: 0,
    pending: 12,
    failed: 0,
    rate: "0.0%",
    created: "05/04/26",
  },
  {
    id: 2,
    property: "Mod_Vaz-02",
    status: "Agendado",
    message: "Novo empreendimento disponível em Açailândia. Mod_Vaz-02 é uma oportunidade para quem busca investimento seguro em imóvel. Conheça as características completas.",
    total: 12,
    sent: 0,
    pending: 12,
    failed: 0,
    rate: "0.0%",
    created: "05/04/26",
  },
  {
    id: 3,
    property: "Mod_Vaz-03",
    status: "Enviado",
    message: "Mod_Vaz-03 está disponível em Açailândia. Venha conferir este novo empreendimento com ótimas características. Clique aqui para visualizar fotos e detalhes completos.",
    total: 12,
    sent: 0,
    pending: 12,
    failed: 0,
    rate: "0.0%",
    created: "05/04/26",
  },
  {
    id: 4,
    property: "ALACIDE",
    status: "Enviado",
    message: "ALACIDE - Vila São Francisco está disponível em Açailândia. Venha conferir este novo empreendimento com ótimas características. Clique aqui para visualizar fotos e detalhes completos.",
    total: 12,
    sent: 0,
    pending: 12,
    failed: 0,
    rate: "0.0%",
    created: "05/04/26",
  },
];

export default function Campaigns() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedProperty, setExpandedProperty] = useState<number | null>(null);
  const [timers, setTimers] = useState<{ [key: string]: string }>({
    "1": "00:31:22",
    "2": "00:31:22",
    "3": "00:31:22",
    "4": "00:31:22",
  });

  // Simular contagem regressiva
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        const newTimers = { ...prev };
        Object.keys(newTimers).forEach((key) => {
          const [h, m, s] = newTimers[key].split(":").map(Number);
          let seconds = h * 3600 + m * 60 + s - 1;
          if (seconds < 0) seconds = 3600;
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = seconds % 60;
          newTimers[key] = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        });
        return newTimers;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              🚀 Campanhas de Vendas
            </h1>
            <p className="text-primary-foreground/80 mt-1">Gerencie suas campanhas de envio de mensagens</p>
          </div>
          <Button onClick={() => navigate("/dashboard")} variant="outline">← Voltar</Button>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8">
        {/* Ciclos Section */}
        <Card className="mb-8 border-2 border-primary/20">
          <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
            <CardTitle className="text-xl">📊 Ciclos de Campanhas</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ciclo Vigente */}
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🟢</span>
                  <h3 className="font-bold text-lg">CICLO 4 VIGENTE</h3>
                </div>
                <p className="text-sm text-slate-700 mb-3">Ciclo 4: Vaz-03 + ALACIDE</p>
                <p className="text-sm font-semibold text-slate-900">Enviando: Mod_Vaz-03 + ALACIDE</p>
                <div className="mt-4 text-center">
                  <p className="text-xs text-slate-600 mb-1">Próximo em</p>
                  <p className="text-3xl font-bold text-green-600">8m 55s</p>
                </div>
              </div>

              {/* Próximo Ciclo */}
              <div className="p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🟡</span>
                  <h3 className="font-bold text-lg">PRÓXIMO: Ciclo 1</h3>
                </div>
                <p className="text-sm text-slate-700 mb-3">Ciclo 1: Vaz-01 + Vaz-02</p>
                <p className="text-sm font-semibold text-slate-900">Mod_Vaz-01 + Mod_Vaz-02</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Control Buttons */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>⚙️ Controles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transform hover:scale-105 transition-all">
                <Plus className="mr-2 h-4 w-4" /> Nova
              </Button>
              <Button className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold transform hover:scale-105 transition-all">
                <Play className="mr-2 h-4 w-4" /> Iniciar
              </Button>
              <Button className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white font-semibold transform hover:scale-105 transition-all">
                <Pause className="mr-2 h-4 w-4" /> Pausar
              </Button>
              <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transform hover:scale-105 transition-all">
                ✅ Retomar
              </Button>
              <Button className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold transform hover:scale-105 transition-all">
                <RotateCcw className="mr-2 h-4 w-4" /> Resetar
              </Button>
              <Button className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold transform hover:scale-105 transition-all">
                <Trash2 className="mr-2 h-4 w-4" /> Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Real-time Monitoring */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">📱 Monitoramento em Tempo Real</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {PROPERTIES.map((prop) => (
              <Card key={prop.id} className="hover:shadow-lg transition-all border-l-4 border-primary">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🟢</span>
                      <div>
                        <CardTitle className="text-lg">{prop.name}</CardTitle>
                        <p className="text-xs text-slate-600">Enviando</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedProperty(expandedProperty === prop.id ? null : prop.id)}
                      className="p-1 hover:bg-slate-100 rounded"
                    >
                      {expandedProperty === prop.id ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* Timer */}
                  <div className="mb-4 p-3 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg">
                    <p className="text-xs text-slate-600 mb-1">⏱️ Cronômetro (1 hora)</p>
                    <p className="text-3xl font-bold text-primary">{timers[String(prop.id)]}</p>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <p className="text-xs text-slate-600 mb-2">Progresso do Ciclo</p>
                    <div className="w-full bg-slate-200 rounded-full h-3">
                      <div className="bg-gradient-to-r from-green-400 to-green-600 h-3 rounded-full" style={{ width: "52%" }}></div>
                    </div>
                    <p className="text-sm font-bold mt-1">52%</p>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-2 bg-blue-50 rounded">
                      <p className="text-xs text-slate-600">Enviadas</p>
                      <p className="text-xl font-bold text-blue-600">0/12</p>
                    </div>
                    <div className="p-2 bg-red-50 rounded">
                      <p className="text-xs text-slate-600">Faltam</p>
                      <p className="text-xl font-bold text-red-600">12</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded">
                      <p className="text-xs text-slate-600">Ciclo Atual</p>
                      <p className="text-xl font-bold text-purple-600">🔄 1/12</p>
                    </div>
                    <div className="p-2 bg-green-50 rounded">
                      <p className="text-xs text-slate-600">Taxa do Dia</p>
                      <p className="text-xl font-bold text-green-600">0.0%</p>
                    </div>
                  </div>

                  {/* Next Cycle */}
                  <div className="p-3 bg-yellow-50 rounded-lg mb-4 border-l-4 border-yellow-400">
                    <p className="text-sm font-semibold text-slate-900">⏳ Próximo Ciclo em: <span className="text-yellow-600">01:00:00</span></p>
                  </div>

                  {/* Info */}
                  <p className="text-xs text-slate-600 mb-3">
                    🚀 Iniciado: 22:52:33 | 📊 Ciclos: 12 ciclos de 1 hora = 12 horas
                  </p>

                  {/* Expandable Contacts */}
                  {expandedProperty === prop.id && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-sm font-semibold mb-2">📱 Contatos (0/12)</p>
                        <p className="text-xs text-slate-600">0 enviados • 12 aguardando</p>
                        <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200">
                              <span className="text-sm">☕</span>
                              <span className="text-xs text-slate-600">+55 99 9917{String(i).padStart(4, "0")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Campaigns Table */}
        <div>
          <h2 className="text-2xl font-bold mb-4">📋 Campanhas Cadastradas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CAMPAIGN_MESSAGES.map((campaign) => (
              <Card key={campaign.id} className="hover:shadow-lg transition-all">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-secondary/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">#{campaign.id} {campaign.property}</CardTitle>
                      <p className={`text-xs font-semibold ${campaign.status === "Enviado" ? "text-green-600" : "text-yellow-600"}`}>
                        {campaign.status}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-sm text-slate-700 mb-4 italic">{campaign.message}</p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-2 bg-slate-50 rounded">
                      <p className="text-xs text-slate-600">Total</p>
                      <p className="text-lg font-bold">{campaign.total}</p>
                    </div>
                    <div className="p-2 bg-green-50 rounded">
                      <p className="text-xs text-slate-600">Enviadas</p>
                      <p className="text-lg font-bold text-green-600">{campaign.sent}</p>
                    </div>
                    <div className="p-2 bg-yellow-50 rounded">
                      <p className="text-xs text-slate-600">Faltam</p>
                      <p className="text-lg font-bold text-yellow-600">{campaign.pending}</p>
                    </div>
                    <div className="p-2 bg-red-50 rounded">
                      <p className="text-xs text-slate-600">Falhas</p>
                      <p className="text-lg font-bold text-red-600">{campaign.failed}</p>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Taxa: {campaign.rate}</span>
                    <span>Criada em: {campaign.created}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
