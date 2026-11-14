/**
 * Plano de pagamento do contrato — adaptador do simulador (shared/simulador.ts, fonte da verdade dos valores)
 * para o snapshot gravado em contratos.simulacaoJson, que alimenta o Quadro-Resumo, o Anexo II e as cobranças.
 *
 * Parcelas fixas: as 120 (ou 12/24/36/60) parcelas do saldo saem todas com o valor do simulador e a última
 * acerta só a divisão juros/amortização para zerar o saldo. Assim o total a pagar do contrato é exatamente
 * o que o cliente viu no simulador e na proposta (entrada + parcela × prazo).
 */
import { comissao, r2, vencimento, type CondicoesPagamento, type Simulacao } from '../../shared/simulador';
import { cronograma, planoCondicao, ROTULO_CONDICAO, type CondicaoPagamento, type ModoPlanoC } from '../../shared/condicoesLancamento';
import { gerarPlano } from '../financeiro/plano';

export type Modalidade = 'financiado' | 'avista';

export interface EscolhaPlano {
  /** financiado = entrada (à vista com desconto ou 2..6×) + saldo pela Price; avista = lote pago todo de uma vez */
  modalidade: Modalidade;
  /** Prazo do saldo (meses) — só no financiado */
  prazo?: number;
  /** Vencimento do 1º pagamento (entrada ou parcela única), "AAAA-MM-DD" */
  dataPrimeiroPagamento: string;
  /** Forma de pagamento do financiado: entrada 30% (padrão) ou condições de lançamento A, B, C */
  condicao?: CondicaoPagamento;
  /** Plano C: 'unificado' (complemento + parcela no mesmo boleto, padrão), 'sequencial' (complemento antes do saldo)
   *  ou 'congelado' (só a gestão: complemento a partir do mês inicioComplemento, em carnê à parte) */
  modoC?: ModoPlanoC;
  /** Plano C congelado: mês do 1º vencimento do complemento, contado do ato */
  inicioComplemento?: number;
  /** Planos A/B/C: entrada do ato em parcela única (padrão) ou dividida — metade boleto/PIX e metade cartão de crédito */
  entradaForma?: FormaEntrada;
  /** Planos A/B/C: 1º vencimento das parcelas (AAAA-MM-DD) — ausente = um mês depois do ato. As demais seguem mês a mês */
  inicioParcelas?: string;
  /** Planos A/B: sinal (entrada de R$ 10 mil) em N parcelas mensais sem juros (1 = à vista no ato); o saldo começa depois */
  sinalParcelas?: number;
  /** Só o administrador: valor fixo da parcela do saldo (desconto sobre a de tabela); a taxa efetiva é recalculada */
  parcelaPersonalizada?: number;
}

export const MAX_SINAL_PARCELAS = 6;

export type FormaEntrada = 'unica' | 'boleto_cartao';

export interface ParcelaPlano {
  /** reforco = reforço anual (Plano A); complemento = resto da entrada sem juros (Plano C) */
  tipo: 'entrada' | 'saldo' | 'avista' | 'reforco' | 'complemento';
  /** Nº dentro do tipo (1..n) */
  numero: number;
  total: number;
  vencimento: string;
  valor: number;
  juros: number;
  amortizacao: number;
  saldoDevedor: number;
  /** Forma combinada para esta cobrança: 'cartao' = link de pagamento no cartão de crédito (entrada dividida) */
  forma?: 'cartao';
  /** Plano C unificado: parte do valor que é do complemento da entrada (nº `complementoNumero` de `complementoTotal`) */
  complemento?: number;
  complementoNumero?: number;
  complementoTotal?: number;
}

/** Snapshot do plano (nomes do spec, em snake_case, porque viram tags plano_* no merge) */
export interface PlanoContrato {
  modalidade: Modalidade;
  area_m2: number;
  preco_tabela: number;
  /** Preço do lote pago todo de uma vez (preço − desconto do à vista total) */
  preco_avista: number;
  desconto_avista_total: number;
  avista_vencimento: string;
  entrada_valor: number;
  entrada_percentual: number;
  entrada_qtd: number;
  entrada_parcela: number;
  entrada_desconto: number;
  entrada_venc1: string;
  saldo_valor: number;
  saldo_qtd: number;
  saldo_parcela: number;
  saldo_venc1: string;
  taxa_aa: number;
  taxa_am: number;
  total_pagar: number;
  total_juros: number;
  comissao_total: number;
  comissao_percentual: number;
  comissao_corretor: number;
  comissao_romatec: number;
  /** % do corretor intermediador sobre o valor da venda (2%) — o que o cliente vê no Contrato de Intermediação */
  comissao_corretor_percentual?: number;
  /** Forma de pagamento (ausente = padrão: contratos anteriores aos planos de lançamento) */
  condicao?: CondicaoPagamento;
  /** Plano A: reforços anuais */
  reforco_qtd?: number;
  reforco_valor?: number;
  reforco_venc1?: string;
  /** Plano C: valor do ato e complemento da entrada sem juros */
  complemento_ato?: number;
  complemento_valor?: number;
  complemento_qtd?: number;
  complemento_parcela?: number;
  complemento_venc1?: string;
  /** Plano C: forma do complemento (ausente = unificado nos contratos novos; os anteriores tinham boletos separados) */
  complemento_modo?: ModoPlanoC;
  /** Plano C congelado: mês do 1º vencimento do complemento, contado do ato */
  complemento_inicio_mes?: number;
  /** Entrada dividida no ato: parte no boleto/PIX e parte no cartão de crédito */
  entrada_forma?: FormaEntrada;
  entrada_boleto?: number;
  entrada_cartao?: number;
  /** 1º vencimento das parcelas escolhido no contrato (AAAA-MM-DD) */
  parcelas_inicio?: string;
  /** Sinal da entrada em parcelas mensais (Planos A/B) */
  sinal_parcelado?: boolean;
  /** Parcela do saldo fixada pelo administrador: a de tabela fica registrada */
  parcela_personalizada?: boolean;
  parcela_tabela?: number;
  parcelas: ParcelaPlano[];
  /** Concessão por liberalidade da proprietária (sem venda): sem cobranças, fora do faturamento, com Termo Aditivo */
  concessao?: ConcessaoProprietaria;
}

/** Unidade concedida pela proprietária a terceiro indicado por ela (shared/concessao.ts) */
export interface ConcessaoProprietaria {
  motivo: string;
  /** Comissão de gestão devida pela proprietária à gestora (padrão: % total sobre o preço de tabela) */
  comissaoValor: number;
  /** Forma/observação do pagamento da comissão (texto do termo) */
  comissaoPrazo: string;
  /** Vencimento da comissão (AAAA-MM-DD): vai no termo e no Financeiro; editável no contrato */
  comissaoVencimento?: string;
  /** Quem paga escritura, registro e ITCMD */
  despesasPor: 'beneficiario' | 'proprietaria';
}

export function planoDoContrato(sim: Simulacao, escolha: EscolhaPlano, c: CondicoesPagamento, comCorretor: boolean): PlanoContrato {
  const d1 = escolha.dataPrimeiroPagamento;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1)) throw new Error('Data do 1º pagamento inválida (AAAA-MM-DD)');
  const base = {
    area_m2: sim.areaM2, preco_tabela: sim.preco, preco_avista: sim.avistaTotal.valor, desconto_avista_total: sim.avistaTotal.desconto,
    taxa_aa: c.jurosAaEfetivo, taxa_am: sim.taxaMensal, comissao_percentual: c.comissaoTotalPct,
    comissao_corretor_percentual: c.comissaoCorretorPct,
  };

  if (escolha.modalidade === 'avista') {
    const valor = sim.avistaTotal.valor;
    const com = comissao(valor, comCorretor, true, c);
    return {
      ...base, modalidade: 'avista', avista_vencimento: d1,
      entrada_valor: 0, entrada_percentual: 0, entrada_qtd: 0, entrada_parcela: 0, entrada_desconto: 0, entrada_venc1: '',
      saldo_valor: 0, saldo_qtd: 0, saldo_parcela: 0, saldo_venc1: '',
      total_pagar: valor, total_juros: 0,
      comissao_total: com.total, comissao_corretor: com.corretor, comissao_romatec: com.romatec,
      parcelas: [{ tipo: 'avista', numero: 1, total: 1, vencimento: d1, valor, juros: 0, amortizacao: valor, saldoDevedor: 0 }],
    };
  }

  if (escolha.condicao && escolha.condicao !== 'padrao') return planoDeLancamento(sim, escolha, c, comCorretor, base);

  const plano = sim.planos.find(p => p.prazo === escolha.prazo);
  if (!plano) throw new Error(`Prazo de ${escolha.prazo} meses não está nas condições do empreendimento`);
  const nEnt = sim.parcelasEntrada.length;
  const { linhas } = gerarPlano({
    saldo: sim.saldo, meses: plano.prazo, taxaAA: c.jurosAaEfetivo, primeiraSaldo: vencimento(d1, nEnt),
    entrada: { parcelas: sim.parcelasEntrada, primeira: d1 },
  });
  const parcelas: ParcelaPlano[] = linhas.map(({ saldoApos, ...l }) => ({ ...l, saldoDevedor: saldoApos }));
  const com = comissao(sim.preco, comCorretor, nEnt === 1, c);
  return {
    ...base, modalidade: 'financiado', avista_vencimento: '',
    entrada_valor: sim.entradaEfetiva, entrada_percentual: c.entradaPct, entrada_qtd: nEnt,
    entrada_parcela: sim.parcelasEntrada[0], entrada_desconto: nEnt === 1 ? sim.descontoAvista : 0, entrada_venc1: d1,
    saldo_valor: sim.saldo, saldo_qtd: plano.prazo, saldo_parcela: plano.parcela, saldo_venc1: vencimento(d1, nEnt),
    total_pagar: plano.totalPago, total_juros: plano.juros,
    comissao_total: com.total, comissao_corretor: com.corretor, comissao_romatec: com.romatec,
    parcelas,
  };
}

/**
 * Planos de lançamento (A, B, C — shared/condicoesLancamento.ts): entrada no ato (dataPrimeiroPagamento) e as parcelas
 * do cronograma (saldo pela Price; reforços anuais no A; complemento da entrada sem juros no C) a partir do mês seguinte.
 * A corretagem é retida integralmente no ato (entrada em parcela única).
 */
function planoDeLancamento(sim: Simulacao, escolha: EscolhaPlano, c: CondicoesPagamento, comCorretor: boolean,
  base: Pick<PlanoContrato, 'area_m2' | 'preco_tabela' | 'preco_avista' | 'desconto_avista_total' | 'taxa_aa' | 'taxa_am' | 'comissao_percentual' | 'comissao_corretor_percentual'>): PlanoContrato {
  const cond = escolha.condicao as Exclude<CondicaoPagamento, 'padrao'>;
  const d1 = escolha.dataPrimeiroPagamento;
  let pc;
  try { pc = planoCondicao(sim.preco, cond, Number(escolha.prazo), c, 1, cond === 'C' ? escolha.modoC ?? 'unificado' : 'unificado', escolha.inicioComplemento); }
  catch (e: any) { throw new Error(e?.message || 'Condição de pagamento inválida'); }
  // 1º vencimento das parcelas: mês 1 do cronograma cai na data escolhida e o resto segue mês a mês (sem juros extras)
  const ini = escolha.inicioParcelas;
  if (ini != null && ini !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) throw new Error('1º vencimento das parcelas inválido (AAAA-MM-DD)');
    if (ini <= d1) throw new Error('O 1º vencimento das parcelas tem que ser depois do pagamento da entrada');
  }
  // Sinal parcelado (Planos A/B): N parcelas mensais da entrada; sem data escolhida, o saldo começa no mês seguinte à última
  const nSinal = Math.max(1, Math.floor(Number(escolha.sinalParcelas) || 1));
  if (nSinal > 1) {
    if (cond === 'C') throw new Error('No Plano C a entrada já é parcelada pelo complemento: o sinal parcelado vale para os Planos A e B');
    if (escolha.entradaForma === 'boleto_cartao') throw new Error('Escolha uma forma só: sinal parcelado ou entrada dividida boleto/cartão');
    if (nSinal > MAX_SINAL_PARCELAS) throw new Error(`Sinal em até ${MAX_SINAL_PARCELAS} parcelas`);
    if (ini && ini <= vencimento(d1, nSinal - 1)) throw new Error('O 1º vencimento das parcelas tem que ser depois da última parcela do sinal');
  }
  const venc = (mes: number) => (mes >= 1 && ini ? vencimento(ini, mes - 1) : vencimento(d1, mes >= 1 ? mes + nSinal - 1 : mes));
  let parcelas: ParcelaPlano[] = cronograma(pc).map(l => ({
    tipo: l.tipo, numero: l.numero, total: l.total, vencimento: venc(l.mes), valor: l.parcela, juros: l.juros, amortizacao: l.amortizacao, saldoDevedor: l.saldoDevedor,
  }));
  if (nSinal > 1) {
    const e = parcelas.find(p => p.tipo === 'entrada')!;
    const base = Math.floor((e.valor / nSinal) * 100) / 100;
    const sinal: ParcelaPlano[] = Array.from({ length: nSinal }, (_, k) => {
      const v = k === nSinal - 1 ? r2(e.valor - base * (nSinal - 1)) : base;
      return { ...e, numero: k + 1, total: nSinal, vencimento: vencimento(d1, k), valor: v, amortizacao: v };
    });
    parcelas = [...sinal, ...parcelas.filter(p => p.tipo !== 'entrada')];
  }
  // Entrada dividida: o ato vira duas cobranças no mesmo dia — nº 1 boleto/PIX e nº 2 cartão de crédito
  const dividida = escolha.entradaForma === 'boleto_cartao';
  let entradaBoleto = pc.entradaAto, entradaCartao = 0;
  if (dividida) {
    const e = parcelas.find(p => p.tipo === 'entrada');
    if (!e || e.valor < 2) throw new Error('Entrada sem valor para dividir');
    entradaBoleto = Math.round(e.valor * 50) / 100;
    entradaCartao = Math.round((e.valor - entradaBoleto) * 100) / 100;
    parcelas = parcelas.flatMap(p => p.tipo !== 'entrada' ? [p] : [
      { ...p, numero: 1, total: 2, valor: entradaBoleto, amortizacao: entradaBoleto },
      { ...p, numero: 2, total: 2, valor: entradaCartao, amortizacao: entradaCartao, forma: 'cartao' as const },
    ]);
  }
  const unificado = cond === 'C' && pc.complemento && pc.modoC === 'unificado';
  if (unificado) parcelas = unificarComplemento(parcelas);
  // Parcela personalizada (administrador): recalcula juros/amortização à taxa efetiva que a parcela fixada implica
  const pers = escolha.parcelaPersonalizada != null ? personalizarParcelas(parcelas, pc.saldoFinanciado, Number(escolha.parcelaPersonalizada), !!pc.reforco || !!pc.complemento) : null;
  if (pers) parcelas = pers.parcelas;
  const com = comissao(sim.preco, comCorretor, true, c);
  const primeiroReforco = parcelas.find(p => p.tipo === 'reforco');
  const primeiroComp = parcelas.find(p => p.tipo === 'complemento');
  return {
    ...base, modalidade: 'financiado', avista_vencimento: '', condicao: cond,
    entrada_valor: pc.entradaTotal, entrada_percentual: pc.entradaTotal / sim.preco, entrada_qtd: dividida ? 2 : nSinal,
    entrada_parcela: dividida ? entradaBoleto : nSinal > 1 ? parcelas.find(p => p.tipo === 'entrada')!.valor : pc.entradaAto, entrada_desconto: 0, entrada_venc1: d1,
    ...(nSinal > 1 ? { sinal_parcelado: true } : {}),
    ...(dividida ? { entrada_forma: 'boleto_cartao' as const, entrada_boleto: entradaBoleto, entrada_cartao: entradaCartao } : {}),
    ...(ini ? { parcelas_inicio: ini } : {}),
    saldo_valor: pc.saldoFinanciado, saldo_qtd: pc.prazo, saldo_parcela: pers ? pers.parcela : pc.parcela, saldo_venc1: parcelas.find(p => p.tipo === 'saldo')?.vencimento ?? vencimento(d1, 1),
    total_pagar: pers ? r2(pc.entradaTotal + pers.parcela * pc.prazo) : pc.totalPago, total_juros: pers ? r2(pc.entradaTotal + pers.parcela * pc.prazo - sim.preco) : pc.juros,
    ...(pers ? { parcela_personalizada: true, parcela_tabela: pc.parcela, taxa_am: pers.taxaMensal, taxa_aa: r2((Math.pow(1 + pers.taxaMensal, 12) - 1) * 1e6) / 1e6 } : {}),
    comissao_total: com.total, comissao_corretor: com.corretor, comissao_romatec: com.romatec,
    ...(pc.reforco ? { reforco_qtd: pc.reforco.qtd, reforco_valor: pc.reforco.valor, reforco_venc1: primeiroReforco?.vencimento ?? '' } : {}),
    ...(pc.complemento ? {
      complemento_ato: pc.entradaAto, complemento_valor: pc.complemento.total, complemento_qtd: pc.complemento.qtd,
      complemento_parcela: pc.complemento.parcela, complemento_modo: pc.modoC ?? 'unificado',
      ...(pc.modoC === 'congelado' ? { complemento_inicio_mes: pc.inicioComplemento } : {}),
      complemento_venc1: primeiroComp?.vencimento ?? parcelas.find(p => p.complemento)?.vencimento ?? '',
    } : {}),
    parcelas,
  };
}

/**
 * Plano C unificado: cada parcela do complemento entra na parcela do saldo do mesmo mês — um boleto só por mês
 * (valor = parcela + complemento). Juros e saldo devedor continuam os da Price; a amortização soma a parte do complemento.
 */
export function unificarComplemento(parcelas: ParcelaPlano[]): ParcelaPlano[] {
  const comps = new Map(parcelas.filter(p => p.tipo === 'complemento').map(p => [p.vencimento, p]));
  const usados = new Set<string>();
  const out = parcelas.filter(p => p.tipo !== 'complemento').map(p => {
    const c = p.tipo === 'saldo' ? comps.get(p.vencimento) : undefined;
    if (!c) return p;
    usados.add(p.vencimento);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { ...p, valor: r2(p.valor + c.valor), amortizacao: r2(p.amortizacao + c.valor), complemento: c.valor, complementoNumero: c.numero, complementoTotal: c.total };
  });
  // Segurança: complemento sem parcela do saldo no mesmo mês continua avulso
  const soltos = parcelas.filter(p => p.tipo === 'complemento' && !usados.has(p.vencimento));
  return soltos.length ? [...out, ...soltos].sort((a, b) => a.vencimento.localeCompare(b.vencimento)) : out;
}

/** "Saldo 1/120 + Complemento da entrada 1/36" (Plano C unificado) — rótulo do boleto */
export const rotuloComComplemento = (base: string, p: Pick<ParcelaPlano, 'complementoNumero' | 'complementoTotal'> | undefined) =>
  p?.complementoNumero ? `${base} + Complemento da entrada ${p.complementoNumero}/${p.complementoTotal}` : base;

/** Título da forma de pagamento do contrato ("Plano A — Plano 13º"); padrão = entrada de 30% */
export const tituloCondicao = (p: Pick<PlanoContrato, 'condicao'>) => ROTULO_CONDICAO[p.condicao ?? 'padrao'].titulo;

/** Modelo do CPCV da forma de pagamento: o v3 é o da entrada de 30%; os planos têm modelo próprio (…-PLANO-A.docx) */
export function modeloDaCondicao(modeloBase: string, condicao: CondicaoPagamento | undefined | null): string {
  if (!condicao || condicao === 'padrao') return modeloBase;
  return modeloBase.replace(/\.docx$/i, `-PLANO-${condicao}.docx`);
}


/**
 * Parcela do saldo fixada pelo administrador (desconto sobre a de tabela): todas as parcelas do saldo passam a ter o valor
 * escolhido; a taxa efetiva mensal é a que faz as parcelas pagarem exatamente o saldo financiado (Price). Se a parcela
 * não cobre nem o saldo sem juros, a taxa fica 0 e a diferença é desconto no preço. Só para saldo sem reforço/complemento.
 */
export function personalizarParcelas(parcelas: ParcelaPlano[], saldo: number, valor: number, temExtras: boolean): { parcelas: ParcelaPlano[]; parcela: number; taxaMensal: number } {
  if (temExtras) throw new Error('Parcela personalizada: disponível para o Plano B e para a entrada de 30% (sem reforço nem complemento)');
  const v = r2(valor);
  if (!(v > 0)) throw new Error('Informe o valor da parcela personalizada');
  const saldoRows = parcelas.filter(p => p.tipo === 'saldo');
  const n = saldoRows.length;
  if (!n) throw new Error('Plano sem parcelas de saldo');
  const tabela = saldoRows[0].valor;
  if (v > tabela + 0.005) throw new Error(`A parcela personalizada é um desconto: até R$ ${tabela.toFixed(2).replace('.', ',')} (a de tabela)`);
  // Taxa que zera o saldo com n parcelas de v (bisseção)
  const vp = (i: number) => (i === 0 ? v * n : v * (1 - Math.pow(1 + i, -n)) / i);
  let i = 0;
  if (vp(0) > saldo) {
    let lo = 0, hi = 0.1;
    for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (vp(m) > saldo) lo = m; else hi = m; }
    i = (lo + hi) / 2;
  }
  let s = i === 0 ? Math.min(saldo, v * n) : saldo;
  let k = 0;
  const out = parcelas.map(p => {
    if (p.tipo !== 'saldo') return p;
    k++;
    const juros = r2(s * i);
    let amort = r2(v - juros);
    if (k === n) amort = r2(s);
    s = r2(s - amort);
    return { ...p, valor: k === n ? r2(amort + juros) : v, juros, amortizacao: amort, saldoDevedor: Math.max(0, s) };
  });
  return { parcelas: out, parcela: v, taxaMensal: i };
}
