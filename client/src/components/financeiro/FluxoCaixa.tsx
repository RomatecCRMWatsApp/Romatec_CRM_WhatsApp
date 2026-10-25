import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { brl } from "@shared/simulador";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const inicioDoAno = () => `${hoje().slice(0, 4)}-01-01`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloPeriodo = (p: string) => (p === "ATRASADO" ? "Em atraso" : p.length === 7 ? `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}` : p.split("-").reverse().join("/"));
const FORMA: Record<string, string> = { PIX: "PIX", BOLETO: "Boleto", TRANSFERENCIA: "Transferência", DINHEIRO: "Dinheiro", CARTAO: "Cartão", OUTRO: "Outro" };

/** Fluxo de caixa: recebimentos do período (dia/mês) com saldo acumulado, por forma, e a previsão de entradas */
export default function FluxoCaixa() {
  const [de, setDe] = useState(inicioDoAno());
  const [ate, setAte] = useState(hoje());
  const [agrupar, setAgrupar] = useState<"mes" | "dia">("mes");
  const { data, isLoading, error } = trpc.financeiro.fluxoCaixa.useQuery({ de, ate, agrupar }, { enabled: !!de && !!ate && de <= ate });
  const maior = Math.max(1, ...(data?.serie ?? []).map(s => s.entradas));
  const maiorPrev = Math.max(1, ...(data?.previsao ?? []).map(s => s.valor));
  const campo = "h-9 rounded-lg border border-border bg-background px-2 text-sm";
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">De<input type="date" value={de} onChange={e => setDe(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Agrupar
          <select value={agrupar} onChange={e => setAgrupar(e.target.value as any)} className={campo}><option value="mes">Por mês</option><option value="dia">Por dia</option></select>
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[["Saldo antes do período", data.saldoInicial], ["Recebido no período", data.totalEntradas], ["Acumulado no fim", data.saldoFinal]].map(([r, v]) => (
              <div key={r as string} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-lg font-bold">{brl(v as number)}</p></div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">Recebimentos</h3>
              {!data.serie.length ? <p className="text-xs text-muted-foreground">Nenhum recebimento no período.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Período</th><th className="py-1 w-1/2" /><th className="py-1 text-right">Entradas</th><th className="py-1 text-right">Acumulado</th></tr></thead>
                  <tbody>
                    {data.serie.map(s => (
                      <tr key={s.periodo} className="border-t border-border/50">
                        <td className="py-1.5 whitespace-nowrap">{rotuloPeriodo(s.periodo)}</td>
                        <td className="py-1.5"><div className="h-2.5 rounded bg-emerald-500/70" style={{ width: `${Math.max(2, (s.entradas / maior) * 100)}%` }} /></td>
                        <td className="py-1.5 text-right">{brl(s.entradas)}</td><td className="py-1.5 text-right text-muted-foreground">{brl(s.acumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">Por forma de pagamento</h3>
              {!data.porForma.length ? <p className="text-xs text-muted-foreground">—</p> : data.porForma.map(f => (
                <p key={f.forma} className="flex justify-between border-t border-border/50 py-1.5 text-sm first:border-0"><span>{FORMA[f.forma] ?? f.forma}</span><b>{brl(f.valor)}</b></p>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Previsão de entradas <span className="font-normal text-muted-foreground">(parcelas em aberto por mês de vencimento)</span></h3>
            {!data.previsao.length ? <p className="text-xs text-muted-foreground">Nenhuma parcela em aberto.</p> : (
              <div className="space-y-1">
                {data.previsao.slice(0, 24).map(p => (
                  <div key={p.mes} className="flex items-center gap-2 text-sm">
                    <span className={`w-24 shrink-0 ${p.mes === "ATRASADO" ? "font-semibold text-red-300" : ""}`}>{rotuloPeriodo(p.mes)}</span>
                    <div className="h-2.5 flex-1 rounded bg-secondary"><div className={`h-full rounded ${p.mes === "ATRASADO" ? "bg-red-500/70" : "bg-sky-500/60"}`} style={{ width: `${Math.max(2, (p.valor / maiorPrev) * 100)}%` }} /></div>
                    <span className="w-28 text-right">{brl(p.valor)}</span>
                  </div>
                ))}
                {data.previsao.length > 24 && <p className="text-xs text-muted-foreground">… e mais {data.previsao.length - 24} meses.</p>}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
