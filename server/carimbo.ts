/** Carimbo das mídias de cada usuário (shared/carimbo.ts): leitura e gravação */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { carimbosUsuario } from '../drizzle/schema';
import { cartaoDoUsuario } from './cartaoVendas';
import { aplicarCarimbo, carimboDoCadastro, normalizarCarimbo, type Carimbo, type CarimboAplicado } from '../shared/carimbo';

export async function carimboSalvo(usuarioId: number): Promise<Carimbo | null> {
  const d: any = await getDb();
  if (!d) return null;
  const [r]: any[] = await d.select().from(carimbosUsuario).where(eq(carimbosUsuario.usuarioId, usuarioId)).limit(1);
  return r ? { nome: String(r.nome), telefone: r.telefone ?? null, instagram: r.instagram ?? null, email: r.email ?? null } : null;
}

/** Para a tela: o salvo, ou a sugestão do cadastro; mais o CRECI (que vem do cadastro) */
export async function meuCarimbo(usuarioId: number) {
  const c = await cartaoDoUsuario(usuarioId);
  const salvo = await carimboSalvo(usuarioId);
  return { carimbo: salvo ?? carimboDoCadastro(c, c.instagramProprio), salvo: !!salvo, creci: c.creci };
}

export async function salvarCarimbo(usuarioId: number, entrada: Partial<Carimbo>): Promise<Carimbo> {
  const c = normalizarCarimbo(entrada);
  const d: any = await getDb();
  if (!d) throw new Error('Banco indisponível');
  const valores = { ...c, atualizadoEm: new Date() };
  const existe = await carimboSalvo(usuarioId);
  if (existe) await d.update(carimbosUsuario).set(valores as any).where(eq(carimbosUsuario.usuarioId, usuarioId));
  else await d.insert(carimbosUsuario).values({ usuarioId, ...valores } as any);
  return c;
}

/** Dados da faixa de quem está logado: cadastro + carimbo salvo + ref do link */
export async function dadosDoCarimbo(usuarioId: number): Promise<CarimboAplicado & { ref: string | null }> {
  const c = await cartaoDoUsuario(usuarioId);
  return { ...aplicarCarimbo(c, c.instagramProprio, await carimboSalvo(usuarioId)), ref: c.ref };
}
