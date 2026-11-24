/**
 * Saldo da proprietária no portal do empreendedor: o que está em caixa no empreendimento menos o que já é devido à
 * gestora (comissões de gestão das vendas cujo cliente já pagou a parcela e as comissões das concessões) e menos o que
 * o empreendimento deve a terceiros que bancaram despesas. As comissões futuras aparecem como programação.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, comissaoRepasses, contratos, empreendimentos } from '../../drizzle/schema';
import { STATUS_COM_COMISSAO, partesDaComissao } from '../../shared/repasseComissao';

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };

export interface ParcelaComissaoGestao {
  contratoId: number; empreendimentoId: number; contrato: string; lote: string; chave: string; quando: string; valor: number; data: string | null;
  /** O comprador pagou a parcela: a comissão já é devida à gestora */
  devida: boolean;
  /** A proprietária já pagou à gestora (registro do escritório) */
  recebidaEm: string | null; forma: string | null;
}
/** Chave do recebimento da comissão de gestão (parte "entrada-1" → "g:entrada-1") na tabela comissaoRepasses */
export const chaveGestao = (parte: string) => `g:${parte}`.slice(0, 20);

/** Comissão de gestão (5%) das vendas do empreendimento, parte a parte, conforme o cliente paga (mesma regra do repasse) */
export async function comissoesDeGestao(empreendimentoId: number | null, hoje: string): Promise<ParcelaComissaoGestao[]> {
  const d: any = await getDb();
  if (!d) return [];
  const lista: any[] = await d.select().from(contratos).where(empreendimentoId == null ? inArray(contratos.status, [...STATUS_COM_COMISSAO]) : and(eq(contratos.empreendimentoId, empreendimentoId), inArray(contratos.status, [...STATUS_COM_COMISSAO])));
  const vendas = lista.map(c => ({ c, plano: json(c.simulacaoJson) })).filter(x => !x.plano?.concessao && Number(x.plano?.comissao_total ?? 0) > 0);
  if (!vendas.length) return [];
  const ids = vendas.map(x => Number(x.c.id));
  const cobs: any[] = await d.select({ contratoId: cobrancas.contratoId, tipo: cobrancas.tipo, numero: cobrancas.numero, vencimento: cobrancas.vencimento, status: cobrancas.status, pagoEm: cobrancas.pagoEm })
    .from(cobrancas).where(and(inArray(cobrancas.contratoId, ids), inArray(cobrancas.tipo, ['avista', 'entrada', 'saldo'])));
  const recs: any[] = await d.select().from(comissaoRepasses).where(inArray(comissaoRepasses.contratoId, ids));
  return vendas.flatMap(({ c, plano }) => partesDaComissao({
    plano: { ...plano, comissao_corretor: Number(plano.comissao_total) }, statusContrato: String(c.status), hoje, entradaPagaNoAto: !!c.entradaPagaNoAto,
    cobrancas: cobs.filter(x => Number(x.contratoId) === Number(c.id)).map(x => ({ tipo: x.tipo, numero: Number(x.numero), vencimento: String(x.vencimento), status: x.status, pagoEm: x.pagoEm ? String(x.pagoEm) : null })),
    repasses: [],
  }).map(p => {
    const rec = recs.find(x => Number(x.contratoId) === Number(c.id) && x.chave === chaveGestao(p.chave));
    return {
      contratoId: Number(c.id), empreendimentoId: Number(c.empreendimentoId), contrato: String(c.numero), lote: String(c.loteCodigo), chave: p.chave, quando: p.quando,
      valor: r2(p.valor), data: p.clientePagouEm ?? p.vencimentoCliente, devida: !!p.clientePagouEm || !!rec,
      recebidaEm: rec ? String(rec.pagoEm).slice(0, 10) : null, forma: rec?.forma ?? null,
    };
  }));
}

export class GestaoErro extends Error { constructor(m: string, public status: number) { super(m); } }

/** Escritório: comissões de gestão das vendas a receber das proprietárias (devidas, programadas e recebidas) */
export async function receitasGestaoVendas(hoje: string) {
  const d: any = await getDb();
  const itens = await comissoesDeGestao(null, hoje);
  const emps: any[] = d ? await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos) : [];
  const E = new Map(emps.map(e => [Number(e.id), String(e.nome)]));
  const soma = (f: (x: ParcelaComissaoGestao) => boolean) => r2(itens.filter(f).reduce((t, x) => t + x.valor, 0));
  return {
    itens: itens.map(x => ({ ...x, empreendimento: E.get(x.empreendimentoId) ?? '' }))
      .sort((a, b) => Number(!!a.recebidaEm) - Number(!!b.recebidaEm) || Number(b.devida) - Number(a.devida) || String(a.data).localeCompare(String(b.data))),
    resumo: { devido: soma(x => x.devida && !x.recebidaEm), programado: soma(x => !x.devida), recebido: soma(x => !!x.recebidaEm) },
  };
}

/** A proprietária pagou a comissão de gestão desta parte: registra e lança a saída no caixa do empreendimento */
export async function registrarRecebimentoGestao(usuarioId: number, i: { contratoId: number; chave: string; pagoEm: string; forma?: string }, hoje: string) {
  const d: any = await getDb();
  if (!d) throw new GestaoErro('Banco indisponível', 503);
  const parte = (await comissoesDeGestao(null, hoje)).find(x => x.contratoId === i.contratoId && x.chave === i.chave);
  if (!parte) throw new GestaoErro('Parte da comissão não encontrada', 404);
  if (parte.recebidaEm) throw new GestaoErro('Esta comissão já está registrada como recebida', 409);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.pagoEm) || i.pagoEm > hoje) throw new GestaoErro('Data inválida', 400);
  const [c]: any[] = await d.select({ corretorUserId: contratos.corretorUserId }).from(contratos).where(eq(contratos.id, i.contratoId)).limit(1);
  const { lancarSaidaComissao } = await import('./saidaComissao');
  const despesaId = await lancarSaidaComissao({ empreendimentoId: parte.empreendimentoId, descricao: `Comissão de gestão — ${parte.lote} (${parte.contrato}) · ${parte.quando}`, valor: parte.valor, pagoEm: i.pagoEm, forma: i.forma, autorId: usuarioId });
  await d.insert(comissaoRepasses).values({
    contratoId: i.contratoId, corretorUserId: Number(c?.corretorUserId ?? 0), chave: chaveGestao(i.chave), valor: parte.valor.toFixed(2), pagoEm: i.pagoEm,
    forma: i.forma?.slice(0, 30) || null, observacao: ['Recebido da proprietária (comissão de gestão)', despesaId ? `despesa:#${despesaId}` : null].filter(Boolean).join(' · '), registradoPor: usuarioId,
  });
  return { ok: true as const, valor: parte.valor };
}

/** Saldo livre da proprietária a partir do saldo em caixa (fluxo de caixa) */
export function saldoLivre(o: { saldoCaixa: number; comissoesDevidas: number; concessoesAPagar: number; dividaTerceiros: number }) {
  const descontos = r2(o.comissoesDevidas + o.concessoesAPagar + o.dividaTerceiros);
  return { ...o, descontos, saldo: r2(o.saldoCaixa - descontos) };
}
