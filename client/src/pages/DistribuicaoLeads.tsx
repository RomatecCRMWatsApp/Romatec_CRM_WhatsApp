import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Download, Loader2, RefreshCw, Search, Send, Shuffle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ROTULO_DESFECHO, ROTULO_SITUACAO } from "@shared/distribuicaoLeads";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Filtro = "nao_encaminhados" | "sem_responsavel" | "aguardando" | "recentes" | "todos";
const FILTROS: [Filtro, string][] = [["nao_encaminhados", "Não encaminhados (quente, morno e frio)"], ["sem_responsavel", "Sem responsável"], ["aguardando", "Aguardando atendimento"], ["recentes", "Últimos 30 dias"], ["todos", "Todos os leads"]];
const VAZIO: Record<Filtro, string> = { nao_encaminhados: "ainda não encaminhado a um corretor", sem_responsavel: "sem responsável", aguardando: "aguardando atendimento", recentes: "nos últimos 30 dias", todos: "" };
const selectCls = "h-9 rounded-md border border-border bg-background px-2 text-sm";
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const dataHora = (iso: string | null) => !iso ? "—" : new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Leads › Distribuição: a secretária encaminha os leads aos corretores e acompanha o relatório dos encaminhamentos */
export default function DistribuicaoLeads() {
  const [aba, setAba] = useState<"distribuir" | "relatorio">("distribuir");
  return (
    <div>
      <PageHeader icone={Shuffle} titulo="Distribuição de leads" subtitulo="Encaminhe os leads para os corretores e veja o relatório de quem recebeu cada um" />
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pb-8 md:px-6">
        <div role="tablist" className="grid max-w-md grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/20 p-1">
          {([["distribuir", "Distribuir"], ["relatorio", "Relatório"]] as const).map(([v, r]) => (
            <button key={v} type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
              className={`rounded-md px-2 py-1.5 text-sm font-medium ${aba === v ? "bg-ok-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
          ))}
        </div>
        {aba === "distribuir" ? <Distribuir aoEncaminhar={() => setAba("relatorio")} /> : <Relatorio />}
      </div>
    </div>
  );
}

function Distribuir({ aoEncaminhar }: { aoEncaminhar: () => void }) {
  const utils = trpc.useUtils();
  const [filtro, setFiltro] = useState<Filtro>("nao_encaminhados");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [paraId, setParaId] = useState<number | "">("");
  const [obs, setObs] = useState("");
  const { data: equipe } = trpc.distribuicao.equipe.useQuery();
  const { data: leads, isLoading } = trpc.distribuicao.leads.useQuery({ filtro, busca });
  const encaminhar = trpc.distribuicao.encaminhar.useMutation({
    onSuccess: r => {
      toast.success(`${r.encaminhados} lead(s) encaminhado(s) para ${r.para}${r.jaEram ? ` · ${r.jaEram} já estava(m) com ele aguardando confirmação` : ""}. O corretor foi avisado no sistema e no WhatsApp.`, {
        action: { label: "Ver relatório", onClick: aoEncaminhar },
      });
      setSel(new Set()); setObs("");
      utils.distribuicao.leads.invalidate(); utils.distribuicao.relatorio.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const liberar = trpc.distribuicao.liberarDoEscritorio.useMutation({
    onSuccess: r => { toast.success(`${r.liberados} lead(s) sem o escritório como responsável: prontos para encaminhar ao plantão`); utils.distribuicao.leads.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const lista = leads ?? [];
  const comEscritorio = filtro === "nao_encaminhados" ? lista.filter(l => l.responsavelId).length : 0;
  const todos = lista.length > 0 && lista.every(l => sel.has(l.id));
  const alternar = (id: number) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const nomePara = equipe?.find(u => u.id === paraId)?.nome;

  return (
    <div className="space-y-3">
      <ModoDistribuicao />
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

      {comEscritorio > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn-500/40 bg-warn-500/5 p-3 text-sm">
          <span className="flex-1"><b>{comEscritorio}</b> lead(s) ainda com o escritório como responsável. Tire o nome do escritório para eles ficarem só aguardando o corretor de plantão.</span>
          <Button size="sm" variant="outline" disabled={liberar.isPending} onClick={() => { if (confirm(`Tirar o escritório de responsável de ${comEscritorio} lead(s)? Eles ficam "sem responsável" até serem encaminhados.`)) liberar.mutate(); }}>
            {liberar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Tirar o escritório de todos
          </Button>
        </div>
      )}
      <div className="sticky top-[env(safe-area-inset-top)] z-10 flex flex-wrap items-end gap-2 rounded-lg border border-ok-500/40 bg-card p-3 shadow">
        <span className="text-sm font-semibold">{sel.size} selecionado(s)</span>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Encaminhar para
          <select id="dist-para" className={`${selectCls} min-w-[200px]`} value={paraId} onChange={e => setParaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— escolha o corretor —</option>
            {equipe?.map(u => <option key={u.id} value={u.id} disabled={u.semAcesso}>{u.nome}{u.semAcesso ? " (sem acesso — licença bloqueada)" : u.recebeLeads ? "" : " (fora da roleta)"}</option>)}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-muted-foreground">Observação (opcional, vai no relatório)
          <Input id="dist-obs" value={obs} onChange={e => setObs(e.target.value)} maxLength={300} placeholder="Ex.: cliente pediu atendimento de manhã" />
        </label>
        <Button disabled={!sel.size || !paraId || encaminhar.isPending} className="bg-ok-600 text-white hover:bg-ok-700"
          onClick={() => { if (confirm(`Encaminhar ${sel.size} lead(s) para ${nomePara}? Ele(a) recebe o aviso no sistema e no WhatsApp.`)) encaminhar.mutate({ leadIds: Array.from(sel), paraId: Number(paraId), observacao: obs || null }); }}>
          {encaminhar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Encaminhar
        </Button>
      </div>

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!isLoading && !lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum lead {VAZIO[filtro]}{busca ? ` para "${busca}"` : ""}.</p>}
      {!isLoading && !!lista.length && <p className="text-xs text-muted-foreground"><b className="text-foreground">{lista.length}</b> lead(s) {VAZIO[filtro] || "no total"}{busca ? ` para "${busca}"` : ""}.</p>}
      {!!lista.length && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2"><input type="checkbox" aria-label="Selecionar todos" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(lista.map(l => l.id)))} /></th>
                <th className="p-2">Lead</th><th className="p-2">Telefone</th><th className="p-2">Temperatura</th><th className="p-2">Origem</th><th className="p-2">Interesse</th>
                <th className="p-2">Chegou em</th><th className="p-2">Responsável hoje</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(l => (
                <tr key={l.id} className={`border-t border-border ${sel.has(l.id) ? "bg-ok-500/10" : ""}`} onClick={() => alternar(l.id)}>
                  <td className="p-2"><input type="checkbox" aria-label={`Selecionar ${l.nome}`} checked={sel.has(l.id)} onChange={() => alternar(l.id)} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-2 font-medium"><Link href={`/leads/lead/${l.id}`} onClick={(e: any) => e.stopPropagation()} className="hover:underline">{l.nome}</Link>{l.score === "quente" && <span className="ml-1 text-[10px] text-heat-400"></span>}</td>
                  <td className="p-2 whitespace-nowrap">{l.telefone}</td>
                  <td className="p-2 text-xs">{l.score === "quente" ? "🔥 quente" : l.score === "morno" ? "🌡️ morno" : "❄️ frio"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{l.origem ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{[l.empreendimento, l.lote].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{dataHora(l.criadoEm)}{l.aguardandoDesde && <span className="ml-1 text-warn-400">· esperando</span>}</td>
                  <td className="p-2 text-xs">{l.responsavel ?? <span className="text-danger-400">sem responsável</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Chave automático × manual: no manual a roleta para e todo lead novo espera a secretária/escritório encaminhar */
function ModoDistribuicao() {
  const utils = trpc.useUtils();
  const { data } = trpc.distribuicao.modo.useQuery();
  const definir = trpc.distribuicao.definirModo.useMutation({
    onSuccess: r => { toast.success(r.modo === "manual" ? "Distribuição MANUAL: a roleta parou; os leads novos esperam aqui para serem encaminhados" : "Distribuição AUTOMÁTICA: a roleta volta a escolher o corretor"); utils.distribuicao.modo.invalidate(); },
    onError: e => toast.error(e.message),
  });
  if (!data) return null;
  const manual = data.modo === "manual";
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${manual ? "border-warn-500/50 bg-warn-500/5" : "border-ok-500/40 bg-ok-500/5"}`}>
      <div className="min-w-[220px] flex-1 text-sm">
        <b>Distribuição: {manual ? "MANUAL" : "AUTOMÁTICA"}</b>
        <p className="text-xs text-muted-foreground">{manual
          ? "A roleta está parada. Todo lead novo (quente, morno ou frio) fica em \"Não encaminhados\" até a secretária ou o escritório encaminhar."
          : "A roleta escolhe o corretor quando o lead pede atendimento e repassa se ninguém atender. Os leads que ela não pegou aparecem em \"Não encaminhados\"."}</p>
      </div>
      <div role="group" aria-label="Modo da distribuição" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/20 p-1">
        {(["automatico", "manual"] as const).map(m => (
          <button key={m} type="button" aria-pressed={data.modo === m} disabled={definir.isPending || data.modo === m}
            onClick={() => { if (confirm(m === "manual" ? "Mudar para distribuição MANUAL? A roleta para de escolher corretor sozinha." : "Voltar para distribuição AUTOMÁTICA (roleta)?")) definir.mutate({ modo: m }); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${data.modo === m ? (m === "manual" ? "bg-warn-600 text-white" : "bg-ok-600 text-white") : "text-muted-foreground hover:text-foreground"}`}>
            {m === "manual" ? "Manual" : "Automática"}
          </button>
        ))}
      </div>
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
  // Atualiza sozinho a cada 20 s (confirmações chegando) e no botão "Atualizar"
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = trpc.distribuicao.relatorio.useQuery(filtro, { enabled: !!de && !!ate, refetchInterval: 20_000, refetchOnWindowFocus: true });
  const reenviar = trpc.distribuicao.reenviar.useMutation({
    onSuccess: r => toast.success(`Aviso reenviado para ${r.reenviados} lead(s)${r.ignorados ? ` · ${r.ignorados} já confirmado(s) ou finalizado(s)` : ""}`),
    onError: e => toast.error(e.message),
  });
  const pendentes = (data?.itens ?? []).filter(i => i.situacao === "aguardando_confirmacao");
  // Trocar o corretor direto no relatório quando ele não confirma o recebimento (fecha o anterior como "repassado")
  const [trocando, setTrocando] = useState<number | null>(null);
  const utilsRel = trpc.useUtils();
  const trocar = trpc.distribuicao.encaminhar.useMutation({
    onSuccess: r => { toast.success(`Lead passado para ${r.para}. O novo corretor foi avisado no sistema e no WhatsApp.`); setTrocando(null); utilsRel.distribuicao.relatorio.invalidate(); utilsRel.distribuicao.leads.invalidate(); },
    onError: e => toast.error(e.message),
  });
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
        <Button variant="outline" className="ml-auto border-warn-500/60" disabled={reenviar.isPending || !pendentes.length}
          title="Manda de novo o aviso (sistema e WhatsApp, com o link de confirmar) para quem ainda não confirmou o recebimento"
          onClick={() => { if (confirm(`Reenviar o aviso de ${pendentes.length} lead(s) que ainda não tiveram o recebimento confirmado?`)) reenviar.mutate({ ids: pendentes.map(i => i.id) }); }}>
          {reenviar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Reenviar aviso aos sem confirmação ({pendentes.length})
        </Button>
        <Button variant="outline" disabled={isFetching} onClick={() => refetch()} title="As confirmações também chegam sozinhas a cada 20 segundos">
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar{dataUpdatedAt ? <span className="ml-1 text-[10px] text-muted-foreground">({new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })})</span> : null}
        </Button>
        <Button variant="outline" disabled={csv.isPending || !data?.itens.length} onClick={() => csv.mutate(filtro)}>
          {csv.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Baixar planilha (CSV)
        </Button>
      </div>
      {error && <p className="text-sm text-danger-400">{error.message}</p>}
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
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Por corretor</p>
              <div className="flex flex-wrap gap-2">
                {data.porCorretor.map(c => (
                  <span key={c.corretor} className="rounded-md bg-secondary/40 px-2 py-1 text-xs"><b>{c.corretor}</b>: {c.total} recebidos ({c.manual} manual, {c.automatico} automático), {c.confirmados} confirmados{c.aguardando ? <span className="text-warn-300">, {c.aguardando} sem confirmar</span> : null}, {c.vendidos} vendidos, {c.perdidos} perdidos</span>
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
                      <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${i.origem === "manual" ? "bg-ok-600/30 text-ok-200" : "bg-info-600/30 text-info-200"}`}>{i.origem === "manual" ? "MANUAL" : "AUTOMÁTICO"}</span></td>
                      <td className="p-2"><Link href={`/leads/lead/${i.leadId}`} className="font-medium hover:underline">{i.lead}</Link><span className="block text-[11px] text-muted-foreground">{i.telefone}</span></td>
                      <td className="p-2 text-xs">{i.de ?? <span className="text-muted-foreground">sem responsável</span>}</td>
                      <td className="p-2 text-xs font-semibold">{i.para}</td>
                      <td className="p-2 text-xs">{i.por ?? "—"}</td>
                      <td className="p-2 text-xs">{i.continuaCom}</td>
                      <td className="whitespace-nowrap p-2 text-xs">{i.recebidoEm ? <span className="text-ok-300">{dataHora(i.recebidoEm)}</span> : i.desfecho ? "—" : (
                        <span className="flex flex-wrap items-center gap-1.5 text-warn-300">aguardando
                          {i.expiraEm && <span className="block w-full text-[10px] text-muted-foreground">volta ao escritório às {dataHora(i.expiraEm)}</span>}
                          <button type="button" className="min-h-8 rounded border border-warn-500/60 px-2 py-1 text-[11px] text-warn-200 hover:bg-warn-500/20" disabled={reenviar.isPending}
                            onClick={() => reenviar.mutate({ ids: [i.id] })} title="Reenviar o aviso para o corretor">Reenviar</button>
                          {trocando === i.id ? (
                            <select autoFocus aria-label="Trocar o corretor" className={`${selectCls} h-8 text-xs`} defaultValue="" disabled={trocar.isPending}
                              onBlur={() => !trocar.isPending && setTrocando(null)}
                              onChange={e => {
                                const novo = Number(e.target.value);
                                const nome = equipe?.find(u => u.id === novo)?.nome ?? "o corretor";
                                if (novo && confirm(`Passar o lead ${i.lead} de ${i.para} para ${nome}? ${i.para} deixa de ser o responsável e ${nome} recebe o aviso.`)) {
                                  trocar.mutate({ leadIds: [i.leadId], paraId: novo, observacao: `Troca: ${i.para} não confirmou o recebimento` });
                                } else setTrocando(null);
                              }}>
                              <option value="">— novo corretor —</option>
                              {equipe?.filter(u => u.nome !== i.para).map(u => <option key={u.id} value={u.id} disabled={u.semAcesso}>{u.nome}{u.semAcesso ? " (sem acesso)" : u.recebeLeads ? "" : " (fora da roleta)"}</option>)}
                            </select>
                          ) : (
                            <button type="button" className="min-h-8 rounded border border-info-500/60 px-2 py-1 text-[11px] text-info-200 hover:bg-info-500/20" disabled={trocar.isPending}
                              onClick={() => setTrocando(i.id)} title="Passar o lead para outro corretor">Trocar corretor</button>
                          )}
                        </span>)}</td>
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
