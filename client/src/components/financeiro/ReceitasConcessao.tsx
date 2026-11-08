import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Gift, Loader2, Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";

const data = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const ROTULO = { a_receber: "A receber", atrasada: "Atrasada", recebida: "Recebida" } as const;
const COR = { a_receber: "bg-primary/15 text-primary", atrasada: "bg-destructive/15 text-destructive", recebida: "bg-emerald-500/15 text-emerald-500" } as const;

/**
 * Comissão de gestão das concessões da proprietária: receita da gestora (corretor administrador), a receber da
 * proprietária, sem boleto nem Asaas — o recebimento é marcado à mão.
 */
export default function ReceitasConcessao() {
  const { data: d, isLoading } = trpc.comissoes.concessoes.useQuery();
  const utils = trpc.useUtils();
  const [marcando, setMarcando] = useState<number | null>(null);
  const [pagoEm, setPagoEm] = useState(hoje());
  const [forma, setForma] = useState("Pix");
  const registrar = trpc.comissoes.registrarRecebimentoConcessao.useMutation({
    onSuccess: r => { toast.success(`Recebimento de ${brl(r.valor)} registrado`); setMarcando(null); utils.comissoes.concessoes.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const desfazer = trpc.comissoes.desfazerPagamento.useMutation({
    onSuccess: () => { toast.success("Registro desfeito"); utils.comissoes.concessoes.invalidate(); },
    onError: e => toast.error(e.message),
  });
  if (isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando as concessões…</p>;
  if (!d || !d.itens.length) return null;
  return (
    <section className="space-y-2 rounded-xl border border-info-500/40 bg-info-500/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Gift className="h-4 w-4 text-info-300" /> A receber da proprietária — concessões</p>
        <p className="text-xs text-muted-foreground">A receber {brl(d.resumo.aReceber)}{d.resumo.atrasado ? ` · atrasado ${brl(d.resumo.atrasado)}` : ""} · recebido {brl(d.resumo.recebido)}</p>
      </div>
      <p className="text-xs text-muted-foreground">Comissão de gestão da chácara concedida pela proprietária: receita da gestora, sem boleto e sem Asaas. Marque quando a proprietária pagar.</p>
      <div className="space-y-2">
        {d.itens.map(i => (
          <div key={i.contratoId} className="rounded-lg border border-border bg-card p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{i.empreendimento} · {i.lote}</span>
              <span className="text-xs text-muted-foreground">{i.beneficiario} · {i.numero}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${COR[i.situacao]}`}>{ROTULO[i.situacao]}</span>
              <b className="ml-auto tabular-nums">{brl(i.valor)}</b>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Valor de referência {brl(i.valorReferencia)} · para {i.corretor} · {i.recebidoEm ? `recebida em ${data(i.recebidoEm)}${i.forma ? ` (${i.forma})` : ""}` : `vence em ${data(i.vencimento)} (${i.prazo})`}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {i.situacao === "recebida" ? (
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={desfazer.isPending}
                  onClick={() => { if (window.confirm("Desfazer o registro deste recebimento?")) desfazer.mutate({ contratoId: i.contratoId, chave: "concessao" }); }}>
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Desfazer
                </Button>
              ) : marcando === i.contratoId ? (
                <>
                  <input type="date" value={pagoEm} max={hoje()} onChange={e => setPagoEm(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
                  <select value={forma} onChange={e => setForma(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                    {["Pix", "Transferência", "Dinheiro"].map(f => <option key={f}>{f}</option>)}
                  </select>
                  <Button size="sm" className="h-8 text-xs" disabled={registrar.isPending} onClick={() => registrar.mutate({ contratoId: i.contratoId, pagoEm, forma })}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setMarcando(null)}>Cancelar</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPagoEm(hoje()); setMarcando(i.contratoId); }}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marcar recebida
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
