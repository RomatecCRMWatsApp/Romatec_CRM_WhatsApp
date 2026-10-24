/**
 * Permissões do usuário logado (banco → regras de shared/permissoes.ts). Usado no middleware do tRPC
 * (módulo liberado) e nos procedimentos com escopo (empreendimento/imóvel habilitado).
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { acessosCorretor, permissoesPerfil, permissoesUsuario } from "../drizzle/schema";
import { daEquipe, perfilDe, type Perfil } from "../shared/equipe";
import { leadVisivel, permissoesEfetivas, podeDistribuirLeads, temAcesso, type AcessoCorretor, type Permissoes, type TipoAcesso } from "../shared/permissoes";

export interface PermissoesUsuario {
  perfil: Perfil | null;
  modulos: Permissoes | null;
  acessos: AcessoCorretor[];
}

/** Admin: sem consulta. Corretor: pacote base do perfil + ajustes dele + empreendimentos/imóveis habilitados */
export async function carregarPermissoes(user: { id: number; role?: string | null; perfil?: string | null }): Promise<PermissoesUsuario> {
  const perfil = perfilDe(user);
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
