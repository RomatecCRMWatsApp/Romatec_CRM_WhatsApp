import { describe, expect, it } from 'vitest';
import { anosComPagamento, demonstrativoAnual, situacaoParcelas, type ParcelaPortal } from '../shared/demonstrativoPagamentos';

const p = (rotulo: string, vencimento: string, status: string, pagoEm: string | null, valor = 1234.51, valorPago: number | null = null, atraso = 0): ParcelaPortal =>
  ({ rotulo, vencimento, valor, status, pagoEm, valorPago, atraso });

const PARCELAS = [
  p('Entrada', '2026-11-14', 'paga', '2026-11-14T10:00:00Z', 10000, 10000),
  p('Parcela 1/120', '2026-12-14', 'paga', '2026-12-15', 1234.51, 1234.51),
  p('Parcela 2/120', '2027-01-14', 'paga', '2027-01-10', 1234.51, 1240.3),   // pago com encargos
  p('Parcela 3/120', '2027-02-14', 'pendente', null, 1234.51, null, 12),       // em atraso
  p('Parcela 4/120', '2027-03-14', 'pendente', null),
];

describe('situação das parcelas', () => {
  it('conta pagas, em atraso e a vencer', () => {
    expect(situacaoParcelas(PARCELAS)).toEqual({ pagas: 3, emAtraso: 1, aVencer: 1, total: 5, pctPago: 60 });
    expect(situacaoParcelas([])).toEqual({ pagas: 0, emAtraso: 0, aVencer: 0, total: 0, pctPago: 0 });
  });
});

describe('demonstrativo para o Imposto de Renda', () => {
  it('lista os anos com pagamento, do mais recente', () => {
    expect(anosComPagamento(PARCELAS)).toEqual([2027, 2026]);
  });
  it('usa a data do pagamento e o valor efetivamente pago', () => {
    const d26 = demonstrativoAnual(PARCELAS, 2026);
    expect(d26.itens.map(i => i.rotulo)).toEqual(['Entrada', 'Parcela 1/120']);
    expect(d26).toMatchObject({ totalNoAno: 11234.51, acumuladoAte31Dez: 11234.51, acumuladoAnoAnterior: 0 });
    const d27 = demonstrativoAnual(PARCELAS, 2027);
    expect(d27.itens).toEqual([{ rotulo: 'Parcela 2/120', vencimento: '2027-01-14', pagoEm: '2027-01-10', valor: 1240.3 }]);
    expect(d27).toMatchObject({ totalNoAno: 1240.3, acumuladoAte31Dez: 12474.81, acumuladoAnoAnterior: 11234.51 });
  });
  it('ano sem pagamento: lista vazia, acumulados mantidos', () => {
    expect(demonstrativoAnual(PARCELAS, 2028)).toMatchObject({ itens: [], totalNoAno: 0, acumuladoAte31Dez: 12474.81, acumuladoAnoAnterior: 12474.81 });
  });
});
