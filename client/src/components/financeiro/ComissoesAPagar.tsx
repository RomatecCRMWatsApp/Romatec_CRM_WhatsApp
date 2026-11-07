import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@shared/simulador";
import { ROTULO_SITUACAO_REPASSE, type SituacaoRepasse } from "@shared/repasseComissao";

const COR = { pago: "#2F9E5B", aPagar: "#C9A84C", previsto: "#7C8A99", atraso: "#D9534F" };
const data = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const mesCurto = (mes: string) => new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(". de ", "/").replace(" de ", "/");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

const ESTILO_SITUACAO: Record<SituacaoRepasse, string> = {
  paga: "bg-emerald-500/15 text-emerald-500",
  a_pagar: "bg-primary/15 text-primary",
  atrasada: "bg-destructive/15 text-destructive",
  aguardando_cliente: "bg-secondary text-muted-foreground",
  cliente_atrasado: "bg-orange-500/15 text-orange-500",
  cancelada: "bg-secondary text-muted-foreground line-through",
};
const ORDEM: SituacaoRepasse[] = ["atrasada", "a_pagar", "cliente_atrasado", "aguardando_cliente", "paga", "cancelada"];
const FILTROS = [["pendentes", "A pagar (devidas)"], ["previstas", "Previstas"], ["pagas", "Pagas"], ["todas", "Todas"]] as const;

function Cartao({ rotulo, valor, destaque, sub }: { rotulo: string; valor: string; destaque?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-bold" style={destaque ? { color: destaque } : undefined}>{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Comissões de venda (Financeiro): o escritório controla os repasses a cada corretor nas datas certas (marca como pago);
 * o corretor acompanha as vendas dele, o que já recebeu e o que vai receber, mês a mês. Regras em shared/repasseComissao.ts.
 */
export default function ComissoesAPagar() {
  const [corretorId, setCorretorId] = useState<number | undefined>(undefined);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("pendentes");
  const [pagar, setPagar] = useState<{ contratoId: number; chave: string; rotulo: string; valor: number } | null>(null);
  const [pagoEm, setPagoEm] = useState(hoje());
  const [forma, setForma] = useState("Pix");
  const [obs, setObs] = useState("");
  const utils = trpc.useUtils();
  const { data: d, isLoading, error } = trpc.comissoes.aPagar.useQuery(corretorId ? { corretorId } : undefined, { placeholderData: prev => prev });
  const registrar = trpc.comissoes.registrarPagamento.useMutation({
    onSuccess: r => { toast.success(`Repasse de ${brl(r.valor)} registrado`); setPagar(null); setObs(""); utils.comissoes.aPagar.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const desfazer = trpc.comissoes.desfazerPagamento.useMutation({
    onSuccess: () => { toast.success("Registro desfeito"); utils.comissoes.aPagar.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const escritorio = !!d?.escritorio;
  const partes = useMemo(() => (d?.vendas ?? []).flatMap(v => v.partes.map(p => ({ ...p, venda: v }))), [d]);
  const visiveis = useMemo(() => partes
    .filter(p => filtro === "todas" || (filtro === "pendentes" ? p.situacao === "a_pagar" || p.situacao === "atrasada"
      : filtro === "previstas" ? p.situacao === "aguardando_cliente" || p.situacao === "cliente_atrasado" : p.situacao === "paga"))
    .sort((a, b) => ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao) || String(a.dataRepasse).localeCompare(String(b.dataRepasse))), [partes, filtro]);
  const vendasPorMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of d?.vendas ?? []) if (!["cancelado", "distratado"].includes(v.status)) m.set(v.dataVenda.slice(0, 7), (m.get(v.dataVenda.slice(0, 7)) ?? 0) + 1);
    return Array.from(m.entries()).sort().map(([mes, vendas]) => ({ mes: mesCurto(mes), vendas }));
  }, [d]);

  if (isLoading && !d) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando as comissões…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!d) return null;
  const r = d.resumo;
  const vendasAtivas = d.vendas.filter(v => !["cancelado", "distratado"].includes(v.status));
  const grafico = r.porMes.map(m => ({ ...m, mes: mesCurto(m.mes) }));

  const exportar = () => {
    const cab = ["Data do repasse", "Situação", "Corretor", "Contrato", "Empreendimento", "Chácara", "Comprador", "Forma de pagamento", "Parte", "Valor", "Cliente pagou em", "Repassado em", "Forma do repasse"];
    const linhas = visiveis.map(p => [data(p.dataRepasse), ROTULO_SITUACAO_REPASSE[p.situacao], p.venda.corretor, p.venda.numero, p.venda.empreendimento, p.venda.lote, p.venda.comprador,
      p.venda.formaPagamento, p.quando, p.valor.toFixed(2).replace(".", ","), data(p.clientePagouEm), data(p.pagoEm), p.forma ?? ""]);
    const cel = (x: string) => `"${String(x).replace(/"/g, '""')}"`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [cab, ...linhas].map(l => l.map(cel).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `comissoes-${filtro}-${hoje()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {escritorio ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao rotulo="A pagar agora" valor={brl(r.aPagar + r.atrasado)} destaque={COR.aPagar} sub="Cliente já pagou a parcela" />
          <Cartao rotulo="Repasses atrasados" valor={brl(r.atrasado)} destaque={r.atrasado > 0 ? COR.atraso : undefined} sub="Passou do prazo de 5 dias úteis" />
          <Cartao rotulo="Previsto" valor={brl(r.previsto)} sub="Aguardando o cliente pagar" />
          <Cartao rotulo="Já pago aos corretores" valor={brl(r.pago)} destaque={COR.pago} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao rotulo="Suas vendas" valor={String(vendasAtivas.length)} sub="Contratos assinados" />
          <Cartao rotulo="Comissão total" valor={brl(vendasAtivas.reduce((s, v) => s + v.comissao, 0))} />
          <Cartao rotulo="Já recebido" valor={brl(r.pago)} destaque={COR.pago} />
          <Cartao rotulo="A receber" valor={brl(r.aPagar + r.atrasado + r.previsto)} destaque={COR.aPagar} sub={r.aPagar + r.atrasado > 0 ? `${brl(r.aPagar + r.atrasado)} já liberado` : "conforme os clientes pagam"} />
        </div>
      )}

      <div className={`grid gap-3 ${escritorio ? "" : "lg:grid-cols-3"}`}>
        <div className={`rounded-xl border border-border bg-card p-3 ${escritorio ? "" : "lg:col-span-2"}`}>
          <p className="mb-2 text-sm font-semibold">{escritorio ? "Repasses por mês" : "Seus recebimentos por mês"}</p>
          {grafico.length === 0 ? <p className="text-xs text-muted-foreground">Sem comissões ainda.</p> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafico} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.18)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={62} tickFormatter={(x: number) => x >= 1000 ? `${(x / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(x)} />
                  <Tooltip formatter={(x: number) => brl(x)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="pago" name={escritorio ? "Pago" : "Recebido"} stackId="a" fill={COR.pago} />
                  <Bar dataKey="aPagar" name={escritorio ? "A pagar" : "Liberado"} stackId="a" fill={COR.aPagar} />
                  <Bar dataKey="previsto" name="Previsto" stackId="a" fill={COR.previsto} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {!escritorio && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-sm font-semibold">Suas vendas por mês</p>
            {vendasPorMes.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma venda ainda.</p> : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vendasPorMes} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.18)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="vendas" name="Vendas" fill={COR.aPagar} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {FILTROS.map(([k, rot]) => (
            <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${filtro === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {escritorio ? rot : rot.replace("A pagar (devidas)", "Liberadas").replace("Pagas", "Recebidas")}
            </button>
          ))}
        </div>
        {escritorio && d.corretores.length > 0 && (
          <select value={corretorId ?? ""} onChange={e => setCorretorId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
            <option value="">Todos os corretores</option>
            {d.corretores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
        {escritorio && <Button size="sm" variant="outline" className="ml-auto" onClick={exportar} disabled={!visiveis.length}><Download className="mr-1 h-3.5 w-3.5" /> Planilha</Button>}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {d.vendas.length === 0 ? "Nenhuma venda com contrato assinado ainda." : "Nada nesta lista."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{escritorio ? "Pagar até" : "Receber até"}</th>
                {escritorio && <th className="px-3 py-2">Corretor</th>}
                <th className="px-3 py-2">Venda</th>
                <th className="px-3 py-2">Parte da comissão</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Situação</th>
                {escritorio && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {visiveis.map(p => (
                <tr key={`${p.venda.contratoId}-${p.chave}`} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2 tabular-nums">{data(p.dataRepasse)}{p.situacao === "aguardando_cliente" || p.situacao === "cliente_atrasado" ? <span className="block text-[11px] text-muted-foreground">previsão</span> : null}</td>
                  {escritorio && <td className="px-3 py-2">{p.venda.corretor}</td>}
                  <td className="px-3 py-2">
                    <span className="font-medium">{p.venda.empreendimento} · {p.venda.lote}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.venda.comprador} · {p.venda.numero} · {p.venda.formaPagamento}</span>
                  </td>
                  <td className="px-3 py-2">
                    {p.quando} <span className="text-muted-foreground">({(p.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {p.clientePagouEm ? `Cliente pagou em ${data(p.clientePagouEm)}` : `Parcela do cliente vence em ${data(p.vencimentoCliente)}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{brl(p.valor)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${ESTILO_SITUACAO[p.situacao]}`}>
                      {!escritorio && p.situacao === "paga" ? "Recebida" : !escritorio && p.situacao === "a_pagar" ? "Liberada" : ROTULO_SITUACAO_REPASSE[p.situacao]}
                    </span>
                    {p.pagoEm && <span className="block text-[11px] text-muted-foreground">em {data(p.pagoEm)}{p.forma ? ` · ${p.forma}` : ""}</span>}
                  </td>
                  {escritorio && (
                    <td className="px-3 py-2 text-right">
                      {p.situacao === "paga"
                        ? <Button size="sm" variant="ghost" className="h-7 text-xs" title="Desfazer (só o administrador)" disabled={desfazer.isPending}
                            onClick={() => { if (window.confirm("Desfazer o registro deste pagamento?")) desfazer.mutate({ contratoId: p.venda.contratoId, chave: p.chave }); }}><Undo2 className="h-3.5 w-3.5" /></Button>
                        : p.situacao !== "cancelada" && (
                          <Button size="sm" variant={p.situacao === "a_pagar" || p.situacao === "atrasada" ? "default" : "outline"} className="h-7 text-xs"
                            onClick={() => { setPagoEm(hoje()); setPagar({ contratoId: p.venda.contratoId, chave: p.chave, rotulo: `${p.venda.corretor} — ${p.venda.lote}, ${p.quando}`, valor: p.valor }); }}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marcar paga
                          </Button>
                        )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Cada parte da comissão é liberada quando o comprador paga a parcela correspondente e deve ser repassada em até 5 dias úteis.
        Antes do pagamento do cliente, a data é a previsão pelo vencimento da parcela.
      </p>

      <Dialog open={!!pagar} onOpenChange={o => !o && setPagar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pagamento da comissão</DialogTitle></DialogHeader>
          {pagar && (
            <div className="space-y-3 text-sm">
              <p>{pagar.rotulo}: <b>{brl(pagar.valor)}</b></p>
              <label className="block text-xs text-muted-foreground">Pago em
                <input type="date" value={pagoEm} max={hoje()} onChange={e => setPagoEm(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
              </label>
              <label className="block text-xs text-muted-foreground">Forma
                <select value={forma} onChange={e => setForma(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground">
                  {["Pix", "Transferência", "Dinheiro", "Split Asaas"].map(f => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">Observação (opcional)
                <input value={obs} maxLength={300} onChange={e => setObs(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagar(null)}>Cancelar</Button>
            <Button disabled={!pagar || !pagoEm || registrar.isPending}
              onClick={() => pagar && registrar.mutate({ contratoId: pagar.contratoId, chave: pagar.chave, pagoEm, forma, observacao: obs || undefined })}>
              {registrar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Registrar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
