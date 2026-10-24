import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration v1.12.0 — assinatura eletrônica do contrato. Idempotente e não destrutiva (só ADD COLUMN):
 * - assinaturaSignatarios: validade do link (15 dias), revisão manual (gov.br sem CPF no certificado);
 * - contratos: início do envio para assinatura e o manifesto (Anexo VII, arquivo separado em contratoArquivos).
 */
const COLUNAS: [string, string, string][] = [
  ['assinaturaSignatarios', 'expiraEm', 'DATETIME NULL'],
  ['assinaturaSignatarios', 'revisaoManual', 'TINYINT NOT NULL DEFAULT 0'],
  ['contratos', 'assinaturaIniciadaEm', 'DATETIME NULL'],
  ['contratos', 'manifestoArquivo', 'VARCHAR(255) NULL'],
];

export async function addAssinatura(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const [t, c, tipo] of COLUNAS) {
    try {
      await (db as any).execute(sql.raw(`ALTER TABLE ${t} ADD COLUMN ${c} ${tipo}`));
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.warn(`[Migration] addAssinatura (${t}.${c}):`, e?.message);
    }
  }
  console.log('[Migration] ✅ addAssinatura (validade dos links, manifesto)');
}
