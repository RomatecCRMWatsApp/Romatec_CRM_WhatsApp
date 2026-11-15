import { and, eq, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { contatosSuporte, type ContatoSuporte } from "../../shared/suporte";

/** Central de suporte: só os contatos de quem atende a equipe (administrador e secretaria). Não expõe outros campos do cadastro. */
export const suporteRouter = router({
  contatos: protectedProcedure.query(async (): Promise<ContatoSuporte[]> => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ name: users.name, email: users.email, telefone: users.telefone, role: users.role, perfil: users.perfil })
      .from(users)
      .where(and(eq(users.ativo, true), or(eq(users.role, "admin"), eq(users.perfil, "secretario"))));
    return contatosSuporte(rows);
  }),
});
