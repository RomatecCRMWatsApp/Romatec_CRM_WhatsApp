/**
 * Tabelas de comissão do empreendimento (shared/tabelaComissao.ts), fora dos módulos: o corretor vê a dele mesmo sem o
 * Simulador liberado. Corretor (2%): corretores, administrador e secretária; escritório (5%): administrador, secretária e
 * empreendedor(a). O escopo do empreendimento é conferido em server/financeiro/tabelaComissao.ts.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

async function comErroRepasse<T>(f: () => Promise<T>): Promise<T> {
  const { RepasseErro } = await import("../financeiro/comissoesRepasse");
  try { return await f(); } catch (e: any) {
    if (e instanceof RepasseErro) {
      const code = e.status === 403 ? "FORBIDDEN" : e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : e.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}

export const comissoesRouter = router({
  /** Comissões de venda a pagar (escritório: todos os corretores; corretor: só as dele) */
  aPagar: protectedProcedure.input(z.object({ corretorId: z.number().int().optional(), slug: z.string().max(80).optional() }).optional()).query(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.comissoesDeVenda(ctx.permissoes, ctx.user.id, input ?? {}));
  }),

  /** Registra o pagamento de uma parte da comissão ao corretor (administrador e secretária) */
  registrarPagamento: protectedProcedure.input(z.object({
    contratoId: z.number().int(), chave: z.string().regex(/^(avista|entrada|saldo)-\d{1,2}$/),
    pagoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), forma: z.string().max(30).optional(), observacao: z.string().max(300).optional(),
  })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.registrarRepasse(ctx.permissoes, ctx.user.id, input));
  }),

  /** Desfaz o registro (só o administrador) */
  desfazerPagamento: protectedProcedure.input(z.object({ contratoId: z.number().int(), chave: z.string().max(20) })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.desfazerRepasse(ctx.permissoes, input));
  }),

  tabela: protectedProcedure.input(z.object({
    slug: z.string().max(80), lote: z.string().trim().max(10).optional(), tipo: z.enum(["corretor", "escritorio"]).default("corretor"),
  })).query(async ({ input, ctx }) => {
    const { dadosTabelaComissao, TabelaComissaoErro } = await import("../financeiro/tabelaComissao");
    try {
      const d = await dadosTabelaComissao(input.slug, input.tipo, input.lote, ctx.permissoes);
      return { ...d, chacaras: d.chacaras.map(({ codigo, areaM2, preco }) => ({ codigo, areaM2, preco })) };
    } catch (e: any) {
      if (e instanceof TabelaComissaoErro) {
        const code = e.status === 403 ? "FORBIDDEN" : e.status === 404 ? "NOT_FOUND" : e.status === 412 ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR";
        throw new TRPCError({ code, message: e.message });
      }
      throw e;
    }
  }),
});
