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
  // Fila de espera por chácara (server/lotes/filaEspera.ts)
  ['loteFilaEspera', `CREATE TABLE IF NOT EXISTS loteFilaEspera (
    id INT AUTO_INCREMENT PRIMARY KEY, empreendimentoId INT NOT NULL, loteId INT NOT NULL, loteCodigo VARCHAR(10) NOT NULL, leadId INT NULL,
    nome VARCHAR(160) NOT NULL, telefone VARCHAR(20) NULL, corretorId INT NULL, status VARCHAR(12) NOT NULL DEFAULT 'aguardando',
    avisadoEm TIMESTAMP NULL, observacao VARCHAR(300) NULL, criadoPor INT NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_fila_espera_lote (loteId, status, criadoEm))`],
  // Portal do comprador: andamento da obra e chamados (server/financeiro/portalComprador.ts)
  ['obraAtualizacoes', `CREATE TABLE IF NOT EXISTS obraAtualizacoes (
    id INT AUTO_INCREMENT PRIMARY KEY, empreendimentoId INT NOT NULL, titulo VARCHAR(160) NOT NULL, texto TEXT NOT NULL, percentual INT NULL,
    fotoArquivo VARCHAR(255) NULL, data VARCHAR(10) NOT NULL, criadoPor INT NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_obra_emp (empreendimentoId, data))`],
  ['portalChamados', `CREATE TABLE IF NOT EXISTS portalChamados (
    id INT AUTO_INCREMENT PRIMARY KEY, contratoId INT NOT NULL, tipo VARCHAR(20) NOT NULL, assunto VARCHAR(160) NOT NULL, mensagem TEXT NOT NULL,
    dadosJson TEXT NULL, status VARCHAR(12) NOT NULL DEFAULT 'aberto', resposta TEXT NULL, respondidoPor INT NULL, respondidoEm TIMESTAMP NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_chamado_contrato (contratoId, criadoEm), KEY ix_chamado_status (status))`],
  // Termos aditivos de renegociação (server/financeiro/renegociacao.ts)
  ['contratoAditivos', `CREATE TABLE IF NOT EXISTS contratoAditivos (
    id INT AUTO_INCREMENT PRIMARY KEY, contratoId INT NOT NULL, numero INT NOT NULL, tipo VARCHAR(20) NOT NULL DEFAULT 'renegociacao',
    status VARCHAR(12) NOT NULL DEFAULT 'aguardando', dadosJson TEXT NOT NULL, pdfArquivo VARCHAR(255) NOT NULL, pdfSha256 CHAR(64) NOT NULL,
    pdfAssinadoArquivo VARCHAR(255) NULL, token CHAR(32) NOT NULL, otpHash CHAR(64) NULL, otpExpira DATETIME NULL, otpTentativas INT NOT NULL DEFAULT 0,
    otpEnvios INT NOT NULL DEFAULT 0, assinadoEm DATETIME NULL, assinaturaIp VARCHAR(64) NULL, assinaturaUa VARCHAR(300) NULL, resultadoJson TEXT NULL,
    criadoPor INT NULL, canceladoPor INT NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_aditivo_numero (contratoId, numero), UNIQUE KEY ux_aditivo_token (token))`],
  // Sequências de follow-up por etapa do funil (server/leads/followup.ts)
  ['followUpSequencias', `CREATE TABLE IF NOT EXISTS followUpSequencias (
    etapa VARCHAR(30) PRIMARY KEY, ativo BOOLEAN NOT NULL DEFAULT TRUE, passosJson TEXT NOT NULL, atualizadoPor INT NULL,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  // Horários de visita oferecidos pelo robô (server/autoresposta/visitaConversa.ts)
  ['visitaOfertas', `CREATE TABLE IF NOT EXISTS visitaOfertas (
    leadId INT PRIMARY KEY, opcoesJson TEXT NOT NULL, expiraEm DATETIME NOT NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`],
  // Chaves da API para parceiros (server/apiParceiros.ts)
  ['apiChaves', `CREATE TABLE IF NOT EXISTS apiChaves (
    id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(120) NOT NULL, prefixo VARCHAR(12) NOT NULL, hash CHAR(64) NOT NULL, escopos VARCHAR(120) NOT NULL,
    corretorId INT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE, ultimoUso TIMESTAMP NULL, usos INT NOT NULL DEFAULT 0, criadoPor INT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY ux_api_prefixo (prefixo))`],
  // Caixa de entrada: Instagram Direct (server/caixaEntrada.ts)
  ['igConversas', `CREATE TABLE IF NOT EXISTS igConversas (
    id INT AUTO_INCREMENT PRIMARY KEY, igsid VARCHAR(64) NOT NULL, nome VARCHAR(160) NULL, username VARCHAR(80) NULL, leadId INT NULL, responsavelId INT NULL,
    ultimaEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ultimaDoClienteEm TIMESTAMP NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_ig_igsid (igsid))`],
  ['igMensagens', `CREATE TABLE IF NOT EXISTS igMensagens (
    id INT AUTO_INCREMENT PRIMARY KEY, conversaId INT NOT NULL, direcao VARCHAR(3) NOT NULL, texto TEXT NOT NULL, mid VARCHAR(160) NULL, autorId INT NULL,
    criadoEm TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY ix_igmsg_conversa (conversaId, criadoEm), UNIQUE KEY ux_igmsg_mid (mid))`],
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
