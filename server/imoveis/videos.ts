/**
 * Vídeos de cada imóvel: o do cadastro (properties.videoUrl) + os vídeos liberados do imóvel em Materiais.
 * Assim um imóvel pode ter vários vídeos (ex.: revisão privada e carrossel dos cômodos) no cartão, nos detalhes e na
 * página pública /i/:codigo. Peças "não divulgar" (liberado = false) nunca entram.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { materiais } from '../../drizzle/schema';

export const ehVideo = (m: { tipo?: string | null; mime?: string | null; url: string }) =>
  m.tipo === 'video' || (m.mime ?? '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url);

/** id do imóvel → URLs dos vídeos liberados em Materiais (na ordem da tela Materiais) */
export async function videosDeMateriais(ids: number[]): Promise<Map<number, string[]>> {
  const r = new Map<number, string[]>();
  if (!ids.length) return r;
  const d: any = await getDb();
  if (!d) return r;
  const linhas: any[] = await d.select({ propertyId: materiais.propertyId, url: materiais.url, mime: materiais.mime, tipo: materiais.tipo })
    .from(materiais).where(and(inArray(materiais.propertyId, ids), eq(materiais.liberado, true)))
    .orderBy(asc(materiais.ordem), asc(materiais.id));
  for (const l of linhas) {
    if (!l.propertyId || !ehVideo(l)) continue;
    const lista = r.get(Number(l.propertyId)) ?? [];
    lista.push(String(l.url));
    r.set(Number(l.propertyId), lista);
  }
  return r;
}

/** Vídeo do cadastro primeiro, depois os de Materiais, sem repetir */
export function juntarVideos(videoUrl: string | null | undefined, extras: string[] = []): string[] {
  return Array.from(new Set([videoUrl, ...extras].map(v => (v ?? '').trim()).filter(Boolean)));
}

/** Acrescenta `videos` a cada imóvel (falha ao ler Materiais não derruba a lista: fica só o vídeo do cadastro) */
export async function comVideos<T extends { id: number; videoUrl?: string | null }>(imoveis: T[]): Promise<(T & { videos: string[] })[]> {
  let mapa = new Map<number, string[]>();
  try { mapa = await videosDeMateriais(imoveis.map(i => Number(i.id))); }
  catch (e: any) { console.warn('[Imóveis] vídeos de Materiais:', e?.message); }
  return imoveis.map(i => ({ ...i, videos: juntarVideos(i.videoUrl, mapa.get(Number(i.id))) }));
}
