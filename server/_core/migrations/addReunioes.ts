import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: reuniões com clientes (transcrição + resumo; sem áudio guardado). Idempotente.
 */
export async function addReunioes(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  const comandos = [
    sql`CREATE TABLE IF NOT EXISTS reunioes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NULL,
      titulo VARCHAR(160) NOT NULL,
      tipo VARCHAR(15) NOT NULL DEFAULT 'presencial',
      status VARCHAR(15) NOT NULL DEFAULT 'gravando',
      criadoPor INT NOT NULL,
      consentimento BOOLEAN NOT NULL DEFAULT FALSE,
      duracaoSeg INT NOT NULL DEFAULT 0,
      transcricao LONGTEXT NULL,
      resumoJson TEXT NULL,
      erro VARCHAR(300) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reuniao_lead (leadId),
      INDEX idx_reuniao_autor (criadoPor)
    )`,
    sql`CREATE TABLE IF NOT EXISTS reuniaoPartes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reuniaoId INT NOT NULL,
      ordem INT NOT NULL,
      duracaoSeg INT NOT NULL DEFAULT 0,
      texto LONGTEXT NULL,
      erro VARCHAR(300) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_reuniao_parte (reuniaoId, ordem),
      CONSTRAINT fk_reuniao_parte FOREIGN KEY (reuniaoId) REFERENCES reunioes(id) ON DELETE CASCADE
    )`,
    // v1.30.1: áudio guardado só até a transcrição sair
    sql`ALTER TABLE reuniaoPartes ADD COLUMN audioBase64 LONGTEXT NULL`,
    sql`ALTER TABLE reuniaoPartes ADD COLUMN mime VARCHAR(60) NULL`,
  ];
  for (const c of comandos) {
    try { await (db as any).execute(c); } catch (e: any) {
      if (!/Duplicate column/.test(e?.message ?? '') && (e?.code ?? e?.cause?.code) !== 'ER_DUP_FIELDNAME') console.warn('[Migration] addReunioes:', e?.message);
    }
  }
  console.log('[Migration] ✅ addReunioes (reuniões com clientes)');
}
