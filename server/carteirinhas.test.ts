import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { pendenciasDependentes, MAX_DEPENDENTES } = await import('../shared/contratos');
const S = await import('./contratos/servico');
const K = await import('./contratos/carteirinhas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const dep = (x: Record<string, unknown> = {}) => ({ nome: 'Pedro Mendes Silva', parentesco: 'filho', nascimento: '2015-04-10', cpf: '', ...x }) as any;

describe('dependentes: validação', () => {
  it('nome completo, parentesco, nascimento; CPF opcional mas válido; no máximo 6', () => {
    expect(pendenciasDependentes([dep()])).toEqual({});
    expect(pendenciasDependentes([dep({ cpf: '529.982.247-25' })])).toEqual({});
    expect(pendenciasDependentes([dep({ nome: 'Pedro', parentesco: 'primo', nascimento: '2999-01-01', cpf: '111.111.111-11' })])).toEqual({
      'dependentes.0.nome': 'Nome completo', 'dependentes.0.parentesco': 'Parentesco', 'dependentes.0.nascimento': 'Data de nascimento', 'dependentes.0.cpf': 'CPF inválido',
    });
    expect(pendenciasDependentes(Array.from({ length: MAX_DEPENDENTES + 1 }, () => dep())).dependentes).toBe('No máximo 6 dependentes');
  });
});

describe('carteirinhas do contrato', () => {
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'vendido_parcelado')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-2026-0001', 1, 5, 'A05', 1, '{}', '{}', 'ativo', 'EX7K2M9P4Q1R')`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj) VALUES (1, 'Carlos Eduardo Mendes da Silva', '52998224725'), (2, 'Ana Paula Ribeiro Mendes', '11144477735')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (1, 2, 'conjuge')`);
  });

  it('salva até 6 dependentes (troca a lista) e a numeração é titular 1, cônjuge 2, dependentes 3…', async () => {
    await S.salvarDependentes(1, [dep(), dep({ nome: 'Maria Mendes Silva', parentesco: 'filha', nascimento: '2018-09-01' })]);
    await expect(S.salvarDependentes(1, [dep({ nome: 'X' })])).rejects.toMatchObject({ campos: { 'dependentes.0.nome': 'Nome completo' } });
    expect((await S.dependentesDo(1)).map(d => d.nome)).toEqual(['Pedro Mendes Silva', 'Maria Mendes Silva']);
    expect(await K.pessoasDaCarteirinha(1)).toEqual([
      { n: 1, nome: 'Carlos Eduardo Mendes da Silva', vinculo: 'Titular' },
      { n: 2, nome: 'Ana Paula Ribeiro Mendes', vinculo: 'Cônjuge' },
      { n: 3, nome: 'Pedro Mendes Silva', vinculo: 'Dependente · Filho' },
      { n: 4, nome: 'Maria Mendes Silva', vinculo: 'Dependente · Filha' },
    ]);
  });

  it('PDF tamanho cartão: frente e verso de cada pessoa', async () => {
    const { pdf, nome } = await K.carteirinhasPdf(1);
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(8);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round((width * 25.4) / 72 * 10) / 10).toBe(85.6);
    expect(Math.round((height * 25.4) / 72)).toBe(54);
    expect(nome).toBe('CARTEIRINHAS-BJ-2026-0001.pdf');
    if (process.env.CARTEIRINHA_SAIDA) (await import('node:fs')).writeFileSync(`${process.env.CARTEIRINHA_SAIDA}/${nome}`, pdf);
  });

  it('QR da portaria: válida com contrato ativo; inválida cancelado; número que não existe', async () => {
    const ok = await K.conferirCarteirinha('EX7K2M9P4Q1R', 3);
    expect(ok.html).toContain('Carteirinha válida');
    expect(ok.html).toContain('Pedro Mendes Silva');
    expect(ok.html).not.toContain('52998224725');
    expect((await K.conferirCarteirinha('EX7K2M9P4Q1R', 7)).status).toBe(404);
    expect((await K.conferirCarteirinha('NAOEXISTE00', 1)).status).toBe(404);
    db.run(sql`UPDATE contratos SET status = 'cancelado' WHERE id = 1`);
    expect((await K.conferirCarteirinha('EX7K2M9P4Q1R', 1)).html).toContain('não está válida');
    await expect(K.carteirinhasPdf(1)).rejects.toMatchObject({ status: 409 });
  });
});
