/**
 * Exclusão definitiva de convite, lead e usuário (server/exclusao.ts): só o administrador, com a senha de login.
 * Contrato não tem exclusão (retenção legal).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

const E = () => import("../exclusao");
const alvo = z.object({ id: z.number().int(), senha: z.string().min(1).max(200) });

async function tratar<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.codigo) {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status === 429 ? "TOO_MANY_REQUESTS" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}
const ip = (ctx: any) => ctx.req?.ip ?? null;

export const exclusaoRouter = router({
  convite: protectedProcedure.input(alvo).mutation(({ ctx, input }) => tratar(async () => (await E()).excluirRecrutamento(input.id, ctx.user as any, input.senha, ip(ctx)))),
  lead: protectedProcedure.input(alvo).mutation(({ ctx, input }) => tratar(async () => (await E()).excluirLead(input.id, ctx.user as any, input.senha, ip(ctx)))),
  usuario: protectedProcedure.input(alvo).mutation(({ ctx, input }) => tratar(async () => (await E()).removerUsuario(input.id, ctx.user as any, input.senha, ip(ctx)))),
});
