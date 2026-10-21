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

describe('Mapa do Bom Jardims — dados da planta oficial', () => {
  it('portal principal na cabeceira da Rua Walter e Maria (entrada das chácaras), fora de qualquer lote', () => {
    const principais = mapa.pontos.filter((p: any) => /portal/i.test(p.nome));
    expect(principais).toHaveLength(1);
    expect(principais[0].nome).toMatch(/Walter e Maria/);
    const portal = ponto(/portal/i);
    // Boca da rua: eixo da Walter e Maria (rótulos do projeto) encontrando a borda oeste do bloco de lotes
    expect(metros(portal, [-47.3817011, -4.927564])).toBeLessThan(1);
    expect(mapa.lotes.some((l: any) => dentro(portal, l.poly))).toBe(false);
    // Entre o stand (B14) e a quadra D, a poucos metros de cada um
    const distLote = (c: string) => Math.min(...(mapa.lotes.find((l: any) => l.codigo === c).poly as Pt[]).map(q => metros(portal, q)));
    expect(distLote('B14')).toBeLessThan(40);
    // Não é mais o canto noroeste (junto ao rio / área de vivência)
    expect(metros(portal, [-47.3826563, -4.9254537])).toBeGreaterThan(200);
    // A via de acesso chega até o portal
    const acesso = mapa.ruas.find((r: any) => /acesso/i.test(r.nome)).line as Pt[];
    expect(metros(portal, acesso[0])).toBeLessThan(1);
  });
  it('rio (curso d\'água) ao longo da frente, a oeste, passando pela área de vivência', () => {
    expect(mapa.rio.line.length).toBeGreaterThan(10);
    const oeste = Math.min(...mapa.perimetro.map((p: Pt) => p[0]));
    expect(Math.min(...mapa.rio.line.map((p: Pt) => p[0]))).toBeLessThan(oeste); // corre pela divisa oeste
    expect(mapa.rio.line.some((p: Pt) => dentro(p, mapa.areas[0].poly))).toBe(true);
  });
  it('área de vivência e recreação (Quadra F) contém o núcleo de apoio e os pontos de banho', () => {
    const area = mapa.areas[0];
    expect(area.nome).toBe('Área de vivência e recreação');
    expect(area.poly[0]).toEqual(area.poly[area.poly.length - 1]);
    for (const re of [/núcleo/i, /banho 1/i, /banho 2/i]) expect(dentro(ponto(re), area.poly)).toBe(true);
    expect(dentro(area.rotulo, area.poly)).toBe(true);
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
    expect(svg).not.toContain('NaN');
    // Só o B13 colorido (os demais apagados)
    expect((svg.match(/fill="#EEF1F3"/g) || []).length).toBe(lotes.length - 1);
  });
  it('enquadramento inclui a área de vivência e o rio (nada fica fora do quadro)', () => {
    const svg = renderToStaticMarkup(React.createElement(MapaTematico, { slug: 'bom-jardims', lotes, contexto: mapa, semLegenda: true }));
    const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    const nums = Array.from(svg.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)).map(m => [Number(m[1]), Number(m[2])]);
    expect(nums.length).toBeGreaterThan(100);
    for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(w); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(h); }
  });
  it('mapa público: rio, área de vivência e nome do portal', () => {
    const svg = renderToStaticMarkup(React.createElement(LoteMap, { lotes: lotesDoMapa(mapa), onSelect: () => {}, dados: mapa }));
    expect(svg).toContain('#2C7FB8');
    expect(svg).toContain('ÁREA DE VIVÊNCIA');
    expect(svg).toContain('PORTAL DE ENTRADA');
    expect(svg).not.toContain('NaN');
  });
});
