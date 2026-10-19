import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

export const ROTULO_STATUS_VISITA: Record<string, string> = {
  agendada: "Agendada", confirmada: "Confirmada", realizada: "Realizada", nao_veio: "Não veio", cancelada: "Cancelada",
};
export const COR_STATUS_VISITA: Record<string, string> = {
  agendada: "bg-sky-500/15 text-sky-300", confirmada: "bg-emerald-500/15 text-emerald-300", realizada: "bg-violet-500/15 text-violet-300",
  nao_veio: "bg-amber-500/15 text-amber-300", cancelada: "bg-zinc-500/15 text-zinc-400",
};

export const dataHora = (d: string | Date) =>
  new Date(d).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** "2026-10-20T14:30" (campo datetime-local, hora do navegador) → ISO */
const paraIso = (v: string) => (v ? new Date(v).toISOString() : "");

/** Botões de resultado de uma visita (usados na tela do lead e na agenda) */
export function AcoesVisita({ visita, onMudou }: { visita: { id: number; status: string; quando: string | Date }; onMudou: () => void }) {
  const status = trpc.crm.statusVisita.useMutation({ onSuccess: () => { toast.success("Visita atualizada"); onMudou(); }, onError: e => toast.error(e.message) });
  const remarcar = trpc.crm.remarcarVisita.useMutation({ onSuccess: () => { toast.success("Visita remarcada"); setNova(""); onMudou(); }, onError: e => toast.error(e.message) });
  const [nova, setNova] = useState("");
  if (!["agendada", "confirmada"].includes(visita.status)) return null;
  const passou = new Date(visita.quando).getTime() < Date.now();
  const b = (rotulo: string, s: string, cls = "") => (
    <Button key={s} size="sm" variant="outline" className={`h-7 px-2 text-xs ${cls}`} disabled={status.isPending} onClick={() => status.mutate({ id: visita.id, status: s as any })}>{rotulo}</Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visita.status === "agendada" && !passou && b("Confirmada", "confirmada")}
      {b("✅ Realizada", "realizada", "border-violet-500/40")}
      {passou && b("Não veio", "nao_veio")}
      {b("Cancelar", "cancelada", "text-muted-foreground")}
      <input type="datetime-local" value={nova} onChange={e => setNova(e.target.value)} className="h-7 rounded-md border border-border bg-secondary px-2 text-xs" aria-label="Nova data" />
      {nova && <Button size="sm" className="h-7 px-2 text-xs" disabled={remarcar.isPending} onClick={() => remarcar.mutate({ id: visita.id, quando: paraIso(nova) })}>Remarcar</Button>}
    </div>
  );
}

export default function VisitasLead({ leadId, imoveis, onMudou }: { leadId: number; imoveis: { id: number; codigo?: string | null; titulo?: string | null; denomination?: string | null }[]; onMudou?: () => void }) {
  const utils = trpc.useUtils();
  const { data: visitas } = trpc.crm.visitasDoLead.useQuery({ leadId });
  const [quando, setQuando] = useState("");
  const [local, setLocal] = useState("");
  const [imovel, setImovel] = useState<string>("");
  const atualizar = () => { utils.crm.visitasDoLead.invalidate({ leadId }); utils.crm.agenda.invalidate(); onMudou?.(); };
  const agendar = trpc.crm.agendarVisita.useMutation({
    onSuccess: () => { toast.success("Visita agendada — o responsável foi avisado"); setQuando(""); setLocal(""); atualizar(); },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Visitas</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {(visitas ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma visita ainda.</p>}
        {(visitas ?? []).map(v => (
          <div key={v.id} className="rounded-lg border border-border p-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{dataHora(v.quando)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_STATUS_VISITA[v.status] ?? ""}`}>{ROTULO_STATUS_VISITA[v.status] ?? v.status}</span>
              {v.confirmadaPeloCliente && <span className="text-[11px] text-emerald-300">cliente confirmou pelo WhatsApp</span>}
              {!v.confirmadaPeloCliente && v.lembreteEnviado && v.status === "agendada" && <span className="text-[11px] text-muted-foreground">lembrete enviado</span>}
            </div>
            {(v.imovel || v.local) && <p className="text-xs text-muted-foreground">{[v.imovel, v.local].filter(Boolean).join(" · ")}</p>}
            <AcoesVisita visita={v} onMudou={atualizar} />
          </div>
        ))}

        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Agendar visita</p>
          <input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} className="w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm" aria-label="Data e hora da visita" />
          {imoveis.length > 0 && (
            <select value={imovel} onChange={e => setImovel(e.target.value)} className="w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm" aria-label="Imóvel">
              <option value="">Imóvel (opcional)</option>
              {imoveis.map(i => <option key={i.id} value={i.id}>{[i.codigo, i.titulo ?? i.denomination].filter(Boolean).join(" — ")}</option>)}
            </select>
          )}
          <input value={local} onChange={e => setLocal(e.target.value)} maxLength={200} placeholder="Local / ponto de encontro (opcional)" className="w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm" />
          <Button size="sm" className="w-full" disabled={!quando || agendar.isPending}
            onClick={() => agendar.mutate({ leadId, quando: paraIso(quando), local: local || undefined, propertyId: imovel ? Number(imovel) : null })}>
            Agendar
          </Button>
          <p className="text-[11px] text-muted-foreground">O cliente recebe um lembrete na véspera (se a visita for marcada com 12 h de antecedência) e pode confirmar com SIM. O responsável é avisado 2 h antes.</p>
        </div>
      </CardContent>
    </Card>
  );
}
