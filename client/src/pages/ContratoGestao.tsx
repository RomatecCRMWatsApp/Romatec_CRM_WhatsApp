import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FilePlus2, FileDown, FileText, Handshake, Loader2, Paperclip, Plus, Receipt, Save, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CATEGORIAS_APORTE, FORMAS_PAGAMENTO_APORTE, MAX_BYTES_ANEXO_APORTE, PARAMETROS_PADRAO, TIPOS_ANEXO_APORTE, ROTULO_FORMA_APORTE, TIPOS_ADITIVO_GESTAO, totaisTopografia,
  type CategoriaAporte, type ParametrosGestao, type TipoAditivoGestao, type TipoAnexoAporte,
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
        <Aditivos aditivos={data.aditivos as any[]} aportes={data.aportes as any[]} base={base} onMudou={recarregar} />
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
    construtora: x.construtoraNome ?? "", construtoraCnpj: x.construtoraCnpj ?? "",
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
    construtoraNome: f.construtora, construtoraCnpj: f.construtoraCnpj,
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
        {campo("Construtora (engenharia e obras, por aditivo)", "construtora", { ph: "razão social" })}{campo("Construtora — CNPJ", "construtoraCnpj")}
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

interface Aporte { id: number; numero: number; data: string; valor: number; descricao: string; categoria: CategoriaAporte; favorecido: string; formaPagamento: string; comprovante: string; ressarcidoEm: string | null; valorContratado: number | null; referencia: string; aditivos: number[]; anexos: AnexoAporte[] }
interface AnexoAporte { chave: string; nome: string; mime: string; tipo: TipoAnexoAporte; descricao: string; bytes: number }

function Adiantamentos({ aportes, base, onMudou }: { aportes: Aporte[]; base: string; onMudou: () => void }) {
  const vazio = { data: hoje(), valor: "", descricao: "", categoria: "agrimensura" as CategoriaAporte, formaPagamento: "pix" as (typeof FORMAS_PAGAMENTO_APORTE)[number], favorecido: "", comprovante: "", contratado: "", referencia: "" };
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
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">Valor total contratado do serviço (opcional: o recibo mostra o saldo)<Input inputMode="decimal" value={f.contratado} onChange={set("contratado")} placeholder="0,00" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-4">Documento de origem (orçamento, medição, proposta)<Input value={f.referencia} onChange={set("referencia")} maxLength={300} /></label>
      </div>
      <Button disabled={criar.isPending || num(f.valor) <= 0 || f.descricao.trim().length < 3}
        onClick={() => { const { contratado, ...resto } = f; criar.mutate({ slug: SLUG, aporte: { ...resto, valor: num(f.valor), valorContratado: contratado ? num(contratado) : null } }); }}>
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
                  <td><p>{a.descricao}</p><p className="text-xs text-muted-foreground">{[CATEGORIAS_APORTE[a.categoria], ROTULO_FORMA_APORTE[a.formaPagamento as keyof typeof ROTULO_FORMA_APORTE], a.favorecido,
                    a.valorContratado ? `contratado ${brl(a.valorContratado)} · saldo ${brl(Math.max(0, a.valorContratado - a.valor))}` : "", a.aditivos.length ? `Aditivo n.º ${a.aditivos.join(", ")}` : "Anexo I"].filter(Boolean).join(" · ")}</p>
                    <AnexosRecibo aporte={a} onMudou={onMudou} /></td>
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

const lerBase64 = (arq: File) => new Promise<string>((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => falha(new Error("Não foi possível ler o arquivo"));
  r.readAsDataURL(arq);
});

/** Comprovante do pagamento e documento de origem (medição, boletim de horas) anexos ao recibo: saem junto no PDF */
function AnexosRecibo({ aporte, onMudou }: { aporte: Aporte; onMudou: () => void }) {
  const [tipo, setTipo] = useState<TipoAnexoAporte>("comprovante");
  const [descricao, setDescricao] = useState("");
  const [aberto, setAberto] = useState(false);
  const erro = (e: { message: string }) => toast.error(e.message);
  const anexar = trpc.gestao.anexarAporte.useMutation({ onSuccess: () => { toast.success("Anexo incluído no recibo"); setDescricao(""); setAberto(false); onMudou(); }, onError: erro });
  const remover = trpc.gestao.removerAnexoAporte.useMutation({ onSuccess: onMudou, onError: erro });
  const enviar = async (arq: File | undefined) => {
    if (!arq) return;
    const mime = arq.type === "image/jpg" ? "image/jpeg" : arq.type;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(mime)) return toast.error("Envie PDF, PNG ou JPG.");
    if (arq.size > MAX_BYTES_ANEXO_APORTE) return toast.error("Arquivo maior que 10 MB.");
    try {
      anexar.mutate({ slug: SLUG, id: aporte.id, anexo: { tipo, nome: arq.name.slice(0, 160), mime: mime as "application/pdf" | "image/png" | "image/jpeg", conteudoBase64: await lerBase64(arq), descricao } });
    } catch (e) { erro(e as Error); }
  };
  return (
    <div className="mt-1 space-y-1">
      {aporte.anexos.map((x, i) => (
        <p key={x.chave} className="flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
          <span>Anexo {i + 1}: {TIPOS_ANEXO_APORTE[x.tipo]}{x.descricao ? ` — ${x.descricao}` : ""} ({x.nome})</span>
          <button type="button" className="rounded p-0.5 hover:text-danger-400 focus-visible:outline focus-visible:outline-2" aria-label={`Retirar o anexo ${x.nome}`}
            onClick={() => { if (confirm(`Retirar "${x.nome}" do recibo?`)) remover.mutate({ slug: SLUG, id: aporte.id, chave: x.chave }); }}><X className="h-3 w-3" /></button>
        </p>
      ))}
      {!aberto ? (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2" onClick={() => setAberto(true)}>
          <Paperclip className="h-3 w-3" aria-hidden /> Anexar comprovante ou medição
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
          <select aria-label="Tipo do anexo" className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={tipo} onChange={e => setTipo(e.target.value as TipoAnexoAporte)}>
            {(Object.keys(TIPOS_ANEXO_APORTE) as TipoAnexoAporte[]).map(t => <option key={t} value={t}>{TIPOS_ANEXO_APORTE[t]}</option>)}
          </select>
          <Input aria-label="Descrição do anexo" className="h-8 w-56 text-xs" value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={200}
            placeholder={tipo === "comprovante" ? "ex.: PIX C6 Bank de 10/11, 13:03" : "ex.: boletim de horas da máquina"} />
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted focus-within:outline focus-within:outline-2">
            {anexar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePlus2 className="h-3 w-3" />} Escolher arquivo (PDF, PNG, JPG)
            <input type="file" className="sr-only" accept="application/pdf,image/png,image/jpeg" disabled={anexar.isPending} onChange={e => { void enviar(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setAberto(false)}>cancelar</button>
        </div>
      )}
    </div>
  );
}

interface AditivoG { id: number; numero: number; data: string; tipo: TipoAditivoGestao; objeto: string; texto: string; valor: number | null; aportes: number[] }

/** Termos aditivos ao Contrato de Gestão (motor de aditivos): numerados, em PDF e Word */
function Aditivos({ aditivos, aportes, base, onMudou }: { aditivos: AditivoG[]; aportes: Aporte[]; base: string; onMudou: () => void }) {
  const vazio = { tipo: "adiantamentos" as TipoAditivoGestao, data: hoje(), objeto: "", texto: "", valor: "", aportes: [] as number[] };
  const [f, setF] = useState(vazio);
  const [aberto, setAberto] = useState(false);
  const erro = (e: { message: string }) => toast.error(e.message);
  const criar = trpc.gestao.criarAditivo.useMutation({ onSuccess: r => { toast.success(`Termo aditivo n.º ${r.numero} criado`); setF(vazio); setAberto(false); onMudou(); }, onError: erro });
  const excluir = trpc.gestao.excluirAditivo.useMutation({ onSuccess: () => { toast.success("Termo aditivo excluído"); onMudou(); }, onError: erro });
  const jaReconhecidos = new Set(aditivos.filter(a => a.tipo === "adiantamentos").flatMap(a => a.aportes));
  const marcar = (id: number) => setF(x => ({ ...x, aportes: x.aportes.includes(id) ? x.aportes.filter(i => i !== id) : [...x.aportes, id] }));
  const soma = aportes.filter(a => f.aportes.includes(a.id)).reduce((s, a) => s + a.valor, 0);
  const tipo = TIPOS_ADITIVO_GESTAO[f.tipo];
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" aria-labelledby="aditivos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="aditivos" className="font-semibold">Termos aditivos</h2>
        <Button size="sm" variant={aberto ? "outline" : "default"} onClick={() => setAberto(v => !v)}><FilePlus2 className="mr-1 h-4 w-4" /> {aberto ? "Fechar" : "Novo termo aditivo"}</Button>
      </div>
      {aberto && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
              <select className={selectCls} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as TipoAditivoGestao })}>
                {(Object.keys(TIPOS_ADITIVO_GESTAO) as TipoAditivoGestao[]).map(t => <option key={t} value={t}>{TIPOS_ADITIVO_GESTAO[t].rotulo}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Data<Input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Valor (R$, opcional){f.tipo === "adiantamentos" && " — vazio: soma dos recibos"}
              <Input inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} placeholder={f.tipo === "adiantamentos" ? brl(soma) : "0,00"} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Objeto (vazio: texto padrão do tipo)
            <Input value={f.objeto} onChange={e => setF({ ...f, objeto: e.target.value })} placeholder={tipo.objeto} maxLength={500} />
          </label>
          {f.tipo === "adiantamentos" && (
            <fieldset className="space-y-1">
              <legend className="text-xs text-muted-foreground">Recibos que o termo reconhece</legend>
              {!aportes.length && <p className="text-xs text-muted-foreground">Lance os adiantamentos acima para escolher.</p>}
              {aportes.map(a => (
                <label key={a.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={f.aportes.includes(a.id)} onChange={() => marcar(a.id)} />
                  Recibo {a.numero} · {dataBR(a.data)} · {a.descricao} · {brl(a.valor)}{jaReconhecidos.has(a.id) && <span className="text-muted-foreground">(já em outro termo)</span>}
                </label>
              ))}
            </fieldset>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Alterações e inclusões (uma por linha; cada linha vira um item numerado)
            <textarea value={f.texto} onChange={e => setF({ ...f, texto: e.target.value })} rows={5} maxLength={8000} className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
              placeholder="ex.: Fica incluído no objeto do Contrato de Gestão o serviço de …" />
          </label>
          <Button disabled={criar.isPending} onClick={() => criar.mutate({ slug: SLUG, aditivo: { tipo: f.tipo, data: f.data, objeto: f.objeto, texto: f.texto, valor: f.valor ? num(f.valor) : null, aportes: f.tipo === "adiantamentos" ? f.aportes : [] } })}>
            {criar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Gerar termo aditivo
          </Button>
        </div>
      )}
      {!aditivos.length && !aberto && <p className="text-xs text-muted-foreground">Nenhum termo aditivo ainda. Os termos ficam numerados (PRIMEIRO, SEGUNDO…) e integram o contrato (Cláusula 13.2).</p>}
      {aditivos.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {[...aditivos].reverse().map(a => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <div><p className="font-medium">Termo aditivo n.º {a.numero} · {TIPOS_ADITIVO_GESTAO[a.tipo]?.rotulo ?? a.tipo}</p>
                <p className="text-xs text-muted-foreground">{dataBR(a.data)}{a.valor ? ` · ${brl(a.valor)}` : ""}{a.aportes.length ? ` · ${a.aportes.length} recibo(s)` : ""}</p></div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" asChild><a href={`${base}/aditivo/${a.id}.pdf`} target="_blank" rel="noreferrer"><FileDown className="mr-1 h-3.5 w-3.5" /> PDF</a></Button>
                <Button size="sm" variant="outline" asChild><a href={`${base}/aditivo/${a.id}.docx`}><FileText className="mr-1 h-3.5 w-3.5" /> Word</a></Button>
                <Button size="sm" variant="ghost" aria-label={`Excluir termo aditivo ${a.numero}`} onClick={() => { if (confirm(`Excluir o termo aditivo n.º ${a.numero}? (só se ainda não foi assinado)`)) excluir.mutate({ slug: SLUG, id: a.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
