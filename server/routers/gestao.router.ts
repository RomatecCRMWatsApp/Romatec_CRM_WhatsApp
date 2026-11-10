/** Vendas › Contrato de gestão (server/gestao): documento interno EMPREENDEDORA × GESTORA — só o administrador */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { aditivoGestaoSchema, anexoAporteSchema, aporteSchema, parametrosSchema } from "../../shared/gestao";

const G = () => import("../gestao/servico");
function exigirAdmin(ctx: any) {
  if (String(perfilDe(ctx.user as any) ?? "") !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Contrato de gestão: só o administrador." });
}
async function rodar<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name !== "GestaoErro") throw e;
    throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : "BAD_REQUEST", message: e.message });
  }
}
const slugZ = z.string().regex(/^[a-z0-9-]{1,80}$/);

export const gestaoRouter = router({
  dados: protectedProcedure.input(z.object({ slug: slugZ })).query(async ({ ctx, input }) => {
    exigirAdmin(ctx);
    return rodar(async () => {
      const d = await (await G()).dadosContrato(input.slug);
      // A tela mostra só o necessário da EMPREENDEDORA (nome e documento), não a qualificação inteira
      const { qualificacaoEmpreendedora } = await import("../gestao/contrato");
      const q = qualificacaoEmpreendedora(d);
      return { empreendimento: d.empreendimento, numero: d.numero, parametros: d.parametros, qtdLotes: d.qtdLotes, lotesCadastrados: d.lotesCadastrados,
        empreendedora: { nome: q.nome, doc: q.doc, completa: !!(d.vend.vend_cpf || d.vend.vend_cnpj) }, aportes: d.aportes, aditivos: d.aditivos, atualizadoEm: d.atualizadoEm };
    });
  }),
  salvar: protectedProcedure.input(z.object({ slug: slugZ, parametros: parametrosSchema })).mutation(async ({ ctx, input }) => {
    exigirAdmin(ctx);
    return rodar(async () => (await G()).salvarParametros(input.slug, input.parametros, ctx.user.id));
  }),
  criarAporte: protectedProcedure.input(z.object({ slug: slugZ, aporte: aporteSchema })).mutation(async ({ ctx, input }) => {
    exigirAdmin(ctx);
    return rodar(async () => (await G()).criarAporte(input.slug, input.aporte, ctx.user.id));
  }),
  ressarcido: protectedProcedure.input(z.object({ slug: slugZ, id: z.number().int().positive(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }))
    .mutation(async ({ ctx, input }) => { exigirAdmin(ctx); return rodar(async () => (await G()).marcarRessarcido(input.slug, input.id, input.data)); }),
  criarAditivo: protectedProcedure.input(z.object({ slug: slugZ, aditivo: aditivoGestaoSchema })).mutation(async ({ ctx, input }) => {
    exigirAdmin(ctx);
    return rodar(async () => (await G()).criarAditivoGestao(input.slug, input.aditivo, ctx.user.id));
  }),
  excluirAditivo: protectedProcedure.input(z.object({ slug: slugZ, id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => { exigirAdmin(ctx); return rodar(async () => (await G()).excluirAditivoGestao(input.slug, input.id)); }),
  anexarAporte: protectedProcedure.input(z.object({ slug: slugZ, id: z.number().int().positive(), anexo: anexoAporteSchema }))
    .mutation(async ({ ctx, input }) => { exigirAdmin(ctx); return rodar(async () => (await G()).anexarAporte(input.slug, input.id, input.anexo)); }),
  removerAnexoAporte: protectedProcedure.input(z.object({ slug: slugZ, id: z.number().int().positive(), chave: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => { exigirAdmin(ctx); return rodar(async () => (await G()).removerAnexoAporte(input.slug, input.id, input.chave)); }),
  excluirAporte: protectedProcedure.input(z.object({ slug: slugZ, id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => { exigirAdmin(ctx); return rodar(async () => (await G()).excluirAporte(input.slug, input.id)); }),
});
