/**
 * Cartão de vendas do usuário logado (shared/cartaoVendas.ts) e a referência pública dos links de
 * divulgação (?c=<ref>): a página pública mostra o contato de quem compartilhou. A ref é o id do usuário
 * com uma assinatura curta (HMAC), para não dar para trocar o número e "pegar" o contato de outro.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { perfilDe } from '../shared/equipe';
import { CARTAO_PADRAO, cartaoDe, origemDoCartao, type CartaoVendas } from '../shared/cartaoVendas';

const segredo = () => process.env.CARTAO_LINK_SECRET || process.env.JWT_SECRET || 'romatec-cartao';
const assinatura = (id: number) => createHmac('sha256', segredo()).update(`cartao:${id}`).digest('base64url').slice(0, 8);

export const refDoUsuario = (id: number) => `${id.toString(36)}${assinatura(id)}`;

export function usuarioDaRef(ref: string): number | null {
  const m = /^([0-9a-z]{1,8})([A-Za-z0-9_-]{8})$/.exec(String(ref || ''));
  if (!m) return null;
  const id = parseInt(m[1], 36);
  if (!Number.isFinite(id) || id <= 0) return null;
  const a = Buffer.from(assinatura(id)), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

const campos = {
  id: users.id, name: users.name, role: users.role, perfil: (users as any).perfil, creci: users.creci, creciUf: (users as any).creciUf,
  telefone: (users as any).telefone, email: users.email, fotoUrl: (users as any).fotoUrl, ativo: users.ativo,
};

async function administrador(d: any) {
  const admins: any[] = await d.select(campos).from(users).where(eq(users.role, 'admin'));
  const ativos = admins.filter(a => a.ativo !== false && a.ativo !== 0);
  return ativos.find(a => a.creci) ?? ativos[0] ?? null;
}

/** Cartão de quem está logado (empreendedor → o do administrador) */
export async function cartaoDoUsuario(usuarioId: number): Promise<CartaoVendas & { ref: string | null }> {
  const d = (await getDb()) as any;
  if (!d) return { ...CARTAO_PADRAO, ref: null };
  const [u]: any[] = await d.select(campos).from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) return { ...CARTAO_PADRAO, ref: null };
  const perfil = perfilDe(u);
  const dono = origemDoCartao(perfil) === 'admin' ? await administrador(d) : u;
  if (!dono) return { ...CARTAO_PADRAO, ref: null };
  return { ...cartaoDe(dono, perfilDe(dono)), ref: refDoUsuario(dono.id) };
}

/** Cartão público da ref do link (só dados de contato profissional; nunca CPF) */
export async function cartaoDaRef(ref: string): Promise<CartaoVendas | null> {
  const id = usuarioDaRef(ref);
  if (!id) return null;
  const d = (await getDb()) as any;
  if (!d) return null;
  const [u]: any[] = await d.select(campos).from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.ativo === false || u.ativo === 0) return null;
  const perfil = perfilDe(u);
  if (perfil === 'empreendedor') return null;
  return cartaoDe(u, perfil);
}
