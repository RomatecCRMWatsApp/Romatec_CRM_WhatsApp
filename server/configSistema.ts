/**
 * Chaves simples do sistema (tabela configSistema), com cache curto para valer em todos os servidores sem reiniciar.
 * Hoje: distribuicao_modo = automatico (roleta) | manual (a secretária/escritório encaminha cada lead).
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { configSistema } from '../drizzle/schema';

const CACHE_MS = 15_000;
const cache = new Map<string, { valor: string | null; em: number }>();

export async function lerConfig(chave: string): Promise<string | null> {
  const c = cache.get(chave);
  if (c && Date.now() - c.em < CACHE_MS) return c.valor;
  let valor: string | null = null;
  try {
    const d: any = await getDb();
    if (d) {
      const [r]: any[] = await d.select().from(configSistema).where(eq(configSistema.chave, chave)).limit(1);
      valor = r?.valor ?? null;
    }
  } catch (e: any) { console.warn(`[Config] ${chave}:`, e?.message); }
  cache.set(chave, { valor, em: Date.now() });
  return valor;
}

export async function gravarConfig(chave: string, valor: string, usuarioId: number | null): Promise<void> {
  const d: any = await getDb();
  if (!d) throw new Error('Banco indisponível');
  await d.delete(configSistema).where(eq(configSistema.chave, chave));
  await d.insert(configSistema).values({ chave, valor, atualizadoPor: usuarioId, atualizadoEm: new Date() } as any);
  cache.delete(chave);
}

export type ModoDistribuicao = 'automatico' | 'manual';
/** Sem configuração: automático (a roleta, como sempre foi) */
export async function modoDistribuicao(): Promise<ModoDistribuicao> {
  return (await lerConfig('distribuicao_modo')) === 'manual' ? 'manual' : 'automatico';
}
export const limparCacheConfig = () => cache.clear();
