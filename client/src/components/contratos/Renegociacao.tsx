import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FileText, Handshake, Loader2, Send, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@shared/simulador";

const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const daquiUmMes = () => { const d = new Date(Date.now() - 3 * 3600_000); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
const reais = (v: string) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) || 0;
const ROTULO_TIPO: Record<string, string> = { entrada: "Entrada", saldo: "Saldo", avista: "À vista", renegociacao: "Renegociação" };

/**
 * Aba Financeiro do contrato › Renegociar parcelas (server/financeiro/renegociacao.ts): o escritório simula; o
 * administrador gera o termo aditivo (com a senha), que vai ao comprador para assinar com o código do WhatsApp.
 * Assinado, as parcelas antigas são canceladas e as novas emitidas.
 */
export default function RenegociacaoContrato({ contratoId, cobrancas, taxaContrato, admin }: { contratoId: number; cobrancas: any[]; taxaContrato: number; admin: boolean }) {
  const utils = trpc.useUtils();
  const { data: aditivos } = trpc.renegociacao.lista.useQuery({ contratoId });
  const abertas = useMemo(() => cobrancas.filter(x => !["paga", "cancelada", "estornada"].includes(x.status) && x.tipo !== "antecipacao"), [cobrancas]);
  const [aberto, setAberto] = useState(false);
  const [ids, setIds] = useState<number[]>([]);
  const [n, setN] = useState("3");
  const [taxa, setTaxa] = useState(String(Math.round((taxaContrato || 0) * 10000) / 100).replace(".", ","));
  const [desconto, setDesconto] = useState("");
  const [venc, setVenc] = useState(daquiUmMes());
  const [senha, setSenha] = useState("");
  const pedido = { contratoId, ids, parcelas: Math.max(1, Math.min(120, Number(n) || 1)), taxaMensal: reais(taxa) / 100, desconto: reais(desconto), primeiroVencimento: venc };
  const sim = trpc.renegociacao.simular.useQuery(pedido, { enabled: aberto && ids.length > 0 && venc >= hoje(), retry: false });
  const recarregar = () => { utils.renegociacao.lista.invalidate({ contratoId }); utils.contratos.invalidate(); };
  const criar = trpc.renegociacao.criar.useMutation({
    onSuccess: r => { toast.success(`Termo Aditivo n.º ${r.numero} gerado${r.enviado ? " e enviado ao comprador no WhatsApp" : " — copie o link e envie ao comprador"}`); setAberto(false); setIds([]); setSenha(""); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const cancelar = trpc.renegociacao.cancelar.useMutation({ onSuccess: () => { toast.success("Termo cancelado"); recarregar(); }, onError: e => toast.error(e.message) });
  const reenviar = trpc.renegociacao.reenviar.useMutation({ onSuccess: r => toast.success(r.enviado ? "Link reenviado no WhatsApp" : "Sem WhatsApp do comprador"), onError: e => toast.error(e.message) });
  const emitir = trpc.renegociacao.emitir.useMutation({
    onSuccess: r => { r.falhas.length ? toast.error(`${r.emitidas} emitida(s); falhas: ${r.falhas.join("; ")}`) : toast.success(`${r.emitidas} parcela(s) emitida(s) no Asaas`); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Link copiado"); } catch { window.prompt("Copie:", t); } };
  const pendente = aditivos?.some(a => a.status === "aguardando");
  const renegPrevistas = cobrancas.filter(x => x.tipo === "renegociacao" && x.status === "prevista").length;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Handshake className="h-4 w-4" /> Renegociação de parcelas (termo aditivo)</p>
        <div className="flex gap-2">
          {admin && renegPrevistas > 0 && <Button size="sm" variant="outline" disabled={emitir.isPending} onClick={() => emitir.mutate({ contratoId })}><Send className="mr-1.5 h-3.5 w-3.5" /> Emitir {renegPrevistas} no Asaas</Button>}
          {!aberto && <Button size="sm" disabled={!abertas.length || pendente} onClick={() => setAberto(true)} title={pendente ? "Há um termo aguardando assinatura" : ""}>Renegociar</Button>}
        </div>
      </div>

      {aberto && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Marque as parcelas que entram (as vencidas são atualizadas com IPCA, multa de 2% e juros de 1% a.m. até hoje, como no CPCV):</p>
          <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {abertas.map(x => (
              <label key={x.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-sm">
                <input type="checkbox" checked={ids.includes(x.id)} onChange={e => setIds(e.target.checked ? [...ids, x.id] : ids.filter(i => i !== x.id))} />
                <span className="flex-1">{ROTULO_TIPO[x.tipo] ?? x.tipo} {x.numero}/{x.total} · {br(x.vencimento)}</span>
                <span className={x.vencimento < hoje() ? "text-red-300" : ""}>{brl(x.valor)}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs text-muted-foreground">Novas parcelas<Input inputMode="numeric" value={n} onChange={e => setN(e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
            <label className="text-xs text-muted-foreground">Juros % ao mês<Input inputMode="decimal" value={taxa} onChange={e => setTaxa(e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Desconto (R$)<Input inputMode="decimal" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0" /></label>
            <label className="text-xs text-muted-foreground">1º vencimento<Input type="date" value={venc} min={hoje()} onChange={e => setVenc(e.target.value)} /></label>
          </div>
          {sim.error && <p className="text-sm text-red-300">{sim.error.message}</p>}
          {sim.data && (
            <div className="space-y-2 rounded-md bg-secondary/30 p-3 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>Original: <b>{brl(sim.data.totalOriginal)}</b></span>
                <span>Encargos: <b>{brl(sim.data.encargos)}</b></span>
                {sim.data.desconto > 0 && <span>Desconto: <b>−{brl(sim.data.desconto)}</b></span>}
                <span>Renegociado: <b className="text-emerald-300">{brl(sim.data.valorRenegociado)}</b></span>
                <span>Total a pagar: <b>{brl(sim.data.totalAPagar)}</b></span>
              </div>
              <p className="text-xs text-muted-foreground">{sim.data.parcelas.map(p => `${p.numero}ª ${br(p.vencimento)} ${brl(p.valor)}`).join(" · ")}</p>
            </div>
          )}
          {admin ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">Sua senha (confirma o termo)<Input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password" className="w-56" /></label>
              <Button disabled={!sim.data || !senha || criar.isPending} onClick={() => criar.mutate({ ...pedido, senha })}>
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} Gerar termo e enviar ao comprador
              </Button>
              <Button variant="ghost" onClick={() => setAberto(false)}>Fechar</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Simulação para conversar com o cliente. O termo aditivo é gerado pelo administrador. <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Fechar</Button></p>
          )}
        </div>
      )}

      {aditivos?.map(a => (
        <div key={a.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm ${a.status === "aguardando" ? "border-amber-400/50" : "border-border"}`}>
          <div>
            <p><b>Termo Aditivo n.º {a.numero}</b> · {brl(a.valorRenegociado)} em {a.parcelas}× de {brl(a.valorParcela)} · <span className="text-muted-foreground">{a.rotuloStatus}{a.assinadoEm ? ` em ${new Date(a.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}` : ""}</span></p>
            <p className="text-xs text-muted-foreground">Parcelas: {a.itens.join(", ")}</p>
            {a.resultado && <p className="text-xs text-muted-foreground">{a.resultado.canceladas} cancelada(s), {a.resultado.criadas} nova(s), {a.resultado.emitidas} emitida(s) no Asaas{a.resultado.falhasAsaas.length ? ` · ⚠️ ${a.resultado.falhasAsaas.join("; ")}` : ""}</p>}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" asChild><a href={`/api/financeiro/aditivos/${a.id}.pdf`} target="_blank" rel="noreferrer"><FileText className="mr-1 h-3.5 w-3.5" /> PDF</a></Button>
            {a.link && <Button size="sm" variant="outline" onClick={() => copiar(a.link!)}><Copy className="mr-1 h-3.5 w-3.5" /> Link</Button>}
            {a.status === "aguardando" && <Button size="sm" variant="outline" disabled={reenviar.isPending} onClick={() => reenviar.mutate({ id: a.id })}><Send className="mr-1 h-3.5 w-3.5" /> Reenviar</Button>}
            {admin && a.status === "aguardando" && <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { if (confirm(`Cancelar o Termo Aditivo n.º ${a.numero}? O link deixa de valer.`)) cancelar.mutate({ id: a.id }); }}><X className="h-4 w-4" /></Button>}
          </div>
        </div>
      ))}
    </section>
  );
}
