/**
 * Painel do empreendedor (ex.: proprietária do Bom Jardims): só números e gráficos
 * dos leads do empreendimento dele — sem nome, telefone ou conversa (LGPD) e sem
 * gasto/custo — e as artes LIBERADAS para baixar e postar.
 */
import { and, eq, gte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { leadQualifications, leadCampanhas, materiais, empreendimentos, lotes, leadEventos } from "../../drizzle/schema";
import { montarRelatorio } from "../leads/relatorio";
import { perfilDe } from "../../shared/equipe";
import { agruparMateriais } from "../../shared/materiais";
import { serieLeadsPorDia } from "../leads/painelEmpreendedor";

async function contexto(ctx: any) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  // Admin pode abrir o painel para ver como o empreendedor vê (Bom Jardims por padrão)
  const slug: string | null = perfilDe(ctx.user) === "empreendedor" ? ctx.user.empreendimentoSlug : (ctx.user.empreendimentoSlug || "bom-jardims");
  if (!slug) throw new Error("Seu acesso não tem empreendimento definido. Fale com o administrador.");
  const [emp]: any[] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  return { db, slug, emp };
}

export const empreendedorRouter = router({
  painel: protectedProcedure.query(async ({ ctx }) => {
    const { db, slug, emp } = await contexto(ctx);
    const leads: any[] = await db.select({
      id: leadQualifications.id, funil: leadQualifications.funil, origem: leadQualifications.origem,
      origemCanal: leadQualifications.origemCanal, origemCampanhaId: leadQualifications.origemCampanhaId,
      ultimoCanal: leadQualifications.ultimoCanal, ultimaCampanhaId: leadQualifications.ultimaCampanhaId,
      propertyId: leadQualifications.propertyId, etapa: leadQualifications.etapa, stage: leadQualifications.stage,
      score: leadQualifications.score, slots: leadQualifications.slots, createdAt: leadQualifications.createdAt,
      loteCodigo: leadQualifications.loteCodigo,
    }).from(leadQualifications).where(eq(leadQualifications.empreendimentoSlug, slug));
    const campanhas: any[] = await db.select({ id: leadCampanhas.id, codigo: leadCampanhas.codigo, nome: leadCampanhas.nome, canal: leadCampanhas.canal, gastoTotal: leadCampanhas.gastoTotal })
      .from(leadCampanhas).where(eq(leadCampanhas.empreendimentoSlug, slug));
    const desde = new Date(Date.now() - 90 * 24 * 3600_000);
    const eventos: any[] = campanhas.length
      ? (await db.select({ tipo: leadEventos.tipo, campanhaId: leadEventos.campanhaId }).from(leadEventos).where(gte(leadEventos.createdAt, desde)))
          .filter((e: any) => campanhas.some(c => c.id === e.campanhaId))
      : [];
    const rel = montarRelatorio({ leads, campanhas, interesses: new Map(), eventos, mensagens: [], imoveis: [] });
    const semCusto = <T extends Record<string, any>>(r: T) => { const { gasto: _g, custoPorQuente: _c, ...resto } = r; return resto; };

    // Situação das chácaras (o mapa já é público, sem preço)
    let lotesResumo: Record<string, number> | null = null;
    if (emp?.id) {
      const ls: any[] = await db.select({ status: lotes.status, comercializavel: lotes.comercializavel }).from(lotes).where(eq(lotes.empreendimentoId, emp.id));
      lotesResumo = {};
      for (const l of ls) if (l.comercializavel !== false && l.comercializavel !== 0) lotesResumo[l.status] = (lotesResumo[l.status] || 0) + 1;
    }
    // Chácaras mais procuradas (código do lote clicado no mapa) — sem quem procurou
    const porLote = new Map<string, number>();
    for (const l of leads) if (l.loteCodigo) porLote.set(l.loteCodigo, (porLote.get(l.loteCodigo) || 0) + 1);

    return {
      empreendimento: { slug, nome: emp?.nome || slug },
      total: semCusto(rel.total),
      porTipo: rel.porTipo.map(semCusto),
      porCanal: rel.porCanal.map(semCusto),
      porCampanha: rel.porCampanha.filter(c => c.campanhaId != null || c.leads).map(semCusto),
      porDia: serieLeadsPorDia(leads.map(l => l.createdAt), 30),
      lotes: lotesResumo,
      lotesMaisProcurados: Array.from(porLote, ([codigo, n]) => ({ codigo, leads: n })).sort((a, b) => b.leads - a.leads).slice(0, 10),
    };
  }),

  /** Artes liberadas do empreendimento (as bloqueadas — preço/condições — não aparecem) */
  materiais: protectedProcedure.query(async ({ ctx }) => {
    const { db, slug, emp } = await contexto(ctx);
    const rows: any[] = await db.select().from(materiais).where(and(eq(materiais.empreendimentoSlug, slug), eq(materiais.liberado, true)));
    return agruparMateriais(rows, { imoveis: new Map(), empreendimentos: new Map([[slug, emp?.nome || slug]]) })[0]?.itens ?? [];
  }),
});
