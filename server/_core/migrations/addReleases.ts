import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration v1.7.0 — notas de versão e tela de descanso. Idempotente e não destrutiva.
 * - systemRelease: uma linha por versão (RELEASE_NOTES.md importado ao subir, ou publicada pelo admin);
 * - systemReleaseLeitura: quem já viu o "Novidades da versão";
 * - users.descansoMinutos: tempo da tela de descanso (0 = desativada).
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'users.descansoMinutos', stmt: sql`ALTER TABLE users ADD COLUMN descansoMinutos INT NOT NULL DEFAULT 3` },
  // v1.59.0 — usuário desativado com histórico sai da lista da Equipe (server/exclusao.ts)
  { nome: 'users.arquivadoEm', stmt: sql`ALTER TABLE users ADD COLUMN arquivadoEm TIMESTAMP NULL` },
  {
    nome: 'systemRelease',
    stmt: sql`CREATE TABLE IF NOT EXISTS systemRelease (
      id INT AUTO_INCREMENT PRIMARY KEY,
      versao VARCHAR(20) NOT NULL,
      tipo VARCHAR(10) NOT NULL DEFAULT 'patch',
      titulo VARCHAR(150) NOT NULL,
      itens JSON NOT NULL,
      obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
      publico VARCHAR(20) NOT NULL DEFAULT 'todos',
      publicadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      publicadoPor INT NULL,
      hashArquivo VARCHAR(64) NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE KEY ux_release_versao (versao)
    ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    nome: 'systemReleaseLeitura',
    stmt: sql`CREATE TABLE IF NOT EXISTS systemReleaseLeitura (
      releaseId INT NOT NULL,
      usuarioId INT NOT NULL,
      lidoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (releaseId, usuarioId),
      UNIQUE KEY ux_release_leitura (releaseId, usuarioId),
      CONSTRAINT fk_leitura_release FOREIGN KEY (releaseId) REFERENCES systemRelease(id) ON DELETE CASCADE,
      CONSTRAINT fk_leitura_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
];

export async function addReleases(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.warn(`[Migration] addReleases (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addReleases (notas de versão, tela de descanso)');
}
