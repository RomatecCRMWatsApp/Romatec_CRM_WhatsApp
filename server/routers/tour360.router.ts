/** Tour 360° (server/tour360.ts): administrador e secretária cadastram; a lista é a mesma das páginas públicas */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const T = () => import("../tour360");
function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(String(perfilDe(ctx.user as any) ?? ""))) throw new TRPCError({ code: "FORBIDDEN", message: "O tour 360° é cadastrado pelo escritório." });
}
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "TourErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

export const tour360Router = router({
  lista: protectedProcedure.input(z.object({ slug: z.string().max(80) })).query(async ({ input }) => (await T()).toursDe(input.slug)),
  adicionar: protectedProcedure.input(z.object({
    slug: z.string().max(80), loteCodigo: z.string().regex(/^[A-Za-z]\d{2}$/).nullable(), titulo: z.string().trim().min(2).max(120), base64: z.string().max(42_000_000),
  })).mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await T()).adicionarTour(input, ctx.user.id)); }),
  excluir: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await T()).excluirTour(input.id)); }),
});
