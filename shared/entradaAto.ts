/**
 * Pagamento do ATO: o à vista ou as cobranças da entrada que vencem no mesmo dia da 1ª. Na entrada única é só a nº 1;
 * na entrada dividida (R$ 5 mil boleto/PIX + R$ 5 mil cartão) são as duas. A entrada de 30% parcelada (meses
 * seguintes) continua com o ato = nº 1. Vale o vencimento ORIGINAL (a 2ª via muda o vencimento, não o ato).
 */
export interface LinhaAto { tipo: string; numero: number | string; vencimento?: unknown; vencimentoOriginal?: unknown; status?: string | null; pagoEm?: unknown }

const dia = (v: unknown) => (v == null || v === '' ? '' : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

export function linhasDoAto<T extends LinhaAto>(ls: T[]): T[] {
  const avista = ls.filter(l => l.tipo === 'avista');
  if (avista.length) return avista;
  const e1 = ls.find(l => l.tipo === 'entrada' && Number(l.numero) === 1);
  if (!e1) return [];
  const d = dia(e1.vencimentoOriginal ?? e1.vencimento);
  return ls.filter(l => l.tipo === 'entrada' && (Number(l.numero) === 1 || (!!d && dia(l.vencimentoOriginal ?? l.vencimento) === d)));
}

/** Linha faz parte do pagamento do ato? */
export const ehDoAto = <T extends LinhaAto>(l: T, ls: T[]) => linhasDoAto(ls).some(x => x === l || (x.tipo === l.tipo && Number(x.numero) === Number(l.numero)));

/** Ato inteiro pago (todas as cobranças dele); devolve a data do último pagamento, ou null */
export function atoPagoEm<T extends LinhaAto>(ls: T[]): string | null {
  const a = linhasDoAto(ls);
  if (!a.length || !a.every(l => l.status === 'paga')) return null;
  return a.map(l => dia(l.pagoEm ?? l.vencimento)).sort().at(-1) || null;
}
