import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: despesas do fluxo de caixa (saídas). Idempotente; nome sem colisão com as tabelas da ZAYRA
 * (lá existe "despesas_extras" — server/tabelasZayra.test.ts).
 */
const DDL = `CREATE TABLE IF NOT EXISTS financeiroDespesas (
  id INT AUTO_INCREMENT PRIMARY KEY, empreendimentoId INT NULL, descricao VARCHAR(200) NOT NULL, categoria VARCHAR(30) NOT NULL,
  fornecedor VARCHAR(120) NULL, valor DECIMAL(12,2) NOT NULL, vencimento VARCHAR(10) NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'aberta',
  pagoEm VARCHAR(10) NULL, valorPago DECIMAL(12,2) NULL, formaPagamento VARCHAR(20) NULL, grupo VARCHAR(24) NULL, parcela VARCHAR(10) NULL,
  comprovanteUrl VARCHAR(500) NULL, observacao TEXT NULL, criadoPor INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_despesa_venc (vencimento), KEY ix_despesa_pago (pagoEm), KEY ix_despesa_grupo (grupo))`;

export async function addDespesas(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try { await (db as any).execute(sql.raw(DDL)); console.log('[Migration] ✅ addDespesas (despesas do fluxo de caixa)'); }
  catch (e: any) { console.warn('[Migration] addDespesas:', e?.message); }
}
