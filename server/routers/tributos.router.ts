/** Simulador de CBS/IBS no contrato (calculadoras oficiais da Receita, via ponte do AvalieImob) — só o administrador */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

const soAdmin = (ctx: any) => {
  if (ctx.permissoes?.perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Simulação de CBS/IBS: só o administrador" });
};
const P = () => import("../receitaRtc/ponte");
const CODIGO: Record<number, TRPCError["code"]> = { 400: "BAD_REQUEST", 404: "NOT_FOUND", 409: "CONFLICT", 412: "PRECONDITION_FAILED", 422: "BAD_REQUEST" };
async function rodar<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    if (e?.name === "RtcErro") throw new TRPCError({ code: CODIGO[e.status] ?? "INTERNAL_SERVER_ERROR", message: e.message });
    throw e;
  }
}
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const tributosRouter = router({
  /** O bloco só aparece com a integração configurada e o simulador ligado no AvalieImob */
  situacao: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.permissoes?.perfil !== "admin") return { disponivel: false, motivo: "perfil" };
    return (await P()).situacao();
  }),
  doContrato: protectedProcedure.input(z.object({ contratoId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    soAdmin(ctx);
    return rodar(async () => (await P()).doContrato(input.contratoId));
  }),
  classificacoes: protectedProcedure.input(z.object({ nbs: z.string().max(20), data: dia })).mutation(async ({ ctx, input }) => {
    soAdmin(ctx);
    return rodar(async () => (await P()).classificacoes(input.nbs, input.data));
  }),
  simular: protectedProcedure.input(z.object({
    contratoId: z.number().int().positive(), dataOperacao: dia, valor: z.string().max(30),
    nbs: z.string().max(20), cst: z.string().max(5), cClassTrib: z.string().max(10),
  })).mutation(async ({ ctx, input }) => {
    soAdmin(ctx);
    return rodar(async () => (await P()).simularContrato({ id: ctx.user.id, name: ctx.user.name }, input));
  }),
});
