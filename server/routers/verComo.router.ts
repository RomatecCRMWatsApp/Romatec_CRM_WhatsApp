/** "Ver como" (server/_core/verComo.ts): quem pode ser visto e o registro de cada visualização — só o administrador */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditoriaAcesso, users } from "../../drizzle/schema";
import { perfilDe, ROTULO_PERFIL } from "../../shared/equipe";
import { PERFIS_VER_COMO } from "../_core/verComo";

async function banco() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  return d as any;
}
const ativo = (u: any) => u.ativo !== false && u.ativo !== 0;

export const verComoRouter = router({
  /** Corretores, secretárias e empreendedoras ativos */
  lista: adminProcedure.query(async () => {
    const d = await banco();
    const us: any[] = await d.select({ id: users.id, name: users.name, role: users.role, perfil: (users as any).perfil, ativo: users.ativo, creci: users.creci,
      empreendimentoSlug: (users as any).empreendimentoSlug, fotoUrl: (users as any).fotoUrl, email: users.email }).from(users);
    return us.filter(u => ativo(u) && (PERFIS_VER_COMO as readonly string[]).includes(perfilDe(u) ?? ""))
      .map(u => ({ id: Number(u.id), nome: String(u.name ?? "Sem nome"), perfil: perfilDe(u)!, rotuloPerfil: ROTULO_PERFIL[perfilDe(u)!], creci: u.creci ?? null,
        empreendimentoSlug: u.empreendimentoSlug ?? null, fotoUrl: u.fotoUrl ?? null }))
      .sort((a, b) => a.perfil.localeCompare(b.perfil) || a.nome.localeCompare(b.nome, "pt-BR"));
  }),

  /** Registra quem o administrador vai ver (auditoria) e devolve o nome e o perfil para a faixa da tela */
  iniciar: adminProcedure.input(z.object({ usuarioId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const d = await banco();
    const [u]: any[] = await d.select().from(users).where(eq(users.id, input.usuarioId)).limit(1);
    const perfil = u ? perfilDe(u) : null;
    if (!u || !ativo(u) || !perfil || !(PERFIS_VER_COMO as readonly string[]).includes(perfil)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Só dá para ver como um corretor, uma secretária ou uma empreendedora ativos." });
    }
    await d.insert(auditoriaAcesso).values({ usuarioId: ctx.user!.id, evento: "VER_COMO", detalheJson: JSON.stringify({ alvoId: u.id, alvoNome: u.name, perfil }), criadoEm: new Date() } as any)
      .catch((e: any) => console.warn("[Ver como] auditoria:", e?.message));
    return { id: Number(u.id), nome: String(u.name ?? ""), perfil, rotuloPerfil: ROTULO_PERFIL[perfil] };
  }),
});
