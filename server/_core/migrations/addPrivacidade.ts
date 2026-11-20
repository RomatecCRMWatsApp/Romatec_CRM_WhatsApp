import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: canal do titular e aceites versionados (LGPD). Só cria tabelas novas; idempotente; sem alterar dados. */
export async function addPrivacidade(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  const d = db as any;
  await d.execute(sql`CREATE TABLE IF NOT EXISTS privacidadePedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    protocolo VARCHAR(24) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    nome VARCHAR(160) NOT NULL,
    contato VARCHAR(160) NOT NULL,
    contatoTipo VARCHAR(10) NOT NULL,
    descricao TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'aguardando_verificacao',
    responsavelId INT NULL,
    prazoEm BIGINT NULL,
    codigoHash VARCHAR(64) NULL,
    codigoExpira BIGINT NULL,
    tentativas INT NOT NULL DEFAULT 0,
    verificadoEm BIGINT NULL,
    ipHash VARCHAR(64) NULL,
    resposta TEXT NULL,
    criadoEm BIGINT NOT NULL,
    atualizadoEm BIGINT NULL,
    concluidoEm BIGINT NULL,
    UNIQUE KEY ux_privped_protocolo (protocolo),
    INDEX ix_privped_status (status)
  )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS privacidadePedidoEventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedidoId INT NOT NULL,
    evento VARCHAR(40) NOT NULL,
    usuarioId INT NULL,
    detalheJson TEXT NULL,
    criadoEm BIGINT NOT NULL,
    INDEX ix_privev_pedido (pedidoId)
  )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS privacidadeAceites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuarioId INT NOT NULL,
    documento VARCHAR(16) NOT NULL,
    versao VARCHAR(20) NOT NULL,
    hash VARCHAR(64) NOT NULL,
    acao VARCHAR(10) NOT NULL,
    criadoEm BIGINT NOT NULL,
    INDEX ix_privaceite_usuario (usuarioId)
  )`);
  console.log('[Migration] ✅ addPrivacidade (pedidos de titular e aceites)');
}
