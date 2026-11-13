/**
 * Portal do corpo jurídico (advogados do empreendimento): estatuto, modelos de contrato, contratos assinados, vias,
 * aditivos e o financeiro do empreendimento (para o acompanhamento e o percentual do escritório), mais as pontuações
 * jurídicas — o advogado aponta alterações/indagações por documento e o administrador responde.
 * O advogado vê só o empreendimento do login dele; o administrador escolhe o empreendimento.
 */
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { contratoAditivos, contratos, empreendimentos, juridicoApontamentos, lotes, users } from "../../drizzle/schema";
import { perfilDe } from "../../shared/equipe";

const slugZ = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional() }).optional();

async function contexto(ctx: any, slugPedido?: string | null, o: { empreendedor?: boolean } = {}) {
  const perfil = perfilDe(ctx.user);
  const ok = perfil === "juridico" || perfil === "admin" || (o.empreendedor && perfil === "empreendedor");
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "O portal jurídico é dos advogados do empreendimento e do administrador." });
  const db: any = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const slug: string | null = perfil === "juridico" || perfil === "empreendedor" ? ctx.user.empreendimentoSlug ?? null : (slugPedido || ctx.user.empreendimentoSlug || "bom-jardims");
  if (!slug) throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso não tem empreendimento definido. Fale com o administrador." });
  const [emp]: any[] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
  return { db, perfil, slug, emp };
}

/** Documentos do empreendimento para leitura e pontuação (PDFs gerados na hora com o cliente fictício) */
function documentos(slug: string, lote: string) {
  const m = (tipo: string) => `/api/contratos/modelos/${tipo}.pdf?slug=${slug}`;
  const c = (plano?: string) => `/api/contratos/modelo.pdf?slug=${slug}&lote=${lote}${plano ? `&plano=${plano}` : ""}`;
  return [
    { chave: "estatuto", rotulo: "Estatuto da associação (com o Regimento)", grupo: "Associação", url: m("estatuto"), demora: true },
    { chave: "diretrizes", rotulo: "Diretrizes de Uso", grupo: "Associação", url: m("diretrizes") },
    { chave: "cpcv", rotulo: "CPCV — entrada de 30%", grupo: "Compra e venda", url: c(), demora: true },
    { chave: "cpcv-A", rotulo: "CPCV — Plano A (entrada R$ 10 mil + reforço anual)", grupo: "Compra e venda", url: c("A"), demora: true },
    { chave: "cpcv-B", rotulo: "CPCV — Plano B (entrada R$ 10 mil + até 180×)", grupo: "Compra e venda", url: c("B"), demora: true },
    { chave: "cpcv-C", rotulo: "CPCV — Plano C (entrada parcelada em 36× sem juros)", grupo: "Compra e venda", url: c("C"), demora: true },
    { chave: "intermediacao", rotulo: "Contrato de intermediação imobiliária", grupo: "Compra e venda", url: m("intermediacao") },
    { chave: "tabela", rotulo: "Tabela de pagamento (Anexo II)", grupo: "Pagamento", url: m("tabela") },
    { chave: "carne", rotulo: "Carnê de pagamento", grupo: "Pagamento", url: m("carne") },
    { chave: "recibo", rotulo: "Recibo de pagamento", grupo: "Pagamento", url: m("recibo") },
  ];
}

const TIPOS = ["alteracao", "indagacao", "observacao"] as const;

/** Erros do serviço de inadimplência/certificado viram erros tRPC com a mensagem para a tela */
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "JuridicoErro" || e?.name === "CertificadoErro") {
      const st = Number(e.status);
      throw new TRPCError({ code: st === 404 ? "NOT_FOUND" : st === 403 ? "FORBIDDEN" : st === 409 ? "CONFLICT" : st === 412 ? "PRECONDITION_FAILED" : st >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    }
    throw e;
  }
}
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const pfxZ = z.string().max(280_000).optional().nullable();
const STATUS = ["aberto", "respondido", "resolvido"] as const;

export const juridicoRouter = router({
  /** Cabeçalho do portal: empreendimento, documentos, advogados e o resumo das pontuações */
  painel: protectedProcedure.input(slugZ).query(async ({ ctx, input }) => {
    const { db, perfil, slug, emp } = await contexto(ctx, input?.slug);
    const [l]: any[] = await db.select({ codigo: lotes.codigo }).from(lotes).where(eq(lotes.empreendimentoId, emp.id)).orderBy(lotes.codigo).limit(1);
    const advogados: any[] = await db.select({ id: users.id, nome: users.name, oab: (users as any).oab, oabUf: (users as any).oabUf, ativo: users.ativo, perfil: users.perfil, empreendimentoSlug: users.empreendimentoSlug })
      .from(users).where(eq(users.empreendimentoSlug, slug));
    const aps: any[] = await db.select({ status: juridicoApontamentos.status }).from(juridicoApontamentos).where(eq(juridicoApontamentos.empreendimentoId, emp.id));
    const todos: any[] = perfil === "admin" ? await db.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos) : [];
    return {
      empreendimento: { slug, nome: String(emp.nome), municipio: emp.municipio ?? null, uf: emp.uf ?? null },
      admin: perfil === "admin",
      empreendimentos: todos,
      documentos: documentos(slug, String(l?.codigo ?? "A01")),
      advogados: advogados.filter(a => a.perfil === "juridico").map(a => ({ id: Number(a.id), nome: String(a.nome ?? ""), oab: a.oab ? `OAB/${a.oabUf ?? ""} ${a.oab}` : null, ativo: !(a.ativo === false || a.ativo === 0) })),
      pontuacoes: { abertas: aps.filter(a => a.status === "aberto").length, respondidas: aps.filter(a => a.status === "respondido").length, resolvidas: aps.filter(a => a.status === "resolvido").length },
    };
  }),

  /** Contratos do empreendimento: situação, plano, PDF atual, via assinada e aditivos */
  contratos: protectedProcedure.input(slugZ).query(async ({ ctx, input }) => {
    const { db, emp } = await contexto(ctx, input?.slug);
    const cs: any[] = await db.select().from(contratos).where(eq(contratos.empreendimentoId, emp.id)).orderBy(desc(contratos.id));
    const ids = cs.map(c => Number(c.id));
    const ads: any[] = ids.length ? await db.select().from(contratoAditivos).where(inArray(contratoAditivos.contratoId, ids)) : [];
    const { pessoasDe } = await import("../contratos/servico");
    const { resumoDoContrato } = await import("../contratos/linhaTempo");
    const out = [];
    for (const c of cs) {
      const { comprador } = await pessoasDe(Number(c.id)).catch(() => ({ comprador: null as any }));
      const assinado = ["assinado", "ativo", "quitado"].includes(String(c.status));
      out.push({
        id: Number(c.id), numero: String(c.numero), status: String(c.status), lote: String(c.loteCodigo), comprador: comprador?.nome ?? "—",
        criadoEm: c.criadoEm ? new Date(c.criadoEm).toISOString() : null, ...resumoDoContrato(c),
        pdfAtual: c.pdfAtual ? `/api/contratos/${c.id}/atual.pdf` : null,
        viaAssinada: assinado && c.pdfAtual ? `/api/contratos/${c.id}/via-assinada.pdf` : null,
        aditivos: ads.filter(a => Number(a.contratoId) === Number(c.id)).sort((a, b) => Number(a.numero) - Number(b.numero)).map(a => {
          const dados = (() => { try { return JSON.parse(a.dadosJson); } catch { return {}; } })();
          return { id: Number(a.id), numero: Number(a.numero), tipo: String(a.tipo ?? "renegociacao"), titulo: String(dados.titulo ?? (a.tipo === "renegociacao" || !a.tipo ? "Renegociação de parcelas" : a.tipo)), status: String(a.status), url: `/api/financeiro/aditivos/${a.id}.pdf` };
        }),
      });
    }
    return out;
  }),

  /** Financeiro do empreendimento (mesmos números do portal do empreendedor) */
  financeiro: protectedProcedure.input(slugZ).query(async ({ ctx, input }) => {
    const { db, emp } = await contexto(ctx, input?.slug);
    const { financeiroDoEmpreendimento } = await import("./empreendedor.router");
    return financeiroDoEmpreendimento(db, emp);
  }),

  /** Pontuações jurídicas do empreendimento (todas ou de um documento) */
  pontuacoes: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(), documento: z.string().max(60).optional() }).optional()).query(async ({ ctx, input }) => {
    const { db, emp } = await contexto(ctx, input?.slug);
    const cond = input?.documento ? and(eq(juridicoApontamentos.empreendimentoId, emp.id), eq(juridicoApontamentos.documento, input.documento)) : eq(juridicoApontamentos.empreendimentoId, emp.id);
    const rs: any[] = await db.select().from(juridicoApontamentos).where(cond).orderBy(desc(juridicoApontamentos.id));
    const pessoas = Array.from(new Set(rs.flatMap(r => [r.autorId, r.respondidoPor]).filter(Boolean).map(Number)));
    const us: any[] = pessoas.length ? await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, pessoas)) : [];
    const nome = (id: unknown) => us.find(u => Number(u.id) === Number(id))?.nome ?? "—";
    return rs.map(r => ({
      id: Number(r.id), documento: String(r.documento), documentoRotulo: String(r.documentoRotulo), trecho: r.trecho ?? null, tipo: String(r.tipo), texto: String(r.texto),
      autor: nome(r.autorId), autorId: Number(r.autorId), status: String(r.status), resposta: r.resposta ?? null, respondidoPor: r.respondidoPor ? nome(r.respondidoPor) : null,
      respondidoEm: r.respondidoEm ? new Date(r.respondidoEm).toISOString() : null, criadoEm: r.criadoEm ? new Date(r.criadoEm).toISOString() : null,
    }));
  }),

  /** Nova pontuação (advogado ou administrador) — avisa o escritório */
  pontuar: protectedProcedure.input(z.object({
    slug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(), documento: z.string().trim().min(2).max(60), documentoRotulo: z.string().trim().min(2).max(200),
    trecho: z.string().trim().max(300).optional().nullable(), tipo: z.enum(TIPOS), texto: z.string().trim().min(5, "Escreva a pontuação").max(8000),
  })).mutation(async ({ ctx, input }) => {
    const { db, emp, slug } = await contexto(ctx, input.slug);
    await db.insert(juridicoApontamentos).values({
      empreendimentoId: emp.id, documento: input.documento, documentoRotulo: input.documentoRotulo, trecho: input.trecho || null, tipo: input.tipo,
      texto: input.texto, autorId: ctx.user.id, status: "aberto", criadoEm: new Date(),
    } as any);
    try {
      const { notificarChamado } = await import("../notificacoes");
      await notificarChamado({ contrato: "", lote: "", empreendimentoId: Number(emp.id), empreendimentoSlug: slug, tipo: "juridico",
        assunto: `Pontuação jurídica (${input.tipo === "alteracao" ? "alteração" : input.tipo === "indagacao" ? "indagação" : "observação"}) em ${input.documentoRotulo} — ${String(ctx.user.name ?? "advogado")}` });
    } catch { /* aviso é complementar */ }
    return { ok: true as const };
  }),

  /** Resposta do escritório (administrador) e/ou mudança de situação; o advogado pode marcar como resolvida */
  responder: protectedProcedure.input(z.object({ id: z.number().int(), resposta: z.string().trim().max(8000).optional().nullable(), status: z.enum(STATUS) }))
    .mutation(async ({ ctx, input }) => {
      const { db, perfil, emp } = await contexto(ctx);
      const [a]: any[] = await db.select().from(juridicoApontamentos).where(eq(juridicoApontamentos.id, input.id)).limit(1);
      if (!a || (perfil === "juridico" && Number(a.empreendimentoId) !== Number(emp.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Pontuação não encontrada" });
      if (perfil !== "admin" && (input.resposta || input.status === "respondido")) throw new TRPCError({ code: "FORBIDDEN", message: "Só o escritório responde às pontuações." });
      await db.update(juridicoApontamentos).set({
        status: input.status,
        ...(perfil === "admin" && input.resposta ? { resposta: input.resposta, respondidoPor: ctx.user.id, respondidoEm: new Date() } : {}),
      } as any).where(eq(juridicoApontamentos.id, input.id));
      return { ok: true as const };
    }),

  // ─── Inadimplência (Lei n.º 6.766/1979, arts. 32 e 32-A) ───────────────────────────────
  /** Contratos com parcela vencida em aberto; alerta a partir da 1ª parcela */
  inadimplencia: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(), gatilho: z.number().int().min(1).max(24).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { emp } = await contexto(ctx, input?.slug);
      const { inadimplentes, GATILHO_PARCELAS } = await import("../juridico/inadimplencia");
      return { gatilho: input?.gatilho ?? GATILHO_PARCELAS, contratos: await inadimplentes(Number(emp.id), hoje(), input?.gatilho ?? GATILHO_PARCELAS) };
    }),

  /** Gera a notificação, o requerimento ao Oficial ou a ata (guardados para assinar com certificado) */
  gerarDocumento: protectedProcedure.input(z.object({
    contratoId: z.number().int(), tipo: z.enum(["notificacao", "memorial", "requerimento", "ata", "cancelamento", "restituicao"]), via: z.enum(["ri", "rtd"]).optional(),
    dataResolucao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), outrosDebitos: z.number().min(0).max(10_000_000).nullable().optional(),
    dataIntimacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), protocolo: z.string().trim().max(80).nullable().optional(), observacao: z.string().trim().max(1500).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { db, emp } = await contexto(ctx);
    const [c]: any[] = await db.select({ empreendimentoId: contratos.empreendimentoId }).from(contratos).where(eq(contratos.id, input.contratoId)).limit(1);
    if (!c || (perfilDe(ctx.user) === "juridico" && Number(c.empreendimentoId) !== Number(emp.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado" });
    const { gerarDocumento } = await import("../juridico/inadimplencia");
    return comErro(() => gerarDocumento(input.contratoId, input.tipo, ctx.user.id, hoje(), { via: input.via, dataIntimacao: input.dataIntimacao ?? null, protocolo: input.protocolo ?? null, observacao: input.observacao ?? null, dataResolucao: input.dataResolucao ?? null, outrosDebitos: input.outrosDebitos ?? null }));
  }),

  /** Documentos jurídicos do empreendimento (gerados e avulsos) com as assinaturas */
  documentos: protectedProcedure.input(slugZ).query(async ({ ctx, input }) => {
    const { emp } = await contexto(ctx, input?.slug, { empreendedor: true });
    const { documentosDo } = await import("../juridico/inadimplencia");
    return documentosDo(Number(emp.id));
  }),

  /** Exclui um documento jurídico — só o administrador (documento de teste ou gerado por engano) */
  excluirDocumento: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    if (perfilDe(ctx.user) !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador exclui documentos jurídicos" });
    const { excluirDocumento } = await import("../juridico/inadimplencia");
    return comErro(() => excluirDocumento(input.id, ctx.user.id));
  }),

  /** Assina com o certificado digital ICP-Brasil (o guardado, só com a senha; ou um .pfx enviado agora, que não é guardado) */
  assinarDocumento: protectedProcedure.input(z.object({ id: z.number().int(), senha: z.string().min(1).max(200), pfxBase64: pfxZ }))
    .mutation(async ({ ctx, input }) => {
      const { emp } = await contexto(ctx, undefined, { empreendedor: true });
      const { documentoPorId, assinarDocumento } = await import("../juridico/inadimplencia");
      return comErro(async () => {
        const r = await documentoPorId(input.id);
        if (perfilDe(ctx.user) !== "admin" && Number(r.empreendimentoId) !== Number(emp.id)) throw Object.assign(new Error("Documento não encontrado"), { name: "JuridicoErro", status: 404 });
        const pfx = input.pfxBase64 ? Buffer.from(input.pfxBase64, "base64") : null;
        try { return await assinarDocumento(input.id, ctx.user as any, input.senha, pfx); } finally { pfx?.fill(0); }
      });
    }),
});
