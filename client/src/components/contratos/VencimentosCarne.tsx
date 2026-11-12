import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

interface Props { contratoId: number; diaAtual?: number | null; onAplicado: () => void }

const br = (iso: string) => iso.split("-").reverse().join("/");
const ROTULO: Record<string, string> = { saldo: "Parcela", complemento: "Complemento", reforco: "Reforço" };

/**
 * Dia de vencimento do carnê escolhido pelo comprador: o escritório escolhe o dia e o mês da 1ª parcela, confere a
 * prévia e aplica. Só remarca as parcelas ainda não emitidas; a emissão no Asaas continua pelo botão "Emitir no Asaas".
 */
export function VencimentosCarne({ contratoId, diaAtual, onAplicado }: Props) {
  const [dia, setDia] = useState(String(diaAtual ?? 25));
  const [mes, setMes] = useState("");
  const m = trpc.contratos.vencimentos.useMutation({ onError: e => toast.error(e.message) });
  const previa = m.data && !m.data.aplicado ? m.data : null;
  const rodar = (aplicar: boolean) => m.mutate({ id: contratoId, dia: Number(dia), primeiroMes: mes || null, aplicar }, {
    onSuccess: r => { if (r.aplicado) { toast.success(`${r.mudancas.length} parcela(s) remarcada(s) para o dia ${r.dia}`); onAplicado(); } },
  });
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" /> Dia de vencimento do carnê</h2>
      <p className="text-xs text-muted-foreground">O comprador escolhe o dia. A 1ª parcela do saldo vai para o mês seguinte ao pagamento da entrada (ou o mês que você indicar), e todas as outras parcelas ainda não emitidas andam junto, no mesmo dia. Valores não mudam.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Dia
          <select className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={dia} onChange={e => { setDia(e.target.value); m.reset(); }}>
            {Array.from({ length: 31 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">1ª parcela do saldo (mês)
          <input type="month" className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={mes} onChange={e => { setMes(e.target.value); m.reset(); }} />
        </label>
        <Button variant="outline" disabled={m.isPending} onClick={() => rodar(false)}>{m.isPending && !previa ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ver como fica</Button>
        {previa && <Button disabled={m.isPending} onClick={() => { if (confirm(`Remarcar ${previa.mudancas.length} parcela(s) para o dia ${previa.dia}?`)) rodar(true); }}>Aplicar</Button>}
      </div>
      {previa && (
        <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3 text-xs">
          {previa.resumo.map(t => <p key={t}>{t}</p>)}
          <ul className="max-h-48 overflow-auto">
            {previa.mudancas.slice(0, 15).map(x => (
              <li key={x.id} className="tabular-nums text-muted-foreground">{ROTULO[x.tipo] ?? x.tipo} {x.numero}/{x.total}: {br(x.de)} → <b className="text-foreground">{br(x.para)}</b></li>
            ))}
            {previa.mudancas.length > 15 && <li className="text-muted-foreground">… e mais {previa.mudancas.length - 15}</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
