import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bot, FileText, Image as ImageIcon, Loader2, Power, RotateCcw, Save, Send, Upload } from "lucide-react";
import { MIDIAS, ROTULO_MIDIA, type CodigoMidia } from "@shared/autoresposta";

const VARIAVEIS = "{{nome}} {{corretor}} {{creci}} {{telefone_corretor}} {{disponiveis}} {{lote}} {{link_oferta}} {{area}} {{preco}} {{avista}} {{desconto_avista}} {{entrada}} {{entrada_parcelas}} {{entrada_parcela}} {{entrada_avista}} {{saldo}} {{juros_aa}} {{juros_am}} {{prazo_maior}} {{parcela_maior}} {{total_prazo}} {{p12}} {{p24}} {{p36}} {{p60}} {{p120}} {{tabela_prazos}} {{validade_condicao}}";
const dataHora = (d: string | Date | null) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const paraBase64 = (f: File) => new Promise<string>((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] ?? ""); r.onerror = () => erro(r.error); r.readAsDataURL(f); });

/** Balão no estilo WhatsApp (negrito/itálico de *x* e _x_) */
function Balao({ texto }: { texto: string }) {
  const html = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|\s)_([^_\n]+)_/g, "$1<i>$2</i>");
  return <div className="max-w-[460px] whitespace-pre-wrap rounded-lg rounded-tl-none bg-emerald-900/40 px-3 py-2 text-[13px] leading-snug text-foreground" dangerouslySetInnerHTML={{ __html: html }} />;
}

type Texto = { intencao: string; rotulo: string; texto: string; midias: CodigoMidia[]; ativo: boolean; personalizado: boolean; padrao: { texto: string; midias: CodigoMidia[] } };

function EditorTexto({ slug, t, onSalvo }: { slug: string; t: Texto; onSalvo: () => void }) {
  const [texto, setTexto] = useState(t.texto);
  const [midias, setMidias] = useState<CodigoMidia[]>(t.midias);
  const [ativo, setAtivo] = useState(t.ativo);
  useEffect(() => { setTexto(t.texto); setMidias(t.midias); setAtivo(t.ativo); }, [t]);
  const salvar = trpc.autoResposta.salvarTexto.useMutation({ onSuccess: () => { toast.success("Texto salvo"); onSalvo(); }, onError: e => toast.error(e.message) });
  const mudou = texto !== t.texto || midias.join() !== t.midias.join() || ativo !== t.ativo;
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm">
        <span className="font-medium">{t.rotulo}</span>
        {t.personalizado && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">editado</span>}
        {!t.ativo && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">não responde</span>}
        {t.midias.length > 0 && <span className="text-[11px] text-muted-foreground">+ {t.midias.map(m => ROTULO_MIDIA[m]).join(", ")}</span>}
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={Math.min(18, Math.max(5, texto.split("\n").length + 1))}
          className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs" />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">Mídias depois do texto:</span>
          {MIDIAS.map(m => (
            <label key={m} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={midias.includes(m)} onChange={e => setMidias(e.target.checked ? MIDIAS.filter(x => x === m || midias.includes(x)) : midias.filter(x => x !== m))} />
              {ROTULO_MIDIA[m]}
            </label>
          ))}
          <label className="ml-auto inline-flex items-center gap-1"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Responder esta intenção</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!mudou || salvar.isPending} onClick={() => salvar.mutate({ slug, intencao: t.intencao as any, texto, midias, ativo })}><Save className="mr-1 h-3.5 w-3.5" /> Salvar</Button>
          {t.personalizado && <Button size="sm" variant="ghost" disabled={salvar.isPending} onClick={() => { if (confirm("Voltar ao texto padrão?")) salvar.mutate({ slug, intencao: t.intencao as any, texto: t.padrao.texto, midias: t.padrao.midias, ativo: true, restaurar: true }); }}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Voltar ao padrão</Button>}
        </div>
      </div>
    </details>
  );
}

function Midia({ slug, m, onSalvo }: { slug: string; m: { codigo: CodigoMidia; rotulo: string; tipo: string | null; url: string | null; nomeArquivo: string | null }; onSalvo: () => void }) {
  const enviar = trpc.autoResposta.enviarMidia.useMutation({ onSuccess: () => { toast.success("Arquivo trocado"); onSalvo(); }, onError: e => toast.error(e.message) });
  const restaurar = trpc.autoResposta.restaurarMidia.useMutation({ onSuccess: () => { toast.success("Arquivo de partida restaurado"); onSalvo(); }, onError: e => toast.error(e.message) });
  const escolher = async (f: File | undefined) => {
    if (!f) return;
    const mime = f.type === "application/pdf" ? "application/pdf" : f.type === "image/jpeg" ? "image/jpeg" : f.type === "image/png" ? "image/png" : null;
    if (!mime) { toast.error("Envie PNG, JPG ou PDF"); return; }
    if (f.size > (mime === "application/pdf" ? 10 : 5) * 1024 * 1024) { toast.error(`Arquivo grande demais (máx. ${mime === "application/pdf" ? 10 : 5} MB)`); return; }
    enviar.mutate({ slug, codigo: m.codigo, nomeArquivo: f.name, mime, base64: await paraBase64(f) });
  };
  const ocupado = enviar.isPending || restaurar.isPending;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-36 items-center justify-center bg-secondary/30">
        {!m.url ? <span className="text-xs text-amber-300">Sem arquivo</span>
          : m.tipo === "pdf" ? <a href={m.url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 text-xs text-primary"><FileText className="h-10 w-10" />{m.nomeArquivo}</a>
          : <a href={m.url} target="_blank" rel="noreferrer" className="h-full w-full"><img src={m.url} alt={m.rotulo} className="h-full w-full object-contain" /></a>}
      </div>
      <div className="flex items-center gap-1 p-2 text-xs">
        <span className="flex-1 font-medium">{m.rotulo}</span>
        <label className={`inline-flex cursor-pointer items-center rounded-md border border-border px-2 py-1 hover:bg-secondary ${ocupado ? "pointer-events-none opacity-50" : ""}`} title="Trocar arquivo">
          {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          <input type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={e => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <button className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={ocupado} title="Voltar ao arquivo de partida" onClick={() => restaurar.mutate({ slug, codigo: m.codigo })}><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

/**
 * Respostas automáticas no WhatsApp (administrador e secretária): liga/desliga o robô por empreendimento, edita os textos
 * de cada intenção, troca folders e simula a conversa antes de ligar. Desligado, nada muda no atendimento.
 */
export default function RespostasAutomaticas() {
  const [, navigate] = useLocation();
  const { data: emps } = trpc.autoResposta.empreendimentos.useQuery();
  const [slug, setSlug] = useState<string>("");
  useEffect(() => { if (!slug && emps?.length) setSlug((emps.find(e => e.slug === "bom-jardims") ?? emps[0]).slug); }, [emps, slug]);
  const { data, isLoading, error, refetch } = trpc.autoResposta.obter.useQuery({ slug }, { enabled: !!slug });
  const { data: hist } = trpc.autoResposta.historico.useQuery({ slug }, { enabled: !!slug, refetchInterval: 60_000 });
  const [dias, setDias] = useState(30);
  const { data: met } = trpc.autoResposta.metricas.useQuery({ slug, dias }, { enabled: !!slug, refetchInterval: 120_000 });
  const utils = trpc.useUtils();

  const [cfg, setCfg] = useState({ condicaoValidaAte: "", avisoLegal: "", loteAncora: "", entradaParcelas: 6 });
  useEffect(() => {
    if (data) setCfg({ condicaoValidaAte: data.cfg.condicaoValidaAte ?? "", avisoLegal: data.cfg.avisoLegal ?? "", loteAncora: data.cfg.loteAncora ?? "", entradaParcelas: data.cfg.entradaParcelas });
  }, [data]);
  const salvarCfg = trpc.autoResposta.salvarConfig.useMutation({
    onSuccess: (_r, v) => { toast.success(v.ativo === data?.cfg.ativo ? "Configuração salva" : v.ativo ? "Robô LIGADO" : "Robô desligado"); refetch(); utils.autoResposta.empreendimentos.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const gravar = (ativo: boolean) => salvarCfg.mutate({
    slug, ativo, condicaoValidaAte: cfg.condicaoValidaAte || null, avisoLegal: cfg.avisoLegal.trim() || null, loteAncora: cfg.loteAncora.trim() || null, entradaParcelas: cfg.entradaParcelas,
  });

  const [msg, setMsg] = useState("Quanto fica a parcela?");
  const [primeira, setPrimeira] = useState(false);
  const previa = trpc.autoResposta.previa.useMutation({ onError: e => toast.error(e.message) });

  const ligado = !!data?.cfg.ativo;
  return (
    <div>
      <PageHeader icone={Bot} titulo="Respostas automáticas" subtitulo="O robô responde no WhatsApp os leads do empreendimento com os valores do simulador, folders e aviso legal" />
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {(emps ?? []).map(e => (
            <button key={e.slug} onClick={() => { setSlug(e.slug); previa.reset(); }} className={`rounded-full border px-3 py-1 text-xs ${slug === e.slug ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {e.nome}{e.ativo && <span className="ml-1 text-emerald-400">●</span>}
            </button>
          ))}
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}

        {data && (
          <>
            <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${ligado ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card"}`}>
              <Power className={`h-6 w-6 ${ligado ? "text-emerald-400" : "text-muted-foreground"}`} />
              <div className="flex-1">
                <p className="font-semibold">{ligado ? "Robô LIGADO" : "Robô desligado"} · {data.emp.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {ligado ? "Os leads deste empreendimento recebem a resposta automática (8 h às 20 h; fora disso, só o primeiro contato)." : "Nada muda no atendimento: o corretor responde como hoje. Use a prévia abaixo para conferir antes de ligar."}
                  {" "}{data.disponiveis} chácaras disponíveis agora.
                </p>
              </div>
              <Button variant={ligado ? "outline" : "default"} disabled={salvarCfg.isPending || (!ligado && !data.temCondicoes)}
                onClick={() => { if (ligado ? confirm("Desligar o robô? Os leads voltam a ser atendidos só pelo corretor.") : confirm(`Ligar o robô do ${data.emp.nome}? A partir de agora ele responde os leads deste empreendimento no WhatsApp.`)) gravar(!ligado); }}>
                {salvarCfg.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Power className="mr-1 h-4 w-4" />}{ligado ? "Desligar" : "Ligar robô"}
              </Button>
            </div>
            {!data.temCondicoes && <p className="flex items-center gap-2 text-xs text-amber-300"><AlertTriangle className="h-4 w-4" /> Sem condições de pagamento ativas no simulador: o robô não fala de valores e não pode ser ligado.</p>}

            {met && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">Números do robô</p>
                  {[7, 30, 90].map(n => (
                    <button key={n} onClick={() => setDias(n)} className={`rounded-full border px-2 py-0.5 text-[11px] ${dias === n ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{n} dias</button>
                  ))}
                  <a href={`/o/${slug}`} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline">Ver a página de oferta ↗</a>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  {([
                    ["Conversas", met.conversas, "leads que o robô atendeu"],
                    ["Respostas", met.respostas, "mensagens respondidas"],
                    ["Régua", met.regua, `${met.emRegua} leads na régua agora`],
                    ["Links abertos", `${met.linksAbertos}/${met.linksEnviados}`, `${met.aberturas} aberturas no período`],
                    ["Querem fechar", met.querFechar, "passados ao corretor"],
                    ["Pediram visita", met.visitas, "corretor avisado"],
                    ["Com o corretor", met.passaram, "fora do roteiro ou fechamento"],
                    ["Descadastros", met.optout, `${met.foraHorario} fora do horário`],
                  ] as const).map(([r, v, s]) => (
                    <div key={r} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-[11px] text-muted-foreground">{r}</p>
                      <p className="text-xl font-semibold">{v}</p>
                      <p className="text-[10px] text-muted-foreground">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">Oferta</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="space-y-1"><span className="text-muted-foreground">Condição válida até</span>
                    <input type="date" value={cfg.condicaoValidaAte} onChange={e => setCfg({ ...cfg, condicaoValidaAte: e.target.value })} className="h-8 w-full rounded-md border border-border bg-background px-2" />
                    <span className="block text-[11px] text-muted-foreground">Vazio = "condição de lançamento, pode mudar sem aviso" (nunca inventa data)</span>
                  </label>
                  <label className="space-y-1"><span className="text-muted-foreground">Chácara-âncora dos valores</span>
                    <select value={cfg.loteAncora} onChange={e => setCfg({ ...cfg, loteAncora: e.target.value })} className="h-8 w-full rounded-md border border-border bg-background px-2">
                      <option value="">Área-base do simulador</option>
                      {data.lotes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1"><span className="text-muted-foreground">Entrada parcelada em</span>
                    <input type="number" min={1} max={12} value={cfg.entradaParcelas} onChange={e => setCfg({ ...cfg, entradaParcelas: Number(e.target.value) || 1 })} className="h-8 w-full rounded-md border border-border bg-background px-2" />
                  </label>
                </div>
                <label className="block space-y-1 text-xs"><span className="text-muted-foreground">Aviso legal (vai no fim de toda mensagem com valores; vazio = padrão)</span>
                  <textarea rows={3} value={cfg.avisoLegal} onChange={e => setCfg({ ...cfg, avisoLegal: e.target.value })} className="w-full rounded-md border border-border bg-background p-2" />
                </label>
                <Button size="sm" disabled={salvarCfg.isPending} onClick={() => gravar(ligado)}><Save className="mr-1 h-3.5 w-3.5" /> Salvar oferta</Button>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold">Prévia (não envia nada)</p>
                <div className="flex gap-2">
                  <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && msg.trim() && previa.mutate({ slug, mensagem: msg, primeira })}
                    placeholder="Mensagem do cliente" className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm" />
                  <Button size="sm" disabled={!msg.trim() || previa.isPending} onClick={() => previa.mutate({ slug, mensagem: msg, primeira })}>{previa.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                </div>
                <label className="inline-flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={primeira} onChange={e => setPrimeira(e.target.checked)} /> É a primeira mensagem do cliente</label>
                {previa.data && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Intenção: <b className="text-foreground">{previa.data.intencao}</b>{previa.data.chacara ? ` · chácara ${previa.data.chacara}` : ""}</p>
                    {previa.data.envios.map((e: any, i: number) => e.tipo === "texto"
                      ? <Balao key={i} texto={e.texto} />
                      : e.codigo === "FOLDER_CHACARA"
                        ? <a key={i} href={e.url} target="_blank" rel="noreferrer" className="block w-40"><img src={e.url} alt={e.nomeArquivo} className="w-full rounded-md border border-border" /></a>
                        : <p key={i} className="inline-flex items-center gap-1 rounded-md bg-secondary/40 px-2 py-1 text-xs">{e.tipo === "pdf" ? <FileText className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} {ROTULO_MIDIA[e.codigo as CodigoMidia] ?? e.codigo}</p>)}
                    {previa.data.obs && <p className="text-xs text-amber-300">{previa.data.obs}</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Folders e mídias</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {data.midias.map(m => <Midia key={m.codigo} slug={slug} m={m as any} onSalvo={() => refetch()} />)}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Textos por intenção</p>
              <p className="text-[11px] text-muted-foreground">Variáveis: {VARIAVEIS}</p>
              {data.textos.map(t => <EditorTexto key={t.intencao} slug={slug} t={t as Texto} onSalvo={() => refetch()} />)}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Últimas respostas do robô</p>
              {!hist?.length ? <p className="text-xs text-muted-foreground">Nenhuma ainda.</p> : (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-2">Quando</th><th className="p-2">Lead</th><th className="p-2">O que houve</th></tr></thead>
                    <tbody>{hist.map(h => (
                      <tr key={h.id} className="border-b border-border/50 last:border-0">
                        <td className="p-2 text-xs">{dataHora(h.createdAt as any)}</td>
                        <td className="p-2"><button className="text-primary hover:underline" onClick={() => navigate(`/leads/lead/${h.leadId}`)}>{h.nome || `Lead ${h.leadId}`}</button></td>
                        <td className="p-2 text-xs">{h.tipo === "handoff" ? `Passou para o corretor${h.motivo ? ` — ${h.motivo}` : ""}`
                          : h.tipo === "fora_horario" ? `Fora do horário (${h.intencao ?? "—"}): espera o corretor`
                          : h.tipo === "regua" ? `Régua, passo ${h.passo ?? "?"}: ${h.intencao ?? "—"}`
                          : h.tipo === "abriu_oferta" ? "Abriu a página de oferta"
                          : `Respondeu: ${h.intencao ?? "—"}`}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
