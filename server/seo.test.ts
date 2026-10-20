import { describe, it, expect } from 'vitest';
import { metaDaRota, metaDoImovel, injetarMeta, robotsTxt, sitemapXml, META_BOM_JARDIMS } from './seo';

const HTML = `<html><head>
    <title>Romatec CRM</title>
    <meta name="description" content="Romatec CRM - Customer Relationship Management | Sistema de Gestão de Clientes + Vendas" />
</head><body></body></html>`;
const BASE = 'https://romateccrm.com';

describe('SEO das páginas públicas', () => {
  it('/bom-jardims chega ao Google com título, descrição e prévia próprios — sem preço', () => {
    expect(metaDaRota('/bom-jardims/')).toBe(META_BOM_JARDIMS);
    const html = injetarMeta(HTML, META_BOM_JARDIMS, BASE);
    expect(html).toContain('<title>Chácaras Bom Jardims | Condomínio de Chácaras em Açailândia - MA</title>');
    expect(html).not.toContain('Customer Relationship');
    expect(html).toContain('<link rel="canonical" href="https://romateccrm.com/bom-jardims" />');
    expect(html).toContain('<meta property="og:image" content="https://romateccrm.com/bom-jardims/og.jpg" />');
    expect(html).toContain('"@type":"Place"');
    expect(html).toContain('CRECI/MA 4.705');
    expect(html).not.toMatch(/R\$|reais|parcela|entrada/i);
    expect(html).toContain('content="index, follow"');
  });

  it('/bom-jardims: nomes alternativos, perguntas frequentes e texto no HTML antes do JavaScript', () => {
    const html = injetarMeta(HTML.replace('<body></body>', '<body><div id="root"></div></body>'), META_BOM_JARDIMS, BASE);
    expect(html).toContain('"alternateName":["Chácaras Bom Jardims"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('Bom Jardims ou Bom Jardim?');
    expect(html).toContain('"@type":"GeoCoordinates"');
    expect(html).toMatch(/<div id="root"><main[^>]*><h1>Chácaras Bom Jardims — Condomínio de Chácaras em Açailândia\/MA<\/h1>/);
    expect(html).not.toMatch(/R\$|reais|parcela|entrada|últimas|poucas unidades/i);
    // Outras páginas não ganham o texto do Bom Jardims
    expect(injetarMeta('<div id="root"></div>', metaDaRota('/imoveis'), BASE)).toContain('<div id="root"></div>');
  });

  it('telas do CRM ficam fora do Google (noindex)', () => {
    for (const p of ['/dashboard', '/leads/relatorio', '/materiais', '/login']) {
      const m = metaDaRota(p);
      expect(m !== 'imovel' && m.indexavel).toBe(false);
    }
    const m = metaDaRota('/leads') as any;
    expect(injetarMeta(HTML, m, BASE)).toContain('content="noindex, nofollow"');
  });

  it('página de imóvel: nome, cidade e código; nunca preço; texto escapado', () => {
    expect(metaDaRota('/i/IMV-0003')).toBe('imovel');
    expect(metaDaRota('/imovel/casa-centro')).toBe('imovel');
    const m = metaDoImovel({ codigo: 'IMV-0003', denomination: 'Casa "Centro" <3 quartos>', city: 'Açailândia', state: 'MA', description: 'Casa ampla por R$ 350.000 com quintal. '.repeat(10), images: ['https://res.cloudinary.com/x/foto.jpg'] }, '/i/IMV-0003');
    expect(m.title.length).toBeLessThanOrEqual(70);
    expect(m.description.length).toBeLessThanOrEqual(200);
    const html = injetarMeta(HTML, m, BASE);
    expect(html).toContain('&quot;Centro&quot; &lt;3 quartos&gt;');
    expect(html).toContain('og:image" content="https://res.cloudinary.com/x/foto.jpg"');
    expect(html).not.toContain('<3 quartos>');
    expect(m.description).not.toMatch(/R\$|350\.000/);
  });

  it('JSON-LD não fecha a tag <script> com "<"', () => {
    const html = injetarMeta(HTML, { ...META_BOM_JARDIMS, jsonLd: { name: '</script><script>alert(1)</script>' } }, BASE);
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\u003c/script>');
  });

  it('robots.txt libera o site, bloqueia o CRM e aponta o sitemap', () => {
    const r = robotsTxt(BASE);
    expect(r).toContain('Allow: /');
    expect(r).toContain('Disallow: /dashboard');
    expect(r).toContain('Disallow: /api/');
    expect(r).toContain('Sitemap: https://romateccrm.com/sitemap.xml');
    expect(r).not.toContain('Disallow: /bom-jardims');
  });

  it('sitemap.xml com as páginas públicas', () => {
    const x = sitemapXml(BASE, [{ path: '/bom-jardims' }, { path: '/i/IMV-0001', lastmod: '2026-10-17T12:00:00Z' }]);
    expect(x).toContain('<loc>https://romateccrm.com/bom-jardims</loc>');
    expect(x).toContain('<loc>https://romateccrm.com/i/IMV-0001</loc><lastmod>2026-10-17</lastmod>');
    expect(x.startsWith('<?xml')).toBe(true);
  });
});
