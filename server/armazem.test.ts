import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

// Banco local em memória e um Cloudinary simulado (confere as assinaturas como o real)
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.CLOUDINARY_URL = 'cloudinary://chave123:segredo456@nuvem-teste';

const SEGREDO = 'segredo456';
const guardados = new Map<string, Buffer>();
const criadoEm = new Map<string, string>();
let downloadQuebrado = false;
const assinaturaCerta = (p: Record<string, string>) =>
  createHash('sha256').update(Object.keys(p).sort().map(k => `${k}=${p[k]}`).join('&') + SEGREDO).digest('hex');

async function cloudinaryFalso(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(url));
  const caminho = u.pathname;
  if (caminho.endsWith('/ping')) return new Response('{"status":"ok"}', { status: 200 });
  if (caminho.endsWith('/raw/upload')) {
    const f = init!.body as FormData;
    const p = { public_id: String(f.get('public_id')), timestamp: String(f.get('timestamp')), type: String(f.get('type')) };
    if (f.get('signature') !== assinaturaCerta(p) || p.type !== 'private') return new Response('assinatura', { status: 401 });
    guardados.set(p.public_id, Buffer.from(await (f.get('file') as Blob).arrayBuffer()));
    criadoEm.set(p.public_id, new Date().toISOString());
    return Response.json({ public_id: p.public_id });
  }
  if (caminho.endsWith('/raw/download')) {
    const p = { public_id: u.searchParams.get('public_id')!, timestamp: u.searchParams.get('timestamp')!, type: u.searchParams.get('type')! };
    if (u.searchParams.get('signature') !== assinaturaCerta(p)) return new Response('assinatura', { status: 401 });
    const b = guardados.get(p.public_id);
    if (!b) return new Response('nao achou', { status: 404 });
    return new Response(downloadQuebrado ? Buffer.from('corrompido') : b);
  }
  if (caminho.endsWith('/resources/raw/private')) {
    if (init?.method === 'DELETE') { for (const id of u.searchParams.getAll('public_ids[]')) guardados.delete(id); return Response.json({ deleted: {} }); }
    return Response.json({ resources: Array.from(guardados.keys()).map(id => ({ public_id: id, created_at: criadoEm.get(id) })) });
  }
  return new Response('?', { status: 404 });
}
vi.stubGlobal('fetch', cloudinaryFalso);

const Arm = await import('./arquivos/armazem');
const Mig = await import('./arquivos/migrarArmazem');
const Cred = await import('./credenciais');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { eq, sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

let db: any;
const png = (cor: string) => sharp({ create: { width: 40, height: 30, channels: 3, background: cor } }).png().toBuffer();

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'u1', 'Usuária Teste', 'admin')`);
});
beforeEach(() => { downloadQuebrado = false; Arm._usarFetch(cloudinaryFalso as any); });

describe('armazém de arquivos', () => {
  it('só libera depois do teste de ida e volta; o teste não deixa lixo', async () => {
    expect(await Arm.armazemPronto()).toBe(true);
    expect(Array.from(guardados.keys()).filter(k => k.includes('/teste/'))).toHaveLength(0);
  });

  it('download que não confere: armazém indisponível e o arquivo fica no banco', async () => {
    downloadQuebrado = true;
    expect(await Arm.armazemPronto()).toBe(false);
    const r = await Arm.paraGravar(Buffer.from('conteúdo'), 'documentos');
    expect(r).toEqual({ base64: Buffer.from('conteúdo').toString('base64'), ref: null });
  });

  it('documento novo vai para o armazém (original e páginas), lê de volta e apagar remove do armazém', async () => {
    const img = await png('#2a6');
    const id = await Cred.enviarDocumento(1, 'cnh', img, 'cnh.png', {}, 1);
    const [d]: any[] = await db.select().from(schema.usuarioDocumentos).where(eq(schema.usuarioDocumentos.id, id));
    expect(d.conteudoBase64).toBe('');
    expect(Arm.ehRef(d.arquivoRef)).toBe(true);
    const pags: any[] = await db.select().from(schema.usuarioDocumentoPaginas).where(eq(schema.usuarioDocumentoPaginas.documentoId, id));
    expect(pags.length).toBeGreaterThan(0);
    expect(pags.every(p => p.pngBase64 === '' && Arm.ehRef(p.arquivoRef))).toBe(true);
    // Leitura: original idêntico e página como PNG
    const meta = await Cred.documentoDe(id, { conteudo: true });
    expect((await Cred.arquivoDoDocumento(meta)).equals(img)).toBe(true);
    const pagina = await Cred.paginaDoDocumento(id, 1);
    expect(pagina!.subarray(1, 4).toString()).toBe('PNG');
    // Remover apaga os arquivos no armazém
    const refs = [d.arquivoRef, ...pags.map(p => p.arquivoRef)].map(r => r.slice(Arm.PREFIXO_REF.length));
    await Cred.removerDocumento(id);
    await new Promise(ok => setTimeout(ok, 20));
    expect(refs.some(r => guardados.has(r))).toBe(false);
  });

  it('migração: base64 antigo vai para o armazém, conferido; o banco fica vazio e a leitura continua igual', async () => {
    const img = await png('#a26');
    process.env.ARQUIVOS_NO_BANCO = '1'; // simula documento gravado antes do armazém
    const id = await Cred.enviarDocumento(1, 'outros', img, 'antigo.png', {}, 1);
    delete process.env.ARQUIVOS_NO_BANCO;
    const [antes]: any[] = await db.select().from(schema.usuarioDocumentos).where(eq(schema.usuarioDocumentos.id, id));
    expect(antes.arquivoRef).toBeNull();
    const feitos = await Mig.rodadaDeMigracao(50, 0);
    expect(feitos).toBeGreaterThan(0);
    const [depois]: any[] = await db.select().from(schema.usuarioDocumentos).where(eq(schema.usuarioDocumentos.id, id));
    expect(depois.conteudoBase64).toBe('');
    expect((await Cred.arquivoDoDocumento(await Cred.documentoDe(id, { conteudo: true }))).equals(img)).toBe(true);
    const s = await Mig.situacaoArmazem();
    expect(s.tabelas.every(t => t.pendentes === 0)).toBe(true);
  });

  it('migração com falha na conferência: nada sai do banco', async () => {
    const img = await png('#26a');
    process.env.ARQUIVOS_NO_BANCO = '1';
    const id = await Cred.enviarDocumento(1, 'outros', img, 'falha.png', {}, 1);
    delete process.env.ARQUIVOS_NO_BANCO;
    await Arm.armazemPronto(); // armazém aprovado antes da falha
    downloadQuebrado = true;
    await Mig.rodadaDeMigracao(5, 0);
    const [linha]: any[] = await db.select().from(schema.usuarioDocumentos).where(eq(schema.usuarioDocumentos.id, id));
    expect(linha.arquivoRef).toBeNull();
    expect(Buffer.from(linha.conteudoBase64, 'base64').equals(img)).toBe(true);
    expect(Mig._situacao.ultimoErro).toMatch(/conferência falhou/);
  });

  it('planta em PDF base64 vira arquivo no armazém e o campo vira o link do CRM', async () => {
    const pdf = Buffer.from('%PDF-1.4 planta de teste');
    db.run(sql`INSERT INTO properties (id, denomination, address, price, plantaBaixaUrl) VALUES (7, 'Casa Teste', 'Rua A', '100000', ${'data:application/pdf;base64,' + pdf.toString('base64')})`);
    await Mig.rodadaDeMigracao(10, 0);
    const [p]: any[] = await db.select().from(schema.properties).where(eq(schema.properties.id, 7));
    expect(p.plantaBaixaUrl).toBe('/api/imoveis/7/planta');
    expect((await Arm.lerConteudo(null, p.plantaRef)).equals(pdf)).toBe(true);
    const { plantaParaGravar } = await import('./arquivos/planta');
    expect((await plantaParaGravar(7, '/api/imoveis/7/planta', p.plantaRef)).set).toEqual({}); // salvar sem trocar: mantém
    expect((await plantaParaGravar(7, '', p.plantaRef))).toEqual({ set: { plantaBaixaUrl: '', plantaRef: null }, apagar: [p.plantaRef] });
  });

  it('faxina apaga só o que não tem registro no banco e tem mais de 2 h', async () => {
    guardados.set('romatec_privado/documentos/orfao-velho', Buffer.from('x')); criadoEm.set('romatec_privado/documentos/orfao-velho', '2026-01-01T00:00:00Z');
    guardados.set('romatec_privado/documentos/orfao-novo', Buffer.from('y')); criadoEm.set('romatec_privado/documentos/orfao-novo', new Date().toISOString());
    const emUso = (await db.select().from(schema.usuarioDocumentos)).filter((d: any) => d.arquivoRef).length;
    const r = await Mig.faxinaDeOrfaos();
    expect(r.apagados).toBe(1);
    expect(guardados.has('romatec_privado/documentos/orfao-velho')).toBe(false);
    expect(guardados.has('romatec_privado/documentos/orfao-novo')).toBe(true);
    expect((await db.select().from(schema.usuarioDocumentos)).filter((d: any) => d.arquivoRef).length).toBe(emUso);
  });
});
