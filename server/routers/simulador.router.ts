/**
 * Simulador de financiamento do empreendimento (aba Empreendimento › Simulador).
 * Cálculo em shared/simulador.ts; condições na tabela condicoesPagamento (reajuste sem deploy).
 * Equipe e administrador (o empreendedor não acessa); a comissão só sai para o administrador.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { condicoesPagamento, empreendimentos, leadQualifications, lotes, simulacoes } from "../../drizzle/schema";
import { comissaoNaSimulacao } from "../../shared/permissoes";
import { exigirAcesso, exigirLead, pctComissaoCorretor, type PermissoesUsuario } from "../permissoes";
import {
  AVISO_LEGAL_SIMULACAO, centavos, condicoesDaLinha, evolucao, mensagemSimulacao, seloDoLote, simular, textoEntrada, textoJuros,
  type CondicoesPagamento,
} from "../../shared/simulador";
import { etapaDoLead } from "../leads/kanban";
import { ORDEM_FUNIL } from "./empreendimentosAdmin.router";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  return db as any;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Empreendimento, condições vigentes e lote — com os erros do simulador (404 / 422) */
async function contexto(db: any, slug: string, codigo: string, permissoes: PermissoesUsuario) {
  const [emp]: any[] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
  exigirAcesso(permissoes, "empreendimento", emp.id, emp.nome);
  const [cond]: any[] = await db.select().from(condicoesPagamento)
    .where(and(eq(condicoesPagamento.empreendimentoId, emp.id), eq(condicoesPagamento.ativo, true)))
    .orderBy(desc(condicoesPagamento.vigenteDesde), desc(condicoesPagamento.id)).limit(1);
  if (!cond) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Condições de pagamento não cadastradas para este empreendimento" });
  const cod = codigo.trim().toUpperCase();
  const [lote]: any[] = await db.select().from(lotes).where(and(eq(lotes.empreendimentoId, emp.id), eq(lotes.codigo, cod))).limit(1);
  if (!lote) throw new TRPCError({ code: "NOT_FOUND", message: `Chácara ${cod} não encontrada` });
  const selo = seloDoLote(lote);
  if (selo === "nao_comercializavel") throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: `Chácara ${cod} não comercializável` });
  const areaM2 = num(lote.areaM2);
  if (!areaM2) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: `Chácara ${cod} sem área cadastrada` });
  return { emp, lote, areaM2, selo, c: condicoesDaLinha(cond) as CondicoesPagamento };
}

/** Simulação com erro 422 quando a entrada passa do limite */
function calcular(areaM2: number, entrada: number, c: CondicoesPagamento, precoTabela: number | null) {
  try {
    return simular(areaM2, entrada, c, precoTabela);
  } catch (e: any) {
    throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: e?.message || "Simulação inválida" });
  }
}

const base = { slug: z.string().max(80).default("bom-jardims"), lote: z.string().trim().min(2).max(10), entrada: z.number().int().min(1).max(60) };
/** Condição de pagamento escolhida (entrada 30% ou planos A, B e C — shared/condicoesLancamento.ts) */
const condicaoInput = z.enum(["padrao", "A", "B", "C"]).default("padrao");

/** Plano da condição escolhida (planos A/B/C); prazo fora da condição → 422 */
async function planoDaCondicao(preco: number, condicao: "A" | "B" | "C", prazo: number, c: CondicoesPagamento) {
  const { planoCondicao } = await import("../../shared/condicoesLancamento");
  try { return planoCondicao(preco, condicao, prazo, c); }
  catch (e: any) { throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: e?.message || "Condição inválida" }); }
}

export const simuladorRouter = router({
  /** Lote + simulação com a entrada escolhida, opções de entrada e (só administrador) a comissão */
  simular: protectedProcedure.input(z.object(base)).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const { emp, lote, areaM2, selo, c } = await contexto(db, input.slug, input.lote, ctx.permissoes);
    const precoTabela = num(lote.precoTabela);
    const sim = calcular(areaM2, input.entrada, c, precoTabela);
    const opcoesEntrada = Array.from({ length: c.entradaMaxParcelas }, (_, k) => {
      const s = simular(areaM2, k + 1, c, precoTabela);
      return { parcelas: k + 1, valorParcela: s.parcelasEntrada[0], total: s.entradaEfetiva, desconto: k === 0 ? s.descontoAvista : 0, texto: textoEntrada(s) };
    });
    return {
      lote: { id: lote.id, codigo: lote.codigo, quadra: lote.quadra, areaM2, situacao: lote.situacao || "disponivel", selo },
      condicoes: c,
      simulacao: sim,
      opcoesEntrada,
      textoJuros: textoJuros(c),
      // Breakdown (empresa/corretor, venda direta) só para o admin; o corretor vê só a comissão dele
      ...comissaoNaSimulacao(ctx.permissoes.perfil, sim.preco, input.entrada, c, pctComissaoCorretor(ctx.permissoes, emp.id, c.comissaoCorretorPct), sim.avistaTotal.valor),
      avisoLegal: AVISO_LEGAL_SIMULACAO,
    };
  }),

  /** Evolução mês a mês (entrada + Tabela Price) */
  evolucao: protectedProcedure.input(z.object({ ...base, prazo: z.number().int().min(1).max(600) })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const { lote, areaM2, c } = await contexto(db, input.slug, input.lote, ctx.permissoes);
    const sim = calcular(areaM2, input.entrada, c, num(lote.precoTabela));
    if (!c.prazos.includes(input.prazo)) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: `Prazo de ${input.prazo} meses não está nas condições` });
    return { codigo: lote.codigo, linhas: evolucao(sim, input.prazo) };
  }),

  /** Grava a simulação (centavos) e, com lead, avança o lead para "Proposta" */
  salvar: protectedProcedure
    .input(z.object({ ...base, prazo: z.number().int().min(1).max(600), leadId: z.number().int().nullable().optional(), condicao: condicaoInput }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const { emp, lote, areaM2, selo, c } = await contexto(db, input.slug, input.lote, ctx.permissoes);
      if (selo === "vendido") throw new TRPCError({ code: "CONFLICT", message: `Chácara ${lote.codigo} já vendida — sem proposta` });
      if (input.condicao === "padrao" && !c.prazos.includes(input.prazo)) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: `Prazo de ${input.prazo} meses não está nas condições` });
      const sim = calcular(areaM2, input.condicao === "padrao" ? input.entrada : 1, c, num(lote.precoTabela));
      const pc = input.condicao === "padrao" ? null : await planoDaCondicao(sim.preco, input.condicao, input.prazo, c);
      const plano = pc
        ? { prazo: pc.prazo, parcela: pc.parcela, totalSaldo: 0, juros: pc.juros, totalPago: pc.totalPago }
        : sim.planos.find(p => p.prazo === input.prazo)!;
      let lead: any = null;
      if (input.leadId) {
        [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, input.leadId)).limit(1);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead não encontrado" });
        exigirLead(ctx.permissoes, ctx.user.id, lead);
      }
      await db.insert(simulacoes).values({
        empreendimentoId: emp.id, loteId: lote.id, leadId: lead?.id ?? null, usuarioId: ctx.user.id,
        entradaParcelas: pc ? 1 : input.entrada, prazoSaldo: input.prazo,
        precoCents: centavos(sim.preco), entradaCents: centavos(pc ? pc.entradaTotal : sim.entradaEfetiva), saldoCents: centavos(pc ? pc.saldoFinanciado : sim.saldo),
        parcelaSaldoCents: centavos(plano.parcela), totalPagoCents: centavos(plano.totalPago),
        // condicao: a forma de pagamento a que o cliente aderiu (padrao = entrada 30%; A, B, C = planos de lançamento)
        payload: { codigo: lote.codigo, areaM2, condicoes: c, condicao: input.condicao, parcelasEntrada: pc ? pc.parcelasEntrada : sim.parcelasEntrada, plano, planoCondicao: pc },
      } as any);
      let etapa: string | null = null;
      if (lead) {
        const atual = etapaDoLead(lead);
        const avanca = lead.funil !== "proprietario" && atual !== "perdido" && ORDEM_FUNIL.indexOf(atual) < ORDEM_FUNIL.indexOf("proposta");
        await db.update(leadQualifications).set({
          loteCodigo: lote.codigo, empreendimentoSlug: lead.empreendimentoSlug || emp.slug, ...(avanca ? { etapa: "proposta" } : {}), updatedAt: new Date(),
        } as any).where(eq(leadQualifications.id, lead.id));
        etapa = avanca ? "proposta" : atual;
      }
      return { success: true, etapa };
    }),

  /** Manda a simulação escolhida só para o número digitado */
  enviarWhatsApp: protectedProcedure
    .input(z.object({ ...base, prazo: z.number().int().min(1).max(600), telefone: z.string().trim().min(8).max(25), condicao: condicaoInput }))
    .mutation(async ({ input, ctx }) => {
      const { normalizePhoneBR } = await import("../../shared/telefone");
      const telefone = normalizePhoneBR(input.telefone);
      if (!telefone) throw new TRPCError({ code: "BAD_REQUEST", message: "Número inválido: informe um celular com DDD, ex.: (99) 99181-1246" });
      const db = await dbOrThrow();
      const { lote, areaM2, selo, c } = await contexto(db, input.slug, input.lote, ctx.permissoes);
      if (selo === "vendido") throw new TRPCError({ code: "CONFLICT", message: `Chácara ${lote.codigo} já vendida — sem proposta` });
      if (input.condicao === "padrao" && !c.prazos.includes(input.prazo)) throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: `Prazo de ${input.prazo} meses não está nas condições` });
      const sim = calcular(areaM2, input.condicao === "padrao" ? input.entrada : 1, c, num(lote.precoTabela));
      const pc = input.condicao === "padrao" ? null : await planoDaCondicao(sim.preco, input.condicao, input.prazo, c);
      const { enviarTexto, ZApiError } = await import("../leads/zapiClient");
      try {
        const { cartaoDoUsuario } = await import("../cartaoVendas");
        const { linhaCartao } = await import("../../shared/cartaoVendas");
        const assinatura = linhaCartao(await cartaoDoUsuario(ctx.user.id));
        const { mensagemCondicao } = await import("../../shared/condicoesLancamento");
        await enviarTexto(telefone, pc ? mensagemCondicao(lote.codigo, areaM2, pc, c, assinatura) : mensagemSimulacao(lote.codigo, sim, input.prazo, c, assinatura));
      } catch (e: any) {
        const msg = e instanceof ZApiError ? `${e.codigo}: ${e.message}` : (e?.message || "falha no envio");
        throw new Error(`WhatsApp não enviou a simulação (${msg})`);
      }
      console.log(`[Simulador] Chácara ${lote.codigo} (${pc ? `plano ${input.condicao}` : `${input.entrada}x`} + ${input.prazo}x) enviada para ${telefone}`);
      return { success: true, telefone };
    }),
});
