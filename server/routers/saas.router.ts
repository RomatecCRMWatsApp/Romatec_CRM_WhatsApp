/**
 * Camada SaaS (server/saas): área do assinante (liberada mesmo bloqueado — shared/saas LIVRES_SEM_LICENCA),
 * Admin › SaaS (só o administrador; métricas também para a secretária) e Talonários (administrador e secretária).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const S = () => import("../saas/servico");
const T = () => import("../saas/talonarios");

function exigir(ctx: any, perfis: string[]) {
  if (!perfis.includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "Área restrita ao escritório." });
}
const admin = (ctx: any) => exigir(ctx, ["admin"]);
const escritorio = (ctx: any) => exigir(ctx, ["admin", "secretario"]);

async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (["SaasErro", "TalonarioErro", "NfseErro", "AvalieimobErro"].includes(e?.name)) {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status === 412 ? "PRECONDITION_FAILED" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}
const dataZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const STATUS_NFSE = ["PENDENTE", "ENVIADA", "EMITIDA", "REJEITADA", "CANCELADA"] as const;

export const saasRouter = router({
  // ─── Área do assinante (corretor/empreendedor; liberada mesmo bloqueado) ───
  minhaAssinatura: protectedProcedure.query(async ({ ctx }) => (await S()).minhaAssinatura(ctx.user)),
  /** Checkout pelo Mercado Pago: cartão recorrente (link do MP) ou fatura Pix/boleto (QR/link na hora) */
  minhaCheckout: protectedProcedure.input(z.object({ plano: z.string().max(40), ciclo: z.enum(["MENSAL", "ANUAL"]), metodo: z.enum(["CARTAO_RECORRENTE", "PIX", "BOLETO"]), cupom: z.string().max(40).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const C = await import("../saas/cobranca");
      const { mpConfigurado } = await import("../saas/mercadopago");
      const modo = await C.modoMp();
      if (!mpConfigurado(modo)) {
        const s = await S();
        await s.auditar(ctx.user.id, "CHECKOUT_INICIADO", { ...input, semMercadoPago: true }, null);
        return { disponivel: false as const, mensagem: "O pagamento online ainda não está disponível. Fale com a Romatec pelo WhatsApp para assinar — o acesso é liberado assim que o pagamento for confirmado.", whatsapp: "5599991811246" };
      }
      try {
        return { disponivel: true as const, ...(await C.iniciarCheckout(ctx.user, input)) };
      } catch (e: any) {
        if (e?.name === "CobrancaErro" || e?.name === "MpErro") throw new TRPCError({ code: e.status === 412 ? "PRECONDITION_FAILED" : e.status >= 500 ? "BAD_GATEWAY" as any : "BAD_REQUEST", message: e.message });
        throw e;
      }
    }),
  /** Cancela a renovação: o acesso vale até o fim do período pago */
  minhaCancelar: protectedProcedure.mutation(async ({ ctx }) => {
    const C = await import("../saas/cobranca");
    try { return await C.cancelarAssinatura(ctx.user); } catch (e: any) {
      if (e?.name === "CobrancaErro" || e?.name === "MpErro") throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  }),
  /** Upgrade Essencial → Pro: prévia da diferença proporcional e a fatura Pix/boleto (o plano troca ao pagar) */
  minhaUpgrade: protectedProcedure.query(async ({ ctx }) => (await import("../saas/cobranca")).previaUpgrade(ctx.user)),
  minhaUpgradeCheckout: protectedProcedure.input(z.object({ metodo: z.enum(["PIX", "BOLETO"]) })).mutation(async ({ ctx, input }) => {
    const C = await import("../saas/cobranca");
    const { mpConfigurado } = await import("../saas/mercadopago");
    if (!mpConfigurado(await C.modoMp())) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O pagamento online ainda não está disponível. Fale com a Romatec pelo WhatsApp." });
    try { return await C.iniciarUpgrade(ctx.user, input); } catch (e: any) {
      if (e?.name === "CobrancaErro" || e?.name === "MpErro") throw new TRPCError({ code: e.status >= 500 ? "BAD_GATEWAY" as any : "BAD_REQUEST", message: e.message });
      throw e;
    }
  }),
  /** Admin: modo do Mercado Pago (teste/produção) e eventos do webhook */
  mercadoPago: protectedProcedure.query(async ({ ctx }) => {
    admin(ctx);
    const C = await import("../saas/cobranca");
    const { mpConfigurado } = await import("../saas/mercadopago");
    return { modo: await C.modoMp(), teste: mpConfigurado("teste"), producao: mpConfigurado("producao"), webhook: !!process.env.MP_WEBHOOK_SECRET, eventos: await C.eventosRecentes() };
  }),
  /** Confere no MP, agora, as faturas Pix/boleto em aberto (a rotina faz isso a cada 10 min) */
  conciliarMp: protectedProcedure.mutation(async ({ ctx }) => { admin(ctx); return (await import("../saas/cobranca")).conciliarFaturasAbertas(); }),
  definirModoMp: protectedProcedure.input(z.object({ modo: z.enum(["teste", "producao"]) })).mutation(async ({ ctx, input }) => {
    admin(ctx);
    const C = await import("../saas/cobranca");
    return C.definirModoMp(input.modo, ctx.user.id);
  }),
  /** AvalieImob incluído no plano (Corretor Pro): situação do botão e o link de entrada única (JWT de 60 s) */
  minhaAvalieimob: protectedProcedure.query(async ({ ctx }) => (await import("../saas/avalieimob")).acessoDoUsuario(ctx.user)),
  minhaAvalieimobSso: protectedProcedure.mutation(async ({ ctx }) => comErro(async () => (await import("../saas/avalieimob")).linkSso(ctx.user))),
  cupomValidar: protectedProcedure.input(z.object({ codigo: z.string().trim().min(2).max(40), plano: z.string().max(40), ciclo: z.enum(["MENSAL", "ANUAL"]) }))
    .mutation(async ({ input }) => comErro(async () => (await S()).validarCupom(input.codigo, input.plano, input.ciclo))),

  // ─── Admin › SaaS ───
  metricas: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return (await S()).metricas(); }),
  definirLicenciamento: protectedProcedure.input(z.object({ ativo: z.boolean(), cortesiaAte: dataZ.nullable().optional() }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await S()).definirLicenciamento(input.ativo, input.cortesiaAte ?? null, ctx.user.id)); }),
  assinaturas: protectedProcedure.query(async ({ ctx }) => { admin(ctx); return (await S()).listarAssinaturas(); }),
  semAssinatura: protectedProcedure.query(async ({ ctx }) => { admin(ctx); return (await S()).semAssinatura(); }),
  definirAssinatura: protectedProcedure.input(z.object({
    usuarioId: z.number().int(), empreendimentoId: z.number().int().nullable().optional(), planoCodigo: z.string().max(40),
    origem: z.enum(["CORTESIA", "PACOTE_GESTAO", "PAGA"]), ciclo: z.enum(["MENSAL", "ANUAL"]).optional(), periodoFim: dataZ.nullable().optional(),
    contratoGestaoNr: z.string().trim().max(40).nullable().optional(), precoOverride: z.number().min(0).max(100000).nullable().optional(), motivo: z.string().trim().min(3).max(300),
  })).mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await S()).definirAssinatura(input, ctx.user.id)); }),
  pagamentoManual: protectedProcedure.input(z.object({ id: z.number().int(), ciclo: z.enum(["MENSAL", "ANUAL"]), valor: z.number().positive().max(100000), observacao: z.string().trim().max(300).default("") }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await S()).registrarPagamentoManual(input.id, input, ctx.user.id)); }),
  acao: protectedProcedure.input(z.object({
    id: z.number().int(), tipo: z.enum(["bloquear", "desbloquear", "override", "tolerancia", "cancelar"]), motivo: z.string().trim().min(3).max(300),
    preco: z.number().min(0).max(100000).nullable().optional(), dias: z.number().int().min(0).max(60).optional(), ate: dataZ.nullable().optional(),
  })).mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await S()).acaoAssinatura(input.id, input, ctx.user.id)); }),
  planos: protectedProcedure.query(async ({ ctx }) => { admin(ctx); return (await S()).listarPlanos(); }),
  atualizarPlano: protectedProcedure.input(z.object({ id: z.number().int(), nome: z.string().trim().min(3).max(80).optional(), precoMensal: z.number().min(0).max(100000).optional(), precoAnual: z.number().min(0).max(1000000).nullable().optional(), conteudo: z.string().max(2000).optional(), ativo: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      admin(ctx);
      const antes = (await (await S()).listarPlanos()).find(p => p.id === input.id);
      const r = await (await S()).atualizarPlano(input.id, input);
      // Preço mudou: as assinaturas no cartão recorrente passam a cobrar o valor novo (Pix/boleto já usam o plano)
      const mudou = !!antes && ((input.precoMensal !== undefined && Number(input.precoMensal) !== Number(antes.precoMensal))
        || (input.precoAnual !== undefined && (input.precoAnual == null ? antes.precoAnual != null : Number(input.precoAnual) !== Number(antes.precoAnual))));
      if (mudou) {
        const reajuste = await (await import("../saas/cobranca")).reajustarRecorrencias(input.id, ctx.user.id);
        return { ...r, reajuste };
      }
      return { ...r, reajuste: null };
    }),
  cupons: protectedProcedure.query(async ({ ctx }) => { admin(ctx); return (await S()).listarCupons(); }),
  criarCupom: protectedProcedure.input(z.object({
    codigo: z.string().trim().max(40).nullable().optional(), tipo: z.enum(["PERCENTUAL", "VALOR_FIXO", "PRECO_FIXO"]), valor: z.number().min(0).max(100000).optional(),
    precosFixos: z.record(z.string(), z.number().min(0)).nullable().optional(), planoAlvo: z.string().max(40).nullable().optional(), limiteUsos: z.number().int().min(1).max(100000),
    validade: dataZ.nullable().optional(), duracaoCiclos: z.number().int().min(1).max(36).optional(), descricao: z.string().max(200).nullable().optional(),
  })).mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await S()).criarCupom(input, ctx.user.id)); }),
  cancelarCupom: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => { admin(ctx); return (await S()).cancelarCupom(input.id); }),

  // ─── NFS-e em fila (emissão pela Spedy ou no portal da prefeitura) ───
  nfse: protectedProcedure.input(z.object({ status: z.enum(STATUS_NFSE).optional() }).optional())
    .query(async ({ ctx, input }) => { admin(ctx); const N = await import("../saas/nfse"); await N.sincronizarFilaNfse(); return N.listarNfse(input?.status); }),
  nfseEmitida: protectedProcedure.input(z.object({ id: z.number().int(), numero: z.string().trim().min(1).max(30), codigoVerificacao: z.string().trim().max(60).nullable().optional() }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await import("../saas/nfse")).marcarEmitida(input.id, input, ctx.user.id)); }),
  nfseAtualizarTomador: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await import("../saas/nfse")).atualizarTomador(input.id)); }),
  nfseCancelar: protectedProcedure.input(z.object({ id: z.number().int(), motivo: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await import("../saas/nfse")).cancelarNfse(input.id, input.motivo)); }),
  nfseCsv: protectedProcedure.input(z.object({ status: z.enum(STATUS_NFSE).optional() }).optional())
    .mutation(async ({ ctx, input }) => { admin(ctx); return { csv: await (await import("../saas/nfse")).exportarCsv(input?.status) }; }),
  /** Spedy: situação da integração (ambiente, empresa, webhook) — sem a chave */
  spedySituacao: protectedProcedure.query(async ({ ctx }) => { admin(ctx); return (await import("../saas/spedy")).situacaoSpedy(); }),
  /** Spedy: emite (ou reenvia a rejeitada) a NFS-e da fila */
  spedyEmitir: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await import("../saas/spedy")).emitirPelaSpedy(input.id, ctx.user.id)); }),
  /** Spedy: consulta o status da nota agora */
  spedyConsultar: protectedProcedure.input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await import("../saas/spedy")).consultarNaSpedy(input.id)); }),
  /** Spedy: cadastra o webhook invoice.status_changed apontando para o CRM */
  spedyWebhook: protectedProcedure.mutation(async ({ ctx }) => { admin(ctx); return comErro(async () => (await import("../saas/spedy")).configurarWebhook()); }),
  /** Situação da integração com o AvalieImob (sem expor o segredo) */
  avalieimobIntegracao: protectedProcedure.query(async ({ ctx }) => {
    admin(ctx);
    const A = await import("../saas/avalieimob");
    const { getDb } = await import("../db");
    const { saasAssinaturas } = await import("../../drizzle/schema");
    const db: any = await getDb();
    const as: any[] = db ? await db.select({ estado: saasAssinaturas.avalieimobEstado, erro: saasAssinaturas.avalieimobErro }).from(saasAssinaturas) : [];
    return { configurado: A.integracaoConfigurada(), url: A.urlAvalieimob(), ativos: as.filter(a => a.estado === "ATIVO").length, erros: as.filter(a => a.erro).map(a => a.erro as string).slice(0, 10) };
  }),

  // ─── Talonários e corretor externo (administrador e secretária) ───
  externos: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return (await T()).listarExternos(); }),
  criarExterno: protectedProcedure.input(z.object({ nome: z.string().trim().min(3).max(150), cpf: z.string().max(20), creci: z.string().max(20).nullable().optional(), creciUf: z.string().max(2).nullable().optional(), telefone: z.string().max(25).nullable().optional(), email: z.string().max(160).nullable().optional(), observacao: z.string().max(300).nullable().optional() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await T()).criarExterno(input, ctx.user.id)); }),
  /** "Convidar para o digital": abre o convite do Recrutamento com os dados do externo */
  convidarExterno: protectedProcedure.input(z.object({ externoId: z.number().int(), empreendimentoSlug: z.string().max(80).nullable().optional() })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    return comErro(async () => {
      const t = await T();
      const x = (await t.listarExternos()).find(e => e.id === input.externoId);
      if (!x) throw Object.assign(new Error("Corretor externo não encontrado"), { name: "TalonarioErro", status: 404 });
      if (!x.telefone) throw Object.assign(new Error("Cadastre o WhatsApp do corretor antes de convidar"), { name: "TalonarioErro", status: 400 });
      const R = await import("../recrutamento/servico");
      const conv = await R.criarConvite({ perfil: "corretor", nome: x.nome, telefone: x.telefone, empreendimentoSlug: input.empreendimentoSlug ?? null }, ctx.user.id);
      await t.vincularConvite(x.id, conv.id);
      const env = await R.enviarConvite(conv.id);
      return { ...conv, enviado: env.enviado, texto: env.texto };
    });
  }),
  /** Corretores com login (para entregar bloco a quem ainda não assinou) */
  corretoresComLogin: protectedProcedure.query(async ({ ctx }) => {
    escritorio(ctx);
    const { getDb } = await import("../db");
    const { users } = await import("../../drizzle/schema");
    const db: any = await getDb();
    const us: any[] = db ? await db.select({ id: users.id, name: users.name, perfil: users.perfil, role: users.role, ativo: users.ativo }).from(users) : [];
    return us.filter(u => perfilDe(u) === "corretor" && u.ativo !== false && u.ativo !== 0).map(u => ({ id: u.id as number, nome: (u.name ?? "—") as string }));
  }),
  talonarios: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return (await T()).listarTalonarios(); }),
  folhas: protectedProcedure.input(z.object({ talonarioId: z.number().int() })).query(async ({ ctx, input }) => { escritorio(ctx); return (await T()).folhasDoTalonario(input.talonarioId); }),
  entregarBloco: protectedProcedure.input(z.object({ tipo: z.enum(["CONTRATO", "RECIBO"]), numeroInicial: z.number().int().min(1), numeroFinal: z.number().int().min(1), externoId: z.number().int().nullable().optional(), usuarioId: z.number().int().nullable().optional(), entregueEm: dataZ, observacao: z.string().max(255).nullable().optional() }))
    .mutation(async ({ ctx, input }) => { escritorio(ctx); return comErro(async () => (await T()).entregarBloco(input, ctx.user.id)); }),
  pendencias: protectedProcedure.query(async ({ ctx }) => { escritorio(ctx); return (await T()).pendencias(); }),
});
