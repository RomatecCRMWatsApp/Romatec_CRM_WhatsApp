/**
 * Permissões do usuário logado (banco → regras de shared/permissoes.ts). Usado no middleware do tRPC
 * (módulo liberado) e nos procedimentos com escopo (empreendimento/imóvel habilitado).
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { acessosCorretor, permissoesPerfil, permissoesUsuario } from "../drizzle/schema";
import { perfilDe, type Perfil } from "../shared/equipe";
import { permissoesEfetivas, temAcesso, type AcessoCorretor, type Permissoes, type TipoAcesso } from "../shared/permissoes";

export interface PermissoesUsuario {
  perfil: Perfil | null;
  modulos: Permissoes | null;
  acessos: AcessoCorretor[];
}

/** Admin: sem consulta. Corretor: pacote base do perfil + ajustes dele + empreendimentos/imóveis habilitados */
export async function carregarPermissoes(user: { id: number; role?: string | null; perfil?: string | null }): Promise<PermissoesUsuario> {
  const perfil = perfilDe(user);
  if (perfil !== "equipe") return { perfil, modulos: null, acessos: [] };
  const db = (await getDb()) as any;
  if (!db) return { perfil, modulos: permissoesEfetivas([], []), acessos: [] };
  const [base, ajustes, acessos]: any[][] = await Promise.all([
    db.select().from(permissoesPerfil).where(eq(permissoesPerfil.perfil, "equipe")).catch(() => []),
    db.select().from(permissoesUsuario).where(eq(permissoesUsuario.usuarioId, user.id)).catch(() => []),
    db.select().from(acessosCorretor).where(eq(acessosCorretor.usuarioId, user.id)).catch(() => []),
  ]);
  return {
    perfil,
    modulos: permissoesEfetivas(base, ajustes),
    acessos: acessos.map(a => ({ tipo: a.tipo, refId: Number(a.refId), comissaoPct: a.comissaoPct })),
  };
}

/** Lança 403 se o corretor não estiver habilitado para o empreendimento/imóvel */
export function exigirAcesso(p: PermissoesUsuario, tipo: TipoAcesso, refId: number, nome = tipo === "empreendimento" ? "este empreendimento" : "este imóvel") {
  if (!temAcesso(p.perfil, p.acessos, tipo, refId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Você não está habilitado para ${nome}. Peça ao administrador.` });
  }
}

/** % de comissão do corretor no empreendimento: a do vínculo dele ou a das condições do empreendimento */
export function pctComissaoCorretor(p: PermissoesUsuario, empreendimentoId: number, pctCondicoes: number): number {
  const v = p.acessos.find(a => a.tipo === "empreendimento" && a.refId === empreendimentoId)?.comissaoPct;
  return v != null && v !== "" ? Number(v) : pctCondicoes;
}
