import { describe, expect, it } from 'vitest';
import { calcularRoi, somarRoi, valorDoPlano } from '../shared/roiCampanhas';

describe('retorno por campanha', () => {
  it('calcula custo por lead, visita e venda, conversão e retorno sobre a comissão', () => {
    const r = calcularRoi({ gasto: 3000, leads: 60, visitas: 12, vendas: 2, emAndamento: 1, vgv: 180000, comissao: 12600 });
    expect(r).toMatchObject({ cpl: 50, custoVisita: 250, custoVenda: 1500, conversao: 3.3, roi: 320 });
  });
  it('sem gasto ou sem vendas não divide por zero', () => {
    const r = calcularRoi({ gasto: 0, leads: 0, visitas: 0, vendas: 0, emAndamento: 0, vgv: 0, comissao: 0 });
    expect(r).toMatchObject({ cpl: null, custoVisita: null, custoVenda: null, conversao: null, roi: null });
  });
  it('soma as campanhas e lê o valor do plano congelado', () => {
    const t = somarRoi([
      { gasto: 1000, leads: 10, visitas: 2, vendas: 1, emAndamento: 0, vgv: 90000, comissao: 6300 },
      { gasto: 1000, leads: 30, visitas: 3, vendas: 0, emAndamento: 2, vgv: 0, comissao: 0 },
    ]);
    expect(t).toMatchObject({ gasto: 2000, leads: 40, vendas: 1, emAndamento: 2, custoVenda: 2000, cpl: 50 });
    expect(valorDoPlano({ modalidade: 'avista', preco_avista: 80000, preco_tabela: 90000, comissao_total: 5600 })).toEqual({ vgv: 80000, comissao: 5600 });
    expect(valorDoPlano({ modalidade: 'financiado', preco_avista: 80000, preco_tabela: 90000, comissao_total: 6300 })).toEqual({ vgv: 90000, comissao: 6300 });
    expect(valorDoPlano(null)).toEqual({ vgv: 0, comissao: 0 });
  });
});
