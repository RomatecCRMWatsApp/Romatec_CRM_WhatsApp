import { useState } from "react";
import { Link, useSearch } from "wouter";
import { toast } from "sonner";
import { FileUp, Loader2, Search, Send, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { ROTULO_RESPOSTA } from "@shared/importacaoContatos";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ImportarContatos from "./ImportarContatos";

type Filtro = "todos" | "sem_corretor" | "na_fila" | "sem_resposta" | "responderam" | "quentes";
const FILTROS: [Filtro, string][] = [
  ["sem_corretor", "Sem corretor"], ["responderam", "Responderam"], ["quentes", "Quentes"],
  ["sem_resposta", "Ainda não responderam"], ["na_fila", "Retomada na fila"], ["todos", "Todos"],
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
  const [filtro, setFiltro] = useState<Filtro>("sem_corretor");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [paraId, setParaId] = useState<number | "">("");
  const { data, isLoading, error } = trpc.importacaoContatos.lista.useQuery({ filtro, busca }, { refetchInterval: 60_000 });
  const { data: equipe } = trpc.distribuicao.equipe.useQuery();
  const encaminhar = trpc.distribuicao.encaminhar.useMutation({
    onSuccess: r => {
      toast.success(`${r.encaminhados} lead(s) encaminhado(s) para ${r.para}. O corretor foi avisado no sistema e no WhatsApp.`);
      setSel(new Set()); utils.importacaoContatos.lista.invalidate(); utils.distribuicao.leads.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const itens = data?.itens ?? [];
  const r = data?.resumo;
  const todos = itens.length > 0 && itens.every(i => sel.has(i.id));
  const alternar = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const nomePara = equipe?.find(u => u.id === paraId)?.nome;

  if (error) return <p className="text-sm text-danger-400">{error.message}</p>;
  return (
    <div className="space-y-3">
      {r && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {([
            ["Importados", r.total], ["Sem corretor", r.semCorretor], ["Retomada na fila", r.naFila], ["Retomada enviada", r.enviados],
            ["Responderam", r.responderam], ["Quentes", r.quentes], ["Pediram para sair", r.sairam],
          ] as const).map(([rot, v]) => (
            <div key={rot} className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">{rot}</p>
              <p className="text-xl font-semibold">{v}</p>
            </div>
          ))}
        </div>
      )}
      {r && !r.total && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nenhum lead importado ainda.{irImportar && <> <button onClick={irImportar} className="text-primary hover:underline">Importar a agenda do celular</button>.</>}
        </p>
      )}

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

      <div className="sticky top-[env(safe-area-inset-top)] z-10 flex flex-wrap items-end gap-2 rounded-lg border border-ok-500/40 bg-card p-3 shadow">
        <span className="text-sm font-semibold">{sel.size} selecionado(s)</span>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Encaminhar para
          <select className={`${selectCls} min-w-[200px]`} value={paraId} onChange={e => setParaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— escolha o corretor —</option>
            {equipe?.map(u => <option key={u.id} value={u.id} disabled={u.semAcesso}>{u.nome}{u.semAcesso ? " (sem acesso)" : ""}</option>)}
          </select>
        </label>
        <Button disabled={!sel.size || !paraId || encaminhar.isPending} className="bg-ok-600 text-white hover:bg-ok-700"
          onClick={() => { if (confirm(`Encaminhar ${sel.size} lead(s) importado(s) para ${nomePara}? Ele(a) recebe o aviso no sistema e no WhatsApp.`)) encaminhar.mutate({ leadIds: Array.from(sel), paraId: Number(paraId), observacao: "Lead importado do celular" }); }}>
          {encaminhar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Encaminhar
        </Button>
        <p className="w-full text-[11px] text-muted-foreground">O encaminhamento fica no relatório da Distribuição, igual aos leads de captação. Quem responder ao robô e quiser fechar vai direto para o corretor responsável.</p>
      </div>

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!isLoading && !!r?.total && !itens.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum lead neste filtro{busca ? ` para "${busca}"` : ""}.</p>}
      {!!itens.length && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2"><input type="checkbox" aria-label="Selecionar todos" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(itens.map(i => i.id)))} /></th>
                <th className="p-2">Cliente</th><th className="p-2">Retomada</th><th className="p-2">Respostas ao robô</th><th className="p-2">Situação</th><th className="p-2">Corretor</th><th className="p-2">Importado em</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.id} className={`border-t border-border ${sel.has(i.id) ? "bg-ok-500/10" : ""}`} onClick={() => alternar(i.id)}>
                  <td className="p-2"><input type="checkbox" aria-label={`Selecionar ${i.nome}`} checked={sel.has(i.id)} onChange={() => alternar(i.id)} onClick={e => e.stopPropagation()} /></td>
                  <td className="p-2">
                    <Link href={`/leads/lead/${i.id}`} onClick={(e: any) => e.stopPropagation()} className="font-medium hover:underline">{i.nome}</Link>
                    <span className="block text-[11px] text-muted-foreground">+{i.telefone}</span>
                  </td>
                  <td className="p-2 text-xs">{i.envio ? ENVIO[i.envio] ?? i.envio : "Não programada"}{i.enviadoAt && <span className="block text-[11px] text-muted-foreground">{dataBr(i.enviadoAt)}</span>}</td>
                  <td className="p-2 text-xs">
                    {(["finalidade", "prazo", "pagamento"] as const).map(k => i.respostas[k] ? ROTULO_RESPOSTA[k][i.respostas[k]!] ?? i.respostas[k] : null).filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2 text-xs">
                    {i.saiu ? <span className="text-danger-400">Pediu para sair</span>
                      : i.humano ? <span className="text-heat-400">Quer falar com corretor</span>
                      : i.qualificado ? `Qualificado · ${i.score === "quente" ? "🔥 quente" : i.score === "morno" ? "🌡️ morno" : "❄️ frio"}`
                      : i.respondeu ? "Respondendo ao robô" : "Aguardando resposta"}
                  </td>
                  <td className="p-2 text-xs">{i.comCorretor ? i.responsavel : <span className="text-warn-300">Sem corretor{i.responsavel ? ` (com ${i.responsavel.split(" ")[0]})` : ""}</span>}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{dataBr(i.importadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
