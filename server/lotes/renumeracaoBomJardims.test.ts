import { describe, it, expect } from 'vitest';
import { RENUMERACAO_C_D, codigoOficial, planoRenumeracao, numeracaoAtual, codigoTemporario, type LoteRenumeravel } from './renumeracaoBomJardims';
import { manterCodigosPorPosicao } from './dxf';

// Centros reais (banco, numeração do DXF) do "C01" e do "C09"
const C01_DXF: [number, number] = [-47.3783191, -4.9258951];   // fica onde a planta oficial tem o C11
const C09_DXF: [number, number] = [-47.3759204, -4.9244036];   // fica onde a planta oficial tem o C01

/** Banco de teste: A/B intactos + 36 C/D; posição do C01 decide o estado */
function banco(estado: 'dxf' | 'oficial'): LoteRenumeravel[] {
  const rows: LoteRenumeravel[] = [{ id: 1, codigo: 'A01', quadra: 'A', numero: 1, lonCentro: -47.377, latCentro: -4.922 }];
  let id = 100;
  for (const q of ['C', 'D']) for (let n = 1; n <= 18; n++) {
    const codigo = `${q}${String(n).padStart(2, '0')}`;
    rows.push({ id: id++, codigo, quadra: q, numero: n, lonCentro: -47.378, latCentro: -4.926 });
  }
  const c01 = rows.find(r => r.codigo === 'C01')!;
  [c01.lonCentro, c01.latCentro] = estado === 'dxf' ? C01_DXF : C09_DXF;
  return rows;
}

describe('Renumeração oficial das quadras C e D (Bom Jardims)', () => {
  it('tabela: 36 lotes, troca dentro da mesma quadra, sem repetir número (bijeção)', () => {
    const pares = Object.entries(RENUMERACAO_C_D);
    expect(pares).toHaveLength(36);
    for (const [de, para] of pares) expect(de[0]).toBe(para[0]);
    for (const q of ['C', 'D']) {
      const destinos = pares.filter(([de]) => de[0] === q).map(([, para]) => para).sort();
      expect(destinos).toEqual(Array.from({ length: 18 }, (_, i) => `${q}${String(i + 1).padStart(2, '0')}`));
    }
  });
  it('é a mesma rotação de 10 posições nas duas quadras (como o casamento pelo KMZ mostrou)', () => {
    for (const [de, para] of Object.entries(RENUMERACAO_C_D)) {
      expect(Number(para.slice(1))).toBe(((Number(de.slice(1)) + 9) % 18) + 1);
    }
  });
  it('A, B, E e demais não mudam', () => {
    for (const c of ['A01', 'A13', 'B14', 'B26', 'E01']) expect(codigoOficial(c)).toBe(c);
    expect(codigoOficial('C01')).toBe('C11');
    expect(codigoOficial('D09')).toBe('D01');
  });
  it('plano: 36 passos com o banco na numeração do DXF; nenhum se já estiver na oficial (idempotente)', () => {
    const passos = planoRenumeracao(banco('dxf'));
    expect(passos).toHaveLength(36);
    expect(passos.find(p => p.de === 'C01')).toMatchObject({ para: 'C11', quadra: 'C', numero: 11 });
    expect(passos.some(p => p.de.startsWith('A'))).toBe(false);
    expect(numeracaoAtual(banco('oficial'))).toBe('oficial');
    expect(planoRenumeracao(banco('oficial'))).toEqual([]);
  });
  it('recusa estado inesperado (lote faltando ou C01 fora das posições conhecidas)', () => {
    expect(() => planoRenumeracao(banco('dxf').filter(r => r.codigo !== 'D18'))).toThrow(/36 lotes|C01–C18/);
    const estranho = banco('dxf');
    const c01 = estranho.find(r => r.codigo === 'C01')!;
    c01.lonCentro = -47.37; c01.latCentro = -4.92;
    expect(() => planoRenumeracao(estranho)).toThrow(/posições esperadas/);
  });
  it('código temporário da 1ª fase não colide com códigos de lote', () => {
    expect(codigoTemporario('C11')).toBe('~C11');
    expect(/^[A-F]\d\d$/.test(codigoTemporario('C11'))).toBe(false);
  });
});

describe('Reimportação do DXF mantém a numeração do cadastro pela posição', () => {
  const cadastrados = [
    { codigo: 'C11', quadra: 'C', numero: 11, lonCentro: C01_DXF[0], latCentro: C01_DXF[1] },   // já renumerado
    { codigo: 'C01', quadra: 'C', numero: 1, lonCentro: C09_DXF[0], latCentro: C09_DXF[1] },
  ];
  it('lote do desenho no mesmo lugar fica com o código do banco (o DXF diz C01, o banco diz C11)', () => {
    const dxf = [
      { codigo: 'C01', quadra: 'C', numero: 1, centro: [C01_DXF[0] + 0.000005, C01_DXF[1]] as [number, number] },
      { codigo: 'C09', quadra: 'C', numero: 9, centro: C09_DXF },
    ];
    const r = manterCodigosPorPosicao(dxf, cadastrados);
    expect(r.map(l => l.codigo)).toEqual(['C11', 'C01']);
    expect(r[0]).toMatchObject({ quadra: 'C', numero: 11 });
  });
  it('lote novo (longe de qualquer cadastrado) mantém o código do desenho; um cadastro não serve dois lotes', () => {
    const dxf = [
      { codigo: 'D30', quadra: 'D', numero: 30, centro: [-47.36, -4.93] as [number, number] },
      { codigo: 'C01', quadra: 'C', numero: 1, centro: C01_DXF },
      { codigo: 'C02', quadra: 'C', numero: 2, centro: [C01_DXF[0] + 0.00001, C01_DXF[1]] as [number, number] },
    ];
    const r = manterCodigosPorPosicao(dxf, cadastrados);
    expect(r.map(l => l.codigo)).toEqual(['D30', 'C11', 'C02']);
  });
});
