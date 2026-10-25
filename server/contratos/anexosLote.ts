/**
 * Anexos do CPCV ligados à unidade, gerados da geometria georreferenciada (DXF, UTM SIRGAS 2000):
 * I — memorial descritivo (memorialDoLote: vértices, azimutes, distâncias, confrontações e área);
 * V — mapa individual da unidade: planta do empreendimento igual ao mapa do sistema (MapaTematico + mapa.json) com a
 *     chácara destacada, e o detalhe com vértices (UTM e geográficas), azimutes, distâncias, área e perímetro;
 * VI — licença de operação e certidão do registro: entra o PDF que o administrador subir; sem ele, página "a anexar".
 */
import { LineCapStyle, LineJoinStyle, PDFDocument, StandardFonts, clip, degrees, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, setLineJoin, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Memorial, RuaMemorial } from '../lotes/memorial';
import { pontoDentro, utmParaGeo } from '../../shared/utm';
import type { CamadasMapa } from './mapaEmpreendimento';
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
  /** Camadas do mapa do sistema (mapa.json): rio, APP, trilha, área de vivência, portal e pontos de apoio */
  camadas?: CamadasMapa | null;
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
  return { k, de, map: (p: XY): XY => [ox + (p[0] - e0) * k, oy + (p[1] - n0) * k] };
}

type Cor = ReturnType<typeof rgb>;
const hex = (h: string): Cor => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const svg = (pts: XY[], fechar: boolean) => pts.map((q, i) => `${i ? 'L' : 'M'} ${q[0].toFixed(2)} ${(-q[1]).toFixed(2)}`).join(' ') + (fechar ? ' Z' : '');

function poligono(p: PDFPage, pts: XY[], o: { cor?: Cor; borda?: Cor; esp?: number; opacidade?: number; opBorda?: number; tracejado?: number[]; redondo?: boolean }) {
  if (pts.length < 3) return;
  p.drawSvgPath(svg(pts, true), { x: 0, y: 0, color: o.cor, opacity: o.opacidade, borderColor: o.borda, borderWidth: o.borda ? o.esp ?? 1 : 0,
    borderOpacity: o.opBorda, borderDashArray: o.tracejado, borderLineCap: o.redondo ? LineCapStyle.Round : undefined });
}

/** Linha aberta (rio, ruas, trilha) com pontas e cantos arredondados */
function linha(p: PDFPage, pts: XY[], o: { cor: Cor; esp: number; opacidade?: number; tracejado?: number[]; fechar?: boolean }) {
  if (pts.length < 2) return;
  p.drawSvgPath(svg(pts, !!o.fechar), { x: 0, y: 0, borderColor: o.cor, borderWidth: o.esp, borderOpacity: o.opacidade, borderDashArray: o.tracejado, borderLineCap: LineCapStyle.Round });
}

/** Texto centrado/alinhado no ponto, girado, com contorno (halo) como o paintOrder="stroke" do mapa do sistema */
function texto(p: PDFPage, s: string, cx: number, cy: number, o: { font: PDFFont; size: number; cor: Cor; halo?: Cor; esp?: number; ang?: number; alinhar?: 'centro' | 'esq' | 'dir' }) {
  const w = o.font.widthOfTextAtSize(s, o.size), h = o.size * 0.35;
  const a = ((o.ang ?? 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const dx0 = o.alinhar === 'esq' ? 0 : o.alinhar === 'dir' ? -w : -w / 2;
  const x = cx + dx0 * c + h * sn, y = cy + dx0 * sn - h * c;
  const desenho = { size: o.size, font: o.font, rotate: degrees(o.ang ?? 0) };
  if (o.halo) {
    const r = (o.esp ?? o.size * 0.22) / 2;
    for (let i = 0; i < 12; i++) {
      const t = (i * Math.PI) / 6;
      p.drawText(s, { ...desenho, x: x + Math.cos(t) * r, y: y + Math.sin(t) * r, color: o.halo });
    }
  }
  p.drawText(s, { ...desenho, x, y, color: o.cor });
}

const centroide = (pts: XY[]): XY => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

/** Inclinação do texto na página, sempre legível (o mesmo critério do MapaTematico) */
const legivel = (ang: number) => { let a = ang; while (a <= -90) a += 180; while (a > 90) a -= 180; return a; };

function norte(p: PDFPage, fb: PDFFont, x: number, y: number) {
  p.drawCircle({ x, y: y + 9, size: 15, color: rgb(1, 1, 1), opacity: 0.85, borderColor: VERDE, borderWidth: 0.6 });
  p.drawSvgPath(`M ${x} ${-(y + 18)} L ${x - 6} ${-y} L ${x} ${-(y + 5)} L ${x + 6} ${-y} Z`, { x: 0, y: 0, color: VERDE });
  p.drawText('N', { x: x - 3, y: y + 26, size: 8, font: fb, color: VERDE });
}

function escala(p: PDFPage, f: PDFFont, x: number, y: number, k: number) {
  const metros = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(m => m * k >= 45) ?? 500;
  const w = metros * k;
  p.drawRectangle({ x: x - 4, y: y - 3, width: w + 22, height: 16, color: rgb(1, 1, 1), opacity: 0.85 });
  p.drawRectangle({ x, y, width: w / 2, height: 3, color: VERDE });
  p.drawRectangle({ x: x + w / 2, y, width: w / 2, height: 3, borderColor: VERDE, borderWidth: 0.6 });
  p.drawText(`0`, { x: x - 2, y: y + 5, size: 6, font: f });
  p.drawText(`${metros} m`, { x: x + w - 8, y: y + 5, size: 6, font: f });
}

/** Recorta o desenho ao quadro (o que passar da moldura não aparece) */
function recortar(p: PDFPage, x: number, y: number, w: number, h: number, desenhar: () => void) {
  p.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
  desenhar();
  p.pushOperators(popGraphicsState());
}

/** Graus decimais → 04°55'23,624" S */
function gms(v: number, pos: string, neg: string, casasGraus = 2): string {
  const a = Math.abs(v);
  let g = Math.floor(a), m = Math.floor((a - g) * 60), s = Math.round(((a - g) * 60 - m) * 60 * 1000) / 1000;
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; g += 1; }
  return `${String(g).padStart(casasGraus, '0')}°${String(m).padStart(2, '0')}'${fmt(s, 3).padStart(6, '0')}" ${v < 0 ? neg : pos}`;
}

// Cores do MapaTematico (client/src/components/empreendimento/MapaTematico.tsx)
const M = {
  fundo: hex('#E9EFDD'), grama: hex('#D9E6C3'), divisa: hex('#5B4A2F'), vivencia: hex('#C7DFA8'), vivenciaBorda: hex('#2F7D3A'),
  app: hex('#3F7A3A'), appBorda: hex('#2F6A2C'), mata: hex('#5E9E4E'), rio: hex('#2C7FB8'), rioClaro: hex('#7CC4EA'),
  meioFio: hex('#E2DDD2'), bloquete: hex('#A39A8C'), lote: hex('#EEF1F3'), cerca: hex('#6B4F2A'), escuro: hex('#0C3320'),
  ouro: hex('#C9A84C'), rotuloRua: hex('#2B2E33'), trilha: hex('#7A5530'), trilhaTexto: hex('#6A4626'), vivenciaTexto: hex('#1F5A2A'),
  rioTexto: hex('#1D5F8C'), codigoApagado: hex('#9AA3AB'), branco: rgb(1, 1, 1),
};

/** Anexo V — mapa individual: planta do empreendimento (a mesma do sistema) com a chácara destacada + detalhe georreferenciado */
export async function anexoMapa(u: DadosUnidade, ctx: Ctx, marca: string): Promise<Buffer> {
  const { doc, f, fb, pagina } = await base(`Anexo V — Mapa da unidade — ${ctx.ctr_numero}`, marca);
  const fi = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const cam = u.camadas ?? null;
  const titulo = 'ANEXO V — MAPA INDIVIDUAL DA UNIDADE';

  // ── Página 1: situação no empreendimento ────────────────────────────────────────────────
  {
    const { p, y, base: b } = pagina(titulo, subtitulo(ctx));
    p.pushOperators(setLineJoin(LineJoinStyle.Round));
    p.drawText('SITUAÇÃO NO EMPREENDIMENTO — PLANTA GERAL', { x: X0, y, size: 8.6, font: fb, color: VERDE });
    const lotes = [...u.outros.map(o => ({ codigo: o.codigo, v: o.verticesUtm, alvo: false })), { codigo: u.codigo, v: u.verticesUtm, alvo: true }].filter(l => l.v.length >= 3);
    const todos = [
      ...lotes.flatMap(l => l.v), ...(u.perimetroUtm ?? []), ...(cam?.perimetro ?? []), ...(cam?.pontos ?? []).map(q => q.pt),
      ...(cam?.rio?.line ?? []), ...(cam?.areas ?? []).flatMap(a => a.poly), ...(cam?.app?.poly ?? []), ...(cam?.trilha?.line ?? []),
    ];
    const legendaH = 84;
    const fx = X0, fw = X1 - X0, fTopo = y - 8, fBase = b + 14 + legendaH, fh = fTopo - fBase;
    const g = encaixe(todos, fx, fBase, fw, fh, 0.035);
    // Escala do desenho do sistema (largura útil de 952 px para a propriedade inteira) → espessuras e fontes proporcionais
    const s = (g.k * g.de) / 952;
    const T = 1.15; // fontes um pouco maiores que a tela, para a impressão
    const px = (v: number) => v * s;
    const larguraRua = Math.max(px(6), 12 * g.k), larguraRio = Math.max(px(5), 9 * g.k);
    const P = (pts: XY[]) => pts.map(g.map);

    p.drawRectangle({ x: fx, y: fBase, width: fw, height: fh, color: M.fundo });
    recortar(p, fx, fBase, fw, fh, () => {
      // Propriedade em gramado; perímetro tracejado
      if (cam?.perimetro.length) poligono(p, P(cam.perimetro), { cor: M.grama, borda: M.divisa, esp: px(1.5), tracejado: [0.1, px(5)], redondo: true });
      if (u.perimetroUtm?.length) poligono(p, P(u.perimetroUtm), { cor: cam?.perimetro.length ? undefined : M.grama, borda: M.divisa, esp: px(2.5), tracejado: [0.1, px(5)], redondo: true });
      for (const a of cam?.areas ?? []) poligono(p, P(a.poly), { cor: M.vivencia, borda: M.vivenciaBorda, esp: px(1.5), tracejado: [px(6), px(4)] });
      for (const a of cam?.areas ?? []) {
        // Copas (o padrão "vivencia" do mapa do sistema)
        const pts = P(a.poly), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        const passo = px(18);
        for (let x = Math.min(...xs); x < Math.max(...xs); x += passo) for (let yy = Math.min(...ys); yy < Math.max(...ys); yy += passo) {
          if (pontoDentro(x + passo * 0.28, yy + passo * 0.28, pts)) p.drawCircle({ x: x + passo * 0.28, y: yy + passo * 0.28, size: px(2.6), color: hex('#8DBF6A') });
          if (pontoDentro(x + passo * 0.78, yy + passo * 0.72, pts)) p.drawCircle({ x: x + passo * 0.78, y: yy + passo * 0.72, size: px(2.2), color: hex('#9CC97B') });
        }
      }
      if (cam?.app?.poly.length) poligono(p, P(cam.app.poly), { cor: M.app, opacidade: 0.28, borda: M.appBorda, opBorda: 0.55, esp: px(1) });
      if (cam?.rio?.line.length) {
        const r = P(cam.rio.line);
        linha(p, r, { cor: M.mata, esp: larguraRio * 3.2, opacidade: 0.45 });
        linha(p, r, { cor: M.rio, esp: larguraRio + px(2) });
        linha(p, r, { cor: M.rioClaro, esp: larguraRio * 0.55 });
      }
      // Estrada de acesso e eixos fora das quadras
      for (const r of cam?.ruas ?? []) { linha(p, P(r.line), { cor: M.meioFio, esp: larguraRua + px(4) }); linha(p, P(r.line), { cor: M.bloquete, esp: larguraRua }); }
      // Ruas entre as quadras: faixa de 6 m em volta de cada lote (meio-fio + bloquete)
      for (const l of lotes) linha(p, P(l.v), { cor: M.meioFio, esp: larguraRua + px(4), fechar: true });
      for (const l of lotes) linha(p, P(l.v), { cor: M.bloquete, esp: larguraRua, fechar: true });
      // Lotes com cerca; a chácara do contrato em destaque
      for (const l of lotes) {
        const pts = P(l.v);
        poligono(p, pts, { cor: l.alvo ? M.ouro : M.lote });
        poligono(p, pts, { borda: M.branco, esp: px(2.2), opBorda: 0.9 });
        poligono(p, pts, { borda: M.cerca, esp: px(1.3), tracejado: [0.1, px(4)], redondo: true });
        if (l.alvo) poligono(p, pts, { borda: M.escuro, esp: px(3.5) });
        const [cx, cy] = centroide(pts);
        texto(p, l.codigo, cx, cy, { font: fb, size: px(11) * T, cor: l.alvo ? M.escuro : M.codigoApagado, halo: M.branco, esp: px(2.5) });
      }
      // Nomes das ruas (rótulos do DXF: posição e inclinação do projeto)
      for (const r of u.ruas) {
        const [x, yy] = g.map([r.e, r.n]);
        texto(p, r.nome.toUpperCase(), x, yy, { font: fb, size: px(10) * T, cor: M.branco, halo: M.rotuloRua, esp: px(2.5), ang: legivel(r.angulo ?? 0) });
      }
      // Trilha ecológica
      if (cam?.trilha?.line.length) {
        const t = P(cam.trilha.line);
        linha(p, t, { cor: M.branco, esp: px(4), opacidade: 0.8 });
        linha(p, t, { cor: M.trilha, esp: px(1.8), tracejado: [px(5), px(4)] });
        if (cam.trilha.rotulo) { const [x, yy] = g.map(cam.trilha.rotulo); texto(p, cam.trilha.nome, x, yy - px(28), { font: fi, size: px(10) * T, cor: M.trilhaTexto, halo: M.branco, esp: px(3) }); }
      }
      // Área de vivência e rio
      for (const a of cam?.areas ?? []) {
        if (!a.rotulo) continue;
        const [x, yy] = g.map(a.rotulo), fs = px(12) * T;
        const partes = a.nome.split(' e ');
        const linhas = [partes[0].toUpperCase(), ...(partes.length > 1 ? [`E ${partes.slice(1).join(' e ').toUpperCase()}`] : [])];
        linhas.forEach((l, i) => texto(p, l, x, yy - i * (fs + px(2)), { font: fb, size: fs, cor: M.vivenciaTexto, halo: M.branco, esp: px(3) }));
        if (a.detalhe) texto(p, a.detalhe, x, yy - linhas.length * (fs + px(2)) + px(1), { font: f, size: fs - px(2) * T, cor: M.vivenciaTexto, halo: M.branco, esp: px(3) });
      }
      if (cam?.rio?.rotulo) { const [x, yy] = g.map(cam.rio.rotulo); texto(p, cam.rio.nome.split(' (')[0].toUpperCase(), x, yy, { font: fi, size: px(12) * T, cor: M.rioTexto, halo: M.branco, esp: px(3), ang: 78 }); }
      // Pontos de referência: portal desenhado e os demais com nome
      for (const q of cam?.pontos ?? []) {
        const [x, yy] = g.map(q.pt);
        if (/portal/i.test(q.nome)) {
          const z = s * 1.2;
          const r = (rx: number, ry: number, w: number, h: number, cor: Cor) => p.drawRectangle({ x: x + rx * z, y: yy - (ry + h) * z, width: w * z, height: h * z, color: cor, borderColor: M.escuro, borderWidth: cor === M.escuro ? 0 : z });
          r(-13, -16, 6, 18, M.cerca); r(7, -16, 6, 18, M.cerca);
          p.drawSvgPath(`M ${x - 10 * z} ${-(yy + 15 * z)} Q ${x} ${-(yy + 27 * z)} ${x + 10 * z} ${-(yy + 15 * z)}`, { x: 0, y: 0, borderColor: M.ouro, borderWidth: 3 * z });
          r(-15, -20, 30, 5, M.escuro);
          continue;
        }
        p.drawCircle({ x, y: yy, size: px(6), color: M.ouro, borderColor: M.escuro, borderWidth: px(2) });
        const rotulo = q.nome.replace(/\s*\(.*\)\s*/, '').replace(/ \/ .*/, '').replace(/ — .*/, '');
        texto(p, rotulo, x + px(9), yy, { font: fb, size: px(10) * T, cor: M.escuro, halo: M.branco, esp: px(3), alinhar: 'esq' });
      }
    });

    // Lupa do portal de entrada (no canto que menos cobre os lotes, como no sistema)
    const portal = cam?.pontos.find(q => /portal/i.test(q.nome));
    if (portal) {
      const pt = g.map(portal.pt);
      const lw = Math.min(px(300) * 1.05, fw * 0.36);
      const faixa = Math.max(px(18), lw * 0.075), imgH = (lw - 6) * (336 / 1200), lh = imgH + 6 + faixa;
      const m = 6;
      const cantos = [[fx + m, fTopo - m - lh], [fx + fw - m - lw, fTopo - m - lh], [fx + m, fBase + m], [fx + fw - m - lw, fBase + m]] as XY[];
      const vert = lotes.flatMap(l => P(l.v));
      const obst = [...P(cam?.rio?.line ?? []), ...P(cam?.perimetro ?? []), ...(cam?.areas ?? []).flatMap(a => P(a.poly))];
      const cobre = ([cx, cy]: XY) => (q: XY) => q[0] >= cx - 8 && q[0] <= cx + lw + 8 && q[1] >= cy - 8 && q[1] <= cy + lh + 8;
      const [bx, by] = cantos.map(c => ({ c, n: vert.filter(cobre(c)).length * 100 + obst.filter(cobre(c)).length, d: Math.hypot(c[0] + lw / 2 - pt[0], c[1] + lh / 2 - pt[1]) }))
        .sort((a, b2) => a.n - b2.n || a.d - b2.d)[0].c;
      const lente = px(18) * 1.1, py = pt[1] + px(6);
      const quinas = [[bx, by], [bx + lw, by], [bx, by + lh], [bx + lw, by + lh]] as XY[];
      for (const c of quinas.sort((a, b2) => Math.hypot(a[0] - pt[0], a[1] - py) - Math.hypot(b2[0] - pt[0], b2[1] - py)).slice(0, 2)) {
        p.drawLine({ start: { x: pt[0], y: py }, end: { x: c[0], y: c[1] }, thickness: 0.9, color: M.escuro, opacity: 0.55, dashArray: [3, 2.2] });
      }
      p.drawCircle({ x: pt[0], y: py, size: lente, color: M.branco, opacity: 0.25, borderColor: M.escuro, borderWidth: 1.6 });
      p.drawCircle({ x: pt[0], y: py, size: lente, borderColor: M.ouro, borderWidth: 0.8 });
      p.drawRectangle({ x: bx, y: by, width: lw, height: lh, color: M.branco, borderColor: M.ouro, borderWidth: 1.6 });
      if (cam?.imagemPortal) {
        try {
          const img = await doc.embedPng(cam.imagemPortal);
          const k = Math.min((lw - 6) / img.width, (imgH - 3) / img.height);
          p.drawImage(img, { x: bx + (lw - img.width * k) / 2, y: by + faixa + 3 + (imgH - 3 - img.height * k) / 2, width: img.width * k, height: img.height * k });
        } catch { /* sem imagem: só a faixa */ }
      }
      p.drawRectangle({ x: bx, y: by, width: lw, height: faixa, color: M.escuro });
      const fs = Math.min(9, faixa * 0.5);
      p.drawCircle({ x: bx + 9, y: by + faixa / 2 + 0.6, size: fs * 0.32, borderColor: M.ouro, borderWidth: 1.1 });
      p.drawLine({ start: { x: bx + 9 + fs * 0.22, y: by + faixa / 2 - fs * 0.2 }, end: { x: bx + 9 + fs * 0.55, y: by + faixa / 2 - fs * 0.55 }, thickness: 1.3, color: M.ouro });
      p.drawText('PORTAL DE ENTRADA', { x: bx + 17, y: by + faixa / 2 - fs * 0.35, size: fs, font: fb, color: M.branco });
    }

    // Chamada da chácara do contrato, para fora do conjunto
    const cAlvo = g.map(centroide(u.verticesUtm));
    const meio = centroide(lotes.map(l => g.map(centroide(l.v))));
    const vx = cAlvo[0] - meio[0], vy = cAlvo[1] - meio[1], nv = Math.hypot(vx, vy) || 1;
    const rot = `CHÁCARA ${u.codigo} — OBJETO DESTE CONTRATO`;
    const tw = fb.widthOfTextAtSize(rot, 6.6) + 10;
    let tx = cAlvo[0] + (vx / nv) * 56, ty = cAlvo[1] + (vy / nv) * 56;
    tx = Math.min(Math.max(tx, fx + 4 + (vx < 0 ? tw : 0)), fx + fw - 4 - (vx < 0 ? 0 : tw));
    ty = Math.min(Math.max(ty, fBase + 24), fTopo - 18);
    // A chamada sai da borda do código da chácara (não cobre o rótulo)
    const ux = (tx - cAlvo[0]) / (Math.hypot(tx - cAlvo[0], ty - cAlvo[1]) || 1), uy = (ty - cAlvo[1]) / (Math.hypot(tx - cAlvo[0], ty - cAlvo[1]) || 1);
    p.drawLine({ start: { x: cAlvo[0] + ux * 9, y: cAlvo[1] + uy * 9 }, end: { x: tx, y: ty }, thickness: 0.9, color: M.escuro });
    const rx = vx < 0 ? tx - tw : tx;
    p.drawRectangle({ x: rx, y: ty - 6.5, width: tw, height: 13, color: M.escuro, borderColor: M.ouro, borderWidth: 0.8 });
    p.drawText(rot, { x: rx + 5, y: ty - 2.4, size: 6.6, font: fb, color: M.branco });

    p.drawRectangle({ x: fx, y: fBase, width: fw, height: fh, borderColor: DOURADO, borderWidth: 0.8 });
    norte(p, fb, fx + fw - 22, fBase + 14);
    escala(p, f, fx + 12, fBase + 10, g.k);

    // Legenda (as mesmas camadas do mapa do sistema)
    const itens: { t: string; d: (x: number, yy: number) => void }[] = [
      { t: `Chácara ${u.codigo} (objeto do contrato)`, d: (x, yy) => p.drawRectangle({ x, y: yy, width: 14, height: 8, color: M.ouro, borderColor: M.escuro, borderWidth: 1.2 }) },
      { t: 'Demais chácaras (com cerca)', d: (x, yy) => p.drawRectangle({ x, y: yy, width: 14, height: 8, color: M.lote, borderColor: M.cerca, borderWidth: 0.6, borderDashArray: [0.1, 1.6], borderLineCap: LineCapStyle.Round }) },
      { t: 'Ruas (bloquete e meio-fio)', d: (x, yy) => { p.drawRectangle({ x, y: yy + 1, width: 14, height: 6, color: M.bloquete, borderColor: M.meioFio, borderWidth: 1 }); } },
      { t: 'Área de vivência e recreação', d: (x, yy) => p.drawRectangle({ x, y: yy, width: 14, height: 8, color: M.vivencia, borderColor: M.vivenciaBorda, borderWidth: 0.7, borderDashArray: [2, 1.4] }) },
      { t: 'Rio (curso d\'água)', d: (x, yy) => { p.drawLine({ start: { x, y: yy + 4 }, end: { x: x + 14, y: yy + 4 }, thickness: 3.4, color: M.rio, lineCap: LineCapStyle.Round }); p.drawLine({ start: { x, y: yy + 4 }, end: { x: x + 14, y: yy + 4 }, thickness: 1.2, color: M.rioClaro }); } },
      { t: 'APP — faixa de 30 m do córrego', d: (x, yy) => p.drawRectangle({ x, y: yy, width: 14, height: 8, color: M.app, opacity: 0.3, borderColor: M.appBorda, borderOpacity: 0.6, borderWidth: 0.6 }) },
      { t: 'Trilha ecológica', d: (x, yy) => p.drawLine({ start: { x, y: yy + 4 }, end: { x: x + 14, y: yy + 4 }, thickness: 1.2, color: M.trilha, dashArray: [2.4, 1.8] }) },
      { t: 'Portal, stand, poço e pontos de apoio', d: (x, yy) => p.drawCircle({ x: x + 7, y: yy + 4, size: 3.4, color: M.ouro, borderColor: M.escuro, borderWidth: 1 }) },
      { t: 'Perímetro do empreendimento', d: (x, yy) => p.drawLine({ start: { x, y: yy + 4 }, end: { x: x + 14, y: yy + 4 }, thickness: 1.2, color: M.divisa, dashArray: [0.1, 2.2], lineCap: LineCapStyle.Round }) },
    ];
    const colW = fw / 3;
    itens.forEach((it, i) => {
      const x = fx + (i % 3) * colW, yy = fBase - 16 - Math.floor(i / 3) * 13;
      it.d(x, yy);
      p.drawText(it.t, { x: x + 19, y: yy + 1.5, size: 6.6, font: f, color: hex('#333333') });
    });
    const portalGeo = cam?.pontos.find(q => /portal/i.test(q.nome));
    const [plon, plat] = portalGeo ? utmParaGeo(portalGeo.pt[0], portalGeo.pt[1], u.fuso) : [0, 0];
    const nota = `${portalGeo ? `Portal de entrada: ${gms(plat, 'N', 'S')}, ${gms(plon, 'E', 'W', 3)} (${plat.toFixed(8)}°, ${plon.toFixed(8)}°). ` : ''}Planta do empreendimento na mesma base do mapa do sistema: lotes, perímetro e nomes das ruas do levantamento georreferenciado (DXF, UTM SIRGAS 2000, fuso ${u.fuso} Sul); rio, APP, trilha, área de vivência e pontos de apoio do projeto. Desenho ilustrativo da localização: prevalecem o memorial descritivo (Anexo I) e a matrícula da unidade.`;
    quebrar(f, nota, 6.2, fw).forEach((l, i) => p.drawText(l, { x: fx, y: fBase - 16 - 3 * 13 - 2 - i * 8, size: 6.2, font: f, color: CINZA }));
  }

  // ── Página 2: detalhe da unidade (vértices, azimutes, distâncias e coordenadas) ─────────────
  {
    const { p, y } = pagina(`${titulo} — DETALHE DA UNIDADE`, subtitulo(ctx));
    p.pushOperators(setLineJoin(LineJoinStyle.Round));
    const vt = u.memorial.vertices;
    const vs = vt.map(v => [v.e, v.n] as XY);
    p.drawText(`CHÁCARA ${u.codigo}${u.quadra ? ` · QUADRA ${u.quadra}` : ''} — VÉRTICES, AZIMUTES, DISTÂNCIAS E COORDENADAS`, { x: X0, y, size: 8.6, font: fb, color: VERDE });
    const fx = X0, fw = X1 - X0, fh = 372, fTopo = y - 8, fBase = fTopo - fh;
    p.drawRectangle({ x: fx, y: fBase, width: fw, height: fh, color: M.fundo });
    if (vs.length >= 3) {
      const t = encaixe(vs, fx, fBase, fw, fh, 0.24);
      const P = (pts: XY[]) => pts.map(t.map);
      const larguraRua = 12 * t.k;
      // Entorno recortado: chácaras vizinhas, ruas e rótulos do DXF
      recortar(p, fx, fBase, fw, fh, () => {
        if (u.perimetroUtm?.length) poligono(p, P(u.perimetroUtm), { cor: M.grama, borda: M.divisa, esp: 1.4, tracejado: [0.1, 4], redondo: true });
        if (u.camadas?.app?.poly.length) poligono(p, P(u.camadas.app.poly), { cor: M.app, opacidade: 0.2, borda: M.appBorda, opBorda: 0.4, esp: 0.8 });
        const perto = [...u.outros.filter(o => o.verticesUtm.length >= 3 && o.verticesUtm.some(q => vs.some(v => Math.hypot(q[0] - v[0], q[1] - v[1]) < 260))), { codigo: u.codigo, verticesUtm: u.verticesUtm }];
        for (const o of perto) linha(p, P(o.verticesUtm), { cor: M.meioFio, esp: larguraRua + 3, fechar: true });
        for (const o of perto) linha(p, P(o.verticesUtm), { cor: M.bloquete, esp: larguraRua, fechar: true });
        for (const o of perto) {
          if (o.codigo === u.codigo) continue;
          const pts = P(o.verticesUtm);
          poligono(p, pts, { cor: M.lote, borda: M.cerca, esp: 1, tracejado: [0.1, 3], redondo: true });
          const [cx, cy] = centroide(pts);
          texto(p, o.codigo, cx, cy, { font: fb, size: 9, cor: M.codigoApagado, halo: M.branco, esp: 2 });
        }
        for (const r of u.ruas) {
          const [x, yy] = t.map([r.e, r.n]);
          texto(p, r.nome.toUpperCase(), x, yy, { font: fb, size: 7.5, cor: M.branco, halo: M.rotuloRua, esp: 2, ang: legivel(r.angulo ?? 0) });
        }
      });
      const pts = P(vs);
      poligono(p, pts, { cor: hex('#F3E7C2'), borda: M.escuro, esp: 2 });
      poligono(p, pts, { borda: M.cerca, esp: 1, tracejado: [0.1, 3.2], redondo: true });
      const c = centroide(pts);
      vt.forEach((v, i) => {
        const a = pts[i], b2 = pts[(i + 1) % pts.length];
        // Lado Vi → Vi+1: azimute e distância ao longo do lado, por fora
        const mx = (a[0] + b2[0]) / 2, my = (a[1] + b2[1]) / 2;
        const ang = legivel((Math.atan2(b2[1] - a[1], b2[0] - a[0]) * 180) / Math.PI);
        const ox = mx - c[0], oy = my - c[1], on = Math.hypot(ox, oy) || 1;
        texto(p, `Az ${v.azimute}`, mx + (ox / on) * 9, my + (oy / on) * 9, { font: fb, size: 7.4, cor: M.escuro, halo: M.branco, esp: 2.4, ang });
        texto(p, `${fmt(v.distancia)} m`, mx + (ox / on) * 19, my + (oy / on) * 19, { font: f, size: 7.4, cor: M.escuro, halo: M.branco, esp: 2.4, ang });
      });
      vt.forEach((v, i) => {
        const a = pts[i];
        const dx = a[0] - c[0], dy = a[1] - c[1], n = Math.hypot(dx, dy) || 1;
        p.drawCircle({ x: a[0], y: a[1], size: 3.4, color: M.branco, borderColor: M.escuro, borderWidth: 1.4 });
        p.drawCircle({ x: a[0], y: a[1], size: 1.3, color: M.escuro });
        // Rótulo do vértice com a coordenada UTM, na diagonal para fora
        const lx = a[0] + (dx / n) * 12, ly = a[1] + (dy / n) * 12;
        const al = dx >= 0 ? 'esq' : 'dir';
        const sobe = dy >= 0;
        const l0 = ly + (sobe ? 16 : -2);
        texto(p, v.nome, lx, l0, { font: fb, size: 8.6, cor: M.escuro, halo: M.branco, esp: 2.4, alinhar: al });
        texto(p, `E ${fmt(v.e, 3)}`, lx, l0 - 9, { font: f, size: 6.8, cor: M.escuro, halo: M.branco, esp: 2.2, alinhar: al });
        texto(p, `N ${fmt(v.n, 3)}`, lx, l0 - 17, { font: f, size: 6.8, cor: M.escuro, halo: M.branco, esp: 2.2, alinhar: al });
      });
      texto(p, `CHÁCARA ${u.codigo}${u.quadra ? ` · QUADRA ${u.quadra}` : ''}`, c[0], c[1] + 9, { font: fb, size: 10, cor: M.escuro, halo: hex('#F3E7C2'), esp: 2 });
      texto(p, `Área ${fmt(u.areaM2)} m²`, c[0], c[1] - 3, { font: f, size: 8, cor: M.escuro, halo: hex('#F3E7C2'), esp: 2 });
      texto(p, `Perímetro ${fmt(u.perimetroM)} m`, c[0], c[1] - 13, { font: f, size: 8, cor: M.escuro, halo: hex('#F3E7C2'), esp: 2 });
      norte(p, fb, fx + fw - 22, fBase + 14);
      escala(p, f, fx + 12, fBase + 10, t.k);
    } else {
      texto(p, 'Geometria da unidade ainda não importada do DXF.', fx + fw / 2, fBase + fh / 2, { font: f, size: 9, cor: CINZA });
    }
    p.drawRectangle({ x: fx, y: fBase, width: fw, height: fh, borderColor: DOURADO, borderWidth: 0.8 });

    // Quadro de vértices e lados
    let yy = fBase - 18;
    p.drawText(`QUADRO DE VÉRTICES E LADOS — UTM SIRGAS 2000, fuso ${u.fuso} Sul · coordenadas geográficas SIRGAS 2000`, { x: X0, y: yy, size: 8, font: fb, color: VERDE });
    yy -= 6;
    const cols = [{ t: 'Vértice', w: 34 }, { t: 'E (m)', w: 62 }, { t: 'N (m)', w: 68 }, { t: 'Latitude', w: 76 }, { t: 'Longitude', w: 76 }, { t: 'Lado', w: 44 }, { t: 'Azimute', w: 62 }, { t: 'Distância', w: fw - 422 }];
    p.drawRectangle({ x: X0, y: yy - 13, width: fw, height: 14, color: VERDE });
    let x = X0;
    for (const col of cols) { p.drawText(col.t, { x: x + 3, y: yy - 9.5, size: 7, font: fb, color: M.branco }); x += col.w; }
    yy -= 14;
    vt.forEach((v, i) => {
      const [lon, lat] = utmParaGeo(v.e, v.n, u.fuso);
      if (i % 2 === 1) p.drawRectangle({ x: X0, y: yy - 12, width: fw, height: 12, color: CREME });
      const prox = vt[(i + 1) % vt.length];
      const vals = [v.nome, fmt(v.e, 3), fmt(v.n, 3), gms(lat, 'N', 'S'), gms(lon, 'E', 'W', 3), `${v.nome}–${prox.nome}`, v.azimute, `${fmt(v.distancia)} m`];
      x = X0;
      vals.forEach((s2, j) => { p.drawText(s2, { x: x + 3, y: yy - 8.8, size: 6.9, font: j === 0 ? fb : f }); x += cols[j].w; });
      yy -= 12;
    });
    p.drawLine({ start: { x: X0, y: yy }, end: { x: X1, y: yy }, thickness: 0.6, color: VERDE });
    yy -= 16;

    const [lon, lat] = utmParaGeo(...centroide(u.verticesUtm.length ? u.verticesUtm : vs), u.fuso);
    const resumo: [string, string][] = [
      ['Unidade', `Chácara ${u.codigo}${u.quadra ? `, Quadra ${u.quadra}` : ''}${u.numero != null ? `, Lote ${String(u.numero).padStart(2, '0')}` : ''}`],
      ['Área', `${fmt(u.areaM2)} m² (${fmt(u.areaM2 / 10000, 4)} ha)`],
      ['Perímetro', `${fmt(u.perimetroM)} m · ${vt.length} vértices`],
      ['Centro aproximado', `${gms(lat, 'N', 'S')}  ${gms(lon, 'E', 'W', 3)}  (${lat.toFixed(8)}°, ${lon.toFixed(8)}°)`],
      ['Sistema de referência', `SIRGAS 2000 · projeção UTM, fuso ${u.fuso} Sul (MC ${u.fuso * 6 - 183}°) · azimutes planos (quadrícula UTM) a partir do Norte`],
    ];
    for (const [k, v] of resumo) {
      p.drawText(`${k}:`, { x: X0, y: yy, size: 7.8, font: fb, color: VERDE });
      p.drawText(v, { x: X0 + 96, y: yy, size: 7.8, font: f });
      yy -= 11.5;
    }
    yy -= 4;
    if (u.responsavelTecnico) { p.drawText(`Responsável técnico: ${u.responsavelTecnico}`, { x: X0, y: yy, size: 7.4, font: f, color: CINZA }); yy -= 10; }
    p.drawText('Coordenadas, azimutes e distâncias do levantamento georreferenciado (DXF) — os mesmos do memorial descritivo (Anexo I).', { x: X0, y: yy, size: 7, font: f, color: CINZA });
  }
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
