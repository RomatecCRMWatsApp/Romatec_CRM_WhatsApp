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
    if (e?.name === "SaasErro" || e?.name === "TalonarioErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
}
const dataZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const saasRouter = router({
  // ─── Área do assinante (corretor/empreendedor; liberada mesmo bloqueado) ───
  minhaAssinatura: protectedProcedure.query(async ({ ctx }) => (await S()).minhaAssinatura(ctx.user)),
  /** Checkout online chega na fase 2 (Mercado Pago): registra o interesse e devolve o contato da Romatec */
  minhaCheckout: protectedProcedure.input(z.object({ plano: z.string().max(40), ciclo: z.enum(["MENSAL", "ANUAL"]), metodo: z.enum(["CARTAO_RECORRENTE", "PIX", "BOLETO"]), cupom: z.string().max(40).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const s = await S();
      await s.auditar(ctx.user.id, "CHECKOUT_INICIADO", input, null);
      return { disponivel: false as const, mensagem: "O pagamento online chega em breve. Fale com a Romatec pelo WhatsApp para assinar agora — o acesso é liberado assim que o pagamento for confirmado.", whatsapp: "5599991811246" };
    }),
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
    .mutation(async ({ ctx, input }) => { admin(ctx); return (await S()).atualizarPlano(input.id, input); }),
  cupons: protectedProcedure.query(async ({ ctx }) => { admin(ctx); return (await S()).listarCupons(); }),
  criarCupom: protectedProcedure.input(z.object({
    codigo: z.string().trim().max(40).nullable().optional(), tipo: z.enum(["PERCENTUAL", "VALOR_FIXO", "PRECO_FIXO"]), valor: z.number().min(0).max(100000).optional(),
    precosFixos: z.record(z.string(), z.number().min(0)).nullable().optional(), planoAlvo: z.string().max(40).nullable().optional(), limiteUsos: z.number().int().min(1).max(100000),
    validade: dataZ.nullable().optional(), duracaoCiclos: z.number().int().min(1).max(36).optional(), descricao: z.string().max(200).nullable().optional(),
  })).mutation(async ({ ctx, input }) => { admin(ctx); return comErro(async () => (await S()).criarCupom(input, ctx.user.id)); }),
  cancelarCupom: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => { admin(ctx); return (await S()).cancelarCupom(input.id); }),

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
