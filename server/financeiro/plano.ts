/**
 * Plano de amortização do contrato (Bloco Financeiro v1.0): entrada sem juros + saldo pela Tabela Price.
 * A parcela do saldo é fixa; a última só acerta juros/amortização para zerar o saldo.
 * Cada linha vira uma cobrança (cobrancas.jurosParcela / amortizacao / saldoDevedor = saldo após).
 */
import { parcelaPrice, r2, vencimento } from '../../shared/simulador';

/** Taxa mensal equivalente aos juros efetivos anuais: (1 + a.a.)^(1/12) − 1 */
export const taxaMensal = (aa: number) => Math.pow(1 + aa, 1 / 12) - 1;

export interface LinhaPlano {
  tipo: 'entrada' | 'saldo';
  numero: number;
  total: number;
  vencimento: string;
  valor: number;
  juros: number;
  amortizacao: number;
  /** Saldo devedor depois de pagar esta parcela (entrada: o saldo a financiar) */
  saldoApos: number;
}

export interface EntradaPlano {
  saldo: number;
  meses: number;
  taxaAA: number;
  /** Vencimento da 1ª parcela do saldo (AAAA-MM-DD) */
  primeiraSaldo: string;
  entrada?: { parcelas: number[] | number; valor?: number; primeira: string } | null;
}

/**
 * gerarPlano({ saldo: 112000, meses: 120, taxaAA: 0.06, primeiraSaldo, entrada: { parcelas: 6, valor: 8000, primeira } })
 * entrada.parcelas aceita a lista de valores (entrada dividida com acerto na última) ou a quantidade (com entrada.valor cada).
 */
export function gerarPlano(e: EntradaPlano): { pmt: number; taxaMensal: number; linhas: LinhaPlano[] } {
  const i = taxaMensal(e.taxaAA);
  const pmt = parcelaPrice(e.saldo, e.meses, i);
  const linhas: LinhaPlano[] = [];
  if (e.entrada) {
    const valores = Array.isArray(e.entrada.parcelas) ? e.entrada.parcelas : Array.from({ length: e.entrada.parcelas }, () => e.entrada!.valor ?? 0);
    valores.forEach((v, k) => linhas.push({
      tipo: 'entrada', numero: k + 1, total: valores.length, vencimento: vencimento(e.entrada!.primeira, k), valor: v, juros: 0, amortizacao: v, saldoApos: e.saldo,
    }));
  }
  let saldo = e.saldo;
  for (let k = 1; k <= e.meses; k++) {
    const ultima = k === e.meses;
    const juros = ultima ? r2(pmt - saldo) : r2(saldo * i);
    const amortizacao = ultima ? saldo : r2(pmt - juros);
    saldo = ultima ? 0 : r2(saldo - amortizacao);
    linhas.push({ tipo: 'saldo', numero: k, total: e.meses, vencimento: vencimento(e.primeiraSaldo, k - 1), valor: pmt, juros, amortizacao, saldoApos: saldo });
  }
  return { pmt, taxaMensal: i, linhas };
}
