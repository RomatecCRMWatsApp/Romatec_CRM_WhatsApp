/**
 * Novidades do sistema (v1.7.0): "Novidades da versão" ao entrar, sino com o histórico, publicação de
 * avisos pelo admin e a preferência / contador da tela de descanso. Todos os perfis (inclusive empreendedor).
 */
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { OPCOES_DESCANSO, PUBLICOS_RELEASE, TIPOS_RELEASE } from "../../shared/releases";
import {
  definirAtivo, definirDescanso, editarRelease, listarReleases, marcarLida, marcarTodasLidas, novosLeadsDesde,
  publicarRelease, releasesNaoLidas, todasReleases, ultimaVersao,
} from "../releases";

const linhas = z.array(z.string().trim().min(1).max(300)).max(30).default([]);
const dadosRelease = z.object({
  tipo: z.enum(TIPOS_RELEASE),
  titulo: z.string().trim().min(1).max(150),
  itens: z.object({ novo: linhas, melhorias: linhas, correcoes: linhas, avisos: linhas }),
  obrigatoria: z.boolean().default(false),
  publico: z.enum(PUBLICOS_RELEASE).default("todos"),
});

export const novidadesRouter = router({
  naoLidas: protectedProcedure.query(({ ctx }) => releasesNaoLidas(ctx.user as any)),
  historico: protectedProcedure.input(z.object({ limite: z.number().int().min(1).max(50).default(20) }).optional())
    .query(({ ctx, input }) => listarReleases(ctx.user as any, input?.limite ?? 20)),
  marcarLida: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(20) }))
    .mutation(({ ctx, input }) => marcarLida(ctx.user as any, input.ids)),
  marcarTodas: protectedProcedure.mutation(({ ctx }) => marcarTodasLidas(ctx.user as any)),

  /** Tela de descanso: leads novos desde que a tela abriu */
  novosLeads: protectedProcedure.input(z.object({ desde: z.number().int().positive() }))
    .query(async ({ ctx, input }) => ({ total: await novosLeadsDesde(ctx.user as any, new Date(input.desde)) })),
  definirDescanso: protectedProcedure.input(z.object({ minutos: z.number().int().refine(m => (OPCOES_DESCANSO as readonly number[]).includes(m), "Tempo inválido") }))
    .mutation(({ ctx, input }) => definirDescanso(ctx.user.id, input.minutos)),

  // ─── Admin ─────────────────────────────────────────────────────────────────
  todas: adminProcedure.query(async () => ({ releases: await todasReleases(), ultimaVersao: await ultimaVersao() })),
  publicar: adminProcedure.input(dadosRelease.extend({ versao: z.string().trim().max(20) }))
    .mutation(({ ctx, input }) => publicarRelease(input, ctx.user.id)),
  editar: adminProcedure.input(dadosRelease.extend({ id: z.number().int().positive() }))
    .mutation(({ input: { id, ...d } }) => editarRelease(id, d)),
  ativar: adminProcedure.input(z.object({ id: z.number().int().positive(), ativo: z.boolean() }))
    .mutation(({ input }) => definirAtivo(input.id, input.ativo)),
});
