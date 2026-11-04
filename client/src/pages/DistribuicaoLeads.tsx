import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Download, Loader2, Search, Send, Shuffle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ROTULO_DESFECHO, ROTULO_SITUACAO } from "@shared/distribuicaoLeads";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Filtro = "sem_responsavel" | "aguardando" | "recentes";
const FILTROS: [Filtro, string][] = [["sem_responsavel", "Sem responsável"], ["aguardando", "Aguardando atendimento"], ["recentes", "Últimos 30 dias"]];
const selectCls = "h-9 rounded-md border border-border bg-background px-2 text-sm";
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const dataHora = (iso: string | null) => !iso ? "—" : new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Leads › Distribuição: a secretária encaminha os leads aos corretores e acompanha o relatório dos encaminhamentos */
export default function DistribuicaoLeads() {
  const [aba, setAba] = useState<"distribuir" | "relatorio">("distribuir");
  return (
    <div>
      <PageHeader icone={Shuffle} titulo="Distribuição de leads" subtitulo="Encaminhe os leads para os corretores e veja o relatório de quem recebeu cada um (a roleta automática continua ligada)" />
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pb-8 md:px-6">
        <div role="tablist" className="grid max-w-md grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/20 p-1">
          {([["distribuir", "Distribuir"], ["relatorio", "Relatório"]] as const).map(([v, r]) => (
            <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
              className={`rounded-md px-2 py-1.5 text-sm font-medium ${aba === v ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
          ))}
        </div>
        {aba === "distribuir" ? <Distribuir aoEncaminhar={() => setAba("relatorio")} /> : <Relatorio />}
      </div>
    </div>
  );
}

function Distribuir({ aoEncaminhar }: { aoEncaminhar: () => void }) {
  const utils = trpc.useUtils();
  const [filtro, setFiltro] = useState<Filtro>("sem_responsavel");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [paraId, setParaId] = useState<number | "">("");
  const [obs, setObs] = useState("");
  const { data: equipe } = trpc.distribuicao.equipe.useQuery();
  const { data: leads, isLoading } = trpc.distribuicao.leads.useQuery({ filtro, busca });
  const encaminhar = trpc.distribuicao.encaminhar.useMutation({
    onSuccess: r => {
      toast.success(`${r.encaminhados} lead(s) encaminhado(s) para ${r.para}${r.jaEram ? ` · ${r.jaEram} já era(m) dele` : ""}. O corretor foi avisado no sistema e no WhatsApp.`, {
        action: { label: "Ver relatório", onClick: aoEncaminhar },
      });
      setSel(new Set()); setObs("");
      utils.distribuicao.leads.invalidate(); utils.distribuicao.relatorio.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const lista = leads ?? [];
  const todos = lista.length > 0 && lista.every(l => sel.has(l.id));
  const alternar = (id: number) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const nomePara = equipe?.find(u => u.id === paraId)?.nome;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Mostrar
          <select id="dist-filtro" className={selectCls} value={filtro} onChange={e => { setFiltro(e.target.value as Filtro); setSel(new Set()); }}>
            {FILTROS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input id="dist-busca" className="pl-8" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" />
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-end gap-2 rounded-lg border border-emerald-500/40 bg-card p-3 shadow">
        <span className="text-sm font-semibold">{sel.size} selecionado(s)</span>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Encaminhar para
          <select id="dist-para" className={`${selectCls} min-w-[200px]`} value={paraId} onChange={e => setParaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— escolha o corretor —</option>
            {equipe?.map(u => <option key={u.id} value={u.id}>{u.nome}{u.recebeLeads ? "" : " (fora da roleta)"}</option>)}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-muted-foreground">Observação (opcional, vai no relatório)
          <Input id="dist-obs" value={obs} onChange={e => setObs(e.target.value)} maxLength={300} placeholder="Ex.: cliente pediu atendimento de manhã" />
        </label>
        <Button disabled={!sel.size || !paraId || encaminhar.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => { if (confirm(`Encaminhar ${sel.size} lead(s) para ${nomePara}? Ele(a) recebe o aviso no sistema e no WhatsApp.`)) encaminhar.mutate({ leadIds: Array.from(sel), paraId: Number(paraId), observacao: obs || null }); }}>
          {encaminhar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Encaminhar
        </Button>
      </div>

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!isLoading && !lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum lead {filtro === "sem_responsavel" ? "sem responsável" : filtro === "aguardando" ? "aguardando atendimento" : "nos últimos 30 dias"}{busca ? ` para "${busca}"` : ""}.</p>}
      {!!lista.length && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2"><input type="checkbox" aria-label="Selecionar todos" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(lista.map(l => l.id)))} /></th>
                <th className="p-2">Lead</th><th className="p-2">Telefone</th><th className="p-2">Origem</th><th className="p-2">Interesse</th>
                <th className="p-2">Chegou em</th><th className="p-2">Responsável hoje</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(l => (
                <tr key={l.id} className={`border-t border-border ${sel.has(l.id) ? "bg-emerald-500/10" : ""}`} onClick={() => alternar(l.id)}>
                  <td className="p-2"><input type="checkbox" aria-label={`Selecionar ${l.nome}`} checked={sel.has(l.id)} onChange={() => alternar(l.id)} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-2 font-medium"><Link href={`/leads/lead/${l.id}`} onClick={(e: any) => e.stopPropagation()} className="hover:underline">{l.nome}</Link>{l.score === "quente" && <span className="ml-1 text-[10px] text-orange-400">🔥</span>}</td>
                  <td className="p-2 whitespace-nowrap">{l.telefone}</td>
                  <td className="p-2 text-xs text-muted-foreground">{l.origem ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{[l.empreendimento, l.lote].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{dataHora(l.criadoEm)}{l.aguardandoDesde && <span className="ml-1 text-amber-400">· esperando</span>}</td>
                  <td className="p-2 text-xs">{l.responsavel ?? <span className="text-red-400">sem responsável</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Relatorio() {
  const [de, setDe] = useState(diasAtras(7));
  const [ate, setAte] = useState(hoje());
  const [paraId, setParaId] = useState<number | "">("");
  const [origem, setOrigem] = useState<"" | "manual" | "automatico">("manual");
  const filtro = useMemo(() => ({ de, ate, paraId: paraId || null, origem: origem || null }), [de, ate, paraId, origem]);
  const { data: equipe } = trpc.distribuicao.equipe.useQuery();
  const { data, isLoading, error } = trpc.distribuicao.relatorio.useQuery(filtro, { enabled: !!de && !!ate });
  const csv = trpc.distribuicao.csv.useMutation({
    onSuccess: r => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.conteudo], { type: "text/csv;charset=utf-8" }));
      a.download = r.nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">De<Input id="rel-de" type="date" value={de} onChange={e => setDe(e.target.value)} className="w-40" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Até<Input id="rel-ate" type="date" value={ate} onChange={e => setAte(e.target.value)} className="w-40" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Corretor
          <select id="rel-para" className={selectCls} value={paraId} onChange={e => setParaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Todos</option>{equipe?.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
          <select id="rel-origem" className={selectCls} value={origem} onChange={e => setOrigem(e.target.value as any)}>
            <option value="manual">Manual (secretária/escritório)</option><option value="automatico">Automático (roleta)</option><option value="">Todos</option>
          </select>
        </label>
        <Button variant="outline" className="ml-auto" disabled={csv.isPending || !data?.itens.length} onClick={() => csv.mutate(filtro)}>
          {csv.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Baixar planilha (CSV)
        </Button>
      </div>
      {error && <p className="text-sm text-red-400">{error.message}</p>}
      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[["Encaminhamentos", data.resumo.total], ["Manuais", data.resumo.manual], ["Automáticos", data.resumo.automatico], ["Aguardando confirmação", data.resumo.aguardando], ["Vendidos", data.resumo.vendidos]].map(([r, n]) => (
              <div key={String(r)} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-2xl font-bold">{n}</p></div>
            ))}
          </div>
          {!!data.porCorretor.length && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por corretor</p>
              <div className="flex flex-wrap gap-2">
                {data.porCorretor.map(c => (
                  <span key={c.corretor} className="rounded-md bg-secondary/40 px-2 py-1 text-xs"><b>{c.corretor}</b>: {c.total} recebidos ({c.manual} manual · {c.automatico} automático) · {c.confirmados} confirmados{c.aguardando ? <span className="text-amber-300"> · {c.aguardando} sem confirmar</span> : null} · {c.vendidos} vendidos · {c.perdidos} perdidos</span>
                ))}
              </div>
            </div>
          )}
          {!data.itens.length ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum encaminhamento no período.</p> : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-left text-xs text-muted-foreground">
                  <tr><th className="p-2">Data e hora</th><th className="p-2">Tipo</th><th className="p-2">Lead</th><th className="p-2">De</th><th className="p-2">Para</th><th className="p-2">Por</th><th className="p-2">Continua com ele</th><th className="p-2">Recebimento</th><th className="p-2">Desfecho</th><th className="p-2">Observação</th></tr>
                </thead>
                <tbody>
                  {data.itens.map(i => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="whitespace-nowrap p-2 text-xs">{dataHora(i.quando)}</td>
                      <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${i.origem === "manual" ? "bg-emerald-600/30 text-emerald-200" : "bg-sky-600/30 text-sky-200"}`}>{i.origem === "manual" ? "MANUAL" : "AUTOMÁTICO"}</span></td>
                      <td className="p-2"><Link href={`/leads/lead/${i.leadId}`} className="font-medium hover:underline">{i.lead}</Link><span className="block text-[11px] text-muted-foreground">{i.telefone}</span></td>
                      <td className="p-2 text-xs">{i.de ?? <span className="text-muted-foreground">sem responsável</span>}</td>
                      <td className="p-2 text-xs font-semibold">{i.para}</td>
                      <td className="p-2 text-xs">{i.por ?? "—"}</td>
                      <td className="p-2 text-xs">{i.continuaCom}</td>
                      <td className="whitespace-nowrap p-2 text-xs">{i.recebidoEm ? <span className="text-emerald-300">✔ {dataHora(i.recebidoEm)}</span> : i.desfecho ? "—" : <span className="text-amber-300">aguardando</span>}</td>
                      <td className="p-2 text-xs">{i.desfecho ? <><b>{ROTULO_DESFECHO[i.desfecho]}</b>{i.desfechoMotivo ? <span className="block text-muted-foreground">{i.desfechoMotivo}</span> : null}</> : ROTULO_SITUACAO[i.situacao]}</td>
                      <td className="p-2 text-xs text-muted-foreground">{i.observacao ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
