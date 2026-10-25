/**
 * Recrutamento (server/recrutamento/servico.ts): só o administrador e a secretária. O formulário público usa o
 * token do link (sem login), com limite de tentativas por IP.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { PERFIS_RECRUTAMENTO, podeRecrutar } from "../../shared/recrutamento";
import { createRateLimiter } from "../lead-intake";

const S = () => import("../recrutamento/servico");
const permitePublico = createRateLimiter(60, 15 * 60 * 1000);

function exigirRecrutador(ctx: any) {
  if (!podeRecrutar(perfilDe(ctx.user as any))) throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador e a secretária usam o recrutamento." });
}

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "RecrutamentoErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status === 410 ? "NOT_FOUND"
        : e.status === 422 ? "UNPROCESSABLE_CONTENT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message, cause: e.campos ? Object.assign(new Error(e.message), { campos: e.campos }) : undefined });
    }
    throw e;
  }
}

const ipDe = (ctx: any) => {
  const fwd = String(ctx.req?.headers?.["x-forwarded-for"] ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || ctx.req?.socket?.remoteAddress || "x";
};

export const recrutamentoRouter = router({
  listar: protectedProcedure.query(async ({ ctx }) => { exigirRecrutador(ctx); return (await S()).listarRecrutamentos(); }),
  /** Empreendimentos para a convocação (nome e slug) */
  empreendimentos: protectedProcedure.query(async ({ ctx }) => {
    exigirRecrutador(ctx);
    const { getDb } = await import("../db");
    const { empreendimentos } = await import("../../drizzle/schema");
    const db: any = await getDb();
    return db ? (await db.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos)) as { slug: string; nome: string }[] : [];
  }),
  detalhe: protectedProcedure.input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).detalheRecrutamento(input.id)); }),
  criarConvite: protectedProcedure.input(z.object({
    perfil: z.enum(["corretor", "secretario"]), nome: z.string().trim().min(3).max(150), telefone: z.string().trim().min(10).max(25),
    empreendimentoSlug: z.string().max(80).nullable().optional(), enviar: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    exigirRecrutador(ctx);
    return comErro(async () => {
      const s = await S();
      const r = await s.criarConvite(input, ctx.user.id);
      const e = input.enviar ? await s.enviarConvite(r.id) : null;
      return { ...r, enviado: !!e?.enviado, texto: e?.texto ?? null };
    });
  }),
  enviarConvite: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).enviarConvite(input.id)); }),
  aprovar: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).aprovarRecrutamento(input.id, ctx.user as any)); }),
  recusar: protectedProcedure.input(z.object({ id: z.number().int(), motivo: z.string().trim().max(300).default(""), cancelar: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).recusarRecrutamento(input.id, input.motivo, ctx.user.id, input.cancelar)); }),
  reenviarAcesso: protectedProcedure.input(z.object({ usuarioId: z.number().int() }))
    .mutation(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).reenviarAcesso(input.usuarioId)); }),
  proprietario: protectedProcedure.input(z.object({ slug: z.string().max(80) }))
    .query(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).dadosDoProprietario(input.slug)); }),
  criarEmpreendedor: protectedProcedure.input(z.object({ slug: z.string().max(80), email: z.string().trim().max(160), telefone: z.string().max(25).nullable().optional() }))
    .mutation(async ({ ctx, input }) => { exigirRecrutador(ctx); return comErro(async () => (await S()).criarAcessoEmpreendedor(input, ctx.user as any)); }),

  // ─── Formulário público (link) ───────────────────────────────────────────
  formulario: publicProcedure.input(z.object({ token: z.string().max(80) })).query(async ({ ctx, input }) => {
    if (!permitePublico(ipDe(ctx))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos." });
    return comErro(async () => (await S()).formularioPublico(input.token));
  }),
  salvarFormulario: publicProcedure.input(z.object({ token: z.string().max(80), dados: z.record(z.string(), z.unknown()), enviar: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      if (!permitePublico(ipDe(ctx))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde alguns minutos." });
      return comErro(async () => (await S()).salvarFormulario(input.token, input.dados as any, input.enviar));
    }),
  removerDoc: publicProcedure.input(z.object({ token: z.string().max(80), tipo: z.string().max(30) }))
    .mutation(async ({ input }) => comErro(async () => (await S()).removerDocPublico(input.token, input.tipo))),
});

export const perfisRecrutamento = PERFIS_RECRUTAMENTO;
