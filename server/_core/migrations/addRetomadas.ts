import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: fila de retomada dos contatos importados do celular (leadRetomadas). Idempotente e não destrutiva. */
export async function addRetomadas(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS leadRetomadas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NOT NULL,
      phone VARCHAR(20) NOT NULL,
      lote VARCHAR(40) NOT NULL,
      texto TEXT NOT NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'pendente',
      erro VARCHAR(255) NULL,
      tentativas INT NOT NULL DEFAULT 0,
      criadoPor INT NULL,
      enviadoAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_retomada_lead (leadId),
      INDEX idx_retomada_status (status, id)
    )`);
    console.log('[Migration] ✅ addRetomadas (importação de contatos)');
  } catch (e: any) {
    console.warn('[Migration] addRetomadas:', e?.message);
  }
}
