import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';
import { PLANOS_PADRAO } from '../../../shared/saas';

/**
 * Migration: camada SaaS fase 1 (planos, cupons, assinaturas, faturas, trials, auditoria de acesso, talonários,
 * corretores externos). Idempotente; semeia os 5 planos do MD (sem sobrescrever valores já editados).
 * Nomes sem colisão com as tabelas da ZAYRA (mesmo banco — server/tabelasZayra.test.ts).
 */
const TABELAS: [string, string][] = [
  ['saasConfig', `CREATE TABLE IF NOT EXISTS saasConfig (
    chave VARCHAR(60) PRIMARY KEY, valor TEXT NULL, atualizadoPor INT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  ['saasPlanos', `CREATE TABLE IF NOT EXISTS saasPlanos (
    id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(40) NOT NULL, publico VARCHAR(15) NOT NULL, nome VARCHAR(80) NOT NULL,
    precoMensal DECIMAL(10,2) NOT NULL, precoAnual DECIMAL(10,2) NULL, storageGb INT NOT NULL DEFAULT 5, incluiAvalieimob BOOLEAN NOT NULL DEFAULT FALSE,
    unico BOOLEAN NOT NULL DEFAULT FALSE, conteudo TEXT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_saas_plano (codigo))`],
  ['saasCupons', `CREATE TABLE IF NOT EXISTS saasCupons (
    id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(40) NOT NULL, tipo VARCHAR(12) NOT NULL, valor DECIMAL(10,2) NOT NULL DEFAULT 0,
    precosFixosJson TEXT NULL, planoAlvo VARCHAR(40) NULL, limiteUsos INT NOT NULL DEFAULT 1, usosRealizados INT NOT NULL DEFAULT 0,
    validade DATETIME NULL, duracaoCiclos INT NOT NULL DEFAULT 1, status VARCHAR(12) NOT NULL DEFAULT 'ativo', descricao VARCHAR(200) NULL,
    criadoPor INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_saas_cupom (codigo))`],
  ['saasAssinaturas', `CREATE TABLE IF NOT EXISTS saasAssinaturas (
    id INT AUTO_INCREMENT PRIMARY KEY, usuarioId INT NOT NULL, planoId INT NOT NULL, empreendimentoId INT NULL, chave VARCHAR(40) NOT NULL,
    origem VARCHAR(15) NOT NULL, ciclo VARCHAR(8) NOT NULL DEFAULT 'MENSAL', status VARCHAR(20) NOT NULL, precoOverride DECIMAL(10,2) NULL,
    cupomId INT NULL, ciclosCupomRestantes INT NULL, trialFim DATETIME NULL, periodoFim DATETIME NULL, diasTolerancia INT NOT NULL DEFAULT 3,
    contratoGestaoNr VARCHAR(40) NULL, mpPreapprovalId VARCHAR(64) NULL, lembretesJson TEXT NULL, motivo VARCHAR(300) NULL,
    version INT NOT NULL DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_saas_assinatura (chave), KEY idx_saas_status_fim (status, periodoFim),
    CONSTRAINT fk_saas_assin_plano FOREIGN KEY (planoId) REFERENCES saasPlanos(id))`],
  ['saasFaturas', `CREATE TABLE IF NOT EXISTS saasFaturas (
    id INT AUTO_INCREMENT PRIMARY KEY, assinaturaId INT NOT NULL, competencia VARCHAR(7) NOT NULL, valor DECIMAL(10,2) NOT NULL,
    incluiImplantacao BOOLEAN NOT NULL DEFAULT FALSE, metodo VARCHAR(20) NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'ABERTA',
    vencimento DATE NOT NULL, pagoEm DATETIME NULL, mpPaymentId VARCHAR(64) NULL, linkPagamento VARCHAR(500) NULL, nfseId INT NULL,
    observacao VARCHAR(300) NULL, criadoPor INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_saas_fatura_comp (assinaturaId, competencia), UNIQUE KEY uq_saas_fatura_mp (mpPaymentId),
    CONSTRAINT fk_saas_fatura_assin FOREIGN KEY (assinaturaId) REFERENCES saasAssinaturas(id))`],
  ['saasTrials', `CREATE TABLE IF NOT EXISTS saasTrials (
    cpfCnpj VARCHAR(18) PRIMARY KEY, usuarioId INT NULL, usadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  ['auditoriaAcesso', `CREATE TABLE IF NOT EXISTS auditoriaAcesso (
    id INT AUTO_INCREMENT PRIMARY KEY, usuarioId INT NOT NULL, evento VARCHAR(30) NOT NULL, detalheJson TEXT NULL, ip VARCHAR(45) NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_aud_acesso_usuario (usuarioId, criadoEm))`],
  ['corretoresExternos', `CREATE TABLE IF NOT EXISTS corretoresExternos (
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(150) NOT NULL, cpf VARCHAR(11) NOT NULL, creci VARCHAR(20) NULL, creciUf VARCHAR(2) NULL,
    telefone VARCHAR(20) NULL, email VARCHAR(160) NULL, observacao VARCHAR(300) NULL, recrutamentoId INT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criadoPor INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_corretor_externo_cpf (cpf))`],
  ['talonarios', `CREATE TABLE IF NOT EXISTS talonarios (
    id INT AUTO_INCREMENT PRIMARY KEY, tipo VARCHAR(10) NOT NULL, numeroInicial INT NOT NULL, numeroFinal INT NOT NULL, externoId INT NULL,
    usuarioId INT NULL, entregueEm DATE NOT NULL, entreguePor INT NOT NULL, observacao VARCHAR(255) NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  ['talonarioFolhas', `CREATE TABLE IF NOT EXISTS talonarioFolhas (
    talonarioId INT NOT NULL, numero INT NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'EM_BRANCO', contratoId INT NULL, referencia VARCHAR(160) NULL,
    arquivoNome VARCHAR(200) NULL, arquivoMime VARCHAR(60) NULL, arquivoBase64 LONGTEXT NULL, lancadoPor INT NULL, lancadoEm DATETIME NULL,
    PRIMARY KEY (talonarioId, numero), CONSTRAINT fk_talonario_folha FOREIGN KEY (talonarioId) REFERENCES talonarios(id))`],
];

export async function addSaas(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const [nome, ddl] of TABELAS) {
    try { await (db as any).execute(sql.raw(ddl)); } catch (e: any) { console.warn(`[Migration] addSaas (${nome}):`, e?.message); }
  }
  for (const p of PLANOS_PADRAO) {
    try {
      await (db as any).execute(sql`INSERT IGNORE INTO saasPlanos (codigo, publico, nome, precoMensal, precoAnual, storageGb, incluiAvalieimob, unico, conteudo)
        VALUES (${p.codigo}, ${p.publico}, ${p.nome}, ${p.precoMensal}, ${p.precoAnual}, ${p.storageGb}, ${p.incluiAvalieimob ? 1 : 0}, ${p.unico ? 1 : 0}, ${p.conteudo})`);
    } catch (e: any) { console.warn(`[Migration] addSaas (plano ${p.codigo}):`, e?.message); }
  }
  console.log('[Migration] ✅ addSaas (camada SaaS fase 1 — licenciamento desligado até o administrador ligar)');
}
