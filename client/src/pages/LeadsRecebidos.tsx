import { Link } from "wouter";
import { Inbox, Loader2, MessageCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import AcoesRecebimento from "@/components/AcoesRecebimento";
import { ROTULO_DESFECHO, ROTULO_SITUACAO } from "@shared/distribuicaoLeads";

const dataHora = (iso: string | null) => !iso ? "—" : new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const COR = { aguardando_confirmacao: "border-warn-500/60 bg-warn-500/5", em_atendimento: "border-ok-500/40", finalizado: "border-border opacity-70" } as const;

/** Leads › Leads recebidos: o corretor confirma que recebeu cada lead encaminhado e informa o desfecho */
export default function LeadsRecebidos() {
  const { data, isLoading } = trpc.distribuicao.meus.useQuery(undefined, { refetchInterval: 30_000, refetchOnWindowFocus: true });
  const lista = data ?? [];
  const pendentes = lista.filter(l => l.situacao === "aguardando_confirmacao").length;
  return (
    <div>
      <PageHeader icone={Inbox} titulo="Leads recebidos" subtitulo="Confirme que recebeu cada lead encaminhado para você e, se não der certo, informe o motivo. Venda lançada no sistema finaliza sozinha." />
      <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
        {pendentes > 0 && <p className="rounded-lg border border-warn-500/60 bg-warn-500/10 p-3 text-sm font-medium text-warn-200">{pendentes} lead(s) aguardando a sua confirmação de recebimento.</p>}
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {!isLoading && !lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum lead encaminhado para você nos últimos 30 dias.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map(l => (
            <div key={l.id} className={`space-y-2 rounded-xl border bg-card p-3 ${COR[l.situacao]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/leads/lead/${l.leadId}`} className="font-semibold hover:underline">{l.lead}</Link>
                  <p className="text-xs text-muted-foreground">{l.telefone}{l.interesse ? ` · ${l.interesse}` : ""}</p>
                </div>
                <span className="whitespace-nowrap rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] font-bold">{l.desfecho ? ROTULO_DESFECHO[l.desfecho] : ROTULO_SITUACAO[l.situacao]}</span>
              </div>
              <p className="text-xs text-muted-foreground">Encaminhado em {dataHora(l.quando)} por {l.por ?? "—"}{l.recebidoEm ? ` · recebido em ${dataHora(l.recebidoEm)}` : ""}</p>
              {l.observacao && <p className="rounded bg-secondary/30 px-2 py-1 text-xs">{l.observacao}</p>}
              {l.desfechoMotivo && <p className="text-xs text-muted-foreground">Motivo: {l.desfechoMotivo}</p>}
              {l.situacao !== "finalizado" && (
                <div className="flex flex-wrap items-start gap-2">
                  {l.telefone && <Button size="sm" asChild className="bg-[color:var(--c-25d366)] text-white hover:bg-[color:var(--c-1fb956)]"><a href={`https://wa.me/${l.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</a></Button>}
                  <div className="flex-1"><AcoesRecebimento id={l.id} recebido={!!l.recebidoEm} /></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
