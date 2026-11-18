import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { unzipSync, strFromU8 } from 'fflate';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste-parceiros';

const P = await import('./materiaisParceiros');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { limparCacheConfig } = await import('./configSistema');
const express = (await import('express')).default;

// Dados fictícios. Os arquivos "vêm do Cloudinary" por um fetch simulado.
const ARQUIVOS: Record<string, string> = {
  'https://res.cloudinary.test/feed.jpg': 'JPG-FEED',
  'https://res.cloudinary.test/folder.pdf': 'PDF-FOLDER',
  'https://res.cloudinary.test/preco.jpg': 'JPG-PRECO',
  'https://res.cloudinary.test/outro.png': 'PNG-OUTRO',
};
const fetchReal = globalThis.fetch;
let base = '';
let servidor: any;

beforeAll(async () => {
  const db: any = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (2, 'outro-emp', 'Outro Empreendimento', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO materiais (id, empreendimentoSlug, titulo, tipo, url, mime, liberado, ordem) VALUES (1, 'bom-jardims', 'Feed lançamento', 'feed', 'https://res.cloudinary.test/feed.jpg', 'image/jpeg', 1, 0)`);
  db.run(sql`INSERT INTO materiais (id, empreendimentoSlug, titulo, tipo, url, mime, liberado, ordem) VALUES (2, 'bom-jardims', 'Folder', 'folder', 'https://res.cloudinary.test/folder.pdf', 'application/pdf', 1, 0)`);
  db.run(sql`INSERT INTO materiais (id, empreendimentoSlug, titulo, tipo, url, mime, liberado, ordem) VALUES (3, 'bom-jardims', 'Tabela de preços', 'card', 'https://res.cloudinary.test/preco.jpg', 'image/jpeg', 0, 0)`);
  db.run(sql`INSERT INTO materiais (id, empreendimentoSlug, titulo, tipo, url, mime, liberado, ordem) VALUES (4, 'outro-emp', 'Feed lançamento', 'feed', 'https://res.cloudinary.test/outro.png', 'image/png', 1, 0)`);
  vi.stubGlobal('fetch', async (url: any, init?: any) => {
    const u = String(url);
    if (u in ARQUIVOS) return new Response(ARQUIVOS[u], { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    return fetchReal(url, init);
  });
  const app = express();
  P.registrarRotasMateriaisParceiros(app);
  servidor = app.listen(0, '127.0.0.1');
  await new Promise(r => servidor.once('listening', r));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => { servidor?.close(); vi.unstubAllGlobals(); });

const caminhoDe = (url: string) => { const u = new URL(url); return `${u.pathname}${u.search}`; };

describe('link de materiais para parceiros', () => {
  it('só os liberados; "não divulgar" fica de fora; filtro por empreendimento', async () => {
    const todos = (await P.materiaisParaParceiros(null)).flatMap(g => g.itens.map(i => i.id)).sort();
    expect(todos).toEqual([1, 2, 4]);
    const bj = (await P.materiaisParaParceiros('bom-jardims')).flatMap(g => g.itens.map(i => i.id)).sort();
    expect(bj).toEqual([1, 2]);
  });

  it('página abre com o link assinado e lista as peças com download e ZIP', async () => {
    const { url } = await P.gerarLinkParceiros('bom-jardims', 30);
    const r = await fetchReal(`${base}${caminhoDe(url)}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('Feed lançamento');
    expect(html).toContain('Folder');
    expect(html).not.toContain('Tabela de preços');
    expect(html).toContain('/m/parceiros/pacote.zip?');
    expect(html).toContain('noindex');
  });

  it('link adulterado (outro empreendimento) ou vencido não abre', async () => {
    const { url } = await P.gerarLinkParceiros('bom-jardims', 7);
    const adulterado = caminhoDe(url).replace('emp=bom-jardims', 'emp=todos');
    expect((await fetchReal(`${base}${adulterado}`)).status).toBe(410);
    const velho = await P.gerarLinkParceiros(null, 7, Date.now() - 8 * 86_400_000);
    expect((await fetchReal(`${base}${caminhoDe(velho.url)}`)).status).toBe(410);
    await expect(P.gerarLinkParceiros(null, 45)).rejects.toThrow(/Validade/);
  });

  it('baixa uma peça liberada; a "não divulgar" não sai nem pelo id', async () => {
    const { url } = await P.gerarLinkParceiros('bom-jardims', 30);
    const q = new URL(url).search;
    const ok = await fetchReal(`${base}/m/parceiros/arquivo/1${q}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toMatch(/Feed lancamento\.jpg/);
    expect(await ok.text()).toBe('JPG-FEED');
    expect((await fetchReal(`${base}/m/parceiros/arquivo/3${q}`)).status).toBe(404);
    expect((await fetchReal(`${base}/m/parceiros/arquivo/4${q}`)).status).toBe(404); // outro empreendimento
  });

  it('ZIP com todos os liberados, organizados por empreendimento, sem nomes repetidos', async () => {
    const { url } = await P.gerarLinkParceiros(null, 30);
    const r = await fetchReal(`${base}/m/parceiros/pacote.zip${new URL(url).search}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/zip/);
    const arquivos = unzipSync(new Uint8Array(await r.arrayBuffer()));
    expect(Object.keys(arquivos).sort()).toEqual([
      'Condominio de Chacaras Bom Jardims/Feed lancamento.jpg',
      'Condominio de Chacaras Bom Jardims/Folder.pdf',
      'Outro Empreendimento/Feed lancamento.png',
    ]);
    expect(strFromU8(arquivos['Condominio de Chacaras Bom Jardims/Folder.pdf'])).toBe('PDF-FOLDER');
  });

  it('revogar derruba os links já enviados; o novo funciona', async () => {
    const antes = await P.gerarLinkParceiros(null, 30);
    await P.revogarLinksParceiros(1);
    limparCacheConfig();
    expect((await fetchReal(`${base}${caminhoDe(antes.url)}`)).status).toBe(410);
    const depois = await P.gerarLinkParceiros(null, 30);
    expect((await fetchReal(`${base}${caminhoDe(depois.url)}`)).status).toBe(200);
  });

  it('nomes no ZIP: acentos removidos e repetidos numerados', () => {
    const it = (id: number, titulo: string) => ({ id, titulo, tipo: 'feed', url: 'https://x.test/a.jpg', mime: 'image/jpeg', tamanhoBytes: null, grupo: 'Bom Jardims' });
    const n = P.nomesNoZip([it(1, 'Lançamento'), it(2, 'Lançamento'), it(3, 'lançamento')]);
    expect([...n.values()]).toEqual(['Bom Jardims/Lancamento.jpg', 'Bom Jardims/Lancamento (2).jpg', 'Bom Jardims/lancamento (3).jpg']);
  });
});
