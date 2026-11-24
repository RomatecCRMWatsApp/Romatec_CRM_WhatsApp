/** Campanhas do Instagram (vendas + seguidores): planejador com métricas, orçamento, projeção, textos e plano em PDF */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

const escritorio = (ctx: any) => {
  const p = ctx.permissoes?.perfil;
  if (p !== "admin" && p !== "secretario") throw new TRPCError({ code: "FORBIDDEN", message: "Campanhas: administrador e secretária" });
};
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dadosZ = z.object({
  nome: z.string().trim().min(2).max(120), cidade: z.string().trim().max(80), distancia: z.string().trim().max(40), beneficio: z.string().trim().max(160),
  unidades: z.string().trim().max(80), obra: z.string().trim().max(200), condicoes: z.array(z.string().trim().max(160)).max(6), visita: z.string().trim().max(120),
  corretor: z.string().trim().max(80), creci: z.string().trim().max(40), whatsapp: z.string().trim().max(20), perfil: z.string().trim().max(40), slogan: z.string().trim().max(120),
  hashtags: z.array(z.string().trim().max(40)).max(15), ganchoVendas: z.tuple([z.string().max(60), z.string().max(60)]), ganchoSeguidores: z.tuple([z.string().max(60), z.string().max(60)]),
});
const planoZ = z.object({
  anterior: z.object({ nome: z.string().max(80).optional(), gasto: z.number().min(0), resultados: z.number().min(0), alcance: z.number().min(0).nullable().optional(), impressoes: z.number().min(0).nullable().optional(), criativoVencedor: z.string().max(80).nullable().optional() }).nullable(),
  orcamento: z.number().positive().max(1_000_000), dias: z.number().int().min(1).max(90), inicio: dia, fracaoVendas: z.number().min(0).max(1),
  custoConversa: z.tuple([z.number().positive(), z.number().positive()]), custoSeguidor: z.tuple([z.number().positive(), z.number().positive()]),
  seguidoresAtuais: z.number().int().min(0).nullable().optional(), metaSeguidores: z.number().int().min(0).nullable().optional(),
  dados: dadosZ,
});

async function calcular(i: z.infer<typeof planoZ>) {
  const C = await import("../../shared/campanhasInstagram");
  try {
    return {
      anterior: i.anterior ? { ...i.anterior, metricas: C.metricasAnteriores(i.anterior) } : null,
      plano: C.planejar(i), textos: C.textosCampanha(i.dados), regras: C.REGRAS_CORTE, config: C.CONFIG_META,
    };
  } catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Dados inválidos" }); }
}

export const campanhasInstagramRouter = router({
  padrao: protectedProcedure.query(async ({ ctx }) => {
    escritorio(ctx);
    const C = await import("../../shared/campanhasInstagram");
    return { dados: C.PERFIL_BOM_JARDIMS, faixaConversa: C.FAIXA_CONVERSA, faixaSeguidor: C.FAIXA_SEGUIDOR,
      anterior: { nome: "BJ_WHATSAPP_2DIAS_2026", gasto: 777.2, resultados: 256, alcance: 23284, impressoes: 48199, criativoVencedor: "BJ_VIDEO_TEXTO_A" }, seguidoresAtuais: 1600, metaSeguidores: 10000 };
  }),
  calcular: protectedProcedure.input(planoZ).mutation(async ({ ctx, input }) => { escritorio(ctx); return calcular(input); }),
  pdf: protectedProcedure.input(planoZ).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const r = await calcular(input);
    const { planoCampanhaPdf } = await import("../campanhasInstagramPdf");
    return { base64: (await planoCampanhaPdf(input, r)).toString("base64"), nome: `Plano-campanhas-Instagram-${input.inicio}.pdf` };
  }),
  // ─── Leads qualificados (formulário com filtro + nota A/B/C) ───
  importarLeads: protectedProcedure.input(z.object({ csv: z.string().min(10).max(6_000_000), empreendimentoSlug: z.string().max(80).nullable().optional(), boasVindas: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      escritorio(ctx);
      const { importarCsvMeta } = await import("../leads/leadsQualificados");
      try { return await importarCsvMeta(input.csv, { empreendimentoSlug: input.empreendimentoSlug ?? null, boasVindas: input.boasVindas }); }
      catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: e?.message ?? "Arquivo inválido" }); }
    }),
  painelLeads: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return (await import("../leads/leadsQualificados")).painelQualificados(); }),
  leadsFaixa: protectedProcedure.input(z.object({ faixa: z.enum(["A", "B", "C"]) })).query(async ({ ctx, input }) => {
    escritorio(ctx);
    return (await import("../leads/leadsQualificados")).leadsDaFaixa(input.faixa);
  }),
  funil: protectedProcedure.input(z.object({
    verba: z.number().positive().max(10_000_000), unidades: z.number().int().positive().max(100_000), mesesMeta: z.number().positive().max(120),
    taxas: z.object({ cpl: z.number().positive(), qualif: z.number().min(0).max(1), visita: z.number().min(0).max(1), fecha: z.number().min(0).max(1) }).nullable().optional(),
  })).query(async ({ ctx, input }) => {
    escritorio(ctx);
    const F = await import("../../shared/leadScoreForm");
    const cen: Record<string, any> = input.taxas ? { informado: input.taxas } : F.CENARIOS_FUNIL;
    return Object.entries(cen).map(([nome, t]) => ({ nome, taxas: t, ...F.projetarFunil(input.verba, input.unidades, input.mesesMeta, t) }));
  }),
});
