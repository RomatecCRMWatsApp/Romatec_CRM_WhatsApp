/**
 * Tabelas de comissão do empreendimento (shared/tabelaComissao.ts), fora dos módulos: o corretor vê a dele mesmo sem o
 * Simulador liberado. Corretor (2%): corretores, administrador e secretária; escritório (5%): administrador, secretária e
 * empreendedor(a). O escopo do empreendimento é conferido em server/financeiro/tabelaComissao.ts.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";

export const comissoesRouter = router({
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
