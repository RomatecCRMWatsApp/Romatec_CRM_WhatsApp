import { describe, expect, it } from 'vitest';
import { planoEscolhido } from './contratos/servico';
import { tagsPlano } from './contratos/contexto';
import { simular } from '../shared/simulador';

// Entrada de 30% com valor digitado acima do mínimo (caso C12: R$ 166.229,46, entrada de R$ 50 mil, 120×). Dados fictícios.
const c: any = { precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625, descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 };
const AREA = 3142.89;
const base = { modalidade: 'financiado' as const, entradaParcelas: 1, prazo: 120, dataPrimeiroPagamento: '2026-12-15', condicao: 'padrao' as const };

describe('entrada digitada acima dos 30%', () => {
  it('C12 com R$ 50 mil de entrada: saldo R$ 116.229,46 em 120× de R$ 1.281,13, sem desconto à vista', () => {
    const p = planoEscolhido({ ...base, entradaValor: 50000 }, AREA, null, c, true);
    expect(p.preco_tabela).toBe(166229.46);
    expect(p.entrada_valor).toBe(50000);
    expect(p.entrada_desconto).toBe(0);
    expect(p.saldo_valor).toBe(116229.46);
    expect(p.saldo_qtd).toBe(120);
    expect(p.saldo_parcela).toBe(1281.13);
    expect(p.parcelas.filter(x => x.tipo === 'entrada')).toHaveLength(1);
    expect(p.parcelas.filter(x => x.tipo === 'saldo')).toHaveLength(120);
    expect(p.parcelas.at(-1)!.saldoDevedor).toBe(0);
  });
  it('no contrato: percentual com casas decimais e entrada "sem desconto"', () => {
    const t = tagsPlano(planoEscolhido({ ...base, entradaValor: 50000 }, AREA, null, c, true));
    expect(t.plano_entrada_percentual).toBe('30,08%');
    expect(String(t.plano_entrada_forma)).toContain('em parcela única de R$ 50.000,00, sem desconto');
  });
  it('entrada parcelada (3×) divide o valor digitado', () => {
    const p = planoEscolhido({ ...base, entradaParcelas: 3, entradaValor: 60000 }, AREA, null, c, true);
    expect(p.parcelas.filter(x => x.tipo === 'entrada').map(x => x.valor)).toEqual([20000, 20000, 20000]);
    expect(p.saldo_valor).toBe(106229.46);
  });
  it('sem valor digitado nada muda (30% com desconto à vista)', () => {
    const p = planoEscolhido(base, AREA, null, c, true);
    expect(p.entrada_valor).toBe(46752.04);
    expect(p.saldo_parcela).toBe(1282.57);
    expect(tagsPlano(p).plano_entrada_percentual).toBe('30%');
  });
  it('abaixo dos 30% ou igual/maior que o preço: recusa com a mensagem', () => {
    expect(() => simular(AREA, 1, c, null, 40000)).toThrow(/pelo menos R\$\s?49\.868,84/);
    expect(() => simular(AREA, 1, c, null, 166229.46)).toThrow(/menor que o preço/);
  });
});
