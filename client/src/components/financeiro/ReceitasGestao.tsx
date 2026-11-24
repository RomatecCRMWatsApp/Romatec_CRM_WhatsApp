import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Landmark, Loader2, Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";

const data = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Comissão de gestão das vendas (5%): o comprador paga a entrada inteira à proprietária e ela repassa a comissão à
 * gestora por Pix. Ao marcar como recebida, o pagamento sai do caixa do empreendimento (despesa "Comissões").
 */
export default function ReceitasGestao() {
  const { data: d, isLoading } = trpc.comissoes.gestaoVendas.useQuery();
  const utils = trpc.useUtils();
  const [marcando, setMarcando] = useState<string | null>(null);
  const [pagoEm, setPagoEm] = useState(hoje());
  const [forma, setForma] = useState("Pix");
  const [todas, setTodas] = useState(false);
  const atualizar = () => { utils.comissoes.gestaoVendas.invalidate(); utils.financeiro.invalidate(); };
  const registrar = trpc.comissoes.registrarRecebimentoGestao.useMutation({
    onSuccess: r => { toast.success(`Recebimento de ${brl(r.valor)} registrado: saiu do caixa do empreendimento`); setMarcando(null); atualizar(); },
    onError: e => toast.error(e.message),
  });
  const desfazer = trpc.comissoes.desfazerPagamento.useMutation({ onSuccess: () => { toast.success("Registro desfeito"); atualizar(); }, onError: e => toast.error(e.message) });
  if (isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando as comissões de gestão…</p>;
  if (!d || !d.itens.length) return null;
  const visiveis = todas ? d.itens : d.itens.filter(i => i.devida && !i.recebidaEm);
  return (
    <section className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4 text-primary" /> A receber da proprietária — comissões das vendas</p>
        <p className="text-xs text-muted-foreground">Devido {brl(d.resumo.devido)} · programado {brl(d.resumo.programado)} · recebido {brl(d.resumo.recebido)}</p>
      </div>
      <p className="text-xs text-muted-foreground">O comprador paga a entrada inteira à proprietária e ela repassa a comissão por Pix. Fica devida quando o comprador paga a parcela. Ao marcar como recebida, o valor sai do caixa do empreendimento.</p>
      <button className="text-xs text-primary hover:underline" onClick={() => setTodas(!todas)}>{todas ? "Mostrar só as devidas" : `Ver todas (${d.itens.length}), com programadas e recebidas`}</button>
      {!visiveis.length && <p className="text-sm text-muted-foreground">Nenhuma comissão devida no momento.</p>}
      <div className="space-y-2">
        {visiveis.map(i => {
          const k = `${i.contratoId}:${i.chave}`;
          return (
            <div key={k} className="rounded-lg border border-border bg-card p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{i.empreendimento} · {i.lote}</span>
                <span className="text-xs text-muted-foreground">{i.contrato} · {i.quando}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${i.recebidaEm ? "bg-emerald-500/15 text-emerald-500" : i.devida ? "bg-warn-500/15 text-warn-300" : "bg-secondary text-muted-foreground"}`}>
                  {i.recebidaEm ? `Recebida em ${data(i.recebidaEm)}` : i.devida ? `Devida (cliente pagou ${data(i.data)})` : `Programada ${data(i.data)}`}
                </span>
                <b className="ml-auto tabular-nums">{brl(i.valor)}</b>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {i.recebidaEm ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={desfazer.isPending}
                    onClick={() => { if (window.confirm("Desfazer o registro? A saída lançada no caixa do empreendimento é cancelada.")) desfazer.mutate({ contratoId: i.contratoId, chave: `g:${i.chave}` }); }}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Desfazer
                  </Button>
                ) : i.devida && (marcando === k ? (
                  <>
                    <input type="date" value={pagoEm} max={hoje()} onChange={e => setPagoEm(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs" />
                    <select value={forma} onChange={e => setForma(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">{["Pix", "Transferência", "Dinheiro"].map(f => <option key={f}>{f}</option>)}</select>
                    <Button size="sm" className="h-8 text-xs" disabled={registrar.isPending} onClick={() => registrar.mutate({ contratoId: i.contratoId, chave: i.chave, pagoEm, forma })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmar</Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setMarcando(null)}>Cancelar</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPagoEm(hoje()); setMarcando(k); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marcar recebida</Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
