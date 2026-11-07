/**
 * Tabelas de comissão por empreendimento: para cada forma de pagamento, quanto se recebe e em que momento.
 * - Corretor (2%): o repasse do escritório ao corretor — corretores, administrador e secretária.
 * - Escritório (5%): a comissão integral que o empreendimento paga ao escritório (já inclui o repasse ao corretor) —
 *   administrador, secretária e empreendedor(a).
 * Mesmo cronograma nas duas. Mesmas regras do contrato de comissão (server/contratos/docsComissao.ts):
 * - À vista total: 100% no ato, sobre o valor à vista (já com o desconto).
 * - Entrada de 30% à vista: 100% no pagamento da entrada, sobre o preço de tabela.
 * - Entrada de 30% parcelada: 50% no 1º pagamento da entrada e 50% no 2º.
 * - Planos A, B e C (entrada de R$ 10 mil): 50% no pagamento da entrada e 50% em 4 partes iguais, da 1ª à 4ª parcela do saldo.
 * A comissão é retida pela plataforma de pagamentos na compensação de cada pagamento e repassada em até 5 dias úteis.
 */
import { COMISSAO_LANCAMENTO, ENTRADA_LANCAMENTO, ROTULO_CONDICAO } from './condicoesLancamento';
import { r2 } from './simulador';

export const PRAZO_REPASSE_DIAS_UTEIS = 5;

export type TipoTabelaComissao = 'corretor' | 'escritorio';
export const TIPOS_TABELA_COMISSAO: TipoTabelaComissao[] = ['corretor', 'escritorio'];

/** Quem vê cada tabela */
export function podeVerTabelaComissao(perfil: string | null | undefined, tipo: TipoTabelaComissao): boolean {
  if (tipo === 'corretor') return perfil === 'admin' || perfil === 'secretario' || perfil === 'corretor';
  return perfil === 'admin' || perfil === 'secretario' || perfil === 'empreendedor';
}

export const TITULO_TABELA_COMISSAO: Record<TipoTabelaComissao, string> = {
  corretor: 'Comissão do corretor (repasse do escritório)',
  escritorio: 'Comissão integral do escritório (paga pelo empreendimento)',
};

export interface PagamentoComissao { quando: string; pct: number; valor: number }
export interface LinhaTabelaComissao {
  chave: 'avista' | 'entrada_avista' | 'entrada_parcelada' | 'A' | 'B' | 'C';
  forma: string;
  resumo: string;
  /** Valor sobre o qual a comissão é calculada */
  base: number;
  baseRotulo: string;
  valor: number;
  pagamentos: PagamentoComissao[];
}

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Divide o valor nas fatias (a última leva o arredondamento) */
function fatias(valor: number, partes: { quando: string; pct: number }[]): PagamentoComissao[] {
  let usado = 0;
  return partes.map((p, k) => {
    const v = k === partes.length - 1 ? r2(valor - usado) : r2(valor * p.pct);
    usado = r2(usado + v);
    return { quando: p.quando, pct: p.pct, valor: v };
  });
}

/**
 * @param preco preço de tabela da chácara
 * @param precoAvista valor à vista total (com o desconto)
 * @param pctCorretor percentual do corretor (0.02 = 2%)
 * @param entradaMaxParcelas até quantas vezes a entrada de 30% pode ser parcelada
 */
export function tabelaComissao(preco: number, precoAvista: number, pctCorretor: number, entradaMaxParcelas: number): LinhaTabelaComissao[] {
  const sobrePreco = r2(preco * pctCorretor);
  const sobreAvista = r2(precoAvista * pctCorretor);
  const nSaldo = COMISSAO_LANCAMENTO.parcelasSaldo;
  const atoLanc = COMISSAO_LANCAMENTO.pctAto;
  const lancamento = (cond: 'A' | 'B' | 'C'): LinhaTabelaComissao => ({
    chave: cond,
    forma: ROTULO_CONDICAO[cond].titulo,
    resumo: `Entrada de R$ ${ENTRADA_LANCAMENTO.toLocaleString('pt-BR')}: ${pct(atoLanc)} da comissão no pagamento da entrada e ${pct(1 - atoLanc)} em ${nSaldo} partes iguais, da 1ª à ${nSaldo}ª parcela do saldo.`,
    base: preco, baseRotulo: 'preço de tabela', valor: sobrePreco,
    pagamentos: fatias(sobrePreco, [
      { quando: "Entrada (R$ 10 mil)", pct: atoLanc },
      ...Array.from({ length: nSaldo }, (_, k) => ({ quando: `${k + 1}ª parcela do saldo`, pct: (1 - atoLanc) / nSaldo })),
    ]),
  });
  return [
    {
      chave: 'avista', forma: 'À vista (valor total)', resumo: 'Comissão integral no ato, sobre o valor à vista.',
      base: precoAvista, baseRotulo: 'valor à vista', valor: sobreAvista,
      pagamentos: [{ quando: 'Pagamento à vista', pct: 1, valor: sobreAvista }],
    },
    {
      chave: 'entrada_avista', forma: 'Entrada de 30% à vista', resumo: 'Comissão integral no pagamento da entrada; o saldo financiado não altera a comissão.',
      base: preco, baseRotulo: 'preço de tabela', valor: sobrePreco,
      pagamentos: [{ quando: 'Pagamento da entrada', pct: 1, valor: sobrePreco }],
    },
    {
      chave: 'entrada_parcelada', forma: `Entrada de 30% parcelada (2 a ${entradaMaxParcelas}×)`, resumo: 'Metade da comissão no 1º pagamento da entrada e a outra metade no 2º.',
      base: preco, baseRotulo: 'preço de tabela', valor: sobrePreco,
      pagamentos: fatias(sobrePreco, [{ quando: '1º pagamento da entrada', pct: 0.5 }, { quando: '2º pagamento da entrada', pct: 0.5 }]),
    },
    lancamento('A'), lancamento('B'), lancamento('C'),
  ];
}
