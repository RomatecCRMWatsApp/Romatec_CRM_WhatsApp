/**
 * Portal do comprador: situação das parcelas (barra pagas / em atraso / a vencer) e demonstrativo anual dos valores
 * pagos, para o comprador informar a chácara na declaração do Imposto de Renda. Funções puras (telas e testes).
 */

export interface ParcelaPortal {
  rotulo: string; vencimento: string; valor: number; status: string; pagoEm: string | null; valorPago: number | null; atraso: number;
}

export interface SituacaoParcelas { pagas: number; emAtraso: number; aVencer: number; total: number; pctPago: number }

/** Contagem das parcelas para a barra do topo do portal */
export function situacaoParcelas(ps: ParcelaPortal[]): SituacaoParcelas {
  const pagas = ps.filter(p => p.status === 'paga').length;
  const emAtraso = ps.filter(p => p.status !== 'paga' && p.atraso > 0).length;
  const total = ps.length;
  return { pagas, emAtraso, aVencer: total - pagas - emAtraso, total, pctPago: total ? Math.round((pagas / total) * 1000) / 10 : 0 };
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const anoDe = (iso: string | null) => (iso ? Number(String(iso).slice(0, 4)) : NaN);
const valorPagoDe = (p: ParcelaPortal) => p.valorPago ?? p.valor;

/** Anos-calendário em que houve pagamento (do mais recente para o mais antigo) */
export function anosComPagamento(ps: ParcelaPortal[]): number[] {
  return Array.from(new Set(ps.filter(p => p.status === 'paga' && p.pagoEm).map(p => anoDe(p.pagoEm)).filter(a => Number.isFinite(a)))).sort((a, b) => b - a);
}

export interface Demonstrativo {
  ano: number;
  itens: { rotulo: string; vencimento: string; pagoEm: string; valor: number }[];
  totalNoAno: number;
  /** Soma de tudo o que foi pago até 31/12 do ano (valor para "Situação em 31/12" da declaração) */
  acumuladoAte31Dez: number;
  /** Mesmo acumulado até 31/12 do ano anterior ("Situação em 31/12 do ano anterior") */
  acumuladoAnoAnterior: number;
}

/** Pagamentos feitos no ano-calendário (pela data do pagamento, não do vencimento) e os acumulados para a declaração */
export function demonstrativoAnual(ps: ParcelaPortal[], ano: number): Demonstrativo {
  const pagas = ps.filter(p => p.status === 'paga' && p.pagoEm);
  const itens = pagas.filter(p => anoDe(p.pagoEm) === ano)
    .sort((a, b) => String(a.pagoEm).localeCompare(String(b.pagoEm)))
    .map(p => ({ rotulo: p.rotulo, vencimento: p.vencimento, pagoEm: String(p.pagoEm).slice(0, 10), valor: centavos(valorPagoDe(p)) }));
  const soma = (f: (p: ParcelaPortal) => boolean) => centavos(pagas.filter(f).reduce((s, p) => s + valorPagoDe(p), 0));
  return {
    ano, itens,
    totalNoAno: centavos(itens.reduce((s, i) => s + i.valor, 0)),
    acumuladoAte31Dez: soma(p => anoDe(p.pagoEm) <= ano),
    acumuladoAnoAnterior: soma(p => anoDe(p.pagoEm) < ano),
  };
}
