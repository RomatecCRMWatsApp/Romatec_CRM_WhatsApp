import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bot, Send, Activity, Github, Server, Database,
  Play, Square, RefreshCw, ChevronDown, ChevronRight,
  Users, TrendingUp, MessageSquare, Zap, Brain, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';

// ── Paleta dark green ─────────────────────────────────────────────────────────
const COLORS = {
  bg:       '#0f1a14',
  bg2:      '#1a3a2f',
  bg3:      '#2d5a42',
  neon:     '#00ff88',
  neonDim:  'rgba(0,255,136,0.12)',
  gold:     '#c9a84c',
  text:     '#d4f0e0',
  textDim:  '#7aab8a',
  red:      '#ff4444',
  orange:   '#ff8c00',
};

interface ChatMessage {
  role:       'user' | 'assistant';
  content:    string;
  toolsUsed?: string[];
  timestamp:  Date;
}

// ── StatusCard component ──────────────────────────────────────────────────────
function StatusCard({ icon: Icon, title, value, sub, color = COLORS.neon }: {
  icon:   React.ElementType;
  title:  string;
  value:  string | number;
  sub?:   string;
  color?: string;
}) {
  return (
    <div style={{
      background: COLORS.bg2,
      border: `1px solid ${COLORS.neonDim}`,
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon size={14} color={COLORS.textDim} />
        <span style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.textDim }}>{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Zaira() {
  const [input, setInput]         = useState('');
  const [messages, setMessages]   = useState<ChatMessage[]>([{
    role:      'assistant',
    content:   '👋 Olá! Sou **ZAIRA** — Agente Autônomo da Romatec.\n\nTenho acesso direto ao:\n• 🗄️ MySQL (contatos, leads, campanhas)\n• 🐙 GitHub (código, commits, issues)\n• 🚂 Railway (produção, logs)\n• 🧠 Base de Conhecimento Romatec\n\nPergunte-me qualquer coisa sobre o sistema!',
    timestamp: new Date(),
  }]);
  const [activeTab, setActiveTab] = useState<'chat' | 'status' | 'logs' | 'knowledge'>('chat');
  const [logSearch, setLogSearch] = useState('');
  const scrollRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // ── tRPC queries ──────────────────────────────────────────────────────────
  const chatMutation        = trpc.zaira.chat.useMutation();
  const clearMutation       = trpc.zaira.clearHistory.useMutation();
  const startMutation       = trpc.zaira.startAgent.useMutation();
  const stopMutation        = trpc.zaira.stopAgent.useMutation();

  const { data: statusData, refetch: refetchStatus, isLoading: statusLoading } =
    trpc.zaira.getSystemStatus.useQuery(undefined, { refetchInterval: 30000 });

  const { data: logsData, refetch: refetchLogs } =
    trpc.zaira.getOperationHistory.useQuery({ limit: 100 }, { refetchInterval: 15000 });

  const { data: knowledgeData } =
    trpc.zaira.getKnowledgeBase.useQuery(
      { search: logSearch || undefined },
      { enabled: activeTab === 'knowledge' },
    );

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);

    try {
      const result = await chatMutation.mutateAsync({ message: text });
      setMessages(prev => [...prev, {
        role:      'assistant',
        content:   result.response,
        toolsUsed: result.toolsUsed,
        timestamp: new Date(),
      }]);
    } catch (err) {
      toast.error('Erro ao contatar ZAIRA. Verifique ANTHROPIC_API_KEY no Railway.');
      setMessages(prev => [...prev, {
        role:      'assistant',
        content:   '❌ Erro de comunicação. Verifique se `ANTHROPIC_API_KEY` está configurado no Railway.',
        timestamp: new Date(),
      }]);
    }
    inputRef.current?.focus();
  }, [input, chatMutation]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Escape HTML entities ANTES de aplicar markdown — impede XSS via resposta
  // do bot (ex: usuário injeta <script> em mensagem que volta pro chat).
  const escapeHtml = (s: string): string =>
    s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));

  const renderMarkdown = (text: string) => {
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, `<code style="background:${COLORS.bg3};padding:1px 4px;border-radius:3px;font-size:12px">$1</code>`)
      .replace(/\n/g, '<br/>');
  };

  const db = statusData?.database as any;
  const ry = statusData?.railway  as any;
  const gh = statusData?.github   as any;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div style={{ background: COLORS.bg, minHeight: '100dvh', color: COLORS.text, fontFamily: 'system-ui, sans-serif' }}>

        {/* ── Header ── */}
        <div style={{ background: COLORS.bg2, borderBottom: `1px solid ${COLORS.neonDim}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: COLORS.bg3, border: `2px solid ${COLORS.neon}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 12px rgba(0,255,136,0.3)` }}>
            <Bot size={18} color={COLORS.neon} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, letterSpacing: 2, color: COLORS.neon, fontSize: 14 }}>ZAIRA</div>
            <div style={{ fontSize: 10, color: COLORS.textDim }}>Agente Autônomo — Romatec CRM</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusData?.agentRunning ? COLORS.neon : COLORS.red, boxShadow: statusData?.agentRunning ? `0 0 6px ${COLORS.neon}` : undefined }} />
            <span style={{ fontSize: 10, color: COLORS.textDim }}>{statusData?.agentRunning ? 'online' : 'parado'}</span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.neonDim}`, background: COLORS.bg }}>
          {(['chat', 'status', 'logs', 'knowledge'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '10px 4px', fontSize: 11, fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? COLORS.neon : COLORS.textDim,
              background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1,
              borderBottom: activeTab === tab ? `2px solid ${COLORS.neon}` : '2px solid transparent',
              transition: 'all 0.2s',
            }}>
              {{ chat: '💬 Chat', status: '📊 Status', logs: '📋 Logs', knowledge: '🧠 Base' }[tab]}
            </button>
          ))}
        </div>

        {/* ══ TAB: CHAT ══ */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)' }}>
            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: 8, maxWidth: '85%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: COLORS.bg3, border: `1px solid ${COLORS.neon}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Bot size={13} color={COLORS.neon} />
                    </div>
                  )}
                  <div>
                    <div style={{
                      padding: '9px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.55,
                      background: msg.role === 'user' ? COLORS.bg3 : 'rgba(0,255,136,0.06)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.18)'}`,
                      color: msg.role === 'assistant' ? COLORS.text : COLORS.text,
                      borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                      borderBottomLeftRadius:  msg.role === 'assistant' ? 4 : 14,
                    }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {msg.toolsUsed.map(t => (
                          <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(0,255,136,0.1)', color: COLORS.neon, border: `1px solid ${COLORS.neonDim}` }}>
                            🔧 {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: COLORS.bg3, border: `1px solid ${COLORS.neon}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={13} color={COLORS.neon} />
                  </div>
                  <div style={{ padding: '9px 13px', borderRadius: 14, background: 'rgba(0,255,136,0.06)', border: `1px solid rgba(0,255,136,0.18)`, display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.neon, opacity: 0.6, animation: `pulse 1.2s ${i * 0.4}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick commands */}
            <div style={{ padding: '8px 16px 4px', display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }}>
              {['Status do sistema', 'Leads quentes', 'Campanhas ativas', 'GitHub status', 'Produção online?'].map(cmd => (
                <button key={cmd} onClick={() => { setInput(cmd); inputRef.current?.focus(); }} style={{
                  flexShrink: 0, padding: '5px 10px', borderRadius: 16, fontSize: 11,
                  background: 'transparent', border: `1px solid ${COLORS.neonDim}`,
                  color: COLORS.textDim, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  {cmd}
                </button>
              ))}
            </div>

            {/* Input */}
            <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8, flexShrink: 0 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pergunte para ZAIRA..."
                disabled={chatMutation.isPending}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 24,
                  background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`,
                  color: COLORS.text, outline: 'none', fontSize: 13,
                }}
              />
              <button
                onClick={() => void sendMessage()}
                disabled={chatMutation.isPending || !input.trim()}
                style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                  background: COLORS.neon, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: chatMutation.isPending || !input.trim() ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <Send size={16} color={COLORS.bg} />
              </button>
            </div>
          </div>
        )}

        {/* ══ TAB: STATUS ══ */}
        {activeTab === 'status' && (
          <div style={{ padding: '16px', overflowY: 'auto', maxHeight: 'calc(100dvh - 120px)' }}>
            {/* Agent controls */}
            <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 12, color: COLORS.neon, letterSpacing: 1 }}>CONTROLE DO AGENTE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => { await startMutation.mutateAsync(); void refetchStatus(); toast.success('Zaira iniciada!'); }} disabled={startMutation.isPending}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'rgba(0,255,136,0.12)', border: `1px solid ${COLORS.neon}`, color: COLORS.neon, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <Play size={12} style={{ display: 'inline', marginRight: 4 }} /> Iniciar
                </button>
                <button onClick={async () => { await stopMutation.mutateAsync(); void refetchStatus(); toast.info('Zaira pausada.'); }} disabled={stopMutation.isPending}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'rgba(255,68,68,0.1)', border: `1px solid ${COLORS.red}`, color: COLORS.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <Square size={12} style={{ display: 'inline', marginRight: 4 }} /> Pausar
                </button>
                <button onClick={() => { void refetchStatus(); }} style={{ padding: '9px 12px', borderRadius: 8, background: COLORS.bg3, border: `1px solid ${COLORS.neonDim}`, color: COLORS.textDim, cursor: 'pointer' }}>
                  <RefreshCw size={13} />
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim }}>
                Autonomia: <span style={{ color: COLORS.neon, fontWeight: 600 }}>{statusData?.autonomyLevel ?? '—'}%</span> &nbsp;|&nbsp;
                Status: <span style={{ color: statusData?.agentRunning ? COLORS.neon : COLORS.red, fontWeight: 600 }}>{statusData?.agentRunning ? '● Ativo' : '○ Parado'}</span>
              </div>
            </div>

            {/* Database stats */}
            {db && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>🗄️ Database MySQL</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <StatusCard icon={Users}         title="Contatos"     value={db.contacts?.total ?? '—'} sub={`${db.contacts?.active ?? 0} ativos`} />
                  <StatusCard icon={TrendingUp}     title="Leads"        value={db.leads?.total ?? '—'}    sub={`${db.leads?.quente ?? 0} quentes 🔥`} color={db.leads?.quente > 0 ? COLORS.orange : COLORS.neon} />
                  <StatusCard icon={MessageSquare}  title="Msgs Hoje"    value={db.messages?.today ?? '—'} sub={`${db.messages?.sent ?? 0} total enviadas`} />
                  <StatusCard icon={Activity}       title="Campanhas"    value={db.campaigns?.running ?? '—'} sub="em execução" color={db.campaigns?.running > 0 ? COLORS.neon : COLORS.textDim} />
                </div>
              </div>
            )}

            {/* Railway status */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>🚂 Railway Produção</div>
              <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`, borderRadius: 12, padding: 14 }}>
                {ry ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: ry.online ? COLORS.neon : COLORS.red }} />
                      <span style={{ fontWeight: 600, color: ry.online ? COLORS.neon : COLORS.red }}>{ry.online ? 'Online' : 'Offline'}</span>
                      {ry.online && <span style={{ fontSize: 11, color: COLORS.textDim }}>{ry.ping}ms</span>}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>{ry.url}</div>
                    {ry.error && <div style={{ fontSize: 11, color: COLORS.red, marginTop: 4 }}>{ry.error}</div>}
                  </>
                ) : (
                  <div style={{ color: COLORS.textDim, fontSize: 12 }}>Verificando...</div>
                )}
              </div>
            </div>

            {/* GitHub status */}
            {gh?.available && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>🐙 GitHub</div>
                <div style={{ background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 600, color: COLORS.neon, marginBottom: 6, fontSize: 13 }}>{gh.name}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>Issues abertas: {gh.openIssues ?? 0}</div>
                  {(gh.recentCommits ?? []).slice(0, 3).map((c: any, i: number) => (
                    <div key={i} style={{ padding: '5px 0', borderTop: i > 0 ? `1px solid ${COLORS.neonDim}` : undefined }}>
                      <div style={{ fontSize: 12, color: COLORS.text }}>{c.message}</div>
                      <div style={{ fontSize: 10, color: COLORS.textDim }}>{c.sha} · {c.author}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clear chat */}
            <button onClick={async () => { await clearMutation.mutateAsync(); setMessages([{ role: 'assistant', content: '🧹 Histórico de conversa limpo!', timestamp: new Date() }]); toast.success('Histórico limpo.'); }}
              style={{ width: '100%', padding: '10px', borderRadius: 8, background: 'transparent', border: `1px solid ${COLORS.neonDim}`, color: COLORS.textDim, cursor: 'pointer', fontSize: 12 }}>
              🗑️ Limpar histórico de conversa
            </button>
          </div>
        )}

        {/* ══ TAB: LOGS ══ */}
        {activeTab === 'logs' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${COLORS.neonDim}`, display: 'flex', gap: 8 }}>
              <button onClick={() => void refetchLogs()} style={{ padding: '6px 12px', borderRadius: 8, background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`, color: COLORS.textDim, cursor: 'pointer', fontSize: 11 }}>
                <RefreshCw size={11} style={{ display: 'inline', marginRight: 4 }} /> Atualizar
              </button>
              <span style={{ fontSize: 11, color: COLORS.textDim, alignSelf: 'center' }}>{logsData?.length ?? 0} registros</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {(logsData ?? []).map((log: any) => (
                <div key={log.id} style={{
                  padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                  background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`,
                  borderLeft: `3px solid ${({ info: COLORS.neon, warn: COLORS.orange, error: COLORS.red, success: COLORS.neon } as Record<string, string>)[log.level as string] ?? COLORS.neon}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase' }}>{log.type}</span>
                    <span style={{ fontSize: 10, color: COLORS.textDim }}>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 2 }}>{log.description}</div>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{log.result}</div>
                </div>
              ))}
              {(!logsData || logsData.length === 0) && (
                <div style={{ textAlign: 'center', color: COLORS.textDim, marginTop: 40, fontSize: 13 }}>
                  Nenhum log ainda.<br />Inicie o agente na aba Status.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TAB: KNOWLEDGE ══ */}
        {activeTab === 'knowledge' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${COLORS.neonDim}` }}>
              <input
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Buscar na base de conhecimento..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 20, background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}`, color: COLORS.text, outline: 'none', fontSize: 12 }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {(knowledgeData ?? []).map((k: any) => (
                <div key={k.id} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 10, background: COLORS.bg2, border: `1px solid ${COLORS.neonDim}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.neon }}>{k.title}</span>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,255,136,0.1)', color: COLORS.neon, border: `1px solid ${COLORS.neonDim}`, textTransform: 'uppercase' }}>{k.category}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.5 }}>{k.content}</div>
                  <div style={{ marginTop: 6, fontSize: 10, color: COLORS.bg3 }}>{k.tags}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }
      `}</style>
    </DashboardLayout>
  );
}
