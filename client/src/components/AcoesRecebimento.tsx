import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DESFECHOS_CORRETOR, ROTULO_DESFECHO, type DesfechoCorretor } from "@shared/distribuicaoLeads";

/**
 * Botões do corretor para um lead encaminhado: "Confirmar recebimento" e "Finalizar" (desistiu, sem contato,
 * não qualificado, comprou em outro lugar). Venda não aparece aqui: o sistema finaliza ao lançar a venda/contrato.
 */
export default function AcoesRecebimento({ id, recebido, aoMudar }: { id: number; recebido: boolean; aoMudar?: () => void }) {
  const utils = trpc.useUtils();
  const [abrir, setAbrir] = useState(false);
  const [desfecho, setDesfecho] = useState<DesfechoCorretor | "">("");
  const [motivo, setMotivo] = useState("");
  const { user } = useAuth();
  const atendente = perfilDe(user as any) === "atendente";
  const [repassar, setRepassar] = useState(false);
  const [corretorId, setCorretorId] = useState("");
  const [nota, setNota] = useState("");
  const corretores = trpc.distribuicao.corretoresParaRepasse.useQuery(undefined, { enabled: atendente && repassar });
  const atualizar = () => { utils.distribuicao.meus.invalidate(); utils.distribuicao.doLead.invalidate(); aoMudar?.(); };
  const confirmar = trpc.distribuicao.confirmar.useMutation({ onSuccess: () => { toast.success("Recebimento confirmado"); atualizar(); }, onError: e => toast.error(e.message) });
  const finalizar = trpc.distribuicao.finalizar.useMutation({ onSuccess: () => { toast.success("Atendimento finalizado"); setAbrir(false); atualizar(); }, onError: e => toast.error(e.message) });

  const passar = trpc.distribuicao.passarAoCorretor.useMutation({ onSuccess: r => { toast.success(`Fechamento passado para ${r.para}`); setRepassar(false); atualizar(); }, onError: e => toast.error(e.message) });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!recebido && (
          <Button size="sm" className="bg-ok-600 text-white hover:bg-ok-700" disabled={confirmar.isPending} onClick={() => confirmar.mutate({ id })}>
            {confirmar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Confirmar recebimento
          </Button>
        )}
        {atendente && (
          <Button size="sm" variant="outline" onClick={() => setRepassar(!repassar)}><Send className="mr-1 h-4 w-4" /> Passar ao corretor</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setAbrir(!abrir)}><XCircle className="mr-1 h-4 w-4" /> Não deu certo</Button>
      </div>
      {repassar && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-secondary/20 p-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Corretor do fechamento
            <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={corretorId} onChange={e => setCorretorId(e.target.value)}>
              <option value="">{corretores.isLoading ? "Carregando…" : "— escolha —"}</option>
              {(corretores.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-muted-foreground">Recado para o corretor (opcional)
            <Input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} placeholder="Ex.: quer visitar sábado, prefere a C10" />
          </label>
          <Button size="sm" disabled={!corretorId || passar.isPending} onClick={() => passar.mutate({ id, paraId: Number(corretorId), observacao: nota || null })}>
            {passar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Passar o fechamento
          </Button>
          <p className="w-full text-[11px] text-muted-foreground">O corretor recebe o aviso no WhatsApp e o lead sai da sua lista.</p>
        </div>
      )}
      {abrir && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-secondary/20 p-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">O que aconteceu?
            <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={desfecho} onChange={e => setDesfecho(e.target.value as DesfechoCorretor)}>
              <option value="">— escolha —</option>
              {DESFECHOS_CORRETOR.map(d => <option key={d} value={d}>{ROTULO_DESFECHO[d]}</option>)}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-muted-foreground">Detalhe (opcional)
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: achou longe, vai comprar ano que vem" />
          </label>
          <Button size="sm" variant="destructive" disabled={!desfecho || finalizar.isPending}
            onClick={() => desfecho && finalizar.mutate({ id, desfecho, motivo: motivo || null })}>
            {finalizar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Finalizar atendimento
          </Button>
          <p className="w-full text-[11px] text-muted-foreground">O lead vai para “Perdido” no funil com esse motivo. Se vender, não precisa marcar nada: ao lançar a venda ou o contrato o sistema finaliza sozinho.</p>
        </div>
      )}
    </div>
  );
}

/** Aviso na ficha do lead: "Encaminhado para você por … — Confirmar recebimento" (só para quem recebeu, enquanto em aberto) */
export function AvisoLeadEncaminhado({ leadId, aoMudar }: { leadId: number; aoMudar?: () => void }) {
  const { data } = trpc.distribuicao.doLead.useQuery({ leadId }, { enabled: Number.isFinite(leadId) });
  if (!data) return null;
  const quando = data.quando ? new Date(data.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className={`space-y-2 rounded-xl border px-4 py-3 ${data.recebidoEm ? "border-ok-500/40 bg-ok-500/5" : "border-warn-500/50 bg-warn-500/10"}`}>
      <p className="text-sm">Lead encaminhado para você {data.por ? `por ${data.por}` : ""} em {quando}{data.recebidoEm ? " · recebimento confirmado" : ""}</p>
      {data.observacao && <p className="text-xs text-muted-foreground">{data.observacao}</p>}
      <AcoesRecebimento id={data.id} recebido={!!data.recebidoEm} aoMudar={aoMudar} />
    </div>
  );
}
