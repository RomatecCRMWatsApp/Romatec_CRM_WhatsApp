import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const T = await import('./saas/talaoContrato');

beforeAll(async () => {
  const db: any = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone, email) VALUES (1, 'u1', 'Corretor Exemplo', 'admin', '0000', '99900000000', 'corretor@exemplo.com')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'A01', 'A', 1, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, ${JSON.stringify({ emp_cartorio_ri: 'Cartório Exemplo' })}, ${JSON.stringify({ vend_nome: 'VENDEDORA EXEMPLO', vend_cpf: '000.000.000-00' })})`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
});

describe('talão de contrato (CPCV em branco)', () => {
  it('cliente, chácara, condições, corretor e intermediação saem em branco; empreendimento e vendedora ficam', async () => {
    const { ctx, modelo } = await T.contextoTalao('bom-jardims', 123);
    expect(modelo).toMatch(/MODELO-CPCV-BOM-JARDIMS/);
    for (const k of ['comp_nome', 'comp_cpf', 'conj_nome', 'lote_codigo', 'plano_preco_tabela', 'plano_saldo_parcela', 'intermed_comissao_pct', 'intermed_nome', 'corr_parceiro_nome']) {
      expect(String(ctx[k]), k).toMatch(/^_{10,}$/);
    }
    expect(ctx.vend_nome).toBe('VENDEDORA EXEMPLO');
    expect(ctx.emp_cartorio_ri).toBe('Cartório Exemplo');
    expect(String(ctx.lote_descricao)).not.toMatch(/A01|3\.025/);
  });
  it('mostra as cláusulas de cônjuge, à vista e parcelado e as linhas de testemunhas', async () => {
    const { ctx } = await T.contextoTalao('bom-jardims', 123);
    expect(ctx).toMatchObject({ comp_casado: true, pagamento_avista: true, pagamento_financiado: true, corr_parceiro: true, assinatura_manuscrita: true, comp2_existe: false });
    expect(ctx.ctr_numero).toBe('TALÃO 000123');
  });
  it('sem número: modelo em branco', async () => {
    const { ctx } = await T.contextoTalao('bom-jardims', null);
    expect(ctx.ctr_numero).toBe('TALÃO ______');
  });
  it('limita a 10 folhas por arquivo', async () => {
    await expect(T.folhasDoTalao('bom-jardims', Array.from({ length: 11 }, (_, k) => k + 1))).rejects.toThrow(/10 folhas/);
  });
});

describe('talões para imprimir: sequência e corretor', () => {
  it('cada pedido pega os próximos números e registra o bloco no nome do corretor', async () => {
    const Tal = await import('./saas/talonarios');
    const ext = await Tal.criarExterno({ nome: 'Corretor Externo Exemplo', cpf: '52998224725' }, 1);
    const externoId = Number((ext as any).id ?? (await Tal.listarExternos())[0].id);
    expect(await Tal.proximoNumero('CONTRATO')).toBe(1);
    const a = await Tal.emitirTaloes({ tipo: 'CONTRATO', quantidade: 10, externoId }, 1, '2026-11-07');
    expect(a).toMatchObject({ numeroInicial: 1, numeroFinal: 10 });
    const b = await Tal.emitirTaloes({ tipo: 'CONTRATO', quantidade: 5, usuarioId: 1 }, 1, '2026-11-07');
    expect(b).toMatchObject({ numeroInicial: 11, numeroFinal: 15 });
    // Recibos têm sequência própria
    expect(await Tal.proximoNumero('RECIBO')).toBe(1);
    const blocos = await Tal.listarTalonarios();
    expect(blocos.find((t: any) => t.id === a.talonarioId)).toMatchObject({ corretor: 'Corretor Externo Exemplo', emBranco: 10 });
    const pend = await Tal.pendencias();
    expect(pend.find((p: any) => p.corretor === 'Corretor Externo Exemplo')?.contratos.length).toBeGreaterThan(0);
  });
  it('de 1 a 50 por vez e sempre com corretor', async () => {
    const Tal = await import('./saas/talonarios');
    await expect(Tal.emitirTaloes({ tipo: 'CONTRATO', quantidade: 51, usuarioId: 1 }, 1, '2026-11-07')).rejects.toThrow(/50/);
    await expect(Tal.emitirTaloes({ tipo: 'CONTRATO', quantidade: 2 }, 1, '2026-11-07')).rejects.toThrow(/corretor/);
  });
});
