import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: equipe e empreendedor em users — perfil, CRECI (login), telefone,
 * empreendimento, ativo e convite de primeiro acesso. Idempotente.
 */
const COLUNAS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'perfil', stmt: sql`ALTER TABLE users ADD COLUMN perfil VARCHAR(20) NULL` },
  { nome: 'creci', stmt: sql`ALTER TABLE users ADD COLUMN creci VARCHAR(20) NULL` },
  { nome: 'telefone', stmt: sql`ALTER TABLE users ADD COLUMN telefone VARCHAR(20) NULL` },
  { nome: 'empreendimentoSlug', stmt: sql`ALTER TABLE users ADD COLUMN empreendimentoSlug VARCHAR(80) NULL` },
  { nome: 'ativo', stmt: sql`ALTER TABLE users ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE` },
  { nome: 'conviteHash', stmt: sql`ALTER TABLE users ADD COLUMN conviteHash VARCHAR(64) NULL` },
  { nome: 'conviteExpira', stmt: sql`ALTER TABLE users ADD COLUMN conviteExpira TIMESTAMP NULL` },
  { nome: 'uq_users_creci', stmt: sql`ALTER TABLE users ADD UNIQUE INDEX uq_users_creci (creci)` },
];

export async function addEquipe(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COLUNAS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.error(`[Migration] Erro addEquipe (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addEquipe (perfil, CRECI, empreendimento, convite)');
}
