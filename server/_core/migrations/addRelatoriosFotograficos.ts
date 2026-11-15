import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: relatórios fotográficos (relatório + fotos + trilha). Só cria tabelas novas; idempotente. */
export async function addRelatoriosFotograficos(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  const d = db as any;
  await d.execute(sql`CREATE TABLE IF NOT EXISTS relatoriosFotograficos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid CHAR(32) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    titulo VARCHAR(180) NOT NULL,
    descricao TEXT NULL,
    tipoAtividade VARCHAR(12) NOT NULL,
    dataAtividade VARCHAR(10) NOT NULL,
    dataAtividadeOrigem VARCHAR(24) NOT NULL DEFAULT 'user_provided',
    empreendimentoId INT NULL,
    loteCodigo VARCHAR(20) NULL,
    imovelId INT NULL,
    clienteId INT NULL,
    responsavelUserId INT NOT NULL,
    status VARCHAR(8) NOT NULL DEFAULT 'draft',
    derivadoDeId INT NULL,
    finalizadoEm DATETIME NULL,
    finalizadoPor INT NULL,
    criadoPor INT NOT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizadoEm DATETIME NULL,
    excluidoEm DATETIME NULL,
    UNIQUE KEY ux_relfoto_uid (uid),
    INDEX ix_relfoto_resp (responsavelUserId),
    INDEX ix_relfoto_emp (empreendimentoId)
  )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS relatorioFotos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    relatorioId INT NOT NULL,
    uid CHAR(32) NOT NULL,
    ordem INT NOT NULL DEFAULT 0,
    legenda VARCHAR(1000) NULL,
    incluirCliente INT NOT NULL DEFAULT 1,
    mime VARCHAR(30) NOT NULL,
    bytes INT NOT NULL,
    largura INT NULL,
    altura INT NULL,
    nomeOriginal VARCHAR(255) NULL,
    arquivoOriginal VARCHAR(255) NOT NULL,
    arquivoPrevia VARCHAR(255) NOT NULL,
    arquivoMiniatura VARCHAR(255) NOT NULL,
    origemCaptura VARCHAR(16) NULL,
    capturadaEm DATETIME NULL,
    geoConsentimento INT NOT NULL DEFAULT 0,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    enviadaPor INT NOT NULL,
    enviadaEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    excluidaEm DATETIME NULL,
    UNIQUE KEY ux_relfotofoto_uid (uid),
    INDEX ix_relfotofoto_rel (relatorioId)
  )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS relatorioEventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    relatorioId INT NOT NULL,
    usuarioId INT NULL,
    evento VARCHAR(30) NOT NULL,
    detalheJson TEXT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_releventos_rel (relatorioId)
  )`);
  console.log('[Migration] ✅ addRelatoriosFotograficos');
}
