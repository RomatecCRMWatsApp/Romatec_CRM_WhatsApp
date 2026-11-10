import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileText, Handshake, Loader2, Plus, Receipt, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORIAS_APORTE, FORMAS_PAGAMENTO_APORTE, PARAMETROS_PADRAO, ROTULO_FORMA_APORTE, totaisTopografia,
  type CategoriaAporte, type ParametrosGestao,
} from "@shared/gestao";

const SLUG = "bom-jardims";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (t: string) => Number(String(t).replace(/\./g, "").replace(",", ".")) || 0;
const pctTxt = (v: number) => String(Math.round(v * 10000) / 100).replace(".", ",");
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const hoje = () => new Date().toLocaleDateString("sv-SE");
const selectCls = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

/** Vendas › Contrato de gestão: EMPREENDEDORA × GESTORA (J R P Bezerra / Romatec) — documento interno do administrador */
export default function ContratoGestao() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.gestao.dados.useQuery({ slug: SLUG });
  const recarregar = () => utils.gestao.dados.invalidate();

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error || !data) return <p className="p-6 text-sm text-danger-400">{error?.message ?? "Não foi possível carregar o contrato de gestão."}</p>;
  const base = `/api/gestao/${SLUG}`;

  return (
    <div>
      <PageHeader icone={Handshake} titulo="Contrato de gestão" subtitulo={`${data.empreendimento.nome} · contrato n.º ${data.numero} · documento interno entre a proprietária e a Romatec`}
        acoes={<div className="flex flex-wrap gap-2">
          <Button asChild><a href={`${base}/contrato.pdf`} target="_blank" rel="noreferrer"><FileDown className="mr-1 h-4 w-4" /> Baixar PDF</a></Button>
          <Button variant="outline" asChild><a href={`${base}/contrato.docx`}><FileText className="mr-1 h-4 w-4" /> Baixar Word</a></Button>
        </div>} />
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 pb-10 md:px-6">
        <section className="rounded-xl border border-border bg-card p-4 text-sm" aria-labelledby="partes">
          <h2 id="partes" className="mb-2 font-semibold">Partes</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div><p className="text-xs text-muted-foreground">EMPREENDEDORA (proprietária)</p><p className="font-medium">{data.empreendedora.nome}</p><p className="text-xs text-muted-foreground">{data.empreendedora.doc || "documento não informado"}</p></div>
            <div><p className="text-xs text-muted-foreground">GESTORA</p><p className="font-medium">J R P Bezerra Ltda (Romatec Consultoria Total)</p><p className="text-xs text-muted-foreground">CNPJ 17.261.987/0001-09 · CRECI J-1234</p></div>
          </div>
          {!data.empreendedora.completa && (
            <p className="mt-2 rounded-lg border border-[var(--rt-gold)]/50 bg-secondary p-2 text-xs">A qualificação da proprietária está incompleta: complete os dados da vendedora em Contratos › Configuração jurídica. O contrato usa os mesmos dados.</p>
          )}
        </section>
        <Parametros p={data.parametros} qtdCadastrados={data.lotesCadastrados} onSalvo={recarregar} />
        <Adiantamentos aportes={data.aportes as any[]} base={base} onMudou={recarregar} />
        <p className="text-xs text-muted-foreground">
          O contrato e os recibos saem com a qualificação completa da proprietária e do imóvel cadastrada no jurídico. Revise o texto com o seu advogado antes de colher as assinaturas.
          Para validade como título executivo, assinem as partes e 2 (duas) testemunhas.
        </p>
      </div>
    </div>
  );
}

function Parametros({ p, qtdCadastrados, onSalvo }: { p: ParametrosGestao; qtdCadastrados: number; onSalvo: () => void }) {
  const vazio = (x: ParametrosGestao) => ({
    comissao: pctTxt(x.comissaoPct), corretor: pctTxt(x.corretorParceiroPct), valorLote: String(x.valorPorLote).replace(".", ","), qtdLotes: x.qtdLotes ? String(x.qtdLotes) : "", extras: String(x.unidadesExtras ?? 1), pontos: String(x.pontosBanhoQtd ?? 85), valorPonto: String(x.valorPontoBanho ?? 200).replace(".", ","),
    retencao: pctTxt(x.retencaoAportesPct), prazo: String(x.prazoMinimoMeses), multa: pctTxt(x.multaRescisaoPct), dataContrato: x.dataContrato,
    t1n: x.testemunha1Nome, t1c: x.testemunha1Cpf, t2n: x.testemunha2Nome, t2c: x.testemunha2Cpf, obs: x.observacoes,
  });
  const [f, setF] = useState(vazio(p));
  useEffect(() => setF(vazio(p)), [p]);
  const salvar = trpc.gestao.salvar.useMutation({ onSuccess: () => { toast.success("Contrato atualizado"); onSalvo(); }, onError: e => toast.error(e.message) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const qtd = Number(f.qtdLotes) || qtdCadastrados;
  const top = totaisTopografia({ valorPorLote: num(f.valorLote), unidadesExtras: Number(f.extras) || 0, pontosBanhoQtd: Number(f.pontos) || 0, valorPontoBanho: num(f.valorPonto) }, qtd);
  const campo = (rotulo: string, k: keyof typeof f, o: { sufixo?: string; tipo?: string; ph?: string; modo?: "decimal" | "numeric" } = {}) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">{rotulo}
      <div className="flex items-center gap-1"><Input type={o.tipo ?? "text"} inputMode={o.modo} value={f[k]} onChange={set(k)} placeholder={o.ph} />{o.sufixo && <span>{o.sufixo}</span>}</div>
    </label>
  );
  const enviar = () => salvar.mutate({ slug: SLUG, parametros: {
    ...PARAMETROS_PADRAO,
    comissaoPct: num(f.comissao) / 100, corretorParceiroPct: num(f.corretor) / 100, valorPorLote: num(f.valorLote), qtdLotes: f.qtdLotes ? Number(f.qtdLotes) : null,
    unidadesExtras: Number(f.extras) || 0, pontosBanhoQtd: Number(f.pontos) || 0, valorPontoBanho: num(f.valorPonto),
    retencaoAportesPct: num(f.retencao) / 100, prazoMinimoMeses: Number(f.prazo) || 60, multaRescisaoPct: num(f.multa) / 100, dataContrato: f.dataContrato,
    testemunha1Nome: f.t1n, testemunha1Cpf: f.t1c, testemunha2Nome: f.t2n, testemunha2Cpf: f.t2c, observacoes: f.obs,
  } });
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" aria-labelledby="condicoes">
      <h2 id="condicoes" className="font-semibold">Condições do contrato</h2>
      <div className="grid gap-3 md:grid-cols-4">
        {campo("Remuneração da gestão (todas as vendas)", "comissao", { sufixo: "%", modo: "decimal" })}
        {campo("Corretagem do parceiro (sai dos 5%)", "corretor", { sufixo: "%", modo: "decimal" })}
        {campo("Agrimensura: valor por lote", "valorLote", { sufixo: "R$", modo: "decimal" })}
        {campo("Quantidade de lotes", "qtdLotes", { ph: `${qtdCadastrados} (cadastrados)`, modo: "numeric" })}
        {campo("Áreas extras locadas (adm./stand)", "extras", { modo: "numeric" })}
        {campo("Pontos de banho no rio", "pontos", { modo: "numeric" })}
        {campo("Valor por ponto de banho", "valorPonto", { sufixo: "R$", modo: "decimal" })}
        {campo("Retenção para ressarcir adiantamentos", "retencao", { sufixo: "%", modo: "decimal" })}
        {campo("Prazo mínimo", "prazo", { sufixo: "meses", modo: "numeric" })}
        {campo("Multa na rescisão imotivada", "multa", { sufixo: "%", modo: "decimal" })}
        {campo("Data do contrato", "dataContrato", { tipo: "date" })}
        {campo("Testemunha 1 — nome", "t1n")}{campo("Testemunha 1 — CPF", "t1c")}
        {campo("Testemunha 2 — nome", "t2n")}{campo("Testemunha 2 — CPF", "t2c")}
      </div>
      <p className="rounded-lg bg-secondary p-2">
        Topografia a receber: locação de <b>{top.unidades} unidades × {brl(num(f.valorLote))} = {brl(top.locacao)}</b>
        {top.banho > 0 && <> + pontos de banho <b>{Number(f.pontos)} × {brl(num(f.valorPonto))} = {brl(top.banho)}</b></>} = <b>{brl(top.total)}</b>
      </p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Cláusula adicional (opcional)
        <textarea value={f.obs} onChange={set("obs")} rows={2} maxLength={2000} className="rounded-md border border-border bg-background p-2 text-sm text-foreground" />
      </label>
      <Button disabled={salvar.isPending} onClick={enviar}>{salvar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar condições</Button>
    </section>
  );
}

interface Aporte { id: number; numero: number; data: string; valor: number; descricao: string; categoria: CategoriaAporte; favorecido: string; formaPagamento: string; comprovante: string; ressarcidoEm: string | null }

function Adiantamentos({ aportes, base, onMudou }: { aportes: Aporte[]; base: string; onMudou: () => void }) {
  const vazio = { data: hoje(), valor: "", descricao: "", categoria: "agrimensura" as CategoriaAporte, formaPagamento: "pix" as (typeof FORMAS_PAGAMENTO_APORTE)[number], favorecido: "", comprovante: "" };
  const [f, setF] = useState(vazio);
  const erro = (e: { message: string }) => toast.error(e.message);
  const criar = trpc.gestao.criarAporte.useMutation({ onSuccess: r => { toast.success(`Recibo n.º ${r.numero} criado`); setF(vazio); onMudou(); }, onError: erro });
  const ressarcido = trpc.gestao.ressarcido.useMutation({ onSuccess: onMudou, onError: erro });
  const excluir = trpc.gestao.excluirAporte.useMutation({ onSuccess: () => { toast.success("Lançamento excluído"); onMudou(); }, onError: erro });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const total = aportes.reduce((s, a) => s + a.valor, 0), pago = aportes.filter(a => a.ressarcidoEm).reduce((s, a) => s + a.valor, 0);
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" aria-labelledby="adiantamentos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="adiantamentos" className="font-semibold">Adiantamentos com recursos próprios (Anexo I)</h2>
        <p className="text-xs text-muted-foreground">Total {brl(total)} · ressarcido {brl(pago)} · <b className="text-foreground">a ressarcir {brl(total - pago)}</b></p>
      </div>
      <div className="grid gap-2 md:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Data<Input type="date" value={f.data} onChange={set("data")} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Valor (R$)<Input inputMode="decimal" value={f.valor} onChange={set("valor")} placeholder="0,00" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">Descrição<Input value={f.descricao} onChange={set("descricao")} placeholder="ex.: marcos de concreto para a locação dos lotes" maxLength={500} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Categoria
          <select className={selectCls} value={f.categoria} onChange={set("categoria")}>{(Object.keys(CATEGORIAS_APORTE) as CategoriaAporte[]).map(c => <option key={c} value={c}>{CATEGORIAS_APORTE[c]}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Forma de pagamento
          <select className={selectCls} value={f.formaPagamento} onChange={set("formaPagamento")}>{FORMAS_PAGAMENTO_APORTE.map(x => <option key={x} value={x}>{ROTULO_FORMA_APORTE[x]}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-3">Favorecido (quem recebeu)<Input value={f.favorecido} onChange={set("favorecido")} maxLength={200} /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-3">Comprovante (n.º do PIX, nota, recibo)<Input value={f.comprovante} onChange={set("comprovante")} maxLength={200} /></label>
      </div>
      <Button disabled={criar.isPending || num(f.valor) <= 0 || f.descricao.trim().length < 3}
        onClick={() => criar.mutate({ slug: SLUG, aporte: { ...f, valor: num(f.valor) } })}>
        {criar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Lançar e gerar recibo
      </Button>
      {aportes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2">N.º</th><th>Data</th><th>Descrição</th><th className="pr-4 text-right">Valor</th><th className="pl-2">Ressarcido</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {aportes.map(a => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="py-2">{a.numero}</td><td>{dataBR(a.data)}</td>
                  <td><p>{a.descricao}</p><p className="text-xs text-muted-foreground">{[CATEGORIAS_APORTE[a.categoria], ROTULO_FORMA_APORTE[a.formaPagamento as keyof typeof ROTULO_FORMA_APORTE], a.favorecido].filter(Boolean).join(" · ")}</p></td>
                  <td className="pr-4 text-right font-medium">{brl(a.valor)}</td>
                  <td className="pl-2"><label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!a.ressarcidoEm} onChange={e => ressarcido.mutate({ slug: SLUG, id: a.id, data: e.target.checked ? hoje() : null })} />
                    {a.ressarcidoEm ? dataBR(a.ressarcidoEm) : "não"}</label></td>
                  <td className="text-right">
                    <Button size="sm" variant="outline" asChild><a href={`${base}/recibo/${a.id}.pdf`} target="_blank" rel="noreferrer"><Receipt className="mr-1 h-3.5 w-3.5" /> Recibo</a></Button>
                    {!a.ressarcidoEm && <Button size="sm" variant="ghost" aria-label={`Excluir lançamento ${a.numero}`} onClick={() => { if (confirm(`Excluir o lançamento n.º ${a.numero}?`)) excluir.mutate({ slug: SLUG, id: a.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
