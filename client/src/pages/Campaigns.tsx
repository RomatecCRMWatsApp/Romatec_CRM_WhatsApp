import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface Campaign {
  id: number;
  name: string;
  propertyName: string;
  status: 'running' | 'paused';
  progress: number;
  sent: number;
  failed: number;
  total: number;
  nextCycleIn: string;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([
    {
      id: 1,
      name: 'Campanha Mod_Vaz-01',
      propertyName: 'Mod_Vaz-01',
      status: 'running',
      progress: 52,
      sent: 6,
      failed: 0,
      total: 12,
      nextCycleIn: '00:28:38',
    },
    {
      id: 2,
      name: 'Campanha Mod_Vaz-02',
      propertyName: 'Mod_Vaz-02',
      status: 'running',
      progress: 52,
      sent: 6,
      failed: 0,
      total: 12,
      nextCycleIn: '00:31:22',
    },
  ]);

  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(1);
  const [timers, setTimers] = useState<Record<number, string>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const updated = { ...prev };
        campaigns.forEach(campaign => {
          const time = prev[campaign.id] || campaign.nextCycleIn;
          const [hours, minutes, seconds] = time.split(':').map(Number);
          let totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          if (totalSeconds > 0) {
            totalSeconds--;
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            updated[campaign.id] = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          }
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [campaigns]);

  const toggleCampaign = (id: number) => {
    setCampaigns(campaigns.map(c => 
      c.id === id ? { ...c, status: c.status === 'running' ? 'paused' : 'running' } : c
    ));
  };

  const resetCampaign = (id: number) => {
    setCampaigns(campaigns.map(c => 
      c.id === id ? { ...c, progress: 0, sent: 0, failed: 0 } : c
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">📊 Monitoramento em Tempo Real</h1>
          <p className="text-slate-600">Acompanhe suas campanhas de marketing em tempo real</p>
        </div>

        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="card-modern bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4 pb-4 border-b">
                <div className="flex items-center gap-4 flex-1">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{campaign.propertyName}</h2>
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`w-3 h-3 rounded-full ${campaign.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                      <span className={`font-semibold ${campaign.status === 'running' ? 'text-green-600' : 'text-red-600'}`}>
                        {campaign.status === 'running' ? 'Enviando' : 'Pausado'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-green-600">{timers[campaign.id] || campaign.nextCycleIn}</div>
                    <p className="text-sm text-slate-600">Cronômetro (1 hora)</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-slate-700">Progresso do Ciclo</span>
                  <span className="text-2xl font-bold text-slate-900">{campaign.progress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${campaign.progress}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600">Enviadas</p>
                  <p className="text-3xl font-bold text-blue-600">{campaign.sent}/{campaign.total}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600">Faltam</p>
                  <p className="text-3xl font-bold text-red-600">{campaign.total - campaign.sent}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600">Ciclo Atual</p>
                  <p className="text-3xl font-bold text-purple-600">1/12</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-slate-600">Taxa do Dia</p>
                  <p className="text-3xl font-bold text-green-600">0.0%</p>
                  <p className="text-xs text-slate-600">Meta: 12 msg/dia</p>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 mb-6 border-l-4 border-purple-500">
                <p className="text-sm text-slate-600">⏳ Próximo Ciclo em:</p>
                <p className="text-3xl font-bold text-purple-600">{timers[campaign.id] || campaign.nextCycleIn}</p>
              </div>

              <div className="text-sm text-slate-600 mb-6 pb-6 border-b">
                <p>🚀 Iniciado: 22:52:33 | 📊 Ciclos: 12 ciclos de 1 hora = 12 horas</p>
              </div>

              <div className="mb-6">
                <button
                  onClick={() => setExpandedCampaign(expandedCampaign === campaign.id ? null : campaign.id)}
                  className="w-full flex items-center justify-between bg-purple-100 hover:bg-purple-200 rounded-lg p-4 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📱</span>
                    <div className="text-left">
                      <p className="font-semibold text-slate-900">Contatos ({campaign.sent}/{campaign.total})</p>
                      <p className="text-sm text-slate-600">{campaign.sent} enviados • {campaign.total - campaign.sent} aguardando</p>
                    </div>
                  </div>
                  {expandedCampaign === campaign.id ? <ChevronUp /> : <ChevronDown />}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => toggleCampaign(campaign.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 font-semibold rounded-xl transition-all duration-200 transform text-white ${
                    campaign.status === 'running' 
                      ? 'bg-gradient-to-br from-yellow-500 to-orange-600' 
                      : 'bg-gradient-to-br from-green-500 to-emerald-600'
                  }`}
                  style={{
                    boxShadow: '0 8px 0 rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {campaign.status === 'running' ? (
                    <>
                      <Pause size={20} /> Pausar
                    </>
                  ) : (
                    <>
                      <Play size={20} /> Iniciar
                    </>
                  )}
                </button>
                <button
                  onClick={() => resetCampaign(campaign.id)}
                  className="px-6 py-3 font-semibold rounded-xl transition-all duration-200 transform text-white bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center gap-2"
                  style={{
                    boxShadow: '0 8px 0 rgba(0, 0, 0, 0.15)',
                  }}
                >
                  <RotateCcw size={20} /> Reset
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
