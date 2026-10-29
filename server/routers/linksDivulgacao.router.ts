/**
 * Links de divulgação (shared/linksDivulgacao.ts): a equipe vê os fixos e os cadastrados; cadastrar, editar e
 * excluir é do escritório (administrador e secretária). O ?c= de cada corretor é montado na tela.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { campanhaCliques, linksDivulgacao, users } from "../../drizzle/schema";
import { LINKS_FIXOS, linkSchema, type LinkDivulgacao } from "../../shared/linksDivulgacao";

const escritorio = (ctx: any) => ["admin", "secretario"].includes(ctx.permissoes?.perfil ?? "");
function exigirEscritorio(ctx: any) {
  if (!escritorio(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador e a secretária cadastram links de divulgação." });
}
async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  return d;
}
const sim = (v: unknown) => v === true || v === 1;
const id = z.object({ id: z.number().int().positive() });

export const linksDivulgacaoRouter = router({
  /** Fixos primeiro, depois os cadastrados (destaques no topo); o escritório também vê os pausados */
  listar: protectedProcedure.query(async ({ ctx }) => {
    const d = await banco();
    const linhas: any[] = await d.select().from(linksDivulgacao).orderBy(desc(linksDivulgacao.destaque), desc(linksDivulgacao.id)).catch(() => []);
    const cadastrados = linhas.filter(l => escritorio(ctx) || sim(l.ativo)).map(l => ({
      chave: `db:${l.id}`, id: Number(l.id), titulo: l.titulo, descricao: l.descricao ?? null, url: l.url, utmSource: l.utmSource ?? null, utmCampaign: l.utmCampaign ?? null,
      textoWhatsapp: l.textoWhatsapp, empreendimento: l.empreendimento ?? null, destaque: sim(l.destaque), fixo: false, ativo: sim(l.ativo),
    }));
    const fixos = LINKS_FIXOS.map(l => ({ ...l, id: null as number | null, ativo: true }));
    return { links: [...fixos, ...cadastrados] as (LinkDivulgacao & { id: number | null; ativo: boolean })[], podeEditar: escritorio(ctx) };
  }),
  criar: protectedProcedure.input(linkSchema).mutation(async ({ ctx, input }) => {
    exigirEscritorio(ctx);
    const d = await banco();
    await d.insert(linksDivulgacao).values({ ...input, criadoPor: ctx.user.id });
    return { ok: true as const };
  }),
  editar: protectedProcedure.input(linkSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    exigirEscritorio(ctx);
    const { id: lid, ...dados } = input;
    const d = await banco();
    await d.update(linksDivulgacao).set(dados).where(eq(linksDivulgacao.id, lid));
    return { ok: true as const };
  }),
  excluir: protectedProcedure.input(id).mutation(async ({ ctx, input }) => {
    exigirEscritorio(ctx);
    const d = await banco();
    await d.delete(linksDivulgacao).where(eq(linksDivulgacao.id, input.id));
    return { ok: true as const };
  }),
  /**
   * Rastreio dos links de documentos (server/documentosCliente.ts): aberturas por documento e as últimas 30 com quem
   * enviou o link. O corretor vê só as dos links dele; o escritório vê todas.
   */
  leiturasDocumentos: protectedProcedure.query(async ({ ctx }) => {
    const d = await banco();
    const filtro = escritorio(ctx) ? like(campanhaCliques.campanha, "DOC:%") : and(like(campanhaCliques.campanha, "DOC:%"), eq(campanhaCliques.corretorId, ctx.user.id));
    const linhas: any[] = await d.select({ campanha: campanhaCliques.campanha, corretorId: campanhaCliques.corretorId, codigo: campanhaCliques.utmSource, em: campanhaCliques.criadoEm, nome: users.name })
      .from(campanhaCliques).leftJoin(users, eq(users.id, campanhaCliques.corretorId)).where(filtro).orderBy(desc(campanhaCliques.criadoEm)).limit(2000).catch(() => []);
    const porDoc: Record<string, { total: number; ultima: string | null }> = {};
    for (const l of linhas) {
      const doc = String(l.campanha).slice(4);
      const x = (porDoc[doc] ??= { total: 0, ultima: null });
      x.total++;
      if (!x.ultima) x.ultima = new Date(l.em).toISOString();
    }
    return {
      porDoc,
      ultimas: linhas.slice(0, 30).map(l => ({ doc: String(l.campanha).slice(4), corretor: l.nome ?? (l.codigo ? "Link não identificado" : "Sem código (Romatec)"), codigo: l.codigo ?? null, em: new Date(l.em).toISOString() })),
      escritorio: escritorio(ctx),
    };
  }),
});
