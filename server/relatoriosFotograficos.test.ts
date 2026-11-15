import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./relatorios/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;
const { PDFDocument } = await import('pdf-lib');
const R = await import('../shared/relatoriosFotograficos');

// Relatórios fotográficos: autorização, rascunho/final, fotos privadas, PDF e isolamento. Dados fictícios.
let db: any;
const admin = { id: 1, perfil: 'admin' }, corA = { id: 2, perfil: 'corretor' }, corB = { id: 3, perfil: 'corretor' }, emp = { id: 4, perfil: 'empreendedor' };
const base = { titulo: 'Visita de acompanhamento (exemplo)', tipoAtividade: 'visita' as const, dataAtividade: '2026-11-10' };
const jpeg = (w = 1200, h = 800) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 120, b: 70 } } }).jpeg().toBuffer();
const png = () => sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 200, g: 170, b: 80, alpha: 1 } } }).png().toBuffer();

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'u1', 'Admin Exemplo', 'admin')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil) VALUES (2, 'u2', 'Corretora A Ficticia', 'user', 'corretor')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil) VALUES (3, 'u3', 'Corretor B Ficticio', 'user', 'corretor')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil) VALUES (4, 'u4', 'Empreendedor Ficticio', 'user', 'empreendedor')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'exemplo', 'Empreendimento Exemplo')`);
});

describe('regras puras', () => {
  it('perfis, acesso e data', () => {
    expect(R.podeUsarRelatorios('corretor')).toBe(true);
    expect(R.podeUsarRelatorios('empreendedor')).toBe(false);
    expect(R.podeVerRelatorio('corretor', 2, { responsavelUserId: 3, criadoPor: 3 })).toBe(false);
    expect(R.podeEditarRelatorio('admin', 1, { status: 'final', responsavelUserId: 2, criadoPor: 2 })).toBe(false);
    expect(R.dataAtividadeValida('2026-02-30')).toBe(false);
    expect(R.moverNaLista([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(R.numeroRelatorio(2026, 7)).toBe('RF-2026-0007');
  });
});

describe('ciclo do relatório', () => {
  let id = 0;
  it('corretor cria rascunho; responsável é sempre ele mesmo', async () => {
    const r = await S.criarRelatorio(corA, { ...base, responsavelUserId: 3, empreendimentoId: 1 });
    id = r.id;
    expect(r.numero).toMatch(/^RF-\d{4}-0001$/);
    const o = await S.obterRelatorio(corA, id);
    expect(o.responsavelUserId).toBe(2);
    expect(o.status).toBe('draft');
    expect(o.nomes.empreendimento).toBe('Empreendimento Exemplo');
  });

  it('isolamento: outro corretor e empreendedor não veem; admin vê', async () => {
    await expect(S.obterRelatorio(corB, id)).rejects.toThrow(/não encontrado/);
    await expect(S.obterRelatorio(emp, id)).rejects.toThrow(/não usa/);
    expect((await S.listarRelatorios(corB)).length).toBe(0);
    expect((await S.listarRelatorios(admin)).length).toBe(1);
  });

  it('fotos: valida pelo conteúdo, preserva original, gera prévia e miniatura privadas', async () => {
    await expect(S.adicionarFoto(corA, id, Buffer.from('nao e imagem'))).rejects.toThrow(/imagem válida/);
    const f1 = await S.adicionarFoto(corA, id, await jpeg(), { nome: 'campo.jpg', origem: 'camera' });
    const f2 = await S.adicionarFoto(corA, id, await png(), { nome: 'foto.jpg', origem: 'gallery', geo: { lat: -4.95, lng: -47.5 } });
    expect(f1.mime).toBe('image/jpeg');
    expect(f2.mime).toBe('image/png'); // extensão .jpg ignorada: vale o conteúdo
    expect(f2.geo).toEqual({ lat: -4.95, lng: -47.5 });
    const orig = await S.arquivoDaFoto(corA, f2.uid, 'original');
    expect(orig.buf.subarray(1, 4).toString()).toBe('PNG');
    const mini = await S.arquivoDaFoto(admin, f1.uid, 'miniatura');
    expect((await sharp(mini.buf).metadata()).width).toBeLessThanOrEqual(420);
    await expect(S.arquivoDaFoto(corB, f1.uid, 'previa')).rejects.toThrow(/não encontrado/);
  });

  it('legenda, seleção do cliente, ordem e remoção', async () => {
    const o = await S.obterRelatorio(corA, id);
    const [a, b] = o.fotos;
    await S.atualizarFoto(corA, id, a.id, { legenda: 'Fachada (exemplo)' });
    await S.atualizarFoto(corA, id, b.id, { incluirCliente: false });
    await S.reordenarFotos(corA, id, [b.id, a.id]);
    await expect(S.reordenarFotos(corA, id, [a.id])).rejects.toThrow(/não corresponde/);
    const o2 = await S.obterRelatorio(corA, id);
    expect(o2.fotos.map(f => f.id)).toEqual([b.id, a.id]);
    expect(o2.fotos[1].legenda).toBe('Fachada (exemplo)');
    expect(o2.fotos[0].incluirCliente).toBe(false);
  });

  it('PDF paginado (interno e cliente) sem alterar fotos', async () => {
    const interno = await S.gerarPdfRelatorio(corA, id, { previa: true });
    const doc = await PDFDocument.load(interno.buf);
    expect(doc.getPageCount()).toBe(2); // capa + 1 página com 2 fotos
    expect(interno.nome).toMatch(/rascunho/);
    const cli = await S.gerarPdfRelatorio(corA, id, { cliente: true });
    expect((await PDFDocument.load(cli.buf)).getPageCount()).toBe(2);
    expect((await S.obterRelatorio(corA, id)).fotos).toHaveLength(2);
  });

  it('final é somente leitura; correção gera rascunho derivado e o final fica intacto', async () => {
    await S.finalizarRelatorio(corA, id);
    await expect(S.atualizarRelatorio(corA, id, base)).rejects.toThrow(/somente leitura/);
    await expect(S.adicionarFoto(corA, id, await jpeg())).rejects.toThrow(/somente leitura/);
    await expect(S.excluirRascunho(admin, id)).rejects.toThrow(/somente leitura/);
    const novo = await S.derivarRelatorio(corA, id);
    const n = await S.obterRelatorio(corA, novo.id);
    expect(n.status).toBe('draft');
    expect(n.derivadoDe).toMatch(/^RF-/);
    expect(n.fotos).toHaveLength(2);
    await S.removerFoto(corA, novo.id, n.fotos[0].id);
    expect((await S.obterRelatorio(corA, id)).fotos).toHaveLength(2);
    expect((await S.obterRelatorio(corA, novo.id)).fotos).toHaveLength(1);
  });

  it('finalizar exige foto; data alterada fica registrada', async () => {
    const r = await S.criarRelatorio(admin, { ...base, responsavelUserId: 2 });
    await expect(S.finalizarRelatorio(admin, r.id)).rejects.toThrow(/ao menos uma foto/);
    await S.atualizarRelatorio(admin, r.id, { ...base, dataAtividade: '2026-11-11', responsavelUserId: 2 });
    const o = await S.obterRelatorio(corA, r.id); // corretora A é a responsável
    expect(o.dataAtividadeOrigem).toBe('edited_by_user');
    await S.excluirRascunho(corA, r.id);
    await expect(S.obterRelatorio(admin, r.id)).rejects.toThrow(/não encontrado/);
  });
});
