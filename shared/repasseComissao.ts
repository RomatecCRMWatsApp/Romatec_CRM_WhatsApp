/**
 * Comissões de venda a pagar ao corretor (Financeiro › Comissões): a partir do plano do contrato assinado e das cobranças,
 * cada parte da comissão do corretor com a data em que deve ser repassada e a situação. Mesma regra das tabelas de
 * comissão (shared/tabelaComissao.ts):
 * - À vista: 100% no pagamento à vista.
 * - Entrada de 30% à vista: 100% no pagamento da entrada; parcelada: 50% no 1º e 50% no 2º pagamento da entrada.
 * - Planos A, B e C: 50% na entrada (R$ 10 mil) e 4 partes iguais, da 1ª à 4ª parcela do saldo.
 * O repasse vence em até 5 dias úteis depois que o comprador paga a parcela que gera a parte; antes disso, a data é a
 * previsão (vencimento da parcela + 5 dias úteis).
 */
import { atoPagoEm, linhasDoAto } from './entradaAto';
import { COMISSAO_LANCAMENTO } from './condicoesLancamento';
import { PRAZO_REPASSE_DIAS_UTEIS, fatias } from './tabelaComissao';

export type SituacaoRepasse = 'paga' | 'a_pagar' | 'atrasada' | 'aguardando_cliente' | 'cliente_atrasado' | 'cancelada';
export const ROTULO_SITUACAO_REPASSE: Record<SituacaoRepasse, string> = {
  paga: 'Paga ao corretor',
  a_pagar: 'A pagar',
  atrasada: 'Repasse atrasado',
  aguardando_cliente: 'Aguardando o cliente pagar',
  cliente_atrasado: 'Cliente em atraso',
  cancelada: 'Não devida (contrato cancelado)',
};
/** Contratos que geram comissão (assinados em diante) */
export const STATUS_COM_COMISSAO = ['assinado', 'ativo', 'quitado'];
export const STATUS_SEM_COMISSAO = ['distratado', 'cancelado'];

export interface PlanoParaRepasse {
  modalidade: 'avista' | 'financiado' | string;
  condicao?: string | null;
  entrada_qtd?: number | null;
  comissao_corretor?: number | null;
  parcelas?: { tipo: string; numero: number; vencimento: string }[];
}
export interface CobrancaParaRepasse { tipo: string; numero: number; vencimento: string; status: string; pagoEm?: string | null }
export interface RepassePago { chave: string; valor: number; pagoEm: string; forma?: string | null }

export interface ParteComissao {
  chave: string;
  quando: string;
  pct: number;
  valor: number;
  /** Vencimento da parcela do comprador que gera a parte */
  vencimentoCliente: string | null;
  clientePagouEm: string | null;
  /** Data do repasse: devido (cliente pagou) ou previsto */
  dataRepasse: string | null;
  situacao: SituacaoRepasse;
  pagoEm: string | null;
  forma: string | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Soma dias úteis (segunda a sexta) a uma data AAAA-MM-DD */
export function somarDiasUteis(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T12:00:00Z`);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return iso(d);
}

/** Partes da comissão do corretor no plano: gatilho (tipo/número da parcela do comprador) e percentual */
export function gatilhosDoPlano(plano: PlanoParaRepasse): { chave: string; tipo: string; numero: number; quando: string; pct: number }[] {
  if (plano.modalidade === 'avista') return [{ chave: 'avista-1', tipo: 'avista', numero: 1, quando: 'Pagamento à vista', pct: 1 }];
  const cond = plano.condicao && plano.condicao !== 'padrao' ? plano.condicao : null;
  if (cond) {
    const n = COMISSAO_LANCAMENTO.parcelasSaldo, ato = COMISSAO_LANCAMENTO.pctAto;
    return [
      { chave: 'entrada-1', tipo: 'entrada', numero: 1, quando: 'Entrada (R$ 10 mil)', pct: ato },
      ...Array.from({ length: n }, (_, k) => ({ chave: `saldo-${k + 1}`, tipo: 'saldo', numero: k + 1, quando: `${k + 1}ª parcela do saldo`, pct: (1 - ato) / n })),
    ];
  }
  if ((plano.entrada_qtd ?? 1) <= 1) return [{ chave: 'entrada-1', tipo: 'entrada', numero: 1, quando: 'Pagamento da entrada', pct: 1 }];
  return [
    { chave: 'entrada-1', tipo: 'entrada', numero: 1, quando: '1º pagamento da entrada', pct: 0.5 },
    { chave: 'entrada-2', tipo: 'entrada', numero: 2, quando: '2º pagamento da entrada', pct: 0.5 },
  ];
}

export function partesDaComissao(o: {
  plano: PlanoParaRepasse; statusContrato: string; cobrancas: CobrancaParaRepasse[]; repasses: RepassePago[];
  entradaPagaNoAto?: boolean; dataAssinatura?: string | null; hoje: string;
}): ParteComissao[] {
  const total = Number(o.plano.comissao_corretor ?? 0);
  if (!(total > 0)) return [];
  const gat = gatilhosDoPlano(o.plano);
  const valores = fatias(total, gat.map(g => ({ quando: g.quando, pct: g.pct })));
  const cancelado = STATUS_SEM_COMISSAO.includes(o.statusContrato);
  return gat.map((g, k) => {
    const pago = o.repasses.find(r => r.chave === g.chave) ?? null;
    const cob = o.cobrancas.find(c => c.tipo === g.tipo && Number(c.numero) === g.numero) ?? null;
    const doPlano = o.plano.parcelas?.find(p => p.tipo === g.tipo && Number(p.numero) === g.numero) ?? null;
    const vencimentoCliente = (cob?.vencimento ?? doPlano?.vencimento ?? null)?.slice(0, 10) ?? null;
    let clientePagouEm = cob?.status === 'paga' ? (cob.pagoEm ?? cob.vencimento)?.slice(0, 10) ?? null : null;
    // Entrada dividida no ato (boleto/PIX + cartão): a parte da comissão do ato só vence com as duas pagas
    if (g.tipo === 'entrada' && g.numero === 1 && linhasDoAto(o.cobrancas).length > 1) clientePagouEm = atoPagoEm(o.cobrancas);
    // Entrada recebida no ato da assinatura (sem boleto)
    if (!clientePagouEm && o.entradaPagaNoAto && g.tipo === 'entrada' && g.numero === 1) clientePagouEm = o.dataAssinatura?.slice(0, 10) ?? vencimentoCliente;
    const dataRepasse = clientePagouEm ? somarDiasUteis(clientePagouEm, PRAZO_REPASSE_DIAS_UTEIS)
      : vencimentoCliente ? somarDiasUteis(vencimentoCliente, PRAZO_REPASSE_DIAS_UTEIS) : null;
    let situacao: SituacaoRepasse;
    if (pago) situacao = 'paga';
    else if (cancelado) situacao = 'cancelada';
    else if (clientePagouEm) situacao = dataRepasse && dataRepasse < o.hoje ? 'atrasada' : 'a_pagar';
    else situacao = vencimentoCliente && vencimentoCliente < o.hoje ? 'cliente_atrasado' : 'aguardando_cliente';
    return {
      chave: g.chave, quando: g.quando, pct: g.pct, valor: pago ? Number(pago.valor) : valores[k].valor,
      vencimentoCliente, clientePagouEm, dataRepasse: pago ? pago.pagoEm.slice(0, 10) : dataRepasse, situacao,
      pagoEm: pago ? pago.pagoEm.slice(0, 10) : null, forma: pago?.forma ?? null,
    };
  });
}

/** Totais e série mensal (mês da data do repasse) para os gráficos */
export function resumoRepasses(partes: Pick<ParteComissao, 'valor' | 'situacao' | 'dataRepasse'>[]) {
  const soma = (f: (p: ParteComissao['situacao']) => boolean) => Math.round(partes.filter(p => f(p.situacao)).reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const meses = new Map<string, { mes: string; pago: number; aPagar: number; previsto: number }>();
  for (const p of partes) {
    if (!p.dataRepasse || p.situacao === 'cancelada') continue;
    const mes = p.dataRepasse.slice(0, 7);
    const m = meses.get(mes) ?? { mes, pago: 0, aPagar: 0, previsto: 0 };
    if (p.situacao === 'paga') m.pago += p.valor;
    else if (p.situacao === 'a_pagar' || p.situacao === 'atrasada') m.aPagar += p.valor;
    else m.previsto += p.valor;
    meses.set(mes, m);
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    pago: soma(s => s === 'paga'),
    aPagar: soma(s => s === 'a_pagar'),
    atrasado: soma(s => s === 'atrasada'),
    previsto: soma(s => s === 'aguardando_cliente' || s === 'cliente_atrasado'),
    porMes: Array.from(meses.values()).sort((a, b) => a.mes.localeCompare(b.mes)).map(m => ({ mes: m.mes, pago: r(m.pago), aPagar: r(m.aPagar), previsto: r(m.previsto) })),
  };
}
