import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Banco local em memória com as mesmas tabelas da produção
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const schema = await import('../drizzle/schema');
const { eq, sql } = await import('drizzle-orm');
const { aplicarProjetoV2BomJardims, CHAVE_PROJETO_V2 } = await import('./_core/migrations/bomJardimsProjetoV2');
const { gravarConfig, limparCacheConfig } = await import('./configSistema');
const seed = (await import('./data/bom-jardims/seed.json')).default as any;
const v2 = (await import('./data/bom-jardims/projeto-v2.json')).default as any;
const { importarLotesDxf, codigoLote, valorNumero } = await import('./lotes/dxf');

let db: any, empId = 0;
const lote = async (c: string) => (await db.select().from(schema.lotes).where(eq(schema.lotes.codigo, c)))[0];

async function cadastrarComoAntes() {
  limparCacheConfig();
  db.run(sql`DELETE FROM lotes`); db.run(sql`DELETE FROM empreendimentos`); db.run(sql`DELETE FROM configSistema`); db.run(sql`DELETE FROM contratos`);
  db.run(sql`DELETE FROM artigosConhecimento`);
  db.run(sql`INSERT INTO empreendimentos (slug, nome, municipio, uf, totalLotes, lotesComercializaveis) VALUES ('bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA', 84, 82)`);
  empId = Number((await db.select().from(schema.empreendimentos))[0].id);
  for (const l of seed.lotes) {
    await db.insert(schema.lotes).values({ empreendimentoId: empId, codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: String(l.areaM2), perimetroM: String(l.perimetroM),
      destinacao: l.destinacao, comercializavel: l.comercializavel, status: l.status, situacao: l.comercializavel ? 'disponivel' : 'bloqueado', latCentro: String(l.latCentro), lonCentro: String(l.lonCentro) } as any);
  }
  await db.insert(schema.artigosConhecimento).values({ slug: 'ficha-do-bom-jardims', titulo: 'Ficha', categoria: 'empreendimento', publico: 'todos', ordem: 1, ativo: true,
    conteudo: '- **82 chácaras** em cerca de 41 ha.\n- **Stand de vendas e administração:** chácara B14.\n', atualizadoEm: new Date() } as any);
}

beforeAll(async () => { db = await getDb(); });
beforeEach(cadastrarComoAntes);

describe('Projeto V2 do Bom Jardims (portal e administração na entrada, A02 desmembrado)', () => {
  it('desmembra o A02, libera A03 e B14, atualiza a geometria e as ruas — uma vez só', async () => {
    const r = await aplicarProjetoV2BomJardims();
    expect(r).toMatchObject({ aplicado: true, criados: 1, atualizados: 84, liberados: ['A03', 'B14'] });
    const a02 = await lote('A02'), a02a = await lote('A02A');
    expect(Number(a02.areaM2)).toBe(1100.04);
    expect(a02).toMatchObject({ destinacao: 'area_tecnica', status: 'nao_comercializavel', situacao: 'bloqueado' });
    expect(Boolean(a02.comercializavel)).toBe(false);
    expect(Number(a02a.areaM2)).toBe(1925.07);
    expect(a02a).toMatchObject({ quadra: 'A', numero: 2, destinacao: 'chacara', status: 'disponivel', situacao: 'disponivel' });
    for (const c of ['A03', 'B14']) expect(await lote(c)).toMatchObject({ destinacao: 'chacara', status: 'disponivel', situacao: 'disponivel' });
    // Geometria oficial do DXF em todos os lotes (vértices UTM e polígono para o memorial e o mapa)
    const c15 = await lote('C15');
    expect(Number(c15.areaM2)).toBe(v2.lotes.find((l: any) => l.codigo === 'C15').areaM2);
    expect(JSON.parse(typeof c15.verticesUtm === 'string' ? c15.verticesUtm : JSON.stringify(c15.verticesUtm)).length).toBeGreaterThanOrEqual(4);
    const emp = (await db.select().from(schema.empreendimentos))[0];
    expect(emp.totalLotes).toBe(85);
    expect(emp.lotesComercializaveis).toBe(84);
    const ruas = typeof emp.ruas === 'string' ? JSON.parse(emp.ruas) : emp.ruas;
    expect(new Set(ruas.map((x: any) => x.nome))).toEqual(new Set(['Rua Angelim', 'Rua Cedro', 'Rua Ipê', 'Rua Jatobá', 'Rua Sapucaia', 'Rua Walter e Maria', 'Travessa Açaí']));
    // Ficha da base de conhecimento
    const art = (await db.select().from(schema.artigosConhecimento))[0];
    expect(art.conteudo).toContain('**84 chácaras**');
    expect(art.conteudo).toContain('na entrada do condomínio, junto ao portal (Rua Walter e Maria');
    // Segunda vez: não faz nada
    expect(await aplicarProjetoV2BomJardims()).toMatchObject({ aplicado: false, motivo: 'já aplicado' });
  });

  it('A02 com cliente: não desmembra nem mexe em nada (decisão manual)', async () => {
    db.run(sql`UPDATE lotes SET situacao = 'reservado', clienteNome = 'Cliente Teste' WHERE codigo = 'A02'`);
    const r = await aplicarProjetoV2BomJardims();
    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/A02 tem cliente/);
    expect(Number((await lote('A02')).areaM2)).toBe(3025.11);
    expect(await lote('A02A')).toBeUndefined();
    expect(Boolean((await lote('A03')).comercializavel)).toBe(false);
  });

  it('A03/B14 já com cliente não mudam de situação', async () => {
    db.run(sql`UPDATE lotes SET situacao = 'interesse' WHERE codigo = 'B14'`);
    const r = await aplicarProjetoV2BomJardims();
    expect(r.liberados).toEqual(['A03']);
    expect((await lote('B14')).situacao).toBe('interesse');
  });

  it('marcado como aplicado: não roda', async () => {
    await gravarConfig(CHAVE_PROJETO_V2, '{"aplicadoEm":"2026-11-09"}', null);
    expect(await aplicarProjetoV2BomJardims()).toMatchObject({ aplicado: false, motivo: 'já aplicado' });
  });
});

describe('Importação de DXF: lote desmembrado ("2A")', () => {
  it('código com sufixo e ordem logo depois do lote original', () => {
    expect(codigoLote('A', '2A')).toBe('A02A');
    expect(codigoLote('B', '14')).toBe('B14');
    expect(valorNumero('2A')).toBeGreaterThan(valorNumero('02'));
    expect(valorNumero('2A')).toBeLessThan(valorNumero('03'));
  });
  it('lê o "2A" do desenho como lote próprio', () => {
    const q = (x: number, y: number, l = 50) => [[x, y], [x + l, y], [x + l, y + l], [x, y + l]];
    const poli = (pts: number[][]) => ['0', 'LWPOLYLINE', '8', 'REGIAO_POLILINHAS', '70', '1', ...pts.flatMap(([x, y]) => ['10', String(x), '20', String(y)])];
    const txt = (camada: string, t: string, x: number, y: number) => ['0', 'TEXT', '8', camada, '10', String(x), '20', String(y), '1', t];
    const dxf = ['0', 'SECTION', '2', 'ENTITIES',
      ...poli(q(236000, 9455000)), ...poli(q(236060, 9455000)), ...poli(q(236120, 9455000)),
      ...txt('NUMERO_DOS_LOTES', '01', 236025, 9455025), ...txt('NUMERO_DOS_LOTES', '02', 236085, 9455025), ...txt('NUMERO_DOS_LOTES', '2A', 236145, 9455025),
      ...txt('IDENT_DAS_QUADRAS', 'A', 236085, 9455070),
      '0', 'ENDSEC'].join('\n');
    const r = importarLotesDxf(dxf);
    expect(r.lotes.map(l => l.codigo)).toEqual(['A01', 'A02', 'A02A']);
    expect(r.lotes.find(l => l.codigo === 'A02A')).toMatchObject({ quadra: 'A', numero: 2, areaM2: 2500 });
  });
});

describe('Sincronização do mapa V2 (ruas e geometria) mesmo com o V2 travado no A02', () => {
  it('com o A02 ocupado (V2 não aplica), a sincronização grava as ruas e a geometria; a D16 fica de frente para a Rua Jatobá', async () => {
    const { sincronizarMapaV2BomJardims } = await import('./_core/migrations/bomJardimsProjetoV2');
    const { memorialDoLote } = await import('./lotes/memorial');
    db.run(sql`UPDATE lotes SET clienteNome = 'Cliente Ficticio' WHERE codigo = 'A02'`);
    expect((await aplicarProjetoV2BomJardims()).aplicado).toBe(false);
    const r = await sincronizarMapaV2BomJardims();
    expect(r.aplicado).toBe(true);
    expect(Number((await lote('A02')).areaM2)).toBe(seed.lotes.find((l: any) => l.codigo === 'A02').areaM2); // A02 intocado
    const emp = (await db.select().from(schema.empreendimentos))[0];
    const ruas = typeof emp.ruas === 'string' ? JSON.parse(emp.ruas) : emp.ruas;
    const todos = (await db.select().from(schema.lotes)).map((l: any) => ({ codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: Number(l.areaM2), perimetroM: Number(l.perimetroM), verticesUtm: typeof l.verticesUtm === 'string' ? JSON.parse(l.verticesUtm) : (l.verticesUtm ?? []) }));
    const d16 = todos.find((l: any) => l.codigo === 'D16');
    const m = memorialDoLote(d16, todos.filter((l: any) => l.verticesUtm.length >= 3), { nome: 'BJ', fuso: 23, ruas });
    expect(m.vertices.map(v => v.confronta)).toContain('a Rua Jatobá');
    expect(m.vertices.map(v => v.confronta)).not.toContain('a Rua Walter e Maria');
    expect((await sincronizarMapaV2BomJardims()).aplicado).toBe(false); // uma vez só
  });
});
