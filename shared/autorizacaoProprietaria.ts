/**
 * Autorização da proprietária para planos fora do padrão (preço negociado, entrada/prazo/parcela livres, parcela fixada…):
 * comparação automática com a tabela — mesmo preço de tabela, mesma entrada e mesmo prazo, juros da tabela (Price).
 * Ganho/perda nominal (soma do que entra) e em valor presente (descontado à taxa da tabela, mês a mês).
 */
export interface LinhaPagamento { vencimento: string; valor: number }
export interface Comparativo {
  precoTabela: number; precoProposta: number; entrada: number; prazo: number;
  parcelaTabela: number; totalTabela: number; jurosTabela: number;
  totalProposta: number; jurosProposta: number;
  diferencaNominal: number; vpProposta: number; diferencaVp: number; diferencaVpPct: number;
  taxaTabelaAa: number; taxaPropostaAa: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const meses = (de: string, ate: string) => {
  const [a1, m1] = de.split('-').map(Number), [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
};
export const parcelaPrice = (saldo: number, im: number, n: number) => (im === 0 ? saldo / n : (saldo * im) / (1 - Math.pow(1 + im, -n)));

export function compararComTabela(o: {
  precoTabela: number; precoProposta: number; entrada: number; prazo: number; taxaTabelaAa: number;
  /** Todas as linhas da proposta (entrada e saldo), em ordem; a 1ª é a data-base do valor presente */
  linhas: LinhaPagamento[]; taxaPropostaAm?: number | null;
}): Comparativo {
  const im = Math.pow(1 + o.taxaTabelaAa, 1 / 12) - 1;
  const saldoTab = Math.max(0, o.precoTabela - o.entrada);
  const parcelaTabela = r2(parcelaPrice(saldoTab, im, o.prazo));
  const totalTabela = r2(o.entrada + parcelaTabela * o.prazo);
  const totalProposta = r2(o.linhas.reduce((s, l) => s + l.valor, 0));
  const base = o.linhas[0]?.vencimento ?? '';
  const vpProposta = r2(o.linhas.reduce((s, l) => s + l.valor / Math.pow(1 + im, Math.max(0, meses(base, l.vencimento))), 0));
  return {
    precoTabela: r2(o.precoTabela), precoProposta: r2(o.precoProposta), entrada: r2(o.entrada), prazo: o.prazo,
    parcelaTabela, totalTabela, jurosTabela: r2(totalTabela - o.precoTabela),
    totalProposta, jurosProposta: r2(totalProposta - o.precoProposta),
    diferencaNominal: r2(totalProposta - totalTabela), vpProposta, diferencaVp: r2(vpProposta - o.precoTabela),
    diferencaVpPct: o.precoTabela ? r2(((vpProposta - o.precoTabela) / o.precoTabela) * 10000) / 100 : 0,
    taxaTabelaAa: o.taxaTabelaAa, taxaPropostaAa: o.taxaPropostaAm == null ? null : Math.round((Math.pow(1 + o.taxaPropostaAm, 12) - 1) * 1e6) / 1e6,
  };
}

/** Assinatura dos dados que a proprietária autorizou: se o plano do contrato mudar, a autorização deixa de valer */
export function assinaturaDoPlano(p: { preco_tabela: number; entrada_valor: number; saldo_qtd: number; parcelas: { tipo: string; valor: number; vencimento: string }[] }): string {
  const ls = p.parcelas.map(x => `${x.tipo}:${x.valor.toFixed(2)}`).join('|');
  return `${p.preco_tabela.toFixed(2)}/${p.entrada_valor.toFixed(2)}/${p.saldo_qtd}/${ls}`;
}
