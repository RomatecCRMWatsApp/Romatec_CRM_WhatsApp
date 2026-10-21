/**
 * SEO das páginas públicas: o site é uma SPA, então o HTML que o Google recebe
 * vinha sempre com "Romatec CRM". Aqui o servidor troca título, descrição,
 * canonical, Open Graph e JSON-LD conforme a rota, e gera robots.txt e sitemap.xml.
 * Regra do pacote Bom Jardims: nada de preço em meta tag (nem de imóvel com exibirPreco=false).
 */
import { FAQ_BOM_JARDIMS, NOMES_ALTERNATIVOS, htmlEstaticoBomJardims } from '../shared/bomJardimsSeo';

export interface MetaPagina {
  title: string;
  description: string;
  /** Caminho canônico, ex.: /bom-jardims */
  path: string;
  image?: string | null;
  /** false = noindex (telas internas do CRM) */
  indexavel: boolean;
  jsonLd?: Record<string, unknown> | null;
  /** Texto visível no HTML inicial (dentro de #root; o React substitui ao carregar) — o Google lê mesmo sem rodar o JS */
  conteudoHtml?: string | null;
}

export interface ImovelSeo {
  codigo: string | null;
  denomination: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  propertyType?: string | null;
  images?: string[] | null;
  publicSlug?: string | null;
}

/** Telas do CRM (login obrigatório): fora do Google */
export const ROTAS_INTERNAS = ['/dashboard', '/contacts', '/properties', '/campaigns', '/settings', '/performance', '/leads', '/materiais', '/setup', '/login', '/equipe', '/empreendedor', '/primeiro-acesso'];

const CRECI = 'Corretor José Romário · CRECI/MA 4.705';

export const META_BOM_JARDIMS: MetaPagina = {
  // Começa pelo nome que as pessoas buscam ("Chácaras Bom Jardims"); a cidade vem depois
  title: 'Chácaras Bom Jardims | Condomínio de Chácaras em Açailândia - MA',
  description: 'Chácaras Bom Jardims: chácaras à venda em Açailândia/MA, na BR-222 (região de Imperatriz). Condomínio de chácaras com 82 chácaras a partir de 3.025 m², portal, ruas de 12 m e área de vivência. Veja o mapa e agende sua visita. ' + CRECI + '.',
  path: '/bom-jardims',
  image: '/bom-jardims/og.jpg',
  indexavel: true,
  conteudoHtml: htmlEstaticoBomJardims(),
  jsonLd: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Place',
        '@id': 'https://romateccrm.com/bom-jardims#lugar',
        name: 'Condomínio de Chácaras Bom Jardims',
        alternateName: NOMES_ALTERNATIVOS,
        description: 'Condomínio de chácaras em Açailândia/MA, na BR-222 — 82 chácaras a partir de 3.025 m², portal de acesso, ruas internas de 12 m e área de vivência.',
        address: { '@type': 'PostalAddress', addressLocality: 'Açailândia', addressRegion: 'MA', addressCountry: 'BR', streetAddress: 'Estrada do Piquiá dos Baianos, altura do km 15 da BR-222' },
        geo: { '@type': 'GeoCoordinates', latitude: -4.925448446, longitude: -47.382658381 },
        containedInPlace: { '@type': 'City', name: 'Açailândia', address: { '@type': 'PostalAddress', addressRegion: 'MA', addressCountry: 'BR' } },
        telephone: '+55 99 99181-1246',
        image: 'https://romateccrm.com/bom-jardims/og.jpg',
        url: 'https://romateccrm.com/bom-jardims',
      },
      {
        '@type': 'RealEstateAgent',
        name: 'Romatec Consultoria Total',
        url: 'https://romateccrm.com',
        telephone: '+55 99 99181-1246',
        address: { '@type': 'PostalAddress', streetAddress: 'Rua São Raimundo, 10, Centro', addressLocality: 'Açailândia', addressRegion: 'MA', addressCountry: 'BR' },
        areaServed: ['Açailândia', 'Imperatriz', 'Maranhão'],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ_BOM_JARDIMS.map(f => ({ '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Romatec Imóveis', item: 'https://romateccrm.com/' },
          { '@type': 'ListItem', position: 2, name: 'Chácaras Bom Jardims', item: 'https://romateccrm.com/bom-jardims' },
        ],
      },
    ],
  },
};

const META_PADRAO: MetaPagina = {
  title: 'Romatec Consultoria Imobiliária — Imóveis em Açailândia/MA',
  description: 'Casas, lotes, chácaras e imóveis rurais em Açailândia e região. Atendimento pelo WhatsApp com o ' + CRECI + '.',
  path: '/',
  indexavel: true,
};

const limpar = (t: string, max: number) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

export function metaDoImovel(p: ImovelSeo, path: string): MetaPagina {
  const local = [p.city, p.state].filter(Boolean).join('/');
  const titulo = `${p.denomination}${local ? ` em ${local}` : ''}${p.codigo ? ` (${p.codigo})` : ''} — Romatec Imóveis`;
  // Sem preço de propósito: vale para todos (exibirPreco=false nunca vaza; os demais mostram na página)
  // A descrição é texto livre: tira valores em R$ (imóvel com exibirPreco=false não pode vazar preço)
  const texto = (p.description || '').replace(/R\$\s*[\d.,]+(\s*(mil|milh[õo]es|milh[ãa]o))?/gi, '').replace(/\s{2,}/g, ' ');
  const desc = texto.trim() ? limpar(texto, 150) : `${p.propertyType || 'Imóvel'} à venda${local ? ` em ${local}` : ''}. Fotos, localização e atendimento pelo WhatsApp.`;
  const imagem = (p.images || []).find(u => /^https:\/\//.test(u)) || null;
  return {
    title: limpar(titulo, 70),
    description: limpar(`${desc} ${CRECI}.`, 200),
    path,
    image: imagem,
    indexavel: true,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Residence',
      name: p.denomination,
      ...(local ? { address: { '@type': 'PostalAddress', addressLocality: p.city, addressRegion: p.state, addressCountry: 'BR' } } : {}),
      ...(imagem ? { image: imagem } : {}),
    },
  };
}

/**
 * Link de uma chácara (/bom-jardims/chacara/C05) — é o que o corretor manda no WhatsApp: a prévia mostra
 * a foto do empreendimento e a chácara. Fora do Google (84 páginas quase iguais): noindex, canonical própria.
 */
export function metaDaChacara(codigo: string): MetaPagina {
  return {
    title: `Chácara ${codigo} · Quadra ${codigo[0]} — Chácaras Bom Jardims, Açailândia/MA`,
    description: `Chácara ${codigo} (Quadra ${codigo[0]}) no Condomínio de Chácaras Bom Jardims, em Açailândia/MA: fotos, mapa e localização exata. Condições e valores com o corretor. ${CRECI}.`,
    path: `/bom-jardims/chacara/${codigo}`,
    image: '/bom-jardims/og.jpg',
    indexavel: false,
  };
}

/** Meta das rotas fixas; imóvel (/i/:codigo, /imovel/:slug) é resolvido pelo servidor com o banco */
export function metaDaRota(path: string): MetaPagina | 'imovel' {
  const p = path.replace(/\/+$/, '') || '/';
  if (ROTAS_INTERNAS.some(r => p === r || p.startsWith(`${r}/`))) return { ...META_PADRAO, title: 'Romatec CRM', path: p, indexavel: false };
  if (p === '/bom-jardims') return META_BOM_JARDIMS;
  const chacara = /^\/bom-jardims\/chacara\/([A-Da-d]\d{2})$/.exec(p);
  if (chacara) return metaDaChacara(chacara[1].toUpperCase());
  if (p === '/imoveis') return { ...META_PADRAO, title: 'Imóveis à venda em Açailândia/MA — Romatec', path: '/imoveis' };
  if (p === '/links') return { ...META_PADRAO, title: 'Romatec Imóveis — links e contato', path: '/links' };
  if (/^\/i\/IMV-\d{4}$/i.test(p) || /^\/imovel\/[^/]+$/.test(p)) return 'imovel';
  return { ...META_PADRAO, path: p };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const abs = (base: string, u: string) => (/^https?:\/\//.test(u) ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);

/** Troca <title> e description do index.html e acrescenta canonical, robots, Open Graph e JSON-LD */
export function injetarMeta(html: string, meta: MetaPagina, base: string): string {
  const url = abs(base, meta.path);
  const tags = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${meta.indexavel ? 'index, follow' : 'noindex, nofollow'}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ...(meta.image ? [`<meta property="og:image" content="${esc(abs(base, meta.image))}" />`, `<meta name="twitter:card" content="summary_large_image" />`] : []),
    // JSON dentro de <script>: escapa "<" para não fechar a tag
    ...(meta.jsonLd ? [`<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`] : []),
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(meta.description)}" />`)
    .replace('</head>', `    ${tags}\n  </head>`)
    .replace('<div id="root"></div>', meta.conteudoHtml ? `<div id="root">${meta.conteudoHtml}</div>` : '<div id="root"></div>');
}

export function robotsTxt(base: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...ROTAS_INTERNAS.map(r => `Disallow: ${r}`),
    'Disallow: /api/',
    'Disallow: /q/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(base: string, caminhos: { path: string; lastmod?: Date | string | null }[]): string {
  const itens = caminhos.map(c => {
    const lm = c.lastmod ? new Date(c.lastmod) : null;
    return `  <url><loc>${esc(abs(base, c.path))}</loc>${lm && !isNaN(+lm) ? `<lastmod>${lm.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens.join('\n')}\n</urlset>\n`;
}
