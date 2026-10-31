import { describe, expect, it } from 'vitest';
import { cronograma, desembolsoPorAno, planoCondicao, planosDaCondicao, prazosDaCondicao, textoCondicao, CONDICOES } from '../shared/condicoesLancamento';
import type { CondicoesPagamento } from '../shared/simulador';

const C: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const soma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe('condições de lançamento (entrada 30%, planos A, B e C)', () => {
  it('números aprovados na proposta (chácara de R$ 160 mil, 120 meses)', () => {
    const A = planoCondicao(160000, 'A', 120, C);
    expect(A).toMatchObject({ entradaAto: 10000, parcela: 1234.51, reforco: { valor: 5162.97, qtd: 10 } });  // PDF: R$ 5.162,98 (sobre a parcela sem arredondar)
    expect(Math.round(A.totalPago)).toBe(209771);
    const B = planoCondicao(160000, 'B', 180, C);
    expect(B.parcela).toBe(1252.94);
    const Cc = planoCondicao(160000, 'C', 120, C);
    expect(Cc).toMatchObject({ entradaAto: 10000, parcela: 1234.51, complemento: { total: 38000, qtd: 36, parcela: 1055.56 }, mensalInicial: 2290.07 });
    const P = planoCondicao(160000, 'padrao', 120, C, 2);
    expect(P).toMatchObject({ entradaTotal: 48000, parcela: 1234.51 });
    expect(textoCondicao(A).replace(/\s/g, ' ')).toBe('R$ 10.000,00 de entrada + 120× fixas de R$ 1.234,51 + 10 reforços anuais de R$ 5.162,97');
  });

  it('prazos: B ganha 180; os demais seguem 12, 24, 36, 60 e 120', () => {
    expect(prazosDaCondicao('A', C)).toEqual([12, 24, 36, 60, 120]);
    expect(prazosDaCondicao('B', C)).toEqual([12, 24, 36, 60, 120, 180]);
    expect(planosDaCondicao(160000, 'C', C).map(p => p.prazo)).toEqual([12, 24, 36, 60, 120]);
    expect(() => planoCondicao(160000, 'A', 180, C)).toThrow(/não está disponível/);
  });

  it('cronograma zera o saldo e soma o total a pagar, em todas as condições e prazos', () => {
    for (const cond of CONDICOES) for (const n of prazosDaCondicao(cond, C)) {
      const p = planoCondicao(166076.61, cond, n, C);
      const ls = cronograma(p);
      expect(ls[ls.length - 1].saldoDevedor).toBe(0);
      expect(Math.abs(soma(ls.map(l => l.parcela)) - p.totalPago)).toBeLessThan(0.05);
      expect(Math.abs(soma(desembolsoPorAno(p)) - p.totalPago)).toBeLessThan(0.05);
      if (cond === 'A') expect(ls.filter(l => l.tipo === 'reforco').map(l => l.mes)).toEqual(Array.from({ length: Math.floor(n / 12) }, (_, k) => 12 * (k + 1)));
      if (cond === 'C') expect(ls.filter(l => l.tipo === 'complemento')).toHaveLength(Math.min(36, n));
    }
  });

  it('desembolso do 1º ano: Plano A ≈ R$ 30 mil contra ≈ R$ 59,8 mil na entrada de 30% à vista', () => {
    expect(Math.round(desembolsoPorAno(planoCondicao(160000, 'A', 120, C))[0])).toBe(29977);
    expect(Math.round(desembolsoPorAno(planoCondicao(160000, 'padrao', 120, C, 1))[0])).toBe(59814);
  });
});

import { calcularTabela } from '../shared/tabelaFinanciamento';
import { LINKS_FIXOS, montarLink } from '../shared/linksDivulgacao';
import { metaDaRota } from './seo';

describe('planilha financeira e folder das formas de pagamento', () => {
  const base = { c: C, lotes: [{ codigo: 'A05', quadra: 'A', areaM2: 3025.11, preco: 160000, precoTabela: 160000, situacao: 'disponivel' }] };
  it('tabela do Plano B em 180× (prazo extra) e do padrão sem 180×', () => {
    const t = calcularTabela(base, { lote: 'A05', entrada: 1, prazo: 180, condicao: 'B' });
    expect(t).toMatchObject({ condicao: 'B', prazos: [12, 24, 36, 60, 120, 180], resumo: { parcela: 1252.94 } });
    expect(t.linhas[0]).toMatchObject({ tipo: 'entrada', parcela: 10000 });
    expect(t.linhas[t.linhas.length - 1].saldoDevedor).toBe(0);
    expect(() => calcularTabela(base, { lote: 'A05', entrada: 1, prazo: 180 })).toThrow(/não está disponível/);
    const a = calcularTabela(base, { lote: 'A05', entrada: 1, prazo: 120, condicao: 'A' });
    expect(a.linhas.filter(l => l.tipo === 'reforco')).toHaveLength(10);
  });
  it('link de divulgação do folder e meta da página', () => {
    const l = LINKS_FIXOS.find(x => x.chave === 'fixo:pagamento')!;
    expect(montarLink('https://romateccrm.com', l, 'ab12')).toBe('https://romateccrm.com/bom-jardims/formas-de-pagamento?utm_source=whatsapp&utm_campaign=BJ-PAGAMENTO&c=ab12');
    const m = metaDaRota('/bom-jardims/formas-de-pagamento');
    expect(m !== 'imovel' && m.path).toBe('/bom-jardims/formas-de-pagamento');
  });
});
