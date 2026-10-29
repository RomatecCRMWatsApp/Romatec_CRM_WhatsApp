/** Admin › Integrações: portais (feed e leads do Canal Pro) e chaves da API para parceiros — só o administrador */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

function admin(ctx: any) {
  if (ctx.permissoes?.perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador mexe nas integrações." });
}

export const integracoesRouter = router({
  portais: protectedProcedure.query(async ({ ctx }) => {
    admin(ctx);
    const P = await import("../portais");
    const { anuncios, fora } = await P.anunciosDoFeed();
    return { feed: P.linkFeed(), webhook: P.linkWebhook(), anuncios: anuncios.map(a => ({ id: a.id, titulo: a.titulo, preco: a.preco, url: a.url })), fora };
  }),
  chaves: protectedProcedure.query(async ({ ctx }) => {
    admin(ctx);
    return (await import("../apiParceiros")).listarChaves();
  }),
  criarChave: protectedProcedure.input(z.object({
    nome: z.string().trim().min(2).max(120), escopos: z.array(z.enum(["lotes:ler", "imoveis:ler", "leads:criar"])).min(1), corretorId: z.number().int().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    admin(ctx);
    return (await import("../apiParceiros")).criarChave(input, ctx.user.id);
  }),
  alterarChave: protectedProcedure.input(z.object({ id: z.number().int(), ativo: z.boolean() })).mutation(async ({ ctx, input }) => {
    admin(ctx);
    return (await import("../apiParceiros")).alterarChave(input.id, input.ativo);
  }),
});
