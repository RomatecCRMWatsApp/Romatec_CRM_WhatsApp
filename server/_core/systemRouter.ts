import { z } from "zod";
import { notifyOwner } from "./notification";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./trpc";

/** Hora em que este processo subiu: no Railway cada deploy sobe um container novo */
const NO_AR_DESDE = new Date();

function versaoDoPacote(): string {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version || "?";
  } catch {
    return "?";
  }
}
const VERSAO = versaoDoPacote();

/** Versão, commit e hora do deploy (faixa no topo do painel) */
export function infoVersao() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA || "";
  return {
    versao: VERSAO,
    commit: sha ? sha.slice(0, 7) : null,
    deployAt: NO_AR_DESDE.toISOString(),
    agora: new Date().toISOString(),
  };
}

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  versao: protectedProcedure.query(() => infoVersao()),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
