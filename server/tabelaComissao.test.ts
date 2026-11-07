import { describe, expect, it } from 'vitest';
import { tabelaComissao } from '../shared/tabelaComissao';

describe('tabela de comissão do corretor', () => {
  const linhas = tabelaComissao(100000, 90000, 0.02, 6);
  const por = (k: string) => linhas.find(l => l.chave === k)!;

  it('à vista: comissão integral no ato, sobre o valor à vista', () => {
    expect(por('avista').valor).toBe(1800);
    expect(por('avista').pagamentos).toEqual([{ quando: 'Pagamento à vista', pct: 1, valor: 1800 }]);
  });

  it('entrada de 30% à vista: integral na entrada; parcelada: 50% no 1º e 50% no 2º pagamento', () => {
    expect(por('entrada_avista').pagamentos.map(p => p.valor)).toEqual([2000]);
    expect(por('entrada_parcelada').pagamentos.map(p => p.valor)).toEqual([1000, 1000]);
    expect(por('entrada_parcelada').forma).toContain('2 a 6×');
  });

  it('planos A, B e C: 50% na entrada e 4 partes iguais da 1ª à 4ª parcela do saldo, somando o total', () => {
    for (const k of ['A', 'B', 'C']) {
      const l = por(k);
      expect(l.pagamentos.map(p => p.valor)).toEqual([1000, 250, 250, 250, 250]);
      expect(l.pagamentos.reduce((s, p) => s + p.valor, 0)).toBe(l.valor);
    }
  });

  it('arredondamento: as partes sempre fecham o total', () => {
    for (const l of tabelaComissao(123456.78, 111111.11, 0.02, 6)) {
      expect(Math.round(l.pagamentos.reduce((s, p) => s + p.valor, 0) * 100) / 100).toBe(l.valor);
    }
  });
});
