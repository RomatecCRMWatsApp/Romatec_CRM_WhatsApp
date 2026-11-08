/**
 * "Todas as condições" (chácara padrão): link público assinado do PDF para o corretor mandar ao cliente pelo WhatsApp.
 * Fora dos módulos: todo corretor com acesso ao empreendimento usa (o escopo é conferido aqui).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { empreendimentos } from "../../drizzle/schema";
import { temAcesso } from "../../shared/permissoes";

export const condicoesRouter = router({
  link: protectedProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) })).query(async ({ input, ctx }) => {
    const d: any = await getDb();
    if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
    const [emp]: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, input.slug)).limit(1);
    if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
    const p = ctx.permissoes;
    if (p.perfil === "empreendedor" || !temAcesso(p.perfil, p.acessos, "empreendimento", Number(emp.id))) throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a este empreendimento" });
    const { tokenCondicoes } = await import("../financeiro/condicoesGeraisPdf");
    const base = (process.env.APP_PUBLIC_URL || "https://romateccrm.com").replace(/\/$/, "");
    return { nome: String(emp.nome), url: `${base}/api/public/condicoes/${input.slug}/${tokenCondicoes(input.slug, ctx.user.id)}.pdf` };
  }),
});
