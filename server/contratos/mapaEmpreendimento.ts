/**
 * Camadas do mapa do empreendimento para o Anexo V: a MESMA fonte do MapaTematico do sistema
 * (/<slug>/mapa.json — perímetro, traçado das ruas, portal e pontos de apoio, rio, APP, trilha e área de vivência),
 * convertidas para UTM SIRGAS 2000 para desenhar junto com os lotes do banco (vértices do DXF).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { geoParaUtm, type XY } from '../../shared/utm';

type Pt = [number, number]; // [lon, lat]

export interface CamadasMapa {
  perimetro: XY[];
  ruas: { nome: string; line: XY[] }[];
  pontos: { nome: string; pt: XY }[];
  rio: { nome: string; line: XY[]; rotulo: XY | null } | null;
  areas: { nome: string; detalhe?: string; poly: XY[]; rotulo: XY | null }[];
  app: { nome: string; detalhe?: string; poly: XY[] } | null;
  trilha: { nome: string; line: XY[]; rotulo: XY | null } | null;
  /** PNG da lupa do portal (pontos[].imagem do mapa.json), quando houver */
  imagemPortal: Buffer | null;
}

const valido = (p: Pt | null | undefined): p is Pt => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

export function camadasDoMapa(m: any, fuso: number): Omit<CamadasMapa, 'imagemPortal'> {
  const u = (pts: (Pt | null)[] | undefined): XY[] => (pts ?? []).filter(valido).map(([lon, lat]) => geoParaUtm(lon, lat, fuso));
  const pt = (p: Pt | null | undefined): XY | null => (valido(p) ? geoParaUtm(p[0], p[1], fuso) : null);
  return {
    perimetro: u(m?.perimetro),
    ruas: (m?.ruas ?? []).map((r: any) => ({ nome: r.nome, line: u(r.line) })).filter((r: { line: XY[] }) => r.line.length > 1),
    pontos: (m?.pontos ?? []).filter((p: any) => valido(p.pt)).map((p: any) => ({ nome: p.nome, pt: pt(p.pt)! })),
    rio: m?.rio?.line?.length ? { nome: m.rio.nome, line: u(m.rio.line), rotulo: pt(m.rio.rotulo) } : null,
    areas: (m?.areas ?? []).map((a: any) => ({ nome: a.nome, detalhe: a.detalhe, poly: u(a.poly), rotulo: pt(a.rotulo) })),
    app: m?.app?.poly?.length ? { nome: m.app.nome, detalhe: m.app.detalhe, poly: u(m.app.poly) } : null,
    trilha: m?.trilha?.line?.length ? { nome: m.trilha.nome, line: u(m.trilha.line), rotulo: pt(m.trilha.rotulo) } : null,
  };
}

/** Pasta pública com o mapa: build (dist/public) ou fonte (client/public) */
function pastaPublica(slug: string): string | null {
  for (const raiz of [path.resolve('dist/public'), path.resolve('client/public')]) {
    if (existsSync(path.join(raiz, slug, 'mapa.json'))) return raiz;
  }
  return null;
}

export async function carregarCamadas(slug: string | null | undefined, fuso: number): Promise<CamadasMapa | null> {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  const raiz = pastaPublica(slug);
  if (!raiz) return null;
  try {
    const m = JSON.parse(await readFile(path.join(raiz, slug, 'mapa.json'), 'utf8'));
    const caminho = (m?.pontos ?? []).find((p: any) => /portal/i.test(p.nome) && typeof p.imagem === 'string')?.imagem as string | undefined;
    const arq = caminho && /\.png$/i.test(caminho) ? path.join(raiz, path.normalize(caminho).replace(/^([/\\])+/, '')) : null;
    const imagemPortal = arq && arq.startsWith(raiz) && existsSync(arq) ? await readFile(arq) : null;
    return { ...camadasDoMapa(m, fuso), imagemPortal };
  } catch {
    return null;
  }
}
