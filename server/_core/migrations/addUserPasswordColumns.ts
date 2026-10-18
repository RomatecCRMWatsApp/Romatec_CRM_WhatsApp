import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: colunas de senha em users (produção já tem as duas; outros
 * bancos ganham aqui). password_hash = scrypt; passwordHash = SHA-256 antigo.
 */
export async function addUserPasswordColumns(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;

  const columns = [
    { name: 'password_hash', stmt: sql`ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL` },
    { name: 'passwordHash', stmt: sql`ALTER TABLE users ADD COLUMN passwordHash VARCHAR(64) NULL` },
  ];
  for (const { name, stmt } of columns) {
    try {
      await (db as any).execute(stmt);
      console.log(`[Migration] ✅ ${name} adicionada em users`);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !msg.includes('Duplicate column')) {
        console.error(`[Migration] Erro addUserPasswordColumns (${name}):`, msg);
      }
    }
  }
}
