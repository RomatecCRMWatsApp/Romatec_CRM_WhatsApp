import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, FileSignature, Hourglass, Loader2, Map as MapIcon, UserCheck, Building, Unlock } from "lucide-react";

const COR_MOTIVO: Record<string, string> = {
  vencida: "bg-red-500/15 text-red-300", corretor_sem_acesso: "bg-amber-500/15 text-amber-300", sem_corretor: "bg-sky-500/15 text-sky-300",
};
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const prazo = (h: number | null) => (h == null ? "—" : h < 0 ? `venceu há ${Math.abs(h) >= 48 ? `${Math.round(-h / 24)} dias` : `${-h} h`}` : h >= 48 ? `${Math.round(h / 24)} dias` : `${h} h`);

type Item = {
  loteId: number; codigo: string; empreendimento: string; slug: string; empreendimentoId: number; situacao: string; rotuloSituacao: string;
  cliente: string | null; corretorId: number | null; corretorNome: string | null; corretorAtivo: boolean | null;
  contrato: { id: number; numero: string; status: string } | null; reservadoAte: string | null; horasRestantes: number | null;
  desde: string | null; observacao: string | null; motivo: string | null; rotuloMotivo: string | null;
};

/** Passar a reserva para outro corretor habilitado no empreendimento */
function Reatribuir({ item, onFeito }: { item: Item; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const { data: corretores, isLoading } = trpc.reservas.corretores.useQuery({ empreendimentoId: item.empreendimentoId }, { enabled: aberto });
  const acao = trpc.reservas.acao.useMutation({ onSuccess: r => { toast.success(r.mensagem); setAberto(false); onFeito(); }, onError: e => toast.error(e.message) });
  if (!aberto) return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAberto(true)}><UserCheck className="mr-1 h-3.5 w-3.5" /> Passar para corretor</Button>;
  return (
    <select autoFocus className="h-7 rounded-md border border-border bg-background px-1 text-xs" defaultValue="" disabled={acao.isPending}
      onChange={e => e.target.value && acao.mutate({ loteId: item.loteId, acao: { tipo: "reatribuir", corretorId: Number(e.target.value) } })}
      onBlur={() => !acao.isPending && setAberto(false)}>
      <option value="">{isLoading ? "Carregando…" : corretores?.length ? "Escolha o corretor…" : "Nenhum corretor habilitado"}</option>
      {(corretores ?? []).filter(c => c.id !== item.corretorId).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  );
}

function Linha({ item, onFeito }: { item: Item; onFeito: () => void }) {
  const [, navigate] = useLocation();
  const acao = trpc.reservas.acao.useMutation({ onSuccess: r => { toast.success(r.mensagem); onFeito(); }, onError: e => toast.error(e.message) });
  const vencida = item.horasRestantes != null && item.horasRestantes < 0;
  return (
    <tr className="border-b border-border/50 align-top last:border-0">
      <td className="p-2">
        <p className="font-semibold">{item.codigo}</p>
        <p className="text-[11px] text-muted-foreground">{item.empreendimento}</p>
      </td>
      <td className="p-2">
        <p>{item.rotuloSituacao}</p>
        {item.rotuloMotivo && <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] ${COR_MOTIVO[item.motivo ?? ""] ?? ""}`}>{item.rotuloMotivo}</span>}
      </td>
      <td className="p-2">{item.cliente || <span className="text-muted-foreground">—</span>}</td>
      <td className="p-2">
        {item.corretorNome ? <p className={item.corretorAtivo === false ? "text-amber-300" : ""}>{item.corretorNome}{item.corretorAtivo === false ? " (sem acesso)" : ""}</p> : <span className="text-muted-foreground">Escritório</span>}
      </td>
      <td className="p-2 text-xs">
        {item.situacao === "reservado" && item.reservadoAte
          ? <span className={`inline-flex items-center gap-1 ${vencida ? "text-red-300" : item.horasRestantes! < 24 ? "text-amber-300" : ""}`}><Clock className="h-3 w-3" />{prazo(item.horasRestantes)}<span className="text-muted-foreground"> · {dataHora(item.reservadoAte)}</span></span>
          : <span className="text-muted-foreground">{item.situacao === "entrada" ? "com entrada (sem prazo)" : "sem prazo"}</span>}
        {item.contrato && <p className="mt-0.5"><button className="text-primary hover:underline" onClick={() => navigate(`/contratos/${item.contrato!.id}`)}>{item.contrato.numero}</button> <span className="text-muted-foreground">· {item.contrato.status}</span></p>}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap justify-end gap-1">
          <Reatribuir item={item} onFeito={onFeito} />
          {item.corretorId && <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={acao.isPending} onClick={() => { if (confirm(`Assumir a reserva da ${item.codigo} pelo escritório?`)) acao.mutate({ loteId: item.loteId, acao: { tipo: "assumir" } }); }}><Building className="mr-1 h-3.5 w-3.5" /> Assumir</Button>}
          {item.situacao === "reservado" && <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={acao.isPending} onClick={() => acao.mutate({ loteId: item.loteId, acao: { tipo: "prorrogar" } })}><Hourglass className="mr-1 h-3.5 w-3.5" /> +72 h</Button>}
          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" disabled={acao.isPending} onClick={() => {
            if (item.contrato && !["cancelado", "distratado"].includes(item.contrato.status)) { toast.error(`Presa ao contrato ${item.contrato.numero}: cancele o contrato pela tela dele para liberar.`); return; }
            const motivo = window.prompt(`Liberar a chácara ${item.codigo}? Ela volta a ficar disponível. Motivo:`);
            if (motivo && motivo.trim().length >= 3) acao.mutate({ loteId: item.loteId, acao: { tipo: "liberar", motivo } });
          }}><Unlock className="mr-1 h-3.5 w-3.5" /> Liberar</Button>
          {item.slug && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/empreendimentos/${item.slug}?lote=${item.codigo}`)} title="Abrir no mapa"><MapIcon className="h-3.5 w-3.5" /></Button>}
        </div>
      </td>
    </tr>
  );
}

/**
 * Fila de reservas do escritório (administrador e secretária): reservas vencidas, de corretor sem acesso ou sem
 * corretor — passar para outro corretor, assumir, prorrogar 72 h ou liberar. Aba "Todas" com o prazo de cada reserva.
 */
export default function FilaReservas() {
  const { data, isLoading, error, refetch } = trpc.reservas.lista.useQuery(undefined, { refetchInterval: 60_000 });
  const [aba, setAba] = useState<"fila" | "todas">("fila");
  const lista = (aba === "fila" ? data?.fila : data?.todas) as Item[] | undefined;
  return (
    <div>
      <PageHeader icone={Hourglass} titulo="Fila de reservas" subtitulo="Reservas que precisam do escritório: vencidas, de corretor sem acesso ou sem corretor" />
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {([["fila", `Na fila do escritório (${data?.fila.length ?? 0})`], ["todas", `Todas as reservas (${data?.todas.length ?? 0})`]] as const).map(([k, r]) => (
            <button key={k} onClick={() => setAba(k)} className={`rounded-full border px-3 py-1 text-xs ${aba === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{r}</button>
          ))}
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {lista && !lista.length && (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {aba === "fila" ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Nada na fila: todas as reservas estão em dia e com corretor ativo.</> : "Nenhuma chácara reservada no momento."}
          </p>
        )}
        {!!lista?.length && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Chácara</th><th className="p-2">Situação</th><th className="p-2">Cliente</th><th className="p-2">Corretor</th><th className="p-2">Prazo / contrato</th><th className="p-2 text-right">Ações</th>
              </tr></thead>
              <tbody>{lista.map(i => <Linha key={i.loteId} item={i} onFeito={() => refetch()} />)}</tbody>
            </table>
          </div>
        )}
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p>
            A reserva feita pelo contrato vale <b>72 horas</b>. Vencida, o site já mostra a chácara livre, mas ela segue reservada aqui até o escritório decidir:
            <b> +72 h</b> prorroga, <b>Passar para corretor</b> leva a reserva e o lead do cliente para outro corretor habilitado, <b>Assumir</b> deixa com o escritório
            e <b>Liberar</b> devolve a chácara para venda (com contrato ligado, cancele o contrato pela tela dele). Tudo fica no histórico da chácara.
          </p>
        </div>
      </div>
    </div>
  );
}
