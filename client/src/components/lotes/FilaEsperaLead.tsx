import { useState } from "react";
import { toast } from "sonner";
import { Hourglass, Loader2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROTULO_SITUACAO: Record<string, string> = {
  interesse: "interesse", reservado: "reservada", entrada: "em entrada", vendido_parcelado: "vendida", vendido_avista: "vendida", quitado: "quitada",
};
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Fila de espera do lead (tela do lead): o cliente quer uma chácara que já está reservada → entra na fila. Quando ela
 * voltar a ficar livre, o 1º da fila é avisado no WhatsApp e o corretor recebe o aviso (server/lotes/filaEspera.ts).
 */
export default function FilaEsperaLead({ leadId }: { leadId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.reservas.filaDoLead.useQuery({ leadId });
  const [loteId, setLoteId] = useState("");
  const recarregar = () => utils.reservas.filaDoLead.invalidate({ leadId });
  const entrar = trpc.reservas.entrarFila.useMutation({
    onSuccess: r => { toast.success(`Cliente na fila da chácara ${r.codigo}${r.posicao ? ` — ${r.posicao}º da fila` : ""}`); setLoteId(""); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const encerrar = trpc.reservas.encerrarFila.useMutation({
    onSuccess: r => { toast.success(r.proximo ? `Saiu da fila · ${r.proximo.nome} (próximo) foi avisado` : "Fila atualizada"); recarregar(); },
    onError: e => toast.error(e.message),
  });
  if (isLoading || !data?.empreendimento) return null;
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Hourglass className="h-4 w-4" /> Fila de espera</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.minhas.length > 0 ? (
          <div className="space-y-2">
            {data.minhas.map(m => (
              <div key={m.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 ${m.status === "avisado" ? "border-emerald-400/50 bg-emerald-500/10" : "border-border"}`}>
                <div>
                  <p className="font-semibold">Chácara {m.loteCodigo} · {m.posicao ? `${m.posicao}º da fila` : "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.status === "avisado" ? `🎉 Chácara livre — cliente avisado em ${quando(m.avisadoEm!)}. Faça a reserva!` : `Na fila desde ${quando(m.criadoEm)}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  {m.status === "avisado" && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={encerrar.isPending} onClick={() => encerrar.mutate({ id: m.id, leadId, status: "convertido" })}>Reservou</Button>}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" disabled={encerrar.isPending}
                    onClick={() => { if (confirm(`Tirar o cliente da fila da chácara ${m.loteCodigo}?${m.status === "avisado" ? " O próximo da fila será avisado." : ""}`)) encerrar.mutate({ id: m.id, leadId, status: "desistiu" }); }}>
                    <X className="mr-1 h-3.5 w-3.5" /> Sair
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">O cliente não está em nenhuma fila.</p>}
        {data.ocupadas.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <select value={loteId} onChange={e => setLoteId(e.target.value)} aria-label="Chácara ocupada"
              className="h-8 min-w-[200px] flex-1 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Chácara ocupada que o cliente quer…</option>
              {data.ocupadas.map(o => <option key={o.id} value={o.id}>{o.codigo} · {ROTULO_SITUACAO[o.situacao] ?? o.situacao}{o.naFila ? ` · ${o.naFila} na fila` : ""}</option>)}
            </select>
            <Button size="sm" disabled={!loteId || entrar.isPending} onClick={() => entrar.mutate({ leadId, loteId: Number(loteId) })}>
              {entrar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pôr na fila"}
            </Button>
          </div>
        ) : <p className="text-xs text-muted-foreground">Nenhuma chácara ocupada em {data.empreendimento.nome}.</p>}
        <p className="text-[11px] text-muted-foreground">Se a reserva cair, o 1º da fila recebe a mensagem no WhatsApp e você é avisado na hora.</p>
      </CardContent>
    </Card>
  );
}
