/**
 * Renegociação de parcelas por termo aditivo (server/financeiro/renegociacao.ts): simular e listar — administrador e
 * secretária; gerar, cancelar e reemitir — só o administrador (gerar pede a senha, como o cancelamento).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const R = () => import("../financeiro/renegociacao");
const pedido = z.object({
  contratoId: z.number().int(), ids: z.array(z.number().int()).min(1).max(240), desconto: z.number().min(0).max(10_000_000).default(0),
  parcelas: z.number().int().min(1).max(120), taxaMensal: z.number().min(0).max(0.05), primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function exigir(ctx: any, perfis: string[]) {
  if (!perfis.includes(String(perfilDe(ctx.user as any) ?? ""))) throw new TRPCError({ code: "FORBIDDEN", message: perfis.length === 1 ? "Só o administrador renegocia parcelas." : "Renegociação é do escritório." });
}
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "FinanceiroErro" || e?.name === "ContratoErro" || typeof e?.status === "number") {
      throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : e.status === 401 || e.status === 403 ? "FORBIDDEN" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    }
    throw e;
  }
}

export const renegociacaoRouter = router({
  simular: protectedProcedure.input(pedido).query(async ({ ctx, input }) => {
    exigir(ctx, ["admin", "secretario"]);
    const { contratoId, ...p } = input;
    return comErro(async () => (await R()).simularRenegociacao(contratoId, p));
  }),
  criar: protectedProcedure.input(pedido.extend({ senha: z.string().min(1).max(200) })).mutation(async ({ ctx, input }) => {
    exigir(ctx, ["admin"]);
    const { contratoId, senha, ...p } = input;
    return comErro(async () => {
      const { exigirAdminComSenha } = await import("../contratos/cancelamento");
      await exigirAdminComSenha(ctx.user as any, senha, "renegociar", { contratoId });
      return (await R()).criarAditivo(contratoId, p, ctx.user.id);
    });
  }),
  lista: protectedProcedure.input(z.object({ contratoId: z.number().int() })).query(async ({ ctx, input }) => {
    exigir(ctx, ["admin", "secretario"]);
    return comErro(async () => (await R()).aditivosDo(input.contratoId));
  }),
  cancelar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    exigir(ctx, ["admin"]);
    return comErro(async () => (await R()).cancelarAditivo(input.id, ctx.user.id));
  }),
  reenviar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    exigir(ctx, ["admin", "secretario"]);
    return comErro(async () => (await R()).reenviarLink(input.id));
  }),
  emitir: protectedProcedure.input(z.object({ contratoId: z.number().int() })).mutation(async ({ ctx, input }) => {
    exigir(ctx, ["admin"]);
    return comErro(async () => { const falhas: string[] = []; const emitidas = await (await R()).emitirRenegociadas(input.contratoId, falhas); return { emitidas, falhas }; });
  }),
});
