import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Camera, CheckCircle2, Download, Eye, FileText, Filter, ImagePlus, Loader2, Lock, MapPin, Pencil, Plus, RefreshCw, Save, Search, Share2, Trash2, X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import {
  AVISO_REGISTRO, MAX_BYTES_FOTO, ROTULO_STATUS, ROTULO_TIPO_ATIVIDADE, TIPOS_ATIVIDADE, dataBr, moverNaLista, type TipoAtividade,
} from "@shared/relatoriosFotograficos";

/*
 * Relatórios fotográficos: registro PRIVADO de atividades com fotos (rascunho → final → PDF).
 * As fotos não vão para Materiais nem para links públicos: são servidas só por rotas autenticadas.
 * As ilustrações em /relatorios/ilustracao-*.webp são genéricas (geradas por IA) e só aparecem no estado vazio, identificadas.
 */
const campo = "mt-1 block h-11 w-full rounded-md border border-border bg-background px-3 text-base md:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const rotulo = "text-xs font-medium text-muted-foreground";
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const miniatura = (uid: string, v: "miniatura" | "previa" | "original" = "miniatura") => `/api/relatorios/fotos/${uid}/${v}`;
const ehToque = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function SeloStatus({ status }: { status: "draft" | "final" }) {
  return status === "final"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--rt-gold)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--rt-gold-light)]"><Lock className="h-3 w-3" aria-hidden />Final</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"><Pencil className="h-3 w-3" aria-hidden />Rascunho</span>;
}

/** Confirmação de ação destrutiva/irreversível (exclusão, finalização) */
function Confirmar({ aberto, titulo, texto, acao, perigo, onConfirmar, onFechar }: {
  aberto: boolean; titulo: string; texto: string; acao: string; perigo?: boolean; onConfirmar: () => void; onFechar: () => void;
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={o => !o && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{texto}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={perigo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} onClick={onConfirmar}>{acao}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function RelatoriosFotograficos() {
  const params = useParams<{ id?: string }>();
  if (params.id) return <Editor idParam={params.id} />;
  return <Lista />;
}

// ─── Lista ───────────────────────────────────────────────────────────────────────────────────────────

function Lista() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const [f, setF] = useState({ busca: "", empreendimentoId: "", tipoAtividade: "", status: "", responsavelUserId: "", de: "", ate: "" });
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const entrada = useMemo(() => ({
    busca: f.busca || null, empreendimentoId: Number(f.empreendimentoId) || null, tipoAtividade: (f.tipoAtividade || null) as TipoAtividade | null,
    status: (f.status || null) as "draft" | "final" | null, responsavelUserId: Number(f.responsavelUserId) || null, de: f.de || null, ate: f.ate || null,
  }), [f]);
  const lista = trpc.relatoriosFotograficos.listar.useQuery(entrada);
  const opcoes = trpc.relatoriosFotograficos.opcoes.useQuery();
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const temFiltro = Object.values(f).some(Boolean);

  return (
    <div className="pb-10">
      <PageHeader titulo="Relatórios fotográficos" icone={Camera}
        subtitulo="Registro privado das atividades com fotos, legendas e PDF. Não é laudo nem documento jurídico."
        acoes={<Button onClick={() => navigate("/relatorios-fotograficos/novo")} className="min-h-11"><Plus className="h-4 w-4 mr-1" />Novo relatório</Button>} />
      <div className="px-4 md:px-6 max-w-[1500px] mx-auto space-y-4">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[200px]">
              <span className="sr-only">Buscar pelo título</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input className={`${campo} mt-0 pl-9`} placeholder="Buscar pelo título" value={f.busca} onChange={e => set("busca", e.target.value)} />
            </label>
            <Button variant="outline" className="min-h-11" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(a => !a)}><Filter className="h-4 w-4 mr-1" />Filtros</Button>
            {temFiltro && <Button variant="ghost" className="min-h-11" onClick={() => setF({ busca: "", empreendimentoId: "", tipoAtividade: "", status: "", responsavelUserId: "", de: "", ate: "" })}><X className="h-4 w-4 mr-1" />Limpar</Button>}
          </div>
          {filtrosAbertos && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className={rotulo}>Empreendimento
                <select className={campo} value={f.empreendimentoId} onChange={e => set("empreendimentoId", e.target.value)}>
                  <option value="">Todos</option>{opcoes.data?.empreendimentos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </label>
              <label className={rotulo}>Tipo de atividade
                <select className={campo} value={f.tipoAtividade} onChange={e => set("tipoAtividade", e.target.value)}>
                  <option value="">Todos</option>{TIPOS_ATIVIDADE.map(t => <option key={t} value={t}>{ROTULO_TIPO_ATIVIDADE[t]}</option>)}
                </select>
              </label>
              <label className={rotulo}>Situação
                <select className={campo} value={f.status} onChange={e => set("status", e.target.value)}>
                  <option value="">Todas</option><option value="draft">Rascunho</option><option value="final">Final</option>
                </select>
              </label>
              {perfil !== "corretor" && (
                <label className={rotulo}>Responsável
                  <select className={campo} value={f.responsavelUserId} onChange={e => set("responsavelUserId", e.target.value)}>
                    <option value="">Todos</option>{opcoes.data?.equipe.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                </label>
              )}
              <label className={rotulo}>De<input type="date" className={campo} value={f.de} onChange={e => set("de", e.target.value)} /></label>
              <label className={rotulo}>Até<input type="date" className={campo} value={f.ate} onChange={e => set("ate", e.target.value)} /></label>
            </div>
          )}
        </div>

        {lista.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
        ) : lista.error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            Não foi possível carregar os relatórios: {lista.error.message} <Button variant="link" onClick={() => lista.refetch()}>Tentar de novo</Button>
          </div>
        ) : !lista.data?.length ? (
          <Vazio filtrado={temFiltro} onNovo={() => navigate("/relatorios-fotograficos/novo")} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {lista.data.map(r => (
              <li key={r.id}>
                <button onClick={() => navigate(`/relatorios-fotograficos/${r.id}`)}
                  className="group w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring">
                  <div className="aspect-[16/9] bg-muted">
                    {r.capaUid
                      ? <img src={miniatura(r.capaUid)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center text-muted-foreground"><Camera className="h-8 w-8" aria-hidden /></div>}
                  </div>
                  <div className="space-y-1 p-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="font-mono">{r.numero}</span><SeloStatus status={r.status as any} /></div>
                    <p className="font-semibold leading-snug line-clamp-2">{r.titulo}</p>
                    <p className="text-xs text-muted-foreground">{ROTULO_TIPO_ATIVIDADE[r.tipoAtividade as TipoAtividade] ?? r.tipoAtividade} · {dataBr(r.dataAtividade)} · {r.totalFotos} foto{r.totalFotos === 1 ? "" : "s"}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.responsavel}{r.empreendimento ? ` · ${r.empreendimento}${r.loteCodigo ? ` ${r.loteCodigo}` : ""}` : ""}{r.cliente ? ` · ${r.cliente}` : ""}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Vazio({ filtrado, onNovo }: { filtrado: boolean; onNovo: () => void }) {
  if (filtrado) return <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Nenhum relatório com esses filtros.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card md:flex">
      <figure className="md:w-1/2">
        <img src="/relatorios/ilustracao-visita-campo.webp" alt="Ilustração genérica de uma visita de campo" className="aspect-[16/9] h-full w-full object-cover" />
        <figcaption className="px-4 py-2 text-[11px] text-muted-foreground">Ilustração de exemplo — não é registro de atividade real.</figcaption>
      </figure>
      <div className="space-y-3 p-6 md:w-1/2">
        <h2 className="text-lg font-semibold">Registre as atividades em fotos</h2>
        <p className="text-sm text-muted-foreground">Crie um relatório, informe o contexto e a data, envie as fotos pela câmera ou pela galeria, escreva as legendas e gere o PDF. As fotos ficam privadas; só quem tem acesso ao relatório consegue vê-las.</p>
        <Button onClick={onNovo} className="min-h-11"><Plus className="h-4 w-4 mr-1" />Criar o primeiro relatório</Button>
      </div>
    </div>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────────────────────────────

type Form = { titulo: string; descricao: string; tipoAtividade: TipoAtividade; dataAtividade: string; empreendimentoId: string; loteCodigo: string; imovelId: string; clienteId: string; clienteNome: string; responsavelUserId: string };
const VAZIO: Form = { titulo: "", descricao: "", tipoAtividade: "visita", dataAtividade: hoje(), empreendimentoId: "", loteCodigo: "", imovelId: "", clienteId: "", clienteNome: "", responsavelUserId: "" };

function Editor({ idParam }: { idParam: string }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const novo = idParam === "novo";
  const id = novo ? 0 : Number(idParam) || 0;
  const rel = trpc.relatoriosFotograficos.obter.useQuery({ id }, { enabled: !novo && id > 0 });
  const [buscaCli, setBuscaCli] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setBuscaDeb(buscaCli), 350); return () => clearTimeout(t); }, [buscaCli]);
  const opcoes = trpc.relatoriosFotograficos.opcoes.useQuery({ buscaCliente: buscaDeb || undefined });
  const [form, setForm] = useState<Form>(VAZIO);
  const [sujo, setSujo] = useState(false);
  const [confirmar, setConfirmar] = useState<null | "finalizar" | "excluir" | { foto: number }>(null);
  const [previa, setPrevia] = useState<null | { url: string; cliente: boolean }>(null);
  const [ver, setVer] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<{ feito: number; total: number } | null>(null);
  const [geo, setGeo] = useState(false);
  const camRef = useRef<HTMLInputElement>(null), galRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = rel.data;
    if (!r) return;
    setForm({
      titulo: r.titulo, descricao: r.descricao, tipoAtividade: r.tipoAtividade as TipoAtividade, dataAtividade: r.dataAtividade,
      empreendimentoId: r.empreendimentoId ? String(r.empreendimentoId) : "", loteCodigo: r.loteCodigo, imovelId: r.imovelId ? String(r.imovelId) : "",
      clienteId: r.clienteId ? String(r.clienteId) : "", clienteNome: r.nomes.cliente ?? "", responsavelUserId: String(r.responsavelUserId),
    });
    setSujo(false);
  }, [rel.data]);
  // Rascunho com alteração não salva: avisa antes de sair da página
  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  const recarregar = () => { utils.relatoriosFotograficos.obter.invalidate({ id }); utils.relatoriosFotograficos.listar.invalidate(); };
  const onErr = (e: any) => toast.error(e.message);
  const criar = trpc.relatoriosFotograficos.criar.useMutation({ onSuccess: r => { setSujo(false); toast.success(`Rascunho ${r.numero} criado. Agora adicione as fotos.`); utils.relatoriosFotograficos.listar.invalidate(); navigate(`/relatorios-fotograficos/${r.id}`); }, onError: onErr });
  const atualizar = trpc.relatoriosFotograficos.atualizar.useMutation({ onSuccess: () => { setSujo(false); toast.success("Rascunho salvo"); recarregar(); }, onError: onErr });
  const finalizar = trpc.relatoriosFotograficos.finalizar.useMutation({ onSuccess: () => { toast.success("Relatório finalizado (somente leitura)"); recarregar(); }, onError: onErr });
  const derivar = trpc.relatoriosFotograficos.derivar.useMutation({ onSuccess: r => { toast.success(`Rascunho de correção ${r.numero} criado; o final continua intacto.`); utils.relatoriosFotograficos.listar.invalidate(); navigate(`/relatorios-fotograficos/${r.id}`); }, onError: onErr });
  const excluir = trpc.relatoriosFotograficos.excluir.useMutation({ onSuccess: () => { toast.success("Rascunho excluído"); utils.relatoriosFotograficos.listar.invalidate(); navigate("/relatorios-fotograficos"); }, onError: onErr });
  const atualizarFoto = trpc.relatoriosFotograficos.atualizarFoto.useMutation({ onSuccess: recarregar, onError: onErr });
  const reordenar = trpc.relatoriosFotograficos.reordenar.useMutation({ onSuccess: recarregar, onError: onErr });
  const removerFoto = trpc.relatoriosFotograficos.removerFoto.useMutation({ onSuccess: () => { toast.success("Foto removida do rascunho"); recarregar(); }, onError: onErr });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm(x => ({ ...x, [k]: v })); setSujo(true); };
  const editavel = novo || !!rel.data?.podeEditar;
  const dados = () => ({
    titulo: form.titulo.trim(), descricao: form.descricao || null, tipoAtividade: form.tipoAtividade, dataAtividade: form.dataAtividade,
    empreendimentoId: Number(form.empreendimentoId) || null, loteCodigo: form.loteCodigo || null, imovelId: Number(form.imovelId) || null,
    clienteId: Number(form.clienteId) || null, responsavelUserId: Number(form.responsavelUserId) || null,
  });
  const salvar = () => {
    if (form.titulo.trim().length < 3) return toast.error("Informe um título (mínimo 3 caracteres).");
    if (!form.dataAtividade) return toast.error("Informe a data da atividade.");
    if (novo) criar.mutate(dados()); else atualizar.mutate({ id, dados: dados() });
  };

  /** Envia as fotos uma a uma (o servidor valida tipo e tamanho pelo conteúdo) */
  const enviarFotos = async (lista: FileList | null, origem: "camera" | "gallery" | "desktop_upload") => {
    if (!lista?.length || !rel.data) return;
    const arquivos = Array.from(lista);
    const vagas = rel.data.limites.maxFotos - rel.data.fotos.length;
    if (arquivos.length > vagas) toast.warning(`Limite de ${rel.data.limites.maxFotos} fotos: ${Math.max(vagas, 0)} vaga(s) restante(s).`);
    let posicao: { lat: number; lng: number } | null = null;
    if (geo && navigator.geolocation) {
      posicao = await new Promise(res => navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 8000 }));
      if (!posicao) toast.info("Localização não autorizada ou indisponível; as fotos seguem sem localização.");
    }
    const fila = arquivos.slice(0, Math.max(vagas, 0));
    setEnviando({ feito: 0, total: fila.length });
    let ok = 0;
    for (let i = 0; i < fila.length; i++) { const arq = fila[i];
      if (arq.size > MAX_BYTES_FOTO) { toast.error(`${arq.name}: acima de 15 MB.`); setEnviando({ feito: i + 1, total: fila.length }); continue; }
      try {
        const headers: Record<string, string> = { "Content-Type": arq.type || "application/octet-stream", "X-File-Name": encodeURIComponent(arq.name), "X-Origem-Captura": origem };
        if (posicao) Object.assign(headers, { "X-Geo-Consentimento": "1", "X-Geo-Lat": String(posicao.lat), "X-Geo-Lng": String(posicao.lng) });
        const r = await fetch(`/api/relatorios/${id}/fotos`, { method: "POST", credentials: "include", headers, body: arq });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) toast.error(`${arq.name}: ${j.erro ?? "falha no envio"}`); else ok++;
      } catch { toast.error(`${arq.name}: falha de conexão`); }
      setEnviando({ feito: i + 1, total: fila.length });
    }
    setEnviando(null);
    if (ok) toast.success(`${ok} foto${ok === 1 ? "" : "s"} adicionada${ok === 1 ? "" : "s"}`);
    recarregar();
  };

  const urlPdf = (cliente: boolean, extra = "") => `/api/relatorios/${id}.pdf?${cliente ? "cliente=1&" : ""}${extra}`;
  const baixar = async (cliente: boolean) => {
    try {
      const r = await fetch(urlPdf(cliente, "baixar=1"), { credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return toast.error(j.erro ?? "Falha ao gerar o PDF"); }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${rel.data?.numero ?? "relatorio"}${cliente ? "-cliente" : ""}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { toast.error("Falha de conexão ao gerar o PDF"); }
  };
  /** Compartilhar é ação explícita: envia o ARQUIVO pelo compartilhamento do aparelho (sem criar link público) */
  const compartilhar = async () => {
    try {
      const r = await fetch(urlPdf(true), { credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return toast.error(j.erro ?? "Falha ao gerar o PDF"); }
      const arquivo = new File([await r.blob()], `${rel.data?.numero ?? "relatorio"}-cliente.pdf`, { type: "application/pdf" });
      if ((navigator as any).canShare?.({ files: [arquivo] })) await (navigator as any).share({ files: [arquivo], title: rel.data?.titulo });
      else { toast.info("Este aparelho não compartilha arquivos; o PDF do cliente será baixado."); await baixar(true); }
    } catch (e: any) { if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar"); }
  };

  if (!novo && rel.isLoading) return <div className="p-6 space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (!novo && (rel.error || !rel.data)) {
    return (
      <div className="p-6">
        <div role="alert" className="rounded-xl border border-border bg-card p-6 text-sm">
          {rel.error?.message ?? "Relatório não encontrado."} <Button variant="link" onClick={() => navigate("/relatorios-fotograficos")}>Voltar à lista</Button>
        </div>
      </div>
    );
  }
  const r = rel.data;
  const fotos = r?.fotos ?? [];
  const ocupado = criar.isPending || atualizar.isPending;
  const mover = (i: number, d: -1 | 1) => reordenar.mutate({ id, ordem: moverNaLista(fotos.map(x => x.id), i, d) });

  return (
    <div className="pb-24 md:pb-10">
      <PageHeader titulo={novo ? "Novo relatório fotográfico" : r!.titulo}
        subtitulo={novo ? "Preencha o contexto e salve o rascunho para adicionar as fotos." : <span className="inline-flex flex-wrap items-center gap-2"><span className="font-mono">{r!.numero}</span><SeloStatus status={r!.status} />{r!.derivadoDe && <span>· corrige {r!.derivadoDe}</span>}</span>}
        voltar={{ rotulo: "Relatórios fotográficos", onClick: () => navigate("/relatorios-fotograficos") }}
        acoes={editavel ? (
          <Button onClick={salvar} disabled={ocupado || (!novo && !sujo)} className="min-h-11">
            {ocupado ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}{novo ? "Criar rascunho" : sujo ? "Salvar rascunho" : "Salvo"}
          </Button>
        ) : undefined} />

      <div className="px-4 md:px-6 max-w-[1500px] mx-auto grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4 min-w-0">
          {!editavel && r?.status === "final" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rt-gold)]/40 bg-[var(--rt-gold)]/10 p-3 text-sm">
              <span><Lock className="inline h-4 w-4 mr-1" aria-hidden />Relatório final: somente leitura. Para corrigir, crie um rascunho de correção — o final fica preservado.</span>
              <Button variant="outline" className="min-h-11" disabled={derivar.isPending} onClick={() => derivar.mutate({ id })}><RefreshCw className="h-4 w-4 mr-1" />Criar rascunho de correção</Button>
            </div>
          )}

          <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="ctx">
            <h2 id="ctx" className="text-sm font-semibold mb-3">Contexto da atividade</h2>
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-2">
              <label className={`${rotulo} sm:col-span-2`}>Título *
                <input className={campo} maxLength={180} value={form.titulo} onChange={e => set("titulo", e.target.value)} placeholder="Ex.: Visita de acompanhamento" />
              </label>
              <label className={rotulo}>Tipo de atividade *
                <select className={campo} value={form.tipoAtividade} onChange={e => set("tipoAtividade", e.target.value as TipoAtividade)}>
                  {TIPOS_ATIVIDADE.map(t => <option key={t} value={t}>{ROTULO_TIPO_ATIVIDADE[t]}</option>)}
                </select>
              </label>
              <label className={rotulo}>Data da atividade *
                <input type="date" className={campo} value={form.dataAtividade} onChange={e => set("dataAtividade", e.target.value)} />
                {r?.dataAtividadeOrigem === "edited_by_user" && <span className="mt-1 block text-[11px]">Data alterada após a criação (registrado na trilha).</span>}
              </label>
              <label className={rotulo}>Empreendimento
                <select className={campo} value={form.empreendimentoId} onChange={e => set("empreendimentoId", e.target.value)}>
                  <option value="">Nenhum</option>{opcoes.data?.empreendimentos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </label>
              <label className={rotulo}>Lote / chácara
                <input className={campo} maxLength={20} value={form.loteCodigo} onChange={e => set("loteCodigo", e.target.value.toUpperCase())} placeholder="Opcional" />
              </label>
              <label className={rotulo}>Imóvel
                <select className={campo} value={form.imovelId} onChange={e => set("imovelId", e.target.value)}>
                  <option value="">Nenhum</option>{opcoes.data?.imoveis.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </label>
              <div className={rotulo}>
                <label htmlFor="rf-cli">Cliente (cadastro de Clientes)</label>
                {form.clienteId ? (
                  <div className="mt-1 flex h-11 items-center justify-between rounded-md border border-border px-3 text-sm text-foreground">
                    <span className="truncate">{form.clienteNome || `Cliente ${form.clienteId}`}</span>
                    {editavel && <button type="button" aria-label="Remover cliente" className="p-2" onClick={() => { set("clienteId", ""); set("clienteNome", ""); }}><X className="h-4 w-4" /></button>}
                  </div>
                ) : (
                  <>
                    <input id="rf-cli" className={campo} value={buscaCli} onChange={e => setBuscaCli(e.target.value)} placeholder="Digite 2 letras do nome" autoComplete="off" />
                    {buscaDeb.length >= 2 && (
                      <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover text-sm text-foreground">
                        {opcoes.isFetching ? <li className="p-2 text-muted-foreground">Buscando…</li>
                          : opcoes.data?.clientes.length ? opcoes.data.clientes.map(c => (
                            <li key={c.id}><button type="button" className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setForm(x => ({ ...x, clienteId: String(c.id), clienteNome: c.nome })); setSujo(true); setBuscaCli(""); }}>{c.nome}</button></li>
                          )) : <li className="p-2 text-muted-foreground">Nenhum cliente com esse nome.</li>}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <label className={rotulo}>Responsável
                <select className={campo} value={form.responsavelUserId} disabled={perfil === "corretor"} onChange={e => set("responsavelUserId", e.target.value)}>
                  {perfil === "corretor" ? <option value="">Você</option> : <option value="">Eu mesmo</option>}
                  {opcoes.data?.equipe.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </label>
              <label className={`${rotulo} sm:col-span-2`}>Descrição
                <textarea className={`${campo} h-28 py-2`} maxLength={5000} value={form.descricao} onChange={e => set("descricao", e.target.value)} placeholder="O que foi feito, observações e contexto" />
              </label>
            </fieldset>
          </section>

          {!novo && r && (
            <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="fts">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 id="fts" className="text-sm font-semibold">Fotos da atividade <span className="font-normal text-muted-foreground">({fotos.length}/{r.limites.maxFotos})</span></h2>
                {editavel && (
                  <div className="flex flex-wrap gap-2">
                    {ehToque() && <Button variant="outline" className="min-h-11" disabled={!!enviando} onClick={() => camRef.current?.click()}><Camera className="h-4 w-4 mr-1" />Câmera</Button>}
                    <Button className="min-h-11" disabled={!!enviando} onClick={() => galRef.current?.click()}><ImagePlus className="h-4 w-4 mr-1" />{ehToque() ? "Galeria" : "Adicionar fotos"}</Button>
                    <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { enviarFotos(e.target.files, "camera"); e.target.value = ""; }} />
                    <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="hidden" onChange={e => { enviarFotos(e.target.files, ehToque() ? "gallery" : "desktop_upload"); e.target.value = ""; }} />
                  </div>
                )}
              </div>
              {editavel && (
                <label className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={geo} onChange={e => setGeo(e.target.checked)} />
                  <span><MapPin className="inline h-3 w-3" aria-hidden /> Anexar a minha localização às fotos que eu enviar agora (opcional, com sua autorização no aparelho). Sem isso, nenhuma localização é registrada.</span>
                </label>
              )}
              {enviando && (
                <div className="mb-3 rounded-md bg-muted p-2 text-xs" role="status" aria-live="polite">
                  <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />Enviando {enviando.feito}/{enviando.total}…
                </div>
              )}
              {!fotos.length ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma foto ainda. {editavel ? "Use os botões acima para adicionar (JPEG, PNG ou WebP, até 15 MB cada)." : ""}</p>
              ) : (
                <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {fotos.map((ft, i) => (
                    <li key={ft.id} className="overflow-hidden rounded-lg border border-border bg-background">
                      <button type="button" className="block aspect-[4/3] w-full bg-muted" onClick={() => setVer(ft.uid)} aria-label={`Ampliar foto ${i + 1}`}>
                        <img src={miniatura(ft.uid)} alt={ft.legenda || `Foto ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                      </button>
                      <div className="space-y-2 p-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Foto {i + 1}</span>
                          <span>{ft.capturadaEm ? `câmera: ${new Date(ft.capturadaEm).toLocaleDateString("pt-BR")}` : ft.enviadaEm ? `enviada ${new Date(ft.enviadaEm).toLocaleDateString("pt-BR")}` : ""}{ft.geo ? " · com local" : ""}</span>
                        </div>
                        <LegendaFoto valor={ft.legenda} editavel={editavel} onSalvar={v => atualizarFoto.mutate({ id, fotoId: ft.id, legenda: v })} rotuloAria={`Legenda da foto ${i + 1}`} />
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" className="h-4 w-4" checked={ft.incluirCliente} disabled={!editavel} onChange={e => atualizarFoto.mutate({ id, fotoId: ft.id, incluirCliente: e.target.checked })} />
                          Incluir na versão do cliente
                        </label>
                        {editavel && (
                          <div className="flex gap-1">
                            <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Mover para cima" disabled={i === 0 || reordenar.isPending} onClick={() => mover(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Mover para baixo" disabled={i === fotos.length - 1 || reordenar.isPending} onClick={() => mover(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" className="ml-auto h-11 w-11 text-destructive" aria-label="Remover foto" onClick={() => setConfirmar({ foto: ft.id })}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        {!novo && r && (
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-labelledby="pdf">
              <h2 id="pdf" className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" aria-hidden />PDF do relatório</h2>
              <p className="text-xs text-muted-foreground">O PDF usa as prévias das fotos; os originais continuam preservados. {r.status === "draft" ? "Rascunho sai com a marca RASCUNHO." : ""}</p>
              <div className="grid gap-2">
                <Button variant="outline" className="min-h-11 justify-start" disabled={!fotos.length} onClick={() => setPrevia({ url: urlPdf(false, "previa=1"), cliente: false })}><Eye className="h-4 w-4 mr-2" />Prévia (interna)</Button>
                <Button variant="outline" className="min-h-11 justify-start" disabled={!fotos.some(x => x.incluirCliente)} onClick={() => setPrevia({ url: urlPdf(true, "previa=1"), cliente: true })}><Eye className="h-4 w-4 mr-2" />Prévia (versão do cliente)</Button>
                <Button variant="outline" className="min-h-11 justify-start" disabled={!fotos.length} onClick={() => baixar(false)}><Download className="h-4 w-4 mr-2" />Baixar PDF interno</Button>
                <Button variant="outline" className="min-h-11 justify-start" disabled={!fotos.some(x => x.incluirCliente)} onClick={() => baixar(true)}><Download className="h-4 w-4 mr-2" />Baixar PDF do cliente</Button>
                <Button variant="outline" className="min-h-11 justify-start" disabled={!fotos.some(x => x.incluirCliente)} onClick={compartilhar}><Share2 className="h-4 w-4 mr-2" />Compartilhar PDF do cliente</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Compartilhar envia o arquivo pelo seu aparelho; nenhum link público é criado.</p>
            </section>
            <section className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold">Resumo</h2>
              <p><span className="text-muted-foreground">Responsável: </span>{r.nomes.responsavel}</p>
              <p><span className="text-muted-foreground">Criado por: </span>{r.nomes.criadoPor}{r.criadoEm ? ` em ${new Date(r.criadoEm).toLocaleString("pt-BR")}` : ""}</p>
              {r.finalizadoEm && <p><span className="text-muted-foreground">Finalizado: </span>{new Date(r.finalizadoEm).toLocaleString("pt-BR")}{r.nomes.finalizadoPor ? ` por ${r.nomes.finalizadoPor}` : ""}</p>}
              <p><span className="text-muted-foreground">Fotos para o cliente: </span>{fotos.filter(x => x.incluirCliente).length} de {fotos.length}</p>
              <p className="pt-2 text-[11px] text-muted-foreground">{AVISO_REGISTRO}</p>
            </section>
            {editavel && (
              <section className="rounded-xl border border-border bg-card p-4 space-y-2">
                <Button className="w-full min-h-11" disabled={!fotos.length || sujo || finalizar.isPending} onClick={() => setConfirmar("finalizar")}><CheckCircle2 className="h-4 w-4 mr-1" />Finalizar relatório</Button>
                {sujo && <p className="text-[11px] text-muted-foreground">Salve as alterações antes de finalizar.</p>}
                <Button variant="ghost" className="w-full min-h-11 text-destructive" onClick={() => setConfirmar("excluir")}><Trash2 className="h-4 w-4 mr-1" />Excluir rascunho</Button>
              </section>
            )}
          </aside>
        )}
      </div>

      <Confirmar aberto={confirmar === "finalizar"} titulo="Finalizar o relatório?" acao="Finalizar"
        texto="Depois de finalizado, o relatório fica somente leitura. Correções serão feitas em um novo rascunho derivado, sem alterar este final."
        onFechar={() => setConfirmar(null)} onConfirmar={() => { setConfirmar(null); finalizar.mutate({ id }); }} />
      <Confirmar aberto={confirmar === "excluir"} titulo="Excluir este rascunho?" acao="Excluir" perigo
        texto="O rascunho sai da lista. Relatórios finais não podem ser excluídos por aqui."
        onFechar={() => setConfirmar(null)} onConfirmar={() => { setConfirmar(null); excluir.mutate({ id }); }} />
      <Confirmar aberto={typeof confirmar === "object" && confirmar !== null} titulo="Remover esta foto do rascunho?" acao="Remover" perigo
        texto="A foto deixa de aparecer no relatório e no PDF."
        onFechar={() => setConfirmar(null)} onConfirmar={() => { const c = confirmar as { foto: number }; setConfirmar(null); removerFoto.mutate({ id, fotoId: c.foto }); }} />

      <Dialog open={!!previa} onOpenChange={o => !o && setPrevia(null)}>
        <DialogContent className="max-w-4xl w-[96vw] h-[88vh] flex flex-col">
          <DialogHeader><DialogTitle>Prévia {previa?.cliente ? "— versão do cliente" : "— versão interna"}</DialogTitle></DialogHeader>
          {previa && <iframe title="Prévia do PDF" src={previa.url} className="flex-1 w-full rounded-md border border-border bg-white" />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!ver} onOpenChange={o => !o && setVer(null)}>
        <DialogContent className="max-w-5xl w-[96vw]">
          <DialogHeader><DialogTitle>Foto</DialogTitle></DialogHeader>
          {ver && <img src={miniatura(ver, "previa")} alt="Foto ampliada" className="max-h-[75vh] w-full object-contain" />}
          {ver && <a className="text-xs text-primary underline" href={miniatura(ver, "original")}>Baixar o original</a>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Legenda salva ao sair do campo (sem salvar a cada tecla) */
function LegendaFoto({ valor, editavel, onSalvar, rotuloAria }: { valor: string; editavel: boolean; onSalvar: (v: string) => void; rotuloAria: string }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  if (!editavel) return <p className="text-sm">{valor || <span className="text-muted-foreground">Sem legenda.</span>}</p>;
  return (
    <textarea aria-label={rotuloAria} className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-base md:text-sm" rows={2} maxLength={1000}
      placeholder="Legenda da foto" value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== valor) onSalvar(v); }} />
  );
}
