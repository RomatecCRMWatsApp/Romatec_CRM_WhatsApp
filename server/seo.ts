/**
 * SEO das páginas públicas: o site é uma SPA, então o HTML que o Google recebe
 * vinha sempre com "Romatec CRM". Aqui o servidor troca título, descrição,
 * canonical, Open Graph, Twitter e JSON-LD conforme a rota, e gera robots.txt e sitemap.xml.
 * Regra do pacote Bom Jardims: nada de preço em meta tag (nem de imóvel com exibirPreco=false).
 */
import {
  AGENDAR_BOM_JARDIMS, DESCRICAO_BOM_JARDIMS, FAQ_BOM_JARDIMS, IMAGENS_BOM_JARDIMS, NOMES_ALTERNATIVOS, TITULO_BOM_JARDIMS,
  htmlEstaticoBomJardims,
} from '../shared/bomJardimsSeo';

export interface MetaPagina {
  title: string;
  description: string;
  /** Caminho canônico, ex.: /bom-jardims */
  path: string;
  image?: string | null;
  /** Texto alternativo e tamanho da imagem de prévia (WhatsApp, Instagram, Facebook) */
  imageAlt?: string | null;
  imageSize?: { w: number; h: number } | null;
  /** Imagem principal da página: pré-carregada (LCP) */
  preloadImage?: string | null;
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

/** Telas do CRM (login obrigatório) e documentos de clientes: fora do Google */
export const ROTAS_INTERNAS = [
  '/dashboard', '/contacts', '/properties', '/campaigns', '/settings', '/performance', '/leads', '/materiais', '/setup', '/login',
  '/equipe', '/empreendedor', '/primeiro-acesso', '/meu-cadastro', '/empreendimentos', '/contratos', '/financeiro', '/corretor',
  '/assinar', '/c',
];

const CRECI = 'Corretor José Romário · CRECI/MA 4.705';
const SITE = 'https://romateccrm.com';
const TELEFONE = '+55 99 99181-1246';
const IMAGEM_OG = '/bom-jardims/og.jpg';

const LUGAR_ID = `${SITE}/bom-jardims#condominio`;
const ROMATEC_ID = `${SITE}/#romatec`;

export const META_BOM_JARDIMS: MetaPagina = {
  title: TITULO_BOM_JARDIMS,
  description: DESCRICAO_BOM_JARDIMS,
  path: '/bom-jardims',
  image: IMAGEM_OG,
  imageAlt: 'Portal de acesso do Condomínio de Chácaras Bom Jardims, em Açailândia/MA',
  imageSize: { w: 1200, h: 630 },
  preloadImage: IMAGENS_BOM_JARDIMS[0].src,
  indexavel: true,
  conteudoHtml: htmlEstaticoBomJardims(),
  jsonLd: {
    '@context': 'https://schema.org',
    '@graph': [
      {
        // Condomínio fechado de chácaras (Residence › GatedResidenceCommunity)
        '@type': 'GatedResidenceCommunity',
        '@id': LUGAR_ID,
        name: 'Condomínio de Chácaras Bom Jardims',
        alternateName: NOMES_ALTERNATIVOS,
        description: 'Condomínio fechado de chácaras em Açailândia/MA, na BR-222: 82 chácaras a partir de 3.025 m², portal com guarita, ruas internas de 12 m, água encanada e área de vivência às margens do córrego.',
        address: { '@type': 'PostalAddress', streetAddress: 'Estrada do Piquiá dos Baianos, altura do km 15 da BR-222', addressLocality: 'Açailândia', addressRegion: 'MA', addressCountry: 'BR' },
        geo: { '@type': 'GeoCoordinates', latitude: -4.92754264, longitude: -47.38171366 },
        hasMap: 'https://www.google.com/maps?q=-4.92754264,-47.38171366',
        containedInPlace: { '@type': 'City', name: 'Açailândia', address: { '@type': 'PostalAddress', addressRegion: 'MA', addressCountry: 'BR' } },
        amenityFeature: [
          'Portal com guarita e controle de acesso', 'Ruas internas de 12 m', 'Água encanada de poço artesiano com hidrômetro individual',
          'Área de vivência às margens do córrego', 'Quiosques e churrasqueira', 'Trilha',
        ].map(name => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
        telephone: TELEFONE,
        image: [`${SITE}${IMAGEM_OG}`, ...IMAGENS_BOM_JARDIMS.map(i => `${SITE}${i.src}`)],
        url: `${SITE}/bom-jardims`,
      },
      {
        '@type': 'RealEstateListing',
        '@id': `${SITE}/bom-jardims#anuncio`,
        name: 'Chácaras à venda em Açailândia/MA — Condomínio de Chácaras Bom Jardims',
        description: DESCRICAO_BOM_JARDIMS,
        url: `${SITE}/bom-jardims`,
        image: `${SITE}${IMAGEM_OG}`,
        inLanguage: 'pt-BR',
        about: { '@id': LUGAR_ID },
        provider: { '@id': ROMATEC_ID },
        potentialAction: { '@type': 'ReserveAction', name: 'Agendar visita', target: `${SITE}${AGENDAR_BOM_JARDIMS}` },
      },
      {
        '@type': 'RealEstateAgent',
        '@id': ROMATEC_ID,
        name: 'Romatec Consultoria Total',
        url: SITE,
        logo: `${SITE}/icon-512x512.png`,
        image: `${SITE}${IMAGEM_OG}`,
        telephone: TELEFONE,
        address: { '@type': 'PostalAddress', streetAddress: 'Rua São Raimundo, 10, Centro', addressLocality: 'Açailândia', addressRegion: 'MA', addressCountry: 'BR' },
        areaServed: ['Açailândia', 'Imperatriz', 'Maranhão'],
        employee: { '@type': 'Person', name: 'José Romário Pinto Bezerra', jobTitle: 'Corretor de imóveis — CRECI/MA 4.705' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ_BOM_JARDIMS.map(f => ({ '@type': 'Question', name: f.pergunta, acceptedAnswer: { '@type': 'Answer', text: f.resposta } })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Romatec Imóveis', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Chácaras Bom Jardims', item: `${SITE}/bom-jardims` },
        ],
      },
    ],
  },
};

/** Formulário público de agendamento do Bom Jardims (o link que o corretor compartilha, com ?c=) */
export const META_AGENDAR_BOM_JARDIMS: MetaPagina = {
  title: 'Agende sua visita — Chácaras Bom Jardims, Açailândia/MA',
  description: 'Agende uma visita ao Condomínio de Chácaras Bom Jardims, em Açailândia/MA: escolha o dia, o horário e a chácara no mapa. O corretor confirma pelo WhatsApp.',
  path: AGENDAR_BOM_JARDIMS,
  image: IMAGEM_OG,
  imageAlt: META_BOM_JARDIMS.imageAlt,
  imageSize: META_BOM_JARDIMS.imageSize,
  indexavel: true,
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Romatec Imóveis', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Chácaras Bom Jardims', item: `${SITE}/bom-jardims` },
      { '@type': 'ListItem', position: 3, name: 'Agendar visita', item: `${SITE}${AGENDAR_BOM_JARDIMS}` },
    ],
  },
};

const META_PADRAO: MetaPagina = {
  title: 'Romatec Consultoria Imobiliária — Imóveis em Açailândia/MA',
  description: 'Casas, lotes, chácaras e imóveis rurais em Açailândia e região. Atendimento pelo WhatsApp com o ' + CRECI + '.',
  path: '/',
  image: '/og-image.png',
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
    image: IMAGEM_OG,
    imageAlt: META_BOM_JARDIMS.imageAlt,
    imageSize: META_BOM_JARDIMS.imageSize,
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
  if (p === AGENDAR_BOM_JARDIMS) return META_AGENDAR_BOM_JARDIMS;
  // Agendamento de outros empreendimentos: funciona, mas fica fora do Google
  if (p.startsWith('/agendar/')) return { ...META_PADRAO, title: 'Agende sua visita — Romatec Imóveis', path: p, indexavel: false };
  if (p === '/imoveis') return { ...META_PADRAO, title: 'Imóveis à venda em Açailândia/MA — Romatec', path: '/imoveis' };
  if (p === '/links') return { ...META_PADRAO, title: 'Romatec Imóveis — links e contato', path: '/links' };
  if (/^\/i\/IMV-\d{4}$/i.test(p) || /^\/imovel\/[^/]+$/.test(p)) return 'imovel';
  return { ...META_PADRAO, path: p };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const abs = (base: string, u: string) => (/^https?:\/\//.test(u) ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);

/** Troca <title> e description do index.html e acrescenta canonical, robots, Open Graph, Twitter e JSON-LD */
export function injetarMeta(html: string, meta: MetaPagina, base: string): string {
  const url = abs(base, meta.path);
  const img = meta.image ? abs(base, meta.image) : null;
  const tags = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${meta.indexavel ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'}" />`,
    ...(meta.preloadImage ? [`<link rel="preload" as="image" href="${esc(meta.preloadImage)}" fetchpriority="high" />`] : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:site_name" content="Romatec Imóveis" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ...(img ? [
      `<meta property="og:image" content="${esc(img)}" />`,
      `<meta property="og:image:secure_url" content="${esc(img)}" />`,
      ...(meta.imageSize ? [`<meta property="og:image:width" content="${meta.imageSize.w}" />`, `<meta property="og:image:height" content="${meta.imageSize.h}" />`] : []),
      ...(meta.imageAlt ? [`<meta property="og:image:alt" content="${esc(meta.imageAlt)}" />`] : []),
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${esc(img)}" />`,
      ...(meta.imageAlt ? [`<meta name="twitter:image:alt" content="${esc(meta.imageAlt)}" />`] : []),
    ] : [`<meta name="twitter:card" content="summary" />`]),
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
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
    // Com barra no fim: "/c" sozinho também bloquearia /campaigns... e qualquer rota pública que comece com "c"
    ...ROTAS_INTERNAS.map(r => (r.length <= 2 || r === '/assinar' ? `Disallow: ${r}/` : `Disallow: ${r}`)),
    'Disallow: /api/',
    'Disallow: /q/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(base: string, caminhos: { path: string; lastmod?: Date | string | null; prioridade?: number }[]): string {
  const itens = caminhos.map(c => {
    const lm = c.lastmod ? new Date(c.lastmod) : null;
    return `  <url><loc>${esc(abs(base, c.path))}</loc>${lm && !isNaN(+lm) ? `<lastmod>${lm.toISOString().slice(0, 10)}</lastmod>` : ''}${c.prioridade != null ? `<priority>${c.prioridade.toFixed(1)}</priority>` : ''}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${itens.join('\n')}\n</urlset>\n`;
}
