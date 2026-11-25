import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calculator, Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const reais = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(v ?? "—");
};
const SITUACAO: Record<string, string> = { calculado: "Calculado", calculado_com_erros: "Calculado com erros", nao_calculado: "Não calculado" };
const campo = "mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground";

interface Props { contratoId: number; valorSugerido?: number | null }

/**
 * Simulação de CBS/IBS da venda (só o administrador). Usa as calculadoras oficiais da Receita pelo AvalieImob.
 * Os códigos fiscais (NBS, CST, cClassTrib) são informados aqui e confirmados com o contador; a tela repete os da última simulação.
 */
export default function SimuladorCbsIbs({ contratoId, valorSugerido }: Props) {
  const sit = trpc.tributos.situacao.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const disponivel = !!sit.data?.disponivel;
  const hist = trpc.tributos.doContrato.useQuery({ contratoId }, { enabled: disponivel });
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [dataOp, setDataOp] = useState("");
  const [valor, setValor] = useState(valorSugerido ? valorSugerido.toFixed(2).replace(".", ",") : "");
  const [nbs, setNbs] = useState("");
  const [cst, setCst] = useState("");
  const [cct, setCct] = useState("");
  const [opcoes, setOpcoes] = useState<{ cst: string; cClassTrib: string; descricao: string }[]>([]);

  useEffect(() => {
    const u = hist.data?.ultimosCodigos;
    if (u && !nbs && !cst && !cct) { setNbs(u.nbs); setCst(u.cst); setCct(u.cClassTrib); }
  }, [hist.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscar = trpc.tributos.classificacoes.useMutation({
    onSuccess: r => { setOpcoes(r.opcoes); if (!r.opcoes.length) toast.info("Nenhuma classificação para este NBS nesta data"); },
    onError: e => toast.error(e.message),
  });
  const simular = trpc.tributos.simular.useMutation({
    onSuccess: () => { toast.success("Simulação feita"); utils.tributos.doContrato.invalidate({ contratoId }); },
    onError: e => toast.error(e.message),
  });

  if (!disponivel) return null;
  const ultima = hist.data?.simulacoes?.[0];
  const res: any = ultima?.resultado ?? null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">CBS/IBS (simulação)</h2>
        <Button size="sm" variant="outline" onClick={() => setAberto(a => !a)}><Calculator className="h-4 w-4" /> {aberto ? "Fechar" : "Simular CBS/IBS"}</Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{hist.data?.aviso}</p>

      {aberto && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="block text-xs text-muted-foreground">Data da operação (confirme)
            <input type="date" value={dataOp} onChange={e => setDataOp(e.target.value)} className={campo} />
          </label>
          <label className="block text-xs text-muted-foreground">Valor da operação (R$)
            <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="166.230,00" className={campo} />
          </label>
          <p className="rounded-md bg-warn-400/10 p-2 text-[11px] text-warn-300">
            Os códigos da venda de lotes ainda aguardam o contador. Informe os confirmados por ele: o sistema não sugere código.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block min-w-0 text-xs text-muted-foreground">NBS (9 dígitos)
              <input inputMode="numeric" maxLength={9} value={nbs} onChange={e => setNbs(e.target.value.replace(/\D/g, ""))} className={campo} />
            </label>
            <label className="block min-w-0 text-xs text-muted-foreground">CST
              <input inputMode="numeric" maxLength={3} value={cst} onChange={e => setCst(e.target.value.replace(/\D/g, ""))} className={campo} />
            </label>
            <label className="block min-w-0 text-xs text-muted-foreground">cClassTrib
              <input inputMode="numeric" maxLength={6} value={cct} onChange={e => setCct(e.target.value.replace(/\D/g, ""))} className={campo} />
            </label>
          </div>
          <Button size="sm" variant="ghost" disabled={nbs.length !== 9 || !dataOp || buscar.isPending} onClick={() => buscar.mutate({ nbs, data: dataOp })}>
            {buscar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Ver as classificações deste NBS
          </Button>
          {!!opcoes.length && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {opcoes.map(o => (
                <button key={`${o.cst}-${o.cClassTrib}`} type="button" onClick={() => { setCst(o.cst); setCct(o.cClassTrib); }}
                  className={`block w-full rounded px-2 py-1 text-left text-xs hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${o.cst === cst && o.cClassTrib === cct ? "bg-secondary" : ""}`}>
                  <b>CST {o.cst} · {o.cClassTrib}</b> — {o.descricao}
                </button>
              ))}
            </div>
          )}
          <Button disabled={!dataOp || !valor || nbs.length !== 9 || cst.length !== 3 || cct.length !== 6 || simular.isPending}
            onClick={() => simular.mutate({ contratoId, dataOperacao: dataOp, valor, nbs, cst, cClassTrib: cct })}>
            {simular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Simular
          </Button>
        </div>
      )}

      {res && (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
          <p className="font-semibold">Última: {br(ultima!.dataOperacao)} · {reais(ultima!.valor)} · {SITUACAO[ultima!.situacao] ?? ultima!.situacao}</p>
          {res.totais && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Base de cálculo</span><span className="text-right tabular-nums">{reais(res.totais.base_calculo)}</span>
              <span className="text-muted-foreground">CBS</span><span className="text-right tabular-nums">{reais(res.totais.cbs)}</span>
              <span className="text-muted-foreground">IBS</span><span className="text-right tabular-nums">{reais(res.totais.ibs)}</span>
              {res.totais.is != null && Number(res.totais.is) > 0 && <><span className="text-muted-foreground">IS</span><span className="text-right tabular-nums">{reais(res.totais.is)}</span></>}
            </div>
          )}
          {(res.itens ?? []).flatMap((i: any) => i?.erros ?? []).map((e: any, k: number) => (
            <p key={k} className="text-danger-300">{typeof e === "string" ? e : e?.mensagem ?? JSON.stringify(e)}</p>
          ))}
          {(res.avisos ?? []).slice(1).map((a: string) => <p key={a} className="text-muted-foreground">{a}</p>)}
          <p className="text-[11px] text-muted-foreground">Códigos: NBS {ultima!.nbs} · CST {ultima!.cst ?? "—"} · cClassTrib {ultima!.cClassTrib}</p>
          {(hist.data?.simulacoes.length ?? 0) > 1 && <p className="text-[11px] text-muted-foreground">{hist.data!.simulacoes.length - 1} simulação(ões) anterior(es) guardada(s) neste contrato.</p>}
        </div>
      )}
    </section>
  );
}
