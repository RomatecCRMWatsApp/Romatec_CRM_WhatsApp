import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration v1.26.0 — pagamento manual e rateio por parcela. Idempotente e não destrutiva: só cria as tabelas. */
export async function addPagamentosManuais(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  const exec = (q: string) => (db as any).execute(sql.raw(q));
  try {
    await exec(`CREATE TABLE IF NOT EXISTS pagamentosManuais (
      id INT AUTO_INCREMENT PRIMARY KEY, forma VARCHAR(14) NOT NULL, valor DECIMAL(12,2) NOT NULL, pagoEm DATETIME NOT NULL,
      idTransacao VARCHAR(80) NULL, pagadorNome VARCHAR(160) NULL, pagadorCpfParcial VARCHAR(20) NULL, pagadorInstituicao VARCHAR(120) NULL,
      vinculoPagador VARCHAR(120) NULL, urlRecibo VARCHAR(300) NULL, observacao VARCHAR(500) NULL, lancadoPor INT NOT NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY ux_pagman_transacao (idTransacao)
    )`);
    await exec(`CREATE TABLE IF NOT EXISTS pagamentoRateio (
      id INT AUTO_INCREMENT PRIMARY KEY, pagamentoId INT NOT NULL, cobrancaId INT NOT NULL, contratoId INT NOT NULL,
      valor DECIMAL(12,2) NOT NULL, reciboId INT NULL, INDEX ix_rateio_pagamento (pagamentoId), UNIQUE KEY ux_rateio_cobranca (cobrancaId)
    )`);
  } catch (e: any) {
    console.warn('[Migration] addPagamentosManuais:', e?.message);
  }
}
