/**
 * Encerrar sessões: cada login guarda no token a versão de sessão do usuário (users.sessaoVersao); subir a versão
 * derruba na hora todos os aparelhos logados (server/_core/sdk.ts → sessaoValida). Usado ao trocar a senha,
 * no "Sair de todos os aparelhos", no "Redefinir senha" do administrador e na senha provisória nova.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { users } from '../drizzle/schema';

export async function encerrarSessoes(usuarioId: number): Promise<number> {
  const d: any = await getDb();
  if (!d) throw new Error('Banco indisponível');
  await d.update(users).set({ sessaoVersao: sql`COALESCE(${(users as any).sessaoVersao}, 0) + 1` } as any).where(eq(users.id, usuarioId));
  const [u]: any[] = await d.select({ v: (users as any).sessaoVersao }).from(users).where(eq(users.id, usuarioId)).limit(1);
  return Number(u?.v) || 0;
}

/** Encerra as outras sessões e devolve o cookie novo para continuar logado SÓ neste aparelho */
export async function manterSoEsteAparelho(ctx: { req: any; res: any }, usuario: { id: number; openId: string; name?: string | null }): Promise<void> {
  const versao = await encerrarSessoes(usuario.id);
  const { sdk } = await import('./_core/sdk');
  const { COOKIE_NAME, ONE_YEAR_MS } = await import('../shared/const');
  const { getSessionCookieOptions } = await import('./_core/cookies');
  const token = await sdk.createSessionToken(usuario.openId, { name: usuario.name || '', sessaoVersao: versao });
  ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
}
