import { useState } from "react";
import { CheckCircle2, Clock, FileText, Gift, HandCoins, Scale } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { brl } from "@shared/simulador";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloPeriodo = (p: string) => (p === "ATRASADO" ? "Em atraso" : p.length === 7 ? `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}` : p.split("-").reverse().join("/"));
const dataBr = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const cor = (v: number) => (v < 0 ? "text-danger-300" : "");
const SITUACAO: Record<string, [string, string]> = {
  paga: ["Paga", "bg-ok-500/15 text-ok-300"], a_pagar: ["A pagar", "bg-warn-500/15 text-warn-300"], vencida: ["Vencida", "bg-danger-500/15 text-danger-300"],
};

/**
 * Fluxo de caixa do empreendimento no portal da proprietária: entradas (parcelas recebidas), saídas (despesas pagas),
 * saldo acumulado, previsão e cada despesa com a ciência dela (aguardando ou confirmada, com o PDF assinado).
 */
export default function FluxoCaixaEmpreendedor() {
  const [de, setDe] = useState(`${hoje().slice(0, 4)}-01-01`);
  const [ate, setAte] = useState(hoje());
  const [agrupar, setAgrupar] = useState<"mes" | "dia">("mes");
  const { data, isLoading, error } = trpc.empreendedor.fluxoCaixa.useQuery({ de, ate, agrupar }, { enabled: !!de && !!ate && de <= ate });
  const maior = Math.max(1, ...(data?.serie ?? []).flatMap(s => [s.entradas, s.saidas]));
  const campo = "h-9 rounded-lg border border-border bg-background px-2 text-sm";
  const cientes = (data?.despesas ?? []).filter(x => x.ciencia?.status === "ciente").length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">De<input type="date" value={de} onChange={e => setDe(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Agrupar
          <select value={agrupar} onChange={e => setAgrupar(e.target.value as "mes" | "dia")} className={campo}><option value="mes">Por mês</option><option value="dia">Por dia</option></select>
        </label>
      </div>
      {error && <p className="text-sm text-danger-400">{error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {data === null && <p className="text-sm text-muted-foreground">Sem empreendimento definido no seu acesso.</p>}
      {data && (
        <>
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4 text-primary" /> Seu saldo no empreendimento em {dataBr(data.ate)}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${cor(data.saldo.saldo)}`}>{brl(data.saldo.saldo)}</p>
            <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              <p className="flex justify-between gap-2"><span className="text-muted-foreground">Em caixa (entradas − saídas)</span><span className="tabular-nums">{brl(data.saldo.saldoCaixa)}</span></p>
              <p className="flex justify-between gap-2"><span className="text-muted-foreground">Comissões de gestão já devidas</span><span className="tabular-nums text-danger-300">− {brl(data.saldo.comissoesDevidas)}</span></p>
              <p className="flex justify-between gap-2"><span className="text-muted-foreground">Comissões das concessões a pagar</span><span className="tabular-nums text-danger-300">− {brl(data.saldo.concessoesAPagar)}</span></p>
              <p className="flex justify-between gap-2"><span className="text-muted-foreground">A devolver a quem bancou despesas</span><span className="tabular-nums text-danger-300">− {brl(data.saldo.dividaTerceiros)}</span></p>
            </div>
            {data.comissoes.totalProgramado > 0 && <p className="mt-2 text-xs text-muted-foreground">Ainda programado: {brl(data.comissoes.totalProgramado)} de comissões de gestão, que vencem conforme os compradores pagarem as parcelas.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {([["Saldo antes do período", data.saldoInicial, cor(data.saldoInicial)], ["Entradas", data.totalEntradas, "text-ok-300"], ["Saídas", data.totalSaidas, "text-danger-300"],
              ["Resultado do período", data.resultado, cor(data.resultado)], ["Saldo no fim", data.saldoFinal, cor(data.saldoFinal)]] as const).map(([r, v, c]) => (
              <div key={r} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className={`text-lg font-bold tabular-nums ${c}`}>{brl(v)}</p></div>
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
                          <div className="h-2 rounded bg-ok-500/70" style={{ width: `${s.entradas ? Math.max(2, (s.entradas / maior) * 100) : 0}%` }} />
                          <div className="h-2 rounded bg-danger-500/60" style={{ width: `${s.saidas ? Math.max(2, (s.saidas / maior) * 100) : 0}%` }} />
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{brl(s.entradas)}</td>
                        <td className="py-1.5 text-right tabular-nums text-danger-300">{s.saidas ? `− ${brl(s.saidas)}` : "—"}</td>
                        <td className={`py-1.5 text-right font-medium tabular-nums ${cor(s.saldo)}`}>{brl(s.saldo)}</td>
                        <td className={`py-1.5 text-right tabular-nums text-muted-foreground ${cor(s.acumulado)}`}>{brl(s.acumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Despesas do empreendimento ({data.despesas.length})</h3>
              <p className="text-xs text-muted-foreground">Você deu ciência em {cientes} de {data.despesas.length}</p>
            </div>
            {!data.despesas.length ? <p className="text-xs text-muted-foreground">Nenhuma despesa do empreendimento no período.</p> : (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-left text-muted-foreground">
                    {["Vencimento", "Descrição", "Categoria", "Valor", "Situação", "Sua ciência"].map(h => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {data.despesas.map(x => {
                      const [r, c] = SITUACAO[x.situacao] ?? [x.situacao, ""];
                      return (
                        <tr key={x.id} className="border-b border-border/40">
                          <td className="px-2 py-1.5 font-mono">{dataBr(x.vencimento)}</td>
                          <td className="px-2 py-1.5">{x.descricao}{x.fornecedor ? <span className="text-muted-foreground"> · {x.fornecedor}</span> : null}
                            {x.terceiro && <span className="mt-0.5 block text-[11px] text-warn-300">{x.terceiro.modalidade ?? "Recurso de terceiro"} de {x.terceiro.nome}{x.terceiro.devolvidoEm ? ` · devolvido em ${dataBr(x.terceiro.devolvidoEm)}` : " · a devolver (não saiu do caixa)"}</span>}
                          </td>
                          <td className="px-2 py-1.5">{x.categoria}</td>
                          <td className="px-2 py-1.5 tabular-nums">{brl(x.valorPago ?? x.valor)}</td>
                          <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 ${c}`}>{r}{x.pagoEm ? ` em ${dataBr(x.pagoEm)}` : ""}</span></td>
                          <td className="px-2 py-1.5">
                            {!x.ciencia ? <span className="text-muted-foreground">Não pedida</span>
                              : x.ciencia.status === "ciente"
                                ? <a href={`/api/despesas/${x.id}/ciencia.pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ok-300 hover:underline">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Ciente{x.ciencia.em ? ` em ${new Date(x.ciencia.em).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}` : ""} <FileText className="h-3 w-3" />
                                  </a>
                                : <span className="inline-flex items-center gap-1 text-warn-300"><Clock className="h-3.5 w-3.5" /> Aguardando você</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.concessoes.itens.length > 0 && (
            <div className="rounded-xl border border-info-500/40 bg-info-500/5 p-3">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Gift className="h-4 w-4 text-info-300" /> Comissão das concessões (5%) a pagar à Romatec</h3>
              {data.concessoes.itens.map(i => (
                <p key={i.contratoId} className="flex flex-wrap justify-between gap-2 border-t border-border/50 py-1.5 text-sm first:border-0">
                  <span>{i.lote} · {i.beneficiario}</span>
                  <span className="tabular-nums"><b>{brl(i.valor)}</b> <span className={`text-xs ${i.situacao === "recebida" ? "text-ok-300" : i.situacao === "atrasada" ? "text-danger-300" : "text-muted-foreground"}`}>
                    {i.situacao === "recebida" ? `paga${i.recebidoEm ? ` em ${dataBr(i.recebidoEm)}` : ""}` : `${i.situacao === "atrasada" ? "atrasada · " : ""}vence ${dataBr(i.vencimento)}`}</span></span>
                </p>
              ))}
            </div>
          )}

          {(data.comissoes.devidas.length > 0 || data.comissoes.programadas.length > 0 || data.comissoes.pagas.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-1 text-sm font-semibold">Comissões de gestão das vendas (5%)</h3>
              <div className="max-h-[260px] overflow-auto text-sm">
                {[...data.comissoes.devidas, ...data.comissoes.programadas, ...data.comissoes.pagas].map((c, k) => (
                  <p key={`${c.contrato}-${c.quando}-${k}`} className="flex flex-wrap justify-between gap-2 border-t border-border/50 py-1.5 first:border-0">
                    <span>{c.lote} · {c.quando}</span>
                    <span className="tabular-nums"><b>{brl(c.valor)}</b> <span className={`text-xs ${c.recebidaEm ? "text-ok-300" : c.devida ? "text-warn-300" : "text-muted-foreground"}`}>{c.recebidaEm ? `paga em ${dataBr(c.recebidaEm)}` : c.devida ? `a pagar (cliente pagou em ${dataBr(c.data)})` : `programada${c.data ? ` para ${dataBr(c.data)}` : ""}`}</span></span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {data.terceiros.porTerceiro.length > 0 && (
            <div className="rounded-xl border border-warn-500/40 bg-warn-500/5 p-3">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><HandCoins className="h-4 w-4 text-warn-300" /> Despesas bancadas por terceiros (a devolver)</h3>
              {data.terceiros.porTerceiro.map(t => (
                <p key={t.terceiro} className="flex flex-wrap justify-between gap-2 border-t border-border/50 py-1.5 text-sm first:border-0">
                  <span>{t.terceiro}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">bancou {brl(t.bancado)} · devolvido {brl(t.devolvido)} · <b className="text-sm text-warn-300">em aberto {brl(t.emAberto)}</b></span>
                </p>
              ))}
            </div>
          )}

          {!!data.previsao.length && (
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">Previsão: a receber × a pagar</h3>
              {data.previsao.map(p => (
                <p key={p.mes} className="flex justify-between gap-2 border-t border-border/50 py-1.5 text-sm first:border-0">
                  <span>{rotuloPeriodo(p.mes)}</span>
                  <span className="tabular-nums"><span className="text-ok-300">{brl(p.valor)}</span> · <span className="text-danger-300">− {brl(p.pagar)}</span> · <b className={cor(p.liquido)}>{brl(p.liquido)}</b></span>
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
