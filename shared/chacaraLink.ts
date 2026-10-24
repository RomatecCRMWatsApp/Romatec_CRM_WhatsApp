/**
 * Link público por chácara do Bom Jardims (/bom-jardims/chacara/C05): localização exata do lote
 * (centro do polígono oficial do KMZ, numeração oficial), links do Google Maps e textos de envio.
 * Sem preço: condições e valores são apresentados pelo corretor.
 */
import { geoParaUtm, type LonLat } from './utm';

export const SLUG_BOM_JARDIMS = 'bom-jardims';
export const NOME_BOM_JARDIMS = 'Condomínio de Chácaras Bom Jardims';
/** Fuso UTM do projeto (Açailândia/MA) — SIRGAS 2000 */
export const FUSO_BOM_JARDIMS = 23;

/**
 * Portal de entrada (principal) do condomínio: UTM X 235.872,420 / Y 9.454.873,270 (SIRGAS 2000, fuso 23S,
 * EPSG:31983) → WGS 84. Na divisa junto ao marco FQNS-M-4200, ao lado da via de acesso, perto da área de recreação.
 * O acesso desce até a estrada, ao sul; as rotas do Google Maps apontam para a ponta do acesso na estrada.
 */
export const PORTAL_ENTRADA = { lat: -4.92754264, lon: -47.38171366 };
export const ACESSO_ESTRADA = { lat: -4.929037, lon: -47.3815739 };

/** Rota no Google Maps até a entrada do condomínio (de onde a pessoa estiver, ou de uma origem dada) */
export function rotaAteEntrada(origem?: string): string {
  const destino = `${ACESSO_ESTRADA.lat},${ACESSO_ESTRADA.lon}`;
  return `https://www.google.com/maps/dir/?api=1${origem ? `&origin=${encodeURIComponent(origem)}` : ''}&destination=${destino}&travelmode=driving`;
}

/** Código de chácara no formato oficial (A01…D18) */
export function codigoChacaraValido(codigo: string | null | undefined): boolean {
  return /^[A-D]\d{2}$/.test(String(codigo || ''));
}

export function caminhoChacara(codigo: string): string {
  return `/${SLUG_BOM_JARDIMS}/chacara/${codigo.toUpperCase()}`;
}

export function linkChacara(base: string, codigo: string): string {
  return `${base.replace(/\/$/, '')}${caminhoChacara(codigo)}`;
}

/**
 * Link do empreendimento (nível campanha): /bom-jardims com o código da campanha em utm_campaign —
 * o formulário da página atribui o lead à campanha por esse código.
 */
export function linkEmpreendimento(base: string, codigoCampanha?: string | null): string {
  const url = `${base.replace(/\/$/, '')}/${SLUG_BOM_JARDIMS}`;
  return codigoCampanha ? `${url}?utm_campaign=${encodeURIComponent(codigoCampanha)}` : url;
}

/** KML do empreendimento (perímetro + quadras) e de uma chácara (perímetro + a chácara) */
export function linkKml(base: string, codigoChacara?: string | null): string {
  const b = base.replace(/\/$/, '');
  return codigoChacara ? `${b}${caminhoChacara(codigoChacara)}.kml` : `${b}/${SLUG_BOM_JARDIMS}.kml`;
}

/** Centro de área do polígono [lon, lat] (plano local — erro desprezível para um lote de 55 m) */
export function centroDoLote(poly: LonLat[]): LonLat {
  const anel = poly.length > 1 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1] ? poly.slice(0, -1) : poly;
  const lat0 = anel.reduce((s, p) => s + p[1], 0) / anel.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  const o = anel[0];
  const pts = anel.map(([lon, lat]) => [(lon - o[0]) * kx, (lat - o[1]) * ky]);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) return [o[0], o[1]];
  return [o[0] + cx / (3 * a) / kx, o[1] + cy / (3 * a) / ky];
}

export interface LocalizacaoChacara {
  lat: number;
  lon: number;
  /** "-4.926104, -47.376953" */
  latLonTexto: string;
  utm: { e: number; n: number; fuso: string; texto: string };
  /** Abre o ponto exato no Google Maps */
  googleMaps: string;
  /** Rota até o ponto no Google Maps */
  rota: string;
}

const fmtUtm = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function localizacaoDoLote(poly: LonLat[], fuso = FUSO_BOM_JARDIMS): LocalizacaoChacara {
  const [lon, lat] = centroDoLote(poly);
  const [e, n] = geoParaUtm(lon, lat, fuso, lat < 0);
  const la = lat.toFixed(6), lo = lon.toFixed(6);
  return {
    lat: +la, lon: +lo,
    latLonTexto: `${la}, ${lo}`,
    utm: { e: +e.toFixed(2), n: +n.toFixed(2), fuso: `${fuso}${lat < 0 ? 'S' : 'N'}`, texto: `E ${fmtUtm(e)} · N ${fmtUtm(n)} (SIRGAS 2000, fuso ${fuso}${lat < 0 ? 'S' : 'N'})` },
    googleMaps: `https://www.google.com/maps?q=${la},${lo}`,
    rota: `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`,
  };
}

const fmtArea = (m2: number) => `${m2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

/** "Chácara C05 · Quadra C · 3.143,41 m²" */
export function tituloChacara(c: { codigo: string; quadra?: string | null; areaM2?: number | null }): string {
  return [`Chácara ${c.codigo}`, c.quadra ? `Quadra ${c.quadra}` : '', c.areaM2 ? fmtArea(c.areaM2) : ''].filter(Boolean).join(' · ');
}

/** Mensagem para o cliente com o link (o WhatsApp mostra a prévia com foto pelo Open Graph da página) */
export function mensagemLinkChacara(c: { codigo: string; quadra?: string | null; areaM2?: number | null }, link: string): string {
  return [
    `🏡 *${tituloChacara(c)}*`,
    NOME_BOM_JARDIMS + ' · Açailândia/MA',
    '',
    `Fotos, mapa e localização exata da chácara: ${link}`,
    '',
    'Condições e valores com o corretor José Romário · CRECI/MA 4.705',
  ].join('\n');
}
