import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { AlertTriangle, Map as MapIcon } from "lucide-react";

/** Lista dos empreendimentos (loteamentos / condomínios) com o resumo das vendas */
export default function Empreendimentos() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.empreendimentosAdmin.lista.useQuery();
  return (
    <div>
      <PageHeader icone={MapIcon} titulo="Empreendimentos" subtitulo="Mapa dos lotes, reservas e vendas, arquivos e memoriais" />
      <div className="px-4 md:px-6 pb-8 max-w-[1100px] mx-auto grid gap-3 md:grid-cols-2">
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {(data ?? []).map(e => (
          <button key={e.slug} onClick={() => navigate(`/empreendimentos/${e.slug}`)} className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/50">
            <p className="font-semibold">{e.nome}</p>
            <p className="text-xs text-muted-foreground">{[e.municipio, e.uf].filter(Boolean).join("/")}</p>
            <div className="mt-3 flex gap-4 text-sm">
              <span><b className="text-lg">{e.totalLotes}</b> lotes</span>
              <span className="text-emerald-300"><b className="text-lg">{e.disponiveis}</b> disponíveis</span>
              <span className="text-rose-300"><b className="text-lg">{e.vendidos}</b> vendidos</span>
            </div>
            {e.semRegistro && <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="h-3 w-3" /> sem registro no cartório informado</p>}
          </button>
        ))}
      </div>
    </div>
  );
}
