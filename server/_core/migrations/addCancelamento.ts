import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration v1.14.0 — trava de cancelamento. Idempotente e não destrutiva:
 * - contratos/recibos: quem cancelou, quando e o motivo (nada é apagado);
 * - contratoSolicitacoes: pedido de cancelamento do corretor/secretária para o administrador;
 * - financeiroAuditoria imutável: gatilhos barram UPDATE e DELETE (a trilha só recebe INSERT).
 */
const COLUNAS: [string, string, string][] = [
  ['contratos', 'canceladoEm', 'DATETIME NULL'],
  ['contratos', 'canceladoPor', 'INT NULL'],
  ['contratos', 'canceladoMotivo', 'VARCHAR(300) NULL'],
  ['recibos', 'canceladoEm', 'DATETIME NULL'],
  ['recibos', 'canceladoPor', 'INT NULL'],
  ['recibos', 'canceladoMotivo', 'VARCHAR(300) NULL'],
];

const GATILHOS: [string, string][] = [
  ['trg_fin_aud_sem_update', 'BEFORE UPDATE'],
  ['trg_fin_aud_sem_delete', 'BEFORE DELETE'],
];

export async function addCancelamento(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  const exec = (q: string) => (db as any).execute(sql.raw(q));
  for (const [t, c, tipo] of COLUNAS) {
    try {
      await exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${tipo}`);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.warn(`[Migration] addCancelamento (${t}.${c}):`, e?.message);
    }
  }
  try {
    await exec(`CREATE TABLE IF NOT EXISTS contratoSolicitacoes (
      id INT AUTO_INCREMENT PRIMARY KEY, contratoId INT NOT NULL, tipo VARCHAR(20) NOT NULL, motivo VARCHAR(300) NOT NULL,
      solicitanteId INT NOT NULL, status VARCHAR(12) NOT NULL, resolvidoPor INT NULL, resolvidoEm DATETIME NULL, resposta VARCHAR(300) NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX ix_solic_contrato (contratoId, status)
    )`);
  } catch (e: any) { console.warn('[Migration] addCancelamento (contratoSolicitacoes):', e?.message); }
  for (const [nome, quando] of GATILHOS) {
    try {
      await exec(`CREATE TRIGGER ${nome} ${quando} ON financeiroAuditoria FOR EACH ROW
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'financeiroAuditoria é imutável'`);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_TRG_ALREADY_EXISTS' && !/already exists/i.test(e?.message ?? '')) console.warn(`[Migration] addCancelamento (${nome}):`, e?.message);
    }
  }
  console.log('[Migration] ✅ addCancelamento (pedidos de cancelamento, auditoria imutável)');
}
