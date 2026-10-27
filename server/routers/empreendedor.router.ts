/**
 * Painel do empreendedor (ex.: proprietária do Bom Jardims): só números e gráficos
 * dos leads do empreendimento dele — sem nome, telefone ou conversa (LGPD) e sem
 * gasto/custo — e as artes LIBERADAS para baixar e postar.
 */
import { and, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { leadQualifications, leadCampanhas, materiais, empreendimentos, lotes, leadEventos } from "../../drizzle/schema";
import { montarRelatorio } from "../leads/relatorio";
import { perfilDe } from "../../shared/equipe";
import { agruparMateriais } from "../../shared/materiais";
import { serieLeadsPorDia } from "../leads/painelEmpreendedor";

async function contexto(ctx: any) {
  // Portal da empreendedora: só ela e o administrador (corretor e secretária veriam o financeiro dos compradores)
  const perfil = perfilDe(ctx.user);
  if (perfil !== "empreendedor" && perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "O portal do empreendedor é só da empreendedora e do administrador." });
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  // Admin pode abrir o painel para ver como o empreendedor vê (Bom Jardims por padrão)
  const slug: string | null = perfil === "empreendedor" ? ctx.user.empreendimentoSlug : (ctx.user.empreendimentoSlug || "bom-jardims");
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

  /**
   * Financeiro do empreendimento: contratos (recebido, em aberto, vencido) e os boletos/parcelas emitidos.
   * Só do empreendimento do empreendedor; sem telefone do comprador.
   */
  financeiro: protectedProcedure.query(async ({ ctx }) => {
    const { db, emp } = await contexto(ctx);
    if (!emp) return { totais: null, contratos: [], boletos: [], hoje: null };
    const { extratoCompradores } = await import("../financeiro/relatorios");
    const { rotuloParcela } = await import("../financeiro/dados");
    const { contratos, cobrancas } = await import("../../drizzle/schema");
    const { inArray } = await import("drizzle-orm");
    const meus: any[] = await db.select({ id: contratos.id, numero: contratos.numero, loteCodigo: contratos.loteCodigo, status: contratos.status })
      .from(contratos).where(eq(contratos.empreendimentoId, emp.id));
    const ids = new Set(meus.map(c => Number(c.id)));
    const ext = await extratoCompradores();
    const linhas = ext.linhas.filter(l => ids.has(Number(l.contratoId)));
    const soma = (k: "contratado" | "recebido" | "emAberto" | "vencido" | "aVencer") => Math.round(linhas.reduce((s, l) => s + l[k], 0) * 100) / 100;
    const cobs: any[] = ids.size ? await db.select().from(cobrancas).where(inArray(cobrancas.contratoId, Array.from(ids))) : [];
    const C = new Map(meus.map(c => [Number(c.id), c]));
    const L = new Map(linhas.map(l => [Number(l.contratoId), l.comprador]));
    const boletos = cobs
      .filter(x => x.tipo !== "antecipacao" && x.status !== "cancelada" && x.status !== "prevista")
      .map(x => ({
        id: x.id, contrato: C.get(Number(x.contratoId))?.numero ?? "", lote: C.get(Number(x.contratoId))?.loteCodigo ?? "", comprador: L.get(Number(x.contratoId)) ?? "—",
        parcela: rotuloParcela({ tipo: x.tipo, numero: Number(x.numero), total: Number(x.total) }), vencimento: String(x.vencimento).slice(0, 10),
        valor: Number(x.valor), status: x.status as string, pagoEm: x.pagoEm ? String(x.pagoEm).slice(0, 10) : null, valorPago: x.valorPago != null ? Number(x.valorPago) : null,
        boleto: x.bankSlipUrl ?? null,
      }))
      .sort((a, b) => b.vencimento.localeCompare(a.vencimento))
      .slice(0, 300);
    return {
      hoje: ext.hoje,
      totais: { contratos: linhas.length, contratado: soma("contratado"), recebido: soma("recebido"), emAberto: soma("emAberto"), vencido: soma("vencido"), aVencer: soma("aVencer"),
        emAtraso: linhas.filter(l => l.situacao === "EM_ATRASO").length, quitados: linhas.filter(l => l.situacao === "QUITADO").length },
      contratos: linhas.map(l => ({ contratoId: l.contratoId, numero: l.contratoNumero, lote: l.loteCodigo, comprador: l.comprador, contratado: l.contratado, recebido: l.recebido,
        vencido: l.vencido, pctPago: l.pctPago, situacao: l.situacao, parcelasPagas: l.parcelasPagas, parcelasTotal: l.parcelasTotal, proximoVencimento: l.proximoVencimento, diasAtraso: l.diasAtraso })),
      boletos,
    };
  }),

  /** Artes liberadas do empreendimento (as bloqueadas — preço/condições — não aparecem) */
  materiais: protectedProcedure.query(async ({ ctx }) => {
    const { db, slug, emp } = await contexto(ctx);
    const rows: any[] = await db.select().from(materiais).where(and(eq(materiais.empreendimentoSlug, slug), eq(materiais.liberado, true)));
    return agruparMateriais(rows, { imoveis: new Map(), empreendimentos: new Map([[slug, emp?.nome || slug]]) })[0]?.itens ?? [];
  }),
});
