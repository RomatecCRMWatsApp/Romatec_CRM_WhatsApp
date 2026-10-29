import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const P = await import('./portais');
const A = await import('./apiParceiros');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('portais (VRSync)', () => {
  it('tipo, origem e listing com escape', () => {
    expect(P.tipoVrsync('Chácara')).toBe('Residential / Farm Ranch');
    expect(P.tipoVrsync('terreno')).toBe('Residential / Land Lot');
    expect(P.origemDoPortal('ZAP')).toBe('portal_zap');
    expect(P.origemDoPortal('OLX')).toBe('portal_olx');
    expect(P.origemDoPortal('VivaReal')).toBe('portal_vivareal');
    const x = P.listingXml({ id: 'BJ-A05', titulo: 'Chácara A05', descricao: 'Água & luz', preco: 95000.4, tipo: 'Residential / Farm Ranch', url: 'https://x/a05', imagens: ['https://x/1.jpg'], areaTerreno: 3025.11, cidade: 'Açailândia', uf: 'MA' });
    expect(x).toContain('<ListingID>BJ-A05</ListingID>');
    expect(x).toContain('<ListPrice currency="BRL">95000</ListPrice>');
    expect(x).toContain('<LotArea unit="square metres">3025</LotArea>');
    expect(x).toContain('<Item medium="image" primary="true">https://x/1.jpg</Item>');
    expect(P.feedXml([])).toContain('<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync"');
    expect(P.tokenValido(P.tokenPortais())).toBe(true);
    expect(P.tokenValido('x')).toBe(false);
  });
});

describe('feed e API com o banco', () => {
  let base = '', server: any, chave = '';
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf, precosPublicos) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA', 0)`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao, precoTabela) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'disponivel', '95000'), (6, 1, 'A06', 'A', 6, '3025', 'reservado', '95000')`);
    db.run(sql`INSERT INTO properties (id, denomination, address, city, state, price, images, codigo, exibirPreco, status, propertyType)
      VALUES (1, 'Casa no Centro', 'Rua A, 10', 'Açailândia', 'MA', '250000', '["https://x/casa.jpg"]', 'IMV-0001', 1, 'available', 'casa'),
             (2, 'Terreno sob consulta', 'Rua B', 'Açailândia', 'MA', '80000', '["https://x/t.jpg"]', 'IMV-0002', 0, 'available', 'terreno')`);
    const app = express();
    app.use(express.json());
    P.registrarRotasPortais(app);
    A.registrarApiParceiros(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    chave = (await A.criarChave({ nome: 'Imobiliária X', escopos: ['lotes:ler', 'imoveis:ler'] }, 1)).chave;
  });
  afterAll(() => server?.close());

  it('feed: só imóvel com preço público; chácaras ficam fora enquanto os preços estão travados', async () => {
    const { anuncios, fora } = await P.anunciosDoFeed();
    expect(anuncios.map(a => a.id)).toEqual(['IMV-0001']);
    expect(fora.map(f => f.motivo)).toEqual(expect.arrayContaining(['preço sob consulta (portais exigem preço)', 'preços do empreendimento ainda travados (precosPublicos desligado)']));
    expect((await fetch(`${base}/feeds/grupo-olx.xml?t=errado`)).status).toBe(404);
    const xml = await (await fetch(`${base}/feeds/grupo-olx.xml?t=${P.tokenPortais()}`)).text();
    expect(xml).toContain('<ListingID>IMV-0001</ListingID>');
  });

  it('API: chave válida lê as chácaras sem preço (travado); sem escopo de leads não envia', async () => {
    expect((await fetch(`${base}/api/v1/empreendimentos`)).status).toBe(401);
    const h = { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
    const r = await (await fetch(`${base}/api/v1/empreendimentos/bom-jardims/chacaras`, { headers: h })).json();
    expect(r.chacaras.map((c: any) => [c.codigo, c.preco])).toEqual([['A05', null], ['A06', null]]);
    const im = await (await fetch(`${base}/api/v1/imoveis`, { headers: h })).json();
    expect(im.imoveis.find((i: any) => i.codigo === 'IMV-0002').preco).toBeNull();
    expect((await fetch(`${base}/api/v1/leads`, { method: 'POST', headers: h, body: '{}' })).status).toBe(403);
    await A.alterarChave((await A.listarChaves())[0].id, false);
    expect((await fetch(`${base}/api/v1/imoveis`, { headers: h })).status).toBe(401);
  });

  it('API: lead exige consentimento e telefone', async () => {
    const k2 = (await A.criarChave({ nome: 'Site Y', escopos: ['leads:criar'] }, 1)).chave;
    const h = { Authorization: `Bearer ${k2}`, 'Content-Type': 'application/json' };
    const sem = await fetch(`${base}/api/v1/leads`, { method: 'POST', headers: h, body: JSON.stringify({ nome: 'Maria', telefone: '99999990000' }) });
    expect(sem.status).toBe(400);
    expect((await sem.json()).campo).toBe('consentimento');
  });
});
