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

const L = () => import("../contratos/aditivosLote");
const tipoLote = z.enum(["registro", "liberacao"]);
const dadosRegistro = z.object({
  numeroRegistro: z.string().trim().min(2).max(80), dataRegistro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cartorio: z.string().trim().min(5).max(200),
  matriculaEmpreendimento: z.string().trim().min(1).max(40), livroFolhas: z.string().trim().max(80).nullable().optional(),
  matriculas: z.record(z.string().max(10), z.string().max(40)).nullable().optional(), atualizarCadastro: z.boolean().optional(), observacao: z.string().max(2000).nullable().optional(),
});
const dadosLiberacao = z.object({ dataLiberacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fundamento: z.string().trim().min(10).max(600), observacao: z.string().max(2000).nullable().optional() });

export const renegociacaoRouter = router({
  // ─── Termos aditivos em lote: registro do loteamento e liberação para transferência (server/contratos/aditivosLote.ts) ───
  loteEmpreendimentos: protectedProcedure.query(async ({ ctx }) => {
    exigir(ctx, ["admin", "secretario"]);
    const { getDb } = await import("../db");
    const { empreendimentos } = await import("../../drizzle/schema");
    const d: any = await getDb();
    return d ? (await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos)) as { id: number; nome: string }[] : [];
  }),
  loteAndamento: protectedProcedure.input(z.object({ empreendimentoId: z.number().int(), tipo: tipoLote })).query(async ({ ctx, input }) => {
    exigir(ctx, ["admin", "secretario"]);
    return comErro(async () => (await L()).andamentoLote(input.empreendimentoId, input.tipo));
  }),
  loteGerar: protectedProcedure.input(z.object({ empreendimentoId: z.number().int(), senha: z.string().min(1).max(200), registro: dadosRegistro.optional(), liberacao: dadosLiberacao.optional(), tipo: tipoLote }))
    .mutation(async ({ ctx, input }) => {
      exigir(ctx, ["admin"]);
      return comErro(async () => {
        const { exigirAdminComSenha } = await import("../contratos/cancelamento");
        await exigirAdminComSenha(ctx.user as any, input.senha, `aditivo_${input.tipo}`, {});
        const dados = input.tipo === "registro" ? input.registro : input.liberacao;
        if (!dados) throw new TRPCError({ code: "BAD_REQUEST", message: "Preencha os dados do termo" });
        return (await L()).gerarLote(input.empreendimentoId, input.tipo, dados as any, ctx.user.id);
      });
    }),

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
