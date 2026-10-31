/**
 * Contexto do merge do CPCV (tags {{…}} do modelo — templates/campos.json).
 * montarContexto é puro: recebe o jurídico do empreendimento, o lote, o plano congelado, as pessoas do contrato e as
 * credenciais dos corretores, e devolve o objeto que o docxtemplater preenche.
 *
 * Corretores (reconciliação com o modelo): o modelo traz a ROMATEC e o seu responsável técnico (José Romário) fixos no texto,
 * então corr_* são sempre as credenciais do responsável técnico; o corretor que vendeu, quando é outro, entra como
 * corretor parceiro (corr_parceiro_*).
 */
import { areaExtenso, brl, dataBR, dataExtenso, docMascara, extenso, pct, reaisExtenso } from './formato';
import { tituloCondicao, type PlanoContrato } from './plano';

export type Ctx = Record<string, string | boolean | number>;

export interface CredenciaisCorretor {
  nome: string;
  cpf: string;
  /** "4.705" */
  creci: string;
  creciUf: string;
  /** "AAAA-MM-DD" */
  creciValidade: string;
  certidaoCodigo: string;
  certidaoEmissao: string;
  certidaoValidade: string;
}

/** Linha da tabela pessoas (ou do formulário) */
export interface PessoaContrato {
  nome: string;
  cpfCnpj: string;
  nacionalidade?: string | null;
  estadoCivil?: string | null;
  regimeBens?: string | null;
  pactoAntenupcial?: string | null;
  profissao?: string | null;
  nascimento?: string | null;
  sexo?: string | null;
  rg?: string | null;
  rgOrgao?: string | null;
  rgUf?: string | null;
  email?: string | null;
  telefone1?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

export interface EntradaContexto {
  contrato: { numero: string; codigoVerificacao: string; modoAssinatura: 'eletronica' | 'manuscrita'; dataGeracao: string };
  juridico: { defaults: Record<string, unknown>; vendedoraTipo: 'PF' | 'PJ'; vendedora: Record<string, unknown>; modeloVersao: string };
  /** Campos emp_* alterados só neste contrato */
  overrides?: Record<string, unknown> | null;
  lote: { codigo: string; quadra: string | null; numero: number | null; areaM2: number; perimetroM: number; descricao: string; viaFrente: string; matricula: string };
  plano: PlanoContrato;
  comprador: PessoaContrato;
  conjuge?: PessoaContrato | null;
  comprador2?: (PessoaContrato & { fracao: number }) | null;
  /** Responsável técnico da Romatec (corr_*) */
  corretor: CredenciaisCorretor;
  /** Corretor que vendeu, quando não é o responsável técnico */
  parceiro?: CredenciaisCorretor | null;
  /** Passo 7 do wizard: condições específicas, parcelas mínimas na obra, testemunhas */
  condicionantes?: Record<string, string>;
  /** Quem recebe os pagamentos (titular da conta Asaas do empreendimento) — Cláusula 4ª; null = conta ainda não configurada */
  recebedor?: { nome: string; cpfCnpj: string } | null;
}

const ROTULO_ESTADO_CIVIL: Record<string, [string, string]> = {
  solteiro: ['solteiro', 'solteira'], casado: ['casado', 'casada'], uniao_estavel: ['convivente em união estável', 'convivente em união estável'],
  divorciado: ['divorciado', 'divorciada'], separado: ['separado judicialmente', 'separada judicialmente'], viuvo: ['viúvo', 'viúva'],
};
const ROTULO_REGIME: Record<string, string> = {
  comunhao_parcial: 'comunhão parcial de bens', comunhao_universal: 'comunhão universal de bens', separacao_total: 'separação total de bens',
  separacao_obrigatoria: 'separação obrigatória de bens', participacao_final: 'participação final nos aquestos',
};

export const COM_BENEFICIARIO_PADRAO = 'ROMATEC CONSULTORIA TOTAL (J R P Bezerra Ltda), CNPJ 17.261.987/0001-09';

export const temConjugeNoContrato = (estadoCivil: string | null | undefined) => ['casado', 'uniao_estavel'].includes(String(estadoCivil ?? ''));

const fem = (p: PessoaContrato) => p.sexo === 'F';
const nacionalidade = (p: PessoaContrato) => {
  const n = String(p.nacionalidade ?? 'brasileira').toLowerCase();
  return n === 'brasileira' ? (fem(p) ? 'brasileira' : 'brasileiro') : n;
};
const estadoCivil = (p: PessoaContrato) => (ROTULO_ESTADO_CIVIL[String(p.estadoCivil)] ?? [p.estadoCivil ?? '', p.estadoCivil ?? ''])[fem(p) ? 1 : 0];
const cepMascara = (c: string | null | undefined) => String(c ?? '').replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2-$3');
export function telefoneMascara(t: string | null | undefined): string {
  const s = String(t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (s.length === 11) return s.replace(/(\d{2})(\d)(\d{4})(\d{4})/, '($1) $2 $3-$4');
  if (s.length === 10) return s.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return String(t ?? '');
}
export function enderecoCompleto(p: PessoaContrato): string {
  if (!p.logradouro) return '';
  const rua = [p.logradouro, p.numero ? `n.º ${p.numero}` : 's/n', p.complemento].filter(Boolean).join(', ');
  const cidade = [p.cidade, p.uf].filter(Boolean).join('/');
  return [rua, p.bairro, cidade, p.cep ? `CEP ${cepMascara(p.cep)}` : ''].filter(Boolean).join(', ');
}
const rgOrgao = (p: PessoaContrato) => [p.rgOrgao, p.rgUf].filter(Boolean).join('/');

/** Qualificação curta (2º comprador): nacionalidade, estado civil, profissão, RG */
function qualificacaoCurta(p: PessoaContrato): string {
  return [nacionalidade(p), estadoCivil(p), p.profissao, p.rg ? `RG n.º ${p.rg} ${rgOrgao(p)}`.trim() : '', enderecoCompleto(p) ? `residente na ${enderecoCompleto(p)}` : '']
    .filter(Boolean).join(', ');
}

/** Tags das pessoas do contrato (comp_*, conj_*, comp2_*) */
export function tagsPessoas(comprador: PessoaContrato, conjuge?: PessoaContrato | null, comprador2?: (PessoaContrato & { fracao: number }) | null): Ctx {
  const ctx: Ctx = {
    comp_nome: comprador.nome.toUpperCase(), comp_cpf: docMascara(comprador.cpfCnpj), comp_nacionalidade: nacionalidade(comprador),
    comp_estado_civil: estadoCivil(comprador), comp_profissao: comprador.profissao ?? '', comp_nascimento: dataBR(comprador.nascimento ?? ''),
    comp_rg: comprador.rg ?? '', comp_rg_orgao: rgOrgao(comprador), comp_endereco: enderecoCompleto(comprador),
    comp_email: comprador.email ?? '', comp_telefone: telefoneMascara(comprador.telefone1),
    comp_casado: temConjugeNoContrato(comprador.estadoCivil),
    comp2_existe: Boolean(comprador2), comp2_resumo: '',
  };
  if (ctx.comp_casado && conjuge) {
    const regime = String(comprador.regimeBens ?? conjuge.regimeBens ?? '');
    const pacto = comprador.pactoAntenupcial ?? conjuge.pactoAntenupcial ?? '';
    Object.assign(ctx, {
      conj_nome: conjuge.nome.toUpperCase(), conj_nacionalidade: nacionalidade(conjuge), conj_profissao: conjuge.profissao ?? '',
      conj_rg: [conjuge.rg, rgOrgao(conjuge)].filter(Boolean).join(' '), conj_cpf: docMascara(conjuge.cpfCnpj),
      conj_regime_bens: ROTULO_REGIME[regime] ?? regime, conj_pacto: pacto ? `, com pacto antenupcial (${pacto})` : '',
    });
  }
  if (comprador2) {
    Object.assign(ctx, {
      comp2_nome: comprador2.nome.toUpperCase(), comp2_qualificacao: qualificacaoCurta(comprador2), comp2_cpf: docMascara(comprador2.cpfCnpj),
      comp2_fracao: `${String(comprador2.fracao).replace('.', ',')}%`,
      comp2_resumo: ` e ${comprador2.nome.toUpperCase()} — CPF ${docMascara(comprador2.cpfCnpj)}`,
    });
  }
  return ctx;
}

/** Tags do plano (plano_*, pagamento_*, com_*) */
export function tagsPlano(s: PlanoContrato): Ctx {
  const financiado = s.modalidade === 'financiado';
  const lancamento = financiado && !!s.condicao && s.condicao !== 'padrao';
  const entradaForma = !financiado ? '' : lancamento
    ? (s.complemento_qtd
      ? `R$ ${brl(s.complemento_ato ?? s.entrada_parcela)} no ato, com vencimento em ${dataBR(s.entrada_venc1)}, e o complemento de R$ ${brl(s.complemento_valor ?? 0)} em ${s.complemento_qtd} (${extenso(s.complemento_qtd)}) parcelas mensais de R$ ${brl(s.complemento_parcela ?? 0)}, sem juros, a primeira com vencimento em ${dataBR(s.complemento_venc1 ?? '')}`
      : `em parcela única de R$ ${brl(s.entrada_parcela)}, sem desconto, com vencimento em ${dataBR(s.entrada_venc1)}`)
    : s.entrada_qtd === 1
    ? `à vista, com desconto de R$ ${brl(s.entrada_desconto)}, vencimento em ${dataBR(s.entrada_venc1)}`
    : `em ${s.entrada_qtd} (${extenso(s.entrada_qtd)}) parcelas mensais de R$ ${brl(s.entrada_parcela)}, sem desconto, a primeira com vencimento em ${dataBR(s.entrada_venc1)}`;
  return {
    pagamento_financiado: financiado, pagamento_avista: !financiado,
    plano_preco_tabela: brl(s.preco_tabela), plano_preco_tabela_extenso: reaisExtenso(s.preco_tabela),
    plano_preco_avista: brl(s.preco_avista),
    plano_avista_forma: financiado ? '' : `parcela única com vencimento em ${dataBR(s.avista_vencimento)}`,
    plano_entrada_valor: financiado ? brl(s.entrada_valor) : '', plano_entrada_percentual: financiado ? pct(s.entrada_percentual, lancamento && Math.round(s.entrada_percentual * 100) !== s.entrada_percentual * 100 ? 2 : 0) : '',
    plano_entrada_forma: entradaForma,
    // Condições de lançamento (modelos …-PLANO-A/B/C): título, reforços anuais (A) e complemento da entrada (C)
    plano_condicao_titulo: financiado ? tituloCondicao(s) : '',
    plano_reforco_qtd: s.reforco_qtd ? String(s.reforco_qtd) : '', plano_reforco_valor: s.reforco_valor ? brl(s.reforco_valor) : '',
    plano_reforco_extenso: s.reforco_valor ? reaisExtenso(s.reforco_valor) : '', plano_reforco_venc1: s.reforco_venc1 ? dataBR(s.reforco_venc1) : '',
    plano_complemento_ato: s.complemento_ato ? brl(s.complemento_ato) : '', plano_complemento_valor: s.complemento_valor ? brl(s.complemento_valor) : '',
    plano_complemento_qtd: s.complemento_qtd ? String(s.complemento_qtd) : '', plano_complemento_parcela: s.complemento_parcela ? brl(s.complemento_parcela) : '',
    plano_complemento_venc1: s.complemento_venc1 ? dataBR(s.complemento_venc1) : '',
    plano_saldo_valor: financiado ? brl(s.saldo_valor) : '', plano_saldo_qtd: financiado ? String(s.saldo_qtd) : '',
    plano_saldo_parcela: financiado ? brl(s.saldo_parcela) : '', plano_saldo_venc1: financiado ? dataBR(s.saldo_venc1) : '',
    plano_taxa_aa: pct(s.taxa_aa), plano_taxa_am: pct(s.taxa_am, 4), plano_cet_aa: pct(s.taxa_aa),
    plano_total_pagar: brl(s.total_pagar), plano_total_juros: brl(s.total_juros),
    plano_diferenca_avista: brl(s.total_pagar - s.preco_avista),
    com_valor: brl(s.comissao_total), com_percentual: pct(s.comissao_percentual, 0),
  };
}

function tagsCorretor(c: CredenciaisCorretor, prefixo: 'corr' | 'corr_parceiro'): Ctx {
  if (prefixo === 'corr') {
    return { corr_creci: c.creci, corr_creci_validade: dataBR(c.creciValidade), corr_certidao_codigo: c.certidaoCodigo,
      corr_certidao_data: dataBR(c.certidaoEmissao), corr_certidao_validade: dataBR(c.certidaoValidade) };
  }
  return {
    corr_parceiro: true, corr_parceiro_nome: c.nome.toUpperCase(), corr_parceiro_cpf: docMascara(c.cpf),
    corr_parceiro_creci: `${c.creciUf} ${c.creci}`.trim(), corr_parceiro_creci_validade: dataBR(c.creciValidade),
    corr_parceiro_certidao_codigo: c.certidaoCodigo, corr_parceiro_certidao_validade: dataBR(c.certidaoValidade),
    corr_parceiro_resumo: ` · parceiro(a): ${c.nome}, CRECI/${`${c.creciUf} ${c.creci}`.trim()}`,
  };
}

/**
 * Corretor intermediador (o parceiro, se houver; senão o corretor responsável) e a parte dele na corretagem
 * (2% do valor da venda), paga no ato do sinal — o que o cliente vê na cláusula 19.1.2 e no Contrato de
 * Intermediação. Nunca expõe o percentual nem o valor da administradora.
 */
export function tagsIntermediacao(e: Pick<EntradaContexto, 'corretor' | 'parceiro' | 'plano'>): Ctx {
  const c = e.parceiro ?? e.corretor;
  const s = e.plano;
  const pctCorretor = s.comissao_corretor_percentual ?? 0.02;
  const base = s.modalidade === 'avista' ? s.total_pagar : s.preco_tabela;
  const valor = Math.round(base * pctCorretor * 100) / 100;
  return {
    intermed_nome: (c.nome || '').toUpperCase(), intermed_cpf: docMascara(c.cpf),
    intermed_creci: [c.creciUf, c.creci].filter(Boolean).join(' '), intermed_creci_validade: dataBR(c.creciValidade),
    intermed_comissao_pct: pct(pctCorretor, 0), intermed_comissao_valor: brl(valor), intermed_comissao_extenso: reaisExtenso(valor),
    intermed_base_valor: brl(base),
  };
}

/** Recebedor dos pagamentos (Cláusula 4ª): vem da conta Asaas, nunca fixo no modelo; sem conta, a minuta avisa e o definitivo bloqueia */
export function tagsRecebedor(r: EntradaContexto['recebedor']): Ctx {
  const d = String(r?.cpfCnpj ?? '').replace(/\D/g, '');
  const doc = d.length === 14 ? `CNPJ ${d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}` : d.length === 11 ? `CPF ${d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : '';
  if (!r?.nome) return { pag_recebedor_nome: '[CONTA DE RECEBIMENTO A CONFIGURAR]', pag_recebedor_doc: 'documento a informar', pag_recebedor_configurado: '' };
  return { pag_recebedor_nome: r.nome.toUpperCase(), pag_recebedor_doc: doc || 'documento a informar', pag_recebedor_configurado: 'sim' };
}

export function montarContexto(e: EntradaContexto): Ctx {
  const emp = { ...e.juridico.defaults, ...(e.overrides ?? {}) } as Record<string, unknown>;
  const l = e.lote;
  const ctx: Ctx = {
    ...(emp as Ctx), ...(e.juridico.vendedora as Ctx),
    vend_pf: e.juridico.vendedoraTipo === 'PF', vend_pj: e.juridico.vendedoraTipo === 'PJ',
    ctr_numero: e.contrato.numero, ctr_versao_modelo: e.plano.modalidade === 'financiado' && e.plano.condicao && e.plano.condicao !== 'padrao' ? `${e.juridico.modeloVersao} · ${tituloCondicao(e.plano)}` : e.juridico.modeloVersao, ctr_codigo_verificacao: e.contrato.codigoVerificacao,
    ctr_data_extenso: dataExtenso(e.contrato.dataGeracao),
    ctr_parcelas_minimas_obra: '3', ctr_condicoes_especificas: 'Não há.',
    ...tagsRecebedor(e.recebedor),
    lote_codigo: l.codigo, lote_quadra: l.quadra ?? '', lote_numero: l.numero != null ? String(l.numero).padStart(2, '0') : '',
    lote_area_m2: brl(l.areaM2), lote_area_extenso: areaExtenso(l.areaM2), lote_perimetro_m: brl(l.perimetroM),
    lote_descricao: l.descricao, lote_via_frente: l.viaFrente, lote_matricula: l.matricula,
    ...tagsPlano(e.plano),
    com_beneficiario: String(emp.com_beneficiario ?? COM_BENEFICIARIO_PADRAO),
    ...tagsPessoas(e.comprador, e.conjuge, e.comprador2),
    ...tagsCorretor(e.corretor, 'corr'),
    corr_parceiro: false, corr_parceiro_resumo: '',
    ...(e.parceiro ? tagsCorretor(e.parceiro, 'corr_parceiro') : {}),
    ...tagsIntermediacao(e),
    assinatura_manuscrita: e.contrato.modoAssinatura === 'manuscrita',
    ctr_taxa_cessao: emp.emp_salario_minimo ? brl(Number(String(emp.emp_salario_minimo).replace(/\./g, '').replace(',', '.'))) : '',
    ...(e.condicionantes ?? {}),
  };
  return ctx;
}
