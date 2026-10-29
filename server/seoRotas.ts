/**
 * Rotas de SEO (robots.txt, sitemap.xml) e o HTML das páginas com as meta tags
 * certas. Usado por serveStatic (produção) e setupVite (desenvolvimento).
 */
import type { Express } from 'express';
import { and, eq, isNotNull } from 'drizzle-orm';
import { getDb } from './db';
import { properties } from '../drizzle/schema';
import { appUrl } from './leads/config';
import { metaDaRota, metaDoImovel, injetarMeta, injetarRastreamento, robotsTxt, sitemapXml, type MetaPagina } from './seo';
import { AGENDAR_BOM_JARDIMS } from '../shared/bomJardimsSeo';

const INICIO = new Date();

const PADRAO_NAO_ACHADO = (path: string): MetaPagina => ({
  title: 'Imóvel não encontrado — Romatec Imóveis', description: 'Este imóvel não está mais disponível. Veja outros imóveis da Romatec em Açailândia/MA.', path, indexavel: false,
});

async function metaDoImovelDaRota(path: string): Promise<MetaPagina> {
  const db = await getDb();
  if (!db) return PADRAO_NAO_ACHADO(path);
  const codigo = /^\/i\/(IMV-\d{4})$/i.exec(path)?.[1]?.toUpperCase();
  const slug = /^\/imovel\/([^/]+)$/.exec(path)?.[1];
  const where = codigo ? eq(properties.codigo, codigo) : eq(properties.publicSlug, decodeURIComponent(slug || ''));
  const [p]: any[] = await db.select({
    codigo: properties.codigo, denomination: properties.denomination, description: properties.description,
    city: properties.city, state: properties.state, propertyType: properties.propertyType, images: properties.images,
    publicSlug: properties.publicSlug, status: properties.status,
  }).from(properties).where(where).limit(1);
  if (!p || p.status === 'inactive') return PADRAO_NAO_ACHADO(path);
  return { ...metaDoImovel(p, codigo ? `/i/${codigo}` : path), indexavel: p.status === 'available' };
}

/** index.html com título, descrição, canonical, Open Graph e JSON-LD da rota */
export async function htmlComMeta(html: string, urlOriginal: string): Promise<string> {
  const path = (urlOriginal.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  try {
    const r = metaDaRota(path);
    const meta = r === 'imovel' ? await metaDoImovelDaRota(path) : r;
    return injetarRastreamento(injetarMeta(html, meta, appUrl()), path);
  } catch (e: any) {
    console.warn('[SEO] Meta não aplicada:', e?.message);
    return html;
  }
}

export function registrarRotasSeo(app: Express) {
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(robotsTxt(appUrl()));
  });

  app.get('/sitemap.xml', async (_req, res) => {
    // A landing do Bom Jardims muda a cada versão do site: lastmod = data do build (início do servidor)
    const caminhos: { path: string; lastmod?: Date | null; prioridade?: number }[] = [
      { path: '/bom-jardims', lastmod: INICIO, prioridade: 1 }, { path: AGENDAR_BOM_JARDIMS, lastmod: INICIO, prioridade: 0.8 }, { path: '/obras-bom-jardim', lastmod: INICIO, prioridade: 0.9 },
      { path: '/', prioridade: 0.6 }, { path: '/imoveis', prioridade: 0.6 }, { path: '/links', prioridade: 0.3 },
    ];
    try {
      const db = await getDb();
      if (db) {
        const rows: any[] = await db.select({ codigo: properties.codigo, updatedAt: properties.updatedAt })
          .from(properties).where(and(eq(properties.status, 'available'), isNotNull(properties.codigo)));
        for (const p of rows) if (p.codigo) caminhos.push({ path: `/i/${p.codigo}`, lastmod: p.updatedAt, prioridade: 0.5 });
      }
    } catch (e: any) {
      console.warn('[SEO] Sitemap sem imóveis:', e?.message);
    }
    res.type('application/xml').send(sitemapXml(appUrl(), caminhos));
  });
}
