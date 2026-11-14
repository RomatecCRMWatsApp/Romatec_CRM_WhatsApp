import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

/** Autorizações de venda fora do padrão (proprietária assina antes do contrato) — só o administrador */
const soAdmin = (ctx: any) => { if (perfilDe(ctx.user as any) !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Autorizações da proprietária são do administrador." }); };
const comErro = async <T>(f: () => Promise<T>): Promise<T> => {
  try { return await f(); } catch (e: any) {
    if (e?.name === "ContratoErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : e.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_REQUEST", message: e.message });
    throw e;
  }
};
const S = () => import("../autorizacoes/servico");
const itemZ = z.object({
  loteCodigo: z.string().trim().min(1).max(10),
  dataPrimeiroPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  personalizado: z.object({
    preco: z.number().positive().max(1e8).nullable().optional(), entrada: z.number().positive().max(1e8), entradaParcelas: z.number().int().min(1).max(12),
    prazo: z.number().int().min(1).max(360), parcela: z.number().positive().max(1e7), inicioParcelas: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }),
});
const pedidoZ = z.object({
  empreendimentoSlug: z.string().max(80), clienteNome: z.string().trim().max(160), itens: z.array(itemZ).min(1).max(20), observacao: z.string().trim().max(600).optional(),
  proprietario: z.object({ nome: z.string().trim().max(160).optional(), documento: z.string().trim().max(25).optional(), empresa: z.string().trim().max(160).optional(), telefone: z.string().trim().max(25).optional() }).nullable().optional(),
});

export const autorizacoesRouter = router({
  listar: protectedProcedure.query(async ({ ctx }) => { soAdmin(ctx); return comErro(async () => (await S()).listarAutorizacoes()); }),
  proprietaria: protectedProcedure.input(z.object({ slug: z.string().max(80) })).query(async ({ ctx, input }) => {
    soAdmin(ctx);
    return comErro(async () => {
      const { getDb } = await import("../db");
      const { empreendimentos } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = (await getDb()) as any;
      const [e] = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, input.slug)).limit(1);
      if (!e) return null;
      return (await S()).proprietariaPadrao(Number(e.id));
    });
  }),
  simular: protectedProcedure.input(pedidoZ).query(async ({ ctx, input }) => { soAdmin(ctx); return comErro(async () => (await S()).simularPedido(input as any)); }),
  criar: protectedProcedure.input(pedidoZ).mutation(async ({ ctx, input }) => { soAdmin(ctx); return comErro(async () => (await S()).criarAutorizacao(input as any, ctx.user.id)); }),
  cancelar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => { soAdmin(ctx); return comErro(async () => (await S()).cancelarAutorizacao(input.id, ctx.user.id)); }),
  reenviar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => { soAdmin(ctx); return comErro(async () => (await S()).reenviarAutorizacao(input.id)); }),
  /** Novo contrato: autorizações assinadas com esta chácara ainda sem contrato */
  disponiveis: protectedProcedure.input(z.object({ slug: z.string().max(80), lote: z.string().max(10) })).query(async ({ ctx, input }) => {
    if (perfilDe(ctx.user as any) !== "admin") return [];
    return comErro(async () => (await S()).disponiveisPara(input.slug, input.lote));
  }),
});
