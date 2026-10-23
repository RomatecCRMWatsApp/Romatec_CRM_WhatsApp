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

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export const financeiroRouter = router({
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
