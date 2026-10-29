/**
 * Tour 360°: fotos equirretangulares (câmera 360 ou panorama 360 do celular, proporção 2:1) de cada chácara ou de
 * pontos do empreendimento (portal, área de vivência, ruas). Guardadas no banco em JPEG com até 4096 px de largura
 * (limite de textura dos celulares). Públicas: /api/public/tour360?emp=…&lote=… e /api/public/tour360/:id.jpg.
 */
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import type { Express } from 'express';
import { getDb } from './db';
import { empreendimentos, tours360 } from '../drizzle/schema';

export class TourErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'TourErro'; } }
export const LARGURA_MAX = 4096;
async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new TourErro('Banco indisponível', 503);
  return d;
}

/** Confere a proporção 2:1 (tolerância de 10%) */
export const ehEquirretangular = (w: number, h: number) => h > 0 && Math.abs(w / h - 2) <= 0.2;

export async function adicionarTour(e: { slug: string; loteCodigo?: string | null; titulo: string; base64: string }, autorId: number) {
  const d = await banco();
  const [emp]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, e.slug)).limit(1);
  if (!emp) throw new TourErro('Empreendimento não encontrado', 404);
  const bruto = Buffer.from(e.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bruto.length > 40 * 1024 * 1024) throw new TourErro('Foto maior que 40 MB', 413);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(bruto).metadata().catch(() => null);
  if (!meta?.width || !meta.height) throw new TourErro('Imagem inválida (use JPG ou PNG)', 415);
  if (!ehEquirretangular(meta.width, meta.height)) throw new TourErro(`A foto precisa ser 360° equirretangular (proporção 2:1). Esta tem ${meta.width}×${meta.height}.`, 400);
  const largura = Math.min(LARGURA_MAX, meta.width);
  const jpg = await sharp(bruto).rotate().resize({ width: largura, height: Math.round(largura / 2), fit: 'fill' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const { salvarArquivo } = await import('./contratos/arquivos');
  const arquivo = `tour360/${emp.id}/${(e.loteCodigo || 'geral').toUpperCase()}-${Date.now()}.jpg`;
  await salvarArquivo(arquivo, jpg, 'image/jpeg');
  await d.insert(tours360).values({ empreendimentoId: emp.id, loteCodigo: e.loteCodigo ? e.loteCodigo.toUpperCase() : null, titulo: e.titulo.trim().slice(0, 120), arquivo, largura, criadoPor: autorId, criadoEm: new Date() } as any);
  return { ok: true as const, largura, bytes: jpg.length };
}

export async function excluirTour(id: number) {
  const d = await banco();
  await d.delete(tours360).where(eq(tours360.id, id));
  return { ok: true as const };
}

/** Tours do empreendimento: os da chácara (se pedida) e os gerais */
export async function toursDe(slug: string, lote?: string | null) {
  const d = await banco();
  const [emp]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) return [];
  const filtro = lote ? and(eq(tours360.empreendimentoId, emp.id), or(eq(tours360.loteCodigo, lote.toUpperCase()), isNull(tours360.loteCodigo)))
    : eq(tours360.empreendimentoId, emp.id);
  const rs: any[] = await d.select().from(tours360).where(filtro).orderBy(asc(tours360.ordem), asc(tours360.id));
  return rs.map(r => ({ id: Number(r.id), titulo: String(r.titulo), loteCodigo: r.loteCodigo ?? null, url: `/api/public/tour360/${r.id}.jpg` }))
    .sort((a, b) => (a.loteCodigo && !b.loteCodigo ? -1 : !a.loteCodigo && b.loteCodigo ? 1 : 0));
}

export function registrarRotasTour360(app: Express) {
  app.get('/api/public/tour360', async (req, res) => {
    try {
      const slug = typeof req.query.emp === 'string' && /^[a-z0-9-]{1,80}$/.test(req.query.emp) ? req.query.emp : 'bom-jardims';
      const lote = typeof req.query.lote === 'string' && /^[A-Za-z]\d{2}$/.test(req.query.lote) ? req.query.lote : null;
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ tours: await toursDe(slug, lote) });
    } catch (e: any) { console.error('[Tour360]', e); res.json({ tours: [] }); }
  });
  app.get('/api/public/tour360/:id.jpg', async (req, res) => {
    try {
      const d = await banco();
      const [t]: any[] = await d.select({ arquivo: tours360.arquivo }).from(tours360).where(eq(tours360.id, Number(req.params.id) || 0)).limit(1);
      if (!t) return res.status(404).end();
      const { lerArquivo } = await import('./contratos/arquivos');
      const a = await lerArquivo(t.arquivo);
      if (!a) return res.status(404).end();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(a.buf);
    } catch { res.status(404).end(); }
  });
}
