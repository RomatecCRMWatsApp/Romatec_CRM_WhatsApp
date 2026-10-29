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
  // Convites de reunião com confirmação de presença (shared/convites.ts)
  ['reunioesAgenda', `CREATE TABLE IF NOT EXISTS reunioesAgenda (
    id INT AUTO_INCREMENT PRIMARY KEY, titulo VARCHAR(160) NOT NULL, empreendimentoId INT NULL, quando TIMESTAMP NOT NULL,
    local VARCHAR(250) NULL, linkVideo VARCHAR(300) NULL, descricao TEXT NULL, tokenGeral VARCHAR(24) NOT NULL,
    folderMime VARCHAR(40) NULL, folderNome VARCHAR(160) NULL, folderBase64 LONGTEXT NULL, criadoPor INT NOT NULL, canceladaEm TIMESTAMP NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reuniao_agenda_token (tokenGeral), KEY ix_reuniao_agenda_emp (empreendimentoId, quando))`],
  ['reuniaoConvidados', `CREATE TABLE IF NOT EXISTS reuniaoConvidados (
    id INT AUTO_INCREMENT PRIMARY KEY, reuniaoId INT NOT NULL, nome VARCHAR(120) NOT NULL, telefone VARCHAR(15) NOT NULL,
    token VARCHAR(24) NOT NULL, origem VARCHAR(12) NOT NULL DEFAULT 'lista', status VARCHAR(12) NOT NULL DEFAULT 'pendente',
    respondidoEm TIMESTAMP NULL, conviteEnviadoEm TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reuniao_conv_token (token), UNIQUE KEY uq_reuniao_conv_fone (reuniaoId, telefone))`],
  // Ranking de vendas: prazo da campanha por empreendimento (shared/ranking.ts) — sem linha = tempo indeterminado
  ['rankingCampanhas', `CREATE TABLE IF NOT EXISTS rankingCampanhas (
    empreendimentoId INT PRIMARY KEY, modo VARCHAR(14) NOT NULL DEFAULT 'indeterminado', dataEncerramento VARCHAR(10) NULL,
    premio VARCHAR(200) NULL, encerradaEm DATETIME NULL, motivoEncerramento VARCHAR(12) NULL, congeladoJson TEXT NULL,
    atualizadoPor INT NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  // Páginas de campanha (/obras-bom-jardim): cadastros e cliques por corretor do rodízio
  ['campanhaCliques', `CREATE TABLE IF NOT EXISTS campanhaCliques (
    id INT AUTO_INCREMENT PRIMARY KEY, campanha VARCHAR(60) NOT NULL, acao VARCHAR(12) NOT NULL, corretorId INT NULL,
    utmSource VARCHAR(100) NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_campanha_cliques (campanha, criadoEm))`],
  // Links de divulgação cadastrados pelo escritório (Campanhas de captação › Links de divulgação)
  ['linksDivulgacao', `CREATE TABLE IF NOT EXISTS linksDivulgacao (
    id INT AUTO_INCREMENT PRIMARY KEY, titulo VARCHAR(120) NOT NULL, descricao VARCHAR(300) NULL, url VARCHAR(500) NOT NULL,
    utmSource VARCHAR(60) NULL, utmCampaign VARCHAR(60) NULL, textoWhatsapp TEXT NOT NULL, empreendimento VARCHAR(80) NULL,
    destaque BOOLEAN NOT NULL DEFAULT FALSE, ativo BOOLEAN NOT NULL DEFAULT TRUE, criadoPor INT NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
];

export async function addAutoResposta(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const [nome, ddl] of TABELAS) {
    try { await (db as any).execute(sql.raw(ddl)); } catch (e: any) { console.warn(`[Migration] addAutoResposta (${nome}):`, e?.message); }
  }
  console.log('[Migration] ✅ addAutoResposta (respostas automáticas — desligadas até o administrador ligar)');
}
