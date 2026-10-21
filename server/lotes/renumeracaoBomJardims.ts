/**
 * Numeração oficial das quadras C e D do Bom Jardims.
 *
 * O DXF importado numerou C e D de outro jeito que a planta oficial (KMZ "Condomínio Bom Jardims —
 * Apresentação", Google Earth). A geometria é a mesma: cada lote C/D do banco cai 100% dentro de um
 * único lote oficial (casamento por centroide + sobreposição em grade de 2 m; A e B batem exatos).
 * Só o número muda — a numeração do banco está "girada" 10 posições em cada quadra.
 *
 * Esta tabela leva o código do banco (como veio do DXF) ao código oficial. Ela é aplicada uma vez no
 * banco (renumeração em duas fases, por causa do índice único empreendimento+código) — ver
 * planoRenumeracao() e scripts/renumerar-lotes-bom-jardims.ts. A e B não mudam.
 */

/** Código no banco (DXF) → código oficial (KMZ / planta) */
export const RENUMERACAO_C_D: Readonly<Record<string, string>> = Object.freeze({
  C01: 'C11', C02: 'C12', C03: 'C13', C04: 'C14', C05: 'C15', C06: 'C16', C07: 'C17', C08: 'C18', C09: 'C01',
  C10: 'C02', C11: 'C03', C12: 'C04', C13: 'C05', C14: 'C06', C15: 'C07', C16: 'C08', C17: 'C09', C18: 'C10',
  D01: 'D11', D02: 'D12', D03: 'D13', D04: 'D14', D05: 'D15', D06: 'D16', D07: 'D17', D08: 'D18', D09: 'D01',
  D10: 'D02', D11: 'D03', D12: 'D04', D13: 'D05', D14: 'D06', D15: 'D07', D16: 'D08', D17: 'D09', D18: 'D10',
});

export interface LoteRenumeravel { id: number; codigo: string; quadra: string | null; numero: number | null; lonCentro?: number | string | null; latCentro?: number | string | null }
export interface PassoRenumeracao { id: number; de: string; para: string; quadra: string; numero: number }

/** Centro do lote oficial C01 (nordeste da quadra C) e do oficial C11 — onde o DXF pôs o "C01" */
const CENTRO_C01_OFICIAL: [number, number] = [-47.3759206, -4.9244049];
const CENTRO_C11_OFICIAL: [number, number] = [-47.3783192, -4.925893];
const metros = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110574);

/** O banco ainda está na numeração do DXF? Decide pela posição do lote "C01" */
export function numeracaoAtual(rows: LoteRenumeravel[]): 'dxf' | 'oficial' {
  const c01 = rows.find(r => r.codigo === 'C01');
  if (!c01 || c01.lonCentro == null || c01.latCentro == null) throw new Error('Lote C01 sem posição — não dá para saber a numeração');
  const pos: [number, number] = [Number(c01.lonCentro), Number(c01.latCentro)];
  if (metros(pos, CENTRO_C01_OFICIAL) < 10) return 'oficial';
  if (metros(pos, CENTRO_C11_OFICIAL) < 10) return 'dxf';
  throw new Error('O lote C01 não está em nenhuma das posições esperadas — confira antes de renumerar');
}

/** Código oficial de um lote do banco (A, B, E e demais ficam como estão) */
export function codigoOficial(codigoBanco: string): string {
  return RENUMERACAO_C_D[codigoBanco] ?? codigoBanco;
}

/**
 * Plano da renumeração (36 lotes C/D). Idempotente: se o banco já está na numeração oficial
 * (decidido pela posição do C01), devolve lista vazia. Recusa contagem inesperada de lotes C/D.
 */
export function planoRenumeracao(rows: LoteRenumeravel[]): PassoRenumeracao[] {
  const cd = rows.filter(r => /^[CD]\d\d$/.test(r.codigo));
  const esperado = Object.keys(RENUMERACAO_C_D).length;
  if (cd.length !== esperado || cd.some(r => !RENUMERACAO_C_D[r.codigo])) {
    throw new Error(`Esperava os ${esperado} lotes C01–C18 e D01–D18, achei ${cd.length} — confira antes de renumerar`);
  }
  if (numeracaoAtual(rows) === 'oficial') return [];
  return cd.map(r => {
    const para = RENUMERACAO_C_D[r.codigo];
    return { id: r.id, de: r.codigo, para, quadra: para[0], numero: Number(para.slice(1)) };
  });
}

/** Código temporário da 1ª fase (fora do padrão de lote, não colide com nenhum código real) */
export const codigoTemporario = (para: string) => `~${para}`;
