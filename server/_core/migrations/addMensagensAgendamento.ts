import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: mensagens do link de agendamento. Idempotente e não destrutiva.
 * - leadVisitas.pedidoJson / confirmacaoEnviadaAt: dados do formulário e envio da confirmação ao cliente;
 * - modelosMensagem: textos editáveis nas Configurações (sem linha, vale o padrão do código).
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'leadVisitas.pedidoJson', stmt: sql`ALTER TABLE leadVisitas ADD COLUMN pedidoJson TEXT NULL` },
  { nome: 'leadVisitas.confirmacaoEnviadaAt', stmt: sql`ALTER TABLE leadVisitas ADD COLUMN confirmacaoEnviadaAt TIMESTAMP NULL` },
  {
    nome: 'modelosMensagem',
    stmt: sql`CREATE TABLE IF NOT EXISTS modelosMensagem (
      chave VARCHAR(60) PRIMARY KEY,
      texto TEXT NOT NULL,
      atualizadoPor INT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

export async function addMensagensAgendamento(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(msg)) console.warn(`[Migration] addMensagensAgendamento (${nome}):`, msg);
    }
  }
  console.log('[Migration] ✅ addMensagensAgendamento (confirmação do agendamento e modelos de mensagem)');
}
