/** Vendas › Imobiliárias parceiras (server/parceiros.ts): escritório cadastra e acompanha; só o administrador edita */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const P = () => import("../parceiros");
function exigir(ctx: any, admin = false) {
  const p = String(perfilDe(ctx.user as any) ?? "");
  if (admin ? p !== "admin" : !["admin", "secretario"].includes(p)) throw new TRPCError({ code: "FORBIDDEN", message: admin ? "Só o administrador edita as parceiras." : "Área do escritório." });
}

export const parceirasRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => { exigir(ctx); return (await P()).listarParceiras(); }),
  criar: protectedProcedure.input(z.any()).mutation(async ({ ctx, input }) => {
    exigir(ctx, true);
    const M = await P();
    const d = M.dadosParceiraSchema.parse(input);
    return M.criarParceira(d, ctx.user.id);
  }),
  atualizar: protectedProcedure.input(z.object({ id: z.number().int(), dados: z.any() })).mutation(async ({ ctx, input }) => {
    exigir(ctx, true);
    const M = await P();
    return M.atualizarParceira(input.id, M.dadosParceiraSchema.partial().parse(input.dados));
  }),
  novoLink: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => { exigir(ctx, true); return (await P()).novoLinkParceira(input.id); }),
});
