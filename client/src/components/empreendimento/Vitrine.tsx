import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import PainelLote, { type LotePainel } from "@/components/empreendimento/PainelLote";
import { COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_LOTE } from "@shared/lotes";
import { MapPin, Maximize2, Minimize2, MousePointerClick } from "lucide-react";

/**
 * Vitrine do empreendimento — usada no Painel do corretor e no portal do empreendedor:
 * logo e portal em destaque (cabeçalho) e o mapa de vendas clicável com o painel da chácara.
 */

/** Identidade visual de cada empreendimento (arquivos em client/public/<slug>/); sem arquivo, cai no monograma */
export const VISUAL: Record<string, { logo: string; capa: string }> = {
  "bom-jardims": { logo: "/bom-jardims/logo-520.webp", capa: "/bom-jardims/portal-dia-1200.webp" },
};
const iniciais = (nome: string) => nome.replace(/^(condom[ií]nio|loteamento|residencial)( de)?( ch[aá]caras)?/i, "").trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "E";

export function Logo({ slug, nome, className }: { slug: string; nome: string; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  const v = VISUAL[slug];
  if (!v || falhou) {
    return <div className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/80 to-emerald-700/80 text-2xl font-bold text-white [font-family:var(--rt-font-title)] ${className ?? ""}`}>{iniciais(nome)}</div>;
  }
  return <img src={v.logo} alt={`Logo ${nome}`} onError={() => setFalhou(true)} className={`object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] ${className ?? ""}`} />;
}

export const saudacaoDoDia = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

/** Cabeçalho: portal de fundo, logo em destaque, nome, cidade e disponíveis; `acao` à direita (ex.: Novo contrato) */
export function CabecalhoEmpreendimento({ slug, nome, municipio, uf, disponiveis, nomeUsuario, acao }: {
  slug: string; nome: string; municipio?: string | null; uf?: string | null; disponiveis?: number | null; nomeUsuario?: string; acao?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--rt-gold)]/30 bg-card">
      {VISUAL[slug] && <img src={VISUAL[slug].capa} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/30" />
      <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
        <Logo slug={slug} nome={nome} className="h-24 w-40 shrink-0 self-center sm:h-32 sm:w-56 sm:self-auto" />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          {nomeUsuario && <p className="text-sm text-white/70">{saudacaoDoDia()}, <b className="text-white">{nomeUsuario}</b></p>}
          <h1 className="text-2xl font-bold leading-tight text-[var(--rt-gold-light)] sm:text-3xl [font-family:var(--rt-font-title)]">{nome}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs sm:justify-start">
            {(municipio || uf) && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-white/80 backdrop-blur"><MapPin className="h-3 w-3" />{[municipio, uf].filter(Boolean).join("/")}</span>}
            {disponiveis != null && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2.5 py-1 font-semibold text-emerald-200 backdrop-blur">{disponiveis} chácaras disponíveis</span>}
          </div>
        </div>
        {acao}
      </div>
    </section>
  );
}

type LoteMapa = LotePainel & { poligono: [number, number][] | null };

/**
 * Mapa de vendas (ruas, rio, pontos e áreas do mapa.json) com tela cheia para apresentar ao cliente e, ao clicar,
 * o painel da chácara — no celular a tela desce até ele. `acimaDoPainel` recebe a chácara (ex.: botão Fazer contrato);
 * `atualizarCadaMs` mantém o mapa em dia sozinho (portal do empreendedor).
 */
export function MapaVendas({ slug, ajuda, acimaDoPainel, atualizarCadaMs }: {
  slug: string; ajuda: string; acimaDoPainel?: (lote: LoteMapa) => React.ReactNode; atualizarCadaMs?: number;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { enabled: !!slug, refetchInterval: atualizarCadaMs, meta: { silencioso: true } });
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [slug]);
  const lotes = (data?.lotes ?? []) as LoteMapa[];
  const selecionado = useMemo(() => lotes.find(l => l.id === sel) ?? null, [lotes, sel]);
  const painelRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<HTMLElement>(null);
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    const f = () => setCheia(document.fullscreenElement === mapaRef.current);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  // Apresentação ao cliente: tela cheia (computador, tablet e Android; no iPhone o navegador não deixa)
  const telaCheia = () => {
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    const el = mapaRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => toast.error("Este navegador não permite tela cheia — use o botão de ampliar do mapa"));
    else toast.error("Este navegador não permite tela cheia — use o botão de ampliar do mapa");
  };
  // Celular: ao tocar numa chácara, desce até o painel dela
  useEffect(() => {
    if (sel && window.innerWidth < 1024) painelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel]);

  if (error) return <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">{error.message}</p>;
  if (isLoading || !data) return <div className="h-[420px] animate-pulse rounded-2xl border border-border bg-card" />;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px]">
      <section ref={mapaRef} className="overflow-hidden rounded-2xl border border-border bg-card [&:fullscreen]:overflow-auto [&:fullscreen]:rounded-none">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">Mapa de vendas</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {SITUACOES_LOTE.filter(s => data.resumo[s] > 0).map(s => (
              <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[s] }} />{ROTULO_SITUACAO[s]} <b className="text-foreground">{data.resumo[s]}</b></span>
            ))}
          </div>
          <button type="button" onClick={telaCheia}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--rt-gold)]/50 px-3 py-1 text-xs font-semibold text-[var(--rt-gold-light)] transition hover:bg-[var(--rt-gold)]/15">
            {cheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {cheia ? "Sair da tela cheia" : "Tela cheia"}
          </button>
        </div>
        <div className="p-1 sm:p-2">
          <MapaTematico slug={slug} lotes={lotes} ruas={data.ruas} perimetro={data.perimetro?.poligono} selecionado={sel} onSelecionar={setSel} semLegenda />
        </div>
      </section>
      <div ref={painelRef} className="scroll-mt-4 lg:sticky lg:top-4">
        {selecionado ? (
          <div className="space-y-2">
            {acimaDoPainel?.(selecionado)}
            <PainelLote slug={slug} lote={selecionado} onMudou={() => utils.empreendimentosAdmin.detalhe.invalidate({ slug })} onFechar={() => setSel(null)} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            <MousePointerClick className="h-8 w-8 text-[var(--rt-gold)]" />
            <p className="font-medium text-foreground">Toque numa chácara no mapa</p>
            <p className="text-xs">{ajuda}</p>
          </div>
        )}
      </div>
    </div>
  );
}
