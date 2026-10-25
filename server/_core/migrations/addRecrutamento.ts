import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: recrutamento (convite → formulário público → aprovação com senha provisória). Idempotente.
 * Nomes de tabela sem colisão com a ZAYRA (mesmo banco — server/tabelasZayra.test.ts).
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'users.trocarSenha', stmt: sql`ALTER TABLE users ADD COLUMN trocarSenha BOOLEAN NOT NULL DEFAULT FALSE` },
  { nome: 'users.senhaProvisoriaExpira', stmt: sql`ALTER TABLE users ADD COLUMN senhaProvisoriaExpira DATETIME NULL` },
  {
    nome: 'recrutamentos',
    stmt: sql`CREATE TABLE IF NOT EXISTS recrutamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      perfil VARCHAR(15) NOT NULL,
      nome VARCHAR(150) NOT NULL,
      telefone VARCHAR(20) NOT NULL,
      email VARCHAR(160) NULL,
      empreendimentoSlug VARCHAR(80) NULL,
      token VARCHAR(64) NOT NULL,
      tokenExpira DATETIME NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'convidado',
      dadosJson LONGTEXT NULL,
      usuarioId INT NULL,
      criadoPor INT NOT NULL,
      enviadoEm DATETIME NULL,
      preenchidoEm DATETIME NULL,
      decididoEm DATETIME NULL,
      decididoPor INT NULL,
      motivo VARCHAR(300) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_recrutamento_token (token)
    )`,
  },
  {
    nome: 'recrutamentoDocs',
    stmt: sql`CREATE TABLE IF NOT EXISTS recrutamentoDocs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recrutamentoId INT NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      nome VARCHAR(200) NOT NULL,
      mime VARCHAR(60) NOT NULL,
      tamanhoBytes INT NOT NULL,
      conteudoBase64 LONGTEXT NOT NULL,
      validade DATE NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_recrutamento_doc (recrutamentoId, tipo),
      CONSTRAINT fk_recrutamento_doc FOREIGN KEY (recrutamentoId) REFERENCES recrutamentos(id) ON DELETE CASCADE
    )`,
  },
];

export async function addRecrutamento(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.warn(`[Migration] addRecrutamento (${nome}):`, e?.message);
    }
  }
  console.log('[Migration] ✅ addRecrutamento (recrutamento e senha provisória)');
}
