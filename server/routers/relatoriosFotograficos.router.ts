import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { TIPOS_ATIVIDADE } from "../../shared/relatoriosFotograficos";

/** Relatórios fotográficos — a autorização (perfil, responsável, rascunho/final) é toda do servidor (server/relatorios/servico.ts) */
const S = () => import("../relatorios/servico");
const comErro = async <T>(f: () => Promise<T>): Promise<T> => {
  try { return await f(); } catch (e: any) {
    if (e?.name === "RelatorioErro") {
      const s = Number(e.status);
      throw new TRPCError({ code: s === 404 ? "NOT_FOUND" : s === 403 ? "FORBIDDEN" : s === 409 ? "CONFLICT" : s === 503 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    }
    throw e;
  }
};
const dadosZ = z.object({
  titulo: z.string().trim().min(3).max(180),
  descricao: z.string().max(5000).nullable().optional(),
  tipoAtividade: z.enum(TIPOS_ATIVIDADE),
  dataAtividade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  empreendimentoId: z.number().int().positive().nullable().optional(),
  loteCodigo: z.string().trim().max(20).nullable().optional(),
  imovelId: z.number().int().positive().nullable().optional(),
  clienteId: z.number().int().positive().nullable().optional(),
  responsavelUserId: z.number().int().positive().nullable().optional(),
});
const idZ = z.object({ id: z.number().int().positive() });

export const relatoriosFotograficosRouter = router({
  listar: protectedProcedure.input(z.object({
    empreendimentoId: z.number().int().positive().nullable().optional(), tipoAtividade: z.enum(TIPOS_ATIVIDADE).nullable().optional(),
    status: z.enum(["draft", "final"]).nullable().optional(), responsavelUserId: z.number().int().positive().nullable().optional(),
    de: z.string().max(10).nullable().optional(), ate: z.string().max(10).nullable().optional(), busca: z.string().max(80).nullable().optional(),
  }).optional()).query(({ ctx, input }) => comErro(async () => { const M = await S(); return M.listarRelatorios(M.atorDe(ctx.user), input ?? {}); })),
  obter: protectedProcedure.input(idZ).query(({ ctx, input }) => comErro(async () => { const M = await S(); return M.obterRelatorio(M.atorDe(ctx.user), input.id); })),
  opcoes: protectedProcedure.input(z.object({ buscaCliente: z.string().max(60).optional() }).optional())
    .query(({ ctx, input }) => comErro(async () => { const M = await S(); return M.opcoesRelatorio(M.atorDe(ctx.user), input?.buscaCliente); })),
  criar: protectedProcedure.input(dadosZ).mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.criarRelatorio(M.atorDe(ctx.user), input); })),
  atualizar: protectedProcedure.input(idZ.extend({ dados: dadosZ })).mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.atualizarRelatorio(M.atorDe(ctx.user), input.id, input.dados); })),
  finalizar: protectedProcedure.input(idZ).mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.finalizarRelatorio(M.atorDe(ctx.user), input.id); })),
  derivar: protectedProcedure.input(idZ).mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.derivarRelatorio(M.atorDe(ctx.user), input.id); })),
  excluir: protectedProcedure.input(idZ).mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.excluirRascunho(M.atorDe(ctx.user), input.id); })),
  atualizarFoto: protectedProcedure.input(idZ.extend({ fotoId: z.number().int().positive(), legenda: z.string().max(1000).optional(), incluirCliente: z.boolean().optional() }))
    .mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.atualizarFoto(M.atorDe(ctx.user), input.id, input.fotoId, input); })),
  reordenar: protectedProcedure.input(idZ.extend({ ordem: z.array(z.number().int().positive()).max(60) }))
    .mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.reordenarFotos(M.atorDe(ctx.user), input.id, input.ordem); })),
  removerFoto: protectedProcedure.input(idZ.extend({ fotoId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => comErro(async () => { const M = await S(); return M.removerFoto(M.atorDe(ctx.user), input.id, input.fotoId); })),
});
