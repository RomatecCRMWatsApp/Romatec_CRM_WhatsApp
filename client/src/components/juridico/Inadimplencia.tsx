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

interface Etapa { n: number; titulo: string; prazo: string; quem: string; peca?: string; texto: string; base: string; final?: boolean }

/** Roteiro do procedimento — da parcela vencida à chácara de volta à venda (Lei n.º 6.766/1979, arts. 32 e 32-A; CPCV, Cláusulas 7ª e 8ª) */
const ETAPAS: Etapa[] = [
  { n: 1, titulo: "Parcela vencida e não paga", prazo: "Dia seguinte ao vencimento", quem: "Sistema",
    texto: "O contrato aparece aqui em destaque já na primeira parcela em atraso, com o valor original, o atualizado e os dias de atraso. Vale um contato amigável do escritório antes da via formal.",
    base: "CPCV, Cláusula 8ª" },
  { n: 2, titulo: "Notificação de constituição em mora", prazo: "Abre 30 dias para pagar", quem: "Advogado", peca: "Peça 1 — Notificação",
    texto: "Gere a notificação no botão 1 do caso, confira e assine com o certificado digital em Assinaturas. Ela cobra as parcelas vencidas, as que vencerem até o pagamento, multa, juros e correção, e dá 30 dias para purgar a mora.",
    base: "Lei 6.766/1979, art. 32, caput; CPCV, Cláusula 7ª" },
  { n: 3, titulo: "Requerimento ao cartório", prazo: "Logo após a notificação", quem: "Advogado → Oficial", peca: "Peça 2 — Requerimento",
    texto: "Escolha o cartório e gere o requerimento (botão 2). Contrato registrado: Registro de Imóveis, que intima o comprador pessoalmente. Contrato não registrado: Títulos e Documentos. Comprador em lugar incerto: intimação por edital. Protocole a notificação assinada junto.",
    base: "Lei 6.766/1979, art. 32, § 1º; art. 49" },
  { n: 4, titulo: "Prazo de 30 dias da intimação", prazo: "Conta da data em que o cartório intimou", quem: "Comprador",
    texto: "Se pagar no cartório ou ao empreendimento, a mora é purgada e o contrato segue normalmente: dê baixa nas parcelas no Financeiro do CRM e o caso some desta lista.",
    base: "Lei 6.766/1979, art. 32, § 2º" },
  { n: 5, titulo: "Certidão de não pagamento e ata de resolução", prazo: "Depois dos 30 dias, sem pagamento", quem: "Cartório → Advogado", peca: "Peça 3 — Ata",
    texto: "Pegue no cartório a certidão de que não houve pagamento. Gere a ata de resolução (botão 3) com a data da intimação e o número do protocolo ou da certidão, e assine com o certificado.",
    base: "Lei 6.766/1979, art. 32, caput e § 3º; CPCV, Cláusula 8ª" },
  { n: 6, titulo: "Cancelamento no registro", prazo: "Com a certidão e a ata", quem: "Advogado → Oficial",
    texto: "Contrato registrado: requeira ao Registro de Imóveis o cancelamento do registro do compromisso. Se o comprador ocupar a chácara e não a devolver, a retomada da posse é por ação judicial de reintegração.",
    base: "Lei 6.766/1979, art. 32, § 3º" },
  { n: 7, titulo: "Acerto de contas com o comprador", prazo: "Até 12 parcelas, depois da carência", quem: "Empreendimento",
    texto: "Devolve-se o que foi pago, descontadas as deduções do contrato e da lei: fruição do imóvel (até 0,75% ao mês), multa (até 10% do valor atualizado do contrato), comissão, impostos e taxas do lote. Com obras concluídas, as parcelas começam até 12 meses depois da resolução.",
    base: "Lei 6.766/1979, art. 32-A" },
  { n: 8, titulo: "Chácara de volta à venda", prazo: "Encerramento", quem: "Escritório", final: true,
    texto: "Cancele o contrato no CRM (Contratos): a chácara volta a ficar disponível no mapa e na tabela de vendas do empreendimento, e a linha do tempo do contrato guarda todo o histórico.",
    base: "CRM — Contratos" },
];

/** Linha do tempo didática do procedimento (aberta quando não há casos; recolhível quando há) */
function FluxoInadimplencia({ aberto }: { aberto: boolean }) {
  return (
    <details open={aberto} className="group rounded-xl border border-border bg-card/60 p-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-[#E8B931] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B931]">
        Passo a passo do procedimento — da parcela vencida à chácara de volta à venda
      </summary>
      <ol className="relative mt-4 space-y-4 border-l border-[#E8B931]/40 pl-6">
        {ETAPAS.map(e => (
          <li key={e.n} className="relative">
            <span aria-hidden className={`absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums ${e.final ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : e.peca ? "border-[#E8B931] bg-[#E8B931] text-black" : "border-[#E8B931]/60 bg-background text-[#E8B931]"}`}>{e.n}</span>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h4 className="text-sm font-semibold text-foreground">{e.titulo}</h4>
              {e.peca && <span className="rounded-full bg-[#E8B931]/15 px-2 py-0.5 text-[11px] text-[#E8B931]">{e.peca}</span>}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{e.prazo} · quem faz: {e.quem}</p>
            <p className="mt-1 text-justify text-xs leading-relaxed text-foreground/85">{e.texto}</p>
            <p className="mt-1 text-[11px] italic text-muted-foreground">{e.base}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-justify text-[11px] text-muted-foreground">
        As três peças (notificação, requerimento e ata) são geradas aqui com os dados do contrato e os valores atualizados, e assinadas com o certificado digital ICP-Brasil do advogado. Cada etapa fica registrada na linha do tempo do contrato.
      </p>
    </details>
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
      <FluxoInadimplencia aberto={!lista.length} />
      {!lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum contrato em atraso. 🎉</p>}
      {lista.map(c => <CasoInadimplencia key={c.contratoId} c={c} onGerado={recarregar} />)}
    </div>
  );
}
