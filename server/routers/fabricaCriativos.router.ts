/** Fábrica diária de criativos: catálogo dos Materiais, pautas do dia, fila de aprovação e condições comerciais */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

const escritorio = (ctx: any) => {
  const p = ctx.permissoes?.perfil;
  if (p !== "admin" && p !== "secretario") throw new TRPCError({ code: "FORBIDDEN", message: "Fábrica de criativos: administrador e secretária" });
};
const soAdmin = (ctx: any) => {
  if (ctx.permissoes?.perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador confirma condições e liga a rotina" });
};
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const F = () => import("../criativos/fabrica");
async function rodar<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    if (e?.name === "FabricaErro") throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
    throw e;
  }
}

export const fabricaCriativosRouter = router({
  painel: protectedProcedure.query(async ({ ctx }) => {
    escritorio(ctx);
    const f = await F();
    const [fila, cond, ligada, cat] = await Promise.all([f.listar(7), f.condicoes(), f.fabricaLigada(), f.catalogo()]);
    // Nome de cada mídia, para a fila mostrar o arquivo e não só o número
    const titulos: Record<number, string> = {};
    for (const m of cat) titulos[m.id] = m.titulo;
    return { fila, condicoes: cond, ligada, hoje: f.agoraBrasilia().data, titulos };
  }),
  catalogo: protectedProcedure.query(async ({ ctx }) => {
    escritorio(ctx);
    const { sugerirTemas } = await import("../../shared/pautaDiaria");
    return (await (await F()).catalogo()).map(i => ({ ...i, sugestao: i.temas.length ? [] : sugerirTemas(i.titulo) }));
  }),
  salvarCatalogo: protectedProcedure
    .input(z.object({ materialId: z.number().int().positive(), temas: z.array(z.string().max(20)).max(10), temTexto: z.boolean() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); await (await F()).salvarCatalogo(input.materialId, input.temas, input.temTexto); return { ok: true }; }),
  gerar: protectedProcedure.input(z.object({ data: dia, refazer: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return rodar(async () => (await F()).gerarDoDia(input.data, undefined, input.refazer)); }),
  aprovar: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); await rodar(async () => (await F()).aprovar(input.id, ctx.user.id)); return { ok: true }; }),
  descartar: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); await rodar(async () => (await F()).descartar(input.id)); return { ok: true }; }),
  legenda: protectedProcedure.input(z.object({ id: z.number().int().positive(), legenda: z.string().max(2200) }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); await rodar(async () => (await F()).editarLegenda(input.id, input.legenda)); return { ok: true }; }),
  trocarMidia: protectedProcedure.input(z.object({ id: z.number().int().positive(), indice: z.number().int().min(0).max(20) }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); await rodar(async () => (await F()).trocarMidia(input.id, input.indice)); return { ok: true }; }),
  remontar: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); await rodar(async () => (await F()).remontar(input.id)); return { ok: true }; }),
  confirmarCondicoes: protectedProcedure
    .input(z.object({ entrada: z.string().trim().min(2).max(40), parcelas: z.string().trim().min(1).max(20), handle: z.string().trim().regex(/^@[\w.]{1,30}$/) }))
    .mutation(async ({ ctx, input }) => { soAdmin(ctx); await (await F()).confirmarCondicoes(input, ctx.user.id); return { ok: true }; }),
  ligar: protectedProcedure.input(z.object({ ligada: z.boolean() }))
    .mutation(async ({ ctx, input }) => { soAdmin(ctx); await (await F()).ligarFabrica(input.ligada, ctx.user.id); return { ok: true }; }),
});
