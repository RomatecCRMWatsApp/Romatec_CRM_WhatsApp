/** Leads › Caixa de entrada (server/caixaEntrada.ts): WhatsApp e Instagram numa lista só */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { leadsVisiveis } from "../permissoes";

const C = () => import("../caixaEntrada");
const canal = z.enum(["whatsapp", "instagram"]);
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "CaixaErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : e.status === 412 ? "PRECONDITION_FAILED" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}
const podeVer = (ctx: any) => (l: { responsavelId?: number | null }) => leadsVisiveis(ctx.permissoes, ctx.user.id, [l]).length > 0;

export const caixaEntradaRouter = router({
  conversas: protectedProcedure.query(async ({ ctx }) => comErro(async () =>
    (await C()).listarConversas(String(ctx.permissoes.perfil ?? ""), ctx.user.id, l => leadsVisiveis(ctx.permissoes, ctx.user.id, l)))),
  mensagens: protectedProcedure.input(z.object({ canal, id: z.number().int() })).query(async ({ ctx, input }) => comErro(async () =>
    (await C()).mensagensDa(input.canal, input.id, String(ctx.permissoes.perfil ?? ""), ctx.user.id, podeVer(ctx)))),
  responder: protectedProcedure.input(z.object({ canal, id: z.number().int(), texto: z.string().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    if ((ctx as any).verComo) throw new TRPCError({ code: "FORBIDDEN", message: "\"Ver como\" é só leitura" });
    return comErro(async () => (await C()).responder(input.canal, input.id, input.texto, { id: ctx.user.id, perfil: String(ctx.permissoes.perfil ?? "") }, podeVer(ctx)));
  }),
  vincularInstagram: protectedProcedure.input(z.object({ id: z.number().int(), telefone: z.string().min(10).max(25) })).mutation(async ({ ctx, input }) => comErro(async () =>
    (await C()).vincularInstagram(input.id, input.telefone, { id: ctx.user.id, perfil: String(ctx.permissoes.perfil ?? "") }))),
  assumirInstagram: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => comErro(async () =>
    (await C()).assumirInstagram(input.id, ctx.user.id))),
});
