/**
 * Financeiro: vendas dos lotes (sinal, parcelada, à vista, quitada) dos empreendimentos que o usuário
 * pode ver. Admin vê a comissão completa; corretor vê tudo da venda, menos comissão — exceto a dele,
 * nas vendas em que ele é o corretor (com a regra 50/50 da venda parcelada). Regras em shared/permissoes.ts.
 */
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { condicoesPagamento, empreendimentos, leadQualifications, lotes, users } from "../../drizzle/schema";
import { condicoesDaLinha, r2 } from "../../shared/simulador";
import { SITUACOES_VENDA, linhaFinanceira, temAcesso } from "../../shared/permissoes";
import { pctComissaoCorretor } from "../permissoes";
import { TRPCError } from "@trpc/server";

/** Pedido da tabela de financiamento: lote, área ou valor (sem nada, a área padrão das condições) */
const pedidoTabela = z.object({
  slug: z.string().max(80),
  lote: z.string().trim().max(10).nullable().optional(),
  areaM2: z.number().positive().max(10_000_000).nullable().optional(),
  preco: z.number().positive().max(100_000_000).nullable().optional(),
  entrada: z.number().int().min(1).max(60).default(6),
  prazo: z.number().int().min(1).max(600).default(120),
  dataPrimeiro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

async function comErro<T>(f: () => Promise<T> | T): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "TabelaErro" || e?.constructor?.name === "TabelaErro") {
      throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 412 ? "PRECONDITION_FAILED" : "BAD_REQUEST", message: e.message });
    }
    throw e;
  }
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export const financeiroRouter = router({
  /** Tabelas de financiamento: empreendimentos que o usuário acessa (com condições cadastradas) */
  tabelasEmpreendimentos: protectedProcedure.query(async ({ ctx }) => {
    const { empreendimentosComTabela } = await import("../financeiro/tabelas");
    return empreendimentosComTabela(ctx.permissoes);
  }),

  /** Condições + evolutivo (mesmo cálculo do simulador) de um lote, área ou valor, e a lista de lotes */
  tabela: protectedProcedure.input(pedidoTabela).query(async ({ input, ctx }) => {
    const T = await import("../financeiro/tabelas");
    return comErro(async () => {
      const base = await T.baseDoEmpreendimento(input.slug, ctx.permissoes);
      const t = T.calcularTabela(base, input);
      return { empreendimento: base.emp, lotes: base.lotes, ...t };
    });
  }),

  vendas: protectedProcedure.input(z.object({ slug: z.string().max(80).optional() }).optional()).query(async ({ input, ctx }) => {
    const db = (await getDb()) as any;
    if (!db) throw new Error("Banco indisponível");
    const p = ctx.permissoes;
    const emps: any[] = (await db.select().from(empreendimentos))
      .filter((e: any) => temAcesso(p.perfil, p.acessos, "empreendimento", e.id) && (!input?.slug || e.slug === input.slug));
    if (!emps.length) return { vendas: [], resumo: { quantidade: 0, valorVendido: 0, minhasComissoes: 0 } };
    const ids = emps.map(e => e.id);
    const conds: any[] = await db.select().from(condicoesPagamento).where(and(inArray(condicoesPagamento.empreendimentoId, ids), eq(condicoesPagamento.ativo, true)));
    const cond = new Map<number, ReturnType<typeof condicoesDaLinha>>();
    for (const row of conds.sort((a, b) => String(a.vigenteDesde).localeCompare(String(b.vigenteDesde)))) cond.set(row.empreendimentoId, condicoesDaLinha(row));
    const rows: any[] = await db.select().from(lotes).where(and(inArray(lotes.empreendimentoId, ids), inArray(lotes.situacao, [...SITUACOES_VENDA])));
    const leadIds = Array.from(new Set(rows.map(r => r.leadId).filter(Boolean))) as number[];
    const leads: any[] = leadIds.length ? await db.select({ id: leadQualifications.id, nome: leadQualifications.nome }).from(leadQualifications).where(inArray(leadQualifications.id, leadIds)) : [];
    const pessoas: any[] = await db.select({ id: users.id, name: users.name }).from(users);
    const L = new Map(leads.map(l => [l.id, l.nome])), U = new Map(pessoas.map(x => [x.id, x.name])), E = new Map(emps.map(e => [e.id, e]));

    const vendas = rows.map(r => {
      const c = cond.get(r.empreendimentoId) ?? null;
      return linhaFinanceira(p.perfil, ctx.user.id, {
        loteId: r.id, codigo: r.codigo, quadra: r.quadra, areaM2: num(r.areaM2),
        empreendimento: E.get(r.empreendimentoId)?.nome, empreendimentoSlug: E.get(r.empreendimentoId)?.slug,
        situacao: r.situacao, cliente: (r.leadId && L.get(r.leadId)) || r.clienteNome || null,
        corretorId: r.corretorId ?? null, corretorNome: r.corretorId ? U.get(r.corretorId) ?? null : null, minhaVenda: r.corretorId === ctx.user.id,
        valorVenda: num(r.valorVenda), valorEntrada: num(r.valorEntrada), numParcelas: r.numParcelas ?? null, dataSituacao: r.dataSituacao,
      }, c, pctComissaoCorretor(p, r.empreendimentoId, c?.comissaoCorretorPct ?? 0));
    }).sort((a, b) => new Date(b.dataSituacao as any || 0).getTime() - new Date(a.dataSituacao as any || 0).getTime());

    return {
      vendas,
      resumo: {
        quantidade: vendas.length,
        valorVendido: r2(vendas.reduce((s, v) => s + (v.valorVenda ?? 0), 0)),
        minhasComissoes: r2(vendas.reduce((s, v) => s + (v.minhaComissao?.valor ?? 0), 0)),
      },
    };
  }),
});
