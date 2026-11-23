/** Importação de contatos do celular + retomada com qualificação pelo robô (server/leads/importacaoContatos.ts) — administrador */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";

const S = () => import("../leads/importacaoContatos");

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "ImportacaoErro") throw new TRPCError({ code: e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

const marcador = z.string().trim().min(2).max(20);

export const importacaoContatosRouter = router({
  /** Situação dos contatos marcados (o navegador já leu o arquivo), sem gravar nada */
  previa: adminProcedure
    .input(z.object({ contatos: z.array(z.object({ nome: z.string().max(200), telefone: z.string().max(30), nomeOriginal: z.string().max(250) })).max(5000) }))
    .mutation(({ input }) => comErro(async () => (await S()).previa(input))),

  importar: adminProcedure
    .input(z.object({
      contatos: z.array(z.object({ nome: z.string().max(200), telefone: z.string().max(30) })).min(1).max(2000),
      marcador,
      empreendimentoSlug: z.string().trim().min(1).max(80),
      modelo: z.string().max(2000),
      enviar: z.boolean(),
      incluirExistentes: z.boolean(),
    }))
    .mutation(({ input, ctx }) => comErro(async () => (await S()).importar({ ...input, userId: ctx.user.id }))),

  fila: adminProcedure.query(() => comErro(async () => {
    const r = await (await S()).situacaoFila();
    const { roboAtivo } = await import("../autoresposta/motor");
    return { ...r, roboBomJardims: await roboAtivo("bom-jardims").catch(() => false) };
  })),

  mudarLote: adminProcedure
    .input(z.object({ lote: z.string().max(40), acao: z.enum(["pausar", "continuar", "cancelar"]) }))
    .mutation(({ input }) => comErro(async () => (await S()).mudarLote(input.lote, input.acao))),
});
