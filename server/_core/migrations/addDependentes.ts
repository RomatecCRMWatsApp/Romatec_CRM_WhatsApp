import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration v1.23.0 — dependentes do comprador (carteirinhas). Idempotente e não destrutiva: só cria a tabela. */
export async function addDependentes(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql.raw(`CREATE TABLE IF NOT EXISTS contratoDependentes (
      id INT AUTO_INCREMENT PRIMARY KEY, contratoId INT NOT NULL, ordem INT NOT NULL, nome VARCHAR(160) NOT NULL, parentesco VARCHAR(20) NOT NULL,
      nascimento DATE NOT NULL, cpf VARCHAR(11) NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX ix_dep_contrato (contratoId, ordem)
    )`));
  } catch (e: any) {
    console.warn('[Migration] addDependentes:', e?.message);
  }
}
