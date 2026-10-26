/** Fila de reservas do escritório (server/lotes/filaReservas.ts) — só administrador e secretária */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const F = () => import("../lotes/filaReservas");

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "A fila de reservas é do escritório." });
}
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "FilaErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

export const reservasRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return comErro(async () => (await F()).listarReservas()); }),
  corretores: protectedProcedure.input(z.object({ empreendimentoId: z.number().int() })).query(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await F()).corretoresHabilitados(input.empreendimentoId));
  }),
  acao: protectedProcedure.input(z.object({
    loteId: z.number().int(),
    acao: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("reatribuir"), corretorId: z.number().int() }),
      z.object({ tipo: z.literal("assumir") }),
      z.object({ tipo: z.literal("prorrogar") }),
      z.object({ tipo: z.literal("liberar"), motivo: z.string().trim().min(3).max(300) }),
    ]),
  })).mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await F()).acaoReserva(input.loteId, input.acao, ctx.user.id)); }),
});
