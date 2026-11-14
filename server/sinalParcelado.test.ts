import { describe, expect, it } from 'vitest';
import { simular } from '../shared/simulador';
import { gatilhosDoPlano } from '../shared/repasseComissao';
import { foraDoPadrao } from '../shared/autorizacaoPlano';
import { planoDoContrato } from './contratos/plano';
import { notaParcelaPersonalizada, tagsPlano } from './contratos/contexto';
import { splitDaComissao } from './financeiro/emissao';

// Sinal da entrada parcelado (Planos A/B) e parcela do saldo personalizada pelo administrador. Dados fictícios.
const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const sim = simular(3025.11, 1, C);
const base = { modalidade: 'financiado' as const, prazo: 180, condicao: 'B' as const, dataPrimeiroPagamento: '2026-11-20' };

describe('sinal parcelado (Planos A/B)', () => {
  const p = planoDoContrato(sim, { ...base, sinalParcelas: 4 }, C, true);
  const padrao = planoDoContrato(sim, base, C, true);

  it('a entrada de R$ 10 mil vira 4 parcelas mensais de R$ 2.500 a partir do ato', () => {
    const ent = p.parcelas.filter(x => x.tipo === 'entrada');
    expect(ent.map(x => [x.numero, x.total, x.valor, x.vencimento])).toEqual([
      [1, 4, 2500, '2026-11-20'], [2, 4, 2500, '2026-12-20'], [3, 4, 2500, '2027-01-20'], [4, 4, 2500, '2027-02-20'],
    ]);
    expect(p).toMatchObject({ entrada_qtd: 4, entrada_parcela: 2500, entrada_valor: 10000, sinal_parcelado: true });
  });

  it('o financiamento começa no mês seguinte à última parcela do sinal, com a mesma parcela', () => {
    const saldo = p.parcelas.filter(x => x.tipo === 'saldo');
    expect(saldo[0].vencimento).toBe('2027-03-20');
    expect(saldo).toHaveLength(180);
    expect(saldo[0].valor).toBe(padrao.parcelas.find(x => x.tipo === 'saldo')!.valor);
    const comData = planoDoContrato(sim, { ...base, sinalParcelas: 4, inicioParcelas: '2027-03-15' }, C, true);
    expect(comData.saldo_venc1).toBe('2027-03-15');
    expect(() => planoDoContrato(sim, { ...base, sinalParcelas: 4, inicioParcelas: '2027-02-20' }, C, true)).toThrow(/depois da última parcela do sinal/);
  });

  it('não combina com a entrada dividida nem com o Plano C', () => {
    expect(() => planoDoContrato(sim, { ...base, sinalParcelas: 4, entradaForma: 'boleto_cartao' }, C, true)).toThrow(/uma forma só/);
    expect(() => planoDoContrato(sim, { ...base, condicao: 'C', prazo: 120, sinalParcelas: 4 }, C, true)).toThrow(/Planos A e B/);
  });

  it('o contrato descreve o sinal em parcelas', () => {
    expect(tagsPlano(p).plano_entrada_forma).toBe('a título de sinal, em 4 (quatro) parcelas mensais de R$ 2.500,00, sem juros e sem desconto, a primeira com vencimento em 20/11/2026; as parcelas do saldo começam somente depois da última parcela do sinal');
  });

  it('a retenção da comissão do ato se espalha pelas parcelas do sinal, sem passar de cada uma', () => {
    const m = splitDaComissao(p);
    const ent = [1, 2, 3, 4].map(n => m.get(`entrada:${n}`) ?? 0);
    ent.forEach(v => expect(v).toBeLessThanOrEqual(2500));
    expect(ent.reduce((a, b) => a + b, 0)).toBeCloseTo(splitDaComissao(padrao).get('entrada:1')!, 2);
  });

  it('a parte do corretor do ato vence com o sinal quitado (última parcela)', () => {
    const g = gatilhosDoPlano(p as any)[0];
    expect(g).toMatchObject({ chave: 'entrada-1', tipo: 'entrada', numero: 4 });
    expect(gatilhosDoPlano(padrao as any)[0]).toMatchObject({ numero: 1 });
  });
});

describe('parcela personalizada (administrador)', () => {
  const p = planoDoContrato(sim, { ...base, sinalParcelas: 4, parcelaPersonalizada: 1000 }, C, true);
  const saldo = p.parcelas.filter(x => x.tipo === 'saldo');

  it('todas as parcelas do saldo ficam no valor escolhido e o saldo zera na última', () => {
    expect(saldo.every(x => x.valor === 1000)).toBe(true);
    expect(saldo.at(-1)!.saldoDevedor).toBe(0);
    const amort = saldo.reduce((a, x) => a + x.amortizacao, 0);
    expect(amort).toBeCloseTo(p.saldo_valor, 1);
  });

  it('a taxa efetiva é recalculada e a de tabela fica registrada', () => {
    expect(p.parcela_personalizada).toBe(true);
    expect(p.parcela_tabela).toBeGreaterThan(1000);
    expect(p.taxa_am).toBeGreaterThan(0);
    expect(p.taxa_am).toBeLessThan(0.004867);
    expect(p.total_pagar).toBe(10000 + 180000);
    expect(notaParcelaPersonalizada(p)).toMatch(/fixada em R\$ 1\.000,00 \(180 parcelas mensais\).*tabela de R\$ /);
  });

  it('só desconto: acima da de tabela é recusado; abaixo do saldo sem juros, a taxa fica 0', () => {
    expect(() => planoDoContrato(sim, { ...base, parcelaPersonalizada: 5000 }, C, true)).toThrow(/desconto/);
    const baixa = planoDoContrato(sim, { ...base, parcelaPersonalizada: 500 }, C, true);
    expect(baixa.taxa_am).toBe(0);
    expect(baixa.parcelas.filter(x => x.tipo === 'saldo').at(-1)!.saldoDevedor).toBe(0);
  });
});

describe('autorização: o que foge do padrão', () => {
  it('padrão não pede senha; sinal parcelado, entrada dividida, data e parcela pedem', () => {
    expect(foraDoPadrao({ modalidade: 'financiado', condicao: 'B', entradaForma: 'unica' })).toEqual([]);
    expect(foraDoPadrao({ modalidade: 'financiado', condicao: 'B', sinalParcelas: 4, inicioParcelas: '2027-03-15' })).toHaveLength(2);
    expect(foraDoPadrao({ modalidade: 'financiado', condicao: 'A', entradaForma: 'boleto_cartao' })).toHaveLength(1);
    expect(foraDoPadrao({ modalidade: 'financiado', condicao: 'padrao', sinalParcelas: 4 })).toEqual([]);
  });
});
