import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: origem do recurso da despesa (caixa ou terceiro) e a devolução ao terceiro. Idempotente. */
const COLUNAS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'origemRecurso', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN origemRecurso VARCHAR(12) NOT NULL DEFAULT 'caixa'` },
  { nome: 'terceiroNome', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN terceiroNome VARCHAR(120) NULL` },
  { nome: 'terceiroDocumento', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN terceiroDocumento VARCHAR(20) NULL` },
  { nome: 'terceiroModalidade', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN terceiroModalidade VARCHAR(15) NULL` },
  { nome: 'terceiroFinalidade', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN terceiroFinalidade VARCHAR(300) NULL` },
  { nome: 'reembolsadoEm', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN reembolsadoEm VARCHAR(10) NULL` },
  { nome: 'reembolsoValor', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN reembolsoValor DECIMAL(12,2) NULL` },
  { nome: 'reembolsoForma', stmt: sql`ALTER TABLE financeiroDespesas ADD COLUMN reembolsoForma VARCHAR(20) NULL` },
];

export async function addOrigemDespesa(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COLUNAS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.error(`[Migration] addOrigemDespesa (${nome}):`, e?.message);
    }
  }
  console.log('[Migration] ✅ addOrigemDespesa (origem do recurso e devolução ao terceiro)');
}
