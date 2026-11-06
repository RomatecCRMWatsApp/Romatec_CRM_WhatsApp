/** Ficha completa do cliente (server/fichaCliente.ts) */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

export const fichaRouter = router({
  cliente: protectedProcedure
    .input(z.object({ leadId: z.number().int().positive().optional(), pessoaId: z.number().int().positive().optional() }).refine(v => v.leadId || v.pessoaId, "Informe o lead ou o comprador"))
    .query(async ({ input, ctx }) => {
      try { return await (await import("../fichaCliente")).fichaDoCliente(input, ctx.user as any, ctx.permissoes); }
      catch (e: any) {
        if (e?.name === "FichaErro") throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : "BAD_REQUEST", message: e.message });
        throw e;
      }
    }),
});
