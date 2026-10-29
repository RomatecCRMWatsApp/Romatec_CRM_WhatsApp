import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { definirGerador, registrarRotasDocumentosCliente, remetenteDoLink, textoCarimbo } from './documentosCliente';
import { DOCUMENTOS_CLIENTE, documentoCliente, linkDocumento, linkIndiceDocumentos } from '../shared/documentosCliente';

describe('documentos para o cliente — catálogo', () => {
  it('tem contrato, Estatuto, anexos, carteirinha e crachá, com slugs únicos e texto com {link}', () => {
    const slugs = DOCUMENTOS_CLIENTE.map(d => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(expect.arrayContaining(['contrato', 'intermediacao', 'estatuto', 'diretrizes', 'tarifa-agua', 'carteirinha', 'cracha-visitante']));
    for (const d of DOCUMENTOS_CLIENTE) expect(d.textoWhatsapp).toContain('{link}');
    expect(documentoCliente('carteirinha')?.forma).toBe('cartao');
  });

  it('link leva o ?c= de quem compartilha', () => {
    expect(linkDocumento('https://romateccrm.com/', 'bom-jardims', 'estatuto', 'abc123XYZ')).toBe('https://romateccrm.com/documentos/bom-jardims/estatuto?c=abc123XYZ');
    expect(linkIndiceDocumentos('https://romateccrm.com', 'bom-jardims', null)).toBe('https://romateccrm.com/documentos/bom-jardims');
  });
});

describe('documentos para o cliente — rotas públicas (só imagens)', () => {
  let base = '';
  let server: any;
  let chamadas = 0;
  beforeAll(async () => {
    const pag = await sharp({ create: { width: 600, height: 850, channels: 3, background: '#ffffff' } }).webp().toBuffer();
    definirGerador(async () => { chamadas++; return [pag, pag]; });
    const app = express();
    registrarRotasDocumentosCliente(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server?.close(); definirGerador(null); });

  it('informa as páginas e entrega cada uma como WEBP, nunca o PDF', async () => {
    const r = await fetch(`${base}/api/public/documentos/bom-jardims/estatuto`);
    expect(await r.json()).toEqual({ ok: true, paginas: 2 });
    const img = await fetch(`${base}/api/public/documentos/bom-jardims/estatuto/2.webp`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/webp');
    expect(img.headers.get('x-robots-tag')).toBe('noindex');
    expect((await fetch(`${base}/api/public/documentos/bom-jardims/estatuto/3.webp`)).status).toBe(404);
    expect(chamadas).toBe(1); // cache: gera uma vez
  });

  it('carimba a página (a imagem muda) e identifica quem enviou', async () => {
    const img = Buffer.from(await (await fetch(`${base}/api/public/documentos/bom-jardims/estatuto/1.webp`)).arrayBuffer());
    const { width } = await sharp(img).metadata();
    expect(width).toBe(600);
    const st = await sharp(img).stats();
    expect(st.channels[0].min).toBeLessThan(255); // tem o carimbo por cima da página branca
    const r = await remetenteDoLink(undefined);
    expect(textoCarimbo(r)).toMatch(/^Enviado por Romatec Consultoria Total · CRECI\/MA 4\.705 · \d{2}\/\d{2}\/\d{4}$/);
    expect(textoCarimbo({ id: 3, nome: 'Ana', creci: 'CRECI/MA 9.999', ref: 'abc123XYZ' })).toContain('Enviado por Ana · CRECI/MA 9.999 · cód. abc123XYZ · ');
  });

  it('recusa empreendimento, documento ou cartão que não é PDF', async () => {
    expect((await fetch(`${base}/api/public/documentos/outro/estatuto`)).status).toBe(404);
    expect((await fetch(`${base}/api/public/documentos/bom-jardims/boleto`)).status).toBe(404);
    expect((await fetch(`${base}/api/public/documentos/bom-jardims/carteirinha`)).status).toBe(404);
  });
});
