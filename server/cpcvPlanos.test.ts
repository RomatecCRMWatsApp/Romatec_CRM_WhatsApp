import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SEED_EMP_JURIDICO } from './_core/migrations/seedContratos';
import { simular, type CondicoesPagamento } from '../shared/simulador';
import { modeloDaCondicao, planoDoContrato } from './contratos/plano';
import { tagsPlano } from './contratos/contexto';
import { splitDaComissao } from './financeiro/emissao';

const C: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const plano = (condicao: 'padrao' | 'A' | 'B' | 'C', prazo = 120) =>
  planoDoContrato(simular(3025.11, condicao === 'padrao' ? 6 : 1, C, 160000), { modalidade: 'financiado', prazo, dataPrimeiroPagamento: '2026-11-10', condicao }, C, true);

describe('CPCV por forma de pagamento (entrada 30%, Planos A, B e C)', () => {
  it('cada condição usa o seu modelo; o v3 continua sendo o da entrada de 30%', () => {
    const base = 'MODELO-CPCV-BOM-JARDIMS-v3.docx';
    expect(modeloDaCondicao(base, 'padrao')).toBe(base);
    expect(modeloDaCondicao(base, undefined)).toBe(base);
    for (const p of ['A', 'B', 'C'] as const) {
      expect(modeloDaCondicao(base, p)).toBe(`MODELO-CPCV-BOM-JARDIMS-v3-PLANO-${p}.docx`);
      expect(existsSync(path.join(__dirname, '..', 'templates', modeloDaCondicao(base, p)))).toBe(true);
    }
  });

  it('plano A: entrada R$ 10 mil no ato, 120 parcelas e 10 reforços anuais nas cobranças', () => {
    const p = plano('A');
    expect(p).toMatchObject({ condicao: 'A', entrada_valor: 10000, entrada_qtd: 1, saldo_valor: 150000, saldo_qtd: 120, saldo_parcela: 1234.51, reforco_qtd: 10, reforco_valor: 5162.97, reforco_venc1: '2027-11-10', saldo_venc1: '2026-12-10' });
    expect(p.parcelas.filter(x => x.tipo === 'reforco')).toHaveLength(10);
    expect(p.parcelas.at(-1)!.saldoDevedor).toBe(0);
    // Corretagem inteira na entrada do ato (Cláusula 19.1 do modelo do plano)
    expect([...splitDaComissao(p)]).toEqual([['entrada:1', 8000]]);
    const t = tagsPlano(p);
    expect(t).toMatchObject({ plano_condicao_titulo: 'Plano A — Plano 13º', plano_entrada_percentual: '6,25%', plano_reforco_qtd: '10', plano_reforco_valor: '5.162,97', plano_reforco_venc1: '10/11/2027' });
    expect(String(t.plano_entrada_forma)).toBe('em parcela única de R$ 10.000,00, sem desconto, com vencimento em 10/11/2026');
  });

  it('plano B em 180× e plano C com o complemento da entrada sem juros', () => {
    expect(plano('B', 180)).toMatchObject({ condicao: 'B', saldo_qtd: 180, saldo_parcela: 1252.94, saldo_valor: 150000 });
    const c = plano('C');
    expect(c).toMatchObject({ condicao: 'C', entrada_valor: 48000, entrada_parcela: 10000, complemento_valor: 38000, complemento_qtd: 36, complemento_parcela: 1055.56, saldo_valor: 112000 });
    expect(c.parcelas.filter(x => x.tipo === 'complemento')).toHaveLength(36);
    expect(String(tagsPlano(c).plano_entrada_forma)).toContain('complemento de R$ 38.000,00 em 36 (trinta e seis) parcelas mensais de R$ 1.055,56, sem juros');
  });

  it('o padrão (entrada 30%) não muda', () => {
    const p = plano('padrao');
    expect(p.condicao).toBeUndefined();
    expect(p).toMatchObject({ entrada_qtd: 6, entrada_valor: 48000, saldo_qtd: 120 });
    expect(tagsPlano(p).plano_condicao_titulo).toBe('Entrada de 30%');
  });

  it('modelos dos planos: cláusulas próprias e nenhuma marca do plano sem valor', async () => {
    const { mergeDocx } = await import('./contratos/render');
    const ctx = (p: ReturnType<typeof plano>) => ({ ...SEED_EMP_JURIDICO.defaults, ...tagsPlano(p), ctr_parcelas_minimas_obra: '3' } as any);
    const texto = async (arq: string, p: ReturnType<typeof plano>) =>
      new PizZip(await mergeDocx(arq, ctx(p), { minuta: true, marca: 'bomjardims' })).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
    const a = await texto('MODELO-CPCV-BOM-JARDIMS-v3-PLANO-A.docx', plano('A'));
    expect(a).toContain('e em 10 reforços anuais de R$ 5.162,97, vencendo o primeiro em 10/11/2027');
    expect(a).toContain('3.3.1. Reforços anuais (Plano A — Plano 13º).');
    expect(a).toContain('na entrada à vista ou em parcela única das condições de lançamento, integralmente no ato.');
    expect(a).not.toMatch(/PREENCHER: plano_/);
    const b = await texto('MODELO-CPCV-BOM-JARDIMS-v3-PLANO-B.docx', plano('B', 180));
    expect(b).toContain('R$ 150.000,00 em 180 parcelas mensais');
    expect(b).not.toContain('3.3.1. Reforços');
    const c = await texto('MODELO-CPCV-BOM-JARDIMS-v3-PLANO-C.docx', plano('C'));
    expect(c).toContain('3.2.1. Posse e liberação de uso no Plano C.');
    expect(c).toContain('pagas juntamente com as parcelas do complemento da entrada do item 9');
    expect(c).not.toMatch(/PREENCHER: plano_/);
    // O modelo da entrada de 30% segue sem as cláusulas dos planos
    const v3 = await texto('MODELO-CPCV-BOM-JARDIMS-v3.docx', plano('padrao'));
    expect(v3).toContain('O primeiro vencimento do saldo ocorre no mês seguinte ao da última parcela da entrada.');
    expect(v3).not.toContain('3.3.1. Reforços');
  });
});
