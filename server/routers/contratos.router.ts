/**
 * Contratos (CPCV) e financeiro do contrato. Permissões (spec §9): criar — admin, secretário e corretor (só lead dele);
 * definitivo, ativação e cobrança — admin e secretário; cancelar — admin. O corretor só vê os contratos dele.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { declaracoesQuitacao, empreendimentos, leadQualifications, lotes, recibos, users } from "../../drizzle/schema";
import { perfilDe } from "../../shared/equipe";
import { acoesDaParcela, podeCancelarContrato, podeCriarContrato, podeGerarDefinitivo, podeOperarCobranca } from "../../shared/contratos";
import { leadsVisiveis } from "../permissoes";
import { temAcesso } from "../../shared/permissoes";
import {
  ContratoErro, condicoesDe, contratoPorId, criarContrato, dependentesDo, salvarDependentes, gateDoContrato, gerarVersao, listarContratos, pessoasDe, planoEscolhido,
  registrarAssinado, responsavelTecnicoId, juridicoDe,
} from "../contratos/servico";
import { contratoVersoes } from "../../drizzle/schema";
import {
  cancelarCobrancaAdmin, cancelarContratoAdmin, cancelarReciboAdmin, recusarSolicitacao, solicitacoesDo, solicitarCancelamento, trilhaDoContrato,
} from "../contratos/cancelamento";

export const pessoaZ = z.object({
  nome: z.string().trim().max(160), cpf: z.string().max(20), sexo: z.string().max(1).nullable().optional(),
  nacionalidade: z.string().max(40).nullable().optional(), estadoCivil: z.string().max(20).nullable().optional(), regimeBens: z.string().max(30).nullable().optional(),
  pactoAntenupcial: z.string().max(160).nullable().optional(), profissao: z.string().max(80).nullable().optional(),
  nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("")), rg: z.string().max(20).nullable().optional(),
  rgOrgao: z.string().max(20).nullable().optional(), rgUf: z.string().max(2).nullable().optional(), email: z.string().max(160).nullable().optional(),
  telefone1: z.string().max(20).nullable().optional(), cep: z.string().max(10).nullable().optional(), logradouro: z.string().max(160).nullable().optional(),
  numero: z.string().max(10).nullable().optional(), complemento: z.string().max(80).nullable().optional(), bairro: z.string().max(80).nullable().optional(),
  cidade: z.string().max(80).nullable().optional(), uf: z.string().max(2).nullable().optional(),
});
const dependenteZ = z.object({
  id: z.number().int().nullable().optional(), nome: z.string().trim().max(160), parentesco: z.string().max(10), cpf: z.string().max(20),
  nascimento: z.string().max(10).nullable().optional(), telefone1: z.string().max(20), telefone2: z.string().max(20).nullable().optional(), email: z.string().trim().max(160),
});
const planoZ = z.object({
  modalidade: z.enum(["financiado", "avista"]), entradaParcelas: z.number().int().min(1).max(12), prazo: z.number().int().min(1).max(360).optional(),
  dataPrimeiroPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Erros do serviço → tRPC (campos do formulário em error.data.campos) */
async function tratar<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e instanceof ContratoErro || e?.codigo) {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 403 ? "FORBIDDEN" : e.status === 409 ? "CONFLICT" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message, cause: e.campos ? { campos: e.campos } : undefined });
    }
    throw e;
  }
}

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Contrato visível: admin/secretário todos; corretor só os dele */
async function contratoVisivel(ctx: any, id: number) {
  const c = await tratar(() => contratoPorId(id));
  const perfil = perfilDe(ctx.user);
  if (perfil === "corretor" && c.corretorUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Este contrato é de outro corretor." });
  if (perfil === "empreendedor") throw new TRPCError({ code: "FORBIDDEN" });
  return c;
}

const exigir = (ok: boolean, msg: string) => { if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: msg }); };

export const contratosRouter = router({
  listar: protectedProcedure.input(z.object({ status: z.array(z.string()).optional() }).optional()).query(async ({ ctx, input }) => {
    const perfil = perfilDe(ctx.user as any);
    return listarContratos({ corretorUserId: perfil === "corretor" ? ctx.user.id : undefined, status: input?.status });
  }),

  /** Dados para o assistente de novo contrato */
  opcoes: protectedProcedure.input(z.object({ slug: z.string().max(80) })).query(async ({ ctx, input }) => {
    const perfil = perfilDe(ctx.user as any);
    exigir(podeCriarContrato(perfil), "Seu perfil não cria contratos.");
    const db = (await getDb()) as any;
    const [emp] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, input.slug)).limit(1);
    if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
    if (!temAcesso(ctx.permissoes.perfil, ctx.permissoes.acessos, "empreendimento", emp.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Empreendimento não habilitado para você." });
    const cond = await tratar(() => condicoesDe(emp.id));
    const ls: any[] = (await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id))).filter((l: any) => l.comercializavel !== false && l.comercializavel !== 0);
    const leads: any[] = await db.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, responsavelId: leadQualifications.responsavelId, loteCodigo: leadQualifications.loteCodigo })
      .from(leadQualifications).where(eq(leadQualifications.empreendimentoSlug, input.slug));
    const corretores: any[] = perfil === "corretor" ? [] : await db.select({ id: users.id, nome: users.name, perfil: users.perfil, role: users.role, ativo: users.ativo }).from(users);
    return {
      empreendimento: { id: emp.id, nome: emp.nome, slug: emp.slug },
      condicoes: { prazos: cond.prazos, entradaMaxParcelas: cond.entradaMaxParcelas, jurosAa: cond.jurosAaEfetivo, entradaPct: cond.entradaPct },
      lotes: ls.filter(l => (l.situacao ?? "disponivel") === "disponivel").map(l => ({ codigo: l.codigo, quadra: l.quadra, areaM2: Number(l.areaM2), precoTabela: l.precoTabela != null ? Number(l.precoTabela) : null }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })),
      leads: leadsVisiveis(ctx.permissoes, ctx.user.id, leads).map(l => ({ id: l.id, nome: l.nome ?? l.phone, telefone: l.phone, loteCodigo: l.loteCodigo })),
      corretores: corretores.filter(u => u.ativo !== false && u.ativo !== 0 && (u.role === "admin" || ["corretor", "secretario", "equipe"].includes(String(u.perfil))))
        .map(u => ({ id: u.id, nome: u.nome ?? `#${u.id}` })),
      euId: ctx.user.id,
    };
  }),

  /** Prévia do plano (o servidor recalcula tudo na criação; o front nunca manda valores) */
  simular: protectedProcedure.input(z.object({ slug: z.string().max(80), lote: z.string().max(10), plano: planoZ, corretorUserId: z.number().int().optional() }))
    .query(async ({ ctx, input }) => tratar(async () => {
      const db = (await getDb()) as any;
      const [emp] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, input.slug)).limit(1);
      const [l] = await db.select().from(lotes).where(and(eq(lotes.empreendimentoId, emp.id), eq(lotes.codigo, input.lote))).limit(1);
      if (!l) throw new ContratoErro("LOTE", "Chácara não encontrada", 404);
      const j = await juridicoDe(emp.id);
      const resp = await responsavelTecnicoId(j.defaults);
      const plano = planoEscolhido(input.plano, Number(l.areaM2), l.precoTabela != null ? Number(l.precoTabela) : null, await condicoesDe(emp.id), (input.corretorUserId ?? ctx.user.id) !== resp);
      const { parcelas, ...resumo } = plano;
      return { ...resumo, primeiras: parcelas.slice(0, 3), ultima: parcelas.at(-1) };
    })),

  criar: protectedProcedure.input(z.object({
    slug: z.string().max(80), lote: z.string().max(10), leadId: z.number().int().nullable().optional(), corretorUserId: z.number().int().optional(),
    plano: planoZ, comprador: pessoaZ, conjuge: pessoaZ.nullable().optional(), dependentes: z.array(dependenteZ).max(6).optional(),
    condicoes: z.object({ especificas: z.string().max(2000).optional(), modoAssinatura: z.enum(["eletronica", "manuscrita"]).optional() }).optional(),
  })).mutation(async ({ ctx, input }) => {
    const perfil = perfilDe(ctx.user as any);
    exigir(podeCriarContrato(perfil), "Seu perfil não cria contratos.");
    const db = (await getDb()) as any;
    if (input.leadId) {
      const [l] = await db.select({ responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(eq(leadQualifications.id, input.leadId)).limit(1);
      if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });
      if (leadsVisiveis(ctx.permissoes, ctx.user.id, [l]).length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Este lead está com outro responsável." });
    } else if (perfil === "corretor") {
      throw new TRPCError({ code: "FORBIDDEN", message: "O corretor cria contrato a partir de um lead dele." });
    }
    const [emp] = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, input.slug)).limit(1);
    if (!emp || !temAcesso(ctx.permissoes.perfil, ctx.permissoes.acessos, "empreendimento", emp.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Empreendimento não habilitado para você." });
    return tratar(() => criarContrato({
      empreendimentoSlug: input.slug, loteCodigo: input.lote, leadId: input.leadId ?? null,
      corretorUserId: perfil === "corretor" ? ctx.user.id : input.corretorUserId ?? ctx.user.id,
      plano: input.plano, comprador: input.comprador as any, conjuge: (input.conjuge ?? null) as any, dependentes: input.dependentes ?? [], condicoes: input.condicoes,
    }, ctx.user.id));
  }),

  /** Carteirinhas: cada pessoa (titular, cônjuge, dependentes) com a carteira vigente e o que falta para emitir */
  carteirinhas: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const c = await contratoVisivel(ctx, input.id);
    const { situacaoCarteirinhas } = await import("../contratos/carteirinhas");
    return tratar(() => situacaoCarteirinhas(c.id));
  }),

  /** Dependentes das carteirinhas: dá para incluir/corrigir depois de criado (contrato não cancelado) */
  salvarDependentes: protectedProcedure.input(z.object({ id: z.number().int(), dependentes: z.array(dependenteZ).max(6) })).mutation(async ({ ctx, input }) => {
    const c = await contratoVisivel(ctx, input.id);
    exigir(podeCriarContrato(perfilDe(ctx.user as any)), "Seu perfil não altera contratos.");
    if (["cancelado", "distratado"].includes(c.status)) throw new TRPCError({ code: "CONFLICT", message: "Contrato cancelado" });
    await tratar(() => salvarDependentes(c.id, input.dependentes as any));
    // Dependente completo (com foto) em contrato assinado: carteirinha registrada na hora
    const { emitirCarteirasAuto } = await import("../contratos/carteirinhas");
    return { ok: true, emitidas: await emitirCarteirasAuto(c.id) };
  }),

  detalhe: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const c = await contratoVisivel(ctx, input.id);
    const perfil = perfilDe(ctx.user as any);
    const db = (await getDb()) as any;
    const [emp] = await db.select({ nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
    const { comprador, conjuge } = await pessoasDe(c.id);
    const versoes: any[] = await db.select().from(contratoVersoes).where(eq(contratoVersoes.contratoId, c.id));
    const plano = typeof c.simulacaoJson === "string" ? JSON.parse(c.simulacaoJson) : c.simulacaoJson;
    const gate = await gateDoContrato(c.id).catch((e: any) => ({ erro: String(e?.message ?? e) }) as any);
    const operar = podeOperarCobranca(perfil);
    let financeiro: any = null;
    if (operar || perfil === "corretor") {
      const F = await import("../financeiro/servico");
      const { totalDeBlocos } = await import("../financeiro/dados");
      const { configAsaas } = await import("../financeiro/asaas");
      const cobs = await F.cobrancasDoContrato(c.id);
      const recs: any[] = cobs.length ? await db.select().from(recibos).where(inArray(recibos.cobrancaId, cobs.map(x => x.id))) : [];
      const decls: any[] = await db.select().from(declaracoesQuitacao).where(eq(declaracoesQuitacao.contratoId, c.id));
      const h = hoje();
      financeiro = {
        asaasConfigurado: !!configAsaas(process.env, emp?.slug ?? "bom-jardims"),
        blocos: totalDeBlocos(plano),
        cobrancas: cobs.map(x => {
          const rec = recs.find(r => r.cobrancaId === x.id);
          return {
            id: x.id, tipo: x.tipo, numero: x.numero, total: x.total, vencimento: x.vencimento, valor: x.valor, status: x.status, pagoEm: x.pagoEm || null,
            valorPago: x.valorPago, valorOriginal: x.valorOriginal, juros: x.juros, amortizacao: x.amortizacao, saldoApos: x.saldoDevedor,
            reciboId: rec?.id ?? null, reciboNumero: rec?.numero ?? null, reciboCancelado: !!rec?.canceladoEm, reciboEnviado: !!rec?.enviadoEm, reciboErro: rec?.envioErro ?? null,
            acoes: acoesDaParcela({ status: x.status, vencimento: x.vencimento, vencimentoOriginal: x.vencimentoOriginal, asaas: !!x.asaasPaymentId, recibo: !!rec }, h),
          };
        }),
        declaracoes: decls.map(d => ({ ano: Number(d.anoRef), status: d.status, motivo: d.motivo, valorTotal: d.valorTotal != null ? Number(d.valorTotal) : null })),
      };
    }
    return {
      contrato: {
        id: c.id, numero: c.numero, status: c.status, loteCodigo: c.loteCodigo, modoAssinatura: c.modoAssinatura, codigoVerificacao: c.codigoVerificacao,
        empreendimento: emp?.nome ?? "", empreendimentoSlug: emp?.slug ?? "", criadoEm: c.criadoEm, corretorUserId: c.corretorUserId,
      },
      plano: { ...plano, parcelas: undefined },
      comprador, conjuge,
      versoes: versoes.sort((a, b) => b.versao - a.versao).map(v => ({ versao: v.versao, etapa: v.etapa, bytes: v.bytes, sha256: v.sha256, criadoEm: v.criadoEm })),
      gate,
      pode: {
        definitivo: podeGerarDefinitivo(perfil), cobranca: operar, cancelar: podeCancelarContrato(perfil),
        solicitarCancelamento: (perfil === "corretor" || perfil === "secretario") && !["cancelado", "distratado"].includes(c.status),
      },
      cancelamento: c.canceladoEm ? { em: c.canceladoEm, motivo: c.canceladoMotivo, por: c.canceladoPor } : null,
      solicitacoes: await solicitacoesDo(c.id),
      dependentes: await dependentesDo(c.id),
      financeiro,
    };
  }),

  gerar: protectedProcedure.input(z.object({ id: z.number().int(), alvo: z.enum(["minuta", "definitivo"]) })).mutation(async ({ ctx, input }) => {
    if (input.alvo === "definitivo") exigir(podeGerarDefinitivo(perfilDe(ctx.user as any)), "O definitivo é gerado pelo administrador ou pela secretaria.");
    await contratoVisivel(ctx, input.id);
    return tratar(() => gerarVersao(input.id, input.alvo));
  }),

  registrarAssinado: protectedProcedure.input(z.object({ id: z.number().int(), pdfBase64: z.string().max(30_000_000).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeGerarDefinitivo(perfilDe(ctx.user as any)), "Só o administrador ou a secretaria ativam o contrato.");
      await contratoVisivel(ctx, input.id);
      return tratar(() => registrarAssinado(input.id, input.pdfBase64 ? Buffer.from(input.pdfBase64, "base64") : null, ctx.user.id));
    }),

  /**
   * Cancelamento: SÓ o administrador, confirmando com a SENHA DE LOGIN dele (step-up, validada no servidor).
   * Libera a chácara, cancela as cobranças futuras no Asaas e grava a trilha. Vale para contrato em qualquer etapa.
   */
  cancelar: protectedProcedure.input(z.object({ id: z.number().int(), motivo: z.string().trim().min(3).max(300), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeCancelarContrato(perfilDe(ctx.user as any)), "Só o administrador cancela contratos.");
      await contratoVisivel(ctx, input.id);
      return tratar(() => cancelarContratoAdmin(input.id, ctx.user as any, input.senha, input.motivo, (ctx as any).req?.ip ?? null));
    }),

  /** Corretor (só os dele) e secretária: pedem o cancelamento; vai para o sininho/push do administrador */
  solicitarCancelamento: protectedProcedure.input(z.object({ id: z.number().int(), motivo: z.string().trim().min(5).max(300) })).mutation(async ({ ctx, input }) => {
    await contratoVisivel(ctx, input.id);
    return tratar(() => solicitarCancelamento(input.id, ctx.user as any, input.motivo));
  }),

  recusarSolicitacao: protectedProcedure.input(z.object({ solicitacaoId: z.number().int(), resposta: z.string().trim().min(3).max(300), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeCancelarContrato(perfilDe(ctx.user as any)), "Só o administrador decide os pedidos de cancelamento.");
      return tratar(() => recusarSolicitacao(input.solicitacaoId, ctx.user as any, input.senha, input.resposta, (ctx as any).req?.ip ?? null));
    }),

  /** Cancelar UMA cobrança (não paga): só admin + senha */
  cancelarCobranca: protectedProcedure.input(z.object({ cobrancaId: z.number().int(), motivo: z.string().trim().min(3).max(300), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeCancelarContrato(perfilDe(ctx.user as any)), "Só o administrador cancela cobranças.");
      return tratar(() => cancelarCobrancaAdmin(input.cobrancaId, ctx.user as any, input.senha, input.motivo, (ctx as any).req?.ip ?? null));
    }),

  /** Cancelar recibo (nunca apaga; a verificação pública passa a dizer "cancelado"): só admin + senha */
  cancelarRecibo: protectedProcedure.input(z.object({ reciboId: z.number().int(), motivo: z.string().trim().min(3).max(300), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeCancelarContrato(perfilDe(ctx.user as any)), "Só o administrador cancela recibos.");
      return tratar(() => cancelarReciboAdmin(input.reciboId, ctx.user as any, input.senha, input.motivo, (ctx as any).req?.ip ?? null));
    }),

  /** Trilha de auditoria do contrato (cancelamentos, pedidos, tentativas): só admin */
  trilha: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    exigir(podeCancelarContrato(perfilDe(ctx.user as any)), "Só o administrador vê a trilha.");
    return trilhaDoContrato(input.id);
  }),

  /** Emite no Asaas as parcelas do carnê (bloco de 12) — contrato ativo e chave configurada */
  emitirCarne: protectedProcedure.input(z.object({ id: z.number().int(), bloco: z.number().int().min(1).max(60) })).mutation(async ({ ctx, input }) => {
    exigir(podeOperarCobranca(perfilDe(ctx.user as any)), "Cobrança é com o administrador ou a secretaria.");
    await contratoVisivel(ctx, input.id);
    const { emitirCarneNoAsaas } = await import("../financeiro/emissao");
    return tratar(() => emitirCarneNoAsaas(input.id, input.bloco, { usuarioId: ctx.user.id }));
  }),

  // ─── Assinatura eletrônica ──────────────────────────────────────────────────

  /** Signatários: previstos (antes do envio, com pendências) ou os do envio (status, método, link individual) */
  assinaturas: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const c = await contratoVisivel(ctx, input.id);
    const A = await import("../assinatura/servico");
    const { ROTULO_PAPEL, ROTULO_METODO } = await import("../assinatura/pdf");
    const db = (await getDb()) as any;
    const { assinaturaSignatarios, assinaturaEventos } = await import("../../drizzle/schema");
    const sigs: any[] = await db.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, c.id));
    const operar = podeGerarDefinitivo(perfilDe(ctx.user as any));
    if (!sigs.length) {
      const previstos = await tratar(() => A.signatariosPrevistos(c.id)).catch(() => []);
      return { enviado: false, previstos: previstos.map(s => ({ ...s, papelRotulo: ROTULO_PAPEL[s.papel] ?? s.papel })), pendencias: A.pendenciasSignatarios(previstos), signatarios: [], eventos: [], manifesto: false };
    }
    const evs: any[] = await db.select().from(assinaturaEventos).where(eq(assinaturaEventos.contratoId, c.id));
    return {
      enviado: true, previstos: [], pendencias: [], manifesto: !!c.manifestoArquivo,
      signatarios: sigs.sort((a, b) => a.ordem - b.ordem).map(s => ({
        id: s.id, papel: s.papel, papelRotulo: ROTULO_PAPEL[s.papel] ?? s.papel, nome: s.nome, metodo: s.metodo, metodoRotulo: ROTULO_METODO[s.metodo] ?? s.metodo,
        status: s.status, assinadoEm: s.assinadoEm, expiraEm: s.expiraEm, revisaoManual: !!Number(s.revisaoManual), whatsapp: !!s.whatsapp,
        link: operar ? A.linkDoSignatario(s.token) : null,
      })),
      eventos: evs.sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 30).map(e => ({ evento: e.evento, signatarioId: e.signatarioId, criadoEm: e.criadoEm, detalhe: e.detalhe })),
    };
  }),

  enviarParaAssinatura: protectedProcedure.input(z.object({ id: z.number().int(), metodos: z.record(z.string(), z.enum(["avancada", "govbr", "icp_a1"])).default({}) }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeGerarDefinitivo(perfilDe(ctx.user as any)), "O envio para assinatura é com o administrador ou a secretaria.");
      await contratoVisivel(ctx, input.id);
      const A = await import("../assinatura/servico");
      return tratar(() => A.enviarParaAssinatura(input.id, input.metodos as any, ctx.user.id));
    }),

  reenviarConvite: protectedProcedure.input(z.object({ id: z.number().int(), signatarioId: z.number().int() })).mutation(async ({ ctx, input }) => {
    exigir(podeGerarDefinitivo(perfilDe(ctx.user as any)), "O envio para assinatura é com o administrador ou a secretaria.");
    await contratoVisivel(ctx, input.id);
    const db = (await getDb()) as any;
    const { assinaturaSignatarios } = await import("../../drizzle/schema");
    // Reenvio renova a validade do link (15 dias)
    await db.update(assinaturaSignatarios).set({ expiraEm: new Date(Date.now() + 15 * 86_400_000) })
      .where(and(eq(assinaturaSignatarios.id, input.signatarioId), eq(assinaturaSignatarios.contratoId, input.id)));
    const A = await import("../assinatura/servico");
    const [r] = await A.enviarConvites(input.id, input.signatarioId);
    return r ?? { enviado: false, erro: "Signatário já assinou" };
  }),

  /** Caixas de assinatura do contrato (ou do gabarito do modelo) para a tela de posicionar */
  posicoes: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const c = await contratoVisivel(ctx, input.id);
    const A = await import("../assinatura/servico");
    const j = await tratar(() => juridicoDe(c.empreendimentoId));
    const { ROTULO_PAPEL } = await import("../assinatura/pdf");
    const previstos = await A.signatariosPrevistos(c.id).catch(() => []);
    return {
      caixas: await A.posicoesDe(c.id, j.modeloVersao), modeloVersao: j.modeloVersao, status: c.status, temPdf: !!c.pdfAtual,
      papeis: previstos.map(s => ({ papel: s.papel, rotulo: ROTULO_PAPEL[s.papel] ?? s.papel, nome: s.nome })),
    };
  }),

  salvarPosicoes: protectedProcedure.input(z.object({
    id: z.number().int(), gabarito: z.boolean().default(false),
    caixas: z.array(z.object({ papel: z.string().max(30), pagina: z.number().int(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).max(20),
  })).mutation(async ({ ctx, input }) => {
    exigir(podeCriarContrato(perfilDe(ctx.user as any)), "Seu perfil não posiciona assinaturas.");
    const c = await contratoVisivel(ctx, input.id);
    if (!["rascunho", "minuta", "apto_assinatura"].includes(c.status)) throw new TRPCError({ code: "CONFLICT", message: "As posições só mudam antes do envio para assinatura." });
    const A = await import("../assinatura/servico");
    await tratar(() => A.salvarPosicoes(input.caixas, { contratoId: c.id }));
    if (input.gabarito) {
      exigir(podeGerarDefinitivo(perfilDe(ctx.user as any)), "O gabarito do modelo é do administrador ou da secretaria.");
      const j = await tratar(() => juridicoDe(c.empreendimentoId));
      await tratar(() => A.salvarPosicoes(input.caixas, { modeloVersao: j.modeloVersao }));
    }
    return { ok: true };
  }),

  /** Links assinados (7 dias) para enviar ao comprador: carnê do bloco e boleto de uma parcela */
  linkComprador: protectedProcedure.input(z.object({ id: z.number().int(), bloco: z.union([z.number().int().min(1), z.literal("completo")]).optional(), cobrancaId: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      exigir(podeOperarCobranca(perfilDe(ctx.user as any)), "Cobrança é com o administrador ou a secretaria.");
      await contratoVisivel(ctx, input.id);
      const { assinarLink } = await import("../financeiro/links");
      const { urlPublica } = await import("../financeiro/servico");
      const caminho = input.cobrancaId ? `/api/financeiro/cobrancas/${input.cobrancaId}/boleto-a4.pdf` : `/api/financeiro/contratos/${input.id}/carne-v2.pdf?bloco=${input.bloco ?? 1}`;
      return { url: `${urlPublica()}${assinarLink(caminho)}` };
    }),
});
