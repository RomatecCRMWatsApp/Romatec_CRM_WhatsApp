/**
 * Planta de implantação — Área administrativa e stand de vendas do Bom Jardims (projeto V2, nov/2026).
 * Terreno: área de 4.125,00 m² (75,00 × 55,00 m) na entrada, entre a Rua Walter e Maria e a Rua Cedro (server/data/bom-jardims/projeto-v2.json).
 * Edificação: projeto PA-02 (administração/stand), 16,00 × 10,00 m + varanda em deck 16,00 × 4,00 m (64,00 m²).
 * Saída: client/public/bom-jardims/projeto-stand-implantacao.pdf (A3 paisagem, escala 1:400).
 *
 * Uso: npx tsx scripts/bom-jardims-implantacao-stand.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { azimute, distancia, grausMinSeg, type XY } from '../shared/utm';

const raiz = path.resolve(import.meta.dirname, '..');
const v = JSON.parse(readFileSync(path.join(raiz, 'server/data/bom-jardims/projeto-v2.json'), 'utf8'));
const adm = v.areaAdministrativa;
const P: XY[] = adm.verticesUtm; // sentido horário a partir do canto norte: V1 (norte), V2 (portal/estrada), V3, V4

// Eixos locais: origem em V3 (canto oeste na estrada); X ao longo da estrada (V3 → V2), Y para dentro (V3 → V4)
const [V1, V2, V3, V4] = P;
const ux: XY = [(V2[0] - V3[0]) / distancia(V3, V2), (V2[1] - V3[1]) / distancia(V3, V2)];
const uy: XY = [(V4[0] - V3[0]) / distancia(V3, V4), (V4[1] - V3[1]) / distancia(V3, V4)];
const LARG = distancia(V3, V2), PROF = distancia(V3, V4); // 75 × 55
const paraLocal = (p: XY): XY => [(p[0] - V3[0]) * ux[0] + (p[1] - V3[1]) * ux[1], (p[0] - V3[0]) * uy[0] + (p[1] - V3[1]) * uy[1]];
const paraUtm = (x: number, y: number): XY => [V3[0] + x * ux[0] + y * uy[0], V3[1] + x * ux[1] + y * uy[1]];

// Implantação proposta (metros, eixos locais): varanda voltada para a Rua Walter e Maria, recuos de 10 m da via e do lado do portal
const RECUO_ESTRADA = 10, RECUO_PORTAL = 10, LARG_ED = 16, PROF_ED = 10, PROF_VAR = 4;
const x1 = LARG - RECUO_PORTAL, x0 = x1 - LARG_ED;
const varanda = { x0, x1, y0: RECUO_ESTRADA, y1: RECUO_ESTRADA + PROF_VAR };
const edif = { x0, x1, y0: varanda.y1, y1: varanda.y1 + PROF_ED };
const estacionamento = { x0: x0 - 26, x1: x0 - 4, y0: 4, y1: 22 };

const fmt = (n: number, c = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const MM = 72 / 25.4;

async function main() {
  const doc = await PDFDocument.create();
  doc.setTitle('Planta de implantação — Área administrativa e stand de vendas — Bom Jardims');
  doc.setAuthor('Romatec Consultoria Total');
  const page = doc.addPage([420 * MM, 297 * MM]); // A3 paisagem
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const VERDE = rgb(0.047, 0.2, 0.125), DOURADO = rgb(0.788, 0.651, 0.275), CINZA = rgb(0.35, 0.35, 0.35), CLARO = rgb(0.85, 0.85, 0.85);
  const W = page.getWidth(), H = page.getHeight();

  // Moldura e margens (NBR 10068: margem esquerda 25 mm, demais 10 mm)
  page.drawRectangle({ x: 25 * MM, y: 10 * MM, width: W - 35 * MM, height: H - 20 * MM, borderColor: rgb(0, 0, 0), borderWidth: 1.2 });

  // Desenho em escala 1:300 (1 m = 1000/300 mm)
  const ESC = 400, s = (1000 / ESC) * MM;
  const ox = 48 * MM, oy = 72 * MM; // origem (V3) no papel
  const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
  const ret = (r: { x0: number; x1: number; y0: number; y1: number }, o: any) => page.drawRectangle({ x: X(r.x0), y: Y(r.y0), width: (r.x1 - r.x0) * s, height: (r.y1 - r.y0) * s, ...o });
  const linha = (a: XY, b: XY, o: any = {}) => page.drawLine({ start: { x: X(a[0]), y: Y(a[1]) }, end: { x: X(b[0]), y: Y(b[1]) }, thickness: 0.8, color: rgb(0, 0, 0), ...o });
  const texto = (t: string, x: number, y: number, tam = 7, fonte: PDFFont = f, cor = rgb(0, 0, 0), rot = 0) => page.drawText(t, { x, y, size: tam, font: fonte, color: cor, rotate: degrees(rot) });
  const centro = (t: string, cx: number, y: number, tam = 7, fonte: PDFFont = f, cor = rgb(0, 0, 0)) => texto(t, cx - fonte.widthOfTextAtSize(t, tam) / 2, y, tam, fonte, cor);

  // Via de entrada (Rua Walter e Maria, 12 m, entre o terreno e o limite da fazenda) e Rua Cedro (à direita)
  page.drawRectangle({ x: X(-8), y: Y(-12), width: (LARG + 28) * s, height: 12 * s, color: rgb(0.93, 0.93, 0.9) });
  centro('RUA WALTER E MARIA — via de entrada (12,00 m)', X(LARG / 2), Y(-6.8), 7, fb, CINZA);
  page.drawLine({ start: { x: X(-8), y: Y(-12) }, end: { x: X(LARG + 20), y: Y(-12) }, thickness: 1, color: rgb(0.8, 0.1, 0.5), dashArray: [6, 3] });
  texto('LIMITE DA FAZENDA', X(-8), Y(-12) - 9, 6.5, fb, rgb(0.8, 0.1, 0.5));
  page.drawRectangle({ x: X(LARG), y: Y(0), width: 12 * s, height: (PROF + 6) * s, color: rgb(0.93, 0.93, 0.9) });
  texto('RUA CEDRO (12,00 m)', X(LARG + 7.5), Y(8), 7, fb, CINZA, 90);
  // Portal: atravessa a via do ponto inicial no limite da fazenda até o canto V2 do terreno
  page.drawLine({ start: { x: X(LARG), y: Y(0) }, end: { x: X(LARG), y: Y(-12) }, thickness: 3.2, color: rgb(0.42, 0.29, 0.18) });
  page.drawCircle({ x: X(LARG), y: Y(-12), size: 3, color: DOURADO, borderColor: VERDE, borderWidth: 1 });
  texto('PORTAL (PA-01 rev. V2)', X(LARG) + 5, Y(-3.5), 7, fb, VERDE);
  texto('ponto inicial: E 235.955,872 · N 9.454.732,409', X(LARG) + 5, Y(-12) - 9, 6, f, VERDE);

  // Terreno
  page.drawRectangle({ x: X(0), y: Y(0), width: LARG * s, height: PROF * s, borderColor: rgb(0, 0, 0), borderWidth: 1.6, color: rgb(0.97, 0.98, 0.95) });
  // Estacionamento (proposta)
  ret(estacionamento, { color: rgb(0.92, 0.92, 0.92), borderColor: CINZA, borderWidth: 0.6, borderDashArray: [3, 2] });
  for (let x = estacionamento.x0 + 2.5; x < estacionamento.x1 - 0.5; x += 2.5) linha([x, estacionamento.y1 - 5], [x, estacionamento.y1], { thickness: 0.4, color: CINZA });
  centro('ESTACIONAMENTO DE VISITANTES (proposta)', X((estacionamento.x0 + estacionamento.x1) / 2), Y(estacionamento.y0 + 5), 6.5, f, CINZA);
  // Edificação e varanda
  ret(varanda, { color: rgb(0.9, 0.84, 0.7), borderColor: rgb(0.45, 0.33, 0.15), borderWidth: 0.8 });
  ret(edif, { color: rgb(0.78, 0.86, 0.8), borderColor: VERDE, borderWidth: 1.4 });
  centro('ADMINISTRAÇÃO /', X((x0 + x1) / 2), Y(edif.y0 + 6.6), 6.5, fb, VERDE);
  centro('STAND DE VENDAS', X((x0 + x1) / 2), Y(edif.y0 + 4.9), 6.5, fb, VERDE);
  centro('PA-02 · 160,00 m²', X((x0 + x1) / 2), Y(edif.y0 + 2.6), 6, f, VERDE);
  centro('Varanda (deck) 64,00 m²', X((x0 + x1) / 2), Y(varanda.y0 + 1.4), 6.5, f, rgb(0.45, 0.33, 0.15));
  // Acesso de veículos e pedestres pela Rua Walter e Maria
  page.drawLine({ start: { x: X(x0 - 9), y: Y(-3) }, end: { x: X(x0 - 9), y: Y(3) }, thickness: 1.2, color: VERDE });
  page.drawLine({ start: { x: X(x0 - 9), y: Y(3) }, end: { x: X(x0 - 10), y: Y(1.6) }, thickness: 1.2, color: VERDE });
  page.drawLine({ start: { x: X(x0 - 9), y: Y(3) }, end: { x: X(x0 - 8), y: Y(1.6) }, thickness: 1.2, color: VERDE });
  texto('ACESSO', X(x0 - 8), Y(-1.8), 6.5, fb, VERDE);

  // Cotas
  const cotaH = (a: number, b: number, y: number, t: string) => { linha([a, y], [b, y], { thickness: 0.5 }); linha([a, y - 0.8], [a, y + 0.8], { thickness: 0.5 }); linha([b, y - 0.8], [b, y + 0.8], { thickness: 0.5 }); centro(t, X((a + b) / 2), Y(y) + 2, 6.5); };
  const cotaV = (a: number, b: number, x: number, t: string) => { linha([x, a], [x, b], { thickness: 0.5 }); linha([x - 0.8, a], [x + 0.8, a], { thickness: 0.5 }); linha([x - 0.8, b], [x + 0.8, b], { thickness: 0.5 }); texto(t, X(x) - 2, Y((a + b) / 2) - f.widthOfTextAtSize(t, 6.5) / 2, 6.5, f, rgb(0, 0, 0), 90); };
  cotaH(0, LARG, PROF + 3, `${fmt(LARG)} m`);
  cotaV(0, PROF, -3, `${fmt(PROF)} m`);
  cotaH(x0, x1, edif.y1 + 2, `${fmt(LARG_ED)} m`);
  cotaH(x1, LARG, edif.y1 + 2, `${fmt(RECUO_PORTAL)} m`);
  cotaV(0, RECUO_ESTRADA, x1 + 3, `${fmt(RECUO_ESTRADA)} m`);
  cotaV(varanda.y0, varanda.y1, x0 - 2, `${fmt(PROF_VAR)} m`);
  cotaV(edif.y0, edif.y1, x0 - 2, `${fmt(PROF_ED)} m`);

  // Vértices
  const nomes = ['V1', 'V2', 'V3', 'V4'];
  P.forEach((p, i) => { const [x, y] = paraLocal(p); page.drawCircle({ x: X(x), y: Y(y), size: 2, color: rgb(0, 0, 0) }); texto(nomes[i], X(x) + (x > LARG / 2 ? 4 : -14), Y(y) + (y > PROF / 2 ? 4 : -9), 7.5, fb); });

  // Norte (quadrícula UTM): direção do norte nos eixos locais
  const nLocal: XY = [ux[1], uy[1]]; // componentes do vetor (0,1) UTM
  const nx = X(6), ny = Y(PROF + 14), comp = 30;
  const ang = Math.atan2(nLocal[1], nLocal[0]);
  const tip = { x: nx + Math.cos(ang) * comp, y: ny + Math.sin(ang) * comp };
  page.drawLine({ start: { x: nx, y: ny }, end: tip, thickness: 1.4, color: rgb(0, 0, 0) });
  const asa = (d: number) => ({ x: tip.x - Math.cos(ang + d) * 9, y: tip.y - Math.sin(ang + d) * 9 });
  page.drawLine({ start: tip, end: asa(0.4), thickness: 1.4 }); page.drawLine({ start: tip, end: asa(-0.4), thickness: 1.4 });
  texto('NQ', tip.x + 3, tip.y + 2, 9, fb);

  // ── Coluna direita: quadros e carimbo
  const cx = 298 * MM, larg = 107 * MM;
  let y = H - 22 * MM;
  const titulo = (t: string) => { page.drawRectangle({ x: cx, y: y - 4, width: larg, height: 14, color: VERDE }); texto(t, cx + 4, y, 8, fb, rgb(1, 1, 1)); y -= 16; };
  titulo('QUADRO DE VÉRTICES — SIRGAS 2000 / UTM 23S');
  const col = [cx + 3, cx + 20, cx + 62, cx + 106, cx + 150, cx + 186];
  ['Vért.', 'E (m)', 'N (m)', 'Azimute', 'Dist. (m)', 'Confrontação'].forEach((t, i) => texto(t, col[i], y, 6.5, fb));
  y -= 10;
  const confronta = ['Rua Cedro', 'Rua Walter e Maria', 'Remanescente*', 'Remanescente*'];
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length];
    [nomes[i], fmt(a[0], 3), fmt(a[1], 3), grausMinSeg(azimute(a, b)), fmt(distancia(a, b)), confronta[i]].forEach((t, k) => texto(t, col[k], y, 6.3));
    page.drawLine({ start: { x: cx, y: y - 3 }, end: { x: cx + larg, y: y - 3 }, thickness: 0.3, color: CLARO });
    y -= 10;
  });
  texto('* Confrontações a conferir em campo pelo responsável técnico.', cx + 3, y, 5.8, f, CINZA); y -= 16;

  titulo('QUADRO DE ÁREAS');
  const areas: [string, string][] = [
    ['Área do terreno (administrativa e vendas)', `${fmt(adm.areaM2)} m²`],
    ['Perímetro', `${fmt(adm.perimetroM)} m`],
    ['Área construída (PA-02)', `${fmt(LARG_ED * PROF_ED)} m²`],
    ['Varanda em deck de madeira', `${fmt(LARG_ED * PROF_VAR)} m²`],
    ['Taxa de ocupação', `${fmt(((LARG_ED * (PROF_ED + PROF_VAR)) / adm.areaM2) * 100)} %`],
    ['Área livre / permeável', `${fmt(adm.areaM2 - LARG_ED * (PROF_ED + PROF_VAR))} m²`],
  ];
  for (const [a, b] of areas) { texto(a, cx + 3, y, 7); texto(b, cx + larg - 3 - f.widthOfTextAtSize(b, 7), y, 7, fb); y -= 11; }
  y -= 6;

  titulo('NOTAS');
  const notas = [
    'Área administrativa e stand de vendas fora do perímetro do condomínio, na entrada, junto ao portal (Rua Walter e Maria × Rua Cedro), projeto V2.',
    'Geometria do terreno do levantamento do parcelamento (DXF "Condomínio de Chácaras Bom Jardims — atualizado V2").',
    'Edificação: projeto arquitetônico PA-02 (16,00 × 10,00 m) com varanda de 16,00 × 4,00 m voltada para a Rua Walter e Maria.',
    'Posição da edificação e do estacionamento: proposta de implantação, sujeita a aprovação municipal.',
    'Coordenadas planas UTM, SIRGAS 2000, fuso 23 Sul. Azimutes e distâncias planos. NBR 13133 e NBR 6492.',
    'Medidas em metros. Escala 1:400 (A3).',
  ];
  for (const n of notas) { for (const l of quebrar(n, f, 6.6, larg - 8)) { texto(l, cx + 3, y, 6.6); y -= 9; } y -= 2; }

  // Carimbo
  const cy = 12 * MM, ch = 62 * MM;
  page.drawRectangle({ x: cx, y: cy, width: larg, height: ch, borderColor: rgb(0, 0, 0), borderWidth: 1 });
  let yy = cy + ch - 14;
  texto('PLANTA DE IMPLANTAÇÃO', cx + 4, yy, 11, fb, VERDE); yy -= 13;
  texto('Área administrativa e stand de vendas', cx + 4, yy, 9, fb); yy -= 11;
  texto('Condomínio de Chácaras Bom Jardims — Açailândia/MA', cx + 4, yy, 8); yy -= 10;
  texto('Estrada do Piquiá dos Baianos, altura do km 15 da BR-222', cx + 4, yy, 7, f, CINZA); yy -= 14;
  page.drawLine({ start: { x: cx, y: yy + 8 }, end: { x: cx + larg, y: yy + 8 }, thickness: 0.5 });
  texto('Responsável técnico: José Romário', cx + 4, yy, 7.5, fb); yy -= 10;
  texto('Técnico em Agrimensura — CFT/MA 01209185369 · INCRA FQNS', cx + 4, yy, 6.8); yy -= 9;
  texto('Técnico em Edificações · Corretor CRECI/MA F-4.705', cx + 4, yy, 6.8); yy -= 9;
  texto('Romatec Consultoria Total · CRECI J-1234 · (99) 9 9181-1246', cx + 4, yy, 6.8); yy -= 14;
  texto(`Escala 1:400 · Folha A3 · Data: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })} · Projeto V2`, cx + 4, yy, 6.8, f, CINZA);
  page.drawLine({ start: { x: cx + larg - 70 * MM, y: cy + 8 }, end: { x: cx + larg - 6 * MM, y: cy + 8 }, thickness: 0.5 });
  texto('Assinatura do responsável técnico', cx + larg - 60 * MM, cy + 2, 6, f, CINZA);

  // Título do desenho
  texto('IMPLANTAÇÃO — ÁREA ADMINISTRATIVA E STAND DE VENDAS', ox, 22 * MM, 12, fb, VERDE);
  texto('Escala 1:400', ox, 17 * MM, 8, f, CINZA);

  const bytes = await doc.save();
  const saida = path.join(raiz, 'client/public/bom-jardims/projeto-stand-implantacao.pdf');
  writeFileSync(saida, bytes);
  console.log('ok', saida, bytes.length, 'bytes');
  void paraUtm; void V1;
}

function quebrar(t: string, f: PDFFont, tam: number, max: number): string[] {
  const out: string[] = []; let l = '';
  for (const p of t.split(' ')) { const n = l ? `${l} ${p}` : p; if (f.widthOfTextAtSize(n, tam) > max) { out.push(l); l = p; } else l = n; }
  if (l) out.push(l);
  return out;
}
void ({} as PDFPage);
main();
