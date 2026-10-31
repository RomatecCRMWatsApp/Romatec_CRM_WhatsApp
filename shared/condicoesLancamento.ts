/**
 * Condições de lançamento (aprovadas pela proprietária em 31/10/2026): além da entrada de 30% (condição padrão,
 * shared/simulador.ts), o cliente pode aderir a um dos três planos com entrada de R$ 10.000,00:
 *
 * - Plano A — Plano 13º: a mesma parcela do padrão (saldo de 70% pela Price) + reforço anual (a cada 12 meses,
 *   coincidindo com o 13º) que cobre a diferença da entrada. Prazos: os do padrão.
 * - Plano B — Prazo longo: saldo (preço − R$ 10 mil) pela Price, sem reforço. Prazos: os do padrão + 180.
 * - Plano C — Entrada parcelada: complemento da entrada (30% − R$ 10 mil) em até 36 parcelas mensais sem juros,
 *   pago junto com o saldo de 70% pela Price. Prazos: os do padrão.
 *
 * Mesma taxa (juros efetivos ao ano → mensal equivalente), mesmo preço de tabela, sem correção. Mês 0 = ato
 * (entrada); as parcelas do saldo, do complemento e os reforços vencem a partir do mês 1.
 */
import { brl, dividirEntrada, parcelaPrice, r2, simular, taxaMensal, type CondicoesPagamento } from './simulador';

export type CondicaoPagamento = 'padrao' | 'A' | 'B' | 'C';
export const CONDICOES: CondicaoPagamento[] = ['padrao', 'A', 'B', 'C'];

/** Entrada dos planos A, B e C */
export const ENTRADA_LANCAMENTO = 10000;
/** Plano B: prazo extra além dos do padrão */
export const PRAZO_LONGO_B = 180;
/** Plano C: complemento da entrada em até 36 meses */
export const MESES_COMPLEMENTO_C = 36;

export const ROTULO_CONDICAO: Record<CondicaoPagamento, { curto: string; titulo: string; resumo: string }> = {
  padrao: { curto: 'Entrada 30%', titulo: 'Entrada de 30%', resumo: 'Entrada de 30% (à vista com desconto ou em até 6× sem juros) e o saldo em parcelas fixas.' },
  A: { curto: 'Plano A', titulo: 'Plano A — Plano 13º', resumo: 'Entrada de R$ 10 mil, a mesma parcela da condição de 30% e um reforço por ano, no mês do 13º.' },
  B: { curto: 'Plano B', titulo: 'Plano B — Prazo longo', resumo: 'Entrada de R$ 10 mil e o restante em parcelas fixas, sem reforço, em até 15 anos.' },
  C: { curto: 'Plano C', titulo: 'Plano C — Entrada parcelada', resumo: 'Entrada de R$ 10 mil e o resto da entrada em até 36× sem juros, junto com a parcela.' },
};

export function condicaoValida(v: unknown): v is CondicaoPagamento {
  return typeof v === 'string' && (CONDICOES as string[]).includes(v);
}

/** Prazos (meses do saldo) disponíveis em cada condição */
export function prazosDaCondicao(cond: CondicaoPagamento, c: Pick<CondicoesPagamento, 'prazos'>): number[] {
  const base = [...c.prazos].sort((a, b) => a - b);
  return cond === 'B' ? Array.from(new Set([...base, PRAZO_LONGO_B])).sort((a, b) => a - b) : base;
}

export interface PlanoCondicao {
  condicao: CondicaoPagamento;
  prazo: number;
  preco: number;
  /** Pago no ato (entrada à vista do padrão já com desconto, ou R$ 10 mil nos planos) */
  entradaAto: number;
  /** Parcelas da entrada (padrão parcelado: 2..6× sem juros; demais: [entradaAto]) */
  parcelasEntrada: number[];
  /** Total da entrada (padrão = 30% ou 30% com desconto; planos = R$ 10 mil) */
  entradaTotal: number;
  /** Plano C: complemento da entrada parcelado sem juros */
  complemento: { total: number; qtd: number; parcela: number } | null;
  /** Valor financiado pela Price (o que gera juros) */
  saldoFinanciado: number;
  /** Parcela mensal fixa do saldo */
  parcela: number;
  /** Plano A: reforço anual */
  reforco: { valor: number; qtd: number; intervaloMeses: number } | null;
  /** Desembolso mensal nos primeiros meses (parcela + complemento, no Plano C) */
  mensalInicial: number;
  totalPago: number;
  juros: number;
  taxaMensal: number;
}

/**
 * Plano de uma condição para um preço e prazo. entradaParcelas só vale para o padrão
 * (1 = à vista com desconto; 2..entradaMaxParcelas = sem desconto).
 */
export function planoCondicao(preco: number, cond: CondicaoPagamento, prazo: number, c: CondicoesPagamento, entradaParcelas = 1): PlanoCondicao {
  if (!prazosDaCondicao(cond, c).includes(prazo)) throw new Error(`Prazo de ${prazo} meses não está disponível no ${ROTULO_CONDICAO[cond].curto}`);
  const i = taxaMensal(c.jurosAaEfetivo);
  const saldoPadrao = r2(preco - r2(preco * c.entradaPct));
  const parcelaPadrao = parcelaPrice(saldoPadrao, prazo, i);
  const entrada10 = Math.min(ENTRADA_LANCAMENTO, preco);

  if (cond === 'padrao') {
    const sim = simular(c.areaBaseM2, entradaParcelas, c, preco);
    const p = sim.planos.find(x => x.prazo === prazo)!;
    return {
      condicao: cond, prazo, preco, entradaAto: sim.parcelasEntrada[0], parcelasEntrada: sim.parcelasEntrada, entradaTotal: sim.entradaEfetiva,
      complemento: null, saldoFinanciado: sim.saldo, parcela: p.parcela, reforco: null, mensalInicial: p.parcela,
      totalPago: p.totalPago, juros: p.juros, taxaMensal: i,
    };
  }

  if (cond === 'A') {
    // Parcela igual à do padrão; reforços anuais (meses 12, 24, …) cobrem o restante a valor presente
    const saldo = r2(preco - entrada10);
    const qtd = Math.floor(prazo / 12);
    if (qtd < 1) throw new Error('O Plano A precisa de prazo de 12 meses ou mais');
    const vpParcelas = i === 0 ? parcelaPadrao * prazo : parcelaPadrao * (1 - Math.pow(1 + i, -prazo)) / i;
    const vpUnit = Array.from({ length: qtd }, (_, k) => Math.pow(1 + i, -12 * (k + 1))).reduce((a, b) => a + b, 0);
    const reforco = r2((saldo - vpParcelas) / vpUnit);
    const total = r2(entrada10 + parcelaPadrao * prazo + reforco * qtd);
    return {
      condicao: cond, prazo, preco, entradaAto: entrada10, parcelasEntrada: [entrada10], entradaTotal: entrada10,
      complemento: null, saldoFinanciado: saldo, parcela: parcelaPadrao, reforco: { valor: reforco, qtd, intervaloMeses: 12 },
      mensalInicial: parcelaPadrao, totalPago: total, juros: r2(total - preco), taxaMensal: i,
    };
  }

  if (cond === 'B') {
    const saldo = r2(preco - entrada10);
    const parcela = parcelaPrice(saldo, prazo, i);
    const total = r2(entrada10 + parcela * prazo);
    return {
      condicao: cond, prazo, preco, entradaAto: entrada10, parcelasEntrada: [entrada10], entradaTotal: entrada10,
      complemento: null, saldoFinanciado: saldo, parcela, reforco: null, mensalInicial: parcela, totalPago: total, juros: r2(total - preco), taxaMensal: i,
    };
  }

  // Plano C: complemento da entrada sem juros, junto com o saldo de 70% pela Price
  const totalComp = r2(r2(preco * c.entradaPct) - entrada10);
  const qtd = Math.min(MESES_COMPLEMENTO_C, prazo);
  const parcComp = totalComp > 0 ? dividirEntrada(totalComp, qtd)[0] : 0;
  const total = r2(entrada10 + totalComp + parcelaPadrao * prazo);
  return {
    condicao: cond, prazo, preco, entradaAto: entrada10, parcelasEntrada: [entrada10], entradaTotal: r2(entrada10 + totalComp),
    complemento: totalComp > 0 ? { total: totalComp, qtd, parcela: parcComp } : null,
    saldoFinanciado: saldoPadrao, parcela: parcelaPadrao, reforco: null, mensalInicial: r2(parcelaPadrao + parcComp),
    totalPago: total, juros: r2(total - preco), taxaMensal: i,
  };
}

/** Todos os prazos de uma condição (cards do simulador e do folder) */
export function planosDaCondicao(preco: number, cond: CondicaoPagamento, c: CondicoesPagamento, entradaParcelas = 1): PlanoCondicao[] {
  return prazosDaCondicao(cond, c).flatMap(n => { try { return [planoCondicao(preco, cond, n, c, entradaParcelas)]; } catch { return []; } });
}

export type TipoLinha = 'entrada' | 'complemento' | 'saldo' | 'reforco';
export interface LinhaCronograma {
  /** 0 = ato; parcelas do saldo, complemento e reforços a partir do mês 1 */
  mes: number;
  tipo: TipoLinha;
  numero: number;
  total: number;
  parcela: number;
  juros: number;
  amortizacao: number;
  /** Saldo financiado após o pagamento (o complemento sem juros não entra aqui) */
  saldoDevedor: number;
}

export const ROTULO_LINHA: Record<TipoLinha, string> = { entrada: 'Entrada', complemento: 'Complemento da entrada', saldo: 'Parcela', reforco: 'Reforço anual' };

/**
 * Cronograma mês a mês (planilha). Padrão: entrada nos meses 0..n−1 e o saldo a partir do mês seguinte (como hoje).
 * Planos: entrada no mês 0; saldo (Price) nos meses 1..prazo; reforço (A) somado ao mês 12, 24, …; complemento (C)
 * nos meses 1..36. A última parcela zera o saldo.
 */
export function cronograma(p: PlanoCondicao): LinhaCronograma[] {
  const linhas: LinhaCronograma[] = [];
  const i = p.taxaMensal;
  const nEnt = p.parcelasEntrada.length;
  p.parcelasEntrada.forEach((v, k) => linhas.push({ mes: k, tipo: 'entrada', numero: k + 1, total: nEnt, parcela: v, juros: 0, amortizacao: v, saldoDevedor: p.saldoFinanciado }));
  const inicio = p.condicao === 'padrao' ? nEnt : 1;
  let saldo = p.saldoFinanciado;
  for (let k = 1; k <= p.prazo; k++) {
    const mes = inicio + k - 1;
    if (p.complemento && k <= p.complemento.qtd) {
      const ult = k === p.complemento.qtd;
      const v = ult ? r2(p.complemento.total - p.complemento.parcela * (p.complemento.qtd - 1)) : p.complemento.parcela;
      linhas.push({ mes, tipo: 'complemento', numero: k, total: p.complemento.qtd, parcela: v, juros: 0, amortizacao: v, saldoDevedor: saldo });
    }
    const ultima = k === p.prazo;
    const juros = r2(saldo * i);
    const reforcoAqui = p.reforco && k % p.reforco.intervaloMeses === 0 && k / p.reforco.intervaloMeses <= p.reforco.qtd;
    if (reforcoAqui && !ultima) {
      // Reforço amortiza depois dos juros do mês, que a parcela já cobre
      const amortP = r2(p.parcela - juros);
      saldo = r2(saldo - amortP);
      linhas.push({ mes, tipo: 'saldo', numero: k, total: p.prazo, parcela: p.parcela, juros, amortizacao: amortP, saldoDevedor: saldo });
      const amortR = Math.min(p.reforco!.valor, saldo);
      saldo = r2(saldo - amortR);
      linhas.push({ mes, tipo: 'reforco', numero: k / p.reforco!.intervaloMeses, total: p.reforco!.qtd, parcela: p.reforco!.valor, juros: 0, amortizacao: amortR, saldoDevedor: saldo });
      continue;
    }
    if (ultima) {
      // Última: parcela (+ reforço, se houver) zera o saldo; juros acertam a diferença de arredondamento
      if (reforcoAqui) {
        const amortP = r2(p.parcela - juros);
        linhas.push({ mes, tipo: 'saldo', numero: k, total: p.prazo, parcela: p.parcela, juros, amortizacao: amortP, saldoDevedor: r2(saldo - amortP) });
        const resto = r2(saldo - amortP);
        linhas.push({ mes, tipo: 'reforco', numero: k / p.reforco!.intervaloMeses, total: p.reforco!.qtd, parcela: p.reforco!.valor, juros: r2(p.reforco!.valor - resto), amortizacao: resto, saldoDevedor: 0 });
      } else {
        linhas.push({ mes, tipo: 'saldo', numero: k, total: p.prazo, parcela: p.parcela, juros: r2(p.parcela - saldo), amortizacao: saldo, saldoDevedor: 0 });
      }
      saldo = 0;
      continue;
    }
    const amort = r2(p.parcela - juros);
    saldo = r2(saldo - amort);
    linhas.push({ mes, tipo: 'saldo', numero: k, total: p.prazo, parcela: p.parcela, juros, amortizacao: amort, saldoDevedor: saldo });
  }
  return linhas;
}

/** Desembolso por ano do contrato (1º ano inclui o ato) — gráfico/resumo do folder */
export function desembolsoPorAno(p: PlanoCondicao): number[] {
  const anos: number[] = [];
  for (const l of cronograma(p)) {
    const a = l.mes === 0 ? 0 : Math.floor((l.mes - 1) / 12);
    anos[a] = r2((anos[a] ?? 0) + l.parcela);
  }
  return Array.from(anos, v => v ?? 0);
}

/** "R$ 10.000,00 no ato + 120× de R$ 1.234,51 + 10 reforços anuais de R$ 5.162,98" */
export function textoCondicao(p: PlanoCondicao): string {
  const partes: string[] = [];
  if (p.condicao === 'padrao') {
    partes.push(p.parcelasEntrada.length === 1 ? `entrada à vista ${brl(p.entradaAto)}` : `entrada em ${p.parcelasEntrada.length}× de ${brl(p.parcelasEntrada[0])}`);
  } else partes.push(`${brl(p.entradaAto)} de entrada`);
  if (p.complemento) partes.push(`${p.complemento.qtd}× de ${brl(p.complemento.parcela)} (resto da entrada, sem juros)`);
  partes.push(`${p.prazo}× fixas de ${brl(p.parcela)}`);
  if (p.reforco) partes.push(`${p.reforco.qtd} reforço${p.reforco.qtd > 1 ? 's' : ''} anua${p.reforco.qtd > 1 ? 'is' : 'l'} de ${brl(p.reforco.valor)}`);
  return partes.join(' + ');
}

/** Mensagem do WhatsApp com a condição escolhida */
export function mensagemCondicao(codigo: string, areaM2: number, p: PlanoCondicao, c: Pick<CondicoesPagamento, 'jurosAaEfetivo'>, assinatura: string): string {
  const area = areaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [
    `🌳 *Condomínio de Chácaras Bom Jardims* — Chácara ${codigo} (${area} m²)`,
    `Preço: *${brl(p.preco)}*`,
    `Condição: *${ROTULO_CONDICAO[p.condicao].titulo}*`,
    `• ${textoCondicao(p).split(' + ').join('\n• ')}`,
    `Total a pagar: ${brl(p.totalPago)} — juros ${(c.jurosAaEfetivo * 100).toLocaleString('pt-BR')}% a.a. efetivos (Tabela Price), parcelas fixas`,
    assinatura,
    'Valores sujeitos a alteração e disponibilidade.',
  ].join('\n');
}
