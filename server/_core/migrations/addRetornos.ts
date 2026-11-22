import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: pedidos do link de retorno (leadRetornos). Idempotente e não destrutiva. */
export async function addRetornos(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS leadRetornos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      quando TIMESTAMP NOT NULL,
      enderecoBusca VARCHAR(300) NULL,
      pessoas INT NULL,
      observacao VARCHAR(300) NULL,
      local VARCHAR(200) NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'pendente',
      responsavelId INT NULL,
      avisoAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_retorno_quando (quando),
      INDEX idx_retorno_lead (leadId)
    )`);
    console.log('[Migration] ✅ addRetornos (link de retorno)');
  } catch (e: any) {
    console.warn('[Migration] addRetornos:', e?.message);
  }
}
