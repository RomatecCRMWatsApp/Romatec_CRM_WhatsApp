import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const campo = "mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground";
const ROTULO: Record<string, string> = { notificacao: "Notificação", requerimento: "Requerimento", ata: "Ata", avulso: "Avulso" };

/** Um contrato em atraso: parcelas, valores atualizados e a geração das peças (notificação → requerimento → ata) */
function CasoInadimplencia({ c, onGerado }: { c: any; onGerado: () => void }) {
  const [abrirAta, setAbrirAta] = useState(false);
  const [via, setVia] = useState<"rtd" | "ri">("rtd");
  const [dataIntimacao, setDataIntimacao] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const gerar = trpc.juridico.gerarDocumento.useMutation({
    onSuccess: () => { toast.success("Documento gerado — confira e assine com o certificado em Documentos e assinaturas"); setAbrirAta(false); onGerado(); },
    onError: e => toast.error(e.message),
  });
  return (
    <div className={`space-y-2 rounded-xl border p-3 text-sm ${c.alerta ? "border-danger-500/50 bg-danger-500/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {c.alerta && <span className="inline-flex items-center gap-1 rounded-full bg-danger-500/20 px-2 py-0.5 text-[11px] text-danger-200"><AlertTriangle className="h-3 w-3" /> {c.qtd} parcela{c.qtd > 1 ? "s" : ""} em atraso</span>}
        <b>{c.numero}</b><span className="text-muted-foreground">Chácara {c.lote} · {c.comprador}</span>
        <span className="ml-auto text-xs tabular-nums">Original {brl(c.valor)} · <b className="text-danger-200">atualizado {brl(c.atualizado)}</b> · maior atraso {c.maiorAtraso} dias</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {c.parcelas.map((p: any) => <span key={p.id} className="rounded-md border border-border px-1.5 py-0.5">{p.rotulo} · venc. {br(p.vencimento)} · {p.dias}d</span>)}
      </div>
      {!!c.documentos.length && (
        <p className="text-xs text-muted-foreground">Já gerados: {c.documentos.map((d: any) => `${ROTULO[d.tipo] ?? d.tipo} (${br(d.criadoEm)}${d.assinaturas ? `, ${d.assinaturas} assinatura(s)` : ", sem assinatura"})`).join(" · ")}</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" variant="outline" disabled={gerar.isPending} onClick={() => gerar.mutate({ contratoId: c.contratoId, tipo: "notificacao" })}><FileText className="mr-1 h-4 w-4" /> 1. Notificação (mora, 30 dias)</Button>
        <label className="text-xs text-muted-foreground">Cartório
          <select className={`${campo} block`} value={via} onChange={e => setVia(e.target.value as any)}>
            <option value="rtd">Títulos e Documentos (compromisso não registrado)</option>
            <option value="ri">Registro de Imóveis (art. 32, § 1º)</option>
          </select>
        </label>
        <Button size="sm" variant="outline" disabled={gerar.isPending} onClick={() => gerar.mutate({ contratoId: c.contratoId, tipo: "requerimento", via })}><FileText className="mr-1 h-4 w-4" /> 2. Requerimento ao Oficial</Button>
        <Button size="sm" variant="outline" disabled={gerar.isPending} onClick={() => setAbrirAta(v => !v)}><FileText className="mr-1 h-4 w-4" /> 3. Ata de resolução</Button>
        {gerar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      {abrirAta && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background/40 p-2">
          <label className="text-xs text-muted-foreground">Data da intimação/notificação pelo cartório
            <input type="date" className={`${campo} block`} value={dataIntimacao} onChange={e => setDataIntimacao(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">Protocolo / certidão do cartório
            <input className={`${campo} block w-48`} value={protocolo} onChange={e => setProtocolo(e.target.value)} placeholder="Ex.: RTD 1234" />
          </label>
          <Button size="sm" disabled={!dataIntimacao || gerar.isPending} onClick={() => gerar.mutate({ contratoId: c.contratoId, tipo: "ata", dataIntimacao, protocolo: protocolo || null })}>Gerar a ata</Button>
          <p className="basis-full text-[11px] text-muted-foreground">A ata só é lavrada depois de 30 dias da intimação sem o pagamento (Lei n.º 6.766/1979, art. 32; CPCV, Cláusula 8ª). Depois, cancele o contrato no CRM para a chácara voltar à venda.</p>
        </div>
      )}
    </div>
  );
}

/** Painel de inadimplência do portal jurídico */
export function PainelInadimplencia({ slug }: { slug?: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.juridico.inadimplencia.useQuery(slug ? { slug } : undefined);
  const recarregar = () => { utils.juridico.inadimplencia.invalidate(); utils.juridico.documentos.invalidate(); };
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando…</p>;
  const lista = data?.contratos ?? [];
  return (
    <div className="space-y-2">
      <p className="text-justify text-xs text-muted-foreground">
        Contratos com parcela vencida e não paga — a partir da primeira, o caso já pode ir para o jurídico (CPCV, Cláusula 8ª). Caminho: notificação de constituição em mora com 30 dias para purgar → requerimento de intimação/notificação pelo cartório → ata de resolução, se não houver pagamento. Valores atualizados pela Cláusula 7ª do CPCV (IPCA, multa de 2% e juros de 1% ao mês).
      </p>
      {!lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum contrato em atraso. 🎉</p>}
      {lista.map(c => <CasoInadimplencia key={c.contratoId} c={c} onGerado={recarregar} />)}
    </div>
  );
}
