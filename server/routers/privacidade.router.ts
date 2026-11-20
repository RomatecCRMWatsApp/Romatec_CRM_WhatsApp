/**
 * Privacidade (LGPD): canal do titular (público), Central de Privacidade do usuário logado (aceites e marketing) e
 * gestão do escritório (pedidos, exportação, anonimização). Ver server/privacidade/ e docs/privacidade/.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { STATUS_PEDIDO, TIPOS_PEDIDO } from "../../shared/privacidade";

const P = () => import("../privacidade/pedidos");
const T = () => import("../privacidade/titular");
const A = () => import("../privacidade/aceites");
const C = () => import("../privacidade/config");

const ipDe = (req: any): string => {
  const fwd = String(req?.headers?.["x-forwarded-for"] ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || req?.socket?.remoteAddress || "desconhecido";
};

/** Erro de domínio → TRPCError com a mensagem (sem vazar detalhes internos) */
async function comErro<R>(f: () => Promise<R>): Promise<R> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "PrivacidadeErro" || e?.name === "ContratoErro") {
      const s = Number(e.status) || 400;
      const code = s === 404 ? "NOT_FOUND" : s === 403 ? "FORBIDDEN" : s === 409 ? "CONFLICT" : s === 429 ? "TOO_MANY_REQUESTS" : s >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}

async function exigirCanal() {
  if (!(await C()).canalAtivo()) throw new TRPCError({ code: "NOT_FOUND", message: "Canal de privacidade ainda não publicado." });
}

const criteriosZ = z.object({ telefone: z.string().max(30).nullish(), cpf: z.string().max(20).nullish(), email: z.string().max(160).nullish() });
const tipoZ = z.enum(Object.keys(TIPOS_PEDIDO) as [keyof typeof TIPOS_PEDIDO, ...(keyof typeof TIPOS_PEDIDO)[]]);
const statusZ = z.enum(Object.keys(STATUS_PEDIDO) as [keyof typeof STATUS_PEDIDO, ...(keyof typeof STATUS_PEDIDO)[]]);

export const privacidadeRouter = router({
  // ─── Público ───────────────────────────────────────────────────────────────
  /** O que a tela pública pode mostrar: canal ligado, minutas ligadas e quais dados do controlador estão pendentes */
  config: publicProcedure.query(async () => {
    const c = await C();
    const ctrl = c.controlador();
    return { canalAtivo: c.canalAtivo(), minutasAtivas: c.minutasAtivas(), controlador: c.minutasAtivas() ? ctrl : { pendentes: ctrl.pendentes }, prazoDias: c.prazoDias() };
  }),
  documento: publicProcedure.input(z.object({ doc: z.enum(["termos", "privacidade"]) })).query(async ({ input }) => {
    const c = await C();
    if (!c.minutasAtivas()) throw new TRPCError({ code: "NOT_FOUND", message: "Documento em revisão jurídica." });
    return c.documento(input.doc);
  }),
  criarPedido: publicProcedure.input(z.object({ tipo: tipoZ, nome: z.string().max(160), contato: z.string().max(160), descricao: z.string().max(2000).optional(), website: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      await exigirCanal();
      // Honeypot: robô preenche o campo oculto — finge sucesso sem gravar
      if (input.website) return { protocolo: "LGPD-0000-00000000", codigoEnviado: false };
      const p = await P();
      return comErro(async () => p.criarPedido(input, { ip: ipDe(ctx.req), enviar: await p.enviadorPadrao() }));
    }),
  verificarCodigo: publicProcedure.input(z.object({ protocolo: z.string().max(30), codigo: z.string().max(10) })).mutation(async ({ input }) => {
    await exigirCanal();
    return comErro(async () => (await P()).verificarCodigo(input.protocolo, input.codigo));
  }),
  consultarPedido: publicProcedure.input(z.object({ protocolo: z.string().max(30) })).query(async ({ ctx, input }) => {
    await exigirCanal();
    return comErro(async () => (await P()).consultarPedido(input.protocolo, ipDe(ctx.req)));
  }),

  // ─── Usuário logado: Central de Privacidade ─────────────────────────────────
  minhaSituacao: protectedProcedure.query(async ({ ctx }) => comErro(async () => (await A()).situacao(ctx.user.id))),
  aceitar: protectedProcedure.input(z.object({ doc: z.enum(["termos", "privacidade"]), versao: z.string().max(20), hash: z.string().length(64) }))
    .mutation(async ({ ctx, input }) => comErro(async () => { await (await A()).aceitar(ctx.user.id, input.doc, input.versao, input.hash); return { ok: true as const }; })),
  marketing: protectedProcedure.input(z.object({ consentir: z.boolean() }))
    .mutation(async ({ ctx, input }) => comErro(async () => { await (await A()).definirMarketing(ctx.user.id, input.consentir); return { ok: true as const }; })),

  // ─── Escritório (só administrador) ─────────────────────────────────────────
  pedidos: adminProcedure.input(z.object({ status: statusZ.optional() }).optional()).query(async ({ input }) => comErro(async () => (await P()).listarPedidos(input ?? {}))),
  eventos: adminProcedure.input(z.object({ id: z.number().int() })).query(async ({ input }) => comErro(async () => (await P()).eventosDoPedido(input.id))),
  verificarManual: adminProcedure.input(z.object({ id: z.number().int(), justificativa: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => comErro(async () => { await (await P()).verificarManual(input.id, input.justificativa, ctx.user.id); return { ok: true as const }; })),
  atualizarPedido: adminProcedure.input(z.object({ id: z.number().int(), status: statusZ.optional(), responsavelId: z.number().int().nullable().optional(), resposta: z.string().max(4000).nullable().optional() }))
    .mutation(async ({ ctx, input }) => comErro(async () => { const { id, ...m } = input; await (await P()).atualizarPedido(id, m, ctx.user.id); return { ok: true as const }; })),
  /** Link privado de 15 min para baixar os dados do titular (também exige a sessão de administrador ao abrir) */
  linkExportacao: adminProcedure.input(z.object({ id: z.number().int(), criterios: criteriosZ, formato: z.enum(["json", "csv"]) }))
    .mutation(async ({ ctx, input }) => comErro(async () => {
      const p = await P();
      const ped = await p.pedidoPorId(input.id);
      if (ped.status === "aguardando_verificacao") throw new p.PrivacidadeErro("Confirme a identidade do titular antes de exportar.", 409);
      const token = (await T()).tokenExportacao(input.id, input.criterios, input.formato);
      await p.registrarEvento(input.id, "exportacao_gerada", ctx.user.id, { formato: input.formato });
      return { url: `/api/privacidade/exportacao/${token}` };
    })),
  /** Simulação: o que seria anonimizado e o que fica retido. Não altera nada. */
  planejarAnonimizacao: adminProcedure.input(z.object({ criterios: criteriosZ })).query(async ({ input }) => comErro(async () => (await (await T()).planejarAnonimizacao(input.criterios)).relatorio)),
  /** Execução real: exige a senha do administrador (step-up), vínculo a um pedido verificado e confirmação digitada */
  anonimizar: adminProcedure.input(z.object({ id: z.number().int(), criterios: criteriosZ, senha: z.string().max(200), confirmacao: z.literal("ANONIMIZAR") }))
    .mutation(async ({ ctx, input }) => comErro(async () => {
      const p = await P();
      const ped = await p.pedidoPorId(input.id);
      if (ped.status === "aguardando_verificacao") throw new p.PrivacidadeErro("Confirme a identidade do titular antes de anonimizar.", 409);
      const { exigirAdminComSenha } = await import("../contratos/cancelamento");
      await exigirAdminComSenha(ctx.user as any, input.senha, "privacidade.anonimizar", { ip: ipDe(ctx.req) });
      const relatorio = await (await T()).executarAnonimizacao(input.criterios);
      await p.registrarEvento(input.id, "anonimizacao_executada", ctx.user.id, { anonimizados: relatorio.anonimizar, retidos: { pessoas: relatorio.retidos.cadastrosDePessoaComContrato, contratos: relatorio.retidos.contratosVinculados } });
      return relatorio;
    })),
});
