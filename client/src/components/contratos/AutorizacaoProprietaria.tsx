import { useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Copy, Loader2, Send, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";
import { brl } from "@shared/simulador";

const sinal = (v: number) => `${v >= 0 ? "+" : "−"} ${brl(Math.abs(v))}`;
const pctTxt = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.`);

/**
 * Autorização da proprietária para o plano fora do padrão (só o administrador): comparação automática com a tabela,
 * pedido assinado pela proprietária pelo link (código no WhatsApp) e anexado ao contrato. Sem autorização válida do
 * plano atual, o definitivo não sai.
 */
export function AutorizacaoProprietaria({ contratoId, status }: { contratoId: number; status: string }) {
  const utils = trpc.useUtils();
  const q = trpc.contratos.autorizacaoProprietaria.useQuery({ id: contratoId });
  const [obs, setObs] = useState("");
  const recarregar = () => { utils.contratos.autorizacaoProprietaria.invalidate({ id: contratoId }); utils.contratos.detalhe.invalidate({ id: contratoId }); };
  const solicitar = trpc.contratos.solicitarAutorizacaoProprietaria.useMutation({
    onSuccess: r => { toast.success(r.enviado ? `Pedido n.º ${r.numero} enviado no WhatsApp da proprietária` : `Pedido n.º ${r.numero} gerado — copie o link (WhatsApp da proprietária não cadastrado)`); setObs(""); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const acao = trpc.contratos.pedidoAutorizacaoAcao.useMutation({
    onSuccess: (r, v) => { toast.success(v.acao === "cancelar" ? "Pedido cancelado" : r.enviado ? "Link reenviado" : "Sem WhatsApp da proprietária"); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const d = q.data;
  if (!d) return null;
  const k = d.comparativo;
  const antes = ["rascunho", "minuta", "apto_assinatura"].includes(status);
  const aguardando = d.pedidos.some(p => p.status === "aguardando");
  if (!d.precisa && !d.pedidos.length && !antes) return null;
  const cor = d.situacao === "valida" ? "border-ok-500/40 bg-ok-500/5" : d.precisa ? "border-warn-500/50 bg-warn-500/10" : "border-border bg-card";

  return (
    <section className={`space-y-2 rounded-xl border p-3 text-sm ${cor}`}>
      <div className="flex flex-wrap items-center gap-2">
        {d.situacao === "valida" ? <CheckCircle2 className="h-5 w-5 text-ok-400" /> : <ShieldAlert className="h-5 w-5 text-warn-400" />}
        <p className="font-semibold">Autorização da proprietária</p>
        <span className="text-xs text-muted-foreground">
          {d.situacao === "valida" ? "autorizado: o PDF assinado vai como anexo do contrato"
            : d.precisa ? "plano fora do padrão — o definitivo só sai com a autorização assinada"
            : "opcional: peça a autorização quando negociar fora da tabela"}
        </span>
      </div>

      {k && (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-left text-muted-foreground"><tr><th className="px-2 py-1">Item</th><th className="px-2 py-1 text-right">Tabela</th><th className="px-2 py-1 text-right">Proposta</th><th className="px-2 py-1 text-right">Diferença</th></tr></thead>
            <tbody>
              <tr className="border-t border-border/50"><td className="px-2 py-1">Preço</td><td className="px-2 py-1 text-right">{brl(k.precoTabela)}</td><td className="px-2 py-1 text-right">{brl(k.precoProposta)}</td><td className="px-2 py-1 text-right">{sinal(k.precoProposta - k.precoTabela)}</td></tr>
              <tr className="border-t border-border/50"><td className="px-2 py-1">Parcela ({k.prazo}×)</td><td className="px-2 py-1 text-right">{brl(k.parcelaTabela)}</td><td className="px-2 py-1 text-right">{brl((k.totalProposta - k.entrada) / k.prazo)}</td><td className="px-2 py-1 text-right">{sinal((k.totalProposta - k.entrada) / k.prazo - k.parcelaTabela)}</td></tr>
              <tr className="border-t border-border/50"><td className="px-2 py-1">Total recebido</td><td className="px-2 py-1 text-right">{brl(k.totalTabela)}</td><td className="px-2 py-1 text-right">{brl(k.totalProposta)}</td><td className="px-2 py-1 text-right font-semibold">{sinal(k.diferencaNominal)}</td></tr>
              <tr className="border-t border-border/50"><td className="px-2 py-1">Valor presente</td><td className="px-2 py-1 text-right">{brl(k.precoTabela)}</td><td className="px-2 py-1 text-right">{brl(k.vpProposta)}</td><td className={`px-2 py-1 text-right font-semibold ${k.diferencaVp < 0 ? "text-danger-400" : "text-ok-400"}`}>{sinal(k.diferencaVp)} ({k.diferencaVpPct.toLocaleString("pt-BR")}%)</td></tr>
              <tr className="border-t border-border/50"><td className="px-2 py-1">Taxa efetiva</td><td className="px-2 py-1 text-right">{pctTxt(k.taxaTabelaAa)}</td><td className="px-2 py-1 text-right">{pctTxt(k.taxaPropostaAa)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}

      {d.pedidos.map(p => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2 text-xs">
          <span><b>Pedido n.º {p.numero}</b> · {p.resumo} · <span className="text-muted-foreground">{p.status === "assinado" ? "autorizado" : p.rotuloStatus}{p.assinadoEm ? ` em ${new Date(p.assinadoEm).toLocaleString("pt-BR")}` : ""}{p.status === "assinado" && d.aditivoValido !== p.id ? " · não vale mais (o plano mudou)" : ""}</span></span>
          <span className="ml-auto flex flex-wrap gap-1">
            <AcoesPdf compacto url={`/api/financeiro/aditivos/${p.id}.pdf`} nomeArquivo={`AUTORIZACAO-PROPRIETARIA-${p.numero}.pdf`} mensagem={`Autorização da proprietária n.º ${p.numero}`} />
            {p.status === "aguardando" && p.link && <>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(p.link!).then(() => toast.success("Link copiado"))}><Copy className="h-4 w-4" /> Link</Button>
              <Button size="sm" variant="outline" disabled={acao.isPending} onClick={() => acao.mutate({ id: contratoId, pedidoId: p.id, acao: "reenviar" })}><Send className="h-4 w-4" /> Reenviar</Button>
              <Button size="sm" variant="outline" disabled={acao.isPending} onClick={() => acao.mutate({ id: contratoId, pedidoId: p.id, acao: "cancelar" })}><Ban className="h-4 w-4" /> Cancelar</Button>
            </>}
          </span>
        </div>
      ))}

      {antes && !aguardando && d.situacao !== "valida" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-xs text-muted-foreground">Observação para a proprietária (opcional)
            <input value={obs} maxLength={600} onChange={e => setObs(e.target.value)} placeholder="Ex.: cliente com entrada de 30%, pagamento à vista da entrada"
              className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" />
          </label>
          <Button size="sm" disabled={solicitar.isPending || !d.proprietaria} onClick={() => solicitar.mutate({ id: contratoId, observacao: obs || undefined })}>
            {solicitar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Pedir autorização à proprietária
          </Button>
          {d.proprietaria && !d.proprietaria.temWhatsapp && <span className="basis-full text-xs text-warn-300">A proprietária ({d.proprietaria.nome}) está sem WhatsApp no cadastro jurídico: o link sai para você copiar.</span>}
        </div>
      )}
    </section>
  );
}
