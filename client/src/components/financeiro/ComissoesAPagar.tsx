import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSignature, FileText, Landmark, Loader2, Send, Undo2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@shared/simulador";
import { ROTULO_SITUACAO_REPASSE, type SituacaoRepasse } from "@shared/repasseComissao";
import ReceitasConcessao from "./ReceitasConcessao";
import ReceitasGestao from "./ReceitasGestao";

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
  const [comp, setComp] = useState<{ base64: string; mime: "image/png" | "image/jpeg" | "application/pdf"; nomeArquivo: string } | null>(null);
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  /** Assinar o demonstrativo (certificado digital do administrador) antes de ir ao corretor */
  const [assinar, setAssinar] = useState<{ contratoId: number; chave: string; rotulo: string } | null>(null);
  const [senhaCert, setSenhaCert] = useState("");
  const [pfx, setPfx] = useState<string | null>(null);
  /** Recado para a proprietária antes de debitar ou trocar o comprovante (vai no pedido de ciência) */
  type Comp = { base64: string; mime: "image/png" | "image/jpeg" | "application/pdf"; nomeArquivo: string };
  const [recado, setRecado] = useState<{ acao: "debitar" | "trocar" | "remover"; contratoId: number; chave: string; rotulo: string; comprovante?: Comp } | null>(null);
  const [nota, setNota] = useState("");
  /** O CRM não leu o valor do comprovante: pede o valor digitado (tem que bater com a parte) */
  const [pedeValor, setPedeValor] = useState(false);
  const [valorComp, setValorComp] = useState("");
  const valorDigitado = () => { const n = Number(valorComp.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
  const campoValor = (
    <label className="block text-xs text-muted-foreground">Valor no comprovante (o CRM não conseguiu ler: digite o que está nele)
      <input inputMode="decimal" value={valorComp} onChange={e => setValorComp(e.target.value)} placeholder="1.662,30" className="mt-1 block w-full rounded-lg border border-warn-400 bg-background px-2 py-2 text-sm text-foreground" />
    </label>
  );
  const [doCaixa, setDoCaixa] = useState(true);
  const escolherComp = (f?: File) => {
    if (!f) return;
    const mime = f.type === "application/pdf" ? "application/pdf" : f.type === "image/jpeg" ? "image/jpeg" : f.type === "image/png" ? "image/png" : null;
    if (!mime) { toast.error("Envie PDF, PNG ou JPG"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Arquivo grande demais (máx. 10 MB)"); return; }
    const r = new FileReader();
    r.onload = () => { setPedeValor(false); setValorComp(""); setComp({ base64: String(r.result).split(",")[1] ?? "", mime, nomeArquivo: f.name.slice(0, 120) }); };
    r.readAsDataURL(f);
  };
  const utils = trpc.useUtils();
  const { data: d, isLoading, error } = trpc.comissoes.aPagar.useQuery(corretorId ? { corretorId } : undefined, { placeholderData: prev => prev });
  const registrar = trpc.comissoes.registrarPagamento.useMutation({
    onSuccess: r => {
      toast.success(`Repasse de ${brl(r.valor)} registrado${r.despesaId ? "; a proprietária recebeu o pedido de ciência" : ""}. Agora assine o demonstrativo para ele ir ao corretor.`, { duration: 8000 });
      if (admin && pagar) setAssinar({ contratoId: pagar.contratoId, chave: pagar.chave, rotulo: pagar.rotulo });
      setPagar(null); setObs(""); setComp(null); setValorComp(""); setPedeValor(false); utils.comissoes.aPagar.invalidate();
    },
    onError: e => { if (e.message.startsWith("Não consegui ler o valor")) setPedeValor(true); toast.error(e.message, { duration: 12000 }); },
  });
  const assinarDem = trpc.comissoes.assinarDemonstrativo.useMutation({
    onSuccess: r => {
      if (r.avisado) toast.success(`Demonstrativo assinado por ${r.titular} e enviado ao corretor no WhatsApp`);
      else toast.warning(`Demonstrativo assinado, mas não foi enviado (${r.erroAviso ?? "erro"}). Use o botão de reenviar.`, { duration: 10000 });
      setAssinar(null); setSenhaCert(""); setPfx(null); utils.comissoes.aPagar.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const trocarComp = trpc.comissoes.trocarComprovante.useMutation({
    onSuccess: r => {
      toast.success(`${r.comprovanteUrl ? "Comprovante trocado" : "Comprovante removido"}${r.cienciaPedida ? "; a proprietária recebeu de novo o pedido de ciência" : ""}${r.reassinar ? ". Assine o demonstrativo de novo para ele sair com o comprovante certo." : ""}`, { duration: 9000 });
      setRecado(null); setNota(""); setValorComp(""); setPedeValor(false);
      utils.comissoes.aPagar.invalidate();
    },
    onError: e => { if (e.message.startsWith("Não consegui ler o valor")) setPedeValor(true); toast.error(e.message, { duration: 12000 }); },
  });
  const novoComprovante = (contratoId: number, chave: string, f?: File) => {
    if (!f) return;
    const mime = f.type === "application/pdf" ? "application/pdf" : f.type === "image/jpeg" ? "image/jpeg" : f.type === "image/png" ? "image/png" : null;
    if (!mime) { toast.error("Envie PDF, PNG ou JPG"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Arquivo grande demais (máx. 10 MB)"); return; }
    const r = new FileReader();
    r.onload = () => { setNota(""); setPedeValor(false); setValorComp(""); setRecado({ acao: "trocar", contratoId, chave, rotulo: f.name, comprovante: { base64: String(r.result).split(",")[1] ?? "", mime, nomeArquivo: f.name.slice(0, 120) } }); };
    r.readAsDataURL(f);
  };
  const debitar = trpc.comissoes.debitarRepasse.useMutation({
    onSuccess: () => { toast.success("Lançado no caixa do empreendimento; a proprietária recebeu o pedido de ciência"); setRecado(null); setNota(""); utils.comissoes.aPagar.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const reenviar = trpc.comissoes.reenviarDemonstrativo.useMutation({
    onSuccess: () => toast.success("Demonstrativo reenviado ao corretor no WhatsApp"),
    onError: e => toast.error(e.message),
  });
  const baixar = trpc.comissoes.demonstrativo.useMutation({
    onSuccess: r => { const a = document.createElement("a"); a.href = `data:application/pdf;base64,${r.base64}`; a.download = r.nome; a.click(); },
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
      {escritorio && <ReceitasGestao />}
      {escritorio && <ReceitasConcessao />}
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
                    {p.comprovanteUrl && <a href={p.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-primary hover:underline">comprovante</a>}
                    {escritorio && p.situacao === "paga" && (
                      <span className="flex flex-wrap gap-x-2 text-[11px]">
                        <label className="relative cursor-pointer text-primary hover:underline">
                          {p.comprovanteUrl ? "trocar comprovante" : "anexar comprovante"}
                          <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg" disabled={trocarComp.isPending}
                            onChange={e => { novoComprovante(p.venda.contratoId, p.chave, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {p.comprovanteUrl && (
                          <button type="button" className="text-danger-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" disabled={trocarComp.isPending}
                            onClick={() => { setNota(""); setPedeValor(false); setValorComp(""); setRecado({ acao: "remover", contratoId: p.venda.contratoId, chave: p.chave, rotulo: `${p.venda.lote}, ${p.quando}` }); }}>
                            remover
                          </button>
                        )}
                      </span>
                    )}
                    {p.situacao === "paga" && (
                      <button type="button" disabled={baixar.isPending} onClick={() => baixar.mutate({ contratoId: p.venda.contratoId, chave: p.chave })}
                        className="mt-0.5 flex items-center gap-1 text-[11px] text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        <FileText className="h-3 w-3" /> {escritorio && !p.demonstrativoAssinadoEm ? "prévia do demonstrativo" : "demonstrativo (PDF)"}
                      </button>
                    )}
                    {escritorio && p.situacao === "paga" && (p.demonstrativoAssinadoEm
                      ? <span className="block text-[11px] text-ok-300">demonstrativo assinado{p.demonstrativoEnviadoEm ? " e enviado" : " (não enviado)"}</span>
                      : <span className="block text-[11px] text-warn-300">demonstrativo aguarda a sua assinatura</span>)}
                    {escritorio && p.situacao === "paga" && (p.despesaId
                      ? <span className="block text-[11px] text-ok-300">saiu do caixa da proprietária</span>
                      : <span className="block text-[11px] text-warn-300">ainda não saiu do caixa da proprietária</span>)}
                  </td>
                  {escritorio && (
                    <td className="px-3 py-2 text-right">
                      {p.situacao === "paga"
                        ? <span className="inline-flex flex-wrap justify-end gap-1">
                            {!p.despesaId && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={debitar.isPending} title="Lança no caixa do empreendimento e pede a ciência da proprietária"
                                onClick={() => { setNota(""); setPedeValor(false); setValorComp(""); setRecado({ acao: "debitar", contratoId: p.venda.contratoId, chave: p.chave, rotulo: `${brl(p.valor)} — ${p.venda.lote}, ${p.quando}` }); }}>
                                <Landmark className="mr-1 h-3.5 w-3.5" /> Debitar do caixa
                              </Button>
                            )}
                            {admin && !p.demonstrativoAssinadoEm && (
                              <Button size="sm" className="h-7 text-xs" title="Assinar com o seu certificado digital e enviar ao corretor"
                                onClick={() => setAssinar({ contratoId: p.venda.contratoId, chave: p.chave, rotulo: `${p.venda.corretor} — ${p.venda.lote}, ${p.quando}` })}>
                                <FileSignature className="mr-1 h-3.5 w-3.5" /> Assinar e enviar
                              </Button>
                            )}
                            {!!p.demonstrativoAssinadoEm && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" title="Reenviar o demonstrativo assinado ao corretor" disabled={reenviar.isPending}
                                onClick={() => reenviar.mutate({ contratoId: p.venda.contratoId, chave: p.chave })}><Send className="h-3.5 w-3.5" /></Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs" title="Desfazer (só o administrador)" disabled={desfazer.isPending}
                              onClick={() => { if (window.confirm("Desfazer o registro deste pagamento? A saída lançada no caixa também é cancelada.")) desfazer.mutate({ contratoId: p.venda.contratoId, chave: p.chave }); }}><Undo2 className="h-3.5 w-3.5" /></Button>
                          </span>
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

      <Dialog open={!!recado} onOpenChange={o => { if (!o) { setRecado(null); setNota(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{recado?.acao === "debitar" ? "Debitar do caixa" : recado?.acao === "remover" ? "Remover o comprovante" : "Trocar o comprovante"}</DialogTitle></DialogHeader>
          {recado && (
            <div className="space-y-3 text-sm">
              <p>{recado.acao === "debitar" ? `Lançar ${recado.rotulo} como saída do caixa do empreendimento` : recado.acao === "remover" ? `Tirar o comprovante de ${recado.rotulo}` : `Novo comprovante: ${recado.rotulo}`}. A proprietária recebe o pedido de ciência{recado.acao === "debitar" ? "" : " de novo, com o documento corrigido"}.</p>
              <label className="block text-xs text-muted-foreground">Recado para a proprietária (opcional, vai no topo da mensagem e do documento)
                <textarea rows={4} maxLength={600} value={nota} onChange={e => setNota(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
              </label>
              <button type="button" className="text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => setNota("Correção: por uma inconsistência no sistema, no envio do comprovante ele foi anexado à chácara errada. Já corrigimos e, por isso, pedimos de novo a sua ciência. Do caixa saíram somente os valores das comissões já informadas, nada a mais.")}>
                Usar o texto de correção
              </button>
              {recado.acao === "trocar" && pedeValor && campoValor}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecado(null)}>Cancelar</Button>
            <Button disabled={!recado || debitar.isPending || trocarComp.isPending}
              onClick={() => {
                if (!recado) return;
                const n = nota.trim() || null;
                if (recado.acao === "debitar") debitar.mutate({ contratoId: recado.contratoId, chave: recado.chave, nota: n });
                else trocarComp.mutate({ contratoId: recado.contratoId, chave: recado.chave, comprovante: recado.acao === "trocar" ? recado.comprovante ?? null : null, nota: n, valorComprovante: recado.acao === "trocar" ? valorDigitado() : null });
              }}>
              {debitar.isPending || trocarComp.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Confirmar e pedir a ciência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assinar} onOpenChange={o => { if (!o) { setAssinar(null); setSenhaCert(""); setPfx(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assinar o demonstrativo</DialogTitle></DialogHeader>
          {assinar && (
            <div className="space-y-3 text-sm">
              <p>{assinar.rotulo}</p>
              <p className="text-xs text-muted-foreground">Assinatura com o seu certificado digital (o guardado em Meu cadastro). Depois de assinado, o PDF vai ao corretor no WhatsApp.</p>
              <button type="button" disabled={baixar.isPending} onClick={() => baixar.mutate({ contratoId: assinar.contratoId, chave: assinar.chave })}
                className="flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <FileText className="h-3.5 w-3.5" /> Conferir a prévia antes de assinar
              </button>
              <label className="block text-xs text-muted-foreground">Senha do certificado
                <input type="password" autoComplete="off" value={senhaCert} onChange={e => setSenhaCert(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
              </label>
              <label className="block text-xs text-muted-foreground">Ou use um arquivo .pfx agora (opcional, não fica guardado)
                <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={e => {
                  const f = e.target.files?.[0]; e.target.value = "";
                  if (!f) return;
                  const r = new FileReader(); r.onload = () => setPfx(String(r.result).split(",")[1] ?? null); r.readAsDataURL(f);
                }} className="mt-1 block w-full text-sm text-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm" />
                {pfx && <span className="mt-1 block text-xs text-ok-300">Certificado carregado</span>}
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssinar(null)}>Depois</Button>
            <Button disabled={!assinar || !senhaCert || assinarDem.isPending}
              onClick={() => assinar && assinarDem.mutate({ contratoId: assinar.contratoId, chave: assinar.chave, senha: senhaCert, pfxBase64: pfx })}>
              {assinarDem.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSignature className="mr-1 h-4 w-4" />} Assinar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pagar} onOpenChange={o => { if (!o) { setPagar(null); setComp(null); } }}>
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
              <label className="block text-xs text-muted-foreground">Comprovante do pagamento (PDF ou foto)
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => { escolherComp(e.target.files?.[0]); e.target.value = ""; }}
                  className="mt-1 block w-full text-sm text-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm" />
                {comp && <span className="mt-1 block text-xs text-ok-300">Anexado: {comp.nomeArquivo}</span>}
                <span className="mt-1 block text-[11px]">O valor do comprovante é conferido com o desta parte: se não bater, o registro não é feito.</span>
              </label>
              {comp && pedeValor && campoValor}
              <p className="rounded-md bg-secondary/60 p-2 text-xs text-muted-foreground">O demonstrativo em PDF (venda, condições do comprador, partes da comissão{comp ? " e o comprovante anexo" : ""}) só vai ao corretor depois que o administrador assinar com o certificado digital.</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={doCaixa} onChange={e => setDoCaixa(e.target.checked)} /> Pago com o caixa do empreendimento: lança a saída no saldo da proprietária e pede a ciência dela</label>
              <label className="block text-xs text-muted-foreground">Observação (opcional)
                <input value={obs} maxLength={300} onChange={e => setObs(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagar(null)}>Cancelar</Button>
            <Button disabled={!pagar || !pagoEm || registrar.isPending}
              onClick={() => pagar && registrar.mutate({ contratoId: pagar.contratoId, chave: pagar.chave, pagoEm, forma, observacao: obs || undefined, comprovante: comp, avisar: false, doCaixa, valorComprovante: comp ? valorDigitado() : null })}>
              {registrar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Registrar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
