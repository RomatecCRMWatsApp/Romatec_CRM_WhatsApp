/** Convites de reunião com confirmação de presença (server/convites.ts): criar e enviar só o escritório; ver, no escopo */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { convidadoSchema, reuniaoSchema } from "../../shared/convites";

const C = () => import("../convites");

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(ctx.permissoes?.perfil ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador e a secretária criam e enviam convites de reunião." });
}
const escopo = (ctx: any) => ({ perfil: ctx.permissoes?.perfil ?? null, acessos: ctx.permissoes?.acessos ?? [] });
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "ConviteErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}
const id = z.object({ id: z.number().int().positive() });

export const convitesRouter = router({
  listar: protectedProcedure.input(z.object({ empreendimentoId: z.number().int().positive().nullable().optional() }).optional())
    .query(({ ctx, input }) => comErro(async () => (await C()).listarReunioes(escopo(ctx), { empreendimentoId: input?.empreendimentoId ?? null }))),
  empreendimentos: protectedProcedure.query(({ ctx }) => comErro(async () => (await C()).empreendimentosVisiveis(escopo(ctx)))),
  detalhe: protectedProcedure.input(id).query(({ ctx, input }) => comErro(async () => (await C()).detalheReuniao(input.id, escopo(ctx)))),
  criar: protectedProcedure.input(reuniaoSchema).mutation(({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).criarReuniao(input, ctx.user.id)); }),
  editar: protectedProcedure.input(reuniaoSchema.extend({ id: z.number().int().positive() })).mutation(({ ctx, input }) => {
    escritorio(ctx);
    const { id: rid, ...dados } = input;
    return comErro(async () => (await C()).editarReuniao(rid, dados));
  }),
  cancelar: protectedProcedure.input(id).mutation(({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).cancelarReuniao(input.id)); }),
  adicionarConvidados: protectedProcedure.input(z.object({ reuniaoId: z.number().int().positive(), convidados: z.array(convidadoSchema).min(1).max(500) }))
    .mutation(({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).adicionarConvidados(input.reuniaoId, input.convidados)); }),
  removerConvidado: protectedProcedure.input(id).mutation(({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).removerConvidado(input.id)); }),
  /** Sem convidadoIds: manda para todos que ainda não responderam */
  enviar: protectedProcedure.input(z.object({ reuniaoId: z.number().int().positive(), convidadoIds: z.array(z.number().int()).max(500).optional() }))
    .mutation(({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).enviarConvites(input.reuniaoId, input.convidadoIds)); }),
  removerFolder: protectedProcedure.input(id).mutation(({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).salvarFolder(input.id, null)); }),
});
