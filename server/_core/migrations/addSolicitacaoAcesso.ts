import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: solicitacaoAcesso — pedidos da secretária para prorrogar/desbloquear o acesso de um corretor (com
 * pagamento ou cortesia). Só valem depois da senha do administrador. Idempotente.
 */
export async function addSolicitacaoAcesso(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS solicitacaoAcesso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuarioId INT NOT NULL,
    modalidade VARCHAR(10) NOT NULL,
    ate VARCHAR(10) NOT NULL,
    valor DECIMAL(10,2) NULL,
    motivo VARCHAR(300) NOT NULL,
    codigo VARCHAR(6) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'PENDENTE',
    tentativas INT NOT NULL DEFAULT 0,
    solicitanteId INT NOT NULL,
    decididoPor INT NULL,
    decididoEm TIMESTAMP NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_solic_status (status, criadoEm),
    INDEX idx_solic_usuario (usuarioId)
  )`);
  console.log('[Migration] ✅ addSolicitacaoAcesso');
}
