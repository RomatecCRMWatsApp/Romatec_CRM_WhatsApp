/**
 * Permissões do usuário logado (banco → regras de shared/permissoes.ts). Usado no middleware do tRPC
 * (módulo liberado) e nos procedimentos com escopo (empreendimento/imóvel habilitado).
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { acessosCorretor, empreendimentos, permissoesPerfil, permissoesUsuario } from "../drizzle/schema";
import { daEquipe, perfilDe, type Perfil } from "../shared/equipe";
import { MODULOS, leadVisivel, permissoesEfetivas, podeDistribuirLeads, temAcesso, type AcessoCorretor, type Permissoes, type TipoAcesso } from "../shared/permissoes";

export interface PermissoesUsuario {
  perfil: Perfil | null;
  modulos: Permissoes | null;
  acessos: AcessoCorretor[];
}

/** Admin: sem consulta. Corretor: pacote base do perfil + ajustes dele + empreendimentos/imóveis habilitados */
export async function carregarPermissoes(user: { id: number; role?: string | null; perfil?: string | null }): Promise<PermissoesUsuario> {
  const perfil = perfilDe(user);
  // Empreendedor: acesso só ao empreendimento dele (mapa, situação das chácaras, vendas) — o resto é barrado por podeChamar
  if (perfil === 'empreendedor') {
    const slug = (user as any).empreendimentoSlug as string | null | undefined;
    const db = slug ? ((await getDb()) as any) : null;
    const [emp]: any[] = db && slug ? await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, String(slug))).limit(1).catch(() => []) : [];
    // Módulos do portal (a lista de procedimentos em shared/equipe.ts continua sendo o filtro principal)
    const modulos = Object.fromEntries(MODULOS.map(m => [m.chave, m.chave === 'empreendimentos' || m.chave === 'financeiro'])) as Permissoes;
    return { perfil, modulos, acessos: emp ? [{ tipo: 'empreendimento', refId: Number(emp.id) }] : [] };
  }
  if (!daEquipe(perfil)) return { perfil, modulos: null, acessos: [] };
  const db = (await getDb()) as any;
  if (!db) return { perfil, modulos: permissoesEfetivas([], [], perfil), acessos: [] };
  const [base, ajustes, acessos]: any[][] = await Promise.all([
    db.select().from(permissoesPerfil).where(eq(permissoesPerfil.perfil, perfil)).catch(() => []),
    db.select().from(permissoesUsuario).where(eq(permissoesUsuario.usuarioId, user.id)).catch(() => []),
    db.select().from(acessosCorretor).where(eq(acessosCorretor.usuarioId, user.id)).catch(() => []),
  ]);
  return {
    perfil,
    modulos: permissoesEfetivas(base, ajustes, perfil),
    acessos: acessos.map(a => ({ tipo: a.tipo, refId: Number(a.refId), comissaoPct: a.comissaoPct })),
  };
}

/** Lança 403 se o corretor não estiver habilitado para o empreendimento/imóvel */
export function exigirAcesso(p: PermissoesUsuario, tipo: TipoAcesso, refId: number, nome = tipo === "empreendimento" ? "este empreendimento" : "este imóvel") {
  if (!temAcesso(p.perfil, p.acessos, tipo, refId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Você não está habilitado para ${nome}. Peça ao administrador.` });
  }
}

/** Lança 403 se o lead não estiver liberado (corretor: só os leads em que é o responsável) */
export function exigirLead(p: PermissoesUsuario, usuarioId: number, lead: { responsavelId?: number | null }) {
  if (!leadVisivel(p.perfil, usuarioId, lead)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este lead está com outro responsável." });
  }
}

/** Filtra uma lista de leads pelo que o usuário pode ver */
export const leadsVisiveis = <T extends { responsavelId?: number | null }>(p: PermissoesUsuario, usuarioId: number, leads: T[]) =>
  p.perfil === "admin" || p.perfil === "secretario" ? leads : leads.filter(l => leadVisivel(p.perfil, usuarioId, l));

/** Trocar o responsável de um lead (distribuição): só o admin */
export function exigirDistribuicao(p: PermissoesUsuario) {
  if (!podeDistribuirLeads(p.perfil)) throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador distribui os leads." });
}

/** % de comissão do corretor no empreendimento: a do vínculo dele ou a das condições do empreendimento */
export function pctComissaoCorretor(p: PermissoesUsuario, empreendimentoId: number, pctCondicoes: number): number {
  const v = p.acessos.find(a => a.tipo === "empreendimento" && a.refId === empreendimentoId)?.comissaoPct;
  return v != null && v !== "" ? Number(v) : pctCondicoes;
}
