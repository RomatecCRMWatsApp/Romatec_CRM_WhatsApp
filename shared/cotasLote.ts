/**
 * Cotas do lote no mapa: medida de cada lado (m) e área (m²) a partir do polígono em lon/lat (WGS84).
 * Medidas no plano UTM (como na planta e no memorial descritivo).
 */
import { geoParaUtm } from './utm';
export type PtGeo = [number, number]; // [lon, lat]

const anel = (poly: PtGeo[]): PtGeo[] =>
  poly.length > 1 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1] ? poly.slice(0, -1) : poly;

/** Converte para UTM (SIRGAS 2000, fuso do próprio lote) — as mesmas medidas da planta e do memorial descritivo */
function emMetros(poly: PtGeo[]): [number, number][] {
  const pts = anel(poly);
  if (!pts.length) return [];
  const lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const fuso = Math.floor((lon0 + 180) / 6) + 1;
  return pts.map(([lon, lat]) => geoParaUtm(lon, lat, fuso, lat0 < 0));
}

/** Lados do lote: índices dos vértices (no anel sem o ponto repetido) e comprimento em metros */
export function ladosDoLote(poly: PtGeo[]): { i: number; j: number; metros: number }[] {
  const m = emMetros(poly);
  if (m.length < 3) return [];
  return m.map((p, i) => {
    const q = m[(i + 1) % m.length];
    return { i, j: (i + 1) % m.length, metros: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  });
}

/** Área do polígono em m² (fórmula de Gauss) */
export function areaDoLote(poly: PtGeo[]): number {
  const m = emMetros(poly);
  if (m.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < m.length; i++) { const p = m[i], q = m[(i + 1) % m.length]; s += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(s) / 2;
}

/** Vértices do anel (sem o ponto final repetido) — para casar com os índices de ladosDoLote */
export const verticesDoLote = anel;

/** "55,12" — metros com 2 casas */
export const metrosBR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "3.025,11 m²" */
export const areaBR = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
