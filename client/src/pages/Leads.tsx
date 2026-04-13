import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, Search, Filter, Users, TrendingUp, Flame, Thermometer,
  Snowflake, ChevronDown, ChevronUp, MessageSquare, Trash2, RefreshCw,
  Phone, Clock, CheckCircle2, XCircle, AlertCircle, Send, BarChart3, Eye
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return phone;
}
function timeAgo(date: string | Date | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}
function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    nao_iniciado: 'Não iniciado', abordagem_enviada: 'Abordagem enviada',
    qual_etapa_1: 'Perg. 1 — Nome', qual_etapa_2: 'Perg. 2 — Renda',
    qual_etapa_3: 'Perg. 3 — Financiamento', qual_etapa_4: 'Perg. 4 — FGTS',
    qual_etapa_5: 'Perg. 5 — Entrada', qual_etapa_6: 'Perg. 6 — Tipo imóvel',
    qual_etapa_7: 'Perg. 7 — Região', qual_etapa_8: 'Perg. 8 — Valor',
    qual_etapa_9: 'Perg. 9 — Moradia/Invest.', qual_etapa_10: 'Perg. 10 — Prazo',
    qualificado: 'Qualificado ✓', proposta_enviada: 'Proposta enviada',
    visita_agendada: 'Visita agendada', sem_interesse: 'Sem interesse',
    descartado: 'Descartado', concluido: 'Concluído',
  };
  return map[stage] || stage;
}
function stageProgress(stage: string): number {
  const steps: Record<string, number> = {
    nao_iniciado: 0, abordagem_enviada: 5,
    qual_etapa_1: 15, qual_etapa_2: 25, qual_etapa_3: 35, qual_etapa_4: 45,
    qual_etapa_5: 55, qual_etapa_6: 65, qual_etapa_7: 70, qual_etapa_8: 78,
    qual_etapa_9: 85, qual_etapa_10: 92,
    qualificado: 100, proposta_enviada: 100, visita_agendada: 100,
    sem_interesse: 0, descartado: 0, concluido: 100,
  };
  return steps[stage] ?? 0;
}

const SCORE_CFG = {
  quente: { label: 'Quente',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   icon: '🔥', glow: '0 0 12px rgba(239,68,68,0.3)' },
  morno:  { label: 'Morno',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  icon: '🌡️', glow: '0 0 12px rgba(245,158,11,0.25)' },
  frio:   { label: 'Frio',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  icon: '❄️', glow: '' },
};

export default function Leads() {
  const [, navigate] = useLocation();
  const [scoreFilter, setScoreFilter] = useState<'all' | 'quente' | 'morno' | 'frio'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sendMsg, setSendMsg] = useState<{ id: number; phone: string; name: string } | null>(null);
  const [msgText, setMsgText] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setOffset(0); }, [scoreFilter, debouncedSearch]);

  const { data, isLoading, refetch } = trpc.leads.list.useQuery({
    score: scoreFilter,
    search: debouncedSearch || undefined,
    limit: LIMIT,
    offset,
  }, { refetchInterval: 30000 });

  const updateScore = trpc.leads.updateScore.useMutation({
    onSuccess: () => { toast.success('Score atualizado!'); refetch(); },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const discardLead = trpc.leads.discard.useMutation({
    onSuccess: () => { toast.success('Lead descartado'); refetch(); },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const reactivateLead = trpc.leads.reactivate.useMutation({
    onSuccess: () => { toast.success('Lead reativado!'); refetch(); },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const sendWhatsApp = trpc.leads.sendWhatsApp.useMutation({
    onSuccess: (r) => {
      if ((r as any).success) { toast.success('Mensagem enviada!'); setSendMsg(null); setMsgText(''); }
      else toast.error('Falha no envio');
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const testTelegram = trpc.testTelegram.useMutation({
    onSuccess: (r) => {
      if (r.success) toast.success(r.message || 'Telegram enviado!');
      else toast.error(`Telegram erro: ${(r as any).error}`);
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const leads = data?.leads || [];
  const stats = data?.stats;
  const total = data?.total || 0;

  const STAT_CARDS = [
    { label: 'Total leads',  value: stats?.total || 0,      color: '#8b5cf6', icon: Users },
    { label: '🔥 Quentes',   value: stats?.quente || 0,     color: '#ef4444', icon: Flame },
    { label: '🌡️ Mornos',   value: stats?.morno || 0,      color: '#f59e0b', icon: Thermometer },
    { label: '❄️ Frios',    value: stats?.frio || 0,       color: '#3b82f6', icon: Snowflake },
    { label: 'Em andamento', value: stats?.emAndamento || 0, color: '#3ec87a', icon: TrendingUp },
    { label: 'Descartados',  value: stats?.descartado || 0, color: '#6b7280', icon: XCircle },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#080f0a', color: '#e8f5e9' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0a1f11 0%, #163322 50%, #0a1f11 100%)',
        borderBottom: '1px solid #1a3520', padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} style={{
            width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: '#5a9a6a',
          }}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 style={{ fontSize: '17px', fontWeight: 600, color: '#e8f5e9', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Users size={16} style={{ color: '#3ec87a' }} />
              Gestão de Leads
            </h1>
            <p style={{ fontSize: '11px', color: '#3a6a45', margin: '2px 0 0' }}>
              Qualificados pelo bot • Score em tempo real
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => testTelegram.mutate()} disabled={testTelegram.isPending} style={{
            padding: '6px 14px', borderRadius: '8px', background: 'rgba(38,169,224,0.1)',
            border: '1px solid rgba(38,169,224,0.25)', color: '#26a9e0', fontSize: '11px',
            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
            opacity: testTelegram.isPending ? 0.6 : 1,
          }}>
            ✈️ {testTelegram.isPending ? 'Enviando...' : 'Testar Telegram'}
          </button>
          <button onClick={() => refetch()} style={{
            padding: '6px 14px', borderRadius: '8px', background: 'rgba(62,200,122,0.1)',
            border: '1px solid rgba(62,200,122,0.2)', color: '#3ec87a', fontSize: '11px',
            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ld-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .ld-card { background:#0d1f12; border:1px solid #1a3520; border-radius:12px; padding:16px; }
        .ld-score-btn { border:none; cursor:pointer; border-radius:6px; font-size:10px; font-weight:700;
          padding:3px 8px; transition:all 0.15s; letter-spacing:0.05em; }
        .ld-action-btn { border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;
          padding:6px 12px; border:1px solid; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s; }
      `}</style>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ── Stats cards ──────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '8px' }}>
          {STAT_CARDS.map(sc => (
            <div key={sc.label} style={{
              background: '#0d1f12', border: '1px solid #1a3520', borderRadius: '10px',
              padding: '12px 8px', textAlign: 'center',
            }}>
              <p style={{ fontSize: '9px', color: '#3a5a40', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
                {sc.label}
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: sc.color, margin: 0 }}>{sc.value}</p>
            </div>
          ))}
        </div>

        {/* ── Filters ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#3a6a45' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              style={{
                width: '100%', padding: '8px 10px 8px 30px', background: '#0d1f12',
                border: '1px solid #1a3520', borderRadius: '8px', color: '#c8f0d0',
                fontSize: '12px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {/* Score filter pills */}
          {(['all', 'quente', 'morno', 'frio'] as const).map(s => {
            const active = scoreFilter === s;
            const cfg = s !== 'all' ? SCORE_CFG[s] : null;
            return (
              <button
                key={s}
                onClick={() => setScoreFilter(s)}
                style={{
                  padding: '7px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.15s',
                  background: active ? (cfg?.bg || 'rgba(62,200,122,0.15)') : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? (cfg?.border || 'rgba(62,200,122,0.3)') : 'rgba(255,255,255,0.08)'}`,
                  color: active ? (cfg?.color || '#3ec87a') : '#4a7a55',
                  boxShadow: active && cfg ? cfg.glow : 'none',
                }}
              >
                {s === 'all' ? 'Todos' : `${cfg?.icon} ${cfg?.label}`}
              </button>
            );
          })}
        </div>

        {/* ── Lead list ────────────────────────────────────────────── */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#3a6a45' }}>Carregando leads...</div>
        ) : leads.length === 0 ? (
          <div className="ld-card" style={{ textAlign: 'center', padding: '40px' }}>
            <Users size={32} style={{ color: '#1a3520', margin: '0 auto 12px' }} />
            <p style={{ color: '#3a5a40', fontSize: '14px' }}>Nenhum lead encontrado</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {leads.map((lead: any) => {
              const sc = SCORE_CFG[lead.score as keyof typeof SCORE_CFG] || SCORE_CFG.frio;
              const isExpanded = expandedId === lead.id;
              const progress = stageProgress(lead.stage || '');
              const isDescartado = lead.stage === 'descartado' || lead.stage === 'sem_interesse';
              const isBlocked = lead.blockedUntil && new Date(lead.blockedUntil) > new Date();
              const nome = lead.contactName || lead.nome || (lead.answers as any)?.nome || 'Sem nome';
              const answers = lead.answers as any || {};

              return (
                <div
                  key={lead.id}
                  style={{
                    background: '#0d1f12',
                    border: `1px solid ${isDescartado ? '#1a2a1c' : sc.border}`,
                    borderLeft: `3px solid ${isDescartado ? '#2a3a2c' : sc.color}`,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    opacity: isDescartado ? 0.6 : 1,
                    boxShadow: !isDescartado && lead.score === 'quente' ? sc.glow : 'none',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  {/* ── Card header ── */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Score badge */}
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                      background: sc.bg, border: `1px solid ${sc.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px',
                    }}>
                      {sc.icon}
                    </div>

                    {/* Name + phone */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#d8f0dc' }}>{nome}</span>
                        <span style={{
                          fontSize: '9px', padding: '2px 7px', borderRadius: '8px', fontWeight: 700,
                          background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          {sc.label}
                        </span>
                        {isBlocked && (
                          <span style={{
                            fontSize: '9px', padding: '2px 7px', borderRadius: '8px',
                            background: 'rgba(100,100,100,0.15)', border: '1px solid rgba(100,100,100,0.25)',
                            color: '#888', fontWeight: 700,
                          }}>BLOQUEADO</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#4a7a55', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={10} /> {formatPhone(lead.phone)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={10} /> {timeAgo(lead.updatedAt)}
                        </span>
                        {lead.campaignName && (
                          <span style={{ color: '#2a5a35' }}>📢 {lead.campaignName}</span>
                        )}
                      </div>
                    </div>

                    {/* Stage + progress */}
                    <div style={{ textAlign: 'right', minWidth: '140px' }}>
                      <p style={{ fontSize: '10px', color: '#4a7a55', margin: '0 0 4px' }}>{stageLabel(lead.stage || '')}</p>
                      <div style={{ height: '4px', background: '#0a1a0f', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '3px', transition: 'width 0.3s',
                          width: `${progress}%`,
                          background: progress === 100 ? '#3ec87a' : isDescartado ? '#4a4a4a' : 'linear-gradient(90deg, #1e6b30, #3ec87a)',
                        }} />
                      </div>
                      <p style={{ fontSize: '9px', color: '#2a4a30', margin: '2px 0 0' }}>{progress}% qualificado</p>
                    </div>

                    {/* Expand button */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                      style={{
                        width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#4a7a55',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {/* ── Expanded detail ── */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #1a3520', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                      {/* Answers grid */}
                      {Object.keys(answers).length > 0 && (
                        <div>
                          <p style={{ fontSize: '10px', color: '#3a6a45', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', fontWeight: 700 }}>
                            Respostas da qualificação
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
                            {[
                              { key: 'nome', label: 'Nome' },
                              { key: 'rendaMensal', label: 'Renda mensal' },
                              { key: 'financiamentoAtivo', label: 'Financiamento ativo?' },
                              { key: 'fgtsDisponivel', label: 'FGTS disponível?' },
                              { key: 'entradaDisponivel', label: 'Entrada disponível' },
                              { key: 'tipoImovelBusca', label: 'Tipo de imóvel' },
                              { key: 'regiaoBairro', label: 'Região/bairro' },
                              { key: 'valorImovelPretendido', label: 'Valor pretendido' },
                              { key: 'isMoradiaOuInvestimento', label: 'Moradia ou investimento?' },
                              { key: 'prazoPrefido', label: 'Prazo para fechar' },
                            ].filter(f => answers[f.key]).map(field => (
                              <div key={field.key} style={{
                                background: '#080f0a', border: '1px solid #162a1c',
                                borderRadius: '7px', padding: '7px 10px',
                              }}>
                                <p style={{ fontSize: '9px', color: '#2a5a35', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {field.label}
                                </p>
                                <p style={{ fontSize: '12px', color: '#a8d5b0', margin: 0, fontWeight: 500 }}>
                                  {answers[field.key]}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Discard reason */}
                      {lead.discardReason && (
                        <div style={{
                          padding: '8px 12px', background: 'rgba(100,60,60,0.1)',
                          border: '1px solid rgba(200,80,80,0.2)', borderRadius: '7px',
                          fontSize: '11px', color: '#c87070',
                        }}>
                          <strong>Motivo do descarte:</strong> {lead.discardReason}
                          {lead.blockedUntil && <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                            (bloqueado até {new Date(lead.blockedUntil).toLocaleDateString('pt-BR')})
                          </span>}
                        </div>
                      )}

                      {/* Action bar */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                        {/* WhatsApp */}
                        <button
                          className="ld-action-btn"
                          onClick={() => { setSendMsg({ id: lead.id, phone: lead.phone, name: nome }); setMsgText(''); }}
                          style={{ background: 'rgba(37,211,102,0.1)', borderColor: 'rgba(37,211,102,0.25)', color: '#25d366' }}
                        >
                          <MessageSquare size={11} /> WhatsApp
                        </button>

                        {/* WhatsApp link direto */}
                        <a
                          href={`https://wa.me/${lead.phone.replace(/\D/g,'')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ld-action-btn"
                          style={{ textDecoration: 'none', background: 'rgba(37,211,102,0.06)', borderColor: 'rgba(37,211,102,0.15)', color: '#25d366', fontSize: '11px', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                        >
                          <Phone size={11} /> Abrir chat
                        </a>

                        {/* Change score */}
                        {(['quente', 'morno', 'frio'] as const).map(s => {
                          const cfg = SCORE_CFG[s];
                          const isCurrent = lead.score === s;
                          return (
                            <button
                              key={s}
                              className="ld-score-btn"
                              disabled={isCurrent || updateScore.isPending}
                              onClick={() => updateScore.mutate({ id: lead.id, score: s })}
                              style={{
                                background: isCurrent ? cfg.bg : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${isCurrent ? cfg.border : 'rgba(255,255,255,0.1)'}`,
                                color: isCurrent ? cfg.color : '#4a7a55',
                                opacity: isCurrent ? 1 : 0.7,
                                cursor: isCurrent ? 'default' : 'pointer',
                              }}
                            >
                              {cfg.icon} {cfg.label}
                            </button>
                          );
                        })}

                        {/* Reactivate or Discard */}
                        {isDescartado || isBlocked ? (
                          <button
                            className="ld-action-btn"
                            onClick={() => reactivateLead.mutate({ id: lead.id })}
                            disabled={reactivateLead.isPending}
                            style={{ background: 'rgba(62,200,122,0.08)', borderColor: 'rgba(62,200,122,0.2)', color: '#3ec87a' }}
                          >
                            <RefreshCw size={11} /> Reativar
                          </button>
                        ) : (
                          <button
                            className="ld-action-btn"
                            onClick={() => { if (confirm(`Descartar lead ${nome}?`)) discardLead.mutate({ id: lead.id }); }}
                            disabled={discardLead.isPending}
                            style={{ background: 'rgba(200,60,60,0.08)', borderColor: 'rgba(200,60,60,0.2)', color: '#e07070' }}
                          >
                            <Trash2 size={11} /> Descartar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────── */}
        {total > LIMIT && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', paddingTop: '4px' }}>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              style={{ padding: '7px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#4a7a55', cursor: offset === 0 ? 'not-allowed' : 'pointer', opacity: offset === 0 ? 0.4 : 1 }}
            >
              ← Anterior
            </button>
            <span style={{ padding: '7px 14px', fontSize: '11px', color: '#3a6a45' }}>
              {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
            </span>
            <button
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
              style={{ padding: '7px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#4a7a55', cursor: offset + LIMIT >= total ? 'not-allowed' : 'pointer', opacity: offset + LIMIT >= total ? 0.4 : 1 }}
            >
              Próxima →
            </button>
          </div>
        )}
      </div>

      {/* ── Send WhatsApp Modal ──────────────────────────────────────── */}
      {sendMsg && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
        }} onClick={e => { if (e.target === e.currentTarget) setSendMsg(null); }}>
          <div style={{
            background: '#0d1f12', border: '1px solid #1a3520', borderRadius: '16px',
            padding: '24px', width: '100%', maxWidth: '480px',
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#d8f0dc', margin: '0 0 4px' }}>
              Enviar mensagem WhatsApp
            </h3>
            <p style={{ fontSize: '11px', color: '#3a6a45', margin: '0 0 16px' }}>
              Para: <strong style={{ color: '#5aa870' }}>{sendMsg.name}</strong> ({formatPhone(sendMsg.phone)})
            </p>
            <textarea
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              placeholder="Digite a mensagem..."
              rows={5}
              style={{
                width: '100%', padding: '10px 12px', background: '#080f0a',
                border: '1px solid #1a3520', borderRadius: '8px', color: '#c8f0d0',
                fontSize: '13px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSendMsg(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#6a8a70', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                disabled={!msgText.trim() || sendWhatsApp.isPending}
                onClick={() => sendWhatsApp.mutate({ phone: sendMsg.phone, message: msgText.trim() })}
                style={{
                  padding: '8px 20px', borderRadius: '8px', background: 'rgba(37,211,102,0.15)',
                  border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', fontWeight: 700,
                  cursor: 'pointer', opacity: !msgText.trim() || sendWhatsApp.isPending ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <Send size={13} />
                {sendWhatsApp.isPending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
