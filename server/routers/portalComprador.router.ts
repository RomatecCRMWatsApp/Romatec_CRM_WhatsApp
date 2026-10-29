/**
 * Vendas › Portal do comprador (escritório: administrador e secretária): chamados abertos pelos compradores em
 * /c/:codigo e o andamento da obra que aparece no portal (server/financeiro/portalComprador.ts).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const P = () => import("../financeiro/portalComprador");

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "O portal do comprador é do escritório." });
}
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "FinanceiroErro" || typeof e?.status === "number") {
      throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 413 || e.status === 415 || e.status === 400 ? "BAD_REQUEST" : e.status === 409 ? "CONFLICT" : "INTERNAL_SERVER_ERROR", message: e.message });
    }
    throw e;
  }
}

export const portalCompradorRouter = router({
  chamados: protectedProcedure.input(z.object({ status: z.enum(["aberto", "respondido", "fechado"]).nullable().optional() }).optional()).query(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await P()).listarChamados(input?.status ?? null));
  }),
  responder: protectedProcedure.input(z.object({ id: z.number().int(), resposta: z.string().trim().min(2).max(3000), fechar: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await P()).responderChamado(input.id, input.resposta, input.fechar, ctx.user.id));
  }),
  obra: protectedProcedure.input(z.object({ empreendimentoId: z.number().int() })).query(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await P()).listarObra(input.empreendimentoId));
  }),
  publicarObra: protectedProcedure.input(z.object({
    empreendimentoId: z.number().int(), titulo: z.string().trim().min(3).max(160), texto: z.string().trim().min(5).max(5000),
    percentual: z.number().min(0).max(100).nullable(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fotoBase64: z.string().max(18_000_000).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await P()).publicarObra(input, ctx.user.id));
  }),
  excluirObra: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await P()).excluirObra(input.id));
  }),
});
