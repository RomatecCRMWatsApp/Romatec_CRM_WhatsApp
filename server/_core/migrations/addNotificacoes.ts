import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration v1.8.0 — notificações do sininho e Web Push. Idempotente e não destrutiva.
 * - notificacoes: uma linha por destinatário (lida/não lida);
 * - pushInscricoes: aparelhos inscritos no push (endpoint único; os mortos saem no 404/410).
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  {
    nome: 'notificacoes',
    stmt: sql`CREATE TABLE IF NOT EXISTS notificacoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      titulo VARCHAR(160) NOT NULL,
      mensagem VARCHAR(500) NOT NULL,
      url VARCHAR(300) NULL,
      empreendimentoId INT NULL,
      loteId INT NULL,
      chave VARCHAR(80) NULL,
      lidaEm TIMESTAMP NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ix_notif_usuario (usuarioId, id),
      INDEX ix_notif_chave (tipo, chave),
      CONSTRAINT fk_notif_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    nome: 'pushInscricoes',
    stmt: sql`CREATE TABLE IF NOT EXISTS pushInscricoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      endpointHash VARCHAR(64) NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh VARCHAR(200) NOT NULL,
      auth VARCHAR(100) NOT NULL,
      userAgent VARCHAR(300) NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ux_push_endpoint (endpointHash),
      INDEX ix_push_usuario (usuarioId),
      CONSTRAINT fk_push_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
];

export async function addNotificacoes(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      console.warn(`[Migration] addNotificacoes (${nome}):`, e?.message ?? e);
    }
  }
  console.log('[Migration] ✅ addNotificacoes (sininho e Web Push)');
}
