/**
 * Plano de pagamento do contrato — adaptador do simulador (shared/simulador.ts, fonte da verdade dos valores)
 * para o snapshot gravado em contratos.simulacaoJson, que alimenta o Quadro-Resumo, o Anexo II e as cobranças.
 *
 * Parcelas fixas: as 120 (ou 12/24/36/60) parcelas do saldo saem todas com o valor do simulador e a última
 * acerta só a divisão juros/amortização para zerar o saldo. Assim o total a pagar do contrato é exatamente
 * o que o cliente viu no simulador e na proposta (entrada + parcela × prazo).
 */
import { comissao, vencimento, type CondicoesPagamento, type Simulacao } from '../../shared/simulador';
import { cronograma, planoCondicao, ROTULO_CONDICAO, type CondicaoPagamento } from '../../shared/condicoesLancamento';
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
}

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
  parcelas: ParcelaPlano[];
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
  try { pc = planoCondicao(sim.preco, cond, Number(escolha.prazo), c); }
  catch (e: any) { throw new Error(e?.message || 'Condição de pagamento inválida'); }
  const parcelas: ParcelaPlano[] = cronograma(pc).map(l => ({
    tipo: l.tipo, numero: l.numero, total: l.total, vencimento: vencimento(d1, l.mes), valor: l.parcela, juros: l.juros, amortizacao: l.amortizacao, saldoDevedor: l.saldoDevedor,
  }));
  const com = comissao(sim.preco, comCorretor, true, c);
  const primeiroReforco = parcelas.find(p => p.tipo === 'reforco');
  const primeiroComp = parcelas.find(p => p.tipo === 'complemento');
  return {
    ...base, modalidade: 'financiado', avista_vencimento: '', condicao: cond,
    entrada_valor: pc.entradaTotal, entrada_percentual: pc.entradaTotal / sim.preco, entrada_qtd: 1,
    entrada_parcela: pc.entradaAto, entrada_desconto: 0, entrada_venc1: d1,
    saldo_valor: pc.saldoFinanciado, saldo_qtd: pc.prazo, saldo_parcela: pc.parcela, saldo_venc1: vencimento(d1, 1),
    total_pagar: pc.totalPago, total_juros: pc.juros,
    comissao_total: com.total, comissao_corretor: com.corretor, comissao_romatec: com.romatec,
    ...(pc.reforco ? { reforco_qtd: pc.reforco.qtd, reforco_valor: pc.reforco.valor, reforco_venc1: primeiroReforco?.vencimento ?? '' } : {}),
    ...(pc.complemento ? {
      complemento_ato: pc.entradaAto, complemento_valor: pc.complemento.total, complemento_qtd: pc.complemento.qtd,
      complemento_parcela: pc.complemento.parcela, complemento_venc1: primeiroComp?.vencimento ?? '',
    } : {}),
    parcelas,
  };
}

/** Título da forma de pagamento do contrato ("Plano A — Plano 13º"); padrão = entrada de 30% */
export const tituloCondicao = (p: Pick<PlanoContrato, 'condicao'>) => ROTULO_CONDICAO[p.condicao ?? 'padrao'].titulo;

/** Modelo do CPCV da forma de pagamento: o v3 é o da entrada de 30%; os planos têm modelo próprio (…-PLANO-A.docx) */
export function modeloDaCondicao(modeloBase: string, condicao: CondicaoPagamento | undefined | null): string {
  if (!condicao || condicao === 'padrao') return modeloBase;
  return modeloBase.replace(/\.docx$/i, `-PLANO-${condicao}.docx`);
}
