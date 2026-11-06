import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { normalizar, pontuar, prepararTermo, agruparResultados } = await import('../shared/buscaGlobal');
const { buscarTudo } = await import('./buscaGlobal');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const ADMIN = { id: 1, perfil: null, role: 'admin' };
const CARLA = { id: 3, perfil: 'corretor', role: 'user' };
const pAdmin = { perfil: 'admin' as const, modulos: null, acessos: [] };
const pCarla = { perfil: 'corretor' as const, modulos: null, acessos: [{ tipo: 'empreendimento', refId: 1 }] as any };
const tipos = (r: any) => r.grupos.map((g: any) => g.tipo);
const titulos = (r: any, tipo: string) => r.grupos.find((g: any) => g.tipo === tipo)?.itens.map((i: any) => i.titulo) ?? [];

describe('busca única: regras', () => {
  it('ignora acento e maiúscula', () => {
    expect(normalizar('  José   ROMÁRIO ')).toBe('jose romario');
  });
  it('pontua igual > começa com > palavra começa com > contém', () => {
    const t = prepararTermo('silva');
    expect(pontuar('Silva', t)).toBe(100);
    expect(pontuar('Silvano Costa', t)).toBe(80);
    expect(pontuar('Ana Silva', t)).toBe(60);
    expect(pontuar('Ana Dasilva', t)).toBe(40);
    expect(pontuar('Maria', t)).toBe(0);
  });
  it('telefone/CPF pelos dígitos, com ou sem máscara', () => {
    const t = prepararTermo('99 9 0000-0001');
    expect(pontuar('5599900000001', t, 'numero')).toBe(85);
    expect(pontuar('99900000001', t, 'numero')).toBe(100);
    expect(pontuar('123', prepararTermo('12'), 'numero')).toBe(0);
  });
  it('termo curto não busca; grupos na ordem e no máximo 6', () => {
    expect(prepararTermo('a').valido).toBe(false);
    const muitos = Array.from({ length: 9 }, (_, i) => ({ tipo: 'lead' as const, id: `l${i}`, titulo: `L${i}`, detalhe: null, url: '/x', pontos: i }));
    const g = agruparResultados([...muitos, { tipo: 'chacara', id: 'c', titulo: 'C', detalhe: null, url: '/y', pontos: 50 }]);
    expect(g.map(x => x.tipo)).toEqual(['lead', 'chacara']);
    expect(g[0].itens).toHaveLength(6);
    expect(g[0].itens[0].titulo).toBe('L8');
  });
});

describe('busca única: no banco, respeitando quem pode ver o quê', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo, creci, telefone) VALUES
      (1, 'a', 'Admin Teste', 'admin', NULL, 1, NULL, NULL),
      (3, 'c', 'Carla Fictícia', 'user', 'corretor', 1, '10001', '99900000001'),
      (4, 'm', 'Marcos Exemplo', 'user', 'corretor', 1, '10002', '99900000002')`);
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims'), (2, 'outro', 'Outro Loteamento')`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, status) VALUES (1, 1, 'B13', 'B', 'disponivel'), (2, 2, 'B13', 'B', 'disponivel')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, score, responsavelId) VALUES
      (1, '5599911112222', 'João Silva', 'quente', 3), (2, '5599933334444', 'Joana Silva', 'morno', 4)`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj) VALUES (1, 'Pedro Comprador', '11144477735')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, codigoVerificacao, status) VALUES
      (1, 'BJ-0007', 1, 'B13', 3, '{}', '{}', 'AAAABBBBCCCC', 'assinado'), (2, 'BJ-0008', 1, 'A01', 4, '{}', '{}', 'DDDDEEEEFFFF', 'assinado')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
  });

  it('administrador acha o lead pelo nome e pelo telefone', async () => {
    expect(titulos(await buscarTudo('silva', ADMIN, pAdmin), 'lead')).toEqual(expect.arrayContaining(['João Silva', 'Joana Silva']));
    expect(titulos(await buscarTudo('3333-4444', ADMIN, pAdmin), 'lead')).toEqual(['Joana Silva']);
  });

  it('corretor só vê os leads dele e os contratos dele', async () => {
    expect(titulos(await buscarTudo('silva', CARLA, pCarla), 'lead')).toEqual(['João Silva']);
    const r = await buscarTudo('BJ-000', CARLA, pCarla);
    expect(titulos(r, 'contrato')).toEqual(['Contrato BJ-0007']);
  });

  it('chácara pelo código, só nos empreendimentos habilitados para o corretor', async () => {
    expect(titulos(await buscarTudo('B13', ADMIN, pAdmin), 'chacara')).toHaveLength(2);
    const r = await buscarTudo('b13', CARLA, pCarla);
    const ch = r.grupos.find((g: any) => g.tipo === 'chacara')!.itens;
    expect(ch).toHaveLength(1);
    expect(ch[0].url).toBe('/empreendimentos/bom-jardims?lote=B13');
  });

  it('comprador pelo nome ou CPF leva ao contrato, com o CPF mascarado', async () => {
    const r = await buscarTudo('111.444.777-35', ADMIN, pAdmin);
    const c = r.grupos.find((g: any) => g.tipo === 'cliente')!.itens[0];
    expect(c).toMatchObject({ titulo: 'Pedro Comprador', url: '/contratos/1' });
    expect(c.detalhe).toContain('CPF ***.444.777-**');
    expect(titulos(await buscarTudo('pedro', ADMIN, pAdmin), 'contrato')).toEqual(['Contrato BJ-0007']);
  });

  it('equipe só aparece para o escritório; corretor não procura colegas', async () => {
    expect(titulos(await buscarTudo('marcos', ADMIN, pAdmin), 'equipe')).toEqual(['Marcos Exemplo']);
    expect(tipos(await buscarTudo('marcos', CARLA, pCarla))).not.toContain('equipe');
  });
});
