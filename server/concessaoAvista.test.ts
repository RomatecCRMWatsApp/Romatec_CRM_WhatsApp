import { describe, expect, it } from 'vitest';

// Regra: concessão da proprietária conta como venda à vista, pelo valor à vista; as demais seguem o contrato
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const K = await import('./lotes/concessao');
const { linhaFinanceira, SITUACOES_VENDA } = await import('../shared/permissoes');

describe('concessão = venda à vista', () => {
  it('ajusta a chácara concedida (lançada como entrada, a prazo) para o valor à vista em parcela única; venda comum não muda', async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
      VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao, valorVenda, valorEntrada, numParcelas) VALUES (1, 1, 'D16', 'D', 16, '3025.11', 'concedido', '160000', '48000', 120)`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao, valorVenda, valorEntrada, numParcelas) VALUES (2, 1, 'D10', 'D', 10, '3025.11', 'entrada', '166000', '48000', 120)`);
    const n = await K.ajustarConcessoesAvista();
    expect(n).toBe(1);
    const [c, v]: any[] = db.all(sql`SELECT codigo, situacao, valorVenda, valorEntrada, numParcelas FROM lotes ORDER BY id`);
    expect(c).toMatchObject({ codigo: 'D16', situacao: 'concedido', numParcelas: 1 });
    expect(Number(c.valorVenda)).toBe(150000); // 160.000 com 6,25% de desconto à vista
    expect(Number(c.valorEntrada)).toBe(150000);
    expect(v).toMatchObject({ codigo: 'D10', situacao: 'entrada', numParcelas: 120 });
    expect(Number(v.valorVenda)).toBe(166000);
    expect(await K.ajustarConcessoesAvista()).toBe(0); // idempotente
  });

  it('concessão entra nas vendas e a comissão é calculada como à vista', () => {
    expect(SITUACOES_VENDA).toContain('concedido');
    const c: any = { comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 };
    const l = linhaFinanceira('admin', 1, { situacao: 'concedido', valorVenda: 150000, corretorId: null } as any, c, 0.02);
    expect(l.parcelada).toBe(false);
  });
});
