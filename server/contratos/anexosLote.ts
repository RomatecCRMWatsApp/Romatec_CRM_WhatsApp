/**
 * Anexos do CPCV ligados à unidade, gerados da geometria georreferenciada (DXF, UTM SIRGAS 2000):
 * I — memorial descritivo (memorialDoLote: vértices, azimutes, distâncias, confrontações e área);
 * V — mapa individual da unidade (lote destacado dentro da poligonal do empreendimento + detalhe cotado);
 * VI — licença de operação e certidão do registro: entra o PDF que o administrador subir; sem ele, página "a anexar".
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Memorial, RuaMemorial } from '../lotes/memorial';
import { utmParaGeo } from '../../shared/utm';
import type { Ctx } from './contexto';
import { desenharMarca, embutirMarca } from './anexos';

type XY = [number, number];
const VERDE = rgb(0.047, 0.2, 0.125);
const DOURADO = rgb(0.788, 0.651, 0.275);
const CREME = rgb(0.953, 0.933, 0.886);
const CINZA = rgb(0.4, 0.4, 0.4);
const A4: [number, number] = [595.28, 841.89];
const X0 = 62, X1 = A4[0] - 62;

export interface DadosUnidade {
  codigo: string;
  quadra: string | null;
  numero: number | null;
  areaM2: number;
  perimetroM: number;
  verticesUtm: XY[];
  memorial: Memorial;
  /** Demais lotes (contorno no mapa geral) */
  outros: { codigo: string; verticesUtm: XY[] }[];
  perimetroUtm: XY[] | null;
  ruas: RuaMemorial[];
  fuso: number;
  responsavelTecnico?: string | null;
}

const fmt = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function quebrar(font: PDFFont, s: string, size: number, largura: number): string[] {
  const out: string[] = [];
  let atual = '';
  for (const p of s.split(/\s+/)) {
    const t = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(t, size) > largura && atual) { out.push(atual); atual = p; } else atual = t;
  }
  if (atual) out.push(atual);
  return out;
}

async function base(titulo: string, marca: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  const m = await embutirMarca(doc, marca);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const pagina = (cab: string, sub: string) => {
    const p = doc.addPage(A4);
    const { topo, base: b } = desenharMarca(p, m);
    p.drawText(cab, { x: X0, y: topo - 6, size: 11.5, font: fb, color: VERDE });
    p.drawText(sub, { x: X0, y: topo - 20, size: 7.8, font: f, color: CINZA });
    return { p, y: topo - 36, base: b };
  };
  return { doc, f, fb, pagina };
}

const subtitulo = (ctx: Ctx) => `Contrato n.º ${ctx.ctr_numero} · ${ctx.emp_nome} · Chácara ${ctx.lote_codigo}`;

/** Anexo I — memorial descritivo da unidade */
export async function anexoMemorial(u: DadosUnidade, ctx: Ctx, marca: string): Promise<Buffer> {
  const { doc, f, fb, pagina } = await base(`Anexo I — Memorial descritivo — ${ctx.ctr_numero}`, marca);
  const titulo = 'ANEXO I — MEMORIAL DESCRITIVO DA UNIDADE';
  let { p, y, base: b } = pagina(titulo, subtitulo(ctx));
  const novaSeNecessario = (h: number) => { if (y - h < b + 20) ({ p, y, base: b } = pagina(`${titulo} (continuação)`, subtitulo(ctx))); };

  p.drawText(u.memorial.titulo.toUpperCase(), { x: X0, y, size: 9.5, font: fb, color: VERDE });
  y -= 16;
  for (const l of u.memorial.cabecalho) { p.drawText(l, { x: X0, y, size: 8.2, font: f }); y -= 11.5; }
  y -= 8;
  p.drawText('DESCRIÇÃO PERIMETRAL', { x: X0, y, size: 8.6, font: fb, color: VERDE });
  y -= 13;
  for (const l of quebrar(f, u.memorial.descricao, 8.4, X1 - X0)) { novaSeNecessario(12); p.drawText(l, { x: X0, y, size: 8.4, font: f }); y -= 11.6; }
  y -= 12;

  novaSeNecessario(60);
  p.drawText('QUADRO DE VÉRTICES (UTM SIRGAS 2000)', { x: X0, y, size: 8.6, font: fb, color: VERDE });
  y -= 8;
  const cols = [{ t: 'Vértice', w: 40 }, { t: 'Norte (m)', w: 76 }, { t: 'Este (m)', w: 70 }, { t: 'Azimute', w: 62 }, { t: 'Dist. (m)', w: 52 }, { t: 'Confrontação', w: X1 - X0 - 300 }];
  const cab = () => {
    p.drawRectangle({ x: X0, y: y - 13, width: X1 - X0, height: 14, color: VERDE });
    let x = X0;
    for (const c of cols) { p.drawText(c.t, { x: x + 3, y: y - 9.5, size: 7, font: fb, color: rgb(1, 1, 1) }); x += c.w; }
    y -= 14;
  };
  cab();
  u.memorial.vertices.forEach((v, i) => {
    const conf = quebrar(f, v.confronta, 6.8, cols[5].w - 6);
    const h = Math.max(12, conf.length * 8.5 + 4);
    if (y - h < b + 20) { ({ p, y, base: b } = pagina(`${titulo} (continuação)`, subtitulo(ctx))); cab(); }
    if (i % 2 === 1) p.drawRectangle({ x: X0, y: y - h, width: X1 - X0, height: h, color: CREME });
    const vals = [v.nome, fmt(v.n, 3), fmt(v.e, 3), v.azimute, fmt(v.distancia)];
    let x = X0;
    vals.forEach((s, j) => { p.drawText(s, { x: x + 3, y: y - 9, size: 6.9, font: f }); x += cols[j].w; });
    conf.forEach((l, k) => p.drawText(l, { x: x + 3, y: y - 9 - k * 8.5, size: 6.8, font: f }));
    y -= h;
  });
  y -= 14;
  novaSeNecessario(40);
  p.drawText(`Área: ${fmt(u.areaM2)} m² (${fmt(u.areaM2 / 10000, 4)} ha) · Perímetro: ${fmt(u.perimetroM)} m · Fuso UTM ${u.fuso} Sul`, { x: X0, y, size: 8.2, font: fb });
  y -= 13;
  if (u.responsavelTecnico) { p.drawText(`Responsável técnico: ${u.responsavelTecnico}`, { x: X0, y, size: 7.8, font: f, color: CINZA }); y -= 11; }
  p.drawText('Memorial gerado da planta georreferenciada do empreendimento (DXF), sujeito à matrícula individual da unidade após o registro.', { x: X0, y, size: 7, font: f, color: CINZA });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** Transformação UTM → página dentro do retângulo, mantendo a escala */
function encaixe(pts: XY[], x: number, y: number, w: number, h: number, margem = 0.06) {
  const es = pts.map(p => p[0]), ns = pts.map(p => p[1]);
  const [e0, e1, n0, n1] = [Math.min(...es), Math.max(...es), Math.min(...ns), Math.max(...ns)];
  const de = (e1 - e0) || 1, dn = (n1 - n0) || 1;
  const k = Math.min((w * (1 - 2 * margem)) / de, (h * (1 - 2 * margem)) / dn);
  const ox = x + (w - de * k) / 2, oy = y + (h - dn * k) / 2;
  return { k, map: (p: XY): XY => [ox + (p[0] - e0) * k, oy + (p[1] - n0) * k] };
}

function poligono(p: PDFPage, pts: XY[], o: { cor?: ReturnType<typeof rgb>; borda: ReturnType<typeof rgb>; esp: number; opacidade?: number }) {
  if (pts.length < 3) return;
  const d = pts.map((q, i) => `${i ? 'L' : 'M'} ${q[0].toFixed(2)} ${(-q[1]).toFixed(2)}`).join(' ') + ' Z';
  p.drawSvgPath(d, { x: 0, y: 0, color: o.cor, opacity: o.opacidade, borderColor: o.borda, borderWidth: o.esp });
}

const centroide = (pts: XY[]): XY => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

function norte(p: PDFPage, fb: PDFFont, x: number, y: number) {
  p.drawSvgPath(`M ${x} ${-(y + 18)} L ${x - 6} ${-y} L ${x} ${-(y + 5)} L ${x + 6} ${-y} Z`, { x: 0, y: 0, color: VERDE });
  p.drawText('N', { x: x - 3, y: y + 21, size: 8, font: fb, color: VERDE });
}

function escala(p: PDFPage, f: PDFFont, x: number, y: number, k: number) {
  const metros = [10, 20, 25, 50, 100, 200, 250, 500].find(m => m * k >= 45) ?? 500;
  const w = metros * k;
  p.drawRectangle({ x, y, width: w / 2, height: 3, color: VERDE });
  p.drawRectangle({ x: x + w / 2, y, width: w / 2, height: 3, borderColor: VERDE, borderWidth: 0.6 });
  p.drawText(`0`, { x: x - 2, y: y + 5, size: 6, font: f });
  p.drawText(`${metros} m`, { x: x + w - 8, y: y + 5, size: 6, font: f });
}

/** Anexo V — mapa individual: situação no empreendimento + detalhe da chácara com vértices e distâncias */
export async function anexoMapa(u: DadosUnidade, ctx: Ctx, marca: string): Promise<Buffer> {
  const { doc, f, fb, pagina } = await base(`Anexo V — Mapa da unidade — ${ctx.ctr_numero}`, marca);
  const { p, y } = pagina('ANEXO V — MAPA INDIVIDUAL DA UNIDADE', subtitulo(ctx));

  // Situação: empreendimento inteiro com a chácara destacada
  const hS = 300, yS = y - hS;
  p.drawRectangle({ x: X0, y: yS, width: X1 - X0, height: hS, borderColor: DOURADO, borderWidth: 0.8, color: rgb(0.985, 0.98, 0.96) });
  p.drawText('SITUAÇÃO NO EMPREENDIMENTO', { x: X0 + 6, y: y - 11, size: 7.2, font: fb, color: VERDE });
  const todos = [...(u.perimetroUtm ?? []), ...u.outros.flatMap(o => o.verticesUtm), ...u.verticesUtm];
  const g = encaixe(todos, X0, yS, X1 - X0, hS - 14);
  if (u.perimetroUtm) poligono(p, u.perimetroUtm.map(g.map), { borda: VERDE, esp: 1.4, cor: rgb(0.9, 0.94, 0.88), opacidade: 0.6 });
  for (const o of u.outros) poligono(p, o.verticesUtm.map(g.map), { borda: rgb(0.6, 0.62, 0.58), esp: 0.35 });
  poligono(p, u.verticesUtm.map(g.map), { cor: DOURADO, borda: VERDE, esp: 1.2, opacidade: 0.9 });
  const vistos = new Set<string>();
  for (const r of u.ruas) {
    if (vistos.has(r.nome)) continue;
    vistos.add(r.nome);
    const [rx, ry] = g.map([r.e, r.n]);
    const ang = (((r.angulo ?? 0) % 180) + 180) % 180;
    p.drawText(r.nome, { x: rx, y: ry, size: 5.2, font: f, color: CINZA, rotate: degrees(ang > 90 ? ang - 180 : ang) });
  }
  const [cx, cy] = g.map(centroide(u.verticesUtm));
  p.drawLine({ start: { x: cx, y: cy }, end: { x: cx + 26, y: cy + 22 }, thickness: 0.7, color: VERDE });
  p.drawRectangle({ x: cx + 24, y: cy + 18, width: 48, height: 13, color: VERDE });
  p.drawText(`Chácara ${u.codigo}`, { x: cx + 27, y: cy + 22, size: 6.6, font: fb, color: rgb(1, 1, 1) });
  norte(p, fb, X1 - 20, yS + hS - 46);
  escala(p, f, X0 + 10, yS + 10, g.k);

  // Detalhe: a chácara cotada (vértices e distâncias do memorial)
  const hD = 270, yD = yS - 12 - hD;
  p.drawRectangle({ x: X0, y: yD, width: X1 - X0, height: hD, borderColor: DOURADO, borderWidth: 0.8, color: rgb(1, 1, 1) });
  p.drawText('DETALHE DA UNIDADE', { x: X0 + 6, y: yS - 23, size: 7.2, font: fb, color: VERDE });
  const vs = u.memorial.vertices.map(v => [v.e, v.n] as XY);
  const t = encaixe(vs, X0 + 30, yD + 10, X1 - X0 - 60, hD - 30, 0.12);
  poligono(p, vs.map(t.map), { cor: CREME, borda: VERDE, esp: 1.4 });
  const c = centroide(vs.map(t.map));
  u.memorial.vertices.forEach((v, i) => {
    const a = t.map(vs[i]), b = t.map(vs[(i + 1) % vs.length]);
    p.drawCircle({ x: a[0], y: a[1], size: 2.2, color: VERDE });
    const dx = a[0] - c[0], dy = a[1] - c[1], n = Math.hypot(dx, dy) || 1;
    p.drawText(v.nome, { x: a[0] + (dx / n) * 8 - 5, y: a[1] + (dy / n) * 8 - 3, size: 7, font: fb, color: VERDE });
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
    const ox = mx - c[0], oy = my - c[1], on = Math.hypot(ox, oy) || 1;
    const s = `${fmt(v.distancia)} m`;
    const w = f.widthOfTextAtSize(s, 6.6);
    const rad = (ang * Math.PI) / 180;
    p.drawText(s, { x: mx + (ox / on) * 7 - (Math.cos(rad) * w) / 2, y: my + (oy / on) * 7 - (Math.sin(rad) * w) / 2, size: 6.6, font: f, rotate: degrees(ang) });
  });
  const linha1 = `Chácara ${u.codigo}${u.quadra ? ` · Quadra ${u.quadra}` : ''}`;
  p.drawText(linha1, { x: c[0] - fb.widthOfTextAtSize(linha1, 9) / 2, y: c[1] + 3, size: 9, font: fb, color: VERDE });
  const linha2 = `${fmt(u.areaM2)} m²`;
  p.drawText(linha2, { x: c[0] - f.widthOfTextAtSize(linha2, 8) / 2, y: c[1] - 9, size: 8, font: f });
  norte(p, fb, X1 - 20, yD + hD - 46);
  escala(p, f, X0 + 10, yD + 10, t.k);

  // Quadro-resumo
  const [lon, lat] = utmParaGeo(...centroide(u.verticesUtm), u.fuso);
  const resumo = [
    `Unidade: Chácara ${u.codigo}${u.quadra ? `, Quadra ${u.quadra}` : ''}${u.numero != null ? `, Lote ${String(u.numero).padStart(2, '0')}` : ''}`,
    `Área: ${fmt(u.areaM2)} m² · Perímetro: ${fmt(u.perimetroM)} m · Vértices: ${vs.length}`,
    `Centro aproximado: ${lat.toFixed(6)}°, ${lon.toFixed(6)}° (SIRGAS 2000) · UTM fuso ${u.fuso} Sul`,
  ];
  resumo.forEach((l, i) => p.drawText(l, { x: X0, y: yD - 16 - i * 11, size: 7.8, font: i ? f : fb }));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** Anexo VI — PDF enviado pelo administrador; sem ele, página "a anexar" */
export async function anexoLicenca(ctx: Ctx, marca: string, arquivo?: Buffer | null): Promise<Buffer> {
  if (arquivo) return arquivo;
  const { doc, f, fb, pagina } = await base(`Anexo VI — a anexar — ${ctx.ctr_numero}`, marca);
  const { p, y } = pagina('ANEXO VI — LICENÇA AMBIENTAL E CERTIDÃO DO REGISTRO DO PARCELAMENTO', subtitulo(ctx));
  p.drawRectangle({ x: X0, y: y - 130, width: X1 - X0, height: 120, borderColor: DOURADO, borderWidth: 1, color: CREME });
  p.drawText('A ANEXAR', { x: X0 + 16, y: y - 38, size: 18, font: fb, color: VERDE });
  const linhas = [
    `${String(ctx.emp_licenca_ambiental ?? 'Licença ambiental')} — processo ${String(ctx.emp_licenca_processo ?? '—')}, ${String(ctx.emp_licenca_orgao ?? '')}`,
    `com as condicionantes, e a certidão do registro do parcelamento no Cartório de Registro de Imóveis.`,
    'O documento é anexado pelo Administrador em Configurações › Empreendimento › Jurídico antes do contrato definitivo.',
  ];
  linhas.flatMap(l => quebrar(f, l, 7.8, X1 - X0 - 32)).forEach((l, i) => p.drawText(l, { x: X0 + 16, y: y - 62 - i * 12, size: 7.8, font: f }));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
