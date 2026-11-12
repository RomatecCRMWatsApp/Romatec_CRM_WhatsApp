/**
 * Escopo do corpo jurídico: o advogado (perfil "juridico") vê só os documentos do empreendimento do login dele
 * (users.empreendimentoSlug) — modelos, estatuto, contratos, vias assinadas e aditivos. Bloqueado (ativo = 0) não entra.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos } from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';

type Usuario = { role?: string | null; perfil?: string | null; ativo?: unknown; empreendimentoSlug?: string | null } | null | undefined;

export const ehJuridico = (u: Usuario) => perfilDe(u as any) === 'juridico';

/** O advogado é do empreendimento deste slug? */
export function juridicoDoSlug(u: Usuario, slug: string | null | undefined): boolean {
  return !!u && ehJuridico(u) && u.ativo !== false && u.ativo !== 0 && !!u.empreendimentoSlug && u.empreendimentoSlug === slug;
}

/** O advogado é do empreendimento deste id? */
export async function juridicoDoEmpreendimento(u: Usuario, empreendimentoId: number | null | undefined): Promise<boolean> {
  if (!u || !ehJuridico(u) || !u.empreendimentoSlug || !empreendimentoId) return false;
  const d: any = await getDb();
  if (!d) return false;
  const [e]: any[] = await d.select({ slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, Number(empreendimentoId))).limit(1);
  return juridicoDoSlug(u, e?.slug);
}
