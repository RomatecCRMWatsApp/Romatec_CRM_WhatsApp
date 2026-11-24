import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";
import { CATEGORIAS_DESPESA, FORMAS_DESPESA, ROTULO_CATEGORIA, type CategoriaDespesa, type FormaDespesa } from "@shared/despesas";
import { Ban, CheckCircle2, Download, FileText, Loader2, Paperclip, Pencil, Plus, RotateCcw, ScanText, ShieldCheck, X } from "lucide-react";

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const inicioMes = () => `${hoje().slice(0, 7)}-01`;
const fimEmMeses = (n: number) => { const [a, m] = hoje().split("-").map(Number); return new Date(Date.UTC(a, m - 1 + n + 1, 0)).toISOString().slice(0, 10); };
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
/** "1.234,56" ou "1234.56" → 1234.56 */
const paraNumero = (s: string) => { const t = s.trim().replace(/[R$\s]/g, ""); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); };
const FORMA: Record<FormaDespesa, string> = { PIX: "PIX", BOLETO: "Boleto", TRANSFERENCIA: "Transferência", DINHEIRO: "Dinheiro", CARTAO: "Cartão", OUTRO: "Outro" };
const SITUACAO: Record<string, [string, string]> = {
  a_pagar: ["A pagar", "bg-info-500/15 text-info-300"], vencida: ["Vencida", "bg-danger-500/15 text-danger-300"],
  paga: ["Paga", "bg-ok-500/15 text-ok-300"], cancelada: ["Cancelada", "bg-secondary text-muted-foreground"],
};
const campo = "h-9 rounded-lg border border-border bg-background px-2 text-sm";
const paraBase64 = (f: File) => new Promise<string>((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] ?? ""); r.onerror = () => erro(r.error); r.readAsDataURL(f); });

type Linha = {
  id: number; empreendimentoId: number | null; empreendimento: string | null; descricao: string; categoria: CategoriaDespesa; rotuloCategoria: string;
  fornecedor: string | null; valor: number; vencimento: string; status: string; situacao: string; pagoEm: string | null; valorPago: number | null;
  formaPagamento: string | null; grupo: string | null; parcela: string | null; comprovanteUrl: string | null; observacao: string | null;
  /** Ciência da proprietária: aguardando a confirmação dela no WhatsApp, ou confirmada */
  ciencia: { status: "aguardando" | "ciente"; em: string | null; id: number } | null;
};
type Emp = { id: number; nome: string };

const vazio = { id: 0, descricao: "", categoria: "obras" as CategoriaDespesa, empreendimentoId: "", fornecedor: "", valor: "", vencimento: hoje(), meses: "1", jaPaga: false, pagoEm: hoje(), forma: "PIX" as FormaDespesa, observacao: "" };

/** Lançar ou editar (editar: só a despesa em aberto, sem recorrência nem pagamento) */
function Formulario({ emps, inicial, onFechar }: { emps: Emp[]; inicial: typeof vazio; onFechar: (salvou: boolean) => void }) {
  const [f, setF] = useState(inicial);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(x => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const ok = { onSuccess: () => { toast.success(f.id ? "Despesa atualizada" : "Despesa lançada"); onFechar(true); }, onError: (e: any) => toast.error(e.message) };
  // Comprovante lido: fica guardado e é anexado na primeira despesa lançada
  const [comprovante, setComprovante] = useState<{ nomeArquivo: string; mime: "image/png" | "image/jpeg" | "application/pdf"; base64: string } | null>(null);
  const anexarComp = trpc.financeiro.comprovanteDespesa.useMutation();
  const pedirCiencia = trpc.financeiro.pedirCienciaDespesa.useMutation();
  // Saída de um empreendimento: a proprietária confirma a ciência pelo WhatsApp (ligado por padrão)
  const [ciencia, setCiencia] = useState(true);
  const lancar = trpc.financeiro.lancarDespesa.useMutation({
    onSuccess: async r => {
      const id = r.ids?.[0];
      if (comprovante && id) {
        await anexarComp.mutateAsync({ id, ...comprovante }).then(() => toast.success("Despesa lançada com o comprovante anexado"))
          .catch((e: any) => toast.error(`Despesa lançada, mas o comprovante não foi anexado: ${e.message}`));
      } else toast.success("Despesa lançada");
      if (id && ciencia && f.empreendimentoId) {
        await pedirCiencia.mutateAsync({ id })
          .then(c => toast.success(c.enviado ? `Ciência pedida no WhatsApp de ${c.proprietaria}` : "Pedido de ciência criado, mas o WhatsApp não saiu: use Reenviar ciência na lista"))
          .catch((e: any) => toast.error(`Ciência não pedida: ${e.message}`));
      }
      onFechar(true);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const ler = trpc.financeiro.lerComprovanteDespesa.useMutation({ onError: e => toast.error(e.message) });
  const lerComprovante = async (arq?: File) => {
    if (!arq) return;
    const mime = arq.type === "application/pdf" ? "application/pdf" : arq.type === "image/jpeg" ? "image/jpeg" : arq.type === "image/png" ? "image/png" : null;
    if (!mime) { toast.error("Envie PDF, PNG ou JPG"); return; }
    if (arq.size > 10 * 1024 * 1024) { toast.error("Arquivo grande demais (máx. 10 MB)"); return; }
    const base64 = await paraBase64(arq);
    const r = await ler.mutateAsync({ mime, base64 }).catch(() => null);
    setComprovante({ nomeArquivo: arq.name.slice(0, 120), mime, base64 });
    if (!r) return;
    const valorAtual = paraNumero(f.valor);
    const valorTxt = r.valor ? r.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
    const detalhes = [
      r.forma ? `Comprovante ${FORMA[r.forma as FormaDespesa] ?? r.forma}` : "Comprovante",
      r.idTransacao ? `ID ${r.idTransacao}` : null,
      r.recebedor ? `${r.recebedor}${r.documentoRecebedor ? ` (${r.documentoRecebedor})` : ""}` : null,
      r.instituicaoRecebedor,
    ].filter(Boolean).join(" · ");
    setF(x => ({
      ...x,
      valor: valorTxt ?? x.valor,
      fornecedor: r.recebedor ?? x.fornecedor,
      jaPaga: r.data || r.valor ? true : x.jaPaga,
      pagoEm: r.data && r.data <= hoje() ? r.data : x.pagoEm,
      vencimento: r.data ?? x.vencimento,
      forma: (r.forma && (FORMAS_DESPESA as readonly string[]).includes(r.forma) ? r.forma : x.forma) as FormaDespesa,
      observacao: x.observacao.includes(detalhes) ? x.observacao : [x.observacao.trim(), detalhes].filter(Boolean).join("\n"),
    }));
    if (valorAtual > 0 && r.valor && Math.abs(valorAtual - r.valor) >= 0.01) {
      toast.warning(`O comprovante é de R$ ${valorTxt}, e o valor digitado era R$ ${valorAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Usei o do comprovante; confira.`);
    } else {
      toast.success(r.faltando.length ? `Comprovante lido. Confira: não achei ${r.faltando.join(", ")}.` : "Comprovante lido: confira os campos e lance.");
    }
  };
  const editar = trpc.financeiro.editarDespesa.useMutation(ok);
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = paraNumero(f.valor);
    if (!(valor > 0)) { toast.error("Informe o valor"); return; }
    const base = {
      descricao: f.descricao, categoria: f.categoria, empreendimentoId: f.empreendimentoId ? Number(f.empreendimentoId) : null,
      fornecedor: f.fornecedor || null, valor, vencimento: f.vencimento, observacao: f.observacao || null,
    };
    if (f.id) editar.mutate({ id: f.id, ...base });
    else lancar.mutate({ ...base, meses: Math.max(1, Number(f.meses) || 1), pagoEm: f.jaPaga ? f.pagoEm : null, formaPagamento: f.jaPaga ? f.forma : null });
  };
  const ocupado = lancar.isPending || editar.isPending || anexarComp.isPending || ler.isPending || pedirCiencia.isPending;
  const rot = "flex flex-col gap-1 text-xs text-muted-foreground";
  return (
    <form onSubmit={salvar} className="space-y-3 rounded-xl border border-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-center gap-y-2"><p className="text-sm font-semibold">{f.id ? "Editar despesa" : "Nova despesa"}</p>
        {!f.id && (
          <label className={`ml-3 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/50 px-3 text-xs font-medium text-primary hover:bg-primary/10 ${ler.isPending ? "pointer-events-none opacity-60" : ""}`}
            title="PDF ou foto do comprovante: preenche valor, fornecedor, data e forma de pagamento">
            {ler.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
            {ler.isPending ? "Lendo comprovante…" : comprovante ? "Trocar comprovante" : "Ler comprovante"}
            <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={e => { lerComprovante(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
        {comprovante && <span className="ml-2 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{comprovante.nomeArquivo}</span> (anexa ao lançar)</span>}
        <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => onFechar(false)}><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={`${rot} sm:col-span-2`}>Descrição *<input required minLength={2} maxLength={200} value={f.descricao} onChange={set("descricao")} className={campo} placeholder="Ex.: Cascalho das ruas, tráfego pago, cartório" /></label>
        <label className={rot}>Categoria *<select value={f.categoria} onChange={set("categoria")} className={campo}>{CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}</select></label>
        <label className={rot}>Empreendimento<select value={f.empreendimentoId} onChange={set("empreendimentoId")} className={campo}><option value="">Escritório (geral)</option>{emps.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        <label className={rot}>Fornecedor<input maxLength={120} value={f.fornecedor} onChange={set("fornecedor")} className={campo} /></label>
        <label className={rot}>Valor (R$) *<input required inputMode="decimal" value={f.valor} onChange={set("valor")} className={campo} placeholder="0,00" /></label>
        <label className={rot}>Vencimento *<input required type="date" value={f.vencimento} onChange={set("vencimento")} className={campo} /></label>
        {!f.id && <label className={rot}>Repetir todo mês por<span className="flex items-center gap-1"><input type="number" min={1} max={60} value={f.meses} onChange={set("meses")} className={`${campo} w-20`} /> mês(es)</span></label>}
      </div>
      {!f.id && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.jaPaga} onChange={set("jaPaga")} /> Já paga{Number(f.meses) > 1 ? " (só a primeira)" : ""}</label>
          {f.jaPaga && <>
            <label className={rot}>Pago em<input type="date" max={hoje()} value={f.pagoEm} onChange={set("pagoEm")} className={campo} /></label>
            <label className={rot}>Forma<select value={f.forma} onChange={set("forma")} className={campo}>{FORMAS_DESPESA.map(x => <option key={x} value={x}>{FORMA[x]}</option>)}</select></label>
          </>}
        </div>
      )}
      {!f.id && f.empreendimentoId && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ciencia} onChange={e => setCiencia(e.target.checked)} />
          <ShieldCheck className="h-4 w-4 text-primary" /> Pedir a ciência da proprietária no WhatsApp ao lançar
        </label>
      )}
      <label className={rot}>Observação<textarea rows={2} maxLength={2000} value={f.observacao} onChange={set("observacao")} className="rounded-lg border border-border bg-background p-2 text-sm" /></label>
      <Button type="submit" size="sm" disabled={ocupado}>{ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}{f.id ? "Salvar" : Number(f.meses) > 1 ? `Lançar ${f.meses} meses` : "Lançar"}</Button>
    </form>
  );
}

function Pagar({ l, onFeito }: { l: Linha; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [pagoEm, setPagoEm] = useState(hoje());
  const [valor, setValor] = useState(l.valor.toFixed(2).replace(".", ","));
  const [forma, setForma] = useState<FormaDespesa>("PIX");
  const pagar = trpc.financeiro.pagarDespesa.useMutation({ onSuccess: () => { toast.success("Pagamento registrado"); setAberto(false); onFeito(); }, onError: e => toast.error(e.message) });
  if (!aberto) return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAberto(true)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pagar</Button>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input type="date" max={hoje()} value={pagoEm} onChange={e => setPagoEm(e.target.value)} className="h-7 rounded-md border border-border bg-background px-1 text-xs" />
      <input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className="h-7 w-24 rounded-md border border-border bg-background px-1 text-xs" aria-label="Valor pago" />
      <select value={forma} onChange={e => setForma(e.target.value as FormaDespesa)} className="h-7 rounded-md border border-border bg-background px-1 text-xs">{FORMAS_DESPESA.map(x => <option key={x} value={x}>{FORMA[x]}</option>)}</select>
      <Button size="sm" className="h-7 text-xs" disabled={pagar.isPending} onClick={() => pagar.mutate({ id: l.id, pagoEm, valorPago: paraNumero(valor) || null, formaPagamento: forma })}>OK</Button>
      <button className="text-muted-foreground" onClick={() => setAberto(false)}><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function Acoes({ l, onFeito, onEditar }: { l: Linha; onFeito: () => void; onEditar: () => void }) {
  const reabrir = trpc.financeiro.reabrirDespesa.useMutation({ onSuccess: () => { toast.success("Pagamento desfeito"); onFeito(); }, onError: e => toast.error(e.message) });
  const cancelar = trpc.financeiro.cancelarDespesa.useMutation({ onSuccess: r => { toast.success(`${r.canceladas} despesa(s) cancelada(s)`); onFeito(); }, onError: e => toast.error(e.message) });
  const comprovante = trpc.financeiro.comprovanteDespesa.useMutation({ onSuccess: () => { toast.success("Comprovante anexado"); onFeito(); }, onError: e => toast.error(e.message) });
  const anexar = async (f?: File) => {
    if (!f) return;
    const mime = f.type === "application/pdf" ? "application/pdf" : f.type === "image/jpeg" ? "image/jpeg" : f.type === "image/png" ? "image/png" : null;
    if (!mime) { toast.error("Envie PDF, PNG ou JPG"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Arquivo grande demais (máx. 10 MB)"); return; }
    comprovante.mutate({ id: l.id, nomeArquivo: f.name, mime, base64: await paraBase64(f) });
  };
  const pedir = trpc.financeiro.pedirCienciaDespesa.useMutation({
    onSuccess: r => { toast.success(r.enviado ? `Pedido de ciência enviado no WhatsApp de ${r.proprietaria}` : `Pedido criado, mas o WhatsApp não saiu. Link: ${r.link}`); onFeito(); },
    onError: e => toast.error(e.message),
  });
  const reenviar = trpc.financeiro.reenviarCienciaDespesa.useMutation({ onSuccess: () => toast.success("Link reenviado no WhatsApp da proprietária"), onError: e => toast.error(e.message) });
  const pedirCiencia = () => {
    const valor = l.valorPago ?? l.valor;
    const aviso = l.comprovanteUrl ? "" : "\n\nAtenção: esta despesa está sem comprovante anexado.";
    if (confirm(`${l.ciencia ? "Gerar um novo pedido de ciência (o link anterior deixa de valer)" : "Pedir a ciência da proprietária"} para a saída de ${brl(valor)} a ${l.fornecedor || "destino não informado"}? Ela recebe o resumo no WhatsApp e confirma com um código.${aviso}`)) pedir.mutate({ id: l.id });
  };
  if (l.status === "cancelada") return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {l.empreendimentoId != null && l.ciencia?.status !== "ciente" && (
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pedir.isPending} title="Mandar à proprietária para ela confirmar a ciência da saída"
          onClick={() => (l.ciencia?.status === "aguardando" && !confirm("Já existe um pedido aguardando. OK = reenviar o mesmo link; Cancelar = gerar um novo pedido.") ? pedirCiencia() : l.ciencia?.status === "aguardando" ? reenviar.mutate({ id: l.id }) : pedirCiencia())}>
          {pedir.isPending || reenviar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
          {l.ciencia?.status === "aguardando" ? "Reenviar ciência" : "Pedir ciência"}
        </Button>
      )}
      {l.status === "aberta" && <Pagar l={l} onFeito={onFeito} />}
      {l.status === "aberta" && <Button size="sm" variant="ghost" className="h-7 px-2" title="Editar" onClick={onEditar}><Pencil className="h-3.5 w-3.5" /></Button>}
      {l.status === "paga" && <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={reabrir.isPending} onClick={() => confirm("Desfazer o pagamento desta despesa?") && reabrir.mutate({ id: l.id })}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Desfazer</Button>}
      <label className={`inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-muted-foreground hover:bg-secondary hover:text-foreground ${comprovante.isPending ? "pointer-events-none opacity-50" : ""}`} title={l.comprovanteUrl ? "Trocar comprovante" : "Anexar comprovante"}>
        {comprovante.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={e => { anexar(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {l.status === "aberta" && <Button size="sm" variant="ghost" className="h-7 px-2 text-danger-300" title="Cancelar" disabled={cancelar.isPending} onClick={() => {
        const motivo = window.prompt(`Cancelar "${l.descricao}" (${br(l.vencimento)})? Ela não é apagada, fica como cancelada. Motivo:`);
        if (!motivo || motivo.trim().length < 3) return;
        const seguintes = !!l.grupo && confirm("Cancelar também as próximas parcelas desta despesa recorrente?");
        cancelar.mutate({ id: l.id, motivo, seguintes });
      }}><Ban className="h-3.5 w-3.5" /></Button>}
    </div>
  );
}

/**
 * Despesas (saídas do fluxo de caixa): lançar avulsa ou recorrente, pagar, desfazer, cancelar (nunca apaga) e
 * anexar o comprovante. Filtro por período de vencimento, empreendimento, categoria e situação; planilha.
 */
export default function Despesas() {
  const [de, setDe] = useState(inicioMes());
  const [ate, setAte] = useState(fimEmMeses(2));
  const [emp, setEmp] = useState("");
  const [categoria, setCategoria] = useState("");
  const [situacao, setSituacao] = useState<"todas" | "a_pagar" | "vencida" | "paga" | "cancelada">("todas");
  const [form, setForm] = useState<typeof vazio | null>(null);
  const { data: emps } = trpc.financeiro.empreendimentosDespesa.useQuery();
  const filtro = { de: de || null, ate: ate || null, empreendimentoId: emp === "" ? null : Number(emp), categoria: categoria || null, situacao };
  const { data, isLoading, error, refetch } = trpc.financeiro.despesas.useQuery(filtro);
  const utils = trpc.useUtils();
  const atualizar = () => { refetch(); utils.financeiro.fluxoCaixa.invalidate(); };
  const editar = (l: Linha) => setForm({ ...vazio, id: l.id, descricao: l.descricao, categoria: l.categoria, empreendimentoId: l.empreendimentoId ? String(l.empreendimentoId) : "",
    fornecedor: l.fornecedor ?? "", valor: l.valor.toFixed(2).replace(".", ","), vencimento: l.vencimento, observacao: l.observacao ?? "" });
  const planilha = `/api/financeiro/despesas.xlsx?${new URLSearchParams(Object.entries({ de, ate, empreendimentoId: emp, categoria, situacao }).filter(([, v]) => v)).toString()}`;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Vencimento de<input type="date" value={de} onChange={e => setDe(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">até<input type="date" value={ate} onChange={e => setAte(e.target.value)} className={campo} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Empreendimento
          <select value={emp} onChange={e => setEmp(e.target.value)} className={campo}><option value="">Todos</option><option value="0">Só o escritório</option>{(emps ?? []).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Categoria
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className={campo}><option value="">Todas</option>{CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}</select>
        </label>
        <div className="ml-auto flex gap-2">
          <a href={planilha} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-secondary"><Download className="h-4 w-4" /> Planilha</a>
          <Button onClick={() => setForm({ ...vazio })}><Plus className="mr-1 h-4 w-4" /> Nova despesa</Button>
        </div>
      </div>

      {form && <Formulario key={form.id || "nova"} emps={emps ?? []} inicial={form} onFechar={salvou => { setForm(null); if (salvou) atualizar(); }} />}

      <div className="flex flex-wrap gap-1">
        {(["todas", "a_pagar", "vencida", "paga", "cancelada"] as const).map(s => (
          <button key={s} onClick={() => setSituacao(s)} className={`rounded-full border px-3 py-1 text-xs ${situacao === s ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {s === "todas" ? "Todas" : SITUACAO[s][0]}
          </button>
        ))}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-sm text-danger-400">{error.message}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([["A pagar", data.totais.aPagar, ""], ["Vencido", data.totais.vencido, "text-danger-300"], ["Pago", data.totais.pago, "text-ok-300"], ["Lançamentos", data.totais.quantidade, ""]] as const).map(([r, v, cor]) => (
              <div key={r} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className={`text-lg font-bold ${cor}`}>{r === "Lançamentos" ? v : brl(v as number)}</p></div>
            ))}
          </div>
          {!data.linhas.length ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma despesa neste filtro.</p> : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Vencimento</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2 text-right">Valor</th><th className="p-2">Situação</th><th className="p-2 text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {(data.linhas as Linha[]).map(l => (
                    <tr key={l.id} className={`border-b border-border/50 align-top last:border-0 ${l.status === "cancelada" ? "opacity-60" : ""}`}>
                      <td className="p-2 whitespace-nowrap">{br(l.vencimento)}</td>
                      <td className="p-2">
                        <p className="font-medium">{l.descricao}{l.parcela && <span className="ml-1 text-xs text-muted-foreground">({l.parcela})</span>}</p>
                        <p className="text-[11px] text-muted-foreground">{[l.empreendimento ?? "Escritório", l.fornecedor].filter(Boolean).join(" · ")}</p>
                        {l.observacao && <p className="whitespace-pre-line text-[11px] text-muted-foreground">{l.observacao}</p>}
                      </td>
                      <td className="p-2 text-xs">{l.rotuloCategoria}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {brl(l.valor)}
                        {l.status === "paga" && l.valorPago != null && l.valorPago !== l.valor && <p className="text-[11px] text-muted-foreground">pago {brl(l.valorPago)}</p>}
                      </td>
                      <td className="p-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${SITUACAO[l.situacao]?.[1] ?? ""}`}>{SITUACAO[l.situacao]?.[0] ?? l.situacao}</span>
                        {l.pagoEm && <p className="mt-0.5 text-[11px] text-muted-foreground">{br(l.pagoEm)} · {FORMA[l.formaPagamento as FormaDespesa] ?? l.formaPagamento}</p>}
                        {l.comprovanteUrl && <a href={l.comprovanteUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"><FileText className="h-3 w-3" /> comprovante</a>}
                        {l.ciencia && (
                          <a href={`/api/despesas/${l.id}/ciencia.pdf`} target="_blank" rel="noreferrer"
                            className={`mt-0.5 flex items-center gap-1 text-[11px] hover:underline ${l.ciencia.status === "ciente" ? "text-ok-300" : "text-warn-300"}`}>
                            <ShieldCheck className="h-3 w-3" />
                            {l.ciencia.status === "ciente" ? `Proprietária ciente em ${new Date(l.ciencia.em!).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" })}` : "Aguardando ciência da proprietária"}
                          </a>
                        )}
                      </td>
                      <td className="p-2"><Acoes l={l} onFeito={atualizar} onEditar={() => editar(l)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.porCategoria.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 text-sm font-semibold">Por categoria <span className="font-normal text-muted-foreground">(neste filtro, sem as canceladas)</span></h3>
              {data.porCategoria.map(c => <p key={c.categoria} className="flex justify-between border-t border-border/50 py-1.5 text-sm first:border-0"><span>{c.categoria}</span><b>{brl(c.valor)}</b></p>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
