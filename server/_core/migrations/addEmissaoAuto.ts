import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: contratos.entradaPagaNoAto — entrada recebida na assinatura (sem boleto). Idempotente (só ADD COLUMN). */
export async function addEmissaoAuto(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`ALTER TABLE contratos ADD COLUMN entradaPagaNoAto BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log('[Migration] ✅ addEmissaoAuto');
  } catch (e: any) {
    const code = e?.code ?? e?.cause?.code;
    if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(String(e?.message ?? e?.cause?.message ?? ''))) console.warn('[Migration] addEmissaoAuto:', e?.message);
  }
  // Repasses de comissão de venda ao corretor (Financeiro › Comissões a pagar)
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS comissaoRepasses (
      id INT AUTO_INCREMENT PRIMARY KEY, contratoId INT NOT NULL, corretorUserId INT NOT NULL, chave VARCHAR(20) NOT NULL,
      valor DECIMAL(12,2) NOT NULL, pagoEm DATE NOT NULL, forma VARCHAR(30) NULL, observacao VARCHAR(300) NULL, registradoPor INT NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ux_repasse_parte (contratoId, chave), KEY ix_repasse_corretor (corretorUserId)
    )`);
  } catch (e: any) { console.warn('[Migration] comissaoRepasses:', e?.message); }
  // Confirmação de pagamento no WhatsApp: tentativas reservadas e o que já foi entregue (NULL/0 = a avisar)
  for (const coluna of [sql`ALTER TABLE crm_recibos ADD COLUMN envioTentativas INT NOT NULL DEFAULT 0`, sql`ALTER TABLE crm_recibos ADD COLUMN envioJson TEXT NULL`]) {
    try { await (db as any).execute(coluna); }
    catch (e: any) {
      const code = e?.code ?? e?.cause?.code;
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(String(e?.message ?? e?.cause?.message ?? ''))) console.warn('[Migration] crm_recibos (confirmação):', e?.message);
    }
  }
}
