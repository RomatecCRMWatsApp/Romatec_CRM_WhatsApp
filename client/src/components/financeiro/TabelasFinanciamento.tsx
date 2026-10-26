import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";
import { ROTULO_SITUACAO, type SituacaoLote } from "@shared/lotes";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Info, Loader2, Table2 } from "lucide-react";

const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const pct = (v: number, d = 2) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const campo = "h-9 rounded-md border border-border bg-secondary px-2 text-sm";
const valorBr = (s: string) => { const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

async function baixar(url: string, nome: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error((await r.text()) || "Falha ao gerar o PDF");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob());
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/**
 * Tabelas de financiamento (aba Financeiro): empreendimento → condições, prazos do saldo e o evolutivo mês a mês,
 * com o mesmo cálculo do simulador (servidor: shared/simulador.ts). Por lote, por área ou por valor; sem escolha,
 * a área padrão das condições. PDF do evolutivo e tabela geral de todos os lotes.
 */
export default function TabelasFinanciamento() {
  const { data: emps, isLoading: carregandoEmps } = trpc.financeiro.tabelasEmpreendimentos.useQuery();
  const [slug, setSlug] = useState("");
  useEffect(() => { if (!slug && emps?.length) setSlug(emps.find(e => e.slug === "bom-jardims")?.slug ?? emps[0].slug); }, [emps, slug]);
  const [origem, setOrigem] = useState<"area" | "lote" | "valor">("area");
  const [lote, setLote] = useState("");
  const [area, setArea] = useState("");
  const [valor, setValor] = useState("");
  const [entrada, setEntrada] = useState(6);
  const [prazo, setPrazo] = useState(120);
  const [data1, setData1] = useState("");
  const [baixando, setBaixando] = useState<"pdf" | "geral" | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);

  const pedido = useMemo(() => ({
    slug,
    lote: origem === "lote" && lote ? lote : null,
    areaM2: origem === "area" ? valorBr(area) : null,
    preco: origem === "valor" ? valorBr(valor) : null,
    entrada, prazo, dataPrimeiro: /^\d{4}-\d{2}-\d{2}$/.test(data1) ? data1 : null,
  }), [slug, origem, lote, area, valor, entrada, prazo, data1]);
  const { data: t, isFetching, error } = trpc.financeiro.tabela.useQuery(pedido, { enabled: !!slug, placeholderData: p => p });

  // Prazo e entrada sempre dentro das condições do empreendimento escolhido
  useEffect(() => {
    if (!t) return;
    if (!t.condicoes.prazos.includes(prazo)) setPrazo(Math.max(...t.condicoes.prazos));
    if (entrada > t.condicoes.entradaMaxParcelas) setEntrada(t.condicoes.entradaMaxParcelas);
  }, [t, prazo, entrada]);

  const query = () => {
    const q = new URLSearchParams({ slug, entrada: String(entrada), prazo: String(prazo) });
    if (pedido.lote) q.set("lote", pedido.lote);
    if (pedido.areaM2) q.set("area", String(pedido.areaM2));
    if (pedido.preco) q.set("preco", String(pedido.preco));
    if (pedido.dataPrimeiro) q.set("data", pedido.dataPrimeiro);
    return q.toString();
  };
  const nomeOrigem = !t ? "" : t.origem.tipo === "lote" ? `Chácara ${t.origem.codigo}` : t.origem.tipo === "area" ? `Área de ${num(t.origem.areaM2)} m²` : `Valor de ${brl(t.origem.preco)}`;
  const acao = async (qual: "pdf" | "geral") => {
    setBaixando(qual);
    try {
      if (qual === "geral") await baixar(`/api/financeiro/tabela-geral.pdf?slug=${slug}`, `Tabela-geral-${slug}.pdf`);
      else await baixar(`/api/financeiro/tabela.pdf?${query()}`, `Tabela-financiamento-${slug}-${(t?.origem.codigo ?? nomeOrigem).replace(/\W+/g, "-")}.pdf`);
    } catch (e: any) { toast.error(e?.message ?? "Falha ao gerar o PDF"); } finally { setBaixando(null); }
  };

  // Setas: próxima/anterior chácara (disponíveis primeiro na ordem da lista do servidor)
  const passo = (d: number) => {
    const ls = t?.lotes ?? [];
    if (!ls.length) return;
    const i = origem === "lote" ? ls.findIndex(l => l.codigo === lote) : -1;
    const n = i < 0 ? (d > 0 ? 0 : ls.length - 1) : (i + d + ls.length) % ls.length;
    setLote(ls[n].codigo); setOrigem("lote");
  };

  if (carregandoEmps) return null;
  if (!emps?.length) return null;
  const c = t?.condicoes, s = t?.simulacao;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Table2 className="h-5 w-5 text-primary" />
        <h2 className="flex-1 text-base font-semibold">Tabelas de financiamento</h2>
        <Button size="sm" variant="outline" disabled={!t || !!baixando} onClick={() => acao("pdf")}>
          {baixando === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF
        </Button>
        <Button size="sm" variant="outline" disabled={!slug || !!baixando} onClick={() => acao("geral")}>
          {baixando === "geral" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Baixar tabela geral
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Empreendimento</span>
          <select className={`${campo} min-w-[240px]`} value={slug} onChange={e => { setSlug(e.target.value); setLote(""); }}>
            {emps.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Calcular por</span>
          <select className={campo} value={origem} onChange={e => setOrigem(e.target.value as any)}>
            <option value="area">Área (m²)</option><option value="lote">Chácara (escolha ao lado)</option><option value="valor">Valor (R$)</option>
          </select>
        </label>
        {origem === "area" && (
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Área (m²){c ? ` — padrão ${num(c.areaBaseM2)}` : ""}</span>
            <input className={`${campo} w-36`} inputMode="decimal" placeholder={c ? num(c.areaBaseM2) : ""} value={area} onChange={e => setArea(e.target.value)} />
          </label>
        )}
        {origem === "valor" && (
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Valor do imóvel (R$)</span>
            <input className={`${campo} w-40`} inputMode="decimal" placeholder="160.000,00" value={valor} onChange={e => setValor(e.target.value)} />
          </label>
        )}
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Entrada</span>
          <select className={campo} value={entrada} onChange={e => setEntrada(Number(e.target.value))}>
            {Array.from({ length: c?.entradaMaxParcelas ?? 6 }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n === 1 ? "À vista (com desconto)" : `${n}× sem juros`}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Saldo</span>
          <select className={campo} value={prazo} onChange={e => setPrazo(Number(e.target.value))}>
            {(c?.prazos ?? [12, 24, 36, 60, 120]).map(n => <option key={n} value={n}>{n}×</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">1º pagamento</span>
          <input type="date" className={campo} value={data1 || t?.dataPrimeiro || ""} onChange={e => setData1(e.target.value)} />
        </label>
        {/* Chácara sempre à mão (como no simulador): escolher ou passar uma a uma com as setas */}
        {!!t?.lotes.length && (
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Chácara</span>
            <span className="flex items-center gap-1">
              <button type="button" aria-label="Chácara anterior" className={`${campo} px-2`} onClick={() => passo(-1)}><ChevronLeft className="h-4 w-4" /></button>
              <select className={`${campo} min-w-[230px] ${origem === "lote" && lote ? "border-primary" : ""}`} value={origem === "lote" ? lote : ""}
                onChange={e => { setLote(e.target.value); setOrigem(e.target.value ? "lote" : "area"); }}>
                <option value="">Escolha a chácara…</option>
                {t.lotes.map(l => <option key={l.codigo} value={l.codigo}>{l.codigo} · {num(l.areaM2)} m² · {brl(l.preco)}{l.situacao !== "disponivel" ? ` · ${ROTULO_SITUACAO[l.situacao as SituacaoLote] ?? l.situacao}` : ""}</option>)}
              </select>
              <button type="button" aria-label="Próxima chácara" className={`${campo} px-2`} onClick={() => passo(1)}><ChevronRight className="h-4 w-4" /></button>
            </span>
          </label>
        )}
        {isFetching && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-sm text-red-400">{error.message}</p>}

      {t && c && s && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{nomeOrigem} · preço de tabela</p><p className="text-lg font-bold">{brl(s.preco)}</p></div>
            <div className="rounded-xl border border-emerald-500/40 p-3"><p className="text-xs text-muted-foreground">À vista total (−{brl(s.avistaTotal.desconto)})</p><p className="text-lg font-bold text-emerald-400">{brl(s.avistaTotal.valor)}</p></div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Entrada {pct(c.entradaPct, 0)}</p>
              <p className="text-sm"><b>{brl(s.entradaAvista)}</b> à vista (−{brl(s.descontoAvista)})</p>
              <p className="text-xs text-muted-foreground">ou {t.opcoesEntrada.filter(o => o.parcelas > 1).map(o => `${o.parcelas}× ${brl(o.valorParcela)}`).join(" · ")}</p>
            </div>
            <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Saldo {pct(1 - c.entradaPct, 0)} · juros {pct(c.jurosAaEfetivo)} a.a. ({pct(s.taxaMensal, 4)} a.m.)</p><p className="text-lg font-bold">{brl(s.saldo)}</p><p className="text-xs text-muted-foreground">Tabela Price · parcelas fixas</p></div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead className="bg-secondary/40 text-xs text-muted-foreground"><tr>
                {["Prazo do saldo", "Parcela", "Total do saldo", "Juros", "Total a pagar"].map(h => <th key={h} className="px-3 py-2 text-right font-medium first:text-left">{h}</th>)}
              </tr></thead>
              <tbody>
                {s.planos.map(p => (
                  <tr key={p.prazo} onClick={() => setPrazo(p.prazo)} className={`cursor-pointer border-t border-border/50 ${p.prazo === prazo ? "bg-primary/15 font-semibold" : "hover:bg-secondary/30"}`}>
                    <td className="px-3 py-1.5">{p.prazo}×</td>
                    <td className="px-3 py-1.5 text-right">{brl(p.parcela)}</td>
                    <td className="px-3 py-1.5 text-right">{brl(p.totalSaldo)}</td>
                    <td className="px-3 py-1.5 text-right">{brl(p.juros)}</td>
                    <td className="px-3 py-1.5 text-right">{brl(p.totalPago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="group rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
              <Info className="h-4 w-4 text-primary" /> O que é a Tabela Price?
              <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">toque para ler</span>
            </summary>
            <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
              <p>A <b className="text-foreground">Tabela Price</b> (sistema francês de amortização) é o jeito mais comum de parcelar com juros no Brasil: <b className="text-foreground">todas as parcelas do saldo têm o mesmo valor</b>, do começo ao fim, o que facilita o cliente se planejar.</p>
              <p>Cada parcela tem duas partes: <b className="text-foreground">juros</b>, calculados sobre o que ainda falta pagar, e <b className="text-foreground">amortização</b>, que é o que de fato abate a dívida. No início o saldo é maior, então a parcela leva mais juros; mês a mês o saldo cai, os juros diminuem e a amortização cresce — veja as colunas "Juros" e "Amortização" no evolutivo abaixo.</p>
              <p>Aqui a taxa é de <b className="text-foreground">{pct(c.jurosAaEfetivo)} ao ano</b> ({pct(s.taxaMensal, 4)} ao mês), só sobre o saldo — a entrada parcelada é sem juros. Prazo maior deixa a parcela menor, mas soma mais juros no total; antecipar parcelas reduz os juros que faltam. Financiamento direto com o empreendedor, sem banco.</p>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="flex-1 font-semibold">Evolutivo — {nomeOrigem} · entrada {entrada === 1 ? "à vista" : `${entrada}×`} · saldo {prazo}× de {brl(t.resumo.parcela)}</p>
            <p className="text-xs text-muted-foreground">Total a pagar {brl(t.resumo.totalPago)} · última parcela {dataBr(t.linhas[t.linhas.length - 1].vencimento)}</p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => rolagem.current?.scrollTo({ top: 0, behavior: "smooth" })}>Início</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => rolagem.current?.scrollTo({ top: rolagem.current.scrollHeight, behavior: "smooth" })}>Última parcela</Button>
          </div>
          <div ref={rolagem} className="max-h-[480px] overflow-auto rounded-xl border border-border [scrollbar-gutter:stable]">
            <table className="w-full min-w-[720px] text-xs tabular-nums">
              <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground">
                {["Mês", "Vencimento", "Tipo", "Nº", "Parcela", "Juros", "Amortização", "Saldo devedor"].map(h => <th key={h} className="px-2 py-2 text-right font-medium first:text-left">{h}</th>)}
              </tr></thead>
              <tbody>
                {t.linhas.map((l, k) => (
                  <tr key={k} className={`border-b border-border/40 ${l.tipo === "entrada" ? "bg-secondary/30" : ""}`}>
                    <td className="px-2 py-1">{l.mes}</td>
                    <td className="px-2 py-1 text-right font-mono">{dataBr(l.vencimento)}</td>
                    <td className="px-2 py-1 text-right">{l.tipo === "entrada" ? "Entrada" : "Saldo"}</td>
                    <td className="px-2 py-1 text-right">{l.numero}</td>
                    <td className="px-2 py-1 text-right">{num(l.parcela)}</td>
                    <td className="px-2 py-1 text-right">{num(l.juros)}</td>
                    <td className="px-2 py-1 text-right">{num(l.amortizacao)}</td>
                    <td className="px-2 py-1 text-right">{num(l.saldoDevedor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">Mesmo cálculo do simulador. Financiamento direto com o empreendedor, sem banco. Valores sujeitos a alteração e disponibilidade.</p>
        </>
      )}
    </section>
  );
}
