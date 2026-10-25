import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Copy, FileAudio, Loader2, Mic, MonitorSpeaker, Square, Trash2, TriangleAlert, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { GravadorReuniao, enviarParte, type EstadoEnvio } from "@/lib/gravadorReuniao";
import {
  LIMITE_PARTE_MB, STATUS_REUNIAO, TIPOS_REUNIAO, duracaoTexto, resumoEmTexto, rotuloTipoReuniao, type ResumoReuniao, type TipoReuniao,
} from "@shared/reunioes";

const COR_STATUS: Record<string, string> = {
  gravando: "bg-red-500/15 text-red-300", processando: "bg-amber-500/15 text-amber-300", pronta: "bg-emerald-500/15 text-emerald-300", erro: "bg-red-500/15 text-red-300",
};
const dataHora = (d: unknown) => new Date(d as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const copiar = async (t: string, o = "Texto") => { try { await navigator.clipboard.writeText(t); toast.success(`${o} copiado`); } catch { window.prompt("Copie:", t); } };
const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

/** Escolher o cliente (lead) da reunião */
function EscolherLead({ valor, onEscolher }: { valor: { id: number; nome: string } | null; onEscolher: (l: { id: number; nome: string } | null) => void }) {
  const [busca, setBusca] = useState("");
  const { data } = trpc.reunioes.buscarLeads.useQuery({ busca }, { enabled: !valor });
  if (valor) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border px-2 text-sm">
        <b className="truncate">{valor.nome}</b>
        <button type="button" className="ml-auto text-xs text-primary hover:underline" onClick={() => onEscolher(null)}>trocar</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente por nome ou telefone (opcional)" className={campo} aria-label="Cliente" />
      {busca.trim().length >= 2 && (data ?? []).length > 0 && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {data!.map(l => (
            <button key={l.id} type="button" onClick={() => { onEscolher({ id: l.id, nome: l.nome }); setBusca(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary/50">
              {l.nome} <span className="text-xs text-muted-foreground">{l.telefone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nova reunião: gravar agora ou importar um áudio */
function NovaReuniao({ leadInicial, onPronta }: { leadInicial: { id: number; nome: string } | null; onPronta: (id: number) => void }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoReuniao>("presencial");
  const [lead, setLead] = useState(leadInicial);
  const [consentimento, setConsentimento] = useState(false);
  const [somPc, setSomPc] = useState(false);
  const [gravando, setGravando] = useState<{ id: number; inicio: number } | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [envio, setEnvio] = useState<EstadoEnvio>({ enviadas: 0, pendentes: 0, erro: null });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const gravador = useRef<GravadorReuniao | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const { data: servicos } = trpc.reunioes.status.useQuery();
  const criar = trpc.reunioes.criar.useMutation();
  const finalizar = trpc.reunioes.finalizar.useMutation();
  useEffect(() => { if (!gravando) return; const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, [gravando]);
  // Fechar a aba no meio da gravação perde só o trecho que ainda não subiu: avisa
  useEffect(() => {
    if (!gravando) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [gravando]);

  const tituloFinal = () => titulo.trim() || `${rotuloTipoReuniao(tipo)}${lead ? ` com ${lead.nome}` : ""} — ${new Date().toLocaleDateString("pt-BR")}`;
  const novo = () => criar.mutateAsync({ titulo: tituloFinal().slice(0, 160), tipo, leadId: lead?.id ?? null, consentimento });

  const iniciar = async () => {
    if (!GravadorReuniao.suportado()) { toast.error("Este navegador não grava áudio. Use o Chrome ou o Edge."); return; }
    setOcupado("Preparando o microfone…");
    try {
      const { id } = await novo();
      const g = new GravadorReuniao(id, setEnvio);
      await g.iniciar(somPc);
      gravador.current = g;
      setGravando({ id, inicio: Date.now() });
    } catch (e: any) {
      toast.error(e?.name === "NotAllowedError" ? "Permita o uso do microfone no navegador para gravar." : e?.message || "Não foi possível começar a gravar");
    } finally { setOcupado(null); }
  };

  const parar = async () => {
    if (!gravador.current || !gravando) return;
    setOcupado("Enviando o final da gravação…");
    const e = await gravador.current.parar();
    gravador.current = null;
    if (e.erro) toast.error(`Algumas partes não foram transcritas: ${e.erro}`);
    setOcupado("Gerando o resumo…");
    await finalizar.mutateAsync({ id: gravando.id }).catch(err => toast.error(err.message));
    setOcupado(null);
    onPronta(gravando.id);
  };

  const importar = async (f?: File | null) => {
    if (!f) return;
    if (f.size > LIMITE_PARTE_MB * 1024 * 1024) { toast.error(`O arquivo tem ${(f.size / 1048576).toFixed(0)} MB; o limite é ${LIMITE_PARTE_MB} MB.`); return; }
    setOcupado(`Transcrevendo ${f.name}…`);
    try {
      const { id } = await novo();
      const duracao = await new Promise<number>(ok => {
        const a = new Audio(); a.preload = "metadata"; a.onloadedmetadata = () => ok(Number.isFinite(a.duration) ? a.duration : 0); a.onerror = () => ok(0); a.src = URL.createObjectURL(f);
      });
      await enviarParte(id, 0, f, duracao);
      await finalizar.mutateAsync({ id });
      onPronta(id);
    } catch (e: any) { toast.error(e?.message || "Não foi possível transcrever o arquivo"); } finally { setOcupado(null); if (arquivo.current) arquivo.current.value = ""; }
  };

  if (gravando) {
    return (
      <section className="space-y-3 rounded-xl border border-red-500/40 bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" /></span>
          <b className="font-mono text-2xl">{duracaoTexto((agora - gravando.inicio) / 1000)}</b>
          <span className="text-sm text-muted-foreground">{tituloFinal()}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Gravando{somPc ? " o microfone e o som do computador" : " o microfone"}. A cada 5 minutos um trecho é enviado e transcrito
          ({envio.enviadas} enviado(s){envio.pendentes ? `, ${envio.pendentes} enviando` : ""}). Deixe esta tela aberta e o aparelho com a tela acesa.
        </p>
        {envio.erro && <p className="flex items-center gap-1 text-xs text-red-300"><TriangleAlert className="h-3.5 w-3.5" /> {envio.erro}</p>}
        <Button onClick={parar} disabled={!!ocupado} className="bg-red-600 hover:bg-red-700 text-white">
          {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Square className="mr-1.5 h-4 w-4" />} {ocupado ?? "Parar e transcrever"}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Nova reunião</h2>
      {servicos && !servicos.transcricao && (
        <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-200">A transcrição ainda não está configurada no servidor (falta a chave da OpenAI). Avise o administrador.</p>
      )}
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-xs text-muted-foreground md:col-span-2">Título<input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={160} placeholder="Ex.: Visita ao Bom Jardims com a família" className={campo} /></label>
        <label className="text-xs text-muted-foreground">Tipo
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoReuniao)} className={campo}>{TIPOS_REUNIAO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
        </label>
      </div>
      <div className="text-xs text-muted-foreground">Cliente<EscolherLead valor={lead} onEscolher={setLead} /></div>
      {GravadorReuniao.somDoComputadorSuportado() && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={somPc} onChange={e => setSomPc(e.target.checked)} className="mt-1" />
          <span><MonitorSpeaker className="mr-1 inline h-4 w-4" />Incluir o som do computador <span className="text-xs text-muted-foreground">(chamada no Meet, Zoom ou WhatsApp Web: escolha a aba/tela e marque "Compartilhar áudio")</span></span>
        </label>
      )}
      <label className="flex items-start gap-2 rounded-md bg-secondary/30 p-2 text-sm">
        <input type="checkbox" checked={consentimento} onChange={e => setConsentimento(e.target.checked)} className="mt-1" />
        <span>Avisei o cliente que a reunião será gravada e transcrita (LGPD). <span className="text-xs text-muted-foreground">O áudio não fica guardado: só o texto e o resumo.</span></span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={iniciar} disabled={!consentimento || !!ocupado} className="bg-red-600 hover:bg-red-700 text-white">
          {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mic className="mr-1.5 h-4 w-4" />} {ocupado ?? "Começar a gravar"}
        </Button>
        <input ref={arquivo} type="file" accept="audio/*,video/mp4,.ogg,.opus,.m4a,.mp3,.wav,.webm" hidden onChange={e => importar(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => arquivo.current?.click()} disabled={!consentimento || !!ocupado}><Upload className="mr-1.5 h-4 w-4" /> Importar áudio</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Funciona no celular e no computador. Áudio do WhatsApp, MP3, M4A ou gravação de ligação: use "Importar áudio" (até {LIMITE_PARTE_MB} MB).</p>
    </section>
  );
}

function Lista({ itens, onAbrir }: { itens: any[]; onAbrir: (id: number) => void }) {
  if (!itens.length) return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma reunião ainda.</p>;
  return (
    <div className="space-y-2">
      {itens.map(r => (
        <button key={r.id} type="button" onClick={() => onAbrir(r.id)} className="block w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
          <div className="flex flex-wrap items-center gap-2">
            <FileAudio className="h-4 w-4 text-primary" /><b>{r.titulo}</b>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_STATUS[r.status] ?? ""}`}>{STATUS_REUNIAO[r.status] ?? r.status}</span>
            <span className="ml-auto text-xs text-muted-foreground">{dataHora(r.createdAt)} · {duracaoTexto(r.duracaoSeg)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{[rotuloTipoReuniao(r.tipo), r.cliente && `cliente: ${r.cliente}`, r.autor && `por ${r.autor}`].filter(Boolean).join(" · ")}</p>
          {r.resumo && <p className="mt-1 line-clamp-2 text-sm">{r.resumo}</p>}
        </button>
      ))}
    </div>
  );
}

function BlocoLista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return <div><h3 className="mb-1 text-sm font-semibold">{titulo}</h3><ul className="list-disc space-y-0.5 pl-5 text-sm">{itens.map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
}

/** Detalhe: resumo, próximos passos, transcrição, copiar, cliente */
function Detalhe({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: r, error } = trpc.reunioes.obter.useQuery({ id }, { refetchInterval: q => (["processando", "gravando"].includes((q.state.data as any)?.status) ? 4000 : false) });
  const [verTexto, setVerTexto] = useState(false);
  const atualizar = trpc.reunioes.atualizar.useMutation({ onSuccess: () => { toast.success("Reunião atualizada"); utils.reunioes.obter.invalidate({ id }); utils.reunioes.listar.invalidate(); }, onError: e => toast.error(e.message) });
  const refazer = trpc.reunioes.finalizar.useMutation({ onSuccess: () => utils.reunioes.obter.invalidate({ id }), onError: e => toast.error(e.message) });
  const excluir = trpc.reunioes.excluir.useMutation({ onSuccess: () => { toast.success("Reunião excluída"); utils.reunioes.listar.invalidate(); navigate("/reunioes"); }, onError: e => toast.error(e.message) });
  if (error) return <p className="text-sm text-red-400">{error.message}</p>;
  if (!r) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const resumo = r.resumo as ResumoReuniao | null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/reunioes")}><ArrowLeft className="mr-1 h-4 w-4" /> Reuniões</Button>
        <h2 className="text-lg font-semibold">{r.titulo}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_STATUS[r.status] ?? ""}`}>{STATUS_REUNIAO[r.status] ?? r.status}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {[rotuloTipoReuniao(r.tipo), dataHora(r.createdAt), duracaoTexto(r.duracaoSeg), r.autor && `gravada por ${r.autor}`].filter(Boolean).join(" · ")}
        {r.leadId ? <> · cliente: <button className="text-primary hover:underline" onClick={() => navigate(`/leads/lead/${r.leadId}`)}>{r.cliente}</button></> : " · sem cliente vinculado"}
      </p>
      {!r.leadId && <div className="max-w-md text-xs text-muted-foreground">Vincular a um cliente<EscolherLead valor={null} onEscolher={l => l && atualizar.mutate({ id, leadId: l.id })} /></div>}
      {r.status === "processando" && <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Transcrevendo e resumindo… pode sair desta tela, o resumo fica salvo aqui.</p>}
      {r.status === "gravando" && <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">Esta reunião não foi finalizada ({r.partes.length} trecho(s) recebido(s)). <button className="text-primary hover:underline" onClick={() => refazer.mutate({ id })}>Finalizar e resumir agora</button></p>}
      {r.erro && <p className="flex items-start gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{r.erro} {r.status === "erro" && <button className="ml-1 text-primary hover:underline" onClick={() => refazer.mutate({ id })}>Tentar de novo</button>}</span></p>}
      {resumo && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2"><h3 className="font-semibold">Resumo</h3>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => copiar(resumoEmTexto(r.titulo, resumo), "Resumo")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar resumo</Button>
          </div>
          <p className="text-sm leading-relaxed">{resumo.resumo}</p>
          {resumo.interesse && <div><h3 className="mb-1 text-sm font-semibold">Interesse do cliente</h3><p className="text-sm">{resumo.interesse}</p></div>}
          <BlocoLista titulo="Próximos passos" itens={resumo.proximosPassos} />
          <BlocoLista titulo="Pontos principais" itens={resumo.pontosPrincipais} />
          <BlocoLista titulo="Dúvidas e objeções" itens={resumo.objecoes} />
          <BlocoLista titulo="Dados do cliente" itens={resumo.dadosCliente} />
          <p className="text-[11px] text-muted-foreground">Resumo feito por IA a partir da transcrição automática: confira antes de repassar.</p>
        </div>
      )}
      {r.transcricao && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <button className="font-semibold hover:underline" onClick={() => setVerTexto(v => !v)}>{verTexto ? "Esconder" : "Ver"} a transcrição completa</button>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => copiar(r.transcricao!, "Transcrição")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar</Button>
          </div>
          {verTexto && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{r.transcricao}</p>}
        </div>
      )}
      {r.podeExcluir && (
        <Button variant="ghost" size="sm" className="text-red-300" disabled={excluir.isPending} onClick={() => { if (confirm("Excluir esta reunião, a transcrição e o resumo? Não dá para desfazer.")) excluir.mutate({ id }); }}>
          <Trash2 className="mr-1 h-4 w-4" /> Excluir reunião
        </Button>
      )}
    </section>
  );
}

/** Reuniões com clientes: gravar (ou importar áudio), transcrever e resumir — /reunioes, /reunioes/:id, /reunioes?lead=ID */
export default function Reunioes() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/reunioes/:id");
  const id = params?.id ? Number(params.id) : null;
  const leadParam = useMemo(() => Number(new URLSearchParams(window.location.search).get("lead")) || null, []);
  const { data: leadInfo } = trpc.reunioes.buscarLeads.useQuery({ busca: "" }, { enabled: !!leadParam });
  const leadInicial = leadParam ? (leadInfo?.find(l => l.id === leadParam) ?? null) : null;
  const { data: lista } = trpc.reunioes.listar.useQuery(undefined, { enabled: !id, refetchInterval: 15000 });
  return (
    <div>
      <PageHeader icone={Mic} titulo="Reuniões" subtitulo="Grave a conversa com o cliente: o CRM transcreve em português e resume com os próximos passos" />
      <div className="mx-auto max-w-[1000px] space-y-4 px-4 pb-8 md:px-6">
        {id ? <Detalhe id={id} /> : (
          <>
            <NovaReuniao key={leadInicial?.id ?? 0} leadInicial={leadInicial ? { id: leadInicial.id, nome: leadInicial.nome } : null} onPronta={n => navigate(`/reunioes/${n}`)} />
            <Lista itens={lista ?? []} onAbrir={n => navigate(`/reunioes/${n}`)} />
          </>
        )}
      </div>
    </div>
  );
}
