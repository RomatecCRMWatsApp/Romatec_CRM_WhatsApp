/**
 * Saldo da proprietária no portal do empreendedor: o que está em caixa no empreendimento menos o que já é devido à
 * gestora (comissões de gestão das vendas cujo cliente já pagou a parcela e as comissões das concessões) e menos o que
 * o empreendimento deve a terceiros que bancaram despesas. As comissões futuras aparecem como programação.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos } from '../../drizzle/schema';
import { STATUS_COM_COMISSAO, partesDaComissao } from '../../shared/repasseComissao';

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };

export interface ParcelaComissaoGestao { contrato: string; lote: string; quando: string; valor: number; data: string | null; devida: boolean }

/** Comissão de gestão (5%) das vendas do empreendimento, parte a parte, conforme o cliente paga (mesma regra do repasse) */
export async function comissoesDeGestao(empreendimentoId: number, hoje: string): Promise<ParcelaComissaoGestao[]> {
  const d: any = await getDb();
  if (!d) return [];
  const lista: any[] = await d.select().from(contratos).where(and(eq(contratos.empreendimentoId, empreendimentoId), inArray(contratos.status, [...STATUS_COM_COMISSAO])));
  const vendas = lista.map(c => ({ c, plano: json(c.simulacaoJson) })).filter(x => !x.plano?.concessao && Number(x.plano?.comissao_total ?? 0) > 0);
  if (!vendas.length) return [];
  const ids = vendas.map(x => Number(x.c.id));
  const cobs: any[] = await d.select({ contratoId: cobrancas.contratoId, tipo: cobrancas.tipo, numero: cobrancas.numero, vencimento: cobrancas.vencimento, status: cobrancas.status, pagoEm: cobrancas.pagoEm })
    .from(cobrancas).where(and(inArray(cobrancas.contratoId, ids), inArray(cobrancas.tipo, ['avista', 'entrada', 'saldo'])));
  return vendas.flatMap(({ c, plano }) => partesDaComissao({
    plano: { ...plano, comissao_corretor: Number(plano.comissao_total) }, statusContrato: String(c.status), hoje, entradaPagaNoAto: !!c.entradaPagaNoAto,
    cobrancas: cobs.filter(x => Number(x.contratoId) === Number(c.id)).map(x => ({ tipo: x.tipo, numero: Number(x.numero), vencimento: String(x.vencimento), status: x.status, pagoEm: x.pagoEm ? String(x.pagoEm) : null })),
    repasses: [],
  }).map(p => ({ contrato: String(c.numero), lote: String(c.loteCodigo), quando: p.quando, valor: r2(p.valor), data: p.clientePagouEm ?? p.vencimentoCliente, devida: !!p.clientePagouEm })));
}

/** Saldo livre da proprietária a partir do saldo em caixa (fluxo de caixa) */
export function saldoLivre(o: { saldoCaixa: number; comissoesDevidas: number; concessoesAPagar: number; dividaTerceiros: number }) {
  const descontos = r2(o.comissoesDevidas + o.concessoesAPagar + o.dividaTerceiros);
  return { ...o, descontos, saldo: r2(o.saldoCaixa - descontos) };
}
