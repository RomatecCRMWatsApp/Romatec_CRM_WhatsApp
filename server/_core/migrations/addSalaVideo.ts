import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: salas de vídeo (Jitsi). Só cria a tabela nova; idempotente. */
export async function addSalaVideo(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS salasVideo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(16) NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    criadoPor INT NOT NULL,
    leadId INT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    encerradaEm DATETIME NULL,
    UNIQUE KEY ux_sala_codigo (codigo),
    INDEX ix_sala_autor (criadoPor)
  )`);
  console.log('[Migration] ✅ addSalaVideo');
}
