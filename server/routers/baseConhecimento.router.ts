/** Ajuda › Base de conhecimento: toda a equipe lê; o administrador cria, edita e exclui */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { CATEGORIAS_ARTIGO, PUBLICOS_ARTIGO } from "../../shared/baseConhecimento";

const S = () => import("../baseConhecimento");
const perfil = (ctx: any) => String(perfilDe(ctx.user as any) ?? "");
function exigirAdmin(ctx: any) {
  if (perfil(ctx) !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador edita a base de conhecimento." });
}
async function rodar<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name !== "ConhecimentoErro") throw e;
    throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
  }
}
const dadosZ = z.object({
  titulo: z.string().max(160), categoria: z.enum(CATEGORIAS_ARTIGO), publico: z.enum(PUBLICOS_ARTIGO),
  conteudo: z.string().max(60_000), ordem: z.number().int().min(0).max(9999).optional(), ativo: z.boolean().optional(),
});

export const baseConhecimentoRouter = router({
  lista: protectedProcedure.input(z.object({ incluirInativos: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => rodar(async () => (await S()).listarArtigos(perfil(ctx), !!input?.incluirInativos))),
  salvar: protectedProcedure.input(z.object({ id: z.number().int().positive().nullable(), dados: dadosZ })).mutation(async ({ ctx, input }) => {
    exigirAdmin(ctx);
    return rodar(async () => (await S()).salvarArtigo(input.id, input.dados, ctx.user.id));
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    exigirAdmin(ctx);
    return rodar(async () => (await S()).excluirArtigo(input.id));
  }),
});
