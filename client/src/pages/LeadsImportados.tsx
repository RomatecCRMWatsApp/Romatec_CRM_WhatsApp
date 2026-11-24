import { useState } from "react";
import { Link, useSearch } from "wouter";
import { toast } from "sonner";
import { Bot, FileUp, Loader2, Search, Send, Smartphone, Undo2, UserRoundCheck, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { ROTULO_RESPOSTA } from "@shared/importacaoContatos";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ImportarContatos from "./ImportarContatos";

type Filtro = "novos" | "todos" | "sem_corretor" | "na_fila" | "sem_resposta" | "responderam" | "quentes" | "removidos";
const FILTROS: [Filtro, string][] = [
  ["novos", "Novos (para trabalhar)"], ["sem_corretor", "Sem corretor"], ["responderam", "Responderam"], ["quentes", "Quentes"],
  ["sem_resposta", "Ainda não responderam"], ["na_fila", "Retomada na fila"], ["todos", "Todos"], ["removidos", "Removidos da lista"],
];
const ENVIO: Record<string, string> = {
  pendente: "Na fila", enviando: "Enviando", enviado: "Enviada", erro: "Erro no envio", cancelado: "Cancelada", pausado: "Pausada",
};
const selectCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");

/**
 * Leads importados do celular (/leads/importados): separados dos leads de captação (site, anúncios, WhatsApp).
 * Mostra a retomada e a qualificação feita pelo robô, e encaminha para os corretores (mesmo registro da Distribuição).
 * A aba "Importar arquivo" (só o administrador) sobe a agenda exportada do celular.
 */
export default function LeadsImportados() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const busca0 = new URLSearchParams(useSearch()).get("aba");
  const [aba, setAba] = useState<"leads" | "importar">(busca0 === "importar" && admin ? "importar" : "leads");

  return (
    <div>
      <PageHeader icone={Smartphone} titulo="Leads importados" subtitulo="Contatos trazidos da agenda do celular — não vieram de captação. O robô retoma a conversa e qualifica; daqui você encaminha aos corretores." />
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-10 md:px-6">
        <div role="tablist" className="flex gap-2 border-b border-border">
          <button role="tab" aria-selected={aba === "leads"} onClick={() => setAba("leads")} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === "leads" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Leads importados</button>
          {admin && <button role="tab" aria-selected={aba === "importar"} onClick={() => setAba("importar")} className={`-mb-px flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${aba === "importar" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}><FileUp className="h-4 w-4" /> Importar arquivo</button>}
        </div>
        {aba === "leads" ? <ListaImportados irImportar={admin ? () => setAba("importar") : undefined} /> : <ImportarContatos embutido />}
      </div>
    </div>
  );
}

function ListaImportados({ irImportar }: { irImportar?: () => void }) {
  const utils = trpc.useUtils();
  const [filtro, setFiltro] = useState<Filtro>("novos");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [paraId, setParaId] = useState<number | "">("");
  const { data, isLoading, error } = trpc.importacaoContatos.lista.useQuery({ filtro, busca }, { refetchInterval: 60_000 });
  const { data: equipe } = trpc.distribuicao.equipe.useQuery();
  const atualizar = () => { setSel(new Set()); utils.importacaoContatos.lista.invalidate(); utils.distribuicao.leads.invalidate(); };
  const remover = trpc.importacaoContatos.removerDaLista.useMutation({
    onSuccess: r => { toast.success(`${r.removidos} lead(s) tirado(s) da lista. O robô não fala mais com eles.`); atualizar(); },
    onError: e => toast.error(e.message),
  });
  const voltar = trpc.importacaoContatos.voltarParaLista.useMutation({
    onSuccess: r => { toast.success(`${r.voltaram} lead(s) de volta à lista.`); atualizar(); },
    onError: e => toast.error(e.message),
  });
  const encaminhar = trpc.importacaoContatos.passarAoCorretor.useMutation({
    onSuccess: r => {
      toast.success(`${r.encaminhados} lead(s) encaminhado(s) para ${r.para}. O robô saiu da conversa e o corretor foi avisado no sistema e no WhatsApp.`);
      setSel(new Set()); utils.importacaoContatos.lista.invalidate(); utils.distribuicao.leads.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const itens = data?.itens ?? [];
  const r = data?.resumo;
  const todos = itens.length > 0 && itens.every(i => sel.has(i.id));
  const alternar = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const nomePara = equipe?.find(u => u.id === paraId)?.nome;
  const removidos = filtro === "removidos";
  const enviarAoCorretor = (ids: number[], quem: string) => {
    if (!paraId) { toast.error("Escolha o corretor no quadro \"Encaminhar para\" acima."); return; }
    const robo = itens.filter(i => ids.includes(i.id) && faixa(i) === "robo").length;
    if (confirm(`${robo ? `Atenção: ${robo} ainda não respondeu e está com o robô (faixa verde).\n\n` : ""}Encaminhar ${quem} para ${nomePara}? O robô para de falar com o cliente e o corretor recebe o aviso no sistema e no WhatsApp.`))
      encaminhar.mutate({ leadIds: ids, paraId: Number(paraId), observacao: "Lead importado do celular" });
  };
  const tirarDaLista = (ids: number[], quem: string) => {
    const motivo = prompt(`Tirar ${quem} da lista de leads importados?\nO lead continua no CRM e o robô para de falar com ele.\n\nMotivo (opcional), ex.: já comprou, aguardando retorno da família:`, "");
    if (motivo === null) return;
    remover.mutate({ leadIds: ids, motivo: motivo.trim() || null });
  };

  if (error) return <p className="text-sm text-danger-400">{error.message}</p>;
  return (
    <div className="space-y-3">
      {data?.ritmo && <StatusRobo ativo={!!data.ritmo.ativo} motivo={data.ritmo.motivo} />}
      {r && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {([
            ["Conversando", r.conversando, "responderam e o robô está qualificando", "text-ok-300", "responderam"],
            ["Qualificados", r.qualificados, "responderam tudo", "text-primary", "responderam"],
            ["Com corretor", r.comCorretor, "atendimento humano", "text-info-300", "todos"],
            ["Sem resposta", r.semResposta, "mensagem enviada, ainda parados", "text-warn-300", "sem_resposta"],
            ["Na fila", r.naFila, "ainda sem mensagem", "text-muted-foreground", "na_fila"],
            ["Saíram", r.sairam, "pediram para sair", "text-danger-300", "todos"],
          ] as const).map(([rot, v, dica, cor, f]) => (
            <button key={rot} onClick={() => { setFiltro(f as Filtro); setSel(new Set()); }} title={dica}
              className="rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-3">
              <p className="text-[11px] leading-tight text-muted-foreground">{rot}</p>
              <p className={`text-xl font-semibold tabular-nums ${cor}`}>{v}</p>
            </button>
          ))}
        </div>
      )}
      {r && <p className="text-[11px] text-muted-foreground">{r.total} importados · {r.enviados} já receberam a retomada · {r.novos} para trabalhar{r.removidos ? ` · ${r.removidos} removido(s) da lista` : ""}</p>}
      {r && !r.total && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhum lead importado ainda.{irImportar && <> <button onClick={irImportar} className="text-primary hover:underline">Importar a agenda do celular</button>.</>}
        </p>
      )}

      {filtro === "novos" && <p className="text-xs text-muted-foreground">Só quem ainda está para trabalhar, do mais novo para o mais antigo: ficam de fora quem já foi atendido, quem está com um corretor, quem pediu para sair e os perdidos ou fechados (estão nos outros filtros).</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(([v, rot]) => (
            <button key={v} aria-pressed={filtro === v} onClick={() => { setFiltro(v); setSel(new Set()); }}
              className={`rounded-full border px-3 py-1 text-xs ${filtro === v ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{rot}</button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" />
        </div>
      </div>

      <div className="z-10 flex flex-wrap items-end gap-2 rounded-lg border border-ok-500/40 bg-card p-3 shadow md:sticky md:top-[env(safe-area-inset-top)]">
        <span className="text-sm font-semibold">{sel.size} selecionado(s)</span>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground sm:flex-none">Encaminhar para
          <select className={`${selectCls} w-full sm:min-w-[200px]`} value={paraId} onChange={e => setParaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— escolha o corretor —</option>
            {equipe?.map(u => <option key={u.id} value={u.id} disabled={u.semAcesso}>{u.nome}{u.semAcesso ? " (sem acesso)" : ""}</option>)}
          </select>
        </label>
        <Button disabled={!sel.size || !paraId || encaminhar.isPending || removidos} className="bg-ok-600 text-white hover:bg-ok-700"
          onClick={() => enviarAoCorretor(Array.from(sel), `${sel.size} lead(s)`)}>
          {encaminhar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Encaminhar
        </Button>
        {removidos ? (
          <Button variant="outline" disabled={!sel.size || voltar.isPending} onClick={() => voltar.mutate({ leadIds: Array.from(sel) })}>
            <Undo2 className="mr-1 h-4 w-4" /> Voltar à lista
          </Button>
        ) : (
          <Button variant="outline" disabled={!sel.size || remover.isPending} className="border-danger-500/40 text-danger-300 hover:bg-danger-500/10" onClick={() => tirarDaLista(Array.from(sel), `${sel.size} lead(s)`)}>
            <X className="mr-1 h-4 w-4" /> Remover da lista
          </Button>
        )}
        <p className="hidden w-full text-[11px] text-muted-foreground sm:block">O encaminhamento fica no relatório da Distribuição, igual aos leads de captação, e o robô sai da conversa. Quem responder ao robô e quiser fechar vai direto para o corretor responsável.</p>
      </div>

      <Legenda />
      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!isLoading && !!r?.total && !itens.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum lead neste filtro{busca ? ` para "${busca}"` : ""}.</p>}
      {!!itens.length && (
        <ul className="space-y-2 md:hidden">
          {itens.map(i => (
            <li key={i.id} className={`rounded-xl border border-l-4 p-3 ${sel.has(i.id) ? "border-ok-500/60 bg-ok-500/15" : `border-border bg-card ${COR_FAIXA[faixa(i)]}`}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5" aria-label={`Selecionar ${i.nome}`} checked={sel.has(i.id)} onChange={() => alternar(i.id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/leads/lead/${i.id}`} className="truncate font-medium hover:underline">{i.nome}</Link>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{dataBr(i.importadoEm)}</span>
                  </div>
                  <a href={`https://wa.me/${i.telefone}`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary">+{i.telefone}</a>
                  <p className="mt-1.5 text-sm"><Situacao i={i} /></p>
                  {Object.keys(i.respostas).length > 0 && (
                    <p className="mt-1 text-xs text-foreground/80">{(["finalidade", "prazo", "pagamento"] as const).map(k => i.respostas[k] ? ROTULO_RESPOSTA[k][i.respostas[k]!] ?? i.respostas[k] : null).filter(Boolean).join(" · ")}</p>
                  )}
                  <AcoesLinha i={i} removidos={removidos} onCorretor={() => enviarAoCorretor([i.id], i.nome)} onRemover={() => tirarDaLista([i.id], i.nome)} onVoltar={() => voltar.mutate({ leadIds: [i.id] })} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Retomada: {i.envio ? ENVIO[i.envio] ?? i.envio : "não programada"}{i.enviadoAt ? ` em ${dataBr(i.enviadoAt)}` : ""} · {i.comCorretor ? `com ${i.responsavel}` : "sem corretor"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!!itens.length && (
        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2"><input type="checkbox" aria-label="Selecionar todos" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(itens.map(i => i.id)))} /></th>
                <th className="p-2">Cliente</th><th className="p-2">Retomada</th><th className="p-2">Respostas ao robô</th><th className="p-2">Situação</th><th className="p-2">Corretor</th><th className="p-2">Importado em</th><th className="p-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.id} className={`border-t border-border ${sel.has(i.id) ? "bg-ok-500/15" : COR_FAIXA[faixa(i)]}`} onClick={() => alternar(i.id)}>
                  <td className={`border-l-4 p-2 ${BORDA_FAIXA[faixa(i)]}`}><input type="checkbox" aria-label={`Selecionar ${i.nome}`} checked={sel.has(i.id)} onChange={() => alternar(i.id)} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-2">
                    <Link href={`/leads/lead/${i.id}`} onClick={(e: any) => e.stopPropagation()} className="font-medium hover:underline">{i.nome}</Link>
                    <span className="block text-[11px] text-muted-foreground">+{i.telefone}</span>
                  </td>
                  <td className="p-2 text-xs">{i.envio ? ENVIO[i.envio] ?? i.envio : "Não programada"}{i.enviadoAt && <span className="block text-[11px] text-muted-foreground">{dataBr(i.enviadoAt)}</span>}</td>
                  <td className="p-2 text-xs">
                    {(["finalidade", "prazo", "pagamento"] as const).map(k => i.respostas[k] ? ROTULO_RESPOSTA[k][i.respostas[k]!] ?? i.respostas[k] : null).filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2 text-xs"><Situacao i={i} /></td>
                  <td className="p-2 text-xs">{i.comCorretor ? i.responsavel : <span className="text-warn-300">Sem corretor{i.responsavel ? ` (com ${i.responsavel.split(" ")[0]})` : ""}</span>}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{dataBr(i.importadoEm)}</td>
                  <td className="p-2" onClick={e => e.stopPropagation()}>
                    <AcoesLinha i={i} removidos={removidos} onCorretor={() => enviarAoCorretor([i.id], i.nome)} onRemover={() => tirarDaLista([i.id], i.nome)} onVoltar={() => voltar.mutate({ leadIds: [i.id] })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Faixa de controle da secretaria: verde = o robô já mandou a retomada (conversando ou sem resposta ainda),
 * não encaminhar sem necessidade; amarelo = livre para encaminhar ao corretor (a retomada dele é cancelada).
 */
type Faixa = "respondeu" | "robo" | "livre" | "fora";
function faixa(i: { saiu: boolean; comCorretor: boolean; humano: boolean; qualificado: boolean; respondeu: boolean; envio: string | null }): Faixa {
  if (i.saiu || i.comCorretor) return "fora";
  if (i.respondeu || i.qualificado || i.humano) return "respondeu";
  if (i.envio === "enviado") return "robo";
  return "livre";
}
const COR_FAIXA: Record<Faixa, string> = {
  respondeu: "bg-info-500/[0.08] border-l-info-400", robo: "bg-ok-500/[0.08] border-l-ok-500", livre: "bg-warn-500/[0.08] border-l-warn-400", fora: "border-l-transparent",
};
const BORDA_FAIXA: Record<Faixa, string> = { respondeu: "border-l-info-400", robo: "border-l-ok-500", livre: "border-l-warn-400", fora: "border-l-transparent" };

function Legenda() {
  const item = (cor: string, fundo: string, titulo: string, txt: string, tituloCor: string) => (
    <span className="flex items-center gap-2"><span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-sm border-l-4 ${cor} ${fundo}`} />
      <span><b className={tituloCor}>{titulo}</b> {txt}</span></span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      {item("border-l-info-400", "bg-info-500/25", "Azul:", "respondeu ao robô. Pode encaminhar ao corretor para começar a tratativa.", "text-info-300")}
      {item("border-l-ok-500", "bg-ok-500/25", "Verde:", "sem resposta ainda, o robô continua tentando. Deixe com ele.", "text-ok-300")}
      {item("border-l-warn-400", "bg-warn-500/25", "Amarelo:", "livre, o robô ainda não mandou mensagem. Pode encaminhar ao corretor.", "text-warn-300")}
    </div>
  );
}

/** Botões da linha: ir para o corretor (quem respondeu) e tirar da lista */
function AcoesLinha({ i, removidos, onCorretor, onRemover, onVoltar }: { i: Parameters<typeof faixa>[0] & { nome: string }; removidos: boolean; onCorretor: () => void; onRemover: () => void; onVoltar: () => void }) {
  if (removidos) return <button onClick={onVoltar} className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"><Undo2 className="h-3.5 w-3.5" /> Voltar à lista</button>;
  const f = faixa(i);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 md:mt-0 md:flex-nowrap">
      {f === "respondeu" && (
        <button onClick={onCorretor} title={`Encaminhar ${i.nome} ao corretor escolhido acima`} className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md bg-info-500/20 px-2 text-xs font-medium text-info-200 hover:bg-info-500/30">
          <UserRoundCheck className="h-3.5 w-3.5" /> Ao corretor
        </button>
      )}
      <button onClick={onRemover} title={`Tirar ${i.nome} da lista`} className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 text-xs text-muted-foreground hover:border-danger-500/40 hover:text-danger-300">
        <X className="h-3.5 w-3.5" /> Remover
      </button>
    </div>
  );
}

function Situacao({ i }: { i: { saiu: boolean; humano: boolean; qualificado: boolean; respondeu: boolean; score: string | null; envio: string | null } }) {
  if (i.saiu) return <span className="text-danger-400">Pediu para sair</span>;
  if (i.humano) return <span className="text-heat-400">Quer falar com corretor</span>;
  if (i.qualificado) return <span className="text-primary">Qualificado · {i.score === "quente" ? "🔥 quente" : i.score === "morno" ? "🌡️ morno" : "❄️ frio"}</span>;
  if (i.respondeu) return <span className="text-ok-300">Conversando com o robô</span>;
  if (i.envio === "enviado") return <span className="text-warn-300">Sem resposta ainda</span>;
  return <span className="text-muted-foreground">Na fila, ainda sem mensagem</span>;
}

/** Robozinho do topo: verde enviando, vermelho parado, com o motivo */
export function StatusRobo({ ativo, motivo }: { ativo: boolean; motivo: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-xl border p-3 ${ativo ? "border-ok-500/40 bg-ok-500/10" : "border-danger-500/40 bg-danger-500/10"}`}>
      <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${ativo ? "bg-ok-500/20 text-ok-400" : "bg-danger-500/20 text-danger-400"}`}>
        <Bot className="h-6 w-6" aria-hidden />
        <span className={`absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full ${ativo ? "bg-ok-400 motion-safe:animate-pulse" : "bg-danger-400"}`} />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${ativo ? "text-ok-300" : "text-danger-300"}`}>{ativo ? "Robô enviando" : "Robô parado"}</p>
        <p className="text-xs text-muted-foreground">{motivo}</p>
      </div>
    </div>
  );
}
