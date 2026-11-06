/**
 * Controle de acessos dos corretores: administrador e secretária veem quem está ativo, pago e usando o sistema,
 * e ativam/desativam o login e liberam/bloqueiam a licença (server/controleAcessos.ts). Fica fora de "equipe.*"
 * (que é só do administrador) para a secretária poder usar.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const C = () => import("../controleAcessos");
const dataZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "Área restrita ao escritório." });
}

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "AcessoErro" || e?.name === "SaasErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}

const ipDe = (ctx: any): string | null => {
  const fwd = String(ctx.req?.headers?.["x-forwarded-for"] ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || ctx.req?.socket?.remoteAddress || null;
};

export const controleAcessosRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return comErro(async () => (await C()).listarControleAcessos()); }),

  historico: protectedProcedure.input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).historicoAcessos(input.id)); }),

  definirLogin: protectedProcedure.input(z.object({ id: z.number().int(), ativo: z.boolean(), motivo: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => {
      escritorio(ctx);
      if (input.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode mudar o seu próprio acesso" });
      return comErro(async () => (await C()).definirLoginAtivo(input.id, input.ativo, input.motivo, ctx.user.id, ipDe(ctx)));
    }),

  definirLicenca: protectedProcedure.input(z.object({ id: z.number().int(), tipo: z.enum(["liberar", "bloquear"]), ate: dataZ.nullable().optional(), motivo: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).definirLicenca(input.id, input, ctx.user.id)); }),

  desconectar: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).desconectar(input.id, ctx.user.id)); }),
});
