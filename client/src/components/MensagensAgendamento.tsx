import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Copy, Loader2, MessageCircle, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { linkWhatsApp } from "@shared/mensagensAgendamento";

const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiada`); }
  catch { window.prompt("Copie a mensagem:", texto); }
};
const dataHora = (d: unknown) => new Date(d as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Mensagens do pedido feito pelo link de agendamento: o resumo para copiar, a confirmação do cliente (editar e
 * reenviar pelo WhatsApp do sistema) e o "Abrir no WhatsApp" para continuar a conversa. Sem Z-API, copiar + wa.me.
 */
export default function MensagensAgendamento({ visitaId, enviada, aberto: inicial = false }: { visitaId: number; enviada?: boolean; aberto?: boolean }) {
  const [aberto, setAberto] = useState(inicial);
  const utils = trpc.useUtils();
  const { data, error, isLoading } = trpc.crm.mensagensAgendamento.useQuery({ visitaId }, { enabled: aberto });
  const [texto, setTexto] = useState("");
  useEffect(() => { if (data) setTexto(data.cliente); }, [data]);
  const enviar = trpc.crm.enviarConfirmacaoAgendamento.useMutation({
    onSuccess: () => { toast.success("Confirmação enviada pelo WhatsApp do sistema"); utils.crm.mensagensAgendamento.invalidate({ visitaId }); utils.crm.agenda.invalidate(); utils.crm.visitasDoLead.invalidate(); },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20">
      <button type="button" onClick={() => setAberto(a => !a)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs">
        <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-semibold">Mensagens do agendamento</span>
        <span className={enviada ? "text-emerald-300" : "text-amber-300"}>{enviada ? "· confirmação enviada ao cliente" : "· confirmação ainda não enviada"}</span>
        {aberto ? <ChevronUp className="ml-auto h-3.5 w-3.5" /> : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
      </button>
      {aberto && (
        <div className="space-y-3 border-t border-border/70 p-2.5 text-xs">
          {isLoading && <p className="text-muted-foreground">Carregando…</p>}
          {error && <p className="text-red-400">{error.message}</p>}
          {data && (
            <>
              <div className="space-y-1.5">
                <p className="font-semibold text-muted-foreground">Resumo para copiar</p>
                <pre className="whitespace-pre-wrap rounded bg-background/60 p-2 font-sans">{data.corretor}</pre>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copiar(data.corretor, "Mensagem")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar</Button>
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-muted-foreground">
                  Confirmação para o cliente {data.enviadaEm ? <span className="font-normal text-emerald-300">· enviada em {dataHora(data.enviadaEm)}</span> : <span className="font-normal text-amber-300">· não enviada</span>}
                </p>
                <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={9} maxLength={3000} aria-label="Confirmação para o cliente"
                  className="w-full rounded-md border border-border bg-background p-2 text-xs" />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!data.zapi || !texto.trim() || enviar.isPending}
                    onClick={() => { if (!data.enviadaEm || confirm("A confirmação já foi enviada. Enviar de novo?")) enviar.mutate({ visitaId, texto }); }}>
                    {enviar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                    {data.enviadaEm ? "Reenviar confirmação por WhatsApp" : "Enviar confirmação por WhatsApp"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copiar(texto, "Confirmação")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar</Button>
                  <a href={data.waCliente} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center rounded-md border border-[#25d366]/40 px-2 text-xs text-[#1fa855] hover:bg-[#25d366]/10">
                    <MessageCircle className="mr-1 h-3.5 w-3.5" /> Abrir no WhatsApp
                  </a>
                  {!data.zapi && (
                    <a href={linkWhatsApp(data.telefone, texto)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs hover:bg-secondary/40">Abrir no WhatsApp com a confirmação</a>
                  )}
                </div>
                {!data.zapi && <p className="text-amber-300">O WhatsApp do sistema está indisponível agora: copie a confirmação ou abra no seu WhatsApp para mandar.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
