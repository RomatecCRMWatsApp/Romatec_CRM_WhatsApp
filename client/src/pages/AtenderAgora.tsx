import { useLocation } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const COR_URGENCIA: Record<string, string> = {
  agora: "border-red-400/60 bg-red-500/10", hoje: "border-amber-400/50 bg-amber-500/5", depois: "border-border bg-card",
};
const ROTULO_URGENCIA: Record<string, string> = { agora: "Agora", hoje: "Hoje", depois: "Quando der" };
const COR_CLASSE: Record<string, string> = { quente: "text-red-300", morno: "text-amber-300", frio: "text-sky-300" };

/**
 * Leads › Atender agora: a lista de quem atender primeiro, com o motivo (server crm.atenderAgora). Abrir o WhatsApp por
 * aqui conta como atendido; "Já atendi" tira o alerta. Atualiza sozinha a cada 30 s.
 */
export default function AtenderAgora() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.crm.atenderAgora.useQuery(undefined, { refetchInterval: 30_000 });
  const recarregar = () => utils.crm.atenderAgora.invalidate();
  const abriu = trpc.crm.abriuWhatsApp.useMutation({ onSuccess: recarregar });
  const atendido = trpc.crm.marcarAtendido.useMutation({ onSuccess: () => { toast.success("Marcado como atendido"); recarregar(); }, onError: e => toast.error(e.message) });
  const itens = data?.itens ?? [];
  const agora = itens.filter(i => i.urgencia === "agora").length;
  return (
    <div>
      <PageHeader icone={Zap} titulo="Atender agora" subtitulo="Seus leads em ordem de prioridade — quem está esperando, visita hoje, mensagem sem resposta, lead novo e quente" />
      <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {data && <span className="text-muted-foreground">{agora ? <b className="text-red-300">{agora} para atender agora</b> : "Nada urgente agora"} · {data.total} na lista</span>}
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {data && !itens.length && (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Tudo em dia: nenhum lead esperando atendimento.
          </p>
        )}
        {itens.map((l, i) => {
          const fone = l.phone.replace(/\D/g, "");
          return (
            <div key={l.id} className={`rounded-xl border p-3 ${COR_URGENCIA[l.urgencia]}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{i + 1}º</span>
                    <button className="font-semibold hover:underline" onClick={() => navigate(`/leads/lead/${l.id}`)}>{l.nome}</button>
                    <span className={`text-xs font-bold ${COR_CLASSE[l.classe] ?? ""}`}>{l.score ?? "–"} · {String(l.classe).toUpperCase()}</span>
                    <span className="rounded border border-border px-1.5 text-[10px] uppercase text-muted-foreground">{ROTULO_URGENCIA[l.urgencia]}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.rotuloEtapa}{l.chacara ? ` · chácara ${l.chacara}` : ""}{l.responsavel ? ` · ${l.responsavel}` : ""}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {l.motivos.map(m => <li key={m} className="rounded-full bg-secondary/50 px-2 py-0.5 text-xs">{m}</li>)}
                  </ul>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {fone && (
                    <Button size="sm" className="bg-[#25D366] text-white hover:bg-[#1fb956]" asChild>
                      <a href={`https://wa.me/${fone}`} target="_blank" rel="noreferrer" onClick={() => abriu.mutate({ id: l.id })} title="Abrir a conversa (conta como atendido)">
                        <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={atendido.isPending} onClick={() => atendido.mutate({ id: l.id })}>Já atendi</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/leads/lead/${l.id}`)}><ExternalLink className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
