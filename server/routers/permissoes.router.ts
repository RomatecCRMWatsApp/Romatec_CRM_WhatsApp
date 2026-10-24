/**
 * Portal de permissões. Admin: pacote base do perfil corretor, liga/desliga de módulos por corretor,
 * empreendimentos/imóveis habilitados e % de comissão do corretor por empreendimento (vazio = o das
 * condições do empreendimento). Qualquer usuário logado: as próprias permissões (menus da tela).
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { acessosCorretor, condicoesPagamento, empreendimentos, permissoesPerfil, permissoesUsuario, properties, users } from "../../drizzle/schema";
import { daEquipe, perfilDe } from "../../shared/equipe";
import { MODULOS, TIPOS_ACESSO, permissoesEfetivas } from "../../shared/permissoes";
import { carregarPermissoes } from "../permissoes";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

const perfilEquipe = z.enum(["corretor", "secretario"]);
const chaveModulo = z.string().refine(m => MODULOS.some(x => x.chave === m), "Módulo inexistente");

async function corretorOuErro(db: any, usuarioId: number) {
  const [u]: any[] = await db.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) throw new Error("Corretor não encontrado");
  const perfil = perfilDe(u);
  if (!daEquipe(perfil)) throw new Error("Permissões por pessoa valem para Secretário(a) e Corretor(a) (o admin já vê tudo)");
  return Object.assign(u, { perfilEquipe: perfil });
}

export const permissoesRouter = router({
  /** As minhas permissões (menus e telas do navegador; o servidor confere de novo em cada chamada) */
  minhas: protectedProcedure.query(async ({ ctx }) => {
    const p = await carregarPermissoes(ctx.user as any);
    return {
      perfil: p.perfil,
      modulos: p.modulos ?? Object.fromEntries(MODULOS.map(m => [m.chave, true])),
      empreendimentos: p.acessos.filter(a => a.tipo === "empreendimento").map(a => a.refId),
      imoveis: p.acessos.filter(a => a.tipo === "imovel").map(a => a.refId),
    };
  }),

  /** Catálogo de módulos e pacote base de um perfil da equipe (corretor ou secretário) */
  base: adminProcedure.input(z.object({ perfil: perfilEquipe }).optional()).query(async ({ input }) => {
    const db = await dbOrThrow();
    const perfil = input?.perfil ?? "corretor";
    const linhas: any[] = await db.select().from(permissoesPerfil).where(eq(permissoesPerfil.perfil, perfil));
    const ef = permissoesEfetivas(linhas, [], perfil);
    return MODULOS.map(m => ({ chave: m.chave, rotulo: m.rotulo, permitido: ef[m.chave] }));
  }),

  definirBase: adminProcedure.input(z.object({ perfil: perfilEquipe.default("corretor"), modulo: chaveModulo, permitido: z.boolean() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [ja]: any[] = await db.select().from(permissoesPerfil).where(and(eq(permissoesPerfil.perfil, input.perfil), eq(permissoesPerfil.modulo, input.modulo))).limit(1);
    if (ja) await db.update(permissoesPerfil).set({ permitido: input.permitido } as any).where(eq(permissoesPerfil.id, ja.id));
    else await db.insert(permissoesPerfil).values({ perfil: input.perfil, modulo: input.modulo, permitido: input.permitido } as any);
    return { ok: true };
  }),

  /** Tudo de um corretor: módulos (base, ajuste, efetivo), empreendimentos e imóveis com habilitação e % */
  corretor: adminProcedure.input(z.object({ usuarioId: z.number().int() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const u = await corretorOuErro(db, input.usuarioId);
    const [base, ajustes, acessos, emps, imoveis, conds]: any[][] = await Promise.all([
      db.select().from(permissoesPerfil).where(eq(permissoesPerfil.perfil, u.perfilEquipe)),
      db.select().from(permissoesUsuario).where(eq(permissoesUsuario.usuarioId, u.id)),
      db.select().from(acessosCorretor).where(eq(acessosCorretor.usuarioId, u.id)),
      db.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos),
      db.select({ id: properties.id, codigo: properties.codigo, nome: properties.denomination }).from(properties),
      db.select({ empreendimentoId: condicoesPagamento.empreendimentoId, pct: condicoesPagamento.comissaoCorretorPct, ativo: condicoesPagamento.ativo }).from(condicoesPagamento),
    ]);
    const doPacote = permissoesEfetivas(base, [], u.perfilEquipe), efetivas = permissoesEfetivas(base, ajustes, u.perfilEquipe);
    const ajuste = new Map(ajustes.map(a => [a.modulo, !!a.permitido]));
    const acesso = (tipo: string, id: number) => acessos.find(a => a.tipo === tipo && Number(a.refId) === id);
    const pctEmp = new Map(conds.filter(c => c.ativo !== false && c.ativo !== 0).map(c => [c.empreendimentoId, Number(c.pct)]));
    return {
      corretor: { id: u.id, nome: u.name, creci: u.creci, email: u.email, perfil: u.perfilEquipe },
      modulos: MODULOS.map(m => ({ chave: m.chave, rotulo: m.rotulo, pacoteBase: doPacote[m.chave], ajuste: ajuste.has(m.chave) ? ajuste.get(m.chave)! : null, efetivo: efetivas[m.chave] })),
      empreendimentos: emps.map(e => {
        const a = acesso("empreendimento", e.id);
        return { id: e.id, slug: e.slug, nome: e.nome, habilitado: !!a, comissaoPct: a?.comissaoPct != null ? Number(a.comissaoPct) : null, comissaoPadraoPct: pctEmp.get(e.id) ?? null };
      }),
      imoveis: imoveis.map(p => ({ id: p.id, nome: p.codigo ? `${p.codigo} — ${p.nome}` : p.nome, habilitado: !!acesso("imovel", p.id) })),
    };
  }),

  /** Liga/desliga módulo para o corretor (null = volta a seguir o pacote base) */
  definirModulo: adminProcedure
    .input(z.object({ usuarioId: z.number().int(), modulo: chaveModulo, permitido: z.boolean().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await corretorOuErro(db, input.usuarioId);
      const onde = and(eq(permissoesUsuario.usuarioId, input.usuarioId), eq(permissoesUsuario.modulo, input.modulo));
      if (input.permitido === null) { await db.delete(permissoesUsuario).where(onde); return { ok: true }; }
      const [ja]: any[] = await db.select().from(permissoesUsuario).where(onde).limit(1);
      if (ja) await db.update(permissoesUsuario).set({ permitido: input.permitido, atualizadoPor: ctx.user.id } as any).where(eq(permissoesUsuario.id, ja.id));
      else await db.insert(permissoesUsuario).values({ usuarioId: input.usuarioId, modulo: input.modulo, permitido: input.permitido, atualizadoPor: ctx.user.id } as any);
      return { ok: true };
    }),

  /** Habilita/desabilita empreendimento ou imóvel; comissaoPct (0–1) só para empreendimento, null = padrão do empreendimento */
  definirAcesso: adminProcedure
    .input(z.object({
      usuarioId: z.number().int(), tipo: z.enum(TIPOS_ACESSO), refId: z.number().int(), habilitado: z.boolean(),
      comissaoPct: z.number().min(0).max(1).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await corretorOuErro(db, input.usuarioId);
      const onde = and(eq(acessosCorretor.usuarioId, input.usuarioId), eq(acessosCorretor.tipo, input.tipo), eq(acessosCorretor.refId, input.refId));
      if (!input.habilitado) { await db.delete(acessosCorretor).where(onde); return { ok: true }; }
      const pct = input.tipo === "empreendimento" && input.comissaoPct != null ? input.comissaoPct.toFixed(4) : null;
      const [ja]: any[] = await db.select().from(acessosCorretor).where(onde).limit(1);
      if (ja) {
        if (input.comissaoPct !== undefined) await db.update(acessosCorretor).set({ comissaoPct: pct } as any).where(eq(acessosCorretor.id, ja.id));
      } else {
        await db.insert(acessosCorretor).values({ usuarioId: input.usuarioId, tipo: input.tipo, refId: input.refId, comissaoPct: pct, habilitadoPor: ctx.user.id } as any);
      }
      return { ok: true };
    }),
});
