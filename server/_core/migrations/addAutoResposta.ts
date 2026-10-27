import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: respostas automáticas no WhatsApp (config por empreendimento, textos por intenção, biblioteca de mídias).
 * Idempotente; o robô começa DESLIGADO. Nomes sem colisão com as tabelas da ZAYRA (server/tabelasZayra.test.ts).
 */
const TABELAS: [string, string][] = [
  ['autoRespostaConfig', `CREATE TABLE IF NOT EXISTS autoRespostaConfig (
    empreendimentoId INT PRIMARY KEY, ativo BOOLEAN NOT NULL DEFAULT FALSE, condicaoValidaAte DATE NULL, avisoLegal TEXT NULL,
    loteAncora VARCHAR(10) NULL, entradaParcelas INT NOT NULL DEFAULT 6, atualizadoPor INT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  ['autoRespostaTextos', `CREATE TABLE IF NOT EXISTS autoRespostaTextos (
    id INT AUTO_INCREMENT PRIMARY KEY, empreendimentoId INT NOT NULL, intencao VARCHAR(40) NOT NULL, texto TEXT NOT NULL, midias VARCHAR(200) NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_autoresp_texto (empreendimentoId, intencao))`],
  ['autoRespostaMidias', `CREATE TABLE IF NOT EXISTS autoRespostaMidias (
    id INT AUTO_INCREMENT PRIMARY KEY, empreendimentoId INT NOT NULL, codigo VARCHAR(40) NOT NULL, tipo VARCHAR(10) NOT NULL, url VARCHAR(500) NOT NULL,
    nomeArquivo VARCHAR(200) NULL, legenda VARCHAR(500) NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_autoresp_midia (empreendimentoId, codigo))`],
  ['linksOferta', `CREATE TABLE IF NOT EXISTS linksOferta (
    token VARCHAR(24) PRIMARY KEY, leadId INT NOT NULL, empreendimentoId INT NOT NULL, aberturas INT NOT NULL DEFAULT 0,
    primeiraAberturaAt TIMESTAMP NULL, ultimaAberturaAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_link_oferta_lead (leadId, empreendimentoId))`],
  ['autoRespostaRegua', `CREATE TABLE IF NOT EXISTS autoRespostaRegua (
    leadId INT PRIMARY KEY, empreendimentoId INT NOT NULL, desde TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, passo INT NOT NULL DEFAULT 0,
    proximoAt TIMESTAMP NULL, seguidas INT NOT NULL DEFAULT 0, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_regua_proximo (proximoAt))`],
  ['zapiMensagensVistas', `CREATE TABLE IF NOT EXISTS zapiMensagensVistas (
    messageId VARCHAR(120) PRIMARY KEY, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_zapi_vista_data (createdAt))`],
];

export async function addAutoResposta(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const [nome, ddl] of TABELAS) {
    try { await (db as any).execute(sql.raw(ddl)); } catch (e: any) { console.warn(`[Migration] addAutoResposta (${nome}):`, e?.message); }
  }
  console.log('[Migration] ✅ addAutoResposta (respostas automáticas — desligadas até o administrador ligar)');
}
