import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: catálogo dos Materiais (temas, texto queimado, duração) e a fila da fábrica de criativos. Idempotente. */
const COLUNAS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'temas', stmt: sql`ALTER TABLE materiais ADD COLUMN temas VARCHAR(200) NULL` },
  { nome: 'temTexto', stmt: sql`ALTER TABLE materiais ADD COLUMN temTexto BOOLEAN NOT NULL DEFAULT FALSE` },
  { nome: 'duracaoMs', stmt: sql`ALTER TABLE materiais ADD COLUMN duracaoMs INT NULL` },
];

export async function addFabricaCriativos(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COLUNAS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.error(`[Migration] addFabricaCriativos (${nome}):`, e?.message);
    }
  }
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS criativosPautas (
      id INT AUTO_INCREMENT PRIMARY KEY, data VARCHAR(10) NOT NULL, nome VARCHAR(80) NOT NULL, empreendimentoSlug VARCHAR(80) NOT NULL,
      tipo VARCHAR(12) NOT NULL, destino VARCHAR(20) NOT NULL, temPreco BOOLEAN NOT NULL DEFAULT FALSE, pautaJson TEXT NOT NULL, legenda TEXT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'pendente', pecasJson TEXT NULL, erro VARCHAR(500) NULL, aprovadoPor INT NULL, aprovadoEm TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_criativo_nome (nome), KEY idx_criativo_data (data)
    )`);
  } catch (e: any) { console.error('[Migration] addFabricaCriativos (tabela):', e?.message); }
  console.log('[Migration] ✅ addFabricaCriativos (catálogo dos Materiais e fila de criativos)');
}
