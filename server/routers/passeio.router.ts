/** Passeio no Mapa: o corretor gera, lista e desativa os links públicos do empreendimento (server/passeio/servico.ts) */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

const S = () => import("../passeio/servico");
const CODIGO: Record<number, TRPCError["code"]> = { 400: "BAD_REQUEST", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT" };
async function rodar<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    if (e?.name === "PasseioErro") throw new TRPCError({ code: CODIGO[e.status] ?? "INTERNAL_SERVER_ERROR", message: e.message });
    throw e;
  }
}

export const passeioRouter = router({
  ligado: protectedProcedure.query(async () => ({ ligado: (await S()).passeioLigado() })),
  criar: protectedProcedure.input(z.object({
    empreendimentoId: z.number().int().positive(), loteId: z.number().int().positive().nullable().optional(),
    leadId: z.number().int().positive().nullable().optional(), mostrarPreco: z.boolean().default(true),
    dias: z.number().int().min(1).max(365).nullable().optional(),
  })).mutation(({ ctx, input }) => rodar(async () => (await S()).criarLink(ctx.permissoes as any, ctx.user.id, input))),
  listar: protectedProcedure.input(z.object({ empreendimentoId: z.number().int().positive() }))
    .query(({ ctx, input }) => rodar(async () => (await S()).listarLinks(ctx.permissoes as any, ctx.user.id, input.empreendimentoId))),
  desativar: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => rodar(async () => (await S()).desativarLink(ctx.permissoes as any, ctx.user.id, input.id))),
});
