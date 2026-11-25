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
    comprovante: z.object({ base64: z.string().min(10).max(14_000_000), mime: z.enum(["image/png", "image/jpeg", "application/pdf"]), nomeArquivo: z.string().max(120) }).nullable().optional(),
    avisar: z.boolean().default(true),
    /** Pago com o dinheiro do caixa do empreendimento: vira despesa no saldo da proprietária, com a ciência dela */
    doCaixa: z.boolean().default(true),
    /** Valor digitado do comprovante (quando o sistema não consegue ler) */
    valorComprovante: z.number().positive().max(10_000_000).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.registrarRepasse(ctx.permissoes, ctx.user.id, input));
  }),
  /** Repasse já pago antes desta versão: lança agora no caixa da proprietária e pede a ciência */
  debitarRepasse: protectedProcedure.input(z.object({ contratoId: z.number().int(), chave: z.string().regex(/^(avista|entrada|saldo)-\d{1,2}$/), nota: z.string().max(600).nullable().optional() })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.debitarRepasse(ctx.permissoes, ctx.user.id, input));
  }),
  /** Troca ou remove (comprovante null) o comprovante de um repasse já registrado */
  trocarComprovante: protectedProcedure.input(z.object({
    contratoId: z.number().int(), chave: z.string().regex(/^(avista|entrada|saldo)-\d{1,2}$/),
    comprovante: z.object({ base64: z.string().min(10).max(14_000_000), mime: z.enum(["image/png", "image/jpeg", "application/pdf"]), nomeArquivo: z.string().max(120) }).nullable(),
    nota: z.string().max(600).nullable().optional(),
    valorComprovante: z.number().positive().max(10_000_000).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.trocarComprovante(ctx.permissoes, ctx.user.id, input));
  }),
  /** O administrador assina o demonstrativo com o certificado digital e o CRM manda ao corretor */
  assinarDemonstrativo: protectedProcedure.input(z.object({
    contratoId: z.number().int(), chave: z.string().regex(/^(avista|entrada|saldo)-\d{1,2}$/), senha: z.string().min(1).max(200),
    pfxBase64: z.string().max(200_000).nullable().optional(), enviar: z.boolean().default(true),
  })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.assinarDemonstrativo(ctx.permissoes, ctx.user.id, input));
  }),
  /** Reenvia ao corretor o demonstrativo (PDF) de uma parte paga */
  reenviarDemonstrativo: protectedProcedure.input(z.object({ contratoId: z.number().int(), chave: z.string().regex(/^(avista|entrada|saldo)-\d{1,2}$/) })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.reenviarDemonstrativo(ctx.permissoes, input));
  }),
  /** O demonstrativo em PDF para baixar (o corretor baixa os dele) */
  demonstrativo: protectedProcedure.input(z.object({ contratoId: z.number().int(), chave: z.string().regex(/^(avista|entrada|saldo)-\d{1,2}$/) })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.demonstrativoPdf(ctx.permissoes, ctx.user.id, input));
  }),

  /** Comissão de gestão das concessões da proprietária: receita a receber da gestora (sem boleto) */
  concessoes: protectedProcedure.query(async ({ ctx }) => {
    const R = await import("../financeiro/comissoesConcessao");
    return comErroRepasse(() => R.receitasConcessao(ctx.permissoes));
  }),
  registrarRecebimentoConcessao: protectedProcedure.input(z.object({
    contratoId: z.number().int(), pagoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), forma: z.string().max(30).optional(), observacao: z.string().max(300).optional(),
  })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesConcessao");
    return comErroRepasse(() => R.registrarRecebimentoConcessao(ctx.permissoes, ctx.user.id, input));
  }),

  /** Desfaz o registro (só o administrador) */
  /** Comissões de gestão das vendas que as proprietárias pagam à gestora (escritório) */
  gestaoVendas: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.permissoes.perfil !== "admin" && ctx.permissoes.perfil !== "secretario") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador e a secretária" });
    const { receitasGestaoVendas } = await import("../financeiro/saldoProprietaria");
    const { hojeBrasil } = await import("../financeiro/servico");
    return receitasGestaoVendas(hojeBrasil());
  }),
  registrarRecebimentoGestao: protectedProcedure.input(z.object({
    contratoId: z.number().int(), chave: z.string().max(16), pagoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), forma: z.string().max(30).optional(),
  })).mutation(async ({ input, ctx }) => {
    if (ctx.permissoes.perfil !== "admin" && ctx.permissoes.perfil !== "secretario") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador e a secretária" });
    const G = await import("../financeiro/saldoProprietaria");
    const { hojeBrasil } = await import("../financeiro/servico");
    try { return await G.registrarRecebimentoGestao(ctx.user.id, input, hojeBrasil()); }
    catch (e: any) { if (e instanceof G.GestaoErro) throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 409 ? "CONFLICT" : "BAD_REQUEST", message: e.message }); throw e; }
  }),
  desfazerPagamento: protectedProcedure.input(z.object({ contratoId: z.number().int(), chave: z.string().max(20) })).mutation(async ({ input, ctx }) => {
    const R = await import("../financeiro/comissoesRepasse");
    return comErroRepasse(() => R.desfazerRepasse(ctx.permissoes, input));
  }),

  /** Link público (30 dias) da tabela em PDF para enviar por WhatsApp: só sai se a pessoa pode ver essa tabela */
  linkTabela: protectedProcedure.input(z.object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/), lote: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/).optional(), tipo: z.enum(["corretor", "escritorio"]).default("corretor"),
  })).mutation(async ({ input, ctx }) => {
    const { dadosTabelaComissao, TabelaComissaoErro } = await import("../financeiro/tabelaComissao");
    const L = await import("../financeiro/tabelaComissaoLink");
    try {
      const d = await dadosTabelaComissao(input.slug, input.tipo, input.lote, ctx.permissoes);
      const lote = input.lote ?? d.exemplo?.codigo ?? undefined;
      return { caminho: L.linkTabelaComissao({ slug: input.slug, tipo: input.tipo, lote, usuarioId: ctx.user.id }), validadeDias: L.VALIDADE_LINK_TABELA_DIAS, nomeArquivo: L.nomeArquivoTabelaComissao(input.slug, input.tipo, lote) };
    } catch (e: any) {
      if (e instanceof TabelaComissaoErro) throw new TRPCError({ code: e.status === 403 ? "FORBIDDEN" : e.status === 404 ? "NOT_FOUND" : e.status === 412 ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR", message: e.message });
      throw e;
    }
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
