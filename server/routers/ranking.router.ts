/** Ranking de vendas por corretor + campanha (server/ranking.ts): ver no escopo; prazo só o administrador com a senha */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { prazoSchema } from "../../shared/ranking";

const R = () => import("../ranking");

const escopo = (ctx: any) => ({ perfil: ctx.permissoes?.perfil ?? null, acessos: ctx.permissoes?.acessos ?? [] });
const ip = (ctx: any) => ctx.req?.ip ?? null;

async function tratar<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    // RankingErro (status) e ContratoErro do step-up de senha (codigo + status)
    if (e?.name === "RankingErro" || e?.codigo) {
      const s = Number(e.status);
      const code = s === 404 ? "NOT_FOUND" : s === 403 ? "FORBIDDEN" : s === 409 ? "CONFLICT" : s === 429 ? "TOO_MANY_REQUESTS" : s >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}
const filtro = z.object({ empreendimentoId: z.number().int().positive().nullable() });

export const rankingRouter = router({
  empreendimentos: protectedProcedure.query(({ ctx }) => tratar(async () => (await R()).empreendimentosVisiveis(escopo(ctx)))),
  /** empreendimentoId nulo = todos os empreendimentos que o usuário acessa */
  classificacao: protectedProcedure.input(filtro).query(({ ctx, input }) => tratar(async () => (await R()).ranking(escopo(ctx), input.empreendimentoId))),
  definirPrazo: protectedProcedure.input(prazoSchema).mutation(({ ctx, input }) => tratar(async () => (await R()).definirPrazo(ctx.user as any, input, ip(ctx)))),
  enviarWhatsApp: protectedProcedure.input(filtro.extend({ destino: z.string().regex(/^55\d{10,11}$/) }))
    .mutation(({ ctx, input }) => {
      if (!["admin", "secretario"].includes(ctx.permissoes?.perfil ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador e a secretária enviam o ranking pelo WhatsApp." });
      return tratar(async () => (await R()).enviarWhatsApp(escopo(ctx), input.empreendimentoId, input.destino));
    }),
});
