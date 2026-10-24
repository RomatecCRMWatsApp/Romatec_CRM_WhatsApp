/**
 * Arquivos do módulo de contratos/financeiro guardados no banco (contratoArquivos): o disco do Railway some a cada deploy.
 * Uma chave nunca é sobrescrita — versão nova = chave nova.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contratoArquivos } from '../../drizzle/schema';
import { sha256 } from './render';

export async function salvarArquivo(chave: string, buf: Buffer, mime = 'application/pdf'): Promise<{ chave: string; sha256: string; bytes: number }> {
  const db = (await getDb()) as any;
  if (!db) throw new Error('Banco indisponível');
  const hash = sha256(buf);
  const [existente] = await db.select({ sha256: contratoArquivos.sha256 }).from(contratoArquivos).where(eq(contratoArquivos.chave, chave)).limit(1);
  if (existente) {
    if (existente.sha256 === hash) return { chave, sha256: hash, bytes: buf.length };
    throw new Error(`Arquivo ${chave} já existe com outro conteúdo (versões nunca são sobrescritas)`);
  }
  await db.insert(contratoArquivos).values({ chave, mime, bytes: buf.length, sha256: hash, conteudoBase64: buf.toString('base64'), criadoEm: new Date() });
  return { chave, sha256: hash, bytes: buf.length };
}

export async function lerArquivo(chave: string): Promise<{ buf: Buffer; mime: string; sha256: string } | null> {
  const db = (await getDb()) as any;
  if (!db) throw new Error('Banco indisponível');
  const [a] = await db.select().from(contratoArquivos).where(eq(contratoArquivos.chave, chave)).limit(1);
  return a ? { buf: Buffer.from(a.conteudoBase64, 'base64'), mime: a.mime, sha256: a.sha256 } : null;
}
