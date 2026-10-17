import { getDb } from '../../db';
import { sql } from 'drizzle-orm';

/**
 * Migration: colunas de origem do lead em leadQualifications
 * (captação via Instagram Ads / Direct / link da bio / landing do lote)
 */
const STATEMENTS: { label: string; stmt: ReturnType<typeof sql> }[] = [
  { label: 'origem',          stmt: sql`ALTER TABLE leadQualifications ADD COLUMN origem VARCHAR(30) DEFAULT 'whatsapp'` },
  { label: 'instagramUserId', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN instagramUserId VARCHAR(64)` },
  { label: 'metaLeadId',      stmt: sql`ALTER TABLE leadQualifications ADD COLUMN metaLeadId VARCHAR(64)` },
  { label: 'propertyId',      stmt: sql`ALTER TABLE leadQualifications ADD COLUMN propertyId INT` },
  { label: 'utm',             stmt: sql`ALTER TABLE leadQualifications ADD COLUMN utm JSON` },
  { label: 'metaLeadId_unique', stmt: sql`ALTER TABLE leadQualifications ADD UNIQUE INDEX leadQualifications_metaLeadId_unique (metaLeadId)` },
];

function isAlreadyApplied(e: any): boolean {
  const code = e?.code || e?.cause?.code || '';
  const msg = e?.message || '';
  return code === 'ER_DUP_FIELDNAME' || code === 'ER_DUP_KEYNAME' ||
    msg.includes('Duplicate column') || msg.includes('Duplicate key name');
}

export async function addLeadOriginColumns() {
  const db = await getDb();
  if (!db) return;

  for (const { label, stmt } of STATEMENTS) {
    try {
      await db.execute(stmt);
      console.log(`[Migration] ✅ ${label} adicionado em leadQualifications`);
    } catch (e: any) {
      if (isAlreadyApplied(e)) {
        console.log(`[Migration] ℹ️ ${label} já existe`);
      } else {
        console.error(`[Migration] Erro addLeadOriginColumns (${label}):`, e?.message);
      }
    }
  }
}
