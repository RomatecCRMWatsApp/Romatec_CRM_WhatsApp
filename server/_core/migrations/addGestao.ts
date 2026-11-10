import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Contrato de Gestão do empreendimento e adiantamentos da GESTORA (shared/gestao.ts). Idempotente (CREATE TABLE IF NOT EXISTS). */
const TABELAS: [string, string][] = [
  ['gestaoContratos', `CREATE TABLE IF NOT EXISTS gestaoContratos (
    empreendimentoId INT PRIMARY KEY, numero VARCHAR(20) NOT NULL, parametrosJson TEXT NOT NULL, atualizadoPor INT NULL,
    atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  ['gestaoAportes', `CREATE TABLE IF NOT EXISTS gestaoAportes (
    id INT AUTO_INCREMENT PRIMARY KEY, empreendimentoId INT NOT NULL, numero INT NOT NULL, data VARCHAR(10) NOT NULL, valor DECIMAL(14,2) NOT NULL,
    descricao VARCHAR(500) NOT NULL, categoria VARCHAR(20) NOT NULL, favorecido VARCHAR(200) NULL, formaPagamento VARCHAR(20) NOT NULL,
    comprovante VARCHAR(200) NULL, ressarcidoEm VARCHAR(10) NULL, criadoPor INT NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_aporte_emp (empreendimentoId))`],
];

export async function addGestao(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const [nome, stmt] of TABELAS) {
    try { await (db as any).execute(sql.raw(stmt)); }
    catch (e: any) { console.warn(`[Migration] addGestao (${nome}):`, e?.message); }
  }
  console.log('[Migration] ✅ addGestao (contrato de gestão e adiantamentos)');
}
