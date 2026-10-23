/**
 * Simulador de financiamento direto do empreendimento (Bom Jardims) — motor de cálculo puro,
 * usado no servidor (fonte da verdade, grava em centavos) e na tela (valores ao vivo).
 *
 * Regras: preço proporcional à área acima da área-base (com tolerância); entrada 30% à vista
 * (com desconto) ou em 2..N mensais sem juros; saldo 70% em parcelas fixas pela Tabela Price,
 * juros efetivos ao ano, sem correção. As condições vêm da tabela condicoesPagamento.
 */

export interface CondicoesPagamento {
  precoBase: number;
  areaBaseM2: number;
  toleranciaAreaM2: number;
  /** 0.30 = 30% */
  entradaPct: number;
  entradaMaxParcelas: number;
  /** Desconto sobre a entrada paga à vista (0.0625 = 6,25%) */
  descontoAvistaPct: number;
  /** Juros efetivos ao ano (0.06 = 6% a.a.) */
  jurosAaEfetivo: number;
  metodo: 'PRICE';
  prazos: number[];
  comissaoTotalPct: number;
  comissaoCorretorPct: number;
  /** Parte da comissão paga no 1º pagamento do sinal (0.5 = 50%) */
  comissao1aParcelaPct: number;
}

export interface PlanoSaldo {
  prazo: number;
  parcela: number;
  totalSaldo: number;
  juros: number;
  totalPago: number;
}

export interface Simulacao {
  areaM2: number;
  preco: number;
  /** Entrada cheia (30% do preço) */
  entrada30: number;
  /** Entrada à vista, já com o desconto */
  entradaAvista: number;
  descontoAvista: number;
  saldo: number;
  entradaParcelas: number;
  /** Valores das parcelas da entrada (à vista = uma só, com desconto) */
  parcelasEntrada: number[];
  entradaEfetiva: number;
  taxaMensal: number;
  planos: PlanoSaldo[];
}

export interface LinhaEvolucao {
  mes: number;
  tipo: 'entrada' | 'saldo';
  /** Nº da parcela dentro da entrada ou do saldo */
  numero: number;
  parcela: number;
  juros: number;
  amortizacao: number;
  saldoDevedor: number;
}

export interface Comissao {
  total: number;
  corretor: number;
  romatec: number;
  no1oPagamento: { total: number; corretor: number; romatec: number };
  no2oPagamento: { total: number; corretor: number; romatec: number };
}

/** Arredonda em centavos, meio para cima */
export function r2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Preço de tabela: área até a base + tolerância = preço base; acima, proporcional à área */
export function precoLote(areaM2: number, c: CondicoesPagamento): number {
  if (areaM2 <= c.areaBaseM2 + c.toleranciaAreaM2) return r2(c.precoBase);
  return r2((areaM2 * c.precoBase) / c.areaBaseM2);
}

/** Taxa mensal equivalente aos juros efetivos anuais: (1 + a.a.)^(1/12) − 1 */
export function taxaMensal(jurosAaEfetivo: number): number {
  return Math.pow(1 + jurosAaEfetivo, 1 / 12) - 1;
}

/** Parcela fixa da Tabela Price (i = 0 → saldo / n) */
export function parcelaPrice(saldo: number, n: number, i: number): number {
  if (i === 0) return r2(saldo / n);
  return r2((saldo * i) / (1 - Math.pow(1 + i, -n)));
}

/** Divide a entrada em n parcelas iguais; a última absorve o arredondamento */
export function dividirEntrada(total: number, n: number): number[] {
  const base = r2(total / n);
  const parcelas = Array.from({ length: n }, () => base);
  parcelas[n - 1] = r2(total - base * (n - 1));
  return parcelas;
}

/**
 * Simulação completa de um lote. entradaParcelas = 1 é a entrada à vista (com desconto);
 * 2..entradaMaxParcelas, parcelada sem juros e sem desconto. O saldo é sempre preço − 30%.
 * precoTabela (do lote) prevalece sobre o preço calculado pela área, quando informado.
 */
export function simular(areaM2: number, entradaParcelas: number, c: CondicoesPagamento, precoTabela?: number | null): Simulacao {
  if (!Number.isInteger(entradaParcelas) || entradaParcelas < 1 || entradaParcelas > c.entradaMaxParcelas) {
    throw new Error(`Entrada em ${entradaParcelas}x fora do limite (à vista ou até ${c.entradaMaxParcelas}x)`);
  }
  const preco = precoTabela != null && precoTabela > 0 ? r2(precoTabela) : precoLote(areaM2, c);
  const entrada30 = r2(preco * c.entradaPct);
  const entradaAvista = r2(entrada30 * (1 - c.descontoAvistaPct));
  const saldo = r2(preco - entrada30);
  const avista = entradaParcelas === 1;
  const entradaEfetiva = avista ? entradaAvista : entrada30;
  const i = taxaMensal(c.jurosAaEfetivo);
  const planos = c.prazos.map(prazo => {
    const parcela = parcelaPrice(saldo, prazo, i);
    const totalSaldo = r2(parcela * prazo);
    return { prazo, parcela, totalSaldo, juros: r2(totalSaldo - saldo), totalPago: r2(entradaEfetiva + totalSaldo) };
  });
  return {
    areaM2, preco, entrada30, entradaAvista, descontoAvista: r2(entrada30 - entradaAvista), saldo,
    entradaParcelas, parcelasEntrada: avista ? [entradaAvista] : dividirEntrada(entrada30, entradaParcelas),
    entradaEfetiva, taxaMensal: i, planos,
  };
}

/**
 * Evolução mês a mês: parcelas da entrada (mês 0..n−1) e depois o saldo pela Price,
 * começando no mês seguinte à última parcela da entrada. A última parcela zera o saldo.
 */
export function evolucao(sim: Simulacao, prazo: number): LinhaEvolucao[] {
  const plano = sim.planos.find(p => p.prazo === prazo);
  if (!plano) throw new Error(`Prazo de ${prazo} meses não está nas condições`);
  const linhas: LinhaEvolucao[] = sim.parcelasEntrada.map((v, k) => ({
    mes: k, tipo: 'entrada', numero: k + 1, parcela: v, juros: 0, amortizacao: v, saldoDevedor: sim.saldo,
  }));
  let saldo = sim.saldo;
  const inicio = sim.parcelasEntrada.length;
  for (let k = 1; k <= prazo; k++) {
    const juros = r2(saldo * sim.taxaMensal);
    const ultima = k === prazo;
    const amortizacao = ultima ? saldo : r2(plano.parcela - juros);
    saldo = ultima ? 0 : r2(saldo - amortizacao);
    linhas.push({ mes: inicio + k - 1, tipo: 'saldo', numero: k, parcela: r2(juros + amortizacao), juros, amortizacao, saldoDevedor: saldo });
  }
  return linhas;
}

/**
 * Comissão sobre o preço de tabela: total (5%) = corretor (2%) + Romatec (3%); venda direta
 * da Romatec (sem corretor) = tudo para a Romatec. Paga no sinal: metade no 1º pagamento e
 * metade no 2º; sinal à vista = 100% no ato.
 */
export function comissao(
  preco: number, comCorretor: boolean, sinalAvista: boolean,
  c: Pick<CondicoesPagamento, 'comissaoTotalPct' | 'comissaoCorretorPct' | 'comissao1aParcelaPct'> = { comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 },
): Comissao {
  const total = r2(preco * c.comissaoTotalPct);
  const corretor = comCorretor ? r2(preco * c.comissaoCorretorPct) : 0;
  const romatec = r2(total - corretor);
  const p1 = sinalAvista ? 1 : c.comissao1aParcelaPct;
  const c1 = r2(corretor * p1), t1 = r2(total * p1);
  const no1oPagamento = { total: t1, corretor: c1, romatec: r2(t1 - c1) };
  const no2oPagamento = { total: r2(total - t1), corretor: r2(corretor - c1), romatec: r2(romatec - no1oPagamento.romatec) };
  return { total, corretor, romatec, no1oPagamento, no2oPagamento };
}

/** Selo do lote no simulador: verde disponível, amarelo em negociação, vermelho vendido (sem proposta) */
export type SeloLote = 'disponivel' | 'negociacao' | 'vendido' | 'nao_comercializavel';

export function seloDoLote(l: { situacao?: string | null; comercializavel?: boolean | number | null }): SeloLote {
  const s = l.situacao || 'disponivel';
  if (l.comercializavel === false || l.comercializavel === 0 || s === 'bloqueado') return 'nao_comercializavel';
  if (s === 'vendido_parcelado' || s === 'vendido_avista' || s === 'quitado') return 'vendido';
  if (s === 'interesse' || s === 'reservado' || s === 'entrada') return 'negociacao';
  return 'disponivel';
}

/** Linha da tabela condicoesPagamento (DECIMAL vem como texto do mysql2) → condições numéricas */
export function condicoesDaLinha(r: Record<string, any>): CondicoesPagamento {
  const n = (v: unknown) => Number(v);
  const prazos = typeof r.prazos === 'string' ? JSON.parse(r.prazos) : r.prazos;
  return {
    precoBase: n(r.precoBase), areaBaseM2: n(r.areaBaseM2), toleranciaAreaM2: n(r.toleranciaAreaM2 ?? 1),
    entradaPct: n(r.entradaPct), entradaMaxParcelas: n(r.entradaMaxParcelas), descontoAvistaPct: n(r.descontoAvistaPct),
    jurosAaEfetivo: n(r.jurosAaEfetivo), metodo: 'PRICE', prazos: (prazos as unknown[]).map(n).sort((a, b) => a - b),
    comissaoTotalPct: n(r.comissaoTotalPct), comissaoCorretorPct: n(r.comissaoCorretorPct), comissao1aParcelaPct: n(r.comissao1aParcelaPct),
  };
}

// ─── Textos ──────────────────────────────────────────────────────────────────

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number, casas: number) => (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** "Juros 6,00% a.a. efetivos (0,4868% a.m.) · Tabela Price · sem correção" — nunca "6% a.a." solto */
export function textoJuros(c: Pick<CondicoesPagamento, 'jurosAaEfetivo'>): string {
  return `Juros ${pct(c.jurosAaEfetivo, 2)}% a.a. efetivos (${pct(taxaMensal(c.jurosAaEfetivo), 4)}% a.m.) · Tabela Price · sem correção`;
}

export const AVISO_LEGAL_SIMULACAO =
  'Simulação sem valor de proposta firme, sujeita à disponibilidade do lote e a alteração de condições. ' +
  'Financiamento direto com o empreendedor (não bancário). Conforme o art. 52 do Código de Defesa do Consumidor, ' +
  'informamos: preço à vista, taxa de juros efetiva mensal e anual, número e periodicidade das prestações e total a pagar com financiamento.';

export const CORRETOR_SIMULACAO = { nome: 'José Romário', creci: 'CRECI/MA 4.705', telefones: ['(99) 9 9181-1246', '(99) 9 9206-2871'] };

/** "à vista R$ 45.000,00 (desconto de R$ 3.000,00)" ou "6× de R$ 8.000,00" */
export function textoEntrada(sim: Simulacao): string {
  if (sim.entradaParcelas === 1) return `à vista ${brl(sim.entradaAvista)} (desconto de ${brl(sim.descontoAvista)})`;
  const [p] = sim.parcelasEntrada;
  const ultima = sim.parcelasEntrada[sim.parcelasEntrada.length - 1];
  return ultima === p ? `${sim.entradaParcelas}× de ${brl(p)}` : `${sim.entradaParcelas}× de ${brl(p)} (última ${brl(ultima)})`;
}

const area = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mensagem do WhatsApp com a simulação escolhida */
export function mensagemSimulacao(codigo: string, sim: Simulacao, prazo: number, c: Pick<CondicoesPagamento, 'jurosAaEfetivo' | 'entradaPct'>): string {
  const plano = sim.planos.find(p => p.prazo === prazo);
  if (!plano) throw new Error(`Prazo de ${prazo} meses não está nas condições`);
  return [
    `🌳 *Condomínio de Chácaras Bom Jardims* — Chácara ${codigo} (${area(sim.areaM2)} m²)`,
    `Preço: *${brl(sim.preco)}*`,
    `Entrada (${pct(c.entradaPct, 0)}%): ${textoEntrada(sim)}`,
    `Saldo: *${prazo}× de ${brl(plano.parcela)}* fixas — juros ${pct(c.jurosAaEfetivo, 0)}% a.a. efetivos (Tabela Price)`,
    `Total a pagar: ${brl(plano.totalPago)}`,
    `Corretor ${CORRETOR_SIMULACAO.nome} · ${CORRETOR_SIMULACAO.creci} · ${CORRETOR_SIMULACAO.telefones[0]}`,
    'Valores sujeitos a alteração e disponibilidade.',
  ].join('\n');
}

/** Valor em centavos (inteiro) para gravar no banco */
export const centavos = (v: number) => Math.round(r2(v) * 100);
