import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: cobrancaAvisos — cada aviso da régua de cobrança enviado ao comprador (uma vez por parcela e etapa). Idempotente. */
export async function addCobrancaAvisos(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS cobrancaAvisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cobrancaId INT NOT NULL,
    contratoId INT NOT NULL,
    etapa VARCHAR(10) NOT NULL,
    telefone VARCHAR(20) NULL,
    ok BOOLEAN NOT NULL DEFAULT FALSE,
    erro VARCHAR(255) NULL,
    enviadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_aviso (cobrancaId, etapa),
    INDEX idx_aviso_contrato (contratoId, enviadoEm)
  )`);
  console.log('[Migration] ✅ addCobrancaAvisos');
}
