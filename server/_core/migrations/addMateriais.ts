import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: tabela materiais (artes de divulgação por imóvel/empreendimento). Idempotente. */
export async function addMateriais(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS materiais (
    id INT AUTO_INCREMENT PRIMARY KEY,
    propertyId INT NULL,
    empreendimentoSlug VARCHAR(80) NULL,
    titulo VARCHAR(160) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'outro',
    url TEXT NOT NULL,
    mime VARCHAR(80) NULL,
    tamanhoBytes INT NULL,
    liberado BOOLEAN NOT NULL DEFAULT TRUE,
    observacao VARCHAR(255) NULL,
    ordem INT NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_material_property (propertyId),
    INDEX idx_material_emp (empreendimentoSlug)
  )`);
  console.log('[Migration] ✅ addMateriais');
}
