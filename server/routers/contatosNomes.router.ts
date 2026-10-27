/** Correção dos nomes de contato com "?" (server/contatosNomes.ts) — só o administrador */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";

const N = () => import("../contatosNomes");

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "NomesErro") throw new TRPCError({ code: e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

export const contatosNomesRouter = router({
  /** Quantos contatos estão com "?" no nome */
  situacao: adminProcedure.query(async () => ({ corrompidos: (await (await N()).contatosCorrompidos()).length })),
  /** Sugestões pela agenda do celular conectado à Z-API */
  pelaAgendaZapi: adminProcedure.mutation(async () => comErro(async () => {
    const M = await N();
    return M.sugerir(await M.contatosCorrompidos(), await M.agendaZapi());
  })),
  /** Sugestões por um arquivo .vcf (agenda exportada do celular ou do Google) */
  peloVcf: adminProcedure.input(z.object({ texto: z.string().min(10).max(15_000_000) })).mutation(async ({ input }) => comErro(async () => {
    const M = await N();
    return M.sugerir(await M.contatosCorrompidos(), M.agendaVcf(input.texto));
  })),
  aplicar: adminProcedure.input(z.object({ correcoes: z.array(z.object({ id: z.number().int(), nome: z.string().trim().min(1).max(255) })).min(1).max(5000) }))
    .mutation(async ({ input }) => (await N()).aplicarNomes(input.correcoes)),
});
