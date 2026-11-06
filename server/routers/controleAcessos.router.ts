/**
 * Controle de acessos dos corretores: administrador e secretária veem quem está ativo, pago e usando o sistema,
 * ativam/desativam o login e bloqueiam a licença. Prorrogar, desbloquear e dar cortesia: a secretária pede e só
 * a senha do administrador libera (server/controleAcessos.ts). Fica fora de "equipe.*"
 * (que é só do administrador) para a secretária poder usar.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const C = () => import("../controleAcessos");
const dataZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const prorrogacaoZ = z.object({
  id: z.number().int(), modalidade: z.enum(["pago", "cortesia"]), ate: dataZ,
  valor: z.number().min(0).max(100000).nullable().optional(), motivo: z.string().trim().min(3).max(300),
});

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "Área restrita ao escritório." });
}

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "AcessoErro" || e?.name === "SaasErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}

const ipDe = (ctx: any): string | null => {
  const fwd = String(ctx.req?.headers?.["x-forwarded-for"] ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || ctx.req?.socket?.remoteAddress || null;
};

export const controleAcessosRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return comErro(async () => (await C()).listarControleAcessos()); }),

  historico: protectedProcedure.input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).historicoAcessos(input.id)); }),

  definirLogin: protectedProcedure.input(z.object({ id: z.number().int(), ativo: z.boolean(), motivo: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => {
      escritorio(ctx);
      if (input.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode mudar o seu próprio acesso" });
      return comErro(async () => (await C()).definirLoginAtivo(input.id, input.ativo, input.motivo, ctx.user.id, ipDe(ctx)));
    }),

  /** Bloquear a licença: a secretária pode, sem senha (tirar acesso não concede nada) */
  bloquearLicenca: protectedProcedure.input(z.object({ id: z.number().int(), motivo: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).bloquearLicenca(input.id, input.motivo, ctx.user.id)); }),

  // ─── Prorrogar / desbloquear / cortesia: só com a senha do administrador ───
  pedidos: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return comErro(async () => (await C()).listarPedidos()); }),

  pedirProrrogacao: protectedProcedure.input(prorrogacaoZ)
    .mutation(async ({ ctx, input }) => { escritorio(ctx); const { id, ...p } = input; return comErro(async () => (await C()).pedirProrrogacao(id, p, ctx.user as any)); }),

  /** Senha do administrador: no aparelho dele ou digitada por ele no aparelho da secretária */
  autorizarPedido: protectedProcedure.input(z.object({ id: z.number().int().optional(), codigo: z.string().regex(/^\d{6}$/).optional(), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      escritorio(ctx);
      if (!input.id && !input.codigo) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o pedido" });
      return comErro(async () => (await C()).autorizarPedido({ id: input.id, codigo: input.codigo }, input.senha, ctx.user as any, ipDe(ctx)));
    }),

  /** Administrador logado: prorroga direto com a própria senha */
  prorrogarComSenha: protectedProcedure.input(prorrogacaoZ.extend({ senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); const { id, senha, ...p } = input; return comErro(async () => (await C()).prorrogarComSenha(id, p, senha, ctx.user as any, ipDe(ctx))); }),

  encerrarPedido: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).encerrarPedido(input.id, ctx.user as any)); }),

  desconectar: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await C()).desconectar(input.id, ctx.user.id)); }),
});
