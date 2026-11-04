/** Leads › Distribuição: encaminhamento manual de leads e relatório dos encaminhamentos (administrador e secretária) */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { exigirDistribuicao } from "../permissoes";

const erro = (e: any): never => {
  if (e?.name === "DistribuicaoErro") throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
  throw e;
};
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtroRelatorio = z.object({ de: dia, ate: dia, paraId: z.number().int().nullable().optional(), porId: z.number().int().nullable().optional(), origem: z.enum(["manual", "automatico"]).nullable().optional() });

export const distribuicaoRouter = router({
  equipe: protectedProcedure.query(async ({ ctx }) => {
    exigirDistribuicao(ctx.permissoes);
    return (await import("../leads/distribuicao")).equipe();
  }),
  leads: protectedProcedure
    .input(z.object({ filtro: z.enum(["sem_responsavel", "aguardando", "recentes"]), busca: z.string().max(80).default("") }))
    .query(async ({ input, ctx }) => {
      exigirDistribuicao(ctx.permissoes);
      return (await import("../leads/distribuicao")).leadsParaDistribuir(input.filtro, input.busca).catch(erro);
    }),
  encaminhar: protectedProcedure
    .input(z.object({ leadIds: z.array(z.number().int().positive()).min(1).max(200), paraId: z.number().int().positive(), observacao: z.string().max(300).nullable().optional() }))
    .mutation(async ({ input, ctx }) => {
      exigirDistribuicao(ctx.permissoes);
      const { encaminharManual } = await import("../leads/distribuicao");
      return encaminharManual(input.leadIds, input.paraId, { id: ctx.user.id, nome: String((ctx.user as any).name ?? "o escritório") }, input.observacao).catch(erro);
    }),
  relatorio: protectedProcedure.input(filtroRelatorio).query(async ({ input, ctx }) => {
    exigirDistribuicao(ctx.permissoes);
    return (await import("../leads/distribuicao")).relatorioEncaminhamentos(input).catch(erro);
  }),
  csv: protectedProcedure.input(filtroRelatorio).mutation(async ({ input, ctx }) => {
    exigirDistribuicao(ctx.permissoes);
    const m = await import("../leads/distribuicao");
    const r = await m.relatorioEncaminhamentos(input).catch(erro);
    return { nome: `encaminhamentos_${input.de}_a_${input.ate}.csv`, conteudo: m.csvRelatorio(r.itens) };
  }),
});
