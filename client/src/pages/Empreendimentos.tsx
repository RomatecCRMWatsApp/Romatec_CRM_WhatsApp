import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import { AlertTriangle, Lock, Map as MapIcon } from "lucide-react";

type Resumo = { slug: string; nome: string; municipio: string | null; uf: string | null; totalLotes: number; disponiveis: number; vendidos: number; semRegistro: boolean; acesso: boolean };

/** Prévia do mapa temático (miniatura, sem clique nos lotes) */
function PreviaMapa({ slug }: { slug: string }) {
  const { data, isLoading } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { staleTime: 60_000 });
  if (isLoading || !data) return <div className="h-full min-h-[180px] animate-pulse rounded-xl bg-white/5" />;
  return (
    <div className="pointer-events-none">
      <MapaTematico slug={slug} lotes={data.lotes as any} ruas={data.ruas} perimetro={data.perimetro?.poligono} compacto semLegenda />
    </div>
  );
}

function Cartao({ e }: { e: Resumo }) {
  const [, navigate] = useLocation();
  // Corretor não habilitado: o empreendimento aparece, mas não abre (o servidor também recusa)
  if (!e.acesso) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card p-4 opacity-70">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-semibold">{e.nome}</p>
          <p className="text-xs text-muted-foreground">{[e.municipio, e.uf].filter(Boolean).join("/")} · sem acesso — peça ao administrador para habilitar</p>
        </div>
      </div>
    );
  }
  return (
    <button onClick={() => navigate(`/empreendimentos/${e.slug}`)}
      className="grid w-full gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col">
        <p className="text-lg font-semibold">{e.nome}</p>
        <p className="text-xs text-muted-foreground">{[e.municipio, e.uf].filter(Boolean).join("/")}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/5 p-2"><p className="text-2xl font-bold">{e.totalLotes}</p><p className="text-[11px] text-muted-foreground">lotes</p></div>
          <div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-2xl font-bold text-emerald-300">{e.disponiveis}</p><p className="text-[11px] text-muted-foreground">disponíveis</p></div>
          <div className="rounded-lg bg-rose-500/10 p-2"><p className="text-2xl font-bold text-rose-300">{e.vendidos}</p><p className="text-[11px] text-muted-foreground">vendidos</p></div>
        </div>
        {e.semRegistro && <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" /> sem registro no cartório informado</p>}
        <p className="mt-auto pt-3 text-xs text-primary">Abrir mapa, lotes e documentos →</p>
      </div>
      <PreviaMapa slug={e.slug} />
    </button>
  );
}

/** Lista dos empreendimentos (loteamentos / condomínios) com o resumo das vendas e a prévia do mapa */
export default function Empreendimentos() {
  const { data, isLoading, error } = trpc.empreendimentosAdmin.lista.useQuery();
  return (
    <div>
      <PageHeader icone={MapIcon} titulo="Empreendimentos" subtitulo="Mapa dos lotes, reservas e vendas, arquivos e memoriais" />
      <div className="px-4 md:px-6 pb-8 max-w-[1300px] mx-auto space-y-4">
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {/* Só os liberados para quem está vendo (admin e secretária: todos) */}
        {(data ?? []).filter(e => e.acesso).map(e => <Cartao key={e.slug} e={e} />)}
        {data && !data.some(e => e.acesso) && <p className="text-sm text-muted-foreground">Nenhum empreendimento liberado para você ainda — peça ao administrador.</p>}
      </div>
    </div>
  );
}
