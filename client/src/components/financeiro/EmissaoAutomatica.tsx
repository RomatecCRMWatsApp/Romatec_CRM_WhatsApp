/**
 * Financeiro › Cobrança automática: emissão automática dos boletos/Pix no Asaas (server/financeiro/emissaoAuto.ts).
 * Liga/desliga (só o administrador) e a prévia do que sai: carnê 1 na assinatura, o próximo 45 dias antes.
 */
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";

export default function EmissaoAutomatica() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const { data } = trpc.financeiro.emissaoAutoEstado.useQuery();
  const definir = trpc.financeiro.emissaoAutoDefinir.useMutation({
    onSuccess: (r: any) => {
      utils.financeiro.emissaoAutoEstado.invalidate();
      toast.success(r.ligada ? `Emissão automática ligada${r.emitidas ? `: ${r.emitidas} cobrança(s) emitida(s) agora` : ""}` : "Emissão automática desligada");
    },
    onError: e => toast.error(e.message),
  });
  const previa = data?.previa ?? [];
  const prontos = previa.filter(p => p.parcelas > 0 && !p.faltas.length);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Emissão automática no Asaas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando todos assinam o contrato, o carnê 1 (entrada e primeiras parcelas) sai no Asaas com boleto e Pix. Os carnês seguintes
            saem sozinhos {data?.diasAntecedencia ?? 45} dias antes de vencer. Entrada marcada como paga no ato não vira boleto, e parcela já
            vencida nunca é emitida sem alguém conferir. O que travar (cadastro incompleto, Asaas) aparece no sino.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={!!data?.ligada} disabled={!admin || definir.isPending}
            onCheckedChange={v => {
              if (v && !confirm(`Ligar a emissão automática? ${prontos.length ? `Agora já saem cobranças de ${prontos.length} contrato(s) da prévia abaixo.` : "Nada sai agora; a partir daqui, cada contrato assinado já gera o carnê 1."}`)) return;
              definir.mutate({ ligada: v });
            }} />
          {data?.ligada ? "Ligada" : "Desligada"}
        </label>
      </div>
      {!admin && <p className="mt-2 text-xs text-muted-foreground">Só o administrador liga ou desliga.</p>}

      <h3 className="mt-4 text-sm font-semibold">O que sairia hoje</h3>
      {!previa.length ? <p className="mt-1 text-sm text-muted-foreground">Nada para emitir agora: os contratos ativos estão em dia com os carnês.</p> : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {previa.map(p => (
            <li key={p.contratoId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <Link href={`/contratos/${p.contratoId}`} className="min-w-0 flex-1 hover:underline">
                <b>{p.contrato}</b> · chácara {p.chacara} · {p.comprador}
              </Link>
              {p.parcelas > 0 && <span className="text-xs">Carnê {p.carnes.join(", ")} · {p.parcelas} parcela(s){p.entradaNoAto ? " · entrada paga no ato" : ""}</span>}
              {p.faltas.length > 0 && p.parcelas > 0
                ? <span className="inline-flex items-center gap-1 text-xs text-warn-300"><AlertTriangle className="h-3.5 w-3.5" /> Falta {p.faltas.join(", ")}</span>
                : p.parcelas > 0 && <span className="inline-flex items-center gap-1 text-xs text-ok-400"><CheckCircle2 className="h-3.5 w-3.5" /> Pronto</span>}
              {p.vencidasSemBoleto > 0 && <span className="w-full text-xs text-danger-400">{p.vencidasSemBoleto} parcela(s) vencida(s) sem boleto: confira se foram pagas por fora</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
