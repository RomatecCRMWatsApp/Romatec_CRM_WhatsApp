import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const P = await import('./passeio/servico');
const SOL = await import('../shared/sol');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

let db: any;
const ADMIN = { perfil: 'admin', acessos: [] } as any;
const CORRETOR = { perfil: 'corretor', acessos: [{ tipo: 'empreendimento', refId: 2 }] } as any;
const EMPREENDEDOR = { perfil: 'empreendedor', acessos: [{ tipo: 'empreendimento', refId: 2 }] } as any;
const POL = JSON.stringify([[-47.38, -4.93], [-47.379, -4.93], [-47.379, -4.931], [-47.38, -4.931], [-47.38, -4.93]]);

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf, precosPublicos) VALUES (2, 'teste-loteamento', 'Loteamento Teste', 'Açailândia', 'MA', 1), (3, 'sem-preco', 'Sem Preço', 'Açailândia', 'MA', 0)`);
  db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao, poligono, precoAvistaRef) VALUES
    (21, 2, 'A01', 'A', 1, '2500', 'disponivel', ${POL}, '90000'),
    (22, 2, 'A02', 'A', 2, '2500', 'vendido_parcelado', ${POL}, '90000'),
    (23, 2, 'A03', 'A', 3, '2500', 'reservado', ${POL}, '90000'),
    (31, 3, 'B01', 'B', 1, '2500', 'disponivel', ${POL}, '80000')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, telefone, creci) VALUES (7, 'c7', 'Corretora Teste', 'user', '99991112222', '9999'), (8, 'c8', 'Outro Corretor', 'user', NULL, NULL)`);
  db.run(sql`INSERT INTO leadQualifications (id, phone, answers) VALUES (50, '5599988887777', '{"nome":"Cliente Confidencial","cpf":"52998224725"}')`);
});

describe('sol', () => {
  it('Açailândia em 26/11: nasce ~05:46, põe ~18:08, quase a pino ao meio-dia', () => {
    const np = SOL.nascerEPor('2026-11-26', -4.947, -47.5)!;
    expect(Math.abs(np.nascer - (5 * 60 + 46))).toBeLessThanOrEqual(3);
    expect(Math.abs(np.por - (18 * 60 + 8))).toBeLessThanOrEqual(3);
    const meio = SOL.posicaoSol(SOL.instanteLocal('2026-11-26', 12 * 60), -4.947, -47.5);
    expect(meio.altura).toBeGreaterThan(70);
  });
  it('de manhã o sol está a leste, de tarde a oeste', () => {
    const manha = SOL.posicaoSol(SOL.instanteLocal('2026-11-26', 8 * 60), -4.947, -47.5);
    const tarde = SOL.posicaoSol(SOL.instanteLocal('2026-11-26', 16 * 60), -4.947, -47.5);
    expect(manha.azimute).toBeGreaterThan(45); expect(manha.azimute).toBeLessThan(135);
    expect(tarde.azimute).toBeGreaterThan(225); expect(tarde.azimute).toBeLessThan(315);
  });
});

describe('situação pública', () => {
  it('vendido nunca aparece como disponível', () => {
    for (const s of ['vendido_parcelado', 'vendido_avista', 'quitado', 'concedido']) expect(P.situacaoPublica(s)).toBe('vendido');
    expect(P.situacaoPublica('reservado')).toBe('reservado');
    expect(P.situacaoPublica('entrada')).toBe('reservado');
    expect(P.situacaoPublica('bloqueado')).toBe('indisponivel');
    expect(P.situacaoPublica('disponivel', 'disponivel', false)).toBe('indisponivel');
    expect(P.situacaoPublica('disponivel')).toBe('disponivel');
  });
});

describe('links', () => {
  let token = '';
  it('corretor gera; empreendedor não', async () => {
    const r = await P.criarLink(CORRETOR, 7, { empreendimentoId: 2, loteId: 21, leadId: 50, mostrarPreco: true });
    token = r.token;
    expect(token).toMatch(/^[\w-]{16}$/);
    expect(r.caminho).toBe(`/p/${token}`);
    await expect(P.criarLink(EMPREENDEDOR, 9, { empreendimentoId: 2 })).rejects.toThrow(/permissão/);
  });

  it('dados públicos: só os campos permitidos, sem dados do cliente', async () => {
    const d: any = await P.dadosPublicos(token);
    expect(d.ok).toBe(true);
    expect(d.lotes.map((l: any) => [l.codigo, l.situacao])).toEqual([['A01', 'disponivel'], ['A02', 'vendido'], ['A03', 'reservado']]);
    expect(d.lotes[0].preco).toBe(90000);
    expect(d.lotes[1].preco).toBeNull();
    expect(d.loteDestaqueId).toBe(21);
    expect(d.contato).toMatchObject({ nome: 'Corretora Teste', whatsapp: '5599991112222', creci: '9999' });
    const txt = JSON.stringify(d);
    expect(txt).not.toMatch(/Confidencial|52998224725|5599988887777|clienteNome|valorVenda|leadId/);
    expect(Object.keys(d.lotes[0]).sort()).toEqual(['areaM2', 'centro', 'codigo', 'id', 'numero', 'perimetroM', 'poligono', 'preco', 'quadra', 'situacao']);
  });

  it('preço some quando o empreendimento não libera preço público', async () => {
    const r = await P.criarLink(ADMIN, 1, { empreendimentoId: 3, mostrarPreco: true });
    const d: any = await P.dadosPublicos(r.token);
    expect(d.mostrarPreco).toBe(false);
    expect(d.lotes[0].preco).toBeNull();
  });

  it('inválido, expirado e desativado viram tela amigável', async () => {
    expect(await P.dadosPublicos('nao-existe-1234')).toMatchObject({ ok: false, motivo: 'invalido' });
    const r = await P.criarLink(CORRETOR, 7, { empreendimentoId: 2, dias: 1 });
    expect(await P.dadosPublicos(r.token, Date.now() + 2 * 86_400_000)).toMatchObject({ ok: false, motivo: 'expirado' });
    const [l] = (await P.listarLinks(CORRETOR, 7, 2)).filter(x => x.token === r.token);
    await expect(P.desativarLink(CORRETOR, 8, l.id)).rejects.toThrow(/Só quem gerou/);
    await P.desativarLink(CORRETOR, 7, l.id);
    expect(await P.dadosPublicos(r.token)).toMatchObject({ ok: false, motivo: 'desativado' });
  });

  it('eventos: abertura conta uma vez por sessão; clique em "Quero" aparece na lista', async () => {
    await P.registrarEvento(token, { tipo: 'open', sessao: 'sess-a', ua: 'Mozilla/5.0 (iPhone) Safari WhatsApp' });
    expect(await P.registrarEvento(token, { tipo: 'open', sessao: 'sess-a' })).toMatchObject({ repetido: true });
    await P.registrarEvento(token, { tipo: 'open', sessao: 'sess-b' });
    await P.registrarEvento(token, { tipo: 'cta_click', sessao: 'sess-b', loteId: 21 });
    // Lote de outro empreendimento não é gravado
    await P.registrarEvento(token, { tipo: 'lote_view', sessao: 'sess-b', loteId: 31 });
    await expect(P.registrarEvento(token, { tipo: 'hack' })).rejects.toThrow(/inválido/);
    const [l] = (await P.listarLinks(CORRETOR, 7, 2)).filter(x => x.token === token);
    expect(l).toMatchObject({ aberturas: 2, cliques: 1, lote: 'A01', lead: 'Cliente Confidencial', situacao: 'ativo' });
    const [ev]: any[] = db.all(sql`SELECT loteId, ua FROM tourEventos WHERE tipo = 'lote_view'`);
    expect(ev.loteId).toBeNull();
    const [ab]: any[] = db.all(sql`SELECT ua FROM tourEventos WHERE sessao = 'sess-a'`);
    expect(ab.ua).toBe('iOS · Safari · WhatsApp');
  });

  it('corretor só vê os próprios links; o escritório vê todos', async () => {
    await P.criarLink(ADMIN, 1, { empreendimentoId: 2 });
    expect((await P.listarLinks(CORRETOR, 7, 2)).every(l => l.corretor === 'Corretora Teste')).toBe(true);
    expect((await P.listarLinks(ADMIN, 1, 2)).length).toBeGreaterThan((await P.listarLinks(CORRETOR, 7, 2)).length);
  });
});
