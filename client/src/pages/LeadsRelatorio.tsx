import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BarChart3, Download } from "lucide-react";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const pct = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)}%` : "—");
const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const tempo = (min: number | null | undefined) => {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.round(min / 1440)} dia(s)`;
};

const COR_TIPO: Record<string, string> = {
  pago: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  organico: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  outro: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};
const ROTULO_TIPO: Record<string, string> = { pago: "Pago", organico: "Orgânico", outro: "Portais e outros" };

function Tipo({ tipo }: { tipo: string }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${COR_TIPO[tipo] ?? COR_TIPO.outro}`}>{ROTULO_TIPO[tipo] ?? tipo}</span>;
}

function Resumo({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{valor}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const COLUNAS = ["Leads", "Com imóvel", "Qualif. completa", "Quentes", "Visitas", "Fechados", "Cliques WhatsApp", "Scans QR", "Visitas à página", "Gasto", "Custo / quente"];

function Metricas({ c }: { c: any }) {
  const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
  return (
    <>
      <td className={`${td} font-semibold`}>{c.leads}</td>
      <td className={td}>{pct(c.comImovel, c.leads)}</td>
      <td className={td}>{pct(c.completa, c.leads)}</td>
      <td className={`${td} text-orange-300 font-semibold`}>{c.quentes}</td>
      <td className={td}>{c.visitas}</td>
      <td className={td}>{c.fechados}</td>
      <td className={td}>{c.cliques}</td>
      <td className={td}>{c.scans}</td>
      <td className={td}>{c.views}</td>
      <td className={td}>{c.gasto ? brl(c.gasto) : "—"}</td>
      <td className={`${td} font-semibold`}>{brl(c.custoPorQuente)}</td>
    </>
  );
}

function Tabela({ titulo, primeira, linhas, render }: { titulo: string; primeira: string; linhas: any[]; render: (l: any) => React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle></CardHeader>
      <CardContent>
        {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nada no período.</p> : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">{primeira}</th>
                  {COLUNAS.map(c => <th key={c} className="px-2 py-2 text-right font-medium whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="px-2 py-2 text-left">{render(l)}</td>
                    <Metricas c={l} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeadsRelatorio() {
  const [, navigate] = useLocation();
  const [de, setDe] = useState(diasAtras(29));
  const [ate, setAte] = useState(hoje());
  const [toque, setToque] = useState<"primeiro" | "ultimo">("primeiro");
  const { data: r, isLoading, error } = trpc.crm.relatorio.useQuery({ de: de || undefined, ate: ate || undefined, toque });

  const preset = (dias: number | null) => {
    setAte(hoje());
    setDe(dias == null ? "" : diasAtras(dias - 1));
  };

  const baixarCsv = () => {
    if (!r) return;
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-leads-${de || "inicio"}-a-${ate || hoje()}-${toque}-toque.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pago = r?.porTipo.find(t => t.tipo === "pago");
  const organico = r?.porTipo.find(t => t.tipo === "organico");

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
        <div className="container py-4 flex items-center gap-3">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => navigate("/leads")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Relatório por canal e campanha</h1>
            <p className="text-xs text-white/70">Orgânico × pago, leads quentes e custo por lead quente</p>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">De</span>
              <Input type="date" value={de} max={ate || undefined} onChange={e => setDe(e.target.value)} className="w-40" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Até</span>
              <Input type="date" value={ate} min={de || undefined} onChange={e => setAte(e.target.value)} className="w-40" />
            </label>
            <div className="flex gap-1">
              {[7, 30, 90].map(d => <Button key={d} size="sm" variant="outline" onClick={() => preset(d)}>{d} dias</Button>)}
              <Button size="sm" variant="outline" onClick={() => preset(null)}>Tudo</Button>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Atribuição</span>
              <select value={toque} onChange={e => setToque(e.target.value as any)} className="h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                <option value="primeiro">1º toque (de onde o lead veio)</option>
                <option value="ultimo">Último toque (o que trouxe de volta)</option>
              </select>
            </label>
            <div className="flex-1" />
            <Button onClick={baixarCsv} disabled={!r} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Download className="mr-1.5 h-4 w-4" /> Exportar CSV
            </Button>
          </CardContent>
        </Card>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando relatório...</p>}
        {error && <p className="text-sm text-red-400">Não foi possível carregar: {error.message}</p>}

        {r && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Resumo titulo="Leads no período" valor={String(r.total.leads)} sub={`${pct(r.total.comImovel, r.total.leads)} com imóvel identificado`} />
              <Resumo titulo="Leads quentes" valor={String(r.total.quentes)} sub={`${r.total.visitas} visita(s) · ${r.total.fechados} fechado(s)`} />
              <Resumo titulo="Custo por lead quente" valor={brl(r.total.custoPorQuente)} sub={r.total.gasto ? `Gasto cadastrado: ${brl(r.total.gasto)}` : "Cadastre o gasto em Campanhas"} />
              <Resumo titulo="Tempo até a 1ª resposta" valor={tempo(r.tempoMedioRespostaMin)} sub={r.leadsComResposta ? `média de ${r.leadsComResposta} lead(s) que responderam` : "ninguém respondeu ainda"} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[{ t: organico, tipo: "organico" }, { t: pago, tipo: "pago" }].map(({ t, tipo }) => (
                <Card key={tipo} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between"><Tipo tipo={tipo} /><span className="text-xs text-muted-foreground">{pct(t?.leads ?? 0, r.total.leads)} dos leads</span></div>
                    <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                      <div><p className="text-xl font-bold">{t?.leads ?? 0}</p><p className="text-[10px] text-muted-foreground">leads</p></div>
                      <div><p className="text-xl font-bold text-orange-300">{t?.quentes ?? 0}</p><p className="text-[10px] text-muted-foreground">quentes</p></div>
                      <div><p className="text-xl font-bold">{(t?.cliques ?? 0) + (t?.scans ?? 0)}</p><p className="text-[10px] text-muted-foreground">cliques + QR</p></div>
                      <div><p className="text-xl font-bold">{tipo === "pago" ? brl(t?.custoPorQuente) : pct(t?.completa ?? 0, t?.leads ?? 0)}</p><p className="text-[10px] text-muted-foreground">{tipo === "pago" ? "custo / quente" : "qualif. completa"}</p></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabela titulo="Por canal" primeira="Canal" linhas={r.porCanal} render={l => <span className="flex items-center gap-2 whitespace-nowrap">{l.rotulo} <Tipo tipo={l.tipo} /></span>} />
            <Tabela titulo="Por campanha" primeira="Campanha" linhas={r.porCampanha} render={l => (
              <div className="min-w-[160px]">
                <p className="font-semibold text-foreground">{l.campanhaId ? `#${l.codigo}` : l.nome}</p>
                <p className="text-[10px] text-muted-foreground">{l.campanhaId ? `${l.nome} · ${l.rotuloCanal}` : "lead sem #código na mensagem"}</p>
              </div>
            )} />

            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Imóveis que mais geram leads quentes</CardTitle></CardHeader>
              <CardContent>
                {r.imoveis.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum imóvel identificado nos leads do período.</p> : (
                  <ol className="space-y-1.5">
                    {r.imoveis.slice(0, 10).map((i, n) => (
                      <li key={i.propertyId} className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-right text-muted-foreground">{n + 1}.</span>
                        <span className="font-mono text-xs text-emerald-300 w-20">{i.codigo ?? "—"}</span>
                        <span className="flex-1 truncate">{i.titulo}</span>
                        <span className="text-orange-300 font-semibold tabular-nums">{i.quentes} quente(s)</span>
                        <span className="text-muted-foreground tabular-nums w-16 text-right">{i.leads} lead(s)</span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <p className="text-[11px] text-muted-foreground">
              Leads contados pela data de entrada. Cliques, scans e visitas à página incluem quem ainda não virou lead.
              O gasto é o total cadastrado em cada campanha (não é dividido por período).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
