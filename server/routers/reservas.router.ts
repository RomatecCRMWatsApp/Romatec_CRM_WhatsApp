/** Fila de reservas do escritório (server/lotes/filaReservas.ts) — só administrador e secretária */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { exigirLead } from "../permissoes";

const F = () => import("../lotes/filaReservas");
const E = () => import("../lotes/filaEspera");

/** Lead visível para quem pede (corretor: só os dele) */
async function exigirLeadDaFila(ctx: any, leadId: number) {
  const { getDb } = await import("../db");
  const { leadQualifications } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const d: any = await getDb();
  const [l]: any[] = d ? await d.select({ responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1) : [];
  if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });
  exigirLead(ctx.permissoes, ctx.user.id, l);
}

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "A fila de reservas é do escritório." });
}
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "FilaErro" || e?.name === "FilaEsperaErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

export const reservasRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return comErro(async () => (await F()).listarReservas()); }),
  corretores: protectedProcedure.input(z.object({ empreendimentoId: z.number().int() })).query(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => (await F()).corretoresHabilitados(input.empreendimentoId));
  }),
  acao: protectedProcedure.input(z.object({
    loteId: z.number().int(),
    acao: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("reatribuir"), corretorId: z.number().int() }),
      z.object({ tipo: z.literal("assumir") }),
      z.object({ tipo: z.literal("prorrogar") }),
      z.object({ tipo: z.literal("liberar"), motivo: z.string().trim().min(3).max(300) }),
    ]),
  })).mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await F()).acaoReserva(input.loteId, input.acao, ctx.user.id)); }),
  // ─── Fila de espera por chácara (server/lotes/filaEspera.ts) ───
  /** Tela do lead: chácaras ocupadas do empreendimento e as filas em que o lead está */
  filaDoLead: protectedProcedure.input(z.object({ leadId: z.number().int() })).query(async ({ ctx, input }) => {
    await exigirLeadDaFila(ctx, input.leadId);
    return comErro(async () => { const r = await (await E()).filaDoLead(input.leadId); return { empreendimento: r.empreendimento, ocupadas: r.ocupadas, minhas: r.minhas }; });
  }),
  entrarFila: protectedProcedure.input(z.object({ leadId: z.number().int(), loteId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await exigirLeadDaFila(ctx, input.leadId);
    return comErro(async () => (await E()).entrarNaFila(input.leadId, input.loteId, ctx.user.id));
  }),
  encerrarFila: protectedProcedure.input(z.object({ id: z.number().int(), leadId: z.number().int().nullable(), status: z.enum(["convertido", "desistiu"]) })).mutation(async ({ ctx, input }) => {
    if (input.leadId) await exigirLeadDaFila(ctx, input.leadId); else escritorio(ctx);
    return comErro(async () => (await E()).encerrarNaFila(input.id, input.status, input.leadId));
  }),
  /** Escritório: todas as filas ativas */
  filas: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return comErro(async () => (await E()).listarFilas()); }),
});
