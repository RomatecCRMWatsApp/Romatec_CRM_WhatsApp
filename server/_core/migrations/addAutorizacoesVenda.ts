import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: autorizacoesVenda — autorizações da proprietária para venda fora do padrão, antes do contrato. Idempotente. */
export async function addAutorizacoesVenda(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS autorizacoesVenda (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero INT NOT NULL,
    empreendimentoId INT NOT NULL,
    loteCodigos VARCHAR(255) NOT NULL,
    clienteNome VARCHAR(160) NOT NULL,
    escolhaJson TEXT NOT NULL,
    dadosJson TEXT NOT NULL,
    observacao VARCHAR(600) NULL,
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
    canceladoPor INT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_autvenda_numero (numero),
    UNIQUE KEY ux_autvenda_token (token),
    INDEX ix_autvenda_emp (empreendimentoId)
  )`);
  console.log('[Migration] ✅ addAutorizacoesVenda');
}
