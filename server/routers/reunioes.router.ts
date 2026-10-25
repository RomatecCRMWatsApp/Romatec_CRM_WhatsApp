/** Reuniões com clientes: gravar, transcrever e resumir (server/reunioes/servico.ts) */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { TIPOS_REUNIAO, type TipoReuniao } from "../../shared/reunioes";

const tipoZ = z.enum(TIPOS_REUNIAO.map(t => t[0]) as [TipoReuniao, ...TipoReuniao[]]);

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "ReuniaoErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}
const quem = (ctx: any) => ({ id: ctx.user.id as number, permissoes: ctx.permissoes });
const S = () => import("../reunioes/servico");

export const reunioesRouter = router({
  /** Serviços de IA configurados no servidor (sem revelar chaves) */
  status: protectedProcedure.query(async () => {
    const { transcricaoDisponivel, resumoDisponivel } = await import("../reunioes/ia");
    return { transcricao: transcricaoDisponivel(), resumo: resumoDisponivel() };
  }),
  listar: protectedProcedure.input(z.object({ leadId: z.number().int().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => comErro(async () => (await S()).listarReunioes(quem(ctx), { leadId: input?.leadId ?? null }))),
  buscarLeads: protectedProcedure.input(z.object({ busca: z.string().max(80) }))
    .query(async ({ ctx, input }) => comErro(async () => (await S()).buscarLeads(quem(ctx), input.busca))),
  obter: protectedProcedure.input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => comErro(async () => (await S()).obterReuniao(input.id, quem(ctx)))),
  criar: protectedProcedure.input(z.object({ leadId: z.number().int().nullable().optional(), titulo: z.string().trim().min(2).max(160), tipo: tipoZ, consentimento: z.boolean() }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).criarReuniao(input, quem(ctx)))),
  finalizar: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).finalizarReuniao(input.id, quem(ctx)))),
  atualizar: protectedProcedure.input(z.object({ id: z.number().int(), titulo: z.string().trim().min(2).max(160).optional(), leadId: z.number().int().nullable().optional() }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).atualizarReuniao(input.id, { titulo: input.titulo, leadId: input.leadId }, quem(ctx)))),
  excluir: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).excluirReuniao(input.id, quem(ctx)))),
});
