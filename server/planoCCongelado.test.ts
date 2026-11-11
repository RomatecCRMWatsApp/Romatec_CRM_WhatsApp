import { describe, expect, it } from 'vitest';
import { planoCondicao, cronograma, prazosDaCondicao, textoCondicao } from '../shared/condicoesLancamento';
import { blocosDoCarne } from './financeiro/dados';
import { tagsModoC } from './contratos/contexto';
import { planoEscolhido } from './contratos/servico';

const c: any = { precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 };

describe('Plano C com o complemento da entrada congelado (gestão)', () => {
  const prazo = prazosDaCondicao('C', c)[0];

  it('R$ 10 mil no ato, saldo a partir do mês 1 e o complemento (36× ≈ R$ 1.055,56) só a partir do mês 15', () => {
    const p = planoCondicao(160000, 'C', prazo, c, 1, 'congelado', 15);
    expect(p.modoC).toBe('congelado');
    expect(p.entradaAto).toBe(10000);
    expect(p.complemento).toMatchObject({ total: 38000, qtd: Math.min(36, prazo) });
    const l = cronograma(p);
    const comp = l.filter(x => x.tipo === 'complemento'), saldo = l.filter(x => x.tipo === 'saldo');
    expect(saldo[0].mes).toBe(1);
    expect(comp[0].mes).toBe(15);
    expect(comp[0].parcela).toBeCloseTo(38000 / comp.length, 0);
    expect(comp.reduce((s, x) => s + x.parcela, 0)).toBeCloseTo(38000, 2);
    expect(textoCondicao(p)).toMatch(/a partir do 15º mês, em carnê à parte/);
    expect(() => planoCondicao(160000, 'C', prazo, c, 1, 'congelado', 1)).toThrow(/entre 2 e 60/);
  });

  it('contrato: complemento em boletos próprios (não somados à parcela) e carnês à parte depois dos do saldo', () => {
    const plano = planoEscolhido({ modalidade: 'financiado', entradaParcelas: 1, prazo, dataPrimeiroPagamento: '2026-11-20', condicao: 'C', modoC: 'congelado', inicioComplemento: 15 }, 3025.11, 160000, c, true);
    expect(plano.complemento_modo).toBe('congelado');
    expect(plano.complemento_inicio_mes).toBe(15);
    expect(plano.complemento_venc1).toBe('2028-02-20');
    expect(plano.parcelas.some(x => x.complemento)).toBe(false); // nada somado à parcela do saldo
    const blocos = blocosDoCarne(plano.parcelas.map(x => ({ ...x })));
    const primeiroComp = blocos.findIndex(b => b.some(x => x.tipo === 'complemento'));
    expect(blocos[0][0].tipo).toBe('entrada');
    expect(blocos.slice(0, primeiroComp).every(b => b.every(x => x.tipo !== 'complemento'))).toBe(true);
    expect(blocos.slice(primeiroComp).every(b => b.every(x => x.tipo === 'complemento'))).toBe(true);
    const t = tagsModoC(plano);
    expect(t.plano_c_cobranca).toMatch(/a partir do 15º \(quinze\)?.*mês .*em carnê próprio/);
    expect(t.plano_c_forma).toMatch(/congelado, sem juros nem correção/);
  });
});
