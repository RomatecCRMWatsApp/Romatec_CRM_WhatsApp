/**
 * Regra do sistema: chácara concedida pela proprietária (situação "Concedido" ou com contrato de concessão) conta como
 * VENDA À VISTA, pelo valor à vista do imóvel — nas vendas, no valor vendido e na comissão de gestão. As demais vendas
 * seguem a modalidade do próprio contrato (shared/lotes.ts → valorDaConcessao).
 */
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '../db';
import { condicoesPagamento, contratos, lotes } from '../../drizzle/schema';
import { condicoesDaLinha, simular, type CondicoesPagamento } from '../../shared/simulador';

const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Valor à vista da chácara pelas condições do empreendimento (o mesmo do simulador) */
export function valorAvistaDoLote(l: { areaM2: unknown; precoTabela?: unknown }, c: CondicoesPagamento | null): number | null {
  const area = num(l.areaM2);
  if (!c || !area) return null;
  return r2(simular(area, 1, c, num(l.precoTabela)).avistaTotal.valor);
}

export async function condicoesAtivas(d: any, empreendimentoId: number): Promise<CondicoesPagamento | null> {
  const [row]: any[] = await d.select().from(condicoesPagamento)
    .where(and(eq(condicoesPagamento.empreendimentoId, empreendimentoId), eq(condicoesPagamento.ativo, true)))
    .orderBy(desc(condicoesPagamento.vigenteDesde), desc(condicoesPagamento.id)).limit(1);
  return row ? condicoesDaLinha(row) : null;
}

/** Contratos de concessão em andamento ou ativos, por lote: lote → valor à vista do contrato */
export async function concessoesPorLote(d: any, loteIds: number[]): Promise<Map<number, number | null>> {
  const m = new Map<number, number | null>();
  if (!loteIds.length) return m;
  const cs: any[] = await d.select({ loteId: contratos.loteId, sim: contratos.simulacaoJson }).from(contratos)
    .where(and(inArray(contratos.loteId, loteIds), notInArray(contratos.status, ['cancelado', 'distratado'])));
  for (const c of cs) {
    const p = json(c.sim);
    if (p?.concessao && c.loteId) m.set(Number(c.loteId), num(p.preco_avista));
  }
  return m;
}

/**
 * Correção dos dados já gravados: chácaras concedidas (ou com contrato de concessão) ficam com o valor à vista,
 * em parcela única. Idempotente; roda na subida do servidor.
 */
export async function ajustarConcessoesAvista(): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const cs: any[] = await d.select({ loteId: contratos.loteId, status: contratos.status, sim: contratos.simulacaoJson }).from(contratos)
    .where(notInArray(contratos.status, ['cancelado', 'distratado']));
  const doContrato = new Map<number, { avista: number | null; ativo: boolean }>();
  for (const c of cs) { const p = json(c.sim); if (p?.concessao && c.loteId) doContrato.set(Number(c.loteId), { avista: num(p.preco_avista), ativo: ['ativo', 'quitado'].includes(String(c.status)) }); }
  const concedidos: any[] = await d.select().from(lotes).where(eq(lotes.situacao, 'concedido'));
  const comContrato: any[] = doContrato.size ? await d.select().from(lotes).where(inArray(lotes.id, Array.from(doContrato.keys()))) : [];
  const todos = new Map<number, any>([...concedidos, ...comContrato].map(l => [Number(l.id), l]));
  const conds = new Map<number, CondicoesPagamento | null>();
  let n = 0;
  for (const l of Array.from(todos.values())) {
    const emp = Number(l.empreendimentoId);
    if (!conds.has(emp)) conds.set(emp, await condicoesAtivas(d, emp));
    const k = doContrato.get(Number(l.id));
    const avista = k?.avista ?? valorAvistaDoLote(l, conds.get(emp) ?? null);
    if (!avista) continue;
    // Contrato de concessão já ativo com a chácara lançada como venda (entrada/parcelada): passa a "Concedido"
    const situacao = k?.ativo && ['entrada', 'vendido_parcelado', 'vendido_avista'].includes(String(l.situacao)) ? 'concedido' : l.situacao;
    if (num(l.valorVenda) === avista && num(l.valorEntrada) === avista && Number(l.numParcelas) === 1 && situacao === l.situacao) continue;
    await d.update(lotes).set({ valorVenda: avista.toFixed(2), valorEntrada: avista.toFixed(2), numParcelas: 1, situacao, ...(situacao !== l.situacao ? { status: 'vendido' } : {}) } as any).where(eq(lotes.id, l.id));
    n++;
  }
  if (n) console.log(`[Concessão] ${n} chácara(s) concedida(s) ajustada(s) para venda à vista`);
  return n;
}
