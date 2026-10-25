import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, Loader2, Receipt, RefreshCw, ScanSearch, TriangleAlert, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { podeOperarCobranca } from "@shared/contratos";
import { brl } from "@shared/simulador";

const FORMAS = [["PIX", "PIX"], ["TRANSFERENCIA", "Transferência"], ["DINHEIRO", "Dinheiro"], ["CARTAO", "Cartão"], ["OUTRO", "Outro"]] as const;
const campo = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";
const rotulo = "flex flex-col gap-1 text-xs text-muted-foreground";
const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const VAZIO = { url: "", forma: "PIX", valor: "", pagoEm: "", idTransacao: "", pagadorNome: "", pagadorCpfParcial: "", pagadorInstituicao: "", vinculoPagador: "", observacao: "" };

function ParcelasDoContrato({ contratoId, numero, marcadas, onMarcar, onRemover }: {
  contratoId: number; numero: string; marcadas: Map<number, number>; onMarcar: (cobrancaId: number, valor: number | null) => void; onRemover: () => void;
}) {
  const { data, isLoading } = trpc.financeiro.parcelasEmAberto.useQuery({ contratoId });
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-sm"><b>{numero}</b>
        <button type="button" onClick={onRemover} className="text-muted-foreground hover:text-foreground" aria-label={`Tirar ${numero}`}><X className="h-4 w-4" /></button>
      </div>
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando parcelas…</p> : !data?.length ? <p className="text-xs text-muted-foreground">Nenhuma parcela em aberto.</p> : (
        <div className="grid gap-1 sm:grid-cols-2">
          {data.map(p => (
            <label key={p.cobrancaId} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${marcadas.has(p.cobrancaId) ? "bg-primary/15" : "hover:bg-secondary/40"}`}>
              <input type="checkbox" checked={marcadas.has(p.cobrancaId)} onChange={e => onMarcar(p.cobrancaId, e.target.checked ? p.valor : null)} />
              <span className="flex-1">{p.parcela} · vence {br(p.vencimento)}{p.status === "vencida" ? " · vencida" : ""}{p.temBoleto ? " · boleto Asaas" : ""}</span>
              <b>{brl(p.valor)}</b>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Lançar pagamento (administrador e secretária): PIX/transferência/dinheiro fora do boleto, com o comprovante.
 * O link do recibo InfinitePay preenche os dados; um pagamento pode quitar parcelas de mais de um contrato (rateio).
 */
export default function LancarPagamento() {
  const { user } = useAuth();
  const pode = podeOperarCobranca(perfilDe(user as any));
  const utils = trpc.useUtils();
  const { data: contratos } = trpc.contratos.listar.useQuery(undefined, { enabled: pode });
  const recentes = trpc.financeiro.pagamentosRecentes.useQuery(undefined, { enabled: pode });
  const [f, setF] = useState({ ...VAZIO });
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<{ id: number; numero: string }[]>([]);
  const [marcadas, setMarcadas] = useState<Map<number, number>>(new Map());
  const set = (k: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));

  const ler = trpc.financeiro.lerRecibo.useMutation({
    onSuccess: r => {
      setF(x => ({
        ...x, forma: "PIX", valor: r.valor.toFixed(2).replace(".", ","), pagoEm: r.pago_em ? r.pago_em.slice(0, 16).replace(" ", "T") : x.pagoEm,
        idTransacao: r.id_transacao ?? "", pagadorNome: r.origem.nome ?? "", pagadorCpfParcial: r.origem.cpf ?? "", pagadorInstituicao: r.origem.instituicao ?? "",
      }));
      setAviso(r.destinoRomatec ? null : `Atenção: o recebedor do comprovante é "${r.destino.nome ?? "?"}", não a Romatec / J R P BEZERRA LTDA. Confira antes de lançar.`);
      toast.success("Recibo lido");
    },
    onError: e => toast.error(e.message),
  });
  const lancar = trpc.financeiro.lancarPagamento.useMutation({
    onSuccess: r => {
      toast.success(`${r.baixadas.length} parcela(s) quitada(s): ${r.baixadas.map(b => `${b.contrato} ${b.parcela} (${b.recibo})`).join(" · ")}${r.sobra > 0 ? ` · sobra ${brl(r.sobra)}` : ""}`);
      setF({ ...VAZIO }); setAviso(null); setEscolhidos([]); setMarcadas(new Map());
      utils.financeiro.parcelasEmAberto.invalidate(); utils.financeiro.pagamentosRecentes.invalidate(); utils.contratos.detalhe.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const sincronizar = trpc.financeiro.sincronizarAsaas.useMutation({
    onSuccess: r => {
      toast.success(`Asaas conferido: ${r.conferidas} boleto(s) em aberto · ${r.pagas} pago(s) agora baixado(s) · ${r.vencidas} vencido(s)${r.outras ? ` · ${r.outras} outra(s) mudança(s)` : ""}${r.erros ? ` · ${r.erros} com erro` : ""}`);
      utils.financeiro.parcelasEmAberto.invalidate(); utils.contratos.detalhe.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return (contratos ?? []).filter(c => !["cancelado", "distratado"].includes(c.status) && !escolhidos.some(e => e.id === c.id)
      && [c.numero, c.comprador, c.loteCodigo].some(v => String(v ?? "").toLowerCase().includes(q))).slice(0, 6);
  }, [contratos, busca, escolhidos]);
  const valor = Number(f.valor.replace(/\./g, "").replace(",", ".")) || 0;
  const soma = Array.from(marcadas.values()).reduce((s, v) => s + v, 0);

  if (!pode) return null;
  const enviar = () => {
    if (!valor) { toast.error("Informe o valor pago"); return; }
    if (!f.pagoEm) { toast.error("Informe a data e a hora do pagamento"); return; }
    if (!marcadas.size) { toast.error("Marque a(s) parcela(s) que este pagamento quita"); return; }
    if (soma > valor + 0.009) { toast.error(`As parcelas marcadas somam ${brl(soma)}, mais que o valor pago (${brl(valor)})`); return; }
    lancar.mutate({
      forma: f.forma as any, valor, pagoEm: f.pagoEm, idTransacao: f.idTransacao || null, pagadorNome: f.pagadorNome || null,
      pagadorCpfParcial: f.pagadorCpfParcial || null, pagadorInstituicao: f.pagadorInstituicao || null, vinculoPagador: f.vinculoPagador || null,
      urlRecibo: f.url || null, observacao: f.observacao || null, rateio: Array.from(marcadas.entries()).map(([cobrancaId, v]) => ({ cobrancaId, valor: v })),
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Receipt className="h-4 w-4 text-primary" /> Lançar pagamento</h2>
        <Button size="sm" variant="outline" className="ml-auto h-8 text-xs" disabled={sincronizar.isPending} onClick={() => sincronizar.mutate()}
          title="Confere no Asaas os boletos em aberto e dá baixa nos que foram pagos (se algum aviso do webhook não chegou)">
          {sincronizar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Sincronizar com o Asaas
        </Button>
      </div>
      <div className="flex gap-2">
        <input value={f.url} onChange={set("url")} placeholder="Link do recibo InfinitePay (opcional) — https://recibo.infinitepay.io/statements/…" aria-label="Link do recibo" className={campo} />
        <Button variant="outline" disabled={!f.url.trim() || ler.isPending} onClick={() => ler.mutate({ url: f.url.trim() })}>
          {ler.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />} Ler recibo
        </Button>
      </div>
      {aviso && <p className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100"><TriangleAlert className="h-3.5 w-3.5" /> {aviso}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>Forma<select value={f.forma} onChange={set("forma")} className={campo}>{FORMAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
        <label className={rotulo}>Valor (R$)<input value={f.valor} onChange={set("valor")} inputMode="decimal" placeholder="0,00" className={campo} /></label>
        <label className={rotulo}>Data/hora<input type="datetime-local" value={f.pagoEm} onChange={set("pagoEm")} className={campo} /></label>
        <label className={rotulo}>ID da transação (E2E / AUT-NSU){f.forma === "PIX" ? " *" : ""}<input value={f.idTransacao} onChange={set("idTransacao")} className={campo} /></label>
        <label className={rotulo}>Pagador<input value={f.pagadorNome} onChange={set("pagadorNome")} className={campo} /></label>
        <label className={rotulo}>CPF parcial do comprovante<input value={f.pagadorCpfParcial} onChange={set("pagadorCpfParcial")} placeholder="***.XXX.XXX-**" className={campo} /></label>
        <label className={rotulo}>Vínculo do pagador (se terceiro)<input value={f.vinculoPagador} onChange={set("vinculoPagador")} placeholder="pai, mãe, cônjuge, empresa…" className={campo} /></label>
        <label className={`${rotulo} sm:col-span-2`}>Observação<input value={f.observacao} onChange={set("observacao")} className={campo} /></label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold">Contrato(s) e parcelas <span className="font-normal text-muted-foreground">— um PIX para mais de um contrato? Adicione os dois.</span></p>
        <div className="relative">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite nº do contrato, comprador ou chácara" aria-label="Buscar contrato" className={campo} />
          {sugestoes.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover p-1 shadow-lg">
              {sugestoes.map(c => (
                <button key={c.id} type="button" onClick={() => { setEscolhidos(x => [...x, { id: c.id, numero: c.numero }]); setBusca(""); }}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-secondary/60">
                  <b>{c.numero}</b> · {c.comprador} · Chácara {c.loteCodigo}
                </button>
              ))}
            </div>
          )}
        </div>
        {escolhidos.map(c => (
          <ParcelasDoContrato key={c.id} contratoId={c.id} numero={c.numero} marcadas={marcadas}
            onMarcar={(id, v) => setMarcadas(m => { const n = new Map(m); v == null ? n.delete(id) : n.set(id, v); return n; })}
            onRemover={() => setEscolhidos(x => x.filter(e => e.id !== c.id))} />
        ))}
        {marcadas.size > 0 && (
          <p className={`text-xs ${soma > valor + 0.009 ? "text-red-400" : "text-muted-foreground"}`}>
            Parcelas marcadas: <b>{brl(soma)}</b> de {brl(valor)} pagos{valor - soma > 0.009 ? ` · sobra ${brl(valor - soma)} (fica anotada)` : ""}
          </p>
        )}
      </div>
      <Button disabled={lancar.isPending} onClick={enviar}>
        {lancar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckSquare className="mr-1 h-4 w-4" />} Lançar pagamento
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Cada parcela marcada é quitada inteira, com recibo emitido e enviado ao comprador. Se a parcela tem boleto no Asaas, o Asaas é avisado do recebimento e o boleto deixa de poder ser pago.
      </p>

      {!!recentes.data?.length && (
        <details className="rounded-lg border border-border p-2 text-xs">
          <summary className="cursor-pointer font-semibold">Últimos lançamentos ({recentes.data.length})</summary>
          <ul className="mt-2 space-y-1">
            {recentes.data.map(p => (
              <li key={p.id} className="flex flex-wrap gap-x-2">
                <b>{brl(p.valor)}</b> · {p.forma} · {new Date(p.pagoEm as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}
                {p.pagadorNome && <> · {p.pagadorNome}</>} · {p.parcelas.length} parcela(s)
                {p.urlRecibo && <a href={p.urlRecibo} target="_blank" rel="noreferrer" className="text-primary hover:underline">comprovante</a>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
