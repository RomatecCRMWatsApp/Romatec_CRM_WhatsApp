import { describe, it, expect } from 'vitest';
import { metaDaRota, metaDoImovel, injetarMeta, robotsTxt, sitemapXml, META_BOM_JARDIMS, META_AGENDAR_BOM_JARDIMS } from './seo';
import { FAQ_BOM_JARDIMS, SOBRE_BOM_JARDIMS } from '../shared/bomJardimsSeo';

/** Todos os blocos JSON-LD do HTML, já interpretados (falha se algum não for JSON válido) */
const jsonLdDo = (html: string) => html.split('<script type="application/ld+json">').slice(1).map(p => JSON.parse(p.split('</script>')[0]));

const HTML = `<html><head>
    <title>Romatec CRM</title>
    <meta name="description" content="Romatec CRM - Customer Relationship Management | Sistema de Gestão de Clientes + Vendas" />
</head><body></body></html>`;
const BASE = 'https://romateccrm.com';

describe('SEO das páginas públicas', () => {
  it('/bom-jardims chega ao Google com título, descrição e prévia próprios — sem preço', () => {
    expect(metaDaRota('/bom-jardims/')).toBe(META_BOM_JARDIMS);
    const html = injetarMeta(HTML, META_BOM_JARDIMS, BASE);
    expect(html).toContain('<title>Condomínio de Chácaras em Açailândia/MA — Chácaras Bom Jardims à venda</title>');
    expect(META_BOM_JARDIMS.description.length).toBeLessThanOrEqual(180);
    expect(META_BOM_JARDIMS.description).toContain('Chácaras à venda em Açailândia/MA');
    expect(html).not.toContain('Customer Relationship');
    expect(html).toContain('<link rel="canonical" href="https://romateccrm.com/bom-jardims" />');
    expect(html).toContain('<meta property="og:image" content="https://romateccrm.com/bom-jardims/og.jpg" />');
    expect(html).toContain('"@type":"GatedResidenceCommunity"');
    expect(html).toContain('CRECI/MA 4.705');
    expect(html).not.toMatch(/R\$|reais|parcela|entrada/i);
    expect(html).toContain('content="index, follow, max-image-preview:large"');
  });

  it('/bom-jardims: nomes alternativos, perguntas frequentes e texto no HTML antes do JavaScript', () => {
    const html = injetarMeta(HTML.replace('<body></body>', '<body><div id="root"></div></body>'), META_BOM_JARDIMS, BASE);
    expect(html).toContain('"alternateName":["Chácaras Bom Jardims"');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('Bom Jardims ou Bom Jardim?');
    expect(html).toContain('"@type":"GeoCoordinates"');
    expect(html).toMatch(/<div id="root"><main[^>]*><img [^>]*alt="Portal de acesso do Condomínio de Chácaras Bom Jardims[^"]*"[^>]*\/><h1>Chácaras Bom Jardims — Condomínio de Chácaras em Açailândia\/MA<\/h1>/);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    // Texto "Sobre" e o botão de agendamento no HTML inicial
    for (const b of SOBRE_BOM_JARDIMS) expect(html).toContain(`<h3>${b.titulo}</h3>`);
    expect(html).toContain('href="/agendar/bom-jardims"');
    expect(html).toContain('Bom Jardins');
    expect(html).not.toMatch(/R\$|reais|parcela|entrada|últimas|poucas unidades/i);
    // Outras páginas não ganham o texto do Bom Jardims
    expect(injetarMeta('<div id="root"></div>', metaDaRota('/imoveis'), BASE)).toContain('<div id="root"></div>');
  });

  it('/bom-jardims: JSON-LD válido (condomínio, anúncio, imobiliária, FAQ igual ao da página, trilha) e prévia para redes sociais', () => {
    const html = injetarMeta(HTML, META_BOM_JARDIMS, BASE);
    const [ld] = jsonLdDo(html);
    const tipos = ld['@graph'].map((n: any) => n['@type']);
    expect(tipos).toEqual(['GatedResidenceCommunity', 'RealEstateListing', 'RealEstateAgent', 'FAQPage', 'BreadcrumbList']);
    const faq = ld['@graph'][3];
    expect(faq.mainEntity.map((q: any) => q.name)).toEqual(FAQ_BOM_JARDIMS.map(f => f.pergunta));
    expect(faq.mainEntity.map((q: any) => q.name)).toEqual(expect.arrayContaining(['Qual o preço das chácaras do Bom Jardims?', 'Quais as formas de pagamento?']));
    expect(ld['@graph'][2].address).toMatchObject({ addressLocality: 'Açailândia', addressRegion: 'MA' });
    expect(ld['@graph'][1].about['@id']).toBe(ld['@graph'][0]['@id']);
    expect(ld['@graph'][0].geo).toMatchObject({ latitude: expect.any(Number), longitude: expect.any(Number) });
    for (const t of ['og:site_name', 'og:image:width" content="1200', 'og:image:height" content="630', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image"']) expect(html).toContain(t);
    // Imagem do topo pré-carregada no tamanho certo (o celular baixa a de 800 px)
    expect(html).toContain('<link rel="preload" as="image" href="/bom-jardims/portal-dia-1200.webp" imagesrcset="/bom-jardims/portal-dia-800.webp 800w, ');
    expect(html).toContain('imagesizes="100vw" fetchpriority="high" />');
  });

  it('/agendar/bom-jardims indexável com título próprio e canonical sem o ?c= do corretor; outros agendamentos fora do Google', () => {
    expect(metaDaRota('/agendar/bom-jardims')).toBe(META_AGENDAR_BOM_JARDIMS);
    const html = injetarMeta(HTML, META_AGENDAR_BOM_JARDIMS, BASE);
    expect(html).toContain('<link rel="canonical" href="https://romateccrm.com/agendar/bom-jardims" />');
    expect(html).toContain('index, follow');
    expect(jsonLdDo(html)[0]['@type']).toBe('BreadcrumbList');
    expect((metaDaRota('/agendar/outro') as any).indexavel).toBe(false);
  });

  it('telas do CRM ficam fora do Google (noindex)', () => {
    for (const p of ['/dashboard', '/leads/relatorio', '/materiais', '/login', '/contratos/3', '/financeiro', '/c/ABC123', '/assinar/tok', '/empreendimentos/bom-jardims', '/corretor']) {
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
    expect(r).toContain('Disallow: /c/');
    expect(r).toContain('Disallow: /assinar/');
    expect(r).toContain('Disallow: /contratos');
    // "/c" sem barra bloquearia qualquer caminho que comece com "c"
    expect(r.split(/\r?\n/)).not.toContain('Disallow: /c');
    for (const pub of ['/agendar', '/imoveis', '/i/']) expect(r).not.toContain('Disallow: ' + pub);
  });

  it('sitemap.xml com as páginas públicas', () => {
    const x = sitemapXml(BASE, [{ path: '/bom-jardims', prioridade: 1 }, { path: '/i/IMV-0001', lastmod: '2026-10-17T12:00:00Z' }]);
    expect(x).toContain('<loc>https://romateccrm.com/bom-jardims</loc><priority>1.0</priority>');
    expect(x).toContain('<loc>https://romateccrm.com/i/IMV-0001</loc><lastmod>2026-10-17</lastmod>');
    expect(x.startsWith('<?xml')).toBe(true);
  });
});
