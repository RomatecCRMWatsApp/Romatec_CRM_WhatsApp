import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Info, LayoutDashboard, Loader2, RefreshCw, Target, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";

/**
 * Painel financeiro (Financeiro › Painel): caixa do período, posição em aberto na data de corte, evolução, distribuição,
 * pendências e movimentações. Mesma base do Fluxo de caixa (server/financeiro/painel.ts); administrador e secretária.
 */

const COR = { entrada: "#34D399", saida: "#FB7185", resultado: "#C9A84C" };
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const curto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR"));

type Preset = "mes" | "mes_anterior" | "30d" | "ano" | "livre";
function intervalo(p: Preset, livre: { de: string; ate: string }): { de: string; ate: string } {
  const h = hojeBR();
  const [y, m] = h.split("-").map(Number);
  if (p === "mes") return { de: `${h.slice(0, 7)}-01`, ate: h };
  if (p === "mes_anterior") {
    const ini = new Date(Date.UTC(y, m - 2, 1)), fim = new Date(Date.UTC(y, m - 1, 0));
    return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
  }
  if (p === "30d") return { de: new Date(Date.parse(`${h}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10), ate: h };
  if (p === "ano") return { de: `${y}-01-01`, ate: h };
  return livre;
}
const PRESETS: [Preset, string][] = [["mes", "Mês atual"], ["mes_anterior", "Mês anterior"], ["30d", "Últimos 30 dias"], ["ano", "Ano atual"], ["livre", "Personalizado"]];

function Variacao({ v, maiorEhBom }: { v: { absoluta: number; percentual: number | null }; maiorEhBom: boolean }) {
  if (v.absoluta === 0) return <span className="text-[11px] text-muted-foreground">igual ao período anterior</span>;
  const sobe = v.absoluta > 0;
  const bom = sobe === maiorEhBom;
  const Icone = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${bom ? "text-emerald-400" : "text-rose-400"}`}>
      <Icone className="h-3.5 w-3.5" aria-hidden />
      {v.percentual != null ? `${sobe ? "+" : ""}${v.percentual.toLocaleString("pt-BR")}%` : `${sobe ? "+" : "−"}${brl(Math.abs(v.absoluta))}`}
      <span className="font-normal text-muted-foreground">{v.percentual == null ? " · sem base percentual comparável" : " vs. período anterior"}</span>
    </span>
  );
}

function Cartao({ rotulo, valor, sub, children, destaque }: { rotulo: string; valor: string; sub?: string; children?: React.ReactNode; destaque?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card/80 p-4 backdrop-blur-sm">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums" style={destaque ? { color: destaque } : undefined}>{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export default function FinanceiroPainel() {
  const [, navigate] = useLocation();
  const busca = new URLSearchParams(useSearch());
  // Filtros na URL (dá para voltar e compartilhar a visão)
  const [preset, setPreset] = useState<Preset>((busca.get("p") as Preset) || "mes");
  const [livre, setLivre] = useState({ de: busca.get("de") || `${hojeBR().slice(0, 7)}-01`, ate: busca.get("ate") || hojeBR() });
  const [emp, setEmp] = useState<number | null>(busca.get("emp") ? Number(busca.get("emp")) : null);
  const [aba, setAba] = useState<"mov" | "receber" | "pagar">("mov");
  const [categoria, setCategoria] = useState<string>(busca.get("cat") || "");
  const [pessoaDigitada, setPessoaDigitada] = useState<string>(busca.get("cli") || "");
  const [pessoa, setPessoa] = useState(pessoaDigitada);
  // Busca por cliente/fornecedor: espera parar de digitar
  useEffect(() => { const t = setTimeout(() => setPessoa(pessoaDigitada.trim()), 400); return () => clearTimeout(t); }, [pessoaDigitada]);
  const periodo = useMemo(() => intervalo(preset, livre), [preset, livre]);
  const filtro = { ...periodo, empreendimentoId: emp, categoria: categoria || null, pessoa: pessoa || null };
  const atualizarUrl = (p: Preset, l = livre, e = emp) => {
    const q = new URLSearchParams({ p, ...(p === "livre" ? l : {}), ...(e != null ? { emp: String(e) } : {}), ...(categoria ? { cat: categoria } : {}), ...(pessoa ? { cli: pessoa } : {}) });
    window.history.replaceState(null, "", `/financeiro/painel?${q}`);
  };
  useEffect(() => { atualizarUrl(preset); }, [categoria, pessoa]); // eslint-disable-line react-hooks/exhaustive-deps
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const { data: d, isLoading, isFetching, error, refetch, dataUpdatedAt } = trpc.financeiro.painel.useQuery(filtro, { placeholderData: prev => prev, refetchOnWindowFocus: false });
  const csv = trpc.financeiro.painelCsv.useMutation({
    onSuccess: r => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.conteudo], { type: "text/csv;charset=utf-8" }));
      a.download = r.nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success(`Planilha com ${r.linhas} movimentação(ões) do período`);
    },
    onError: e => toast.error(e.message),
  });
  // Resposta de outro filtro (troca rápida): não mostra números antigos como se fossem do filtro atual
  const atual = d && d.periodo.de === periodo.de && d.periodo.ate === periodo.ate && (d.filtros.empreendimentoId ?? null) === emp
    && (d.filtros.categoria ?? "") === categoria && (d.filtros.pessoa ?? "") === pessoa;

  const grafico = (d?.serie ?? []).map(s => ({ ...s, rotulo: d?.agrupamento === "mes" ? new Date(`${s.periodo}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }) : br(s.periodo).slice(0, 5) }));
  const totalDistrib = (d?.distribuicao ?? []).reduce((s, x) => s + x.valor, 0);

  return (
    <div>
      <PageHeader icone={LayoutDashboard} titulo="Painel financeiro" subtitulo="Visão consolidada das movimentações e pendências da Romatec"
        voltar={{ rotulo: "Financeiro", onClick: () => navigate("/financeiro") }}
        acoes={(
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>{isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Atualizar</Button>
            <Button size="sm" variant="outline" onClick={() => csv.mutate(filtro)} disabled={csv.isPending || !atual}><Download className="mr-1 h-4 w-4" /> Exportar</Button>
          </div>
        )} />
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 pb-10 md:px-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card/60 p-3">
          <div role="tablist" aria-label="Período" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
            {PRESETS.map(([k, r]) => (
              <button key={k} type="button" role="tab" aria-selected={preset === k} onClick={() => { setPreset(k); atualizarUrl(k); }}
                className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${preset === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
            ))}
          </div>
          {preset === "livre" && (
            <>
              <label className="text-xs text-muted-foreground">De<input type="date" value={livre.de} max={livre.ate} onChange={e => { const l = { ...livre, de: e.target.value }; setLivre(l); atualizarUrl("livre", l); }} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
              <label className="text-xs text-muted-foreground">Até<input type="date" value={livre.ate} min={livre.de} onChange={e => { const l = { ...livre, ate: e.target.value }; setLivre(l); atualizarUrl("livre", l); }} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" /></label>
            </>
          )}
          <label className="text-xs text-muted-foreground">Empreendimento
            <select value={emp ?? ""} onChange={e => { const v = e.target.value === "" ? null : Number(e.target.value); setEmp(v); atualizarUrl(preset, livre, v); }}
              className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
              <option value="">Todos</option>
              <option value="0">Só o escritório</option>
              {(d?.empreendimentos ?? []).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Categoria
            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-1 block h-9 max-w-[220px] rounded-md border border-border bg-background px-2 text-sm text-foreground">
              <option value="">Todas</option>
              {!!d?.categorias.entradas.length && <optgroup label="Entradas">{d.categorias.entradas.map(c => <option key={`e-${c}`} value={c}>{c}</option>)}</optgroup>}
              {!!d?.categorias.saidas.length && <optgroup label="Saídas">{d.categorias.saidas.map(c => <option key={`s-${c}`} value={c}>{c}</option>)}</optgroup>}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Cliente / fornecedor
            <span className="mt-1 flex h-9 items-center rounded-md border border-border bg-background px-2">
              <input value={pessoaDigitada} onChange={e => setPessoaDigitada(e.target.value)} placeholder="Nome" className="w-36 bg-transparent text-sm text-foreground outline-none" />
              {pessoaDigitada && <button type="button" aria-label="Limpar" onClick={() => setPessoaDigitada("")}><X className="h-3.5 w-3.5" /></button>}
            </span>
          </label>
          <p className="ml-auto text-[11px] text-muted-foreground">
            Movimentações de {br(periodo.de)} a {br(periodo.ate)}
            {dataUpdatedAt ? ` · atualizado às ${new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Não foi possível carregar o painel: {error.message}
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => refetch()}>Tentar de novo</Button>
          </div>
        )}
        {isLoading && !d && (
          <div className="grid gap-3 lg:grid-cols-3" aria-busy>{Array.from({ length: 6 }, (_, k) => <div key={k} className="h-28 animate-pulse rounded-2xl bg-muted/60" />)}</div>
        )}

        {d && (
          <div className={`space-y-4 transition-opacity ${atual ? "" : "opacity-50"}`} aria-busy={!atual}>
            {/* Gráfico + caixa */}
            <div className="grid gap-3 lg:grid-cols-3">
              <section className="rounded-2xl border border-white/10 bg-card/80 p-4 backdrop-blur-sm lg:col-span-2" aria-labelledby="titulo-grafico">
                <p id="titulo-grafico" className="mb-2 text-sm font-semibold">Entradas e saídas <span className="font-normal text-muted-foreground">· por {d.agrupamento === "dia" ? "dia" : d.agrupamento === "semana" ? "semana" : "mês"}</span></p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={grafico} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" vertical={false} />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} minTickGap={12} />
                      <YAxis tick={{ fontSize: 11 }} width={58} tickFormatter={curto} />
                      <Tooltip formatter={(v: number, n: string) => [brl(v), n]} labelFormatter={(_, p: any) => p?.[0]?.payload?.periodo ? (d.agrupamento === "mes" ? p[0].payload.rotulo : br(p[0].payload.periodo)) : ""} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="entradas" name="Recebimentos" fill={COR.entrada} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="saidas" name="Pagamentos" fill={COR.saida} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Line dataKey="resultado" name="Resultado de caixa" stroke={COR.resultado} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="sr-only">Resumo do gráfico: recebimentos de {brl(d.caixa.recebido)}, pagamentos de {brl(d.caixa.pago)} e resultado de caixa de {brl(d.caixa.resultado)} no período.</p>
              </section>
              <div className="grid gap-3">
                <Cartao rotulo="Recebido no período" valor={brl(d.caixa.recebido)} destaque={COR.entrada} sub={`${d.caixa.qtdRecebimentos} recebimento(s): parcelas e comissões`}><Variacao v={d.caixa.comparacao.recebido} maiorEhBom /></Cartao>
                <Cartao rotulo="Pago no período" valor={brl(d.caixa.pago)} destaque={COR.saida} sub={`${d.caixa.qtdPagamentos} pagamento(s): despesas e repasses de comissão`}><Variacao v={d.caixa.comparacao.pago} maiorEhBom={false} /></Cartao>
                <Cartao rotulo="Resultado de caixa" valor={brl(d.caixa.resultado)} destaque={d.caixa.resultado >= 0 ? COR.resultado : COR.saida} sub="Recebido − pago (não é lucro contábil nem saldo bancário)"><Variacao v={d.caixa.comparacao.resultado} maiorEhBom /></Cartao>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Comparação com {br(d.periodo.anterior.de)} a {br(d.periodo.anterior.ate)}.</p>
            <MetaRecebimentos meta={d.meta} metas={d.metas} mes={periodo.de.slice(8) === "01" && periodo.de.slice(0, 7) === periodo.ate.slice(0, 7) ? periodo.de.slice(0, 7) : null} admin={admin} />

            {/* Posição em aberto */}
            <div>
              {d.historico?.noFim ? (
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Posição em {br(d.historico.noFim.data)} (guardada no fim do período)</p>
              ) : (
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Posição atual em {br(d.corte)} (independe do período)</p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Cartao rotulo="A receber" valor={brl(d.historico?.noFim?.aReceber ?? d.posicao.aReceber)} sub={d.historico?.noFim ? "posição guardada" : `${d.posicao.qtdAReceber} título(s) em aberto, incluindo os futuros`}>
                  {d.historico?.comparacao && <Variacao v={d.historico.comparacao.aReceber} maiorEhBom />}
                </Cartao>
                <Cartao rotulo="A pagar" valor={brl(d.historico?.noFim?.aPagar ?? d.posicao.aPagar)} sub={d.historico?.noFim ? "posição guardada" : `${d.posicao.qtdAPagar} conta(s) em aberto (despesas e repasses liberados)`}>
                  {d.historico?.comparacao && <Variacao v={d.historico.comparacao.aPagar} maiorEhBom={false} />}
                </Cartao>
                <Cartao rotulo="Recebíveis vencidos" valor={brl(d.historico?.noFim?.vencidos ?? d.posicao.vencidos)} destaque={(d.historico?.noFim?.vencidos ?? d.posicao.vencidos) > 0 ? COR.saida : undefined}
                  sub={d.historico?.noFim ? `${d.historico.noFim.qtdVencidos} vencido(s) naquele dia` : `${d.posicao.qtdVencidos} vencido(s)${d.posicao.qtdVenceHoje ? ` · vence hoje: ${d.posicao.qtdVenceHoje} (${brl(d.posicao.venceHoje)})` : ""}`}>
                  {d.historico?.comparacao && <Variacao v={d.historico.comparacao.vencidos} maiorEhBom={false} />}
                </Cartao>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {d.historico?.comparacao ? `Comparação da posição com ${br(d.historico.comparacao.data)} (posição guardada).` : d.historico?.motivo ?? ""}
              </p>
            </div>

            {/* Distribuição + pendências */}
            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-card/80 p-4">
                <p className="text-sm font-semibold">Distribuição dos recebimentos <span className="font-normal text-muted-foreground">· por categoria</span></p>
                {!d.distribuicao.length ? <p className="mt-2 text-xs text-muted-foreground">Nenhum recebimento no período.</p> : (
                  <ul className="mt-3 space-y-2">
                    {d.distribuicao.map(x => (
                      <li key={x.grupo}>
                        <div className="flex justify-between text-xs"><span>{x.grupo}</span><span className="tabular-nums font-semibold">{brl(x.valor)} <span className="font-normal text-muted-foreground">({Math.round((x.valor / totalDistrib) * 100)}%)</span></span></div>
                        <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, (x.valor / totalDistrib) * 100)}%`, background: COR.entrada }} /></div>
                      </li>
                    ))}
                    <li className="border-t border-border pt-2 text-right text-xs text-muted-foreground">Total: <b className="text-foreground tabular-nums">{brl(totalDistrib)}</b> (igual ao recebido)</li>
                  </ul>
                )}
              </section>
              <section className="rounded-2xl border border-white/10 bg-card/80 p-4">
                <p className="text-sm font-semibold">Pendências prioritárias</p>
                <p className="mt-2 text-xs font-semibold text-rose-300">Recebíveis em atraso ({d.posicao.qtdVencidos})</p>
                {!d.alertas.atrasados.length ? <p className="text-xs text-muted-foreground">Nenhuma parcela em atraso.</p> : (
                  <ul className="mt-1 divide-y divide-border/60">
                    {d.alertas.atrasados.map(x => (
                      <li key={x.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="min-w-0 flex-1"><b>{x.cliente}</b><span className="block truncate text-muted-foreground">{x.descricao}</span></span>
                        <span className="text-right"><b className="tabular-nums">{brl(x.valor)}</b><span className="block text-rose-300">venceu {br(x.vencimento)} · {x.diasAtraso} d</span></span>
                        {x.contratoId ? <Link href={`/contratos/${x.contratoId}`} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-secondary">Ver</Link> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs font-semibold text-amber-300">Pagamentos até {br(d.alertas.pagarEmBreve.ate)} ({d.alertas.pagarEmBreve.itens.length})</p>
                {!d.alertas.pagarEmBreve.itens.length ? <p className="text-xs text-muted-foreground">Nenhuma despesa a pagar nos próximos 7 dias.</p> : (
                  <ul className="mt-1 divide-y divide-border/60">
                    {d.alertas.pagarEmBreve.itens.map(x => (
                      <li key={x.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="min-w-0 flex-1"><b>{x.fornecedor}</b><span className="block truncate text-muted-foreground">{x.descricao} · {x.categoria}</span></span>
                        <span className="text-right"><b className="tabular-nums">{brl(x.valor)}</b><span className={`block ${x.vencida ? "text-rose-300" : "text-muted-foreground"}`}>{x.vencida ? "venceu" : "vence"} {br(x.vencimento)}</span></span>
                        <Link href={x.contratoId ? `/contratos/${x.contratoId}` : "/financeiro"} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-secondary">Ver</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Lista */}
            <section className="rounded-2xl border border-white/10 bg-card/80 p-4">
              <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-xl bg-muted p-1">
                {([["mov", `Movimentações (${d.totalMovimentacoes})`], ["receber", `A receber (${d.totalAReceber})`], ["pagar", `A pagar (${d.totalAPagar})`]] as const).map(([k, r]) => (
                  <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${aba === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
                ))}
              </div>
              <div className="overflow-x-auto">
                {aba === "mov" && (
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Data</th><th>Natureza</th><th>Cliente/fornecedor</th><th>Descrição</th><th>Classificação</th><th className="text-right">Valor</th></tr></thead>
                    <tbody>
                      {d.movimentacoes.map(m => (
                        <tr key={m.id} className="border-t border-border/60">
                          <td className="py-1.5 tabular-nums">{br(m.data)}</td>
                          <td><span className={m.natureza === "entrada" ? "text-emerald-400" : "text-rose-400"}>{m.natureza === "entrada" ? "Recebimento" : "Pagamento"}</span></td>
                          <td>{m.pessoa}</td>
                          <td className="text-xs text-muted-foreground">{m.contratoId ? <Link href={`/contratos/${m.contratoId}`} className="hover:underline">{m.descricao}</Link> : m.descricao}</td>
                          <td className="text-xs">{m.classificacao}</td>
                          <td className={`text-right tabular-nums font-semibold ${m.natureza === "entrada" ? "text-emerald-400" : "text-rose-400"}`}>{m.natureza === "entrada" ? "" : "−"}{brl(m.valor)}</td>
                        </tr>
                      ))}
                      {!d.movimentacoes.length && <tr><td colSpan={6} className="py-4 text-center text-xs text-muted-foreground">Nenhuma movimentação no período.</td></tr>}
                    </tbody>
                  </table>
                )}
                {aba === "receber" && (
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Vencimento</th><th>Cliente</th><th>Parcela</th><th>Situação</th><th className="text-right">Saldo</th></tr></thead>
                    <tbody>
                      {d.aReceberLista.map(x => {
                        const sit = x.vencimento < d.corte ? "Vencida" : x.vencimento === d.corte ? "Vence hoje" : x.status === "prevista" ? "Prevista (sem boleto)" : "A vencer";
                        return (
                          <tr key={x.id} className="border-t border-border/60">
                            <td className="py-1.5 tabular-nums">{br(x.vencimento)}</td><td>{x.cliente}</td>
                            <td className="text-xs text-muted-foreground">{x.contratoId ? <Link href={`/contratos/${x.contratoId}`} className="hover:underline">{x.descricao}</Link> : x.descricao}<span className="block text-[10px]">{x.categoria}</span></td>
                            <td className={`text-xs ${sit === "Vencida" ? "text-rose-400" : sit === "Vence hoje" ? "text-amber-300" : ""}`}>{sit}</td>
                            <td className="text-right tabular-nums">{brl(x.valor)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {aba === "pagar" && (
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Categoria</th><th className="text-right">Valor</th></tr></thead>
                    <tbody>
                      {d.aPagarLista.map(x => (
                        <tr key={x.id} className="border-t border-border/60">
                          <td className={`py-1.5 tabular-nums ${x.vencimento < d.corte ? "text-rose-400" : ""}`}>{br(x.vencimento)}</td><td>{x.fornecedor}</td>
                          <td className="text-xs text-muted-foreground">{x.descricao}</td><td className="text-xs">{x.categoria}</td>
                          <td className="text-right tabular-nums">{brl(x.valor)}</td>
                        </tr>
                      ))}
                      {!d.aPagarLista.length && <tr><td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">Nenhuma despesa em aberto.</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
              {aba === "mov" && d.totalMovimentacoes > d.movimentacoes.length && <p className="mt-2 text-[11px] text-muted-foreground">Mostrando as {d.movimentacoes.length} mais recentes de {d.totalMovimentacoes}. A planilha (Exportar) traz todas.</p>}
            </section>

            {d.limitacoes.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                <p className="mb-1 flex items-center gap-1 font-semibold"><Info className="h-3.5 w-3.5" /> Como os números são calculados</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>Regime de caixa: recebido = parcelas pagas e comissões de gestão recebidas; pago = despesas pagas e repasses de comissão pagos aos corretores — tudo pela data do pagamento.</li>
                  {d.limitacoes.map(l => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Meta de recebimentos do mês: progresso e campo para o administrador digitar (do mês ou padrão de todos os meses) */
function MetaRecebimentos({ meta, metas, mes, admin }: { meta: { mes: string; valor: number; recebido: number; pct: number; origem: string } | null; metas: { padrao?: number | null; meses?: Record<string, number> }; mes: string | null; admin: boolean }) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [todos, setTodos] = useState(false);
  const salvar = trpc.financeiro.salvarMeta.useMutation({
    onSuccess: () => { toast.success("Meta salva"); setEditando(false); utils.financeiro.painel.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const nomeMes = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  if (!mes) return <p className="text-[11px] text-muted-foreground">Meta de recebimentos: escolha um mês (Mês atual, Mês anterior ou um mês inteiro no Personalizado) para ver o progresso.</p>;
  if (!meta && !admin) return null;
  const abrir = () => { setValor(String(meta?.valor ?? metas.meses?.[mes] ?? metas.padrao ?? "").replace(".", ",")); setTodos(false); setEditando(true); };
  const enviar = () => { const v = Number(valor.replace(/\./g, "").replace(",", ".")); salvar.mutate({ mes: todos ? null : mes, valor: Number.isFinite(v) && v > 0 ? v : null }); };
  return (
    <section className="rounded-2xl border border-white/10 bg-card/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Meta de recebimentos · {nomeMes(mes)}</p>
        {admin && !editando && <Button size="sm" variant="outline" className="ml-auto h-8 text-xs" onClick={abrir}>{meta ? "Alterar meta" : "Definir meta"}</Button>}
      </div>
      {meta ? (
        <div className="mt-2">
          <div className="flex justify-between text-xs"><span>Recebido {brl(meta.recebido)} de {brl(meta.valor)}</span><b className="tabular-nums">{meta.pct.toLocaleString("pt-BR")}%</b></div>
          <div className="mt-1 h-2.5 rounded-full bg-muted" role="progressbar" aria-valuenow={Math.min(100, meta.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta">
            <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, meta.pct)}%`, background: meta.pct >= 100 ? COR.entrada : COR.resultado }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Mesma base do "Recebido no período" e com os mesmos filtros{meta.origem === "padrao" ? " · meta padrão de todos os meses" : ""}.</p>
        </div>
      ) : !editando && <p className="mt-1 text-xs text-muted-foreground">Nenhuma meta definida para este mês.</p>}
      {editando && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Meta de recebimentos (R$)
            <input autoFocus inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="Ex.: 80.000,00" className="mt-1 block h-9 w-40 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="flex h-9 items-center gap-1.5 text-xs"><input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Usar para todos os meses (padrão)</label>
          <Button size="sm" disabled={salvar.isPending} onClick={enviar}>Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          <p className="basis-full text-[11px] text-muted-foreground">Deixe vazio e salve para apagar a meta deste mês.</p>
        </div>
      )}
    </section>
  );
}
