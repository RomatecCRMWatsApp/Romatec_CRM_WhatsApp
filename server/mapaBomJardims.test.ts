import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Pt = [number, number];
const mapa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/bom-jardims/mapa.json'), 'utf8'));
const ponto = (re: RegExp): Pt => mapa.pontos.find((p: any) => re.test(p.nome)).pt;
const metros = (p: Pt, q: Pt) => Math.hypot((p[0] - q[0]) * 111320 * Math.cos((p[1] * Math.PI) / 180), (p[1] - q[1]) * 110574);
const dentro = ([x, y]: Pt, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const anel = (p: Pt[]) => (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p.slice(0, -1) : p);
const centroide = (p: Pt[]): Pt => { const a = anel(p); return [a.reduce((s, v) => s + v[0], 0) / a.length, a.reduce((s, v) => s + v[1], 0) / a.length]; };
/** Área plana aproximada (m²) — para conferir com as áreas oficiais */
const areaM2 = (p: Pt[]) => {
  const k = Math.cos((-4.926 * Math.PI) / 180);
  const q = anel(p).map(([lo, la]) => [lo * 111320 * k, la * 110574]);
  let s = 0;
  for (let i = 0; i < q.length; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s / 2);
};

describe('Mapa do Bom Jardims — dados da planta oficial', () => {
  it('portal principal exatamente no ponto do KMZ oficial, na boca da via de acesso (lado oeste), fora de lote', () => {
    const principais = mapa.pontos.filter((p: any) => /portal/i.test(p.nome));
    expect(principais).toHaveLength(1);
    const portal = ponto(/portal/i);
    expect(portal).toEqual([-47.382658381, -4.925448446]); // KMZ oficial (Google Earth, WGS84)
    expect(mapa.lotes.some((l: any) => dentro(portal, l.poly))).toBe(false);
    // Lado oeste: a oeste de todos os lotes
    expect(portal[0]).toBeLessThan(Math.min(...mapa.lotes.flatMap((l: any) => l.poly.map((q: Pt) => q[0]))));
    // A via de acesso (7 m) começa na boca, junto ao portal, e desce para o sul
    const acesso = mapa.ruas.find((r: any) => /acesso/i.test(r.nome)).line as Pt[];
    const boca = acesso[acesso.length - 1];
    expect(boca).toEqual([-47.382628031, -4.925439831]);
    expect(metros(portal, boca)).toBeLessThan(5);
    expect(acesso[acesso.length - 2][1]).toBeLessThan(boca[1]);
  });
  it('pontos de banho conferem com o KMZ oficial (sudoeste, junto ao rio)', () => {
    expect(metros(ponto(/banho 1/i), [-47.383117, -4.928279])).toBeLessThan(2);
    expect(metros(ponto(/banho 2/i), [-47.383728, -4.928906])).toBeLessThan(2);
  });
  it('rio = curso d\'água oficial do KMZ: na frente (oeste), com os pontos de banho na margem', () => {
    expect(mapa.rio.line).toHaveLength(65);                        // linha "Curso d'água" do KMZ
    const oeste = Math.min(...mapa.perimetro.map((p: Pt) => p[0]));
    expect(Math.min(...mapa.rio.line.map((p: Pt) => p[0]))).toBeLessThan(oeste);
    expect(mapa.rio.line.some((p: Pt) => dentro(p, mapa.areas[0].poly))).toBe(true);
    const ateRio = (p: Pt) => Math.min(...mapa.rio.line.map((q: Pt) => metros(p, q)));
    expect(ateRio(ponto(/banho 1/i))).toBeLessThan(25);            // deck na margem
    expect(ateRio(ponto(/banho 2/i))).toBeLessThan(25);
  });
  it('área de vivência e recreação (Quadra F) com a área oficial (89.332,14 m²), núcleo de apoio e pontos de banho', () => {
    const area = mapa.areas[0];
    expect(area.nome).toBe('Área de vivência e recreação');
    expect(area.poly[0]).toEqual(area.poly[area.poly.length - 1]);
    expect(Math.abs(areaM2(area.poly) - 89332.14) / 89332.14).toBeLessThan(0.01);
    for (const re of [/núcleo/i, /banho 1/i, /banho 2/i]) expect(dentro(ponto(re), area.poly)).toBe(true);
    expect(dentro(area.rotulo, area.poly)).toBe(true);
    // Não invade o bloco de lotes
    expect(mapa.lotes.some((l: any) => dentro(centroide(l.poly), area.poly))).toBe(false);
  });
  it('APP (30 m) do KMZ: faixa ao longo do rio, com os pontos de banho dentro e o núcleo de apoio fora', () => {
    expect(mapa.app.nome).toBe('APP (30 m)');
    expect(mapa.app.poly).toHaveLength(73);                         // "APP 30 m — preservada" do KMZ
    expect(mapa.app.poly[0]).toEqual(mapa.app.poly[mapa.app.poly.length - 1]);
    expect(mapa.rio.line.filter((p: Pt) => dentro(p, mapa.app.poly)).length).toBeGreaterThan(5);
    for (const re of [/banho 1/i, /banho 2/i]) expect(dentro(ponto(re), mapa.app.poly)).toBe(true);
    expect(dentro(ponto(/núcleo/i), mapa.app.poly)).toBe(false);   // "Núcleo de apoio (fora da APP)"
    expect(mapa.lotes.some((l: any) => dentro(centroide(l.poly), mapa.app.poly))).toBe(false);
  });
  it('trilha ecológica do KMZ: sai do núcleo de apoio e passa pelos pontos de banho 1 e 2', () => {
    const t = mapa.trilha.line as Pt[];
    expect(mapa.trilha.nome).toBe('Trilha ecológica');
    expect(t).toHaveLength(9);
    expect(metros(t[0], ponto(/núcleo/i))).toBeLessThan(20);
    const ateTrilha = (p: Pt) => Math.min(...t.map(q => metros(p, q)));
    expect(ateTrilha(ponto(/banho 1/i))).toBeLessThan(1);
    expect(metros(t[t.length - 1], ponto(/banho 2/i))).toBeLessThan(1);
    expect(t.every(p => dentro(p, mapa.areas[0].poly))).toBe(true); // toda dentro da área de vivência
  });
  it('perímetro certificado e lotes com a geometria do KMZ (áreas oficiais)', () => {
    expect(Math.abs(areaM2(mapa.perimetro) - 411401.13) / 411401.13).toBeLessThan(0.005);
    expect(mapa.lotes).toHaveLength(84);
    const a = (c: string) => areaM2(mapa.lotes.find((l: any) => l.codigo === c).poly);
    for (const c of ['A01', 'A14', 'B13']) expect(Math.abs(a(c) - 3025.11)).toBeLessThan(15);
    for (const c of ['C01', 'C05', 'D10']) expect(a(c)).toBeGreaterThan(3100);
  });
  it('numeração oficial na página pública: C01 no nordeste da quadra C, D10 no sudoeste da quadra D', () => {
    const c = (cod: string) => centroide(mapa.lotes.find((l: any) => l.codigo === cod).poly);
    expect(c('C01')[0]).toBeGreaterThan(c('C11')[0]);   // C01 a leste do C11
    expect(c('C01')[1]).toBeGreaterThan(c('C10')[1]);   // e ao norte do C10
    expect(c('D10')[0]).toBeLessThan(c('D01')[0]);      // D10 a oeste do D01
    expect(c('D10')[1]).toBeLessThan(c('D01')[1]);      // e ao sul
  });
});

describe('Mapa do Bom Jardims — desenho', () => {
  let MapaTematico: any, LoteMap: any, lotesDoMapa: any;
  beforeAll(async () => {
    (globalThis as any).React = React;
    MapaTematico = (await import('../client/src/components/empreendimento/MapaTematico')).default;
    ({ default: LoteMap, lotesDoMapa } = await import('../client/src/components/bom-jardims/LoteMap'));
  });
  const lotes = mapa.lotes.map((l: any, i: number) => ({ id: i + 1, codigo: l.codigo, situacao: 'disponivel', poligono: l.poly }));

  it('folder/memorial/tela: rio, área de vivência, portal com chamada e lote destacado, sem coordenada inválida', () => {
    const svg = renderToStaticMarkup(React.createElement(MapaTematico, { slug: 'bom-jardims', lotes, contexto: mapa, realce: ['B13'], compacto: true, semLegenda: true }));
    expect(svg).toContain('url(#vivencia)');
    expect(svg).toContain('#2C7FB8');               // rio
    expect(svg).toContain('PORTAL DE ENTRADA');
    expect(svg).toContain('ÁREA DE VIVÊNCIA');
    expect(svg).toContain('>RIO<');
    expect(svg).toContain('Núcleo de apoio');
    expect(svg).toContain('fill="#3F7A3A"');         // APP
    expect(svg).toContain('>Trilha ecológica<');
    expect(svg).toContain('stroke-dasharray="5 4"'); // trilha tracejada
    expect(svg).not.toContain('NaN');
    // Só o B13 colorido (os demais apagados)
    expect((svg.match(/fill="#EEF1F3"/g) || []).length).toBe(lotes.length - 1);
  });
  it('tela do empreendimento: legenda com APP (30 m) e Trilha ecológica', () => {
    const html = renderToStaticMarkup(React.createElement(MapaTematico, { slug: 'bom-jardims', lotes, contexto: mapa }));
    for (const t of ['APP (30 m)', 'Trilha ecológica', 'Área de vivência e recreação', 'Rio']) expect(html).toContain(t);
  });
  it('enquadramento inclui a área de vivência e o rio (nada fica fora do quadro)', () => {
    const svg = renderToStaticMarkup(React.createElement(MapaTematico, { slug: 'bom-jardims', lotes, contexto: mapa, semLegenda: true }));
    const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    const nums = Array.from(svg.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)).map(m => [Number(m[1]), Number(m[2])]);
    expect(nums.length).toBeGreaterThan(100);
    for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(h); }
  });
  it('mapa público: rio, área de vivência, APP, trilha, nome do portal e legenda', () => {
    const svg = renderToStaticMarkup(React.createElement(LoteMap, { lotes: lotesDoMapa(mapa), onSelect: () => {}, dados: mapa }));
    expect(svg).toContain('#2C7FB8');
    expect(svg).toContain('ÁREA DE VIVÊNCIA');
    expect(svg).toContain('PORTAL DE ENTRADA');
    expect(svg).toContain('fill="#3F7A3A"');
    expect(svg).toContain('>Trilha ecológica<');
    expect(svg).toContain('APP (30 m)');
    expect(svg).not.toContain('NaN');
  });
});
