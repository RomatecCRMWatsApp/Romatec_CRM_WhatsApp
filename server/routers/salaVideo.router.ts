/** Sala de vídeo (Jitsi) — server/salaVideo.ts */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { MAX_NOME_PARTICIPANTE, MAX_TITULO_SALA } from "../../shared/salaVideo";

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "SalaErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 410 ? "PRECONDITION_FAILED" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}
const S = () => import("../salaVideo");
const quem = (ctx: any) => ({ id: ctx.user.id as number, nome: String(ctx.user.name || "Corretor"), email: ctx.user.email ?? null, perfil: ctx.permissoes?.perfil ?? null });
const codigoZ = z.string().trim().min(10).max(16);

export const salaVideoRouter = router({
  /** "embutido" (JaaS configurado) ou "aba" (meet.jit.si) */
  status: protectedProcedure.query(async () => ({ modo: (await S()).modoSala() })),
  listar: protectedProcedure.query(async ({ ctx }) => comErro(async () => (await S()).listarSalas(quem(ctx)))),
  criar: protectedProcedure.input(z.object({ titulo: z.string().trim().min(2).max(MAX_TITULO_SALA), leadId: z.number().int().nullable().optional() }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).criarSala(input, quem(ctx)))),
  entrar: protectedProcedure.input(z.object({ codigo: codigoZ }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).entrarComoUsuario(input.codigo, quem(ctx)))),
  encerrar: protectedProcedure.input(z.object({ codigo: codigoZ }))
    .mutation(async ({ ctx, input }) => comErro(async () => (await S()).encerrarSala(input.codigo, quem(ctx)))),
  /** Link público do convidado: /sala/<codigo> */
  publica: publicProcedure.input(z.object({ codigo: codigoZ }))
    .query(async ({ input }) => comErro(async () => (await S()).salaPublica(input.codigo))),
  entrarConvidado: publicProcedure.input(z.object({ codigo: codigoZ, nome: z.string().trim().min(2).max(MAX_NOME_PARTICIPANTE) }))
    .mutation(async ({ input }) => comErro(async () => (await S()).entrarComoConvidado(input.codigo, input.nome))),
});
