import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calculator, Copy, FileDown, Instagram, Loader2 } from "lucide-react";
import type { DadosEmpreendimentoCampanha } from "@shared/campanhasInstagram";
import LeadsQualificados from "@/components/campanhas/LeadsQualificados";

const amanha = () => new Date(Date.now() - 3 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.split("-").reverse().join("/");
const num = (s: string) => { const t = s.trim().replace(/[R$\s]/g, ""); const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(v) ? v : 0; };
const campo = "h-9 rounded-lg border border-border bg-background px-2 text-sm";
const rot = "flex flex-col gap-1 text-xs text-muted-foreground";

function Copiar({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigator.clipboard.writeText(texto).then(() => toast.success("Copiado"), () => toast.error("Não deu para copiar"))}>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">{texto}</pre>
    </div>
  );
}

/**
 * Campanhas do Instagram (Meta Ads só no Instagram): vendas pelo WhatsApp + seguidores. Calcula a campanha anterior,
 * divide o orçamento, projeta com honestidade, mostra a configuração, as regras de corte e os textos, e gera o plano em PDF.
 * Não cria nada na Meta: a campanha é montada no Gerenciador de Anúncios com este plano.
 */
export default function CampanhasInstagram() {
  const padrao = trpc.campanhasIg.padrao.useQuery();
  const calc = trpc.campanhasIg.calcular.useMutation({ onError: e => toast.error(e.message) });
  const pdf = trpc.campanhasIg.pdf.useMutation({
    onSuccess: r => { const a = document.createElement("a"); a.href = `data:application/pdf;base64,${r.base64}`; a.download = r.nome; a.click(); },
    onError: e => toast.error(e.message),
  });
  const [ant, setAnt] = useState({ nome: "", gasto: "", resultados: "", alcance: "", impressoes: "", criativoVencedor: "" });
  const [pl, setPl] = useState({ orcamento: "1000", dias: "5", inicio: amanha(), vendas: "50", cMin: "3,50", cMax: "5,00", sMin: "0,60", sMax: "1,20", atuais: "", meta: "" });
  const [dados, setDados] = useState<DadosEmpreendimentoCampanha | null>(null);
  const [aba, setAba] = useState<"leads" | "planejador">("leads");

  useEffect(() => {
    const p = padrao.data;
    if (!p || dados) return;
    setDados(p.dados);
    setAnt({ nome: p.anterior.nome, gasto: String(p.anterior.gasto).replace(".", ","), resultados: String(p.anterior.resultados), alcance: String(p.anterior.alcance), impressoes: String(p.anterior.impressoes), criativoVencedor: p.anterior.criativoVencedor });
    setPl(x => ({ ...x, atuais: String(p.seguidoresAtuais), meta: String(p.metaSeguidores) }));
  }, [padrao.data, dados]);

  const entrada = () => dados && ({
    anterior: num(ant.gasto) > 0 && num(ant.resultados) > 0 ? { nome: ant.nome || undefined, gasto: num(ant.gasto), resultados: num(ant.resultados), alcance: num(ant.alcance) || null, impressoes: num(ant.impressoes) || null, criativoVencedor: ant.criativoVencedor || null } : null,
    orcamento: num(pl.orcamento), dias: Math.round(num(pl.dias)) || 1, inicio: pl.inicio, fracaoVendas: Math.min(Math.max(num(pl.vendas) / 100, 0), 1),
    custoConversa: [num(pl.cMin) || 3.5, num(pl.cMax) || 5] as [number, number], custoSeguidor: [num(pl.sMin) || 0.6, num(pl.sMax) || 1.2] as [number, number],
    seguidoresAtuais: Math.round(num(pl.atuais)) || null, metaSeguidores: Math.round(num(pl.meta)) || null, dados,
  });
  const calcular = () => { const e = entrada(); if (e) calc.mutate(e); };
  useEffect(() => { if (dados && !calc.data && !calc.isPending) calcular(); /* primeiro cálculo com os dados padrão */ }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = calc.data;
  const setA = (k: keyof typeof ant) => (e: React.ChangeEvent<HTMLInputElement>) => setAnt(x => ({ ...x, [k]: e.target.value }));
  const setP = (k: keyof typeof pl) => (e: React.ChangeEvent<HTMLInputElement>) => setPl(x => ({ ...x, [k]: e.target.value }));
  const setD = (k: keyof DadosEmpreendimentoCampanha) => (e: React.ChangeEvent<HTMLInputElement>) => setDados(x => (x ? { ...x, [k]: e.target.value } : x));

  return (
    <div className="space-y-4">
      <PageHeader icone={Instagram} titulo="Campanhas no Instagram" subtitulo="Leads qualificados, vendas pelo WhatsApp e seguidores, só no Instagram" />
      <div className="flex gap-1 border-b border-border">
        {([["leads", "Leads qualificados"], ["planejador", "Planejador"]] as const).map(([k, r]) => (
          <button key={k} onClick={() => setAba(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{r}</button>
        ))}
      </div>
      {aba === "leads" ? <LeadsQualificados /> : padrao.isLoading || !dados ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p> : (
        <>
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold">1. Campanha anterior (do relatório do Gerenciador)</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className={`${rot} sm:col-span-2`}>Nome<input value={ant.nome} onChange={setA("nome")} className={campo} /></label>
                <label className={rot}>Gasto (R$)<input inputMode="decimal" value={ant.gasto} onChange={setA("gasto")} className={campo} /></label>
                <label className={rot}>Resultados (conversas)<input inputMode="numeric" value={ant.resultados} onChange={setA("resultados")} className={campo} /></label>
                <label className={rot}>Alcance<input inputMode="numeric" value={ant.alcance} onChange={setA("alcance")} className={campo} /></label>
                <label className={rot}>Impressões<input inputMode="numeric" value={ant.impressoes} onChange={setA("impressoes")} className={campo} /></label>
                <label className={`${rot} sm:col-span-3`}>Criativo vencedor (volta na campanha de vendas)<input value={ant.criativoVencedor} onChange={setA("criativoVencedor")} className={campo} /></label>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold">2. Nova rodada</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className={rot}>Orçamento total (R$)<input inputMode="decimal" value={pl.orcamento} onChange={setP("orcamento")} className={campo} /></label>
                <label className={rot}>Dias<input inputMode="numeric" value={pl.dias} onChange={setP("dias")} className={campo} /></label>
                <label className={rot}>Início<input type="date" value={pl.inicio} onChange={setP("inicio")} className={campo} /></label>
                <label className={rot}>% para vendas<input inputMode="numeric" value={pl.vendas} onChange={setP("vendas")} className={campo} /></label>
                <label className={rot}>Custo por conversa (bom–conservador)<span className="flex gap-1"><input value={pl.cMin} onChange={setP("cMin")} className={`${campo} w-full`} /><input value={pl.cMax} onChange={setP("cMax")} className={`${campo} w-full`} /></span></label>
                <label className={rot}>Custo por seguidor (bom–conservador)<span className="flex gap-1"><input value={pl.sMin} onChange={setP("sMin")} className={`${campo} w-full`} /><input value={pl.sMax} onChange={setP("sMax")} className={`${campo} w-full`} /></span></label>
                <label className={rot}>Seguidores hoje<input inputMode="numeric" value={pl.atuais} onChange={setP("atuais")} className={campo} /></label>
                <label className={rot}>Meta de seguidores<input inputMode="numeric" value={pl.meta} onChange={setP("meta")} className={campo} /></label>
              </div>
            </div>
          </section>

          <details className="rounded-xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold">3. Dados do empreendimento para os textos (confira preço e condições antes de veicular)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {([["nome", "Nome"], ["cidade", "Cidade"], ["distancia", "Distância"], ["beneficio", "Benefício principal"], ["unidades", "Unidades"], ["obra", "Estágio da obra (comprovado)"], ["visita", "Visita"], ["corretor", "Corretor"], ["creci", "CRECI"], ["whatsapp", "WhatsApp (com DDI)"], ["perfil", "Perfil do Instagram"], ["slogan", "Slogan"]] as const).map(([k, l]) => (
                <label key={k} className={rot}>{l}<input value={dados[k] as string} onChange={setD(k)} className={campo} /></label>
              ))}
              <label className={`${rot} sm:col-span-2 lg:col-span-3`}>Condições (uma por linha)<textarea rows={2} value={dados.condicoes.join("\n")} onChange={e => setDados(x => x && ({ ...x, condicoes: e.target.value.split("\n").filter(Boolean).slice(0, 6) }))} className="rounded-lg border border-border bg-background p-2 text-sm" /></label>
              <label className={rot}>Gancho de vendas — linha 1<input maxLength={60} value={dados.ganchoVendas[0]} onChange={e => setDados(x => x && ({ ...x, ganchoVendas: [e.target.value, x.ganchoVendas[1]] }))} className={campo} /></label>
              <label className={rot}>Gancho de vendas — linha 2<input maxLength={60} value={dados.ganchoVendas[1]} onChange={e => setDados(x => x && ({ ...x, ganchoVendas: [x.ganchoVendas[0], e.target.value] }))} className={campo} /></label>
              <span />
              <label className={rot}>Gancho de seguidores — linha 1<input maxLength={60} value={dados.ganchoSeguidores[0]} onChange={e => setDados(x => x && ({ ...x, ganchoSeguidores: [e.target.value, x.ganchoSeguidores[1]] }))} className={campo} /></label>
              <label className={rot}>Gancho de seguidores — linha 2<input maxLength={60} value={dados.ganchoSeguidores[1]} onChange={e => setDados(x => x && ({ ...x, ganchoSeguidores: [x.ganchoSeguidores[0], e.target.value] }))} className={campo} /></label>
              <label className={`${rot} sm:col-span-2 lg:col-span-3`}>Hashtags (até 12, separadas por espaço)<input value={dados.hashtags.join(" ")} onChange={e => setDados(x => x && ({ ...x, hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 15) }))} className={campo} /></label>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button onClick={calcular} disabled={calc.isPending}>{calc.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Calculator className="mr-1 h-4 w-4" />} Calcular</Button>
            <Button variant="outline" disabled={!r || pdf.isPending} onClick={() => { const e = entrada(); if (e) pdf.mutate(e); }}>{pdf.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} Plano em PDF</Button>
          </div>

          {r && (
            <>
              {r.anterior?.metricas && (
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {([["Custo por conversa", brl(r.anterior.metricas.custoPorResultado)], ["CPM", r.anterior.metricas.cpm != null ? brl(r.anterior.metricas.cpm) : "—"],
                    ["Frequência", r.anterior.metricas.frequencia?.toLocaleString("pt-BR") ?? "—"], ["Conversas por 1.000 alcançados", r.anterior.metricas.resultadosPorMilAlcancados?.toLocaleString("pt-BR") ?? "—"]] as const).map(([t, v]) => (
                    <div key={t} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t} (anterior)</p><p className="text-lg font-bold">{v}</p></div>
                  ))}
                </section>
              )}
              <section className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-ok-500/40 bg-ok-500/5 p-3">
                  <p className="text-sm font-semibold">Vendas — conversas no WhatsApp</p>
                  <p className="text-2xl font-bold">{brl(r.plano.vendas.total)} <span className="text-sm font-normal text-muted-foreground">· {brl(r.plano.vendas.porDia)}/dia</span></p>
                  {r.plano.vendas.conversas && <p className="text-sm">{r.plano.vendas.conversas.min.toLocaleString("pt-BR")} a {r.plano.vendas.conversas.max.toLocaleString("pt-BR")} conversas</p>}
                  <p className="text-xs text-muted-foreground">Frio (cidade + ~40 km) {brl(r.plano.vendas.conjuntos.frio)} · remarketing {brl(r.plano.vendas.conjuntos.remarketing)}</p>
                </div>
                <div className="rounded-xl border border-info-500/40 bg-info-500/5 p-3">
                  <p className="text-sm font-semibold">Seguidores — visitas ao perfil</p>
                  <p className="text-2xl font-bold">{brl(r.plano.seguidores.total)} <span className="text-sm font-normal text-muted-foreground">· {brl(r.plano.seguidores.porDia)}/dia</span></p>
                  {r.plano.seguidores.novos && <p className="text-sm">{r.plano.seguidores.novos.min.toLocaleString("pt-BR")} a {r.plano.seguidores.novos.max.toLocaleString("pt-BR")} seguidores novos</p>}
                  {r.plano.seguidores.perfilNoFim && <p className="text-xs text-muted-foreground">Perfil no fim: {r.plano.seguidores.perfilNoFim.min.toLocaleString("pt-BR")} a {r.plano.seguidores.perfilNoFim.max.toLocaleString("pt-BR")}</p>}
                </div>
              </section>
              <p className="text-xs text-muted-foreground">Orçamento total de {brl(r.plano.orcamento)} de {br(r.plano.inicio)} a {br(r.plano.termino)} ({r.plano.dias} dia(s)), com data de término na Meta.</p>
              {r.plano.alertaMeta && <p className="flex gap-2 rounded-xl border border-warn-500/50 bg-warn-500/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-warn-300" /> {r.plano.alertaMeta}</p>}

              <section className="grid gap-3 lg:grid-cols-2">
                {([["Configurar a campanha de vendas", r.config.vendas], ["Configurar a campanha de seguidores", r.config.seguidores], ["Orçamento", r.config.orcamento], ["Perfil antes da campanha de seguidores", r.config.perfil]] as const).map(([t, l]) => (
                  <div key={t} className="rounded-xl border border-border bg-card p-3">
                    <p className="mb-1 text-sm font-semibold">{t}</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{l.map(x => <li key={x}>{x}</li>)}</ul>
                  </div>
                ))}
              </section>
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-2">Quando</th><th className="p-2">Sinal</th><th className="p-2">Ação</th></tr></thead>
                  <tbody>{r.regras.map((x, k) => <tr key={k} className="border-b border-border/50 last:border-0"><td className="p-2">{x.quando}</td><td className="p-2">{x.sinal}</td><td className="p-2">{x.acao}</td></tr>)}</tbody>
                </table>
              </div>
              {r.textos.avisos.map(a => <p key={a} className="flex gap-2 text-xs text-warn-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a}</p>)}
              <section className="grid gap-3 lg:grid-cols-2">
                <Copiar titulo={`Anúncio de vendas · título: ${r.textos.tituloVendas}`} texto={r.textos.anuncioVendas} />
                <Copiar titulo="Anúncio de seguidores (botão Visitar perfil)" texto={r.textos.anuncioSeguidores} />
                <Copiar titulo="Legenda do Reels de vendas" texto={r.textos.legendaVendas} />
                <Copiar titulo="Legenda do Reels de seguidores" texto={r.textos.legendaSeguidores} />
                <Copiar titulo="Mensagem automática do WhatsApp" texto={r.textos.mensagemAutomatica} />
                <Copiar titulo="Ganchos fixos no topo dos vídeos" texto={`Vendas:\n${r.textos.ganchoVendas.join("\n")}\n\nSeguidores:\n${r.textos.ganchoSeguidores.join("\n")}`} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
