import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** leadEncaminhamentos: confirmação de recebimento pelo corretor e desfecho do atendimento (idempotente) */
const COLUNAS: [string, string, string][] = [
  ['recebidoEm', 'TIMESTAMP NULL', 'INTEGER'], ['desfecho', 'VARCHAR(20) NULL', 'TEXT'], ['desfechoMotivo', 'VARCHAR(200) NULL', 'TEXT'],
  ['desfechoEm', 'TIMESTAMP NULL', 'INTEGER'], ['desfechoPor', 'INT NULL', 'INTEGER'],
];

export async function addDesfechoEncaminhamento(): Promise<void> {
  const db: any = await getDb();
  if (!db) return;
  for (const [c, mysql, sqlite] of COLUNAS) {
    try {
      if (getDbDriver() === 'mysql') await db.execute(sql.raw(`ALTER TABLE leadEncaminhamentos ADD COLUMN ${c} ${mysql}`));
      else db.run(sql.raw(`ALTER TABLE leadEncaminhamentos ADD COLUMN ${c} ${sqlite}`));
    } catch (e: any) {
      const msg = String(e?.message ?? e?.cause?.message ?? '') + String(e?.code ?? e?.cause?.code ?? '');
      if (!/duplicate|already exists|ER_DUP_FIELDNAME/i.test(msg)) console.warn(`[Migration] leadEncaminhamentos.${c}:`, msg);
    }
  }
}
