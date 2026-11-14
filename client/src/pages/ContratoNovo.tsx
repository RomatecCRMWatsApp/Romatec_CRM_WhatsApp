import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { FileSignature, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import PessoaCampos, { PESSOA_VAZIA } from "@/components/cadastro/PessoaCampos";
import { buscarCep } from "@/components/equipe/CadastroUsuario";
import { maskCEP, maskCPF, maskPhone, onlyDigits } from "@shared/masks";
import { UFS } from "@shared/cadastro";
import { perfilDe } from "@shared/equipe";
import { ESTADOS_CIVIS, REGIMES_BENS, cpfValido, exigeConjuge, exigePacto, pendenciasComprador, pendenciasDependentes, rotuloParentesco, type Dependente, type PessoaForm } from "@shared/contratos";
import DependentesCampos from "@/components/contratos/Dependentes";
import { AnexosNovoContrato, enviarAnexo, vagasDoContrato, type AnexoPendente } from "@/components/contratos/Anexos";
import { brl } from "@shared/simulador";
import { CONDICOES, MODOS_C, ROTULO_CONDICAO, ROTULO_MODO_C, prazosDaCondicao, type CondicaoPagamento, type ModoPlanoC } from "@shared/condicoesLancamento";
import { CondicoesEspecificas } from "@/components/contratos/CondicoesEspecificas";
import { foraDoPadrao } from "@shared/autorizacaoPlano";

const PASSOS = ["Unidade e plano", "Comprador", "Revisão"];

/** Primeiro pagamento sugerido: dia 10 do mês que vem */
function dataSugerida() {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 10);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-10`;
}
const br = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** Novo contrato: chácara e plano → comprador (e cônjuge) → revisão. O servidor recalcula o plano e reserva a chácara. */
export default function ContratoNovo() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery();
  const [slug, setSlug] = useState(q.get("slug") || "bom-jardims");
  const { data: op, error: erroOp } = trpc.contratos.opcoes.useQuery({ slug }, { enabled: !!slug });
  const [passo, setPasso] = useState(0);
  const [lote, setLote] = useState(q.get("lote") || "");
  const [leadId, setLeadId] = useState<number | null>(q.get("lead") ? Number(q.get("lead")) : null);
  const [corretorUserId, setCorretor] = useState<number | null>(null);
  const [modalidade, setModalidade] = useState<"financiado" | "avista">("financiado");
  /** Concessão da proprietária a terceiro indicado por ela (sem venda) — só o administrador */
  const [concessao, setConcessao] = useState(false);
  const [motivoConcessao, setMotivoConcessao] = useState("");
  const [comissaoConcessao, setComissaoConcessao] = useState("");
  const [prazoComissao, setPrazoComissao] = useState("Pix ou transferência");
  const [vencComissao, setVencComissao] = useState(() => new Date(Date.now() - 3 * 3600_000 + 30 * 86_400_000).toISOString().slice(0, 10));
  const [despesasPor, setDespesasPor] = useState<"beneficiario" | "proprietaria">("beneficiario");
  const [entradaParcelas, setEntrada] = useState(1);
  const [prazo, setPrazo] = useState(120);
  /** Forma de pagamento do financiado — define o modelo do CPCV (entrada 30% ou Plano A, B, C) */
  const [condicao, setCondicao] = useState<CondicaoPagamento>(() => { const c = q.get("condicao"); return c === "A" || c === "B" || c === "C" ? c : "padrao"; });
  /** Plano C: boleto único (resto da entrada + parcela) ou primeiro a entrada e depois o financiamento */
  const [modoC, setModoC] = useState<ModoPlanoC>(() => (q.get("modoC") === "sequencial" ? "sequencial" : "unificado"));
  /** Plano C congelado (só o administrador): mês do 1º vencimento do complemento, contado do ato */
  const [inicioComp, setInicioComp] = useState(15);
  const [data1, setData1] = useState(dataSugerida());
  const [entradaForma, setEntradaForma] = useState<"unica" | "boleto_cartao">("unica");
  const [inicioParcelas, setInicioParcelas] = useState("");
  // Planos A/B: sinal (entrada de R$ 10 mil) em N parcelas mensais; só o administrador fixa o valor da parcela do saldo
  const [sinalParcelas, setSinalParcelas] = useState(1);
  const [parcelaPers, setParcelaPers] = useState("");
  const [senhaAdmin, setSenhaAdmin] = useState("");
  const [comprador, setComprador] = useState<PessoaForm>(PESSOA_VAZIA);
  const [conjuge, setConjuge] = useState<PessoaForm>({ ...PESSOA_VAZIA });
  const [especificas, setEspecificas] = useState("");
  const [modoAssinatura, setModo] = useState<"eletronica" | "manuscrita">("eletronica");
  const [erros, setErros] = useState<Record<string, string>>({});
  // null = sem dependentes; lista = carteirinhas extras (até 6)
  const [dependentes, setDependentes] = useState<Dependente[] | null>(null);

  useEffect(() => { if (op && corretorUserId == null) setCorretor(op.euId); }, [op, corretorUserId]);
  useEffect(() => {
    if (!op?.condicoes.prazos.length) return;
    const ps = prazosDaCondicao(condicao, op.condicoes);
    if (!ps.includes(prazo)) setPrazo(condicao === "B" ? 180 : ps.at(-1)!);
  }, [op, prazo, condicao]);
  // Lead escolhido: traz nome, telefone e a chácara de interesse
  useEffect(() => {
    const l = op?.leads.find(x => x.id === leadId);
    if (!l) return;
    setComprador(c => ({ ...c, nome: c.nome || String(l.nome ?? ""), telefone1: c.telefone1 || maskPhone(String(l.telefone ?? "").replace(/^55/, "")) }));
    if (l.loteCodigo && !lote && op?.lotes.some(x => x.codigo === l.loteCodigo)) setLote(l.loteCodigo);
  }, [leadId, op]); // eslint-disable-line react-hooks/exhaustive-deps

  const valorComissao = Number(comissaoConcessao.replace(/\./g, "").replace(",", "."));
  const valorParcelaPers = parcelaPers.trim() ? Number(parcelaPers.replace(/\./g, "").replace(",", ".")) : 0;
  const plano = concessao
    ? { modalidade: "avista" as const, entradaParcelas: 1, dataPrimeiroPagamento: data1, condicao: "padrao" as const,
        concessao: { motivo: motivoConcessao, comissaoPrazo: prazoComissao, despesasPor, ...(/^\d{4}-\d{2}-\d{2}$/.test(vencComissao) ? { comissaoVencimento: vencComissao } : {}), ...(comissaoConcessao.trim() && Number.isFinite(valorComissao) ? { comissaoValor: valorComissao } : {}) } }
    : { modalidade, entradaParcelas: modalidade === "avista" || condicao !== "padrao" ? 1 : entradaParcelas, prazo: modalidade === "avista" ? undefined : prazo, dataPrimeiroPagamento: data1, condicao: modalidade === "avista" ? "padrao" as const : condicao, ...(modalidade === "financiado" && condicao === "C" ? { modoC, ...(modoC === "congelado" ? { inicioComplemento: inicioComp } : {}) } : {}),
        ...(modalidade === "financiado" && condicao !== "padrao" ? {
          entradaForma: sinalParcelas > 1 ? "unica" as const : entradaForma, ...(/^\d{4}-\d{2}-\d{2}$/.test(inicioParcelas) ? { inicioParcelas } : {}),
          ...(condicao !== "C" && sinalParcelas > 1 ? { sinalParcelas } : {}),
          ...(perfil === "admin" && condicao !== "C" && valorParcelaPers > 0 ? { parcelaPersonalizada: valorParcelaPers } : {}),
        } : {}) };
  const precisaSenha = perfil !== "admin" && !concessao ? foraDoPadrao(plano as any) : [];
  const sim = trpc.contratos.simular.useQuery({ slug, lote, plano, corretorUserId: corretorUserId ?? undefined }, { enabled: !!lote && /^\d{4}-\d{2}-\d{2}$/.test(data1) });
  // Documentos escolhidos no passo 2: sobem logo depois de criar (dependente pela posição na lista)
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const vagas = vagasDoContrato(exigeConjuge(comprador.estadoCivil), (dependentes ?? []).map((d, i) => ({ nome: d.nome, ref: i })));
  const anexosValidos = anexos.filter(a => vagas.some(v => v.alvo === a.alvo && v.tipo === a.tipo && v.dependente === a.dependente));
  const [subindo, setSubindo] = useState(false);
  const criar = trpc.contratos.criar.useMutation({
    onSuccess: async r => {
      toast.success(`Contrato ${r.numero} criado — chácara reservada`);
      try { localStorage.removeItem(`romatec:contrato-novo:rascunho:v1:${(user as any)?.id ?? "anon"}`); } catch { /* ok */ }
      if (anexosValidos.length) {
        setSubindo(true);
        let falhas = 0;
        for (const a of anexosValidos) { try { await enviarAnexo(r.id, a, a.arquivo); } catch { falhas++; } }
        setSubindo(false);
        if (falhas) toast.error(`${falhas} documento(s) não subiram — envie pela tela do contrato`);
        else toast.success(`${anexosValidos.length} documento(s) anexados`);
      }
      navigate(`/contratos/${r.id}`);
    },
    onError: e => {
      const campos = (e.data as any)?.campos as Record<string, string> | undefined;
      if (campos) { setErros(campos); setPasso(1); }
      toast.error(e.message);
    },
  });

  const loteSel = op?.lotes.find(l => l.codigo === lote);
  const casado = exigeConjuge(comprador.estadoCivil);
  const setC = (k: keyof PessoaForm, v: string) => setComprador(p => ({ ...p, [k]: v }));
  const setJ = (k: keyof PessoaForm, v: string) => setConjuge(p => ({ ...p, [k]: v }));
  const passo0ok = !!lote && !!sim.data;

  // ─── Rascunho salvo neste aparelho: o que foi digitado volta ao reabrir (7 dias; some ao criar o contrato) ───
  const chaveRascunho = `romatec:contrato-novo:rascunho:v1:${(user as any)?.id ?? "anon"}`;
  const [rascunhoEm, setRascunhoEm] = useState<string | null>(null);
  const [restaurado, setRestaurado] = useState(false);
  useEffect(() => {
    if (restaurado || !(user as any)?.id) return;
    setRestaurado(true);
    try {
      const r = JSON.parse(localStorage.getItem(chaveRascunho) || "null");
      if (!r || Date.now() - Number(r.salvoEm) > 7 * 86_400_000) return;
      const f = r.f ?? {};
      if (f.slug && !q.get("slug")) setSlug(f.slug);
      if (f.lote && !q.get("lote")) setLote(f.lote);
      if (f.leadId != null && !q.get("lead")) setLeadId(f.leadId);
      if (f.corretorUserId != null) setCorretor(f.corretorUserId);
      if (f.modalidade) setModalidade(f.modalidade);
      if (f.entradaParcelas) setEntrada(f.entradaParcelas);
      if (f.prazo) setPrazo(f.prazo);
      if (f.condicao && !q.get("condicao")) setCondicao(f.condicao);
      if (f.modoC && !q.get("modoC")) setModoC(f.modoC);
      if (f.inicioComp) setInicioComp(f.inicioComp);
      if (f.data1) setData1(f.data1);
      if (f.entradaForma) setEntradaForma(f.entradaForma);
      if (typeof f.inicioParcelas === "string") setInicioParcelas(f.inicioParcelas);
      if (Number(f.sinalParcelas) >= 1) setSinalParcelas(Number(f.sinalParcelas));
      if (typeof f.parcelaPers === "string") setParcelaPers(f.parcelaPers);
      if (f.comprador) setComprador({ ...PESSOA_VAZIA, ...f.comprador });
      if (f.conjuge) setConjuge({ ...PESSOA_VAZIA, ...f.conjuge });
      if (typeof f.especificas === "string") setEspecificas(f.especificas);
      if (f.modoAssinatura) setModo(f.modoAssinatura);
      if (Array.isArray(f.dependentes)) setDependentes(f.dependentes);
      setRascunhoEm(new Date(Number(r.salvoEm)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }));
      toast.success("Rascunho restaurado: os dados digitados antes voltaram");
    } catch { /* rascunho ilegível: começa do zero */ }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const formRascunho = { slug, lote, leadId, corretorUserId, modalidade, entradaParcelas, prazo, condicao, modoC, inicioComp, data1, entradaForma, inicioParcelas, sinalParcelas, parcelaPers, comprador, conjuge, especificas, modoAssinatura, dependentes };
  const temDados = !!(lote || comprador.nome || comprador.cpf || conjuge.nome);
  useEffect(() => {
    if (!restaurado || !temDados) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(chaveRascunho, JSON.stringify({ salvoEm: Date.now(), f: formRascunho })); setRascunhoEm(new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })); } catch { /* sem armazenamento */ }
    }, 800);
    return () => clearTimeout(t);
  }, [JSON.stringify(formRascunho), restaurado]); // eslint-disable-line react-hooks/exhaustive-deps
  const descartarRascunho = () => {
    try { localStorage.removeItem(chaveRascunho); } catch { /* ok */ }
    setComprador(PESSOA_VAZIA); setConjuge({ ...PESSOA_VAZIA }); setDependentes(null); setEspecificas(""); setRascunhoEm(null);
    toast.success("Rascunho descartado");
  };

  // ─── Cadastro já existente pelo CPF: oferece preencher (comprador e cônjuge) ───
  const cpfDig = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");
  const buscaComprador = trpc.contratos.pessoaPorCpf.useQuery({ cpf: cpfDig(comprador.cpf) }, { enabled: cpfValido(comprador.cpf), staleTime: 60_000, retry: false });
  const buscaConjuge = trpc.contratos.pessoaPorCpf.useQuery({ cpf: cpfDig(conjuge.cpf) }, { enabled: casado && cpfValido(conjuge.cpf), staleTime: 60_000, retry: false });
  const [usados, setUsados] = useState<string[]>([]);
  const mascaraForm = (x: PessoaForm): PessoaForm => ({
    ...PESSOA_VAZIA, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v ?? ""])),
    cpf: cpfDig(x.cpf).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"),
    telefone1: x.telefone1 ? maskPhone(cpfDig(x.telefone1)) : "", cep: cpfDig(x.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2"),
  } as PessoaForm);
  const preencherComprador = () => {
    const r = buscaComprador.data; if (!r) return;
    setComprador(mascaraForm(r.pessoa));
    if (r.conjuge && !conjuge.nome) setConjuge(mascaraForm(r.conjuge));
    setUsados(u => [...u, cpfDig(comprador.cpf)]);
    toast.success("Dados do cadastro preenchidos — confira antes de seguir");
  };
  const preencherConjuge = () => {
    const r = buscaConjuge.data; if (!r) return;
    setConjuge(mascaraForm(r.pessoa)); setUsados(u => [...u, `c${cpfDig(conjuge.cpf)}`]);
    toast.success("Dados do cônjuge preenchidos — confira antes de seguir");
  };
  const ofertaComprador = buscaComprador.data && !usados.includes(cpfDig(comprador.cpf)) ? buscaComprador.data : null;
  const ofertaConjuge = buscaConjuge.data && !usados.includes(`c${cpfDig(conjuge.cpf)}`) ? buscaConjuge.data : null;

  const avancar = () => {
    if (passo === 1) {
      const e = { ...pendenciasComprador(comprador, casado ? conjuge : null), ...pendenciasDependentes(dependentes ?? []) };
      setErros(e);
      if (Object.keys(e).length) { toast.error("Confira os campos destacados"); return; }
    }
    setPasso(p => Math.min(p + 1, PASSOS.length - 1));
  };
  const enviar = () => criar.mutate({
    slug, lote, leadId, corretorUserId: corretorUserId ?? undefined, plano,
    comprador, conjuge: casado ? conjuge : null, dependentes: dependentes ?? [], condicoes: { especificas, modoAssinatura },
    ...(precisaSenha.length ? { autorizacao: { senha: senhaAdmin } } : {}),
  });

  const opcoesEmp = useMemo(() => (emps ?? []).filter(e => e.acesso), [emps]);

  return (
    <div>
      <PageHeader icone={FileSignature} titulo="Novo contrato" subtitulo="Compromisso de compra e venda — a chácara fica reservada por 72 h ao criar"
        voltar={{ rotulo: "Contratos", onClick: () => navigate("/contratos") }} />
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 pb-10 md:px-6">
        {rascunhoEm && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="text-ok-400">✓ Rascunho salvo neste aparelho ({rascunhoEm})</span> — se fechar a tela, os dados digitados voltam ao reabrir. Os anexos precisam ser escolhidos de novo.
            <button type="button" className="underline hover:text-foreground" onClick={() => { if (confirm("Descartar o rascunho e limpar os dados do comprador?")) descartarRascunho(); }}>Descartar rascunho</button>
          </p>
        )}
        {passo > 0 && perfil !== "corretor" && op && (
          <p className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            Corretor da venda: <b>{op.corretores.find(c => c.id === corretorUserId)?.nome ?? "—"}</b>
            <button type="button" className="text-xs text-primary underline" onClick={() => setPasso(0)}>Trocar</button>
          </p>
        )}
        <ol className="flex flex-wrap gap-2 text-xs">
          {PASSOS.map((p, i) => (
            <li key={p} className={`rounded-full border px-3 py-1 ${i === passo ? "border-primary bg-primary/15 text-primary" : i < passo ? "border-ok-600/50 text-ok-400" : "border-border text-muted-foreground"}`}>
              {i + 1}. {p}
            </li>
          ))}
        </ol>
        {erroOp && <p className="rounded-lg border border-danger-500/40 bg-danger-500/10 p-3 text-sm text-danger-300">{erroOp.message}</p>}

        {passo === 0 && op && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Empreendimento">
                <select className={sel} value={slug} onChange={e => { setSlug(e.target.value); setLote(""); }}>
                  {opcoesEmp.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo={`Chácara (${op.lotes.filter(l => !l.concedida).length} disponíveis)`}>
                <select className={sel} value={lote} onChange={e => { setLote(e.target.value); if (op.lotes.find(x => x.codigo === e.target.value)?.concedida) setConcessao(true); }}>
                  <option value="">Escolha…</option>
                  {op.lotes.map(l => <option key={l.codigo} value={l.codigo}>{l.codigo} · {l.areaM2.toLocaleString("pt-BR")} m²{l.precoTabela ? ` · ${brl(l.precoTabela)}` : ""}{l.concedida ? " · concedida (só concessão)" : ""}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Lead (opcional)">
                <select className={sel} value={leadId ?? ""} onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  setLeadId(id);
                  // Lead com corretor responsável: já seleciona ele como corretor da venda (dá para trocar)
                  const resp = op.leads.find(l => l.id === id)?.responsavelId;
                  if (perfil !== "corretor" && resp && op.corretores.some(c => c.id === resp)) setCorretor(resp);
                }}>
                  <option value="">{perfil === "corretor" ? "Cliente próprio (sem lead)" : "Sem lead"}</option>
                  {op.leads.map(l => <option key={l.id} value={l.id}>{l.nome}{l.loteCodigo ? ` · ${l.loteCodigo}` : ""}</option>)}
                </select>
              </Campo>
              {perfil !== "corretor" && (
                <Campo rotulo="Corretor da venda (preencha pelo corretor)">
                  <select className={sel} value={corretorUserId ?? ""} onChange={e => setCorretor(Number(e.target.value))}>
                    <optgroup label="Corretores">
                      {op.corretores.filter(c => c.corretor).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </optgroup>
                    <optgroup label="Equipe / venda direta">
                      {op.corretores.filter(c => !c.corretor).map(c => <option key={c.id} value={c.id}>{c.nome}{c.id === op.euId ? " (eu)" : ""}</option>)}
                    </optgroup>
                  </select>
                </Campo>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Forma de pagamento">
                <select className={sel} value={concessao ? "concessao" : modalidade} onChange={e => {
                  const v = e.target.value;
                  setConcessao(v === "concessao");
                  if (v !== "concessao") setModalidade(v as any);
                }}>
                  <option value="financiado">Entrada + saldo parcelado</option>
                  <option value="avista">À vista (total, com desconto)</option>
                  {perfil === "admin" && <option value="concessao">Concessão da proprietária (sem venda)</option>}
                </select>
              </Campo>
              {!concessao && modalidade === "financiado" && (
                <>
                  <Campo rotulo="Condição (modelo do contrato)">
                    <select className={sel} value={condicao} onChange={e => { const k = e.target.value as CondicaoPagamento; setCondicao(k); setPrazo(k === "B" ? 180 : 120); }}>
                      {CONDICOES.map(k => <option key={k} value={k}>{ROTULO_CONDICAO[k].titulo}</option>)}
                    </select>
                  </Campo>
                  {condicao === "padrao" && <Campo rotulo={`Entrada (${Math.round(op.condicoes.entradaPct * 100)}%)`}>
                    <select className={sel} value={entradaParcelas} onChange={e => setEntrada(Number(e.target.value))}>
                      {Array.from({ length: op.condicoes.entradaMaxParcelas }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "À vista (com desconto)" : `${n}× sem juros`}</option>)}
                    </select>
                  </Campo>}
                  <Campo rotulo="Saldo">
                    <select className={sel} value={prazo} onChange={e => setPrazo(Number(e.target.value))}>
                      {prazosDaCondicao(condicao, op.condicoes).map(p => <option key={p} value={p}>{p} meses</option>)}
                    </select>
                  </Campo>
                </>
              )}
              <Campo rotulo="1º pagamento"><input type="date" className={classeCampo()} value={data1} onChange={e => setData1(e.target.value)} /></Campo>
            </div>
            {concessao && (
              <div className="space-y-3 rounded-lg border border-info-500/40 bg-info-500/5 p-3">
                <div>
                  <p className="text-sm font-semibold">Concessão da proprietária a terceiro indicado por ela</p>
                  <p className="text-xs text-muted-foreground">Não é venda: o beneficiário não paga preço, não há boleto/carnê e a chácara fica "Concedida pela proprietária", fora das vendas e do financeiro. O contrato sai com o Termo Aditivo de Concessão (assinado pela proprietária, pelo beneficiário e pela gestora), com o valor à vista do imóvel como valor de referência da transferência e a comissão de gestão paga pela proprietária.</p>
                </div>
                <Campo rotulo="Registro da proprietária (motivo da concessão)">
                  <textarea className={`${classeCampo()} min-h-[64px]`} maxLength={600} value={motivoConcessao} onChange={e => setMotivoConcessao(e.target.value)}
                    placeholder="Ex.: concessão ao ex-funcionário, em acordo com a proprietária" />
                </Campo>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo rotulo={`Comissão de gestão (R$)${sim.data ? ` · padrão ${brl(Math.round(sim.data.preco_avista * sim.data.comissao_percentual * 100) / 100)}` : ""}`}>
                    <input className={classeCampo()} inputMode="decimal" value={comissaoConcessao} onChange={e => setComissaoConcessao(e.target.value)} placeholder="padrão: % sobre o valor à vista" />
                  </Campo>
                  <Campo rotulo="Vencimento da comissão">
                    <input type="date" className={classeCampo()} value={vencComissao} onChange={e => setVencComissao(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Forma / observação do pagamento">
                    <input className={classeCampo()} maxLength={200} value={prazoComissao} onChange={e => setPrazoComissao(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Escritura, registro e imposto por conta de">
                    <select className={sel} value={despesasPor} onChange={e => setDespesasPor(e.target.value as any)}>
                      <option value="beneficiario">Beneficiário(a)</option>
                      <option value="proprietaria">Proprietária</option>
                    </select>
                  </Campo>
                </div>
              </div>
            )}
            {!concessao && modalidade === "financiado" && condicao !== "padrao" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="mb-2 text-sm font-semibold">Entrada no ato e 1º vencimento das parcelas</p>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Forma da entrada">
                  {([["unica", "Parcela única", "Boleto ou PIX do valor todo da entrada no ato."], ["boleto_cartao", "Metade no boleto/PIX + metade no cartão", "Duas cobranças no ato: uma por boleto/PIX e outra por link de pagamento no cartão de crédito."]] as const).map(([k, t, r]) => (
                    <button key={k} type="button" role="radio" aria-checked={entradaForma === k} onClick={() => { setEntradaForma(k); if (k === "boleto_cartao") setSinalParcelas(1); }}
                      className={`rounded-lg border p-3 text-left text-sm transition ${entradaForma === k ? "border-primary bg-primary/15 ring-1 ring-primary" : "border-border hover:border-primary/50"}`}>
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${entradaForma === k ? "border-primary bg-primary" : "border-muted-foreground"}`} />{t}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{r}</span>
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  1º vencimento das parcelas
                  <input type="date" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={inicioParcelas} min={data1} onChange={e => setInicioParcelas(e.target.value)} aria-label="1º vencimento das parcelas" />
                  {inicioParcelas && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setInicioParcelas("")}>usar o padrão (1 mês depois do ato)</button>}
                </label>
                <p className="mt-2 text-xs text-muted-foreground">Vazio = um mês depois do pagamento da entrada (ou da última parcela do sinal). As demais parcelas seguem mês a mês, no mesmo valor. A escolha vai para o Quadro-Resumo, a Cláusula 3 e as cobranças.</p>
                {condicao !== "C" && (
                  <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    Sinal (entrada) em
                    <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={sinalParcelas} aria-label="Parcelas do sinal"
                      onChange={e => { const n = Number(e.target.value); setSinalParcelas(n); if (n > 1) setEntradaForma("unica"); }}>
                      {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 1 ? "parcela única no ato" : `${n} parcelas mensais`}</option>)}
                    </select>
                    {sinalParcelas > 1 && <span className="text-xs text-muted-foreground">sem juros; o financiamento começa depois da última</span>}
                  </label>
                )}
                {perfil === "admin" && condicao !== "C" && (
                  <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    Valor da parcela do saldo
                    <input className="h-9 w-36 rounded-md border border-border bg-background px-2 text-sm" inputMode="decimal" aria-label="Valor da parcela do saldo"
                      placeholder={sim.data ? brl(Number((sim.data as any).parcela_tabela ?? sim.data.saldo_parcela)) : "padrão"} value={parcelaPers}
                      onChange={e => setParcelaPers(e.target.value.replace(/[^\d.,]/g, ""))} />
                    {parcelaPers
                      ? <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setParcelaPers("")}>voltar ao cálculo</button>
                      : <span className="text-xs text-muted-foreground">vazio = parcela do cálculo; menor = desconto (só o administrador)</span>}
                  </label>
                )}
                {precisaSenha.length > 0 && (
                  <div className="mt-3 rounded-md border border-warn-400/40 bg-warn-400/10 p-2 text-sm">
                    <p className="text-xs">Fora do padrão ({precisaSenha.join("; ")}): precisa da senha do administrador para criar o contrato.</p>
                    <input type="password" autoComplete="off" className="mt-1 h-9 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm"
                      placeholder="Senha do administrador" aria-label="Senha do administrador" value={senhaAdmin} onChange={e => setSenhaAdmin(e.target.value)} />
                  </div>
                )}
              </div>
            )}
            {!concessao && modalidade === "financiado" && condicao === "C" && (
              <div className="rounded-lg border border-warn-400/40 bg-warn-400/5 p-3">
                <p className="mb-2 text-sm font-semibold">Plano C — como o cliente paga o resto da entrada?</p>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Forma do Plano C">
                  {[...MODOS_C, ...(perfil === "admin" ? ["congelado" as const] : [])].map(m => (
                    <button key={m} type="button" role="radio" aria-checked={modoC === m} onClick={() => setModoC(m)}
                      className={`rounded-lg border p-3 text-left text-sm transition ${modoC === m ? "border-warn-400 bg-warn-400/15 ring-1 ring-warn-400" : "border-border hover:border-warn-400/50"}`}>
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${modoC === m ? "border-warn-400 bg-warn-400" : "border-muted-foreground"}`} />
                        {ROTULO_MODO_C[m].titulo}{m !== "unificado" && <span className="rounded bg-secondary px-1.5 text-[10px] font-normal text-muted-foreground">{m === "congelado" ? "só a gestão" : "caso a caso"}</span>}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{ROTULO_MODO_C[m].resumo}</span>
                    </button>
                  ))}
                </div>
                {modoC === "congelado" && (
                  <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    Complemento começa no
                    <input type="number" min={2} max={60} value={inicioComp} onChange={e => setInicioComp(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
                      className="h-9 w-20 rounded-md border border-border bg-background px-2 text-sm" aria-label="Mês do 1º vencimento do complemento" />
                    º mês depois do ato (congelado até lá, sem juros, em carnê à parte)
                  </label>
                )}
                <p className="mt-2 text-xs text-muted-foreground">A escolha vai para o contrato (Quadro-Resumo e Cláusulas 3.2 e 3.3), para o Anexo II e para os boletos.</p>
              </div>
            )}
            {lote && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                {sim.isLoading && <p className="text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Calculando…</p>}
                {sim.error && <p className="text-danger-400">{sim.error.message}</p>}
                {sim.data && (
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    <p>Chácara <b>{lote}</b> · {loteSel?.areaM2.toLocaleString("pt-BR")} m²</p>
                    <p>Preço de tabela: <b>{brl(sim.data.preco_tabela)}</b></p>
                    {sim.data.modalidade === "avista"
                      ? <p>À vista: <b>{brl(sim.data.total_pagar)}</b> em {br(sim.data.avista_vencimento)}</p>
                      : <>
                        {sim.data.condicao && sim.data.condicao !== "padrao" && <p className="sm:col-span-2 lg:col-span-3">Condição: <b>{ROTULO_CONDICAO[sim.data.condicao].titulo}</b> — contrato no modelo do {ROTULO_CONDICAO[sim.data.condicao].curto}</p>}
                        <p>Entrada: <b>{sim.data.entrada_qtd}× {brl(sim.data.entrada_parcela)}</b> (total {brl(sim.data.entrada_valor)})</p>
                        {sim.data.complemento_qtd ? <p>Resto da entrada: <b>{sim.data.complemento_qtd}× {brl(sim.data.complemento_parcela ?? 0)}</b> sem juros, de {br(sim.data.complemento_venc1 ?? "")}</p> : null}
                        {sim.data.complemento_qtd ? (sim.data.complemento_modo === "sequencial"
                          ? <p>Financiamento começa em <b>{br(sim.data.saldo_venc1)}</b>, depois da última parcela da entrada</p>
                          : <p>Boleto único nos {sim.data.complemento_qtd} primeiros meses: <b>{brl((sim.data.complemento_parcela ?? 0) + sim.data.saldo_parcela)}</b></p>) : null}
                        <p>Saldo: <b>{sim.data.saldo_qtd}× {brl(sim.data.saldo_parcela)}</b> a partir de {br(sim.data.saldo_venc1)}{(sim.data as any).parcela_personalizada ? <span className="text-xs text-muted-foreground"> (tabela {brl((sim.data as any).parcela_tabela)})</span> : null}</p>
                        {sim.data.reforco_qtd ? <p>Reforço anual: <b>{sim.data.reforco_qtd}× {brl(sim.data.reforco_valor ?? 0)}</b>, o 1º em {br(sim.data.reforco_venc1 ?? "")}</p> : null}
                        <p>Total a pagar: <b>{brl(sim.data.total_pagar)}</b> · juros {brl(sim.data.total_juros)}</p>
                      </>}
                    <p className="text-xs text-muted-foreground">Comissão: {brl(sim.data.comissao_total)}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {passo === 1 && (
          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Promissário(a) comprador(a)</h2>
              {ofertaComprador && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 text-sm">
                  <span>Cadastro encontrado para este CPF: <b>{ofertaComprador.pessoa.nome}</b>{ofertaComprador.conjuge ? ` (com cônjuge ${ofertaComprador.conjuge.nome})` : ""}.</span>
                  <Button size="sm" onClick={preencherComprador}>Preencher automaticamente</Button>
                </div>
              )}
              <PessoaCampos p={comprador} set={setC} erros={erros} prefixo="comprador" />
            </div>
            {casado && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-1 text-sm font-semibold">Cônjuge / companheiro(a) anuente</h2>
                <p className="mb-3 text-xs text-muted-foreground">Obrigatório para casado(a) ou em união estável — assina o contrato junto (Código Civil, arts. 1.647 e 1.725).</p>
                {ofertaConjuge && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 text-sm">
                    <span>Cadastro encontrado para este CPF: <b>{ofertaConjuge.pessoa.nome}</b>.</span>
                    <Button size="sm" onClick={preencherConjuge}>Preencher automaticamente</Button>
                  </div>
                )}
                <PessoaCampos p={conjuge} set={setJ} erros={erros} prefixo="conjuge" conjuge />
              </div>
            )}
            <div className="rounded-xl border border-border bg-card p-4">
              <DependentesCampos lista={dependentes} onMudar={setDependentes} erros={erros} comConjuge={casado} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <AnexosNovoContrato vagas={vagas} pendentes={anexos} onMudar={setAnexos} />
            </div>
          </section>
        )}

        {passo === 2 && sim.data && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p>Chácara: <b>{lote}</b> · {op?.empreendimento.nome}</p>
              <p>Comprador: <b>{comprador.nome}</b> — CPF {comprador.cpf}</p>
              {casado && <p>Cônjuge: <b>{conjuge.nome}</b> — CPF {conjuge.cpf}</p>}
              <p>Documentos anexados: <b>{anexosValidos.length}</b>{anexosValidos.length ? ` — ${anexosValidos.map(a => a.titulo.split(" — ")[0]).join(", ")}` : " (envie depois pela tela do contrato)"}</p>
              <p>Carteirinhas: <b>{1 + (casado ? 1 : 0) + (dependentes?.length ?? 0)}</b>{dependentes?.length ? ` — dependentes: ${dependentes.map(d => `${d.nome.split(" ")[0]} (${rotuloParentesco(d.parentesco)})`).join(", ")}` : " (sem dependentes)"}</p>
              <p>Plano: <b>{concessao ? `concessão da proprietária — sem cobrança (valor de referência ${brl(sim.data.preco_avista)})` : sim.data.modalidade === "avista" ? `à vista ${brl(sim.data.total_pagar)}` : `${sim.data.condicao && sim.data.condicao !== "padrao" ? `${ROTULO_CONDICAO[sim.data.condicao].curto} · ` : ""}entrada ${sim.data.entrada_qtd}× ${brl(sim.data.entrada_parcela)}${sim.data.complemento_qtd ? ` + ${sim.data.complemento_qtd}× ${brl(sim.data.complemento_parcela ?? 0)} (resto da entrada)` : ""} + ${sim.data.saldo_qtd}× ${brl(sim.data.saldo_parcela)}${sim.data.reforco_qtd ? ` + ${sim.data.reforco_qtd} reforços de ${brl(sim.data.reforco_valor ?? 0)}` : ""}`}</b></p>
              <p>Total a pagar: <b>{brl(sim.data.total_pagar)}</b></p>
            </div>
            <div>
              <CondicoesEspecificas valor={especificas} onMudar={setEspecificas} admin={perfil === "admin"} inicioComplemento={inicioComp}
                planoC={!concessao && modalidade === "financiado" && condicao === "C"}
                onCongelamento={ligado => { if (ligado) setModoC("congelado"); else if (modoC === "congelado") setModoC("unificado"); }} />
            </div>
            <Campo rotulo="Assinatura">
              <select className={sel} value={modoAssinatura} onChange={e => setModo(e.target.value as any)}>
                <option value="eletronica">Eletrônica</option>
                <option value="manuscrita">A punho, com 2 testemunhas</option>
              </select>
            </Campo>
            <p className="rounded-lg bg-secondary/40 p-2 text-xs text-muted-foreground">
              Ao criar, a chácara fica reservada para este contrato. Depois, na ficha do contrato, gere a minuta para conferência.
              O definitivo só é liberado com o parcelamento registrado (Lei 6.766/1979, art. 37).
            </p>
          </section>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" disabled={passo === 0} onClick={() => setPasso(p => p - 1)}>Voltar</Button>
          {passo < PASSOS.length - 1
            ? <Button disabled={passo === 0 && !passo0ok} onClick={avancar}>Continuar</Button>
            : <Button disabled={criar.isPending || subindo} onClick={enviar}>{criar.isPending || subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {subindo ? "Enviando documentos…" : "Criar contrato e reservar a chácara"}</Button>}
        </div>
      </div>
    </div>
  );
}
