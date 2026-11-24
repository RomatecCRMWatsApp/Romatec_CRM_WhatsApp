import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: ciência da proprietária nas despesas (despesaCiencias). Idempotente e não destrutiva. */
export async function addDespesaCiencias(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS despesaCiencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      despesaId INT NOT NULL,
      empreendimentoId INT NOT NULL,
      dadosJson TEXT NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'aguardando',
      pdfArquivo VARCHAR(255) NOT NULL,
      pdfSha256 CHAR(64) NOT NULL,
      pdfAssinadoArquivo VARCHAR(255) NULL,
      token CHAR(32) NOT NULL,
      otpHash CHAR(64) NULL,
      otpExpira DATETIME NULL,
      otpTentativas INT NOT NULL DEFAULT 0,
      otpEnvios INT NOT NULL DEFAULT 0,
      assinadoEm DATETIME NULL,
      assinaturaIp VARCHAR(64) NULL,
      assinaturaUa VARCHAR(300) NULL,
      criadoPor INT NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ciencia_token (token),
      INDEX idx_ciencia_despesa (despesaId)
    )`);
    console.log('[Migration] ✅ addDespesaCiencias (ciência da proprietária nas despesas)');
  } catch (e: any) {
    console.warn('[Migration] addDespesaCiencias:', e?.message);
  }
}
