import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: agenda de visitas (Fase 2). Idempotente.
 */
export async function addVisitas(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS leadVisitas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NOT NULL,
      propertyId INT NULL,
      quando TIMESTAMP NOT NULL,
      local VARCHAR(200) NULL,
      status VARCHAR(15) NOT NULL DEFAULT 'agendada',
      observacao VARCHAR(500) NULL,
      responsavelId INT NULL,
      criadoPor INT NULL,
      lembreteClienteAt TIMESTAMP NULL,
      avisoCorretorAt TIMESTAMP NULL,
      resultadoPedidoAt TIMESTAMP NULL,
      confirmadaAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_visita_quando (quando),
      INDEX idx_visita_lead (leadId)
    )`);
    console.log('[Migration] ✅ addVisitas (agenda de visitas)');
  } catch (e: any) {
    console.warn('[Migration] addVisitas:', e?.message);
  }
}
