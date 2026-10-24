/**
 * Plano de pagamento do contrato — adaptador do simulador (shared/simulador.ts, fonte da verdade dos valores)
 * para o snapshot gravado em contratos.simulacaoJson, que alimenta o Quadro-Resumo, o Anexo II e as cobranças.
 *
 * Parcelas fixas: as 120 (ou 12/24/36/60) parcelas do saldo saem todas com o valor do simulador e a última
 * acerta só a divisão juros/amortização para zerar o saldo. Assim o total a pagar do contrato é exatamente
 * o que o cliente viu no simulador e na proposta (entrada + parcela × prazo).
 */
import { comissao, r2, vencimento, type CondicoesPagamento, type Simulacao } from '../../shared/simulador';

export type Modalidade = 'financiado' | 'avista';

export interface EscolhaPlano {
  /** financiado = entrada (à vista com desconto ou 2..6×) + saldo pela Price; avista = lote pago todo de uma vez */
  modalidade: Modalidade;
  /** Prazo do saldo (meses) — só no financiado */
  prazo?: number;
  /** Vencimento do 1º pagamento (entrada ou parcela única), "AAAA-MM-DD" */
  dataPrimeiroPagamento: string;
}

export interface ParcelaPlano {
  tipo: 'entrada' | 'saldo' | 'avista';
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
  parcelas: ParcelaPlano[];
}

export function planoDoContrato(sim: Simulacao, escolha: EscolhaPlano, c: CondicoesPagamento, comCorretor: boolean): PlanoContrato {
  const d1 = escolha.dataPrimeiroPagamento;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1)) throw new Error('Data do 1º pagamento inválida (AAAA-MM-DD)');
  const base = {
    area_m2: sim.areaM2, preco_tabela: sim.preco, preco_avista: sim.avistaTotal.valor, desconto_avista_total: sim.avistaTotal.desconto,
    taxa_aa: c.jurosAaEfetivo, taxa_am: sim.taxaMensal, comissao_percentual: c.comissaoTotalPct,
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

  const plano = sim.planos.find(p => p.prazo === escolha.prazo);
  if (!plano) throw new Error(`Prazo de ${escolha.prazo} meses não está nas condições do empreendimento`);
  const nEnt = sim.parcelasEntrada.length;
  const parcelas: ParcelaPlano[] = sim.parcelasEntrada.map((v, k) => ({
    tipo: 'entrada', numero: k + 1, total: nEnt, vencimento: vencimento(d1, k), valor: v, juros: 0, amortizacao: v, saldoDevedor: sim.saldo,
  }));
  let saldo = sim.saldo;
  for (let k = 1; k <= plano.prazo; k++) {
    const ultima = k === plano.prazo;
    const juros = ultima ? r2(plano.parcela - saldo) : r2(saldo * sim.taxaMensal);
    const amortizacao = ultima ? saldo : r2(plano.parcela - juros);
    saldo = ultima ? 0 : r2(saldo - amortizacao);
    parcelas.push({ tipo: 'saldo', numero: k, total: plano.prazo, vencimento: vencimento(d1, nEnt + k - 1), valor: plano.parcela, juros, amortizacao, saldoDevedor: saldo });
  }
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
