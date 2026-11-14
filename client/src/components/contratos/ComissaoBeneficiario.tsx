import { useState } from "react";
import { toast } from "sonner";
import { Ban, Copy, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";

const ROTULO_STATUS: Record<string, string> = { prevista: "a emitir", emitida: "em aberto", vencida: "vencida", paga: "paga", cancelada: "revogada", estornada: "estornada" };
const br = (iso: string) => iso.split("-").reverse().join("/");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Concessão: comissão de gestão paga pelo beneficiário (só o administrador — negociação direta do escritório com o
 * beneficiário; não aparece para a empreendedora nem nos relatórios do empreendimento). Proposta assinada pelo link →
 * boletos/cartão no Asaas (100% Romatec). Revogar: cancela os em aberto e libera nova proposta (subdividir, juntar, cartão).
 */
export function ComissaoBeneficiario({ contratoId, comissaoValor, cancelado }: { contratoId: number; comissaoValor: number; cancelado: boolean }) {
  const utils = trpc.useUtils();
  const q = trpc.contratos.comissaoBeneficiario.useQuery({ id: contratoId });
  const [parcelas, setParcelas] = useState(1);
  const [venc, setVenc] = useState(hoje());
  const [forma, setForma] = useState<"boleto" | "cartao">("boleto");
  const [valor, setValor] = useState("");
  const recarregar = () => { utils.contratos.comissaoBeneficiario.invalidate({ id: contratoId }); utils.contratos.detalhe.invalidate({ id: contratoId }); };
  const erro = (e: { message: string }) => toast.error(e.message);
  const propor = trpc.contratos.proporComissaoBeneficiario.useMutation({
    onSuccess: r => { toast.success(r.enviado ? `Proposta n.º ${r.numero} enviada no WhatsApp do beneficiário` : `Proposta n.º ${r.numero} gerada — copie o link (WhatsApp não enviado)`); recarregar(); }, onError: erro,
  });
  const revogar = trpc.contratos.revogarComissaoBeneficiario.useMutation({
    onSuccess: r => { toast.success(r.proposta ? "Proposta revogada" : `${r.canceladas} boleto(s) revogado(s)${r.falhas.length ? ` — ${r.falhas.length} falha(s) no Asaas` : ""}`); recarregar(); }, onError: erro,
  });
  const reenviar = trpc.contratos.reenviarComissaoBeneficiario.useMutation({ onSuccess: r => (r.enviado ? toast.success("Link reenviado") : toast.error("Sem WhatsApp no cadastro")), onError: erro });
  const emitir = trpc.contratos.emitirComissaoBeneficiario.useMutation({
    onSuccess: r => { r.emitidas ? toast.success(`${r.emitidas} cobrança(s) emitida(s) e enviada(s)`) : toast.error(r.falhas[0] ?? "Nada emitido"); recarregar(); }, onError: erro,
  });
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Link copiado"), () => toast.error("Copie manualmente"));
  const cobs = q.data?.cobrancas ?? [];
  const props = q.data?.propostas ?? [];
  const abertas = cobs.filter(c => ["prevista", "emitida", "vencida"].includes(c.status));
  const pago = cobs.filter(c => c.status === "paga").reduce((s, c) => s + c.valor, 0);
  const aguardando = props.some(p => p.status === "aguardando");
  const saldo = Math.max(0, Math.round((comissaoValor - pago) * 100) / 100);
  const valorNum = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : saldo;
  const podePropor = !cancelado && !abertas.length && !aguardando && valorNum > 0;

  return (
    <div className="space-y-2 border-t border-info-500/30 pt-2">
      <p className="text-xs font-semibold">Comissão paga pelo beneficiário <span className="font-normal text-muted-foreground">(só o escritório: não aparece para a empreendedora nem nos relatórios do empreendimento)</span></p>
      {q.isLoading && <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Carregando…</p>}

      {cobs.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-left text-muted-foreground"><tr><th className="px-2 py-1">Parcela</th><th className="px-2 py-1">Vencimento</th><th className="px-2 py-1 text-right">Valor</th><th className="px-2 py-1">Situação</th><th className="px-2 py-1" /></tr></thead>
            <tbody>
              {cobs.map(c => (
                <tr key={c.id} className="border-t border-border/50">
                  <td className="px-2 py-1">{c.numero}/{c.total}</td>
                  <td className="px-2 py-1">{br(c.vencimento)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{brl(c.valor)}</td>
                  <td className="px-2 py-1">{ROTULO_STATUS[c.status] ?? c.status}{c.pagoEm ? ` em ${br(c.pagoEm)}` : ""}</td>
                  <td className="px-2 py-1 text-right">{c.boleto && !["paga", "cancelada"].includes(c.status) && <a className="inline-flex items-center gap-1 text-ok-300 underline" href={c.boleto} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /> pagar</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cobs.length > 0 && <p className="text-xs text-muted-foreground">Pago: {brl(pago)} de {brl(comissaoValor)}{saldo > 0 ? ` · falta ${brl(saldo)}` : " · comissão quitada"}</p>}
      {!cancelado && abertas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {abertas.some(c => c.status === "prevista") && <Button size="sm" variant="outline" disabled={emitir.isPending} onClick={() => emitir.mutate({ id: contratoId })}><RefreshCw className="h-4 w-4" /> Emitir os pendentes</Button>}
          <Button size="sm" variant="outline" disabled={revogar.isPending} onClick={() => { if (confirm("Revogar os boletos em aberto da comissão? Eles são cancelados no Asaas e você gera uma nova proposta com o saldo (subdividir, juntar ou cartão).")) revogar.mutate({ id: contratoId }); }}>
            <Ban className="h-4 w-4" /> Revogar boletos em aberto
          </Button>
        </div>
      )}

      {props.map(p => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2 text-xs">
          <span><b>Proposta n.º {p.numero}</b> · {p.resumo} · <span className="text-muted-foreground">{p.rotuloStatus}{p.assinadoEm ? ` em ${new Date(p.assinadoEm).toLocaleString("pt-BR")}` : ""}</span></span>
          {p.status === "aguardando" && p.link && (
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" onClick={() => copiar(p.link!)}><Copy className="h-4 w-4" /> Link</Button>
              <Button size="sm" variant="outline" disabled={reenviar.isPending} onClick={() => reenviar.mutate({ id: contratoId, propostaId: p.id })}><Send className="h-4 w-4" /> Reenviar</Button>
              <Button size="sm" variant="outline" disabled={revogar.isPending} onClick={() => revogar.mutate({ id: contratoId, propostaId: p.id })}><Ban className="h-4 w-4" /> Revogar</Button>
            </span>
          )}
        </div>
      ))}

      {!cancelado && saldo > 0 && !abertas.length && !aguardando && (
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <p className="text-xs">Nova proposta {pago > 0 ? `do saldo (${brl(saldo)})` : `da comissão (${brl(comissaoValor)})`}: o beneficiário assina pelo link com código no WhatsApp; assinada, as cobranças saem no Asaas e vão para o WhatsApp dele.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">Valor (R$)
              <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={brl(saldo).replace("R$", "").trim()}
                className="mt-1 block h-9 w-32 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">Parcelas
              <select value={parcelas} onChange={e => setParcelas(Number(e.target.value))} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? "1× (única)" : `${n}× de ${brl(Math.floor((valorNum / n) * 100) / 100)}`}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">1º vencimento
              <input type="date" min={hoje()} value={venc} onChange={e => setVenc(e.target.value)} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">Forma
              <select value={forma} onChange={e => setForma(e.target.value as any)} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
                <option value="boleto">Boleto ou PIX</option>
                <option value="cartao">Cartão de crédito (link)</option>
              </select>
            </label>
            <Button size="sm" disabled={!podePropor || propor.isPending} onClick={() => propor.mutate({ id: contratoId, parcelas, primeiroVencimento: venc, forma, ...(valor.trim() ? { valor: valorNum } : {}) })}>
              {propor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gerar proposta e enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
