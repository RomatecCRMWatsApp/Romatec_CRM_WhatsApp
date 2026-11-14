import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { areaBR, areaDoLote, ladosDoLote, metrosBR } from '../shared/cotasLote';

// Cotas no mapa: lados e área calculados do polígono batem com a área do projeto (mapa.json do Bom Jardims)
const mapa = JSON.parse(fs.readFileSync(new URL('../client/public/bom-jardims/mapa.json', import.meta.url), 'utf8'));

describe('cotas do lote', () => {
  it('quadrado de 0,001° de lado ≈ 111 m de lado', () => {
    const q: [number, number][] = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]];
    const l = ladosDoLote(q);
    expect(l).toHaveLength(4);
    l.forEach(x => expect(Math.abs(x.metros - 111) ).toBeLessThan(1));
    expect(areaDoLote(q)).toBeGreaterThan(12300);
    expect(areaDoLote(q)).toBeLessThan(12500);
  });

  it('a área calculada de cada chácara bate com a do projeto (diferença < 0,05%)', () => {
    for (const l of mapa.lotes) {
      if (!(l.areaM2 > 0)) continue;
      expect(Math.abs(areaDoLote(l.poly) - l.areaM2) / l.areaM2).toBeLessThan(0.0005);
    }
  });

  it('formato brasileiro', () => {
    expect(metrosBR(40.4512)).toBe('40,45');
    expect(areaBR(3157.17)).toBe('3.157,17 m²');
  });
});
