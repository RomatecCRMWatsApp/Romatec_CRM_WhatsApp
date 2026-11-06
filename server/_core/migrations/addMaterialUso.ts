import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: materialUso — estatística de uso dos materiais de divulgação (quem baixou, enviou ou copiou o texto
 * de qual peça, e quando). Só contagem: não guarda para quem foi enviado nem o conteúdo. Idempotente.
 */
export async function addMaterialUso(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS materialUso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuarioId INT NOT NULL,
    materialId INT NOT NULL,
    empreendimentoSlug VARCHAR(80) NULL,
    categoria VARCHAR(10) NOT NULL,
    acao VARCHAR(10) NOT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_uso_usuario (usuarioId, criadoEm),
    INDEX idx_uso_material (materialId)
  )`);
  console.log('[Migration] ✅ addMaterialUso');
}
