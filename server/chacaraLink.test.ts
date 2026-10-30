import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { geoParaUtm, utmParaGeo } from '../shared/utm';
import {
  codigoChacaraValido, caminhoChacara, linkChacara, centroDoLote, localizacaoDoLote, tituloChacara, mensagemLinkChacara,
} from '../shared/chacaraLink';
import { metaDaRota, injetarMeta } from './seo';

type Pt = [number, number];
const mapa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../client/public/bom-jardims/mapa.json'), 'utf8'));
const lote = (c: string) => mapa.lotes.find((l: any) => l.codigo === c);
const dentro = ([x, y]: Pt, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

describe('UTM: lat/long → E/N (inversa da conversão do memorial)', () => {
  it('ida e volta com erro de milímetros (fuso 23S, Açailândia)', () => {
    for (const [lon, lat] of [[-47.376953, -4.926104], [-47.382658381, -4.925448446], [-45, -10]] as Pt[]) {
      const [e, n] = geoParaUtm(lon, lat, 23);
      const [lo, la] = utmParaGeo(e, n, 23);
      expect(Math.abs(lo - lon) * 111320).toBeLessThan(0.01);
      expect(Math.abs(la - lat) * 110574).toBeLessThan(0.01);
    }
  });
  it('meridiano central do fuso 23 (45° O) cai no E = 500.000 m', () => {
    expect(geoParaUtm(-45, -5, 23)[0]).toBeCloseTo(500000, 3);
  });
});

describe('Localização exata da chácara', () => {
  it('centro de área de um quadrado é o meio dele', () => {
    const [lon, lat] = centroDoLote([[-47, -4], [-46.999, -4], [-46.999, -4.001], [-47, -4.001], [-47, -4]]);
    expect(lon).toBeCloseTo(-46.9995, 7);
    expect(lat).toBeCloseTo(-4.0005, 7);
  });
  it('C05 (numeração oficial): ponto dentro do lote oficial, com Google Maps e UTM', () => {
    const c05 = lote('C05');
    const loc = localizacaoDoLote(c05.poly);
    expect(dentro([loc.lon, loc.lat], c05.poly)).toBe(true);
    expect(loc.googleMaps).toBe(`https://www.google.com/maps?q=${loc.lat.toFixed(6)},${loc.lon.toFixed(6)}`);
    expect(loc.rota).toContain(`destination=${loc.lat.toFixed(6)},${loc.lon.toFixed(6)}`);
    expect(loc.utm.fuso).toBe('23S');
    expect(loc.utm.texto).toMatch(/^E [\d.]+,\d\d · N [\d.]+,\d\d \(SIRGAS 2000, fuso 23S\)$/);
    expect(loc.utm.n).toBeGreaterThan(9_400_000);   // hemisfério sul, falso norte
  });
  it('todas as 84 chácaras têm localização dentro do próprio lote', () => {
    expect(mapa.lotes).toHaveLength(84);
    for (const l of mapa.lotes) {
      const loc = localizacaoDoLote(l.poly);
      expect(dentro([loc.lon, loc.lat], l.poly), l.codigo).toBe(true);
    }
  });
});

describe('Link e mensagem', () => {
  it('código, caminho e link', () => {
    expect(codigoChacaraValido('C05')).toBe(true);
    for (const c of ['c05', 'E01', 'C5', 'C123', '', null]) expect(codigoChacaraValido(c as any)).toBe(false);
    expect(caminhoChacara('c05')).toBe('/bom-jardims/chacara/C05');
    expect(linkChacara('https://romateccrm.com/', 'C05')).toBe('https://romateccrm.com/bom-jardims/chacara/C05');
  });
  it('mensagem do WhatsApp: chácara, empreendimento, link e corretor — sem preço', () => {
    const m = mensagemLinkChacara({ codigo: 'C05', quadra: 'C', areaM2: 3143.41 }, 'https://romateccrm.com/bom-jardims/chacara/C05');
    expect(m).toContain('*Chácara C05 · Quadra C · 3.143,41 m²*');
    expect(m).toContain('Condomínio de Chácaras Bom Jardims · Açailândia/MA');
    expect(m).toContain('https://romateccrm.com/bom-jardims/chacara/C05');
    expect(m).toContain('CRECI/MA 4.705');
    expect(m).not.toMatch(/R\$|pre[çc]o|parcela/i);
    expect(tituloChacara({ codigo: 'A01' })).toBe('Chácara A01');
  });
});

describe('Página pública /bom-jardims/chacara/:codigo — meta (prévia do link no WhatsApp)', () => {
  it('título, descrição e foto da chácara; fora do Google', () => {
    const meta = metaDaRota('/bom-jardims/chacara/c05') as any;
    expect(meta.title).toContain('Chácara C05 · Quadra C');
    expect(meta.description).toContain('localização exata');
    expect(meta.description).not.toMatch(/R\$|pre[çc]o/i);
    expect(meta.path).toBe('/bom-jardims/chacara/C05');
    expect(meta.indexavel).toBe(false);
    const html = injetarMeta('<html><head><title>x</title><meta name="description" content="" /></head><body><div id="root"></div></body></html>', meta, 'https://romateccrm.com');
    expect(html).toContain('<meta property="og:title" content="Chácara C05 · Quadra C');
    expect(html).toContain('<meta property="og:image" content="https://romateccrm.com/bom-jardims/og.jpg" />');
    expect(html).toContain('noindex');
  });
  it('código inválido não vira página de chácara', () => {
    expect((metaDaRota('/bom-jardims/chacara/Z99') as any).title).not.toContain('Chácara');
  });
});

describe('Mapa público em modo destaque (página da chácara)', () => {
  let LoteMap: any, lotesDoMapa: any;
  beforeAll(async () => {
    (globalThis as any).React = React;
    ({ default: LoteMap, lotesDoMapa } = await import('../client/src/components/bom-jardims/LoteMap'));
  });
  it('a chácara em dourado, sem a lista de escolha nem o cartão da seleção', () => {
    const html = renderToStaticMarkup(React.createElement(LoteMap, { lotes: lotesDoMapa(mapa), selected: 'C05', destaque: true, onSelect: () => {}, dados: mapa }));
    expect((html.match(/fill="#E8B931"/g) || []).length).toBe(1);
    expect(html).not.toContain('Ou escolha pela lista');
    expect(html).not.toContain('Chácara selecionada');
    const normal = renderToStaticMarkup(React.createElement(LoteMap, { lotes: lotesDoMapa(mapa), selected: 'C05', onSelect: () => {}, dados: mapa }));
    expect(normal).toContain('Ou escolha pela lista');
    // Mapa de vendas: a escolhida também fica em dourado (igual ao 3D)
    expect((normal.match(/fill="#E8B931"/g) || []).length).toBe(1);
  });
});
