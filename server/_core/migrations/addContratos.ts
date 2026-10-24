import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';
import { SEED_EMP_JURIDICO } from './seedContratos';

/**
 * Migration v1.9.0 — contratos (CPCV), assinatura, cobrança Asaas, cadastro do comprador e portaria.
 * Idempotente e não destrutiva: só CREATE TABLE IF NOT EXISTS, ADD COLUMN e INSERT de seed que não sobrescreve.
 * Reconciliação com o spec (SPEC_CRM_CONTRATOS_ASAAS_ASSINATURA_BOM_JARDIMS.md, §2, §13 e §14):
 * - nomes em camelCase, como o resto do banco (emp_juridico → empJuridico, lote_codigo → loteCodigo…);
 * - ENUMs do spec viram VARCHAR (valores documentados no schema) — acrescentar um status depois não exige ALTER;
 * - os arquivos (PDFs, versões, documentos das pessoas) ficam no banco, em contratoArquivos: o disco do Railway
 *   é apagado a cada deploy. As colunas "arquivo" guardam a chave do arquivo;
 * - uq_lote_ativo (empreendimento, lote, status) do spec vira índice comum: único, ele impediria um 2º contrato
 *   cancelado no mesmo lote. A exclusividade do lote é garantida na transação de reserva (spec §4.3);
 * - perfis, escopo do corretor (acessosCorretor), empreendedor (users.empreendimentoSlug), credenciais CRECI
 *   (usuarioDocumentos) e notificações já existem e são reaproveitados; a certidão CRECI ganha a data de emissão.
 */
const COLUNAS: [tabela: string, coluna: string, tipo: string][] = [
  ['lotes', 'contratoReservaId', 'INT NULL'],
  ['lotes', 'memorialTexto', 'TEXT NULL'],
  ['lotes', 'viaFrente', 'VARCHAR(60) NULL'],
  ['lotes', 'matricula', 'VARCHAR(30) NULL'],
  ['usuarioDocumentos', 'emissao', 'VARCHAR(10) NULL'],
];

const TABELAS: [nome: string, ddl: string][] = [
  ['contratoArquivos', `CREATE TABLE IF NOT EXISTS contratoArquivos (
    chave VARCHAR(255) PRIMARY KEY,
    mime VARCHAR(60) NOT NULL,
    bytes INT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    conteudoBase64 LONGTEXT NOT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`],
  ['empJuridico', `CREATE TABLE IF NOT EXISTS empJuridico (
    empreendimentoId INT PRIMARY KEY,
    defaultsJson JSON NOT NULL,
    vendedoraTipo VARCHAR(2) NOT NULL DEFAULT 'PF',
    vendedoraJson JSON NOT NULL,
    modeloCpcv VARCHAR(120) NOT NULL DEFAULT 'MODELO-CPCV-BOM-JARDIMS-v2.docx',
    modeloVersao VARCHAR(30) NOT NULL DEFAULT 'CPCV-BJ v2.0',
    marcaSlug VARCHAR(40) NOT NULL DEFAULT 'bomjardims',
    atualizadoPor INT NULL,
    atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_empjur_emp FOREIGN KEY (empreendimentoId) REFERENCES empreendimentos(id)
  )`],
  ['contratoSeq', `CREATE TABLE IF NOT EXISTS contratoSeq (ano SMALLINT PRIMARY KEY, ultimo INT NOT NULL)`],
  ['contratos', `CREATE TABLE IF NOT EXISTS contratos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(20) NOT NULL,
    empreendimentoId INT NOT NULL,
    loteId INT NULL,
    loteCodigo VARCHAR(10) NOT NULL,
    leadId INT NULL,
    corretorUserId INT NOT NULL,
    simulacaoJson JSON NOT NULL,
    dadosJson JSON NOT NULL,
    overridesJson JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    modoAssinatura VARCHAR(12) NOT NULL DEFAULT 'eletronica',
    codigoVerificacao CHAR(12) NOT NULL,
    pdfAtual VARCHAR(255) NULL,
    hashAtual CHAR(64) NULL,
    asaasCustomerId VARCHAR(40) NULL,
    usoLiberado BOOLEAN NOT NULL DEFAULT FALSE,
    usoLiberadoEm DATETIME NULL,
    criadoPor INT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY ux_contrato_numero (numero),
    UNIQUE KEY ux_contrato_codigo (codigoVerificacao),
    INDEX ix_contrato_lote (empreendimentoId, loteCodigo, status),
    INDEX ix_contrato_status (status),
    INDEX ix_contrato_corretor (corretorUserId),
    CONSTRAINT fk_contrato_emp FOREIGN KEY (empreendimentoId) REFERENCES empreendimentos(id),
    CONSTRAINT fk_contrato_corretor FOREIGN KEY (corretorUserId) REFERENCES users(id)
  )`],
  ['contratoVersoes', `CREATE TABLE IF NOT EXISTS contratoVersoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    versao INT NOT NULL,
    etapa VARCHAR(40) NOT NULL,
    arquivo VARCHAR(255) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    bytes INT NOT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_contrato_versao (contratoId, versao),
    CONSTRAINT fk_cv_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['assinaturaSignatarios', `CREATE TABLE IF NOT EXISTS assinaturaSignatarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    papel VARCHAR(20) NOT NULL,
    nome VARCHAR(160) NOT NULL,
    cpf CHAR(11) NOT NULL,
    email VARCHAR(160) NULL,
    whatsapp VARCHAR(20) NULL,
    metodo VARCHAR(12) NULL,
    ordem TINYINT NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'pendente',
    token CHAR(43) NOT NULL,
    assinadoEm DATETIME NULL,
    evidenciasJson JSON NULL,
    UNIQUE KEY ux_signatario_token (token),
    INDEX ix_signatario_contrato (contratoId),
    CONSTRAINT fk_sig_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['assinaturaPosicoes', `CREATE TABLE IF NOT EXISTS assinaturaPosicoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NULL,
    modeloVersao VARCHAR(30) NULL,
    papel VARCHAR(30) NOT NULL,
    pagina INT NOT NULL,
    x DECIMAL(6,5) NOT NULL, y DECIMAL(6,5) NOT NULL,
    w DECIMAL(6,5) NOT NULL, h DECIMAL(6,5) NOT NULL,
    INDEX ix_pos (contratoId, modeloVersao)
  )`],
  ['assinaturaOtp', `CREATE TABLE IF NOT EXISTS assinaturaOtp (
    signatarioId INT PRIMARY KEY,
    codigoHash CHAR(64) NOT NULL,
    expiraEm DATETIME NOT NULL,
    tentativas TINYINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_otp_sig FOREIGN KEY (signatarioId) REFERENCES assinaturaSignatarios(id)
  )`],
  ['assinaturaEventos', `CREATE TABLE IF NOT EXISTS assinaturaEventos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    signatarioId INT NULL,
    evento VARCHAR(40) NOT NULL,
    ip VARCHAR(45) NULL, userAgent VARCHAR(255) NULL, detalhe JSON NULL,
    criadoEm TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX ix_ev_contrato (contratoId)
  )`],
  ['cobrancas', `CREATE TABLE IF NOT EXISTS cobrancas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    tipo VARCHAR(12) NOT NULL,
    numero SMALLINT NOT NULL,
    total SMALLINT NOT NULL,
    vencimento DATE NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    jurosParcela DECIMAL(12,2) NULL,
    amortizacao DECIMAL(12,2) NULL,
    saldoDevedor DECIMAL(12,2) NULL,
    splitValor DECIMAL(12,2) NOT NULL DEFAULT 0,
    asaasPaymentId VARCHAR(40) NULL,
    nossoNumero VARCHAR(30) NULL,
    linhaDigitavel VARCHAR(60) NULL,
    codigoBarras CHAR(44) NULL,
    pixPayload TEXT NULL,
    bankSlipUrl VARCHAR(255) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'prevista',
    pagoEm DATE NULL, valorPago DECIMAL(12,2) NULL,
    UNIQUE KEY ux_cobranca_parcela (contratoId, tipo, numero),
    UNIQUE KEY ux_cobranca_asaas (asaasPaymentId),
    INDEX ix_cobranca_venc (status, vencimento),
    CONSTRAINT fk_cob_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['asaasWebhookLog', `CREATE TABLE IF NOT EXISTS asaasWebhookLog (
    eventId VARCHAR(60) PRIMARY KEY,
    evento VARCHAR(40) NOT NULL,
    paymentId VARCHAR(40) NULL,
    payload JSON NOT NULL,
    processado BOOLEAN NOT NULL DEFAULT FALSE,
    recebidoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`],
  ['pessoas', `CREATE TABLE IF NOT EXISTS pessoas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo VARCHAR(2) NOT NULL DEFAULT 'PF',
    nome VARCHAR(160) NOT NULL,
    nomeSocial VARCHAR(160) NULL,
    cpfCnpj VARCHAR(14) NOT NULL,
    rg VARCHAR(20) NULL, rgOrgao VARCHAR(20) NULL, rgUf CHAR(2) NULL, rgEmissao DATE NULL,
    cnh VARCHAR(20) NULL,
    nascimento DATE NULL, naturalidade VARCHAR(80) NULL, nacionalidade VARCHAR(40) NOT NULL DEFAULT 'brasileira',
    sexo VARCHAR(1) NULL,
    filiacaoMae VARCHAR(160) NULL, filiacaoPai VARCHAR(160) NULL,
    estadoCivil VARCHAR(20) NULL,
    regimeBens VARCHAR(30) NULL,
    pactoAntenupcial VARCHAR(160) NULL,
    dataCasamento DATE NULL,
    profissao VARCHAR(80) NULL, empregador VARCHAR(120) NULL, rendaMensal DECIMAL(12,2) NULL,
    email VARCHAR(160) NULL, email2 VARCHAR(160) NULL,
    telefone1 VARCHAR(20) NULL, telefone1Whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    telefone2 VARCHAR(20) NULL, telefone2Whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    cep CHAR(8) NULL, logradouro VARCHAR(160) NULL, numero VARCHAR(10) NULL, complemento VARCHAR(80) NULL,
    bairro VARCHAR(80) NULL, cidade VARCHAR(80) NULL, uf CHAR(2) NULL,
    canalPreferido VARCHAR(10) NOT NULL DEFAULT 'whatsapp',
    horarioContato VARCHAR(40) NULL,
    lgpdConsentimentoEm DATETIME NULL, lgpdConsentimentoIp VARCHAR(45) NULL, lgpdMarketing BOOLEAN NOT NULL DEFAULT FALSE,
    leadId INT NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY ux_pessoa_doc (cpfCnpj),
    INDEX ix_pessoa_lead (leadId)
  )`],
  ['contratoPessoas', `CREATE TABLE IF NOT EXISTS contratoPessoas (
    contratoId INT NOT NULL,
    pessoaId INT NOT NULL,
    papel VARCHAR(14) NOT NULL,
    fracao DECIMAL(5,2) NULL,
    PRIMARY KEY (contratoId, pessoaId, papel),
    CONSTRAINT fk_cp_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id),
    CONSTRAINT fk_cp_pessoa FOREIGN KEY (pessoaId) REFERENCES pessoas(id)
  )`],
  ['pessoaReferencias', `CREATE TABLE IF NOT EXISTS pessoaReferencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pessoaId INT NOT NULL,
    nome VARCHAR(160) NOT NULL, relacao VARCHAR(40) NOT NULL,
    telefone VARCHAR(20) NOT NULL, email VARCHAR(160) NULL,
    CONSTRAINT fk_ref_pessoa FOREIGN KEY (pessoaId) REFERENCES pessoas(id)
  )`],
  ['pessoaDocumentos', `CREATE TABLE IF NOT EXISTS pessoaDocumentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pessoaId INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    arquivo VARCHAR(255) NOT NULL, sha256 CHAR(64) NOT NULL, mime VARCHAR(60) NOT NULL,
    validadoPor INT NULL, validadoEm DATETIME NULL,
    enviadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_pdoc_pessoa (pessoaId),
    CONSTRAINT fk_pdoc_pessoa FOREIGN KEY (pessoaId) REFERENCES pessoas(id)
  )`],
  ['chacaraDependentes', `CREATE TABLE IF NOT EXISTS chacaraDependentes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    nome VARCHAR(160) NOT NULL,
    parentesco VARCHAR(10) NOT NULL,
    cpf CHAR(11) NULL, nascimento DATE NULL,
    telefone1 VARCHAR(20) NULL, telefone2 VARCHAR(20) NULL, email VARCHAR(160) NULL,
    foto VARCHAR(255) NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dep_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['carteiras', `CREATE TABLE IF NOT EXISTS carteiras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    titularTipo VARCHAR(10) NOT NULL,
    titularId INT NOT NULL,
    numero VARCHAR(20) NOT NULL,
    qrToken CHAR(32) NOT NULL,
    validade DATE NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'ativa',
    emitidaEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_carteira_numero (numero),
    UNIQUE KEY ux_carteira_qr (qrToken),
    CONSTRAINT fk_cart_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['eventosAutorizacoes', `CREATE TABLE IF NOT EXISTS eventosAutorizacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    local VARCHAR(14) NOT NULL,
    dataEvento DATE NOT NULL, horaInicio TIME NOT NULL, horaFim TIME NOT NULL,
    descricao VARCHAR(160) NOT NULL,
    convidadosSolicitados SMALLINT NOT NULL,
    convidadosAutorizados SMALLINT NULL,
    somAmplificado BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(12) NOT NULL DEFAULT 'solicitado',
    decididoPor INT NULL, decididoEm DATETIME NULL, motivo VARCHAR(255) NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evt_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['eventosConvidados', `CREATE TABLE IF NOT EXISTS eventosConvidados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    eventoId INT NOT NULL,
    nome VARCHAR(160) NOT NULL, documento VARCHAR(20) NOT NULL, telefone VARCHAR(20) NULL,
    placa VARCHAR(10) NULL,
    crachaNumero SMALLINT NULL,
    entradaEm DATETIME NULL, saidaEm DATETIME NULL,
    CONSTRAINT fk_conv_evento FOREIGN KEY (eventoId) REFERENCES eventosAutorizacoes(id)
  )`],
];

const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  ...COLUNAS.map(([t, c, tipo]) => ({ nome: `${t}.${c}`, stmt: sql.raw(`ALTER TABLE ${t} ADD COLUMN ${c} ${tipo}`) })),
  ...TABELAS.map(([nome, ddl]) => ({ nome, stmt: sql.raw(ddl) })),
  {
    nome: 'seed empJuridico (Bom Jardims)',
    stmt: sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraTipo, vendedoraJson)
      SELECT e.id, ${JSON.stringify(SEED_EMP_JURIDICO.defaults)}, 'PF', ${JSON.stringify(SEED_EMP_JURIDICO.vendedora)}
      FROM empreendimentos e
      WHERE e.slug = ${SEED_EMP_JURIDICO.slug} AND NOT EXISTS (SELECT 1 FROM empJuridico j WHERE j.empreendimentoId = e.id)`,
  },
];

export async function addContratos(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(msg)) {
        console.warn(`[Migration] addContratos (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addContratos (contratos, assinatura, cobrança, pessoas, portaria)');
}
