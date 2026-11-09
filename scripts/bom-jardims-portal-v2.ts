/**
 * Projeto PA-01 rev. V2 — Portal de entrada do Condomínio de Chácaras Bom Jardims (nov/2026).
 *
 * Definição de José Romário: quem chega vem pela via de entrada (Rua Walter e Maria), passando em frente à área
 * administrativa / stand de vendas; no portal o fluxo se divide entre a Rua Cedro e a continuação da Rua Walter e Maria.
 * O portal atravessa a via (12,00 m) e começa no PONTO INICIAL do limite da fazenda (E 235.955,872 · N 9.454.732,409,
 * SIRGAS 2000 / UTM 23S): nada é projetado além desse ponto — todo o conjunto fica para dentro, até o canto da área do
 * stand. Sem ala lateral: de um lado o limite da fazenda, do outro a área do stand (aberta ao público).
 * Sem muro para recolher folha de correr, o portão principal é de giro, bipartido, abrindo para dentro, automatizado.
 *
 * Saídas (client/public/bom-jardims/):
 *  - projeto-portal-v2.pdf ............ A3 paisagem, 2 folhas (fachada + planta 1:100; implantação 1:500)
 *  - projeto-portal-fachada.webp ...... fachada frontal (galeria do site)
 *  - projeto-portal-planta.webp ....... planta baixa
 *  - projeto-portal-implantacao.webp .. implantação geral
 *
 * Uso: npx tsx scripts/bom-jardims-portal-v2.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { distancia, type XY } from '../shared/utm';

// Playwright vem instalado globalmente no ambiente (fora do package.json): require com NODE_PATH
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');
const raiz = path.resolve(import.meta.dirname, '..');
const pub = (f: string) => path.join(raiz, 'client/public/bom-jardims', f);
const v = JSON.parse(readFileSync(path.join(raiz, 'server/data/bom-jardims/projeto-v2.json'), 'utf8'));
const [V1, V2, V3] = v.areaAdministrativa.verticesUtm as XY[];

// Referencial: origem no canto V2 da área administrativa (esquina Rua Walter e Maria × Rua Cedro);
// X ao longo da via de entrada, no sentido de quem chega (para o lado da D10); Y para dentro (ao longo da Rua Cedro).
// A via de entrada ocupa Y de −12 a 0; o limite da fazenda é Y = −12.
const ux: XY = [(V2[0] - V3[0]) / distancia(V3, V2), (V2[1] - V3[1]) / distancia(V3, V2)];
const uy: XY = [(V1[0] - V2[0]) / distancia(V2, V1), (V1[1] - V2[1]) / distancia(V2, V1)];
const local = (p: XY): XY => [(p[0] - V2[0]) * ux[0] + (p[1] - V2[1]) * ux[1], (p[0] - V2[0]) * uy[0] + (p[1] - V2[1]) * uy[1]];

const fmt = (n: number, c = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });

const PONTO_INICIAL: XY = [v.portal.pontoInicial.e, v.portal.pontoInicial.n];
const [, yLimite] = local(PONTO_INICIAL);
const VIA = Math.round(-yLimite * 100) / 100; // 12,00 m: do canto V2 ao ponto inicial no limite da fazenda

// ── Programa ao longo do portal: s = distância a partir do canto do stand (V2) até o ponto inicial (limite da fazenda)
const GUARITA = { s0: -3.2, s1: -0.4, prof0: 0.4, prof1: 3.7 }; // na área administrativa, ao lado do portão de pedestres
const PILARETE = { s0: 0, s1: 0.3 };
const PP = { s0: 0.3, s1: 1.5 }; // portão de pedestres
const PIL_E = { s0: 1.5, s1: 2.4 }, PIL_D = { s0: 9.4, s1: 10.3 };
const PT = { s0: 2.4, s1: 9.4 }; // portão principal 7,00 m
const MURETA = { s0: 10.3, s1: VIA };
const GABARITO = 4.6, ALT_PORTAO = 1.8, ALT_MURETA = 1.4;
const COTAS = [GUARITA.s0, GUARITA.s1, PILARETE.s0, PILARETE.s1, PP.s1, PIL_E.s1, PT.s1, PIL_D.s1, MURETA.s1];
const fmtUtm = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const TXT_PONTO = `E ${fmtUtm(PONTO_INICIAL[0])} · N ${fmtUtm(PONTO_INICIAL[1])}`;

const COR = {
  tijolo: '#B9653F', tijoloEsc: '#8E4A2C', madeira: '#6B4A2E', madeiraClara: '#8A6440', telha: '#B4472E', vidro: '#A9CBE0',
  solo: '#D6C69E', grama: '#E7EBDD', via: '#DCD3C8', estrada: '#CFC6B8', verde: '#0C3320', dourado: '#C9A84C', cota: '#B3261E',
  texto: '#23352A', suave: '#5C6B5F', linha: '#2A2A2A',
};
const FONTE = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";

/** Moldura de desenho: coordenadas em metros (y para cima) → unidades do SVG (cm) */
function quadro(x0: number, x1: number, y0: number, y1: number) {
  const k = 100;
  const X = (x: number) => +((x - x0) * k).toFixed(1), Y = (y: number) => +((y1 - y) * k).toFixed(1);
  const L = (x: number) => +(x * k).toFixed(1);
  const w = (x1 - x0) * k, h = (y1 - y0) * k;
  const rect = (r: { x0: number; x1: number; y0: number; y1: number }, at: string) =>
    `<rect x="${X(r.x0)}" y="${Y(r.y1)}" width="${L(r.x1 - r.x0)}" height="${L(r.y1 - r.y0)}" ${at}/>`;
  // Atributos passados em `at` vêm antes dos padrões: no SVG o primeiro atributo repetido é o que vale
  const line = (a: XY, b: XY, at = '') => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" ${at} stroke="${COR.linha}" stroke-width="2"/>`;
  const text = (t: string, x: number, y: number, tam = 18, at = '') =>
    `<text x="${X(x)}" y="${Y(y)}" font-size="${tam}" ${at} font-family="${FONTE}" fill="${COR.texto}">${t}</text>`;
  const poly = (pts: XY[], at: string) => `<polygon points="${pts.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')}" ${at}/>`;
  /** Cotas horizontais encadeadas (traço oblíquo nas extremidades, texto acima) */
  const cotasH = (xs: number[], y: number, tam = 15) => {
    let s = line([xs[0], y], [xs[xs.length - 1], y], `stroke="${COR.cota}" stroke-width="1.5"`);
    for (const x of xs) s += line([x - 0.1, y - 0.1], [x + 0.1, y + 0.1], `stroke="${COR.cota}" stroke-width="2"`) + line([x, y - 0.2], [x, y + 0.2], `stroke="${COR.cota}" stroke-width="1"`);
    for (let i = 0; i < xs.length - 1; i++) s += text(fmt(xs[i + 1] - xs[i]), (xs[i] + xs[i + 1]) / 2, y + 0.12, tam, `text-anchor="middle" fill="${COR.cota}"`);
    return s;
  };
  const cotaV = (x: number, ya: number, yb: number, rot: string, tam = 15) =>
    line([x, ya], [x, yb], `stroke="${COR.cota}" stroke-width="1.5"`) +
    line([x - 0.1, ya - 0.1], [x + 0.1, ya + 0.1], `stroke="${COR.cota}" stroke-width="2"`) + line([x - 0.1, yb - 0.1], [x + 0.1, yb + 0.1], `stroke="${COR.cota}" stroke-width="2"`) +
    `<text x="${X(x) - 8}" y="${Y((ya + yb) / 2)}" font-size="${tam}" font-family="${FONTE}" fill="${COR.cota}" text-anchor="middle" transform="rotate(-90 ${X(x) - 8} ${Y((ya + yb) / 2)})">${rot}</text>`;
  /** Cotas verticais encadeadas (texto girado, à esquerda da linha) */
  const cotasV = (ys: number[], x: number, tam = 15) => {
    let r = line([x, ys[0]], [x, ys[ys.length - 1]], `stroke="${COR.cota}" stroke-width="1.5"`);
    for (const y of ys) r += line([x - 0.1, y - 0.1], [x + 0.1, y + 0.1], `stroke="${COR.cota}" stroke-width="2"`) + line([x - 0.2, y], [x + 0.2, y], `stroke="${COR.cota}" stroke-width="1"`);
    for (let i = 0; i < ys.length - 1; i++) {
      const cy = Y((ys[i] + ys[i + 1]) / 2), cx = X(x) - 8;
      r += `<text x="${cx}" y="${cy}" font-size="${tam}" font-family="${FONTE}" fill="${COR.cota}" text-anchor="middle" transform="rotate(-90 ${cx} ${cy})">${fmt(Math.abs(ys[i + 1] - ys[i]))}</text>`;
    }
    return r;
  };
  const abrir = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
  return { X, Y, L, w, h, rect, line, text, poly, cotasH, cotasV, cotaV, abrir, k };
}

const defs = `<defs>
  <pattern id="tabuas" width="40" height="20" patternUnits="userSpaceOnUse"><rect width="40" height="20" fill="${COR.tijolo}"/><line x1="0" y1="19" x2="40" y2="19" stroke="${COR.tijoloEsc}" stroke-width="2"/></pattern>
  <pattern id="telha" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="${COR.telha}"/><circle cx="8" cy="6" r="2.2" fill="#7E2E1C"/></pattern>
  <pattern id="hachura" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="${COR.tijolo}"/><line x1="0" y1="0" x2="0" y2="12" stroke="${COR.tijoloEsc}" stroke-width="3"/></pattern>
  <pattern id="pedra" width="30" height="18" patternUnits="userSpaceOnUse"><rect width="30" height="18" fill="#B9AE98"/><path d="M0 9 H30 M15 0 V9 M5 9 V18 M24 9 V18" stroke="#8C836F" stroke-width="1.5"/></pattern>
</defs>`;

/** Seta de fluxo (linha + ponta) em coordenadas de desenho */
function seta(q: ReturnType<typeof quadro>, pts: XY[], cor: string, larg: number, ponta: number) {
  let s = `<polyline points="${pts.map(p => `${q.X(p[0])},${q.Y(p[1])}`).join(' ')}" fill="none" stroke="${cor}" stroke-width="${larg}" stroke-linejoin="round"/>`;
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const lado = (d: number): XY => [b[0] - Math.cos(ang + d) * ponta, b[1] - Math.sin(ang + d) * ponta];
  s += q.poly([[b[0] + Math.cos(ang) * ponta * 0.4, b[1] + Math.sin(ang) * ponta * 0.4], lado(0.5), lado(-0.5)], `fill="${cor}"`);
  return s;
}

const MAGENTA = '#C2187A';
const defsFora = `<pattern id="fora" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="#F1EFEA"/><line x1="0" y1="0" x2="0" y2="18" stroke="#CFCAC0" stroke-width="2"/></pattern>`;

/** Fachada frontal: vista de quem chega pela Rua Walter e Maria (s = 0 no canto do stand, s = 12 no limite da fazenda) */
function fachada(logo: string) {
  const q = quadro(-5.6, 16.0, -2.3, 9.2);
  const { X, Y, L, rect, line, text } = q;
  let s = defs.replace('</defs>', `${defsFora}</defs>`);
  // Além do ponto inicial: fora da fazenda, sem construção
  s += rect({ x0: VIA, x1: 16.0, y0: 0, y1: 9.2 }, 'fill="url(#fora)"');
  s += rect({ x0: -5.6, x1: 16.0, y0: -0.35, y1: 0 }, `fill="${COR.solo}"`) + line([-5.6, 0], [16.0, 0], 'stroke-width="3"');
  s += text('fora da fazenda', VIA + 0.25, 3.0, 15, `fill="${COR.suave}"`) + text('sem construção', VIA + 0.25, 2.65, 15, `fill="${COR.suave}"`);
  s += text('← área administrativa e stand de vendas', -5.4, 6.2, 17, `fill="${COR.suave}"`);
  s += text('(PA-02) — aberta ao público', -5.4, 5.85, 15, `fill="${COR.suave}"`);
  // Guarita (na área administrativa, ao lado do portão de pedestres)
  const g = { x0: GUARITA.s0, x1: GUARITA.s1 };
  s += rect({ ...g, y0: 0, y1: 2.8 }, `fill="url(#tabuas)" stroke="${COR.linha}" stroke-width="2"`);
  s += rect({ x0: g.x0 + 0.45, x1: g.x1 - 0.45, y0: 1.05, y1: 2.15 }, `fill="${COR.vidro}" stroke="${COR.linha}" stroke-width="2"`);
  s += line([(g.x0 + g.x1) / 2, 1.05], [(g.x0 + g.x1) / 2, 2.15]);
  s += rect({ x0: g.x0 - 0.35, x1: g.x1 + 0.35, y0: 2.8, y1: 2.95 }, `fill="${COR.madeira}"`);
  s += rect({ x0: g.x0 - 0.35, x1: g.x1 + 0.35, y0: 2.95, y1: 3.4 }, `fill="url(#telha)" stroke="${COR.linha}" stroke-width="1.5"`);
  s += rect({ x0: g.x0 - 0.3, x1: g.x0 - 0.1, y0: 0, y1: 2.8 }, `fill="${COR.madeira}"`) + rect({ x0: g.x1 + 0.1, x1: g.x1 + 0.3, y0: 0, y1: 2.8 }, `fill="${COR.madeira}"`);
  s += text('GUARITA', (g.x0 + g.x1) / 2, 0.55, 16, 'text-anchor="middle" font-weight="700" fill="#fff"');
  // Pilarete no canto do stand e portão de pedestres
  s += rect({ x0: PILARETE.s0, x1: PILARETE.s1, y0: 0, y1: 2.2 }, `fill="url(#tabuas)" stroke="${COR.linha}" stroke-width="2"`);
  s += rect({ x0: PILARETE.s0 - 0.04, x1: PILARETE.s1 + 0.04, y0: 2.2, y1: 2.3 }, `fill="${COR.madeira}"`);
  s += rect({ x0: PP.s0 + 0.02, x1: PP.s1 - 0.02, y0: 0.08, y1: 2.0 }, `fill="none" stroke="${COR.linha}" stroke-width="3"`);
  for (let x = PP.s0 + 0.15; x < PP.s1 - 0.05; x += 0.13) s += line([x, 0.08], [x, 2.0], 'stroke-width="1.2"');
  s += text('PP', (PP.s0 + PP.s1) / 2, 2.15, 15, 'text-anchor="middle" font-weight="700"');
  // Pilares, vigas, mãos-francesas
  for (const p of [PIL_E, PIL_D]) {
    s += rect({ x0: p.s0, x1: p.s1, y0: 0, y1: GABARITO }, `fill="url(#tabuas)" stroke="${COR.linha}" stroke-width="2"`);
    s += rect({ x0: p.s0 + 0.3, x1: p.s1 - 0.3, y0: 0.4, y1: GABARITO }, `fill="${COR.madeira}"`);
    s += rect({ x0: p.s0 - 0.05, x1: p.s1 + 0.05, y0: 0, y1: 0.4 }, `fill="url(#pedra)" stroke="${COR.linha}" stroke-width="1.5"`);
  }
  // Viga inferior até o fim do pilar direito: nada passa do ponto inicial
  s += rect({ x0: PIL_E.s0 - 0.5, x1: PIL_D.s1 + 0.5, y0: GABARITO, y1: GABARITO + 0.4 }, `fill="${COR.madeiraClara}" stroke="${COR.linha}" stroke-width="2"`);
  s += rect({ x0: PIL_E.s0 - 0.1, x1: PIL_D.s1 + 0.1, y0: GABARITO + 0.4, y1: GABARITO + 0.7 }, `fill="${COR.madeira}" stroke="${COR.linha}" stroke-width="2"`);
  s += text('SEJA BEM-VINDO', (PT.s0 + PT.s1) / 2, GABARITO + 0.11, 27, 'text-anchor="middle" font-weight="700" fill="#F3EEDF" letter-spacing="3"');
  s += line([PIL_E.s1, GABARITO - 1.1], [PIL_E.s1 + 1.1, GABARITO], `stroke="${COR.madeira}" stroke-width="12"`);
  s += line([PIL_D.s0, GABARITO - 1.1], [PIL_D.s0 - 1.1, GABARITO], `stroke="${COR.madeira}" stroke-width="12"`);
  const cx = (PT.s0 + PT.s1) / 2, lw = 5.8, lh = 3.3;
  s += `<image href="${logo}" x="${X(cx - lw / 2)}" y="${Y(GABARITO + 0.7 + lh)}" width="${L(lw)}" height="${L(lh)}" preserveAspectRatio="xMidYMid meet"/>`;
  // Portão principal: giro, bipartido, 2 × 3,50 × 1,80
  for (const [a, b] of [[PT.s0, cx], [cx, PT.s1]]) {
    s += rect({ x0: a + 0.03, x1: b - 0.03, y0: 0.08, y1: ALT_PORTAO }, `fill="none" stroke="${COR.linha}" stroke-width="4"`);
    s += line([a + 0.03, 0.08], [b - 0.03, ALT_PORTAO]) + line([a + 0.03, ALT_PORTAO], [b - 0.03, 0.08]);
    for (let x = a + 0.25; x < b - 0.1; x += 0.25) s += line([x, 0.08], [x, ALT_PORTAO], 'stroke-width="0.8" stroke="#666"');
  }
  s += text('PT1 — portão de giro bipartido 7,00 × 1,80 (abre para dentro, automatizado)', cx, 2.25, 15, 'text-anchor="middle"');
  s += text(`gabarito livre ${fmt(GABARITO)} m`, cx, 3.6, 15, `text-anchor="middle" fill="${COR.suave}"`);
  // Mureta de arremate até o ponto inicial (limite da fazenda)
  s += rect({ x0: MURETA.s0, x1: MURETA.s1, y0: 0, y1: ALT_MURETA }, `fill="url(#tabuas)" stroke="${COR.linha}" stroke-width="2"`);
  s += rect({ x0: MURETA.s0, x1: MURETA.s1, y0: ALT_MURETA, y1: ALT_MURETA + 0.1 }, `fill="${COR.madeira}"`);
  // Referências: canto do stand (V2) e ponto inicial no limite da fazenda
  s += line([0, -0.35], [0, 7.6], `stroke="${COR.cota}" stroke-width="1.5" stroke-dasharray="14 8"`);
  s += text('canto da área do stand (V2)', 0, 7.75, 14, `text-anchor="middle" fill="${COR.cota}"`);
  s += line([VIA, -0.35], [VIA, 8.3], `stroke="${MAGENTA}" stroke-width="3" stroke-dasharray="18 8"`);
  s += text('LIMITE DA FAZENDA — ponto inicial do portal', VIA, 8.75, 15, `text-anchor="middle" font-weight="700" fill="${MAGENTA}"`);
  s += text(TXT_PONTO, VIA, 8.42, 14, `text-anchor="middle" fill="${MAGENTA}"`);
  // Cotas
  s += q.cotasH(COTAS, -1.0);
  s += q.cotasH([0, VIA], -1.65);
  s += text('largura da via de entrada (Rua Walter e Maria)', VIA / 2, -1.98, 14, `text-anchor="middle" fill="${COR.cota}"`);
  s += q.cotaV(VIA + 0.6, 0, ALT_MURETA, fmt(ALT_MURETA));
  s += q.cotaV(VIA + 1.4, 0, GABARITO, fmt(GABARITO));
  s += q.cotaV(VIA + 1.4, GABARITO, GABARITO + 0.7 + lh, fmt(0.7 + lh));
  s += q.cotaV(GUARITA.s0 - 0.9, 0, 3.4, fmt(3.4));
  return q.abrir(s);
}

/** Planta baixa: X ao longo da via (sentido de quem chega), Y para dentro; portal na linha X = 0, de Y = 0 a Y = −12 */
function planta() {
  const q = quadro(-16.5, 17.0, -17.0, 9.0);
  const { rect, line, text } = q;
  let s = defs.replace('</defs>', `${defsFora}</defs>`);
  // Fora da fazenda, via de entrada, área administrativa, Rua Cedro e D10
  s += rect({ x0: -16.5, x1: 17, y0: -17, y1: -VIA }, 'fill="url(#fora)"');
  s += text('FORA DA FAZENDA — nada é construído além do limite', -9.5, -15.8, 16, `text-anchor="middle" fill="${COR.suave}"`);
  s += rect({ x0: -16.5, x1: 17, y0: -VIA, y1: 0 }, `fill="${COR.via}"`);
  s += text(`RUA WALTER E MARIA — via de entrada (${fmt(VIA)} m)`, -9.5, -10.9, 18, 'text-anchor="middle" font-weight="700"');
  s += line([-16.5, -VIA], [17, -VIA], `stroke="${MAGENTA}" stroke-width="4" stroke-dasharray="20 8"`);
  s += text('LIMITE DA FAZENDA', 10.5, -12.6, 16, `text-anchor="middle" font-weight="700" fill="${MAGENTA}"`);
  s += rect({ x0: -16.5, x1: 0, y0: 0, y1: 9 }, `fill="${COR.grama}"`);
  s += rect({ x0: 0, x1: 12, y0: 0, y1: 9 }, `fill="${COR.via}"`);
  s += rect({ x0: 12, x1: 17, y0: 0, y1: 9 }, `fill="${COR.grama}"`);
  s += text('ÁREA ADMINISTRATIVA E STAND DE VENDAS', -8.5, 8.2, 18, 'text-anchor="middle" font-weight="700"');
  s += text('(fora do condomínio — aberta ao público)', -8.5, 7.75, 14, `text-anchor="middle" fill="${COR.suave}"`);
  s += text('RUA CEDRO — 12,00 m', 6, 8.2, 18, 'text-anchor="middle" font-weight="700"');
  s += text('D10', 14.5, 8.2, 18, 'text-anchor="middle" font-weight="700"');
  s += line([0, -VIA], [0, 0], 'stroke="none"');
  // Divisas: Rua Cedro × D10; área administrativa × Rua Cedro com cerca de divisa (perímetro do condomínio)
  s += line([12, 0], [12, 9], `stroke="${COR.cota}" stroke-width="1.5" stroke-dasharray="14 8"`);
  s += line([-0.08, 0.3], [-0.08, 9], 'stroke="#4E7A3A" stroke-width="5" stroke-dasharray="4 10"');
  s += `<text x="${q.X(-0.4)}" y="${q.Y(5.6)}" font-size="13" font-family="${FONTE}" fill="#4E7A3A" text-anchor="middle" transform="rotate(-90 ${q.X(-0.4)} ${q.Y(5.6)})">cerca de divisa (perímetro)</text>`;
  // Cerca viva baixa na frente da área administrativa (o stand fica aberto)
  for (let x = -16.2; x < GUARITA.prof1 * -1 - 0.6; x += 0.45) s += `<circle cx="${q.X(x)}" cy="${q.Y(0.35)}" r="16" fill="#9DBB7A" stroke="#6F8F52" stroke-width="2"/>`;
  // Guarita: X de −3,70 a −0,40 (3,30), Y de 0,40 a 3,20 (2,80)
  const g = { x0: -GUARITA.prof1, x1: -GUARITA.prof0, y0: -GUARITA.s1, y1: -GUARITA.s0 }, e = 0.15;
  s += rect(g, `fill="url(#hachura)" stroke="${COR.linha}" stroke-width="2"`);
  s += rect({ x0: g.x0 + e, x1: g.x1 - e, y0: g.y0 + e, y1: g.y1 - e }, 'fill="#fff"');
  s += rect({ x0: g.x1 - e - 1.0, x1: g.x1 - e, y0: g.y1 - e - 1.0, y1: g.y1 - e }, `fill="#F4F1EA" stroke="${COR.linha}" stroke-width="1.5"`);
  s += text('WC', g.x1 - e - 0.5, g.y1 - e - 0.6, 14, 'text-anchor="middle"');
  s += rect({ x0: g.x0, x1: g.x0 + e, y0: g.y0 + 0.6, y1: g.y1 - 0.6 }, `fill="${COR.vidro}" stroke="${COR.linha}" stroke-width="1"`);   // janela para quem chega
  s += rect({ x0: g.x0 + 0.4, x1: g.x0 + 1.3, y0: g.y0, y1: g.y0 + e }, `fill="${COR.vidro}" stroke="${COR.linha}" stroke-width="1"`);   // janela para a via
  s += rect({ x0: g.x1 - 1.3, x1: g.x1 - 0.5, y0: g.y0, y1: g.y0 + e }, 'fill="#fff"');                                               // porta para a via
  s += `<path d="M ${q.X(g.x1 - 1.3)} ${q.Y(g.y0 + e)} L ${q.X(g.x1 - 1.3)} ${q.Y(g.y0 + e + 0.8)} A ${q.L(0.8)} ${q.L(0.8)} 0 0 1 ${q.X(g.x1 - 0.5)} ${q.Y(g.y0 + e)}" fill="none" stroke="${COR.linha}" stroke-width="1.5"/>`;
  s += rect({ x0: g.x0 - 0.35, x1: g.x1 + 0.35, y0: g.y0 - 0.35, y1: g.y1 + 0.35 }, `fill="none" stroke="${COR.linha}" stroke-width="1.2" stroke-dasharray="8 6"`);
  s += text('GUARITA', (g.x0 + g.x1) / 2 - 0.4, 2.0, 16, 'text-anchor="middle" font-weight="700"');
  s += text('3,30 × 2,80', (g.x0 + g.x1) / 2 - 0.4, 1.6, 13, 'text-anchor="middle"');
  // Pilarete no canto do stand, portão de pedestres (abre para dentro)
  s += rect({ x0: -0.15, x1: 0.15, y0: -PILARETE.s1, y1: 0 }, `fill="url(#hachura)" stroke="${COR.linha}" stroke-width="2"`);
  const pp0 = -PP.s0, pp1 = -PP.s1, rpp = PP.s1 - PP.s0;
  s += line([0, pp0], [rpp, pp0], 'stroke-width="3"');
  s += `<path d="M ${q.X(rpp)} ${q.Y(pp0)} A ${q.L(rpp)} ${q.L(rpp)} 0 0 1 ${q.X(0)} ${q.Y(pp1)}" fill="none" stroke="${COR.linha}" stroke-width="1.2" stroke-dasharray="6 4"/>`;
  // Pilares e portão principal de giro (folhas abrindo para dentro)
  for (const p of [PIL_E, PIL_D]) {
    s += rect({ x0: -0.45, x1: 0.45, y0: -p.s1, y1: -p.s0 }, `fill="url(#hachura)" stroke="${COR.linha}" stroke-width="2"`);
    s += `<circle cx="${q.X(0)}" cy="${q.Y(-(p.s0 + p.s1) / 2)}" r="${q.L(0.15)}" fill="${COR.madeira}"/>`;
  }
  const meio = -(PT.s0 + PT.s1) / 2, folha = (PT.s1 - PT.s0) / 2;
  s += line([0, -PT.s0], [folha, -PT.s0], 'stroke-width="4"') + line([0, -PT.s1], [folha, -PT.s1], 'stroke-width="4"');
  s += `<path d="M ${q.X(folha)} ${q.Y(-PT.s0)} A ${q.L(folha)} ${q.L(folha)} 0 0 1 ${q.X(0)} ${q.Y(meio)}" fill="none" stroke="${COR.linha}" stroke-width="1.2" stroke-dasharray="8 5"/>`;
  s += `<path d="M ${q.X(folha)} ${q.Y(-PT.s1)} A ${q.L(folha)} ${q.L(folha)} 0 0 0 ${q.X(0)} ${q.Y(meio)}" fill="none" stroke="${COR.linha}" stroke-width="1.2" stroke-dasharray="8 5"/>`;
  s += line([0, -PT.s0], [0, -PT.s1], 'stroke-width="1" stroke-dasharray="4 4"');
  s += rect({ x0: -0.6, x1: 0.6, y0: -PIL_D.s1 - 0.5, y1: -PIL_E.s0 + 0.5 }, `fill="none" stroke="${COR.madeira}" stroke-width="1.5" stroke-dasharray="16 6 3 6"`);
  // Mureta de arremate até o ponto inicial
  s += rect({ x0: -0.12, x1: 0.12, y0: -MURETA.s1, y1: -MURETA.s0 }, `fill="url(#hachura)" stroke="${COR.linha}" stroke-width="2"`);
  // Rótulos à esquerda da linha do portal
  s += text('PP 1,20 (pedestres)', -2.9, -1.05, 13, 'text-anchor="end"');
  s += text('PT1 — portão de giro', -2.9, -5.75, 13, 'text-anchor="end"');
  s += text('bipartido 2 × 3,50', -2.9, -6.2, 13, 'text-anchor="end"');
  s += text('pórtico + placa da marca', -2.9, -9.7, 13, `text-anchor="end" fill="${COR.suave}"`);
  // Ponto inicial no limite da fazenda
  s += `<circle cx="${q.X(0)}" cy="${q.Y(-VIA)}" r="${q.L(0.35)}" fill="none" stroke="${MAGENTA}" stroke-width="3"/>`;
  s += line([-0.6, -VIA], [0.6, -VIA], `stroke="${MAGENTA}" stroke-width="2"`) + line([0, -VIA - 0.6], [0, -VIA + 0.6], `stroke="${MAGENTA}" stroke-width="2"`);
  s += text('PONTO INICIAL DO PORTAL', 0.7, -13.15, 15, `font-weight="700" fill="${MAGENTA}"`);
  s += text(`${TXT_PONTO} (SIRGAS 2000 / UTM 23S)`, 0.7, -13.65, 13, `fill="${MAGENTA}"`);
  // Fluxo: chega pela via, depois do portal segue pela Rua Cedro ou pela Rua Walter e Maria
  s += seta(q, [[-15.5, -8.3], [-3.6, -8.3]], COR.verde, 7, 0.55);
  s += text('quem chega', -9.5, -7.8, 14, `text-anchor="middle" fill="${COR.verde}"`);
  s += seta(q, [[4.6, -7.6], [16.3, -7.6]], COR.verde, 7, 0.55);
  s += text('segue pela Rua Walter e Maria', 10.5, -7.1, 14, `text-anchor="middle" fill="${COR.verde}"`);
  s += seta(q, [[4.6, -4.4], [6.0, -2.4], [6.0, 6.6]], COR.verde, 7, 0.55);
  // Árvores
  for (const [x, y, r] of [[-13.0, 5.0, 1.3], [15.0, 4.6, 1.0]] as const)
    s += `<circle cx="${q.X(x)}" cy="${q.Y(y)}" r="${q.L(r)}" fill="#A9C98A" fill-opacity="0.75" stroke="#6F8F52" stroke-width="2"/>`;
  // Cotas ao longo do portal
  s += q.cotasV([0, -PILARETE.s1, -PP.s1, -PIL_E.s1, -PT.s1, -PIL_D.s1, -VIA], -2.2);
  s += q.cotasV([0, -VIA], -1.25);
  return q.abrir(s);
}

/** Implantação geral com a geometria oficial (área administrativa, lotes vizinhos, Rua Cedro, via de entrada) */
function implantacao() {
  const q = quadro(-80, 62, -24, 66);
  const { rect, text, poly } = q;
  let s = defs.replace('</defs>', `${defsFora}</defs>`);
  s += rect({ x0: -80, x1: 62, y0: -24, y1: -VIA }, 'fill="url(#fora)"');
  s += text('FORA DA FAZENDA', -40, -19.5, 190, `text-anchor="middle" fill="${COR.suave}"`);
  s += rect({ x0: -80, x1: 62, y0: -VIA, y1: 0 }, `fill="${COR.via}"`);
  s += text('RUA WALTER E MARIA — via de entrada', -40, -7.4, 200, 'text-anchor="middle" font-weight="700"');
  s += q.line([-80, -VIA], [62, -VIA], `stroke="${MAGENTA}" stroke-width="22" stroke-dasharray="90 40"`);
  s += text('LIMITE DA FAZENDA', 42, -21.5, 170, `text-anchor="middle" font-weight="700" fill="${MAGENTA}"`);
  s += rect({ x0: 0, x1: 12, y0: 0, y1: 66 }, `fill="${COR.via}"`);
  s += `<text x="${q.X(6)}" y="${q.Y(40)}" font-size="190" font-family="${FONTE}" font-weight="700" fill="${COR.suave}" text-anchor="middle" transform="rotate(-90 ${q.X(6)} ${q.Y(40)})">RUA CEDRO</text>`;
  // Área administrativa e edificação PA-02 (proposta)
  const adm = (v.areaAdministrativa.verticesUtm as XY[]).map(local);
  s += poly(adm, `fill="#EADCB8" stroke="#8A6A2E" stroke-width="12"`);
  s += text('ÁREA ADMINISTRATIVA E STAND DE VENDAS', -37.5, 48, 190, 'text-anchor="middle" font-weight="700" fill="#5C4518"');
  s += text(`${fmt(v.areaAdministrativa.areaM2)} m² — fora do condomínio`, -37.5, 44.5, 170, 'text-anchor="middle" fill="#5C4518"');
  s += rect({ x0: -26, x1: -10, y0: 10, y1: 14 }, `fill="#C8A26B" stroke="${COR.linha}" stroke-width="8"`);
  s += rect({ x0: -26, x1: -10, y0: 14, y1: 24 }, `fill="${COR.tijolo}" stroke="${COR.linha}" stroke-width="10"`);
  s += text('STAND / ADM.', -18, 19.5, 170, 'text-anchor="middle" font-weight="700" fill="#fff"');
  s += text('PA-02', -18, 16, 150, 'text-anchor="middle" fill="#fff"');
  s += rect({ x0: -52, x1: -30, y0: 4, y1: 22 }, `fill="none" stroke="${COR.suave}" stroke-width="8" stroke-dasharray="40 25"`);
  s += text('estacionamento', -41, 13, 160, `text-anchor="middle" fill="${COR.suave}"`);
  // Lotes vizinhos (geometria oficial do projeto V2)
  for (const l of v.lotes as any[]) {
    const pts = (l.verticesUtm as XY[]).map(local);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    if (Math.max(...xs) < -80 || Math.min(...xs) > 62 || Math.max(...ys) < -1 || Math.min(...ys) > 66) continue; // fora da janela
    s += poly(pts, `fill="${COR.grama}" stroke="${COR.linha}" stroke-width="6"`);
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    if (c[0] > -76 && c[0] < 58 && c[1] < 62) s += text(l.codigo, c[0], Math.min(c[1], 40), 220, 'text-anchor="middle" font-weight="700"');
  }
  // Portal atravessando a via, do ponto inicial (limite da fazenda) ao canto V2; guarita na área administrativa
  s += rect({ x0: -GUARITA.prof1, x1: -GUARITA.prof0, y0: -GUARITA.s1, y1: -GUARITA.s0 }, `fill="${COR.tijoloEsc}"`);
  s += q.line([0, -VIA], [0, 0], `stroke="${COR.madeira}" stroke-width="45"`);
  s += `<circle cx="${q.X(0)}" cy="${q.Y(-VIA)}" r="${q.L(1.1)}" fill="${COR.dourado}" stroke="${MAGENTA}" stroke-width="12"/>`;
  s += text('PORTAL', -2.0, -9.0, 200, `text-anchor="end" font-weight="700" fill="${COR.cota}"`);
  s += text(`ponto inicial ${TXT_PONTO}`, 2.0, -15.2, 140, `fill="${MAGENTA}"`);
  // Fluxo
  s += seta(q, [[-70, -3.2], [-6, -3.2]], COR.verde, 30, 3);
  s += seta(q, [[3.5, -9.2], [45, -9.2]], COR.verde, 30, 3);
  s += seta(q, [[3.5, -6], [6, -1], [6, 28]], COR.verde, 30, 3);
  // Norte da quadrícula
  const n: XY = [ux[1], uy[1]];
  const ang = Math.atan2(n[1], n[0]), bx = 48, by = 54, comp = 7;
  const tip: XY = [bx + Math.cos(ang) * comp, by + Math.sin(ang) * comp];
  s += q.line([bx, by], tip, 'stroke-width="18"');
  s += q.poly([tip, [tip[0] - Math.cos(ang + 0.45) * 2.5, tip[1] - Math.sin(ang + 0.45) * 2.5], [tip[0] - Math.cos(ang - 0.45) * 2.5, tip[1] - Math.sin(ang - 0.45) * 2.5]], `fill="${COR.linha}"`);
  s += text('NQ', tip[0] + 1, tip[1] + 1, 220, 'font-weight="700"');
  return q.abrir(s);
}

function svgStandalone(svg: string, titulo: string, escala: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:${FONTE}}
    #v{width:1600px;padding:16px 24px 10px;box-sizing:border-box}
    #v svg{width:100%;height:auto;display:block}
    h1{font-size:19px;color:${COR.verde};text-align:center;margin:14px 0 2px;letter-spacing:.5px}
    h1+div{width:290px;height:2px;background:${COR.dourado};margin:0 auto 4px}
    p{font-size:12px;color:${COR.suave};text-align:center;margin:0}
  </style></head><body><div id="v">${svg}<h1>${titulo}</h1><div></div><p>${escala}</p></div></body></html>`;
}

function folhaPdf(n: number, conteudo: string, tituloFolha: string, notas: string[]) {
  return `<section class="folha"><div class="moldura">
    <div class="desenho">${conteudo}</div>
    <aside>
      <div class="bloco"><h3>NOTAS</h3><ol>${notas.map(t => `<li>${t}</li>`).join('')}</ol></div>
      <div class="carimbo">
        <div class="tit">${tituloFolha}</div>
        <div class="sub">Portal de entrada — PA-01 rev. V2</div>
        <div>Condomínio de Chácaras Bom Jardims — Açailândia/MA</div>
        <div class="cinza">Via de entrada: Rua Walter e Maria, esquina com a Rua Cedro</div>
        <hr>
        <div><b>Responsável técnico: José Romário</b></div>
        <div>Técnico em Edificações · Técnico em Agrimensura — CFT/MA 01209185369</div>
        <div>INCRA FQNS · Corretor CRECI/MA F-4.705</div>
        <div>Romatec Consultoria Total · (99) 9 9181-1246</div>
        <div class="cinza">Folha ${n}/2 · A3 · ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })} · substitui PA-01 (portal com alas laterais)</div>
        <div class="ass">Assinatura do responsável técnico</div>
      </div>
    </aside></div></section>`;
}

async function main() {
  // Placa da marca recortada da prancha PA-01 original (mesma arte)
  const logoPng = readFileSync(path.join(raiz, 'scripts/assets/placa-marca-bom-jardims.png'));
  const logo = `data:image/png;base64,${logoPng.toString('base64')}`;
  const fac = fachada(logo), pla = planta(), imp = implantacao();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();
  const vistas: [string, string, string, string][] = [
    ['projeto-portal-fachada.webp', fac, 'FACHADA FRONTAL — PORTAL DE ENTRADA (REV. V2)', 'Escala 1:100 · vista de quem chega pela Rua Walter e Maria · à esquerda o stand de vendas, à direita o limite da fazenda'],
    ['projeto-portal-planta.webp', pla, 'PLANTA BAIXA — PORTAL NA VIA DE ENTRADA (REV. V2)', 'Escala 1:100 · do ponto inicial no limite da fazenda ao canto da área do stand · portão de giro bipartido'],
    ['projeto-portal-implantacao.webp', imp, 'IMPLANTAÇÃO — PORTAL, ÁREA ADMINISTRATIVA E STAND DE VENDAS', 'Escala 1:500 · geometria oficial do projeto V2 (SIRGAS 2000 / UTM 23S)'],
  ];
  for (const [arq, svg, t, e] of vistas) {
    await page.setContent(svgStandalone(svg, t, e));
    const png = await page.locator('#v').screenshot();
    const info = await sharp(png).webp({ quality: 88 }).toFile(pub(arq));
    console.log('ok', arq, `${info.width}×${info.height}`);
  }

  // PDF A3 paisagem, 2 folhas
  const notas1 = [
    `Portal atravessando a via de entrada (Rua Walter e Maria, 12,00 m), na esquina com a Rua Cedro. Ponto inicial no limite da fazenda: ${TXT_PONTO} (SIRGAS 2000 / UTM 23S).`,
    'Nenhum elemento além do ponto inicial: todo o conjunto é projetado da linha do limite da fazenda para dentro, até o canto da área administrativa / stand.',
    'Sem ala lateral: de um lado o limite da fazenda (mureta de arremate até o ponto inicial), do outro a área do stand, aberta ao público.',
    'Guarita 2,80 × 3,30 m na área administrativa, junto ao portão de pedestres, com WC, porta para a via e janelas para o portão e para o stand.',
    'Portão principal PT1 de giro, bipartido (2 × 3,50 × 1,80 m), abrindo para dentro, com automatizador. Depois do portal o fluxo segue pela Rua Cedro ou pela Rua Walter e Maria.',
    'Pórtico em toras com revestimento em tábuas e base em pedra; gabarito livre de 4,60 m; placa da marca e "SEJA BEM-VINDO" na viga.',
    'Divisa da área administrativa com a Rua Cedro: cerca de divisa (alambrado com cerca viva) para que o acesso ao condomínio seja só pelo portal.',
    'Medidas em metros. NBR 6492 (representação de projetos de arquitetura) e NBR 9050 (portão de pedestres com vão livre ≥ 0,80 m).',
  ];
  const notas2 = [
    'Geometria do terreno da área administrativa e dos lotes: DXF "Condomínio de Chácaras Bom Jardims — atualizado V2" (SIRGAS 2000 / UTM 23S).',
    'Área administrativa e stand de vendas: 4.125,00 m² (75,00 × 55,00 m), fora do perímetro do condomínio.',
    'Edificação PA-02 (16,00 × 10,00 m + varanda 16,00 × 4,00 m) e estacionamento: implantação proposta, sujeita a aprovação municipal.',
    'Confrontações da área administrativa a conferir em campo pelo responsável técnico (NBR 13133).',
    'Escala 1:500 (A3).',
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:420mm 297mm;margin:0}
    body{margin:0;font-family:${FONTE};color:${COR.texto}}
    .folha{width:420mm;height:297mm;box-sizing:border-box;padding:10mm 10mm 10mm 25mm;page-break-after:always}
    .moldura{border:1.2pt solid #000;height:100%;box-sizing:border-box;display:flex}
    .desenho{flex:1;padding:6mm;display:flex;flex-direction:column;justify-content:space-around}
    .desenho svg{display:block}
    .rot{font-weight:700;color:${COR.verde};font-size:11pt;margin-top:2mm}
    .rot small{font-weight:400;color:${COR.suave};font-size:8pt;margin-left:3mm}
    aside{width:100mm;border-left:1pt solid #000;display:flex;flex-direction:column;justify-content:space-between}
    .bloco{padding:3mm}
    h3{background:${COR.verde};color:#fff;font-size:8pt;margin:0 0 2mm;padding:1mm 2mm}
    ol{font-size:7pt;line-height:1.35;padding-left:4mm;margin:0}
    li{margin-bottom:1.2mm}
    .carimbo{border-top:1pt solid #000;padding:3mm;font-size:7pt;line-height:1.45}
    .carimbo .tit{font-size:11pt;font-weight:700;color:${COR.verde}}
    .carimbo .sub{font-size:9pt;font-weight:700}
    .cinza{color:${COR.suave}}
    hr{border:0;border-top:.5pt solid #000;margin:2mm 0}
    .ass{margin-top:9mm;border-top:.5pt solid #000;width:60mm;margin-left:auto;text-align:center;font-size:6pt;color:${COR.suave}}
  </style></head><body>
    ${folhaPdf(1, `<div>${fac.replace(/width="[\d.]+" height="[\d.]+"/, 'width="264mm" height="112mm"')}<div class="rot">FACHADA FRONTAL<small>escala 1:100</small></div></div>
      <div>${pla.replace(/width="[\d.]+" height="[\d.]+"/, 'width="274mm" height="160mm"').replace('<svg ', '<svg style="max-height:118mm;width:auto" ')}<div class="rot">PLANTA BAIXA<small>escala 1:100 (reduzida para caber na folha)</small></div></div>`, 'FACHADA E PLANTA BAIXA', notas1)}
    ${folhaPdf(2, `<div>${imp.replace(/width="[\d.]+" height="[\d.]+"/, 'width="284mm" height="160mm"')}<div class="rot">IMPLANTAÇÃO GERAL<small>escala 1:500</small></div></div>`, 'IMPLANTAÇÃO', notas2)}
  </body></html>`;
  await page.setContent(html);
  await page.pdf({ path: pub('projeto-portal-v2.pdf'), width: '420mm', height: '297mm', printBackground: true });
  console.log('ok projeto-portal-v2.pdf');
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
