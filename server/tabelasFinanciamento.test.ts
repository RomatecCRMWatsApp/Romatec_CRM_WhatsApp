import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { evolucao, simular, type CondicoesPagamento } from '../shared/simulador';
import { calcularTabela, pdfTabelaFinanciamento, pdfTabelaGeral, type LoteTabela } from './financeiro/tabelas';

const c: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
} as CondicoesPagamento;
const lotes: LoteTabela[] = [
  { codigo: 'A01', quadra: 'A', areaM2: 3025.11, preco: 160000, precoTabela: 160000, situacao: 'disponivel' },
  { codigo: 'A12', quadra: 'A', areaM2: 3661.42, preco: 193654.84, precoTabela: null, situacao: 'vendido_parcelado' },
];
const base = { emp: { id: 1, slug: 'bom-jardims', nome: 'Condomínio de Chácaras Bom Jardims', municipio: 'Açailândia', uf: 'MA' }, c, lotes, marca: 'bomjardims' };

describe('tabelas de financiamento (motor do simulador)', () => {
  it('padrão: área base 3.025,11 m² → R$ 160.000,00; entrada 6× + 120× de R$ 1.234,51; total R$ 196.141,20', () => {
    const t = calcularTabela(base, { entrada: 6, prazo: 120, dataPrimeiro: '2026-11-10' });
    expect(t.origem).toMatchObject({ tipo: 'area', areaM2: 3025.11, preco: 160000 });
    expect(t.resumo).toMatchObject({ parcela: 1234.51, totalPago: 196141.2 });
    expect(t.simulacao.avistaTotal.valor).toBe(150000);
    expect(t.simulacao.entradaAvista).toBe(45000);
    // Evolutivo idêntico ao evolucao() do simulador, com vencimentos
    const ref = evolucao(simular(3025.11, 6, c), 120);
    expect(t.linhas.map(({ vencimento, ...l }) => l)).toEqual(ref);
    expect(t.linhas).toHaveLength(126);
    expect(t.linhas[0].vencimento).toBe('2026-11-10');
    expect(t.linhas[6].vencimento).toBe('2027-05-10');
    expect(t.linhas[125].saldoDevedor).toBe(0);
  });

  it('por chácara (preço de tabela do lote) e por valor digitado', () => {
    expect(calcularTabela(base, { lote: 'a12', entrada: 1, prazo: 60 }).origem).toMatchObject({ tipo: 'lote', codigo: 'A12', preco: 193654.84 });
    const v = calcularTabela(base, { preco: 200000, entrada: 2, prazo: 12 });
    expect(v.origem).toMatchObject({ tipo: 'valor', preco: 200000 });
    expect(v.simulacao.saldo).toBe(140000);
  });

  it('prazo ou entrada fora das condições é recusado', () => {
    expect(() => calcularTabela(base, { entrada: 7, prazo: 120 })).toThrow(/até 6/);
    expect(() => calcularTabela(base, { entrada: 6, prazo: 48 })).toThrow(/48 meses/);
    expect(() => calcularTabela(base, { lote: 'Z99', entrada: 6, prazo: 120 })).toThrow(/não encontrada/);
  });

  it('PDF do evolutivo e tabela geral com a marca', async () => {
    const t = calcularTabela(base, { lote: 'A01', entrada: 6, prazo: 120 });
    const a = await PDFDocument.load(await pdfTabelaFinanciamento(base, t, null));
    expect(a.getPageCount()).toBeGreaterThanOrEqual(3);
    const g = await PDFDocument.load(await pdfTabelaGeral(base, null));
    expect(g.getPageCount()).toBe(1);
    expect(g.getPage(0).getSize().width).toBeGreaterThan(800); // paisagem
  });
});
