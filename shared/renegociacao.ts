/**
 * Renegociação de parcelas (termo aditivo ao CPCV): parcelas em aberto escolhidas → valor renegociado (com os encargos
 * de mora das vencidas, menos o desconto concedido) → novo parcelamento pela Tabela Price à taxa informada.
 */

export interface ItemRenegociado { id: number; rotulo: string; vencimento: string; valor: number; atualizado: number; diasAtraso: number }
export interface NovaParcela { numero: number; vencimento: string; valor: number; juros: number; amortizacao: number; saldo: number }
export interface Renegociacao {
  itens: ItemRenegociado[];
  totalOriginal: number;
  encargos: number;
  desconto: number;
  valorRenegociado: number;
  taxaMensal: number;
  parcelas: NovaParcela[];
  totalAPagar: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Mesmo dia nos meses seguintes (fevereiro e meses curtos: último dia do mês) */
export function somarMeses(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Tabela Price: parcelas iguais; a última absorve o arredondamento */
export function tabelaPrice(valor: number, n: number, taxaMensal: number, primeiroVencimento: string): NovaParcela[] {
  if (!(n >= 1) || !(valor > 0)) return [];
  const i = Math.max(0, taxaMensal);
  const pmt = i > 0 ? r2((valor * i) / (1 - Math.pow(1 + i, -n))) : r2(valor / n);
  const out: NovaParcela[] = [];
  let saldo = valor;
  for (let k = 1; k <= n; k++) {
    const juros = r2(saldo * i);
    let parcela = pmt;
    let amort = r2(parcela - juros);
    if (k === n) { amort = r2(saldo); parcela = r2(amort + juros); }
    saldo = r2(saldo - amort);
    out.push({ numero: k, vencimento: somarMeses(primeiroVencimento, k - 1), valor: parcela, juros, amortizacao: amort, saldo: Math.max(0, saldo) });
  }
  return out;
}

export function montarRenegociacao(itens: ItemRenegociado[], o: { desconto: number; parcelas: number; taxaMensal: number; primeiroVencimento: string }): Renegociacao {
  const totalOriginal = r2(itens.reduce((s, x) => s + x.valor, 0));
  const atualizado = r2(itens.reduce((s, x) => s + x.atualizado, 0));
  const encargos = r2(atualizado - totalOriginal);
  const desconto = r2(Math.min(Math.max(0, o.desconto || 0), atualizado));
  const valorRenegociado = r2(atualizado - desconto);
  const parcelas = tabelaPrice(valorRenegociado, Math.floor(o.parcelas), o.taxaMensal, o.primeiroVencimento);
  return { itens, totalOriginal, encargos, desconto, valorRenegociado, taxaMensal: Math.max(0, o.taxaMensal), parcelas, totalAPagar: r2(parcelas.reduce((s, p) => s + p.valor, 0)) };
}

export const STATUS_ADITIVO = ['aguardando', 'assinado', 'cancelado'] as const;
export type StatusAditivo = typeof STATUS_ADITIVO[number];
export const ROTULO_STATUS_ADITIVO: Record<StatusAditivo, string> = { aguardando: 'Aguardando assinatura do comprador', assinado: 'Assinado e aplicado', cancelado: 'Cancelado' };
