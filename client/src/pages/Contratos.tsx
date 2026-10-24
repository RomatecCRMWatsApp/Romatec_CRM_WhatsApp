import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { FileSignature, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { COR_STATUS_CONTRATO, ROTULO_STATUS_CONTRATO, type StatusContrato } from "@shared/contratos";
import { brl } from "@shared/simulador";

const FILTROS: { rotulo: string; status?: StatusContrato[] }[] = [
  { rotulo: "Todos" },
  { rotulo: "Em andamento", status: ["rascunho", "minuta", "apto_assinatura", "em_assinatura", "assinado"] },
  { rotulo: "Ativos", status: ["ativo"] },
  { rotulo: "Quitados", status: ["quitado"] },
  { rotulo: "Cancelados", status: ["cancelado", "distratado"] },
];

export function SeloStatus({ status }: { status: string }) {
  const cor = COR_STATUS_CONTRATO[status as StatusContrato] ?? "#888";
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}>
      {ROTULO_STATUS_CONTRATO[status as StatusContrato] ?? status}
    </span>
  );
}

/** Contratos (CPCV): lista com filtro por situação; o corretor vê só os dele */
export default function Contratos() {
  const [, navigate] = useLocation();
  const [filtro, setFiltro] = useState(0);
  const [busca, setBusca] = useState("");
  const { data, isLoading, error } = trpc.contratos.listar.useQuery();
  const lista = useMemo(() => {
    const f = FILTROS[filtro].status;
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(c => (!f || f.includes(c.status as StatusContrato)) &&
      (!q || [c.numero, c.comprador, c.loteCodigo, c.corretor].some(v => String(v).toLowerCase().includes(q))));
  }, [data, filtro, busca]);

  return (
    <div>
      <PageHeader icone={FileSignature} titulo="Contratos" subtitulo="Compromissos de compra e venda: minuta, definitivo, assinatura e cobrança"
        acoes={<Button onClick={() => navigate("/contratos/novo")}><Plus className="h-4 w-4" /> Novo contrato</Button>} />
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f, i) => (
            <button key={f.rotulo} onClick={() => setFiltro(i)}
              className={`rounded-full border px-3 py-1 text-xs ${i === filtro ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {f.rotulo}
            </button>
          ))}
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nº, comprador, chácara…" aria-label="Buscar contrato"
            className="ml-auto h-8 w-full rounded-lg border border-border bg-background px-3 text-sm sm:w-64" />
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {data && !lista.length && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum contrato {filtro ? "nesta situação" : "ainda"}. Use “Novo contrato” para começar pela chácara e pelo plano.
          </p>
        )}
        <div className="grid gap-2">
          {lista.map(c => (
            <button key={c.id} onClick={() => navigate(`/contratos/${c.id}`)}
              className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{c.numero}</span>
                <SeloStatus status={c.status} />
                <span className="text-sm text-muted-foreground">{c.empreendimento} · Chácara {c.loteCodigo}</span>
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
                <p>Comprador: <b className="text-foreground">{c.comprador}</b></p>
                <p>Corretor: <b className="text-foreground">{c.corretor}</b></p>
                <p>{c.modalidade === "avista" ? "À vista" : "Financiado"}{c.total != null ? ` · total ${brl(c.total)}` : ""}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
