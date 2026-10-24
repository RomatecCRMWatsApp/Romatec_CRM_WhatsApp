import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Loader2, Save, Trash2, PenLine } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { abrirPdf, desenharPagina, type DocumentoPdf } from "@/lib/pdf";

/** Caixa normalizada (0..1, origem no canto inferior esquerdo — igual ao pdf-lib); página -1 = última */
type Caixa = { papel: string; pagina: number; x: number; y: number; w: number; h: number };
const PADRAO = { w: 0.36, h: 0.085 };
const CORES = ["#2BD47A", "#5AA9E6", "#C9A84C", "#B07CE0", "#E5484D", "#F59E0B", "#14B8A6"];

/** Posicionar as assinaturas no PDF: escolha o signatário, clique na página e ajuste (arrastar e redimensionar) */
export default function PosicionarAssinaturas() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.contratos.posicoes.useQuery({ id }, { enabled: id > 0 });
  const salvar = trpc.contratos.salvarPosicoes.useMutation({ onSuccess: () => toast.success("Posições salvas"), onError: e => toast.error(e.message) });
  const [doc, setDoc] = useState<DocumentoPdf | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tam, setTam] = useState({ largura: 0, altura: 0 });
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [papel, setPapel] = useState<string | null>(null);
  const [gabarito, setGabarito] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ i: number; modo: "mover" | "tamanho"; x0: number; y0: number; c0: Caixa } | null>(null);

  useEffect(() => { if (data) { setCaixas(data.caixas); setPapel(data.papeis[0]?.papel ?? null); } }, [data]);
  useEffect(() => { if (data?.temPdf) abrirPdf(`/api/contratos/${id}/atual.pdf`).then(d => { setDoc(d); setPagina(d.numPages); }).catch(() => toast.error("Não foi possível abrir o PDF")); }, [data?.temPdf, id]);
  useEffect(() => {
    if (!doc || !canvas.current || !area.current) return;
    desenharPagina(doc, pagina, canvas.current, Math.min(area.current.clientWidth, 760)).then(setTam);
  }, [doc, pagina]);

  const total = doc?.numPages ?? 0;
  const naPagina = (c: Caixa) => c.pagina === pagina || (c.pagina === -1 && pagina === total);
  const cor = (p: string) => CORES[Math.max(0, data?.papeis.findIndex(x => x.papel === p) ?? 0) % CORES.length];
  const rotulo = (p: string) => data?.papeis.find(x => x.papel === p);

  const colocar = (e: React.MouseEvent) => {
    if (!papel || arrasto.current || (e.target as HTMLElement).dataset.caixa) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - r.left) / r.width - PADRAO.w / 2, 0), 1 - PADRAO.w);
    const y = Math.min(Math.max(1 - (e.clientY - r.top) / r.height - PADRAO.h / 2, 0), 1 - PADRAO.h);
    // Na última página grava -1 (continua certo se o PDF ganhar páginas no fim)
    const nova: Caixa = { papel, pagina: pagina === total ? -1 : pagina, x, y, ...PADRAO };
    setCaixas(cs => [...cs.filter(c => c.papel !== papel), nova]);
  };
  const iniciar = (i: number, modo: "mover" | "tamanho") => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    arrasto.current = { i, modo, x0: e.clientX, y0: e.clientY, c0: caixas[i] };
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrasto.current;
    if (!a || !tam.largura) return;
    const dx = (e.clientX - a.x0) / tam.largura, dy = (e.clientY - a.y0) / tam.altura;
    setCaixas(cs => cs.map((c, i) => {
      if (i !== a.i) return c;
      if (a.modo === "mover") return { ...c, x: Math.min(Math.max(a.c0.x + dx, 0), 1 - c.w), y: Math.min(Math.max(a.c0.y - dy, 0), 1 - c.h) };
      const w = Math.min(Math.max(a.c0.w + dx, 0.12), 1 - c.x), h = Math.min(Math.max(a.c0.h + dy, 0.04), a.c0.y + a.c0.h);
      return { ...c, w, h, y: a.c0.y + a.c0.h - h };
    }));
  };
  const soltar = () => { setTimeout(() => { arrasto.current = null; }, 0); };

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (error || !data) return <p className="p-6 text-sm text-red-400">{error?.message ?? "Contrato não encontrado"}</p>;
  const bloqueado = !["rascunho", "minuta", "apto_assinatura"].includes(data.status);
  const faltam = data.papeis.filter(p => !caixas.some(c => c.papel === p.papel));

  return (
    <div>
      <PageHeader icone={PenLine} titulo="Posicionar assinaturas" voltar={{ rotulo: "Contrato", onClick: () => navigate(`/contratos/${id}`) }}
        subtitulo="Escolha o signatário, clique na página para colocar a caixa e ajuste. Sem posições, o sistema acrescenta um quadro de assinaturas no fim." />
      <div className="mx-auto grid max-w-[1300px] gap-4 px-4 pb-10 md:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="space-y-1.5 rounded-xl border border-border bg-card p-3">
            {data.papeis.map(p => {
              const posta = caixas.find(c => c.papel === p.papel);
              return (
                <button key={p.papel} onClick={() => setPapel(p.papel)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${papel === p.papel ? "border-primary bg-primary/10" : "border-border"}`}>
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: cor(p.papel) }} />
                  <span className="min-w-0 flex-1"><b className="block truncate">{p.rotulo}</b><span className="block truncate text-muted-foreground">{p.nome}</span></span>
                  {posta ? <span className="text-[10px] text-emerald-400">pág. {posta.pagina === -1 ? "última" : posta.pagina}</span> : <span className="text-[10px] text-muted-foreground">—</span>}
                </button>
              );
            })}
          </div>
          {!!faltam.length && <p className="text-xs text-amber-300">Sem posição: {faltam.map(f => f.rotulo).join(", ")} — sem todas, vale o quadro de assinaturas automático.</p>}
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={gabarito} onChange={e => setGabarito(e.target.checked)} /> Salvar também como gabarito do modelo ({data.modeloVersao})</label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={bloqueado || salvar.isPending} onClick={() => salvar.mutate({ id, caixas, gabarito })}>
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar posições
            </Button>
            <Button variant="outline" disabled={bloqueado} onClick={() => setCaixas([])}><Trash2 className="h-4 w-4" /> Limpar</Button>
          </div>
          {bloqueado && <p className="text-xs text-muted-foreground">O contrato já foi enviado para assinatura: as posições não mudam mais.</p>}
        </aside>
        <section className="space-y-2">
          {!data.temPdf && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Gere a minuta ou o definitivo antes de posicionar as assinaturas.</p>}
          {total > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>‹</Button>
              <select className="h-8 rounded-md border border-border bg-background px-2" value={pagina} onChange={e => setPagina(Number(e.target.value))} aria-label="Página">
                {Array.from({ length: total }, (_, i) => <option key={i} value={i + 1}>Página {i + 1}{i + 1 === total ? " (última)" : ""}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={pagina >= total} onClick={() => setPagina(p => p + 1)}>›</Button>
              <span className="text-xs text-muted-foreground">de {total}</span>
            </div>
          )}
          <div ref={area} className="w-full">
            <div className="relative mx-auto w-fit cursor-crosshair select-none" onClick={colocar} onPointerMove={mover} onPointerUp={soltar}>
              <canvas ref={canvas} className="block bg-white shadow" />
              {tam.largura > 0 && caixas.map((c, i) => naPagina(c) && (
                <div key={c.papel} data-caixa="1" onPointerDown={iniciar(i, "mover")}
                  className="absolute cursor-move rounded border-2 bg-white/60 text-[10px] font-semibold"
                  style={{ left: c.x * tam.largura, top: (1 - c.y - c.h) * tam.altura, width: c.w * tam.largura, height: c.h * tam.altura, borderColor: cor(c.papel), color: "#0C3320" }}>
                  <span data-caixa="1" className="pointer-events-none block truncate px-1">{rotulo(c.papel)?.rotulo ?? c.papel}</span>
                  <span data-caixa="1" onPointerDown={iniciar(i, "tamanho")} className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize" style={{ background: cor(c.papel) }} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
