/**
 * Rotas de SEO (robots.txt, sitemap.xml) e o HTML das páginas com as meta tags
 * certas. Usado por serveStatic (produção) e setupVite (desenvolvimento).
 */
import type { Express } from 'express';
import { and, eq, isNotNull } from 'drizzle-orm';
import { getDb } from './db';
import { properties } from '../drizzle/schema';
import { appUrl } from './leads/config';
import { metaDaRota, metaDoImovel, injetarMeta, robotsTxt, sitemapXml, type MetaPagina } from './seo';

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
    return injetarMeta(html, meta, appUrl());
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
    const caminhos: { path: string; lastmod?: Date | null }[] = [
      { path: '/' }, { path: '/bom-jardims' }, { path: '/imoveis' }, { path: '/links' },
    ];
    try {
      const db = await getDb();
      if (db) {
        const rows: any[] = await db.select({ codigo: properties.codigo, updatedAt: properties.updatedAt })
          .from(properties).where(and(eq(properties.status, 'available'), isNotNull(properties.codigo)));
        for (const p of rows) if (p.codigo) caminhos.push({ path: `/i/${p.codigo}`, lastmod: p.updatedAt });
      }
    } catch (e: any) {
      console.warn('[SEO] Sitemap sem imóveis:', e?.message);
    }
    res.type('application/xml').send(sitemapXml(appUrl(), caminhos));
  });
}
