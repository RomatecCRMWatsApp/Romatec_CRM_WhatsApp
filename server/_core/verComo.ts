/**
 * "Ver como" (só o administrador): com o cabeçalho x-ver-como=<id>, o servidor responde como aquele usuário —
 * corretor, secretária ou empreendedora —, com o menu, os módulos, os empreendimentos, os dados e a licença dele.
 * Serve para conferir se o que foi liberado apareceu para a pessoa. É SÓ VISUALIZAÇÃO: toda ação (mutation do tRPC
 * e requisição REST que não seja GET) é recusada enquanto o cabeçalho estiver presente, e nada é gravado em nome dela.
 * Quem não é administrador e manda o cabeçalho continua sendo ele mesmo (o cabeçalho é ignorado).
 */
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import type { User } from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';

export const CABECALHO_VER_COMO = 'x-ver-como';
export const PERFIS_VER_COMO = ['corretor', 'secretario', 'empreendedor'] as const;
export const MENSAGEM_SO_LEITURA = 'Modo "ver como": só visualização — nada é alterado em nome da pessoa.';

export interface VerComo { adminId: number; adminNome: string; alvoId: number }

/** Id pedido no cabeçalho (só dígitos) */
export function idPedido(req: Pick<Request, 'headers'>): number | null {
  const v = req.headers[CABECALHO_VER_COMO];
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{1,10}$/.test(s) ? Number(s) : null;
}

const ativo = (u: any) => u && u.ativo !== false && u.ativo !== 0;

/**
 * Troca o usuário real pelo usuário alvo quando o real é administrador ativo e o alvo é corretor, secretária ou
 * empreendedora ativo. Marca a requisição (req.verComo) para os bloqueios de escrita.
 */
export async function aplicarVerComo(req: Request, real: User, carregar?: (id: number) => Promise<any>): Promise<User> {
  const id = idPedido(req);
  if (!id || perfilDe(real as any) !== 'admin' || !ativo(real) || id === real.id) return real;
  const busca = carregar ?? (async (uid: number) => {
    const { getDb } = await import('../db');
    const { users } = await import('../../drizzle/schema');
    const d: any = await getDb();
    if (!d) return null;
    const [u] = await d.select().from(users).where(eq(users.id, uid)).limit(1);
    return u ?? null;
  });
  const alvo = await busca(id);
  const perfil = perfilDe(alvo);
  if (!alvo || !ativo(alvo) || !perfil || !(PERFIS_VER_COMO as readonly string[]).includes(perfil)) return real;
  (req as any).verComo = { adminId: real.id, adminNome: String(real.name ?? ''), alvoId: alvo.id } satisfies VerComo;
  return alvo as User;
}

/**
 * REST: com o cabeçalho, só GET/HEAD passam (downloads e consultas). Webhooks e o tRPC (que tem bloqueio próprio,
 * por mutation) ficam de fora. Recusa mesmo antes de saber se quem pede é administrador — sem efeito colateral.
 */
export function bloquearEscritaRest(req: Request, res: Response, next: NextFunction) {
  if (idPedido(req) == null || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.path.startsWith('/api/trpc') || req.path.startsWith('/api/webhook')) return next();
  res.status(403).json({ ok: false, error: MENSAGEM_SO_LEITURA });
}
