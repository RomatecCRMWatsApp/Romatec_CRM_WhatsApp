/**
 * Materiais de divulgação: lista agrupada por empreendimento/imóvel, cadastro
 * (depois do upload em /api/materiais/upload), edição e exclusão.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { materiais, properties, empreendimentos } from "../../drizzle/schema";
import { TIPOS_MATERIAL, ROTULO_TIPO_MATERIAL, agruparMateriais } from "../../shared/materiais";
import { exigirAcesso, type PermissoesUsuario } from "../permissoes";
import { temAcesso } from "../../shared/permissoes";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db;
}

const destino = z.object({
  propertyId: z.number().int().positive().nullable().optional(),
  empreendimentoSlug: z.string().max(80).nullable().optional(),
});

/** Corretor só vê/mexe nos materiais dos empreendimentos e imóveis habilitados para ele */
async function exigirDestino(db: any, p: PermissoesUsuario, d: { propertyId?: number | null; empreendimentoSlug?: string | null }) {
  if (d.empreendimentoSlug) {
    const [emp]: any[] = await db.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, d.empreendimentoSlug)).limit(1);
    if (!emp) throw new Error("Empreendimento não encontrado");
    exigirAcesso(p, "empreendimento", emp.id, emp.nome);
  } else if (d.propertyId) {
    exigirAcesso(p, "imovel", d.propertyId);
  }
}

async function materialAutorizado(db: any, p: PermissoesUsuario, id: number) {
  const [m]: any[] = await db.select().from(materiais).where(eq(materiais.id, id)).limit(1);
  if (!m) throw new Error("Material não encontrado");
  await exigirDestino(db, p, m);
  return m;
}

export const materiaisRouter = router({
  tipos: protectedProcedure.query(() => ({ TIPOS_MATERIAL, ROTULO_TIPO_MATERIAL })),

  /** Meu carimbo: o que sai na faixa das mídias de quem está logado (shared/carimbo.ts) */
  meuCarimbo: protectedProcedure.query(async ({ ctx }) => {
    const { meuCarimbo } = await import("../carimbo");
    return meuCarimbo(ctx.user.id);
  }),
  salvarCarimbo: protectedProcedure
    .input(z.object({ nome: z.string().max(200), telefone: z.string().max(40).nullable().optional(), instagram: z.string().max(200).nullable().optional(), email: z.string().max(200).nullable().optional() }))
    .mutation(async ({ input, ctx }) => {
      const { salvarCarimbo } = await import("../carimbo");
      try { return await salvarCarimbo(ctx.user.id, input); }
      catch (e: any) { if (e?.name === "CarimboErro") throw new TRPCError({ code: "BAD_REQUEST", message: e.message }); throw e; }
    }),

  list: protectedProcedure.input(destino.optional()).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    let rows: any[] = await db.select().from(materiais).orderBy(desc(materiais.createdAt));
    if (input?.propertyId) rows = rows.filter(m => m.propertyId === input.propertyId);
    if (input?.empreendimentoSlug) rows = rows.filter(m => m.empreendimentoSlug === input.empreendimentoSlug);
    const [imoveisTodos, empsTodos] = await Promise.all([
      db.select({ id: properties.id, codigo: properties.codigo, nome: properties.denomination }).from(properties),
      db.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos),
    ]);
    // Corretor: só os materiais e destinos habilitados para ele
    const { perfil, acessos } = ctx.permissoes;
    const imoveis = (imoveisTodos as any[]).filter(p => temAcesso(perfil, acessos, "imovel", p.id));
    const emps = (empsTodos as any[]).filter(e => temAcesso(perfil, acessos, "empreendimento", e.id));
    const slugs = new Set(emps.map(e => e.slug)), ids = new Set(imoveis.map(p => p.id));
    rows = rows.filter(m => (m.empreendimentoSlug ? slugs.has(m.empreendimentoSlug) : ids.has(m.propertyId)));
    const grupos = agruparMateriais(rows, {
      imoveis: new Map((imoveis as any[]).map(p => [p.id, p.codigo ? `${p.codigo} — ${p.nome}` : p.nome])),
      empreendimentos: new Map((emps as any[]).map(e => [e.slug, e.nome])),
    });
    return {
      grupos,
      destinos: [
        ...(emps as any[]).map(e => ({ chave: `e:${e.slug}`, nome: e.nome, empreendimentoSlug: e.slug as string, propertyId: null })),
        ...(imoveis as any[]).map(p => ({ chave: `p:${p.id}`, nome: p.codigo ? `${p.codigo} — ${p.nome}` : p.nome, empreendimentoSlug: null, propertyId: p.id as number })),
      ],
    };
  }),

  create: protectedProcedure
    .input(destino.extend({
      titulo: z.string().trim().min(1).max(160),
      tipo: z.enum(TIPOS_MATERIAL),
      url: z.string().url().max(2000).refine(u => u.startsWith("https://"), "URL precisa ser https"),
      mime: z.string().max(80).nullable().optional(),
      tamanhoBytes: z.number().int().nonnegative().nullable().optional(),
      liberado: z.boolean().default(true),
      observacao: z.string().max(255).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!input.propertyId && !input.empreendimentoSlug) throw new Error("Escolha o imóvel ou o empreendimento");
      const db = await dbOrThrow();
      await exigirDestino(db, ctx.permissoes, input);
      const r: any = await db.insert(materiais).values({
        propertyId: input.empreendimentoSlug ? null : input.propertyId ?? null,
        empreendimentoSlug: input.empreendimentoSlug ?? null,
        titulo: input.titulo, tipo: input.tipo, url: input.url,
        mime: input.mime ?? null, tamanhoBytes: input.tamanhoBytes ?? null,
        liberado: input.liberado, observacao: input.observacao ?? null,
      } as any);
      const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
      // Material novo liberado para divulgar → corretores e empreendedor do empreendimento são avisados
      if (input.empreendimentoSlug && input.liberado) avisarMaterialNovo(input.empreendimentoSlug, input.titulo, id, ctx.user.id);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      titulo: z.string().trim().min(1).max(160).optional(),
      tipo: z.enum(TIPOS_MATERIAL).optional(),
      liberado: z.boolean().optional(),
      observacao: z.string().max(255).nullable().optional(),
      ordem: z.number().int().optional(),
      /** Contato do escritório gravado na peça (só escritório ajusta): % do rodapé e ms do cartão final do vídeo */
      recorteRodapePct: z.number().int().min(0).max(40).nullable().optional(),
      corteFinalMs: z.number().int().min(0).max(30_000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await materialAutorizado(db, ctx.permissoes, input.id);
      if ((input.recorteRodapePct !== undefined || input.corteFinalMs !== undefined) && !["admin", "secretario"].includes(String(ctx.permissoes.perfil))) {
        throw new Error("Só o escritório ajusta o corte do contato");
      }
      const { id, ...campos } = input;
      const [antes]: any[] = input.liberado === true ? await db.select({ liberado: materiais.liberado, slug: materiais.empreendimentoSlug, titulo: materiais.titulo }).from(materiais).where(eq(materiais.id, id)).limit(1) : [];
      await db.update(materiais).set(campos as any).where(eq(materiais.id, id));
      // Passou a liberado para divulgação: é material novo para a equipe de vendas
      if (antes?.slug && !(antes.liberado === true || antes.liberado === 1)) avisarMaterialNovo(antes.slug, input.titulo ?? antes.titulo, id, ctx.user.id);
      return { ok: true };
    }),

  /** Tira do CRM; o arquivo continua no Cloudinary */
  delete: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    await materialAutorizado(db, ctx.permissoes, input.id);
    await db.delete(materiais).where(eq(materiais.id, input.id));
    return { ok: true };
  }),
});

/** "Material novo" no sininho/push dos corretores e do empreendedor do empreendimento (uma vez por material) */
function avisarMaterialNovo(slug: string, titulo: string, id: number, autorId: number) {
  import("../notificacoes").then(N => N.notificarEmpreendimentoPorSlug(slug, { titulo: "Material novo para divulgar", mensagem: `Novo material em Materiais: ${titulo}. Baixe no seu formato, já com o seu carimbo.`, autorId, url: "/materiais", chave: `material:${id}` })).catch(e => console.warn("[Materiais] aviso:", e?.message));
}
