import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: simulações de CBS/IBS feitas no contrato (ponte do AvalieImob) e demonstrativo de comissão assinado. Idempotente. */
const COLUNAS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'demonstrativoUrl', stmt: sql`ALTER TABLE comissaoRepasses ADD COLUMN demonstrativoUrl VARCHAR(500) NULL` },
  { nome: 'demonstrativoAssinadoEm', stmt: sql`ALTER TABLE comissaoRepasses ADD COLUMN demonstrativoAssinadoEm TIMESTAMP NULL` },
  { nome: 'comissaoContratoId', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN comissaoContratoId INT NULL` },
  { nome: 'comissaoChave', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN comissaoChave VARCHAR(20) NULL` },
  { nome: 'demonstrativoEnviadoEm', stmt: sql`ALTER TABLE comissaoRepasses ADD COLUMN demonstrativoEnviadoEm TIMESTAMP NULL` },
];

export async function addSimulacoesTributarias(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COLUNAS) {
    try { await (db as any).execute(stmt); }
    catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.error(`[Migration] addSimulacoesTributarias (${nome}):`, e?.message);
    }
  }
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS simulacoesTributarias (
      id INT AUTO_INCREMENT PRIMARY KEY, contratoId INT NOT NULL, regime VARCHAR(10) NOT NULL, dataOperacao VARCHAR(10) NOT NULL,
      valor VARCHAR(20) NOT NULL, nbs VARCHAR(9) NOT NULL, cst VARCHAR(3) NULL, cClassTrib VARCHAR(6) NOT NULL, situacao VARCHAR(24) NOT NULL,
      idExterno VARCHAR(64) NULL, resultadoJson TEXT NOT NULL, solicitadoPor INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_simtrib_contrato (contratoId)
    )`);
  } catch (e: any) { console.error('[Migration] addSimulacoesTributarias:', e?.message); }
  console.log('[Migration] ✅ addSimulacoesTributarias (CBS/IBS no contrato e demonstrativo assinado)');
}
