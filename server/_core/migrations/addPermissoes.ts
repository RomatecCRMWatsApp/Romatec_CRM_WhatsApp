import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';
import { MODULOS } from '../../../shared/permissoes';

/**
 * Migration: portal de permissões (shared/permissoes.ts). Idempotente e não destrutiva.
 * - permissoesPerfil: pacote base por perfil e módulo (semeado com o padrão do código; só insere o que falta).
 * - permissoesUsuario: liga/desliga módulo por corretor (prevalece sobre o pacote base).
 * - acessosCorretor: empreendimentos/imóveis habilitados por corretor (+ % de comissão opcional).
 * - Primeira execução: os colaboradores que já existem ficam com acesso a todos os empreendimentos
 *   e imóveis atuais (é o que eles já viam) — o admin tira depois no portal. Só roda com a tabela
 *   permissoesPerfil vazia, então não devolve acesso que o admin tenha removido.
 * Credenciais (CRECI único, e-mail, senha scrypt, convite) já estão em users (addEquipe).
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  {
    nome: 'permissoesPerfil',
    stmt: sql`CREATE TABLE IF NOT EXISTS permissoesPerfil (
      id INT AUTO_INCREMENT PRIMARY KEY,
      perfil VARCHAR(20) NOT NULL,
      modulo VARCHAR(40) NOT NULL,
      permitido BOOLEAN NOT NULL DEFAULT TRUE,
      atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_perm_perfil (perfil, modulo)
    )`,
  },
  {
    nome: 'permissoesUsuario',
    stmt: sql`CREATE TABLE IF NOT EXISTS permissoesUsuario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      modulo VARCHAR(40) NOT NULL,
      permitido BOOLEAN NOT NULL,
      atualizadoPor INT NULL,
      atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_perm_usuario (usuarioId, modulo),
      CONSTRAINT fk_perm_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  {
    nome: 'acessosCorretor',
    stmt: sql`CREATE TABLE IF NOT EXISTS acessosCorretor (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      tipo ENUM('empreendimento','imovel') NOT NULL,
      refId INT NOT NULL,
      comissaoPct DECIMAL(6,4) NULL,
      habilitadoPor INT NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_acesso (usuarioId, tipo, refId),
      INDEX idx_acesso_ref (tipo, refId),
      CONSTRAINT fk_acesso_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  // Primeira execução (permissoesPerfil ainda vazia): mantém o que os colaboradores já viam
  {
    nome: 'acessos iniciais (empreendimentos)',
    stmt: sql`INSERT IGNORE INTO acessosCorretor (usuarioId, tipo, refId)
      SELECT u.id, 'empreendimento', e.id FROM users u CROSS JOIN empreendimentos e
      WHERE u.role <> 'admin' AND (u.perfil IS NULL OR u.perfil = 'equipe')
        AND NOT EXISTS (SELECT 1 FROM permissoesPerfil)`,
  },
  {
    nome: 'acessos iniciais (imóveis)',
    stmt: sql`INSERT IGNORE INTO acessosCorretor (usuarioId, tipo, refId)
      SELECT u.id, 'imovel', p.id FROM users u CROSS JOIN properties p
      WHERE u.role <> 'admin' AND (u.perfil IS NULL OR u.perfil = 'equipe')
        AND NOT EXISTS (SELECT 1 FROM permissoesPerfil)`,
  },
  // Pacote base do corretor: só insere módulo que ainda não tem linha (não sobrescreve o que o admin mudou)
  ...MODULOS.map(m => ({
    nome: `pacote base equipe.${m.chave}`,
    stmt: sql`INSERT IGNORE INTO permissoesPerfil (perfil, modulo, permitido) VALUES ('equipe', ${m.chave}, ${m.padraoCorretor})`,
  })),
];

export async function addPermissoes(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.warn(`[Migration] addPermissoes (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addPermissoes (pacote base, permissões por corretor, empreendimentos/imóveis habilitados)');
}
