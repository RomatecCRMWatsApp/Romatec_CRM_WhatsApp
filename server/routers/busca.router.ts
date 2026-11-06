/** Busca única do sistema (lupa no topo / Ctrl+K): server/buscaGlobal.ts */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const buscaRouter = router({
  global: protectedProcedure
    .input(z.object({ termo: z.string().trim().max(80) }))
    .query(async ({ input, ctx }) => (await import("../buscaGlobal")).buscarTudo(input.termo, ctx.user as any, ctx.permissoes)),
});
