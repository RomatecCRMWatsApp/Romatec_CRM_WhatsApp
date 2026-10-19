/**
 * SEO das páginas públicas: o site é uma SPA, então o HTML que o Google recebe
 * vinha sempre com "Romatec CRM". Aqui o servidor troca título, descrição,
 * canonical, Open Graph e JSON-LD conforme a rota, e gera robots.txt e sitemap.xml.
 * Regra do pacote Bom Jardims: nada de preço em meta tag (nem de imóvel com exibirPreco=false).
 */

export interface MetaPagina {
  title: string;
  description: string;
  /** Caminho canônico, ex.: /bom-jardims */
  path: string;
  image?: string | null;
  /** false = noindex (telas internas do CRM) */
  indexavel: boolean;
  jsonLd?: Record<string, unknown> | null;
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
  title: 'Condomínio de Chácaras Bom Jardims em Açailândia/MA — 82 chácaras',
  description: 'Condomínio fechado de chácaras na Fazenda Lua Nova, Açailândia/MA: 82 chácaras a partir de 3.025 m², portal com guarita, ruas de 12 m e área de vivência às margens do córrego. Pré-lançamento — veja o mapa e cadastre-se. ' + CRECI + '.',
  path: '/bom-jardims',
  image: '/bom-jardims/og.jpg',
  indexavel: true,
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: 'Condomínio de Chácaras Bom Jardims',
    description: 'Condomínio fechado de chácaras em Açailândia/MA — 82 chácaras a partir de 3.025 m².',
    address: { '@type': 'PostalAddress', addressLocality: 'Açailândia', addressRegion: 'MA', addressCountry: 'BR', streetAddress: 'Estrada do Piquiá dos Baianos, altura do km 15 da BR-222' },
    telephone: '+55 99 99181-1246',
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

/** Meta das rotas fixas; imóvel (/i/:codigo, /imovel/:slug) é resolvido pelo servidor com o banco */
export function metaDaRota(path: string): MetaPagina | 'imovel' {
  const p = path.replace(/\/+$/, '') || '/';
  if (ROTAS_INTERNAS.some(r => p === r || p.startsWith(`${r}/`))) return { ...META_PADRAO, title: 'Romatec CRM', path: p, indexavel: false };
  if (p === '/bom-jardims') return META_BOM_JARDIMS;
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
    .replace('</head>', `    ${tags}\n  </head>`);
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
