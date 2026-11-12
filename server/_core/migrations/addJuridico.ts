import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration — corpo jurídico do empreendimento (advogados). Idempotente e não destrutiva.
 * - users: número e seccional da OAB (perfil "juridico").
 * - juridicoApontamentos: pontuações/indagações jurídicas dos advogados sobre cada documento do empreendimento
 *   (estatuto, modelos de contrato, contratos assinados), com a resposta do escritório.
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'users.oab', stmt: sql`ALTER TABLE users ADD COLUMN oab VARCHAR(20) NULL` },
  { nome: 'users.oabUf', stmt: sql`ALTER TABLE users ADD COLUMN oabUf VARCHAR(2) NULL` },
  {
    nome: 'juridicoApontamentos',
    stmt: sql`CREATE TABLE IF NOT EXISTS juridicoApontamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empreendimentoId INT NOT NULL,
      documento VARCHAR(60) NOT NULL,
      documentoRotulo VARCHAR(200) NOT NULL,
      trecho VARCHAR(300) NULL,
      tipo VARCHAR(12) NOT NULL DEFAULT 'alteracao',
      texto TEXT NOT NULL,
      autorId INT NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'aberto',
      resposta TEXT NULL,
      respondidoPor INT NULL,
      respondidoEm DATETIME NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ix_jur_emp (empreendimentoId, status),
      INDEX ix_jur_doc (empreendimentoId, documento)
    )`,
  },
];

export async function addJuridico(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) console.warn(`[Migration] addJuridico (${nome}):`, msg);
    }
  }
  console.log('[Migration] ✅ addJuridico (OAB e pontuações jurídicas)');
}
