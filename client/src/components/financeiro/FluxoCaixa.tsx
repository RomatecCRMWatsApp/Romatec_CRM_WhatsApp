import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { brl } from "@shared/simulador";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const inicioDoAno = () => `${hoje().slice(0, 4)}-01-01`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloPeriodo = (p: string) => (p === "ATRASADO" ? "Em atraso" : p.length === 7 ? `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}` : p.split("-").reverse().join("/"));
const FORMA: Record<string, string> = { PIX: "PIX", BOLETO: "Boleto", TRANSFERENCIA: "Transferência", DINHEIRO: "Dinheiro", CARTAO: "Cartão", OUTRO: "Outro" };
const cor = (v: number) => (v < 0 ? "text-red-300" : "");

/**
 * Fluxo de caixa: entradas (parcelas recebidas) e saídas (despesas pagas) do período, por dia/mês, com o saldo
 * acumulado; entradas por forma, saídas por categoria; previsão por mês (a receber × a pagar).
 */
export default function FluxoCaixa() {
  const [de, setDe] = useState(inicioDoAno());
  const [ate, setAte] = useState(hoje());
  const [agrupar, setAgrupar] = useState<"mes" | "dia">("mes");
  const [emp, setEmp] = useState("");
  const { data: emps } = trpc.financeiro.empreendimentosDespesa.useQuery();
  const { data, isLoading, error } = trpc.financeiro.fluxoCaixa.useQuery(
    { de, ate, agrupar, empreendimentoId: emp === "" ? null : Number(emp) }, { enabled: !!de && !!ate && de <= ate });
  const maior = Math.max(1, ...(data?.serie ?? []).flatMap(s => [s.entradas, s.saidas]));
  const maiorPrev = Math.max(1, ...(data?.previsao ?? []).flatMap(s => [s.valor, s.pagar]));
  const campo = "h-9 rounded-lg border border-border bg-background px-2 text-sm";
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">De<input type="date" value={de} onChange={e => setDe(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Agrupar
          <select value={agrupar} onChange={e => setAgrupar(e.target.value as any)} className={campo}><option value="mes">Por mês</option><option value="dia">Por dia</option></select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Empreendimento
          <select value={emp} onChange={e => setEmp(e.target.value)} className={campo}><option value="">Todos</option><option value="0">Só o escritório</option>{(emps ?? []).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {([["Saldo antes do período", data.saldoInicial, cor(data.saldoInicial)], ["Entradas", data.totalEntradas, "text-emerald-300"], ["Saídas", data.totalSaidas, "text-red-300"],
              ["Resultado do período", data.resultado, cor(data.resultado)], ["Saldo no fim", data.saldoFinal, cor(data.saldoFinal)]] as const).map(([r, v, c]) => (
              <div key={r} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className={`text-lg font-bold ${c}`}>{brl(v)}</p></div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Movimento</h3>
            {!data.serie.length ? <p className="text-xs text-muted-foreground">Nenhuma entrada ou saída no período.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Período</th><th className="w-1/3 py-1" /><th className="py-1 text-right">Entradas</th><th className="py-1 text-right">Saídas</th><th className="py-1 text-right">Saldo</th><th className="py-1 text-right">Acumulado</th></tr></thead>
                  <tbody>
                    {data.serie.map(s => (
                      <tr key={s.periodo} className="border-t border-border/50">
                        <td className="whitespace-nowrap py-1.5">{rotuloPeriodo(s.periodo)}</td>
                        <td className="space-y-0.5 py-1.5 pr-2">
                          <div className="h-2 rounded bg-emerald-500/70" style={{ width: `${s.entradas ? Math.max(2, (s.entradas / maior) * 100) : 0}%` }} />
                          <div className="h-2 rounded bg-red-500/60" style={{ width: `${s.saidas ? Math.max(2, (s.saidas / maior) * 100) : 0}%` }} />
                        </td>
                        <td className="py-1.5 text-right">{brl(s.entradas)}</td>
                        <td className="py-1.5 text-right text-red-300">{s.saidas ? `− ${brl(s.saidas)}` : "—"}</td>
                        <td className={`py-1.5 text-right font-medium ${cor(s.saldo)}`}>{brl(s.saldo)}</td>
                        <td className={`py-1.5 text-right text-muted-foreground ${cor(s.acumulado)}`}>{brl(s.acumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">Entradas por forma de pagamento</h3>
              {!data.porForma.length ? <p className="text-xs text-muted-foreground">—</p> : data.porForma.map(f => (
                <p key={f.forma} className="flex justify-between border-t border-border/50 py-1.5 text-sm first:border-0"><span>{FORMA[f.forma] ?? f.forma}</span><b>{brl(f.valor)}</b></p>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">Saídas por categoria</h3>
              {!data.porCategoria.length ? <p className="text-xs text-muted-foreground">Nenhuma despesa paga no período. Lance na aba "Despesas".</p> : data.porCategoria.map(c => (
                <p key={c.categoria} className="flex justify-between border-t border-border/50 py-1.5 text-sm first:border-0"><span>{c.categoria}</span><b className="text-red-300">{brl(c.valor)}</b></p>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Previsão <span className="font-normal text-muted-foreground">(parcelas a receber × despesas a pagar, por mês de vencimento)</span></h3>
            {!data.previsao.length ? <p className="text-xs text-muted-foreground">Nada em aberto.</p> : (
              <div className="space-y-2">
                {data.previsao.slice(0, 24).map(p => (
                  <div key={p.mes} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
                    <span className={p.mes === "ATRASADO" ? "font-semibold text-red-300" : ""}>{rotuloPeriodo(p.mes)}</span>
                    <div className="space-y-0.5">
                      <div className="h-2 rounded bg-secondary"><div className={`h-full rounded ${p.mes === "ATRASADO" ? "bg-amber-500/70" : "bg-sky-500/60"}`} style={{ width: `${p.valor ? Math.max(2, (p.valor / maiorPrev) * 100) : 0}%` }} /></div>
                      {p.pagar > 0 && <div className="h-2 rounded bg-secondary"><div className="h-full rounded bg-red-500/60" style={{ width: `${Math.max(2, (p.pagar / maiorPrev) * 100)}%` }} /></div>}
                    </div>
                    <span className="w-56 text-right text-xs">
                      <span className="text-sky-300">{brl(p.valor)}</span>
                      {p.pagar > 0 && <span className="text-red-300"> − {brl(p.pagar)}</span>}
                      <b className={`ml-1 ${cor(p.liquido)}`}>= {brl(p.liquido)}</b>
                    </span>
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
