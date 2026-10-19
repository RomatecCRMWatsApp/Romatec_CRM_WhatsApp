import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: Fase 1 da captação — follow-up persistente, responsável pelo lead
 * e prazo de atendimento (SLA), roleta de leads em users. Idempotente.
 */
const COLUNAS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'lead.followUpPasso', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN followUpPasso INT DEFAULT 0` },
  { nome: 'lead.proximoFollowUpAt', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN proximoFollowUpAt TIMESTAMP NULL` },
  { nome: 'lead.followUpTentativas', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN followUpTentativas INT DEFAULT 0` },
  { nome: 'lead.followUpErro', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN followUpErro VARCHAR(255) NULL` },
  { nome: 'lead.responsavelId', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN responsavelId INT NULL` },
  { nome: 'lead.aguardandoCorretorDesde', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN aguardandoCorretorDesde TIMESTAMP NULL` },
  { nome: 'lead.atendidoAt', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN atendidoAt TIMESTAMP NULL` },
  { nome: 'lead.alertaSlaNivel', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN alertaSlaNivel INT DEFAULT 0` },
  { nome: 'idx_lead_followup', stmt: sql`ALTER TABLE leadQualifications ADD INDEX idx_lead_followup (proximoFollowUpAt)` },
  { nome: 'idx_lead_sla', stmt: sql`ALTER TABLE leadQualifications ADD INDEX idx_lead_sla (aguardandoCorretorDesde)` },
  { nome: 'users.recebeLeads', stmt: sql`ALTER TABLE users ADD COLUMN recebeLeads BOOLEAN NOT NULL DEFAULT FALSE` },
  { nome: 'users.ultimoLeadAt', stmt: sql`ALTER TABLE users ADD COLUMN ultimoLeadAt TIMESTAMP NULL` },
];

export async function addFase1Captacao(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COLUNAS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.error(`[Migration] Erro addFase1Captacao (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addFase1Captacao (follow-up, responsável, SLA)');
}
