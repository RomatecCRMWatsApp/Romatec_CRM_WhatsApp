/**
 * UTM (SIRGAS 2000 / WGS 84 — mesmo elipsoide GRS80 na prática) → latitude/longitude,
 * e medidas planas usadas no memorial descritivo (distância, azimute, área, perímetro).
 * Fórmulas de Snyder (USGS, "Map Projections — A Working Manual", 1987).
 */

const A = 6378137;               // semieixo maior (m)
const F = 1 / 298.257222101;     // achatamento GRS80
const K0 = 0.9996;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);

export type XY = [number, number];       // [E, N] em metros
export type LonLat = [number, number];   // [lon, lat] em graus

/** E/N UTM → [lon, lat]. `sul` = hemisfério sul (N com falso norte de 10.000 km). */
export function utmParaGeo(e: number, n: number, fuso: number, sul = true): LonLat {
  const x = e - 500000;
  const y = sul ? n - 10000000 : n;
  const m = y / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
  const n1 = A / Math.sqrt(1 - E2 * s * s);
  const t1 = t * t;
  const c1 = EP2 * c * c;
  const r1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const d = x / (n1 * K0);
  const lat = phi1 - ((n1 * t) / r1) * (
    (d * d) / 2
    - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24
    + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720
  );
  const lon = (d
    - ((1 + 2 * t1 + c1) * d ** 3) / 6
    + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) / c;
  const lon0 = ((fuso - 1) * 6 - 180 + 3) * Math.PI / 180;
  return [((lon0 + lon) * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** [lon, lat] → E/N UTM no fuso dado (inversa de utmParaGeo; hemisfério sul com falso norte de 10.000 km) */
export function geoParaUtm(lon: number, lat: number, fuso: number, sul = true): XY {
  const phi = (lat * Math.PI) / 180;
  const lon0 = ((fuso - 1) * 6 - 180 + 3) * Math.PI / 180;
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * s * s);
  const t2 = t * t;
  const c2 = EP2 * c * c;
  const a = c * ((lon * Math.PI) / 180 - lon0);
  const m = A * (
    (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi
    - ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi)
    - ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi)
  );
  const e = K0 * n * (a + ((1 - t2 + c2) * a ** 3) / 6 + ((5 - 18 * t2 + t2 * t2 + 72 * c2 - 58 * EP2) * a ** 5) / 120) + 500000;
  const nn = K0 * (m + n * t * ((a * a) / 2 + ((5 - t2 + 9 * c2 + 4 * c2 * c2) * a ** 4) / 24 + ((61 - 58 * t2 + t2 * t2 + 600 * c2 - 330 * EP2) * a ** 6) / 720));
  return [e, sul ? nn + 10000000 : nn];
}

/** Distância plana (m) */
export const distancia = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Azimute plano (graus, a partir do Norte, sentido horário, 0–360) */
export function azimute(a: XY, b: XY): number {
  const az = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return (az + 360) % 360;
}

/** "123°45'06\"" */
export function grausMinSeg(graus: number): string {
  let g = Math.floor(graus), m = Math.floor((graus - g) * 60), s = Math.round(((graus - g) * 60 - m) * 60);
  if (s === 60) { s = 0; m++; }
  if (m === 60) { m = 0; g++; }
  return `${g}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}

/** Remove o último vértice quando repete o primeiro */
export function anelAberto<T extends [number, number]>(pts: T[]): T[] {
  if (pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) return pts.slice(0, -1);
  }
  return pts;
}

export function areaPlana(pts: XY[]): number {
  const p = anelAberto(pts);
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return Math.abs(s / 2);
}

export function perimetro(pts: XY[]): number {
  const p = anelAberto(pts);
  let s = 0;
  for (let i = 0; i < p.length; i++) s += distancia(p[i], p[(i + 1) % p.length]);
  return s;
}

export function centroide(pts: XY[]): XY {
  const p = anelAberto(pts);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  return [cx / (3 * a), cy / (3 * a)];
}

export function pontoDentro(x: number, y: number, pts: XY[]): boolean {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i][1] > y) !== (pts[j][1] > y) && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) d = !d;
  }
  return d;
}

/** Garante sentido horário (padrão de memorial descritivo) */
export function sentidoHorario(pts: XY[]): XY[] {
  const p = anelAberto(pts);
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[i][0] - p[j][0]) * (p[i][1] + p[j][1]);
  return s > 0 ? p : [...p].reverse();
}
