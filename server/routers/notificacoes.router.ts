/**
 * Sininho de notificações (v1.8.0) e inscrição no Web Push. Todos os perfis (inclusive empreendedor);
 * cada pessoa só lê e marca as próprias notificações.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { chavePublicaVapid, listarDoUsuario, marcarLidas, pushConfigurado, repoBanco } from "../notificacoes";

const endpoint = z.string().trim().url().max(2000).refine(u => u.startsWith("https://"), "Endpoint inválido");

export const notificacoesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => listarDoUsuario(ctx.user.id)),
  marcarLidas: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).max(100).optional() }))
    .mutation(({ ctx, input }) => marcarLidas(ctx.user.id, input.ids)),

  /** Chave pública VAPID (sem ela o navegador não inscreve; push desligado no servidor = null) */
  chavePush: protectedProcedure.query(() => ({ chave: pushConfigurado() ? chavePublicaVapid() : null })),
  inscreverPush: protectedProcedure
    .input(z.object({ endpoint, keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) }))
    .mutation(async ({ ctx, input }) => {
      const ua = String(ctx.req?.headers?.["user-agent"] ?? "").slice(0, 300) || null;
      await repoBanco().salvarInscricao({ usuarioId: ctx.user.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth }, ua);
      return { ok: true };
    }),
  cancelarPush: protectedProcedure.input(z.object({ endpoint }))
    .mutation(async ({ ctx, input }) => {
      await repoBanco().removerInscricao(input.endpoint, ctx.user.id);
      return { ok: true };
    }),
});
