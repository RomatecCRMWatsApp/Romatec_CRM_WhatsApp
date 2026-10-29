import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
vi.mock('./leads/zapiClient', () => ({ enviarTexto: async () => 'id' }));

const P = await import('./parceiros');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('imobiliárias parceiras', () => {
  let db: any, token = '', codigo = '';
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, telefone) VALUES (5, 'u5', 'Ana Corretora', 'user', '99981112222')`);
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf, precosPublicos) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA', 0)`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao, precoTabela) VALUES (5, 1, 'A05', 'A', 5, '3025', 'disponivel', '95000'), (6, 1, 'A06', 'A', 6, '3025', 'vendido_parcelado', '95000')`);
    codigo = (await P.criarParceira({ nome: 'Imobiliária Norte', comissaoPct: 0.02, corretorInternoId: 5 }, 1)).codigo;
    token = (await P.listarParceiras())[0].portal.split('/').pop()!;
  });

  it('portal: chácaras sem preço (travado), links com o código da parceira e o ref do corretor', async () => {
    const p = await P.portalParceira(token);
    expect(p.parceira).toMatchObject({ nome: 'Imobiliária Norte', comissaoPct: 0.02 });
    expect(p.chacaras.map(c => [c.codigo, c.situacao, c.preco])).toEqual([['A05', 'disponivel', null], ['A06', 'vendido', null]]);
    expect(p.links[0].url).toContain(`utm_campaign=PARC-${codigo}`);
    expect(p.links[0].url).toMatch(/&c=/);
    await expect(P.portalParceira('0'.repeat(32))).rejects.toThrow(/inválido/);
  });

  it('indicação vira lead da parceira, com o corretor da casa; venda entra com a comissão', async () => {
    await expect(P.indicarCliente(token, { nome: 'João Lima', telefone: '123', consentimento: true } as any)).rejects.toThrow(/WhatsApp/);
    expect(await P.indicarCliente(token, { nome: 'João Lima', telefone: '(99) 9 7777-6666', chacara: 'a05', consentimento: true })).toMatchObject({ ok: true, novo: true });
    const [l] = db.all(sql`SELECT id, responsavelId, loteCodigo FROM leadQualifications`);
    expect(l).toMatchObject({ responsavelId: 5, loteCodigo: 'A05' });
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, leadId, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-1', 1, 5, 'A05', ${l.id}, 5, '{"modalidade":"financiado","preco_tabela":100000,"comissao_total":7000}', '{}', 'ativo', 'EX7K2M9P4Q1R')`);
    const p = await P.portalParceira(token);
    expect(p.leads[0]).toMatchObject({ nome: 'João Lima', chacara: 'A05' });
    expect(p.vendas).toEqual([expect.objectContaining({ chacara: 'A05', situacao: 'Vendida', valor: 100000, comissao: 2000 })]);
    const [lista] = await P.listarParceiras();
    expect(lista).toMatchObject({ leads: 1, vendidas: 1, comissaoPrevista: 2000, corretorInterno: 'Ana Corretora' });
  });

  it('desativada ou com link novo, o link antigo para de funcionar', async () => {
    const id = (await P.listarParceiras())[0].id;
    await P.novoLinkParceira(id);
    await expect(P.portalParceira(token)).rejects.toThrow(/inválido/);
  });
});
