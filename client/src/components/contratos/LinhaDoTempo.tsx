import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface Props {
  contratoId: number;
  /** Mostra o plano e as observações no topo (o detalhe já mostra; a lista sim) */
  comResumo?: boolean;
}

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

/**
 * Linha do tempo (auditoria) do contrato: preenchimento, minuta, definitivo, envio, cada assinatura, manifesto,
 * entrada paga, via oficial enviada pelo WhatsApp e ativação. Etapa feita = verde, com a data e a hora.
 */
export function LinhaDoTempo({ contratoId, comResumo }: Props) {
  const { data, isLoading, error } = trpc.contratos.linhaDoTempo.useQuery({ id: contratoId });
  if (isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a linha do tempo…</p>;
  if (error || !data) return <p className="text-xs text-danger-400">{error?.message ?? "Não foi possível carregar a linha do tempo"}</p>;
  const feitas = data.etapas.filter(e => e.feito).length;
  return (
    <div className="space-y-3">
      {comResumo && (
        <div className="space-y-1 text-xs">
          <p><span className="text-muted-foreground">Plano:</span> <b className="text-foreground">{data.plano}</b></p>
          {data.observacoes.map(o => <p key={o} className="text-warn-200">• {o}</p>)}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Linha do tempo · {feitas} de {data.etapas.length} etapas concluídas</p>
      <ol className="relative ml-2 border-l border-border">
        {data.etapas.map(e => (
          <li key={e.chave} className="relative pb-3 pl-5 last:pb-0">
            <span className={`absolute -left-[9px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-card ${e.feito ? "text-ok-400" : "text-muted-foreground/60"}`}>
              {e.feito ? <CheckCircle2 className="h-[18px] w-[18px]" aria-label="concluída" /> : <Circle className="h-[14px] w-[14px]" aria-label="pendente" />}
            </span>
            <p className={`text-sm ${e.feito ? "font-medium text-ok-300" : "text-muted-foreground"}`}>{e.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {[quando(e.em), e.detalhe].filter(Boolean).join(" · ") || (e.feito ? "" : "pendente")}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
