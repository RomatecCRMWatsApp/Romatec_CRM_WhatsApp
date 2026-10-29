/** Contrato › Registro em cartório (server/cartorio.ts) — administrador e secretária */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { STATUS_REGISTRO } from "../../shared/cartorio";

const K = () => import("../cartorio");
function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(String(perfilDe(ctx.user as any) ?? ""))) throw new TRPCError({ code: "FORBIDDEN", message: "O registro em cartório é do escritório." });
}
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

export const cartorioRouter = router({
  situacao: protectedProcedure.input(z.object({ contratoId: z.number().int() })).query(async ({ ctx, input }) => { escritorio(ctx); return (await K()).situacaoRegistro(input.contratoId); }),
  atualizar: protectedProcedure.input(z.object({
    contratoId: z.number().int(), status: z.enum(STATUS_REGISTRO), cartorio: z.string().max(200).nullable().optional(), protocolo: z.string().max(60).nullable().optional(),
    dataProtocolo: data, exigencias: z.string().max(3000).nullable().optional(), matricula: z.string().max(40).nullable().optional(),
    emolumentos: z.number().min(0).max(1_000_000).nullable().optional(), registradoEm: data, observacoes: z.string().max(3000).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const { contratoId, ...dados } = input;
    try { return await (await K()).atualizarRegistro(contratoId, dados, { id: ctx.user.id, nome: (ctx.user as any).name ?? null }); }
    catch (e: any) { if (e?.name === "CartorioErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", message: e.message }); throw e; }
  }),
});
