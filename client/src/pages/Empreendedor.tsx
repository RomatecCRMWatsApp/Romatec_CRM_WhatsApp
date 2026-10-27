import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { perfilDe } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, BarChart3, Copy, Download, ExternalLink, FileText, IdCard, Images, LogOut, Map as MapIcon, Receipt, Share2, Table2, TrendingUp, Video } from "lucide-react";
import { FotoUsuario } from "@/components/AppShell";
import { SinoNovidades } from "@/components/sistema/Novidades";
import { APP_VERSION, AppFooter, RomatecAppIcon } from "@/brand";
import { baixarBlob, ehImagem, ehVideo, miniatura, nomeArquivo } from "@/components/MateriaisPainel";
import { ROTULO_TIPO_MATERIAL, type TipoMaterial } from "@shared/materiais";
import { ROTULO_SITUACAO, type SituacaoLote } from "@shared/lotes";
import { CabecalhoEmpreendimento, MapaVendas } from "@/components/empreendimento/Vitrine";
import TabelasFinanciamento from "@/components/financeiro/TabelasFinanciamento";
import { PainelCarteirinhas } from "@/pages/Carteirinhas";

const ROTULO_TIPO: Record<string, string> = { pago: "Anúncios (pago)", organico: "Orgânico", outro: "Portais e outros" };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBr = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) && d.length <= 10) return d.split("-").reverse().join("/");
  const t = new Date(d as any);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—";
};
const SITUACAO_CONTRATO: Record<string, [string, string]> = {
  EM_DIA: ["Em dia", "bg-emerald-500/15 text-emerald-300"], EM_ATRASO: ["Em atraso", "bg-red-500/15 text-red-300"],
  QUITADO: ["Quitado", "bg-sky-500/15 text-sky-300"], AGUARDANDO_ASSINATURA: ["Aguardando assinatura", "bg-secondary text-muted-foreground"],
};
const STATUS_BOLETO: Record<string, [string, string]> = {
  emitida: ["Emitido", "bg-amber-500/15 text-amber-300"], paga: ["Pago", "bg-emerald-500/15 text-emerald-300"],
  vencida: ["Vencido", "bg-red-500/15 text-red-300"], estornada: ["Estornado", "bg-secondary text-muted-foreground"],
};
const SECOES = [["mapa", "Mapa", MapIcon], ["vendas", "Vendas", TrendingUp], ["financeiro", "Financeiro e boletos", Receipt], ["leads", "Leads", BarChart3], ["carteirinhas", "Carteirinhas", IdCard], ["tabelas", "Tabelas", Table2], ["artes", "Artes", Images]] as const;

function Numero({ titulo, valor, sub, cor }: { titulo: string; valor: string | number; sub?: string; cor?: string }) {
  return (
    <Card className="bg-card border-border"><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${cor ?? "text-foreground"}`}>{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </CardContent></Card>
  );
}

function Titulo({ id, icone: Icone, children, sub }: { id: string; icone: React.ComponentType<{ className?: string }>; children: React.ReactNode; sub?: string }) {
  return (
    <div id={id} className="scroll-mt-20 pt-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--rt-gold-light)] [font-family:var(--rt-font-title)]"><Icone className="h-5 w-5" />{children}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Arte só para divulgar: ver, baixar, mandar (no celular abre WhatsApp/Instagram) e copiar link */
function Arte({ m }: { m: any }) {
  const [ocupado, setOcupado] = useState(false);
  const baixar = async () => {
    setOcupado(true);
    const blob = await baixarBlob(m);
    setOcupado(false);
    if (!blob) { window.open(m.url, "_blank", "noopener"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nomeArquivo(m); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const enviar = async () => {
    setOcupado(true);
    try {
      const blob = await baixarBlob(m);
      const arquivo = blob ? new File([blob], nomeArquivo(m), { type: blob.type || m.mime || "" }) : null;
      if (arquivo && (navigator as any).canShare?.({ files: [arquivo] })) { await navigator.share({ files: [arquivo], title: m.titulo }); return; }
      await navigator.clipboard.writeText(m.url);
      toast.success("Link copiado. No celular, este botão envia o arquivo direto para o WhatsApp ou Instagram.");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar");
    } finally { setOcupado(false); }
  };
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <a href={m.url} target="_blank" rel="noreferrer" className="block bg-black/40 aspect-[4/5] relative">
        {ehImagem(m) ? <img src={miniatura(m.url)} alt={m.titulo} loading="lazy" className="w-full h-full object-contain" />
          : ehVideo(m) ? <video src={m.url} preload="metadata" muted className="w-full h-full object-contain" />
          : <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2"><FileText className="h-10 w-10" /><span className="text-xs">PDF</span></div>}
        {ehVideo(m) && <Video className="absolute top-2 left-2 h-4 w-4 text-white drop-shadow" />}
      </a>
      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{m.titulo}</p>
        <p className="text-[10px] text-muted-foreground">{ROTULO_TIPO_MATERIAL[m.tipo as TipoMaterial] || m.tipo}</p>
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={enviar} disabled={ocupado}><Share2 className="h-3.5 w-3.5 mr-1" />Enviar</Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={baixar} disabled={ocupado}><Download className="h-3.5 w-3.5 mr-1" />Baixar</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Copiar link" onClick={async () => { try { await navigator.clipboard.writeText(m.url); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar"); } }}><Copy className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Portal do empreendedor: começa como o Painel do corretor (logo, portal e o mapa de vendas — atualizado sozinho,
 * com a situação das chácaras editável por ela) e, abaixo, vendas, financeiro e boletos, leads e gráficos, tabelas e artes.
 */
export default function Empreendedor() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const ehEmpreendedor = perfilDe(user as any) === "empreendedor";
  const slug = String((user as any)?.empreendimentoSlug || "bom-jardims");
  const { data: p, isLoading, error } = trpc.empreendedor.painel.useQuery();
  const { data: artes = [] } = trpc.empreendedor.materiais.useQuery();
  const { data: det } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { refetchInterval: 60_000 });
  const { data: vendas } = trpc.financeiro.vendas.useQuery({ slug }, { refetchInterval: 60_000 });
  const { data: fin } = trpc.empreendedor.financeiro.useQuery(undefined, { refetchInterval: 120_000 });

  const serie = (p?.porDia ?? []).map(d => ({ ...d, rotulo: d.dia.slice(8, 10) + "/" + d.dia.slice(5, 7) }));
  const ult7 = (p?.porDia ?? []).slice(-7).reduce((a, d) => a + d.leads, 0);
  const emp = det?.empreendimento;
  const nome = emp?.nome || p?.empreendimento.nome || "Meu empreendimento";
  const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background">
      {/* Barra do topo */}
      <div className="sticky top-0 z-30 border-b border-[var(--rt-border)] bg-black/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-3 py-2 sm:px-4 md:px-6">
          {/* Administrador/secretária olhando a Visão do empreendedor: volta para o CRM */}
          {!ehEmpreendedor && (
            <Button size="sm" variant="outline" className="shrink-0 border-white/30 text-white hover:bg-white/15" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao CRM
            </Button>
          )}
          <RomatecAppIcon size={34} />
          <p className="min-w-0 flex-1 truncate text-sm text-white/80">
            {ehEmpreendedor ? "Portal do empreendedor" : "Visão do empreendedor (prévia)"} · <b className="text-white">{String((user as any)?.name || "").split(" ")[0]}</b>
          </p>
          <SinoNovidades className="text-white/80 hover:text-white" />
          <FotoUsuario />
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" title="Sair" onClick={() => logout()}><LogOut className="h-4 w-4" /></Button>
        </div>
        {/* Navegação das seções da página */}
        <div className="mx-auto flex max-w-[1500px] gap-1.5 overflow-x-auto px-3 pb-2 sm:px-4 md:px-6 [scrollbar-width:none]">
          {SECOES.map(([id, rotulo, Icone]) => (
            <button key={id} onClick={() => ir(id)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-white/80 transition hover:border-[var(--rt-gold)]/60 hover:text-white">
              <Icone className="h-3.5 w-3.5" />{rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-4 px-3 pb-10 pt-3 sm:px-4 md:px-6 md:pt-4">
        {error && <p className="text-sm text-red-400">{error.message}</p>}

        {/* 1. Vitrine: logo, portal e o mapa sempre atualizado */}
        <CabecalhoEmpreendimento slug={slug} nome={nome} municipio={emp?.municipio} uf={emp?.uf} disponiveis={det?.resumo?.disponivel ?? null}
          nomeUsuario={String((user as any)?.name || "").split(" ")[0] || undefined}
          acao={vendas ? (
            <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-center backdrop-blur sm:text-right">
              <p className="text-[11px] uppercase tracking-wide text-white/60">Vendido</p>
              <p className="text-xl font-bold text-[var(--rt-gold-light)]">{brl(vendas.resumo.valorVendido)}</p>
              <p className="text-[11px] text-white/60">{vendas.resumo.quantidade} venda(s)</p>
            </div>
          ) : null} />
        <div id="mapa" className="scroll-mt-24">
          <MapaVendas slug={slug} atualizarCadaMs={60_000}
            ajuda="Veja a situação, o cliente e os valores de cada chácara. Você pode atualizar a situação (reservada, vendida, bloqueada) — o mapa se atualiza sozinho a cada minuto." />
        </div>

        {/* 2. Vendas */}
        <Titulo id="vendas" icone={TrendingUp} sub="Chácaras com sinal, parceladas, à vista e quitadas">Vendas</Titulo>
        {vendas && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Numero titulo="Vendas" valor={vendas.resumo.quantidade} />
              <Numero titulo="Valor vendido" valor={brl(vendas.resumo.valorVendido)} cor="text-[var(--rt-gold-light)]" />
              <Numero titulo="Disponíveis" valor={det?.resumo?.disponivel ?? "—"} cor="text-emerald-300" />
              <Numero titulo="Reservadas / com sinal" valor={det ? (det.resumo.reservado ?? 0) + (det.resumo.entrada ?? 0) : "—"} cor="text-amber-300" />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {["Chácara", "Cliente", "Situação", "Corretor", "Valor", "Entrada", "Parcelas", "Desde"].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {vendas.vendas.map((v: any) => (
                    <tr key={v.loteId} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-semibold">{v.codigo}</td>
                      <td className="px-3 py-2">{v.cliente || "—"}</td>
                      <td className="px-3 py-2 text-xs">{ROTULO_SITUACAO[v.situacao as SituacaoLote] ?? v.situacao}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{v.corretorNome || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{brl(v.valorVenda)}</td>
                      <td className="px-3 py-2 tabular-nums">{brl(v.valorEntrada)}</td>
                      <td className="px-3 py-2 tabular-nums">{v.numParcelas ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{dataBr(v.dataSituacao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!vendas.vendas.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>}
            </div>
          </>
        )}

        {/* 3. Financeiro e boletos */}
        <Titulo id="financeiro" icone={Receipt} sub="Recebimentos dos contratos e os boletos expedidos">Financeiro e boletos</Titulo>
        {fin?.totais ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Numero titulo="Contratado" valor={brl(fin.totais.contratado)} sub={`${fin.totais.contratos} contrato(s)`} />
              <Numero titulo="Recebido" valor={brl(fin.totais.recebido)} cor="text-emerald-300" />
              <Numero titulo="A receber" valor={brl(fin.totais.aVencer)} />
              <Numero titulo="Vencido" valor={brl(fin.totais.vencido)} cor={fin.totais.vencido > 0 ? "text-red-300" : undefined} sub={`${fin.totais.emAtraso} contrato(s) em atraso`} />
              <Numero titulo="Quitados" valor={fin.totais.quitados} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {["Contrato", "Chácara", "Comprador", "Situação", "Pago", "Recebido", "Vencido", "Próximo vencimento"].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {fin.contratos.map(c => {
                    const [r, cor] = SITUACAO_CONTRATO[c.situacao] ?? [c.situacao, ""];
                    return (
                      <tr key={c.contratoId} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{c.numero}</td>
                        <td className="px-3 py-2 font-semibold">{c.lote}</td>
                        <td className="px-3 py-2">{c.comprador}</td>
                        <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] ${cor}`}>{r}{c.diasAtraso ? ` · ${c.diasAtraso} d` : ""}</span></td>
                        <td className="px-3 py-2 text-xs">{c.parcelasPagas}/{c.parcelasTotal} · {c.pctPago.toLocaleString("pt-BR")}%</td>
                        <td className="px-3 py-2 tabular-nums">{brl(c.recebido)}</td>
                        <td className={`px-3 py-2 tabular-nums ${c.vencido > 0 ? "text-red-300" : ""}`}>{brl(c.vencido)}</td>
                        <td className="px-3 py-2 text-xs">{dataBr(c.proximoVencimento)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!fin.contratos.length && <p className="p-4 text-sm text-muted-foreground">Nenhum contrato com parcelas ainda.</p>}
            </div>
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Boletos expedidos ({fin.boletos.length})</CardTitle></CardHeader>
              <CardContent>
                {!fin.boletos.length ? <p className="text-sm text-muted-foreground">Nenhum boleto emitido ainda.</p> : (
                  <div className="max-h-[420px] overflow-auto -mx-2">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-left text-muted-foreground">
                        {["Vencimento", "Chácara", "Comprador", "Parcela", "Valor", "Situação", ""].map(h => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {fin.boletos.map(b => {
                          const [r, cor] = STATUS_BOLETO[b.status] ?? [b.status, ""];
                          return (
                            <tr key={b.id} className="border-b border-border/40">
                              <td className="px-2 py-1.5 font-mono">{dataBr(b.vencimento)}</td>
                              <td className="px-2 py-1.5 font-semibold">{b.lote}</td>
                              <td className="px-2 py-1.5">{b.comprador}</td>
                              <td className="px-2 py-1.5">{b.parcela}</td>
                              <td className="px-2 py-1.5 tabular-nums">{brl(b.valor)}</td>
                              <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 ${cor}`}>{r}{b.pagoEm ? ` em ${dataBr(b.pagoEm)}` : ""}</span></td>
                              <td className="px-2 py-1.5">{b.boleto && <a href={b.boleto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">boleto <ExternalLink className="h-3 w-3" /></a>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : <p className="text-sm text-muted-foreground">{fin ? "Sem dados financeiros ainda." : "Carregando…"}</p>}

        {/* 4. Leads e divulgação */}
        <Titulo id="leads" icone={BarChart3} sub="Números da divulgação — os contatos dos interessados ficam com o corretor (LGPD)">Leads e divulgação</Titulo>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {p && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Numero titulo="Leads no total" valor={p.total.leads} sub={`${ult7} nos últimos 7 dias`} />
              <Numero titulo="Leads quentes" valor={p.total.quentes} sub="prontos para o corretor" />
              <Numero titulo="Querem visitar" valor={p.total.visitas} sub={`${p.total.fechados} negócio(s) fechado(s)`} />
              <Numero titulo="Interesse em chácara" valor={pct(p.total.comImovel, p.total.leads)} sub="escolheram no mapa" />
            </div>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Leads por dia (últimos 30 dias)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serie} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <Tooltip contentStyle={{ background: "#0b1410", border: "1px solid #1f3a2c", fontSize: 12 }} formatter={(v: any) => [v, "leads"]} labelFormatter={(l: any) => `Dia ${l}`} />
                      <Bar dataKey="leads" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-base">De onde vêm os leads</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {p.porTipo.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem leads.</p>}
                  {p.porTipo.map(t => (
                    <div key={t.tipo}>
                      <div className="flex justify-between text-sm"><span>{ROTULO_TIPO[t.tipo] || t.rotulo}</span><span className="font-semibold">{t.leads} · {pct(t.leads, p.total.leads)}</span></div>
                      <div className="h-2 rounded bg-secondary/40 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: pct(t.leads, p.total.leads) === "—" ? "0%" : pct(t.leads, p.total.leads) }} /></div>
                    </div>
                  ))}
                  <div className="pt-2 space-y-1">
                    {p.porCanal.map(c => <div key={c.canal} className="flex justify-between text-xs text-muted-foreground"><span>{c.rotulo}</span><span>{c.leads} lead(s){c.quentes ? ` · ${c.quentes} quente(s)` : ""}</span></div>)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2"><CardTitle className="text-base">Chácaras mais procuradas</CardTitle></CardHeader>
                <CardContent>
                  {p.lotesMaisProcurados.length === 0 ? <p className="text-sm text-muted-foreground">Ainda sem interesse registrado por chácara.</p> : (
                    <div className="flex flex-wrap gap-1">{p.lotesMaisProcurados.map(l => <span key={l.codigo} className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{l.codigo} · {l.leads}</span>)}</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Por campanha</CardTitle></CardHeader>
              <CardContent>
                {p.porCampanha.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma campanha com leads ainda.</p> : (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground border-b border-border"><th className="px-2 py-2 text-left font-medium">Campanha</th><th className="px-2 py-2 text-right font-medium">Leads</th><th className="px-2 py-2 text-right font-medium">Quentes</th><th className="px-2 py-2 text-right font-medium">Visitas</th><th className="px-2 py-2 text-right font-medium">Cliques</th></tr></thead>
                      <tbody>
                        {p.porCampanha.map((c, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-2 py-2"><p className="font-semibold text-foreground">{c.campanhaId ? `#${c.codigo}` : c.nome}</p><p className="text-[10px] text-muted-foreground">{c.campanhaId ? c.nome : ""}</p></td>
                            <td className="px-2 py-2 text-right font-semibold">{c.leads}</td>
                            <td className="px-2 py-2 text-right text-orange-300">{c.quentes}</td>
                            <td className="px-2 py-2 text-right">{c.visitas}</td>
                            <td className="px-2 py-2 text-right">{c.cliques + c.scans}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* 5. Carteirinhas oficiais do empreendimento e os modelos (carteirinha, crachás) */}
        <Titulo id="carteirinhas" icone={IdCard} sub="Carteirinhas dos compradores, cônjuges e dependentes — PDF oficial para a gráfica ou A4">Carteirinhas</Titulo>
        <PainelCarteirinhas portal />

        {/* 6. Tabelas de financiamento (mesmo cálculo do simulador) */}
        <div id="tabelas" className="scroll-mt-24 pt-4"><TabelasFinanciamento /></div>

        {/* 6. Artes para divulgar */}
        <Titulo id="artes" icone={Images} sub="Toque em Enviar no celular para mandar direto para o WhatsApp, status ou Instagram. Nas legendas, sempre o CRECI e os contatos do corretor; não publique valores.">Artes ({artes.length})</Titulo>
        {artes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma arte liberada ainda.</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{artes.map((m: any) => <Arte key={m.id} m={m} />)}</div>
        )}
      </div>
      {/* Rodapé oficial (sem a coluna "Sistema": o empreendedor não abre as telas do CRM) */}
      <div className="mt-10"><AppFooter version={APP_VERSION} links={[]} /></div>
    </div>
  );
}
