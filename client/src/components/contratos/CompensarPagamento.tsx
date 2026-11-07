/**
 * Compensar pagamento em outra parcela (server/financeiro/compensacao.ts): o comprador pagou o boleto de outro mês.
 * O pagamento passa para a parcela certa; a outra volta a ficar em aberto.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Repeat } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@shared/simulador";

const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const ROTULO: Record<string, string> = { entrada: "Entrada", saldo: "Saldo", avista: "À vista", renegociacao: "Renegociação", reforco: "Reforço", complemento: "Complemento" };
const nome = (x: any) => `${ROTULO[x.tipo] ?? x.tipo} ${x.numero}/${x.total}`;

export default function CompensarPagamento({ origem, cobrancas, onFeito }: { origem: any; cobrancas: any[]; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const abertas = useMemo(() => cobrancas.filter(x => ["prevista", "emitida", "vencida"].includes(x.status) && x.id !== origem.id)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))), [cobrancas, origem.id]);
  const [para, setPara] = useState<number | null>(null);
  const destino = para ?? abertas[0]?.id ?? null;
  const [op, setOp] = useState({ cancelarBoleto: true, emitirBoleto: true, avisar: false });
  const compensar = trpc.financeiro.compensarPagamento.useMutation({
    onSuccess: r => {
      toast.success(`Pagamento passou da ${r.de} para a ${r.para}${r.emitidas ? "; boleto novo emitido" : ""}`);
      r.avisos.forEach(a => toast.warning(a));
      setAberto(false); onFeito();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <>
      <Button size="sm" variant="ghost" title="Compensar em outra parcela (pagou o boleto de outro mês)" onClick={() => setAberto(true)}><Repeat className="h-3 w-3" /></Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogTitle>Compensar em outra parcela</DialogTitle>
          <DialogDescription>Use quando o comprador pagou, ou recebeu por engano, o boleto de outro mês. O pagamento passa para a parcela certa e a outra volta a ficar em aberto.</DialogDescription>
          <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Tirar de:</span> <b>{nome(origem)}</b> · venc. {br(origem.vencimento)} · pago {br(origem.pagoEm)} · {brl(origem.valorPago ?? origem.valor)}</p>
            <label className="block text-xs text-muted-foreground">Passar para
              <select className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" value={destino ?? ""} onChange={e => setPara(Number(e.target.value))}>
                {abertas.map(x => <option key={x.id} value={x.id}>{nome(x)} · venc. {br(x.vencimento)} · {brl(x.valor)}</option>)}
              </select>
            </label>
            {!abertas.length && <p className="text-warn-300">Não há parcela em aberto para receber o pagamento.</p>}
            {[
              ["cancelarBoleto", "Cancelar no Asaas o boleto em aberto da parcela que ficar paga (evita pagar em dobro)"],
              ["emitirBoleto", "Emitir boleto novo para a parcela que reabrir, com o vencimento dela"],
              ["avisar", "Reenviar a confirmação no WhatsApp, com a parcela correta"],
            ].map(([k, r]) => (
              <label key={k} className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={(op as any)[k]} onChange={e => setOp({ ...op, [k]: e.target.checked })} /> <span>{r}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>Voltar</Button>
            <Button disabled={!destino || compensar.isPending} onClick={() => destino && compensar.mutate({ deId: origem.id, paraId: destino, ...op })}>
              {compensar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Repeat className="mr-1 h-4 w-4" />} Compensar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
