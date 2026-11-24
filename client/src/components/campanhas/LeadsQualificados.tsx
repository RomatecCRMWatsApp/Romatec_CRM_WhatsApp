import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FileUp, Loader2, MessageCircle } from "lucide-react";

const brl = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const num = (s: string) => { const t = s.trim().replace(/[R$\s]/g, ""); const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return Number.isFinite(v) ? v : 0; };
const COR = { A: "bg-ok-500/15 text-ok-300", B: "bg-warn-500/15 text-warn-300", C: "bg-secondary text-muted-foreground" } as const;
const SIT: Record<string, string> = { novo: "novo", atualizado: "já existia (atualizado)", duplicado: "já importado", invalido: "telefone inválido", bloqueado: "bloqueado", equipe: "é da equipe", sem_telefone: "sem telefone" };

/** Roteiro do formulário com filtro (o "nome do campo" é o que o CRM lê) */
const ROTEIRO: [string, string, string][] = [
  ["procura", "O que você procura?", "Chácara em condomínio fechado → próxima · Terreno pequeno na cidade → fechar · Só estou vendo preços → fechar"],
  ["momento", "Quando pretende comprar?", "Agora, nos próximos 30 dias (30) · De 1 a 3 meses (20) · De 3 a 6 meses (10) · Só daqui a mais de 6 meses → fechar"],
  ["pagamento", "Entrada de R$ 10 mil + parcelas fixas: como prefere pagar?", "Quero pagar à vista (25) · A entrada + parcelas cabem no meu planejamento (25) · Preciso de uma entrada menor (8) · Ainda não sei (3) · Não tenho como investir agora → fechar"],
  ["prioridade", "O que é mais importante para você?", "Segurança de condomínio fechado · Contato com a natureza e o rio · Espaço para a família e o lazer · Investimento e valorização (10)"],
  ["regiao", "Onde você mora?", "Moro em Açailândia (15) · Moro em Imperatriz ou região (12) · Outra cidade do MA, PA ou TO (8) · Outro estado (4)"],
  ["visita", "Quer conhecer a chácara pessoalmente?", "Sim, neste fim de semana (20) · Sim, em outro dia (12) · Prefiro receber informações primeiro (2) → enviar formulário"],
];

/** Lê o arquivo da Central de Leads (UTF-16 com tabulação, como a Meta baixa, ou UTF-8) */
async function lerArquivo(f: File): Promise<string> {
  const b = new Uint8Array(await f.arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  return new TextDecoder("utf-8").decode(b);
}

export default function LeadsQualificados() {
  const utils = trpc.useUtils();
  const painel = trpc.campanhasIg.painelLeads.useQuery();
  const [faixa, setFaixa] = useState<"A" | "B" | "C">("A");
  const lista = trpc.campanhasIg.leadsFaixa.useQuery({ faixa });
  const [bj, setBj] = useState(true);
  const [boasVindas, setBoasVindas] = useState(false);
  const importar = trpc.campanhasIg.importarLeads.useMutation({
    onSuccess: r => { toast.success(`${r.total} leads lidos: A ${r.A} · B ${r.B} · C ${r.C}`); utils.campanhasIg.painelLeads.invalidate(); utils.campanhasIg.leadsFaixa.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const [gastos, setGastos] = useState<Record<string, string>>({});
  const [verba, setVerba] = useState("3000");
  const [unidades, setUnidades] = useState("77");
  const [meses, setMeses] = useState("12");
  const [usarReais, setUsarReais] = useState(false);

  const t = painel.data?.total;
  const gastoTotal = useMemo(() => Object.values(gastos).reduce((s, v) => s + num(v), 0), [gastos]);
  const taxasReais = painel.data?.taxas && t && gastoTotal > 0 ? { cpl: gastoTotal / t.leads, ...painel.data.taxas } : null;
  const funil = trpc.campanhasIg.funil.useQuery({ verba: num(verba) || 1, unidades: Math.round(num(unidades)) || 1, mesesMeta: num(meses) || 12, taxas: usarReais ? taxasReais : null });

  const escolher = async (f?: File) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Arquivo grande demais (máx. 5 MB)"); return; }
    importar.mutate({ csv: await lerArquivo(f), empreendimentoSlug: bj ? "bom-jardims" : null, boasVindas });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
        <p className="text-sm font-semibold">Importar leads da Central de Leads (Meta Business Suite)</p>
        <p className="text-xs text-muted-foreground">Enquanto o app da Meta não é aprovado, baixe os leads do formulário (CSV) e importe aqui. O CRM grava as respostas, dá a nota de 0 a 100 e separa em A, B e C. Lead A avisa você no WhatsApp na hora; lead C vai para a nutrição, fora da fila do corretor. Quando o webhook estiver ligado, isso acontece sozinho.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/50 px-3 text-sm text-primary hover:bg-primary/10 ${importar.isPending ? "pointer-events-none opacity-60" : ""}`}>
            {importar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} {importar.isPending ? "Importando…" : "Escolher CSV"}
            <input type="file" accept=".csv,.tsv,text/csv,text/plain" className="hidden" onChange={e => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={bj} onChange={e => setBj(e.target.checked)} /> Leads do Bom Jardims</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={boasVindas} onChange={e => setBoasVindas(e.target.checked)} /> Mandar a mensagem de boas-vindas no WhatsApp</label>
        </div>
        {importar.data && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-2">Lead</th><th className="p-2">Nota</th><th className="p-2">Faixa</th><th className="p-2">Campanha</th><th className="p-2">Situação</th></tr></thead>
              <tbody>{importar.data.linhas.slice(0, 100).map((l, k) => (
                <tr key={k} className="border-b border-border/50 last:border-0">
                  <td className="p-2">{l.nome}<span className="block text-[11px] text-muted-foreground">{l.telefone}</span></td>
                  <td className="p-2 tabular-nums">{l.leadScore ?? "—"}</td>
                  <td className="p-2">{l.faixa ? <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${COR[l.faixa]}`}>{l.faixa}</span> : <span className="text-xs text-muted-foreground">sem o roteiro</span>}</td>
                  <td className="p-2 text-xs">{l.campanha ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{SIT[l.situacao]}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-sm font-semibold">Painel por campanha <span className="font-normal text-muted-foreground">(informe o gasto do Gerenciador para ver os custos)</span></p>
        {painel.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !painel.data?.campanhas.length ? <p className="text-sm text-muted-foreground">Ainda não há leads do formulário qualificado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                {["Campanha", "Gasto (R$)", "Leads", "% A", "Custo por lead A", "Visitas agendadas", "Custo por visita", "Visitas feitas", "Propostas", "Vendas", "Custo por venda"].map(h => <th key={h} className="p-2">{h}</th>)}
              </tr></thead>
              <tbody>{painel.data.campanhas.map(c => {
                const g = num(gastos[c.campanha] ?? "");
                return (
                  <tr key={c.campanha} className="border-b border-border/50 last:border-0">
                    <td className="p-2">{c.campanha}<span className="block text-[11px] text-muted-foreground">A {c.A} · B {c.B} · C {c.C}</span></td>
                    <td className="p-2"><input inputMode="decimal" value={gastos[c.campanha] ?? ""} onChange={e => setGastos(x => ({ ...x, [c.campanha]: e.target.value }))} className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm" placeholder="0,00" /></td>
                    <td className="p-2 tabular-nums">{c.leads}</td>
                    <td className="p-2 tabular-nums">{pct(c.A, c.leads)}</td>
                    <td className="p-2 tabular-nums">{g && c.A ? brl(g / c.A) : "—"}</td>
                    <td className="p-2 tabular-nums">{c.visitas}</td>
                    <td className="p-2 tabular-nums">{g && c.visitas ? brl(g / c.visitas) : "—"}</td>
                    <td className="p-2 tabular-nums">{c.visitasRealizadas}</td>
                    <td className="p-2 tabular-nums">{c.propostas}</td>
                    <td className="p-2 tabular-nums">{c.vendas}</td>
                    <td className="p-2 tabular-nums">{g && c.vendas ? brl(g / c.vendas) : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Regras: com 15 leads no anúncio e menos de 25% de A, troque o gancho ou o texto · com 30 leads no conjunto e custo por lead A acima de R$ 90, pause o pior anúncio · custo por visita abaixo de R$ 250 na semana 2, aumente a verba em 20% a cada 3 dias · lead A sem contato em 5 minutos: corrija o atendimento antes de aumentar a verba.</p>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Leads por faixa</p>
          {(["A", "B", "C"] as const).map(f => (
            <button key={f} onClick={() => setFaixa(f)} className={`rounded-full border px-3 py-1 text-xs ${faixa === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
              {f} {t ? `(${t[f]})` : ""}
            </button>
          ))}
        </div>
        {lista.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : !lista.data?.length ? <p className="text-sm text-muted-foreground">Nenhum lead nesta faixa.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{["Lead", "Nota", "Quando", "Pagamento", "Prioridade", "Visita", "Etapa", "Responsável", ""].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{lista.data.map(l => (
                <tr key={l.id} className="border-b border-border/50 align-top last:border-0">
                  <td className="p-2"><Link href={`/leads/lead/${l.id}`} className="font-medium hover:underline">{l.nome}</Link><span className="block text-[11px] text-muted-foreground">{l.regiao ?? ""}</span></td>
                  <td className="p-2 tabular-nums">{l.nota ?? "—"}</td>
                  <td className="p-2 text-xs">{l.momento ?? "—"}</td>
                  <td className="p-2 text-xs">{l.pagamento ?? "—"}</td>
                  <td className="p-2 text-xs">{l.prioridade ?? "—"}</td>
                  <td className="p-2 text-xs">{l.visita ?? "—"}</td>
                  <td className="p-2 text-xs">{l.etapa}</td>
                  <td className="p-2 text-xs">{l.responsavel ?? "sem responsável"}</td>
                  <td className="p-2"><a href={`https://wa.me/${l.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">A: chamar em até 5 minutos e oferecer visita (3 tentativas em 48 h). B: o robô confirma o interesse e oferece horário; corretor em até 24 h. C: lista de transmissão e Reels da obra; reavaliar em 30 dias. Para encaminhar a um corretor, use Leads › Distribuição.</p>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-3">
        <p className="text-sm font-semibold">Quanto falta para vender (projeção do funil)</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Verba por mês (R$)<input inputMode="decimal" value={verba} onChange={e => setVerba(e.target.value)} className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Unidades a vender<input inputMode="numeric" value={unidades} onChange={e => setUnidades(e.target.value)} className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Prazo (meses)<input inputMode="numeric" value={meses} onChange={e => setMeses(e.target.value)} className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm" /></label>
          <label className={`inline-flex items-center gap-2 text-sm ${taxasReais ? "" : "opacity-50"}`}><input type="checkbox" disabled={!taxasReais} checked={usarReais && !!taxasReais} onChange={e => setUsarReais(e.target.checked)} /> Usar as taxas reais do CRM{taxasReais ? "" : " (precisa de 20 leads e do gasto)"}</label>
        </div>
        {funil.data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{["Cenário", "Custo/lead · % qualif. · % visita · % fecha", "Leads/mês", "Qualificados", "Visitas", "Vendas/mês", "Meses p/ vender tudo", "Custo por venda", "Verba/mês para o prazo"].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{funil.data.map(c => (
                <tr key={c.nome} className="border-b border-border/50 last:border-0">
                  <td className="p-2 capitalize">{c.nome}</td>
                  <td className="p-2 text-xs">{brl(c.taxas.cpl)} · {Math.round(c.taxas.qualif * 100)}% · {Math.round(c.taxas.visita * 100)}% · {Math.round(c.taxas.fecha * 100)}%</td>
                  <td className="p-2 tabular-nums">{c.leads}</td><td className="p-2 tabular-nums">{c.qualificados}</td><td className="p-2 tabular-nums">{c.visitas}</td>
                  <td className="p-2 tabular-nums">{c.vendasMes.toLocaleString("pt-BR")}</td>
                  <td className="p-2 tabular-nums">{c.mesesParaVender?.toLocaleString("pt-BR") ?? "—"}</td>
                  <td className="p-2 tabular-nums">{brl(c.custoPorVenda)}</td>
                  <td className="p-2 tabular-nums">{brl(c.verbaParaMeta)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">As taxas dos cenários são hipóteses até o CRM ter dados reais (2 a 4 semanas de campanha). O que mais acelera a venda é atender em até 5 minutos e levar à visita, não a verba.</p>
      </section>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold">Roteiro do formulário na Meta (nome do campo, pergunta e respostas)</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-2">Nome do campo</th><th className="p-2">Pergunta</th><th className="p-2">Respostas (pontos) e lógica condicional</th></tr></thead>
            <tbody>{ROTEIRO.map(([c, p, r]) => <tr key={c} className="border-b border-border/50 align-top last:border-0"><td className="p-2 font-mono text-xs">{c}</td><td className="p-2">{p}</td><td className="p-2 text-xs text-muted-foreground">{r}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Formulário "Maior intenção" só entrega no Feed; nos Reels e Stories use "Mais volume" com a mesma lógica. Não pergunte renda, patrimônio nem dívidas (proibido pela Meta). Exige link da política de privacidade. Quem fecha o formulário não vira lead: na tela final, mande para o Instagram.</p>
      </details>
    </div>
  );
}
