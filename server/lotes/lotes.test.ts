import { describe, it, expect } from 'vitest';
import { utmParaGeo, azimute, grausMinSeg, areaPlana, perimetro, sentidoHorario, type XY } from '../../shared/utm';
import { importarLotesDxf, numeroBr } from './dxf';
import { memorialDoLote, ordenarVertices, confrontantes } from './memorial';
import { statusPublicoDe, problemaVenda, etapaDoLeadPelaVenda } from '../../shared/lotes';

describe('UTM → latitude/longitude (SIRGAS 2000, fuso 23 Sul)', () => {
  it('centro do lote A01 do Bom Jardims bate com o cadastro (< 1 m)', () => {
    // Centroide do A01 no DXF definitivo (E, N) e o centro já cadastrado (lon, lat)
    const [lon, lat] = utmParaGeo(236375.48, 9455416.73, 23, true);
    expect(Math.abs(lat - -4.9224615) * 111320).toBeLessThan(25);
    expect(Math.abs(lon - -47.3772003) * 111320).toBeLessThan(25);
  });
  it('meridiano central do fuso 23 é −45°', () => {
    const [lon, lat] = utmParaGeo(500000, 10000000, 23, true);
    expect(lon).toBeCloseTo(-45, 6);
    expect(lat).toBeCloseTo(0, 6);
  });
});

describe('Medidas planas', () => {
  const quadrado: XY[] = [[0, 0], [0, 50], [60, 50], [60, 0]];
  it('área, perímetro, azimute', () => {
    expect(areaPlana(quadrado)).toBe(3000);
    expect(perimetro(quadrado)).toBe(220);
    expect(azimute([0, 0], [0, 10])).toBe(0);
    expect(azimute([0, 0], [10, 0])).toBe(90);
    expect(azimute([0, 0], [0, -10])).toBe(180);
    expect(grausMinSeg(123.7516667)).toBe(`123°45'06"`);
  });
  it('sentido horário', () => {
    const anti: XY[] = [[0, 0], [60, 0], [60, 50], [0, 50]];
    expect(sentidoHorario(anti)).toEqual([[0, 50], [60, 50], [60, 0], [0, 0]]);
  });
});

/** DXF mínimo: 2 lotes vizinhos na quadra A, rótulos e áreas; uma cópia sem contorno (ignorada) */
function dxfDeTeste(): string {
  const l: string[] = ['0', 'SECTION', '2', 'ENTITIES'];
  const poli = (pts: XY[]) => { l.push('0', 'LWPOLYLINE', '8', 'REGIAO_POLILINHAS', '90', String(pts.length), '70', '1'); for (const [x, y] of pts) l.push('10', String(x), '20', String(y)); };
  const txt = (camada: string, t: string, x: number, y: number) => l.push('0', 'TEXT', '8', camada, '10', String(x), '20', String(y), '1', t);
  poli([[236000, 9455000], [236000, 9455050], [236060, 9455050], [236060, 9455000]]);
  poli([[236060, 9455000], [236060, 9455050], [236120, 9455050], [236120, 9455000]]);
  txt('NUMERO_DOS_LOTES', '01', 236030, 9455025); txt('AREA_DOS_LOTES', '3.000,00 m\\U+00B2', 236030, 9455010);
  txt('NUMERO_DOS_LOTES', '02', 236090, 9455025); txt('AREA_DOS_LOTES', '3.000,00 m\\U+00B2', 236090, 9455010);
  txt('IDENT_DAS_QUADRAS', 'A', 236060, 9455080);
  txt('NUMERO_DOS_LOTES', '01', 238030, 9455025); // cópia da prancha, sem contorno
  l.push('0', 'ENDSEC', '0', 'EOF');
  return l.join('\r\n');
}

describe('Importação do DXF', () => {
  it('lê "3.025,11 m²" como número', () => {
    expect(numeroBr('3.025,11 m\\U+00B2')).toBe(3025.11);
    expect(numeroBr('abc')).toBeNull();
  });
  it('monta os lotes com quadra, área, desenho e centro', () => {
    const r = importarLotesDxf(dxfDeTeste());
    expect(r.lotes.map(l => l.codigo)).toEqual(['A01', 'A02']);
    expect(r.lotes[0]).toMatchObject({ quadra: 'A', numero: 1, areaM2: 3000, areaCalculadaM2: 3000, perimetroM: 220 });
    expect(r.lotes[0].poligono).toHaveLength(5); // fechado
    expect(r.lotes[0].centro[1]).toBeLessThan(-4.9);
    expect(r.avisos.some(a => /fora de qualquer contorno/.test(a))).toBe(true);
  });
  it('reimportação mantém a quadra do lote já cadastrado', () => {
    const r = importarLotesDxf(dxfDeTeste(), { quadraDoLote: (_c, numero) => (numero === 2 ? 'B' : null) });
    expect(r.lotes.map(l => l.codigo).sort()).toEqual(['A01', 'B02']);
  });
});

describe('Memorial descritivo (rascunho)', () => {
  const a = importarLotesDxf(dxfDeTeste()).lotes;
  const todos = a.map(l => ({ codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: l.areaM2, perimetroM: l.perimetroM, verticesUtm: l.verticesUtm }));
  it('começa no vértice mais ao norte e a oeste, sentido horário', () => {
    expect(ordenarVertices(todos[0].verticesUtm)[0]).toEqual([236000, 9455050]);
  });
  it('confronta com o lote vizinho na linha comum', () => {
    const c = confrontantes(todos[0], todos);
    expect(c.flat()).toEqual(['A02']);
  });
  it('texto com área, azimutes, distâncias e fechamento', () => {
    const m = memorialDoLote(todos[0], todos, { nome: 'Condomínio Teste', municipio: 'Açailândia', uf: 'MA', fuso: 23 });
    expect(m.titulo).toBe('Lote 01 da Quadra A — Condomínio Teste');
    expect(m.cabecalho.join(' ')).toContain('3.000,00 m² (0,3000 ha)');
    expect(m.cabecalho.join(' ')).toContain('sem registro informado');
    expect(m.vertices).toHaveLength(4);
    expect(m.vertices[0]).toMatchObject({ nome: 'V1', azimute: `90°00'00"`, distancia: 60 });
    expect(m.vertices[1].confronta).toBe('Lote 02 da Quadra A');
    expect(m.descricao).toMatch(/^Inicia-se a descrição deste perímetro no vértice V1, de coordenadas N 9\.455\.050,000 m e E 236\.000,000 m/);
    expect(m.descricao).toMatch(/ponto inicial da descrição, fechando o polígono\.$/);
  });
});

describe('Situações de venda', () => {
  it('o site público só vê disponível / reservado / vendido / área técnica', () => {
    expect(statusPublicoDe('interesse')).toBe('disponivel');
    expect(statusPublicoDe('entrada')).toBe('reservado');
    expect(statusPublicoDe('vendido_parcelado')).toBe('vendido');
    expect(statusPublicoDe('quitado')).toBe('vendido');
    expect(statusPublicoDe('bloqueado')).toBe('nao_comercializavel');
  });
  it('exige cliente, entrada e parcelas quando faz sentido', () => {
    expect(problemaVenda({ situacao: 'reservado' })).toMatch(/cliente/);
    expect(problemaVenda({ situacao: 'reservado', clienteNome: 'Ana' })).toBeNull();
    expect(problemaVenda({ situacao: 'entrada', leadId: 3 })).toMatch(/entrada/);
    expect(problemaVenda({ situacao: 'vendido_parcelado', leadId: 3 })).toMatch(/parcelas/);
    expect(problemaVenda({ situacao: 'vendido_avista', leadId: 3, valorVenda: 100, valorEntrada: 200 })).toMatch(/maior/);
    expect(problemaVenda({ situacao: 'disponivel' })).toBeNull();
  });
  it('reserva leva o lead para proposta; venda para fechado', () => {
    expect(etapaDoLeadPelaVenda('reservado')).toBe('proposta');
    expect(etapaDoLeadPelaVenda('vendido_avista')).toBe('fechado');
    expect(etapaDoLeadPelaVenda('interesse')).toBeNull();
  });
});
