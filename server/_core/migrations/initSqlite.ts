/**
 * SQLite Initialization — cria todas as tabelas na primeira execução
 * Usado quando DATABASE_DRIVER=sqlite (modo local / Electron)
 * Idempotente: usa CREATE TABLE IF NOT EXISTS em todas as tabelas
 */
import { DESCONTO_AVISTA_TOTAL_PADRAO } from '../../../shared/simulador';
import { SEED_EMP_JURIDICO } from './seedContratos';
import { PLANOS_PADRAO } from '../../../shared/saas';

export function initSqliteTables(sqlite: any): void {
  const run = (sql: string) => {
    try { sqlite.prepare(sql).run(); }
    catch (e: any) {
      if (!e.message?.includes('already exists') && !e.message?.includes('duplicate column')) {
        console.error('[SQLite] Erro ao criar tabela:', e.message, '\nSQL:', sql.substring(0, 80));
      }
    }
  };

  run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    openId TEXT NOT NULL UNIQUE,
    name TEXT,
    email TEXT,
    loginMethod TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    password TEXT,
    password_hash TEXT,
    passwordHash TEXT,
    perfil TEXT, creci TEXT UNIQUE, telefone TEXT, empreendimentoSlug TEXT, ativo INTEGER NOT NULL DEFAULT 1,
    conviteHash TEXT, conviteExpira INTEGER,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    lastSignedIn INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  // Bancos SQLite criados antes das colunas de senha
  run(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  run(`ALTER TABLE users ADD COLUMN passwordHash TEXT`);

  run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    blockedUntil INTEGER,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    denomination TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT,
    state TEXT,
    cep TEXT,
    price REAL NOT NULL,
    offerPrice REAL,
    description TEXT,
    images TEXT,
    videoUrl TEXT,
    plantaBaixaUrl TEXT,
    areaConstruida REAL,
    areaCasa REAL,
    areaTerreno REAL,
    bedrooms INTEGER,
    bathrooms INTEGER,
    garageSpaces INTEGER,
    propertyType TEXT,
    publicSlug TEXT,
    status TEXT NOT NULL DEFAULT 'available',
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propertyId INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    messageVariations TEXT,
    totalContacts INTEGER DEFAULT 2,
    sentCount INTEGER DEFAULT 0,
    failedCount INTEGER DEFAULT 0,
    messagesPerHour INTEGER DEFAULT 1,
    startDate INTEGER,
    endDate INTEGER,
    activeDay INTEGER NOT NULL DEFAULT 0,
    activeNight INTEGER NOT NULL DEFAULT 0,
    cycleActivationUpdatedAt INTEGER,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS campaignContacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaignId INTEGER NOT NULL,
    contactId INTEGER NOT NULL,
    messagesSent INTEGER DEFAULT 0,
    lastMessageSent INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaignId INTEGER NOT NULL,
    contactId INTEGER NOT NULL,
    propertyId INTEGER NOT NULL,
    messageText TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    zApiMessageId TEXT,
    sentAt INTEGER,
    deliveredAt INTEGER,
    errorMessage TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS companyConfig (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    companyName TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    zApiInstanceId TEXT,
    zApiToken TEXT,
    zApiClientToken TEXT,
    zApiConnected INTEGER DEFAULT 0,
    zApiLastChecked INTEGER,
    telegramBotToken TEXT,
    telegramChatId TEXT,
    openAiApiKey TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    messageId INTEGER NOT NULL,
    contactId INTEGER NOT NULL,
    campaignId INTEGER NOT NULL,
    responseText TEXT,
    sentiment TEXT DEFAULT 'unknown',
    responseTime INTEGER,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS contactCampaignHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contactId INTEGER NOT NULL,
    campaignId INTEGER NOT NULL,
    lastCampaignId INTEGER,
    sentAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS schedulerState (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'stopped',
    currentPairIndex INTEGER NOT NULL DEFAULT 0,
    cycleNumber INTEGER NOT NULL DEFAULT 0,
    messagesThisCycle INTEGER NOT NULL DEFAULT 0,
    startedAt INTEGER,
    cycleStartedAt INTEGER,
    stateJson TEXT,
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS leadQualifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contactId INTEGER,
    campaignId INTEGER,
    phone TEXT NOT NULL,
    answers TEXT,
    nome TEXT,
    valorParcela TEXT,
    valorEntrada TEXT,
    tipoEmprego TEXT,
    restricaoCPF TEXT,
    prazo TEXT,
    primeiroImovel TEXT,
    stage TEXT DEFAULT 'qual_etapa_1',
    score TEXT NOT NULL DEFAULT 'frio',
    campanhaOrigem TEXT,
    origem TEXT DEFAULT 'whatsapp',
    instagramUserId TEXT,
    metaLeadId TEXT UNIQUE,
    propertyId INTEGER,
    utm TEXT,
    lastActivityAt INTEGER DEFAULT (strftime('%s','now')),
    blockedUntil INTEGER,
    discardReason TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  run(`CREATE TABLE IF NOT EXISTS messageSendLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contactPhone TEXT NOT NULL,
    campaignId INTEGER NOT NULL,
    sentAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    cycleHour INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    reason TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(contactPhone, cycleHour)
  )`);

  run(`CREATE TABLE IF NOT EXISTS dailyReports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    totalSent INTEGER NOT NULL DEFAULT 0,
    totalFailed INTEGER NOT NULL DEFAULT 0,
    totalBlocked INTEGER NOT NULL DEFAULT 0,
    executionTime INTEGER NOT NULL DEFAULT 0,
    successRate REAL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  // Colunas de origem do lead (bancos SQLite criados antes da captação via Instagram)
  const addColumn = (sql: string) => {
    try { sqlite.prepare(sql).run(); }
    catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.error('[SQLite] Erro ao adicionar coluna:', e.message, '\nSQL:', sql.substring(0, 80));
      }
    }
  };
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN origem TEXT DEFAULT 'whatsapp'`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN instagramUserId TEXT`);
  // Fase 1 da captação: follow-up, responsável e SLA
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN followUpPasso INTEGER DEFAULT 0`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN proximoFollowUpAt INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN followUpTentativas INTEGER DEFAULT 0`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN followUpErro TEXT`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN responsavelId INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN aguardandoCorretorDesde INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN atendidoAt INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN alertaSlaNivel INTEGER DEFAULT 0`);
  addColumn(`ALTER TABLE users ADD COLUMN recebeLeads INTEGER NOT NULL DEFAULT 0`);
  addColumn(`ALTER TABLE users ADD COLUMN ultimoLeadAt INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN metaLeadId TEXT`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN propertyId INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN utm TEXT`);
  run(`CREATE UNIQUE INDEX IF NOT EXISTS leadQualifications_metaLeadId_unique ON leadQualifications(metaLeadId)`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN empreendimentoSlug TEXT`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN loteCodigo TEXT`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN leadScore INTEGER`);
  addColumn(`ALTER TABLE leadQualifications ADD COLUMN consentimento TEXT`);

  // Empreendimentos (loteamentos / condomínios de chácaras) e lotes
  run(`CREATE TABLE IF NOT EXISTS empreendimentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    fase TEXT NOT NULL DEFAULT 'pre_lancamento',
    municipio TEXT, uf TEXT, endereco TEXT,
    lat TEXT, lon TEXT, areaHa TEXT,
    totalLotes INTEGER, lotesComercializaveis INTEGER,
    precosPublicos INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS lotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimentoId INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    quadra TEXT, numero INTEGER,
    areaM2 TEXT, perimetroM TEXT,
    destinacao TEXT,
    comercializavel INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'disponivel',
    reservadoAte INTEGER,
    precoAvistaRef TEXT, precoFinanciadoRef TEXT,
    latCentro TEXT, lonCentro TEXT,
    dossiePdf TEXT,
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(empreendimentoId, codigo)
  )`);
  // Controle de vendas dos lotes (server/_core/migrations/addControleLotes.ts)
  for (const c of ['situacao TEXT DEFAULT \'disponivel\'', 'leadId INTEGER', 'corretorId INTEGER', 'clienteNome TEXT', 'valorVenda TEXT', 'valorEntrada TEXT',
    'numParcelas INTEGER', 'dataSituacao INTEGER', 'observacao TEXT', 'verticesUtm TEXT', 'poligono TEXT']) {
    addColumn(`ALTER TABLE lotes ADD COLUMN ${c}`);
  }
  for (const c of ['registroMatricula TEXT', 'registroCartorio TEXT', 'utmFuso INTEGER DEFAULT 23', 'responsavelTecnico TEXT', 'ruas TEXT', 'perimetro TEXT']) {
    addColumn(`ALTER TABLE empreendimentos ADD COLUMN ${c}`);
  }
  run(`CREATE TABLE IF NOT EXISTS loteHistorico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, loteId INTEGER NOT NULL, de TEXT, para TEXT NOT NULL,
    leadId INTEGER, corretorId INTEGER, usuarioId INTEGER, detalhe TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS empreendimentoArquivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER NOT NULL, nome TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'outro', mime TEXT, tamanhoBytes INTEGER, conteudoBase64 TEXT NOT NULL,
    enviadoPor INTEGER, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  // Simulador de financiamento (server/_core/migrations/addSimulador.ts)
  addColumn(`ALTER TABLE lotes ADD COLUMN precoTabela TEXT`);
  run(`CREATE TABLE IF NOT EXISTS condicoesPagamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER NOT NULL, precoBase TEXT NOT NULL, areaBaseM2 TEXT NOT NULL,
    toleranciaAreaM2 TEXT NOT NULL DEFAULT '1.00', entradaPct TEXT NOT NULL, entradaMaxParcelas INTEGER NOT NULL, descontoAvistaPct TEXT NOT NULL,
    jurosAaEfetivo TEXT NOT NULL, metodo TEXT NOT NULL DEFAULT 'PRICE', prazos TEXT NOT NULL, comissaoTotalPct TEXT NOT NULL,
    comissaoCorretorPct TEXT NOT NULL, comissao1aParcelaPct TEXT NOT NULL, vigenteDesde TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1
  )`);
  run(`CREATE TABLE IF NOT EXISTS simulacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER NOT NULL, loteId INTEGER NOT NULL, leadId INTEGER, usuarioId INTEGER,
    entradaParcelas INTEGER NOT NULL, prazoSaldo INTEGER NOT NULL, precoCents INTEGER NOT NULL, entradaCents INTEGER NOT NULL,
    saldoCents INTEGER NOT NULL, parcelaSaldoCents INTEGER NOT NULL, totalPagoCents INTEGER NOT NULL, payload TEXT,
    criadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  addColumn(`ALTER TABLE condicoesPagamento ADD COLUMN descontoAvistaTotal TEXT NOT NULL DEFAULT '${DESCONTO_AVISTA_TOTAL_PADRAO.toFixed(2)}'`);
  // Cadastro completo dos usuários (server/_core/migrations/addCadastroUsuarios.ts)
  for (const c of ['creciUf', 'cpf', 'rg', 'rgOrgao', 'nacionalidade', 'estadoCivil', 'enderecoLogradouro', 'enderecoNumero', 'enderecoComplemento',
    'enderecoBairro', 'enderecoCidade', 'enderecoUf', 'enderecoCep', 'certidaoCreciValidade', 'fotoUrl', 'instagram']) {
    addColumn(`ALTER TABLE users ADD COLUMN ${c} TEXT`);
  }
  run(`CREATE TABLE IF NOT EXISTS usuarioDocumentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL, mime TEXT, tamanhoBytes INTEGER,
    conteudoBase64 TEXT NOT NULL, validade TEXT, enviadoPor INTEGER, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  // v1.6.0 (server/_core/migrations/addCadastroV2.ts)
  addColumn(`ALTER TABLE users ADD COLUMN sessaoVersao INTEGER NOT NULL DEFAULT 0`);
  for (const c of ['sexo', 'profissao', 'paisOrigem', 'docEstrangeiroTipo', 'docEstrangeiroNumero']) addColumn(`ALTER TABLE users ADD COLUMN ${c} TEXT`);
  for (const c of ["titular TEXT NOT NULL DEFAULT 'usuario'", 'numero TEXT', 'linkVerificacao TEXT', 'linkEmissao TEXT', 'anexarDocumentos INTEGER NOT NULL DEFAULT 1',
    'exibirPerfil INTEGER NOT NULL DEFAULT 0', 'alertaEnviadoEm TEXT', 'thumbBase64 TEXT', 'paginasQtd INTEGER', 'atualizadoEm INTEGER']) {
    addColumn(`ALTER TABLE usuarioDocumentos ADD COLUMN ${c}`);
  }
  run(`CREATE TABLE IF NOT EXISTS usuarioDocumentoPaginas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, documentoId INTEGER NOT NULL, n INTEGER NOT NULL, pngBase64 TEXT NOT NULL, UNIQUE(documentoId, n)
  )`);
  run(`CREATE TABLE IF NOT EXISTS usuarioConjuge (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL UNIQUE, nome TEXT NOT NULL, sexo TEXT, cpf TEXT NOT NULL, rg TEXT, rgOrgao TEXT,
    nacionalidade TEXT NOT NULL DEFAULT 'brasileira', paisOrigem TEXT, docEstrangeiroTipo TEXT, docEstrangeiroNumero TEXT, profissao TEXT,
    dataNascimento TEXT, telefone TEXT, email TEXT, regimeBens TEXT, dataCasamento TEXT, uniaoDataInicio TEXT,
    uniaoRegistrada INTEGER NOT NULL DEFAULT 0, mesmoEndereco INTEGER NOT NULL DEFAULT 1, cep TEXT, logradouro TEXT, numero TEXT,
    complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT, ativo INTEGER NOT NULL DEFAULT 1,
    criadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')), atualizadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS usuarioFoto (
    usuarioId INTEGER PRIMARY KEY, mime TEXT NOT NULL, conteudoBase64 TEXT NOT NULL, atualizadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS configCredenciais (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)`);
  // Portal de permissões (server/_core/migrations/addPermissoes.ts)
  run(`CREATE TABLE IF NOT EXISTS permissoesPerfil (
    id INTEGER PRIMARY KEY AUTOINCREMENT, perfil TEXT NOT NULL, modulo TEXT NOT NULL, permitido INTEGER NOT NULL DEFAULT 1,
    atualizadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE(perfil, modulo)
  )`);
  run(`CREATE TABLE IF NOT EXISTS permissoesUsuario (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, modulo TEXT NOT NULL, permitido INTEGER NOT NULL,
    atualizadoPor INTEGER, atualizadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE(usuarioId, modulo)
  )`);
  run(`CREATE TABLE IF NOT EXISTS acessosCorretor (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, tipo TEXT NOT NULL, refId INTEGER NOT NULL, comissaoPct TEXT,
    habilitadoPor INTEGER, criadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE(usuarioId, tipo, refId)
  )`);
  // v1.7.0 — notas de versão e tela de descanso (server/_core/migrations/addReleases.ts)
  addColumn(`ALTER TABLE users ADD COLUMN descansoMinutos INTEGER NOT NULL DEFAULT 3`);
  addColumn(`ALTER TABLE users ADD COLUMN arquivadoEm INTEGER`);
  // v1.8.0 — notificações e Web Push (server/_core/migrations/addNotificacoes.ts)
  run(`CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, tipo TEXT NOT NULL, titulo TEXT NOT NULL, mensagem TEXT NOT NULL,
    url TEXT, empreendimentoId INTEGER, loteId INTEGER, chave TEXT, lidaEm INTEGER, criadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS pushInscricoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, endpointHash TEXT NOT NULL UNIQUE, endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, userAgent TEXT,
    criadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')), atualizadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  // v1.9.0 — contratos, assinatura, cobrança, pessoas e portaria (server/_core/migrations/addContratos.ts)
  for (const c of ['contratoReservaId INTEGER', 'memorialTexto TEXT', 'viaFrente TEXT', 'matricula TEXT']) addColumn(`ALTER TABLE lotes ADD COLUMN ${c}`);
  addColumn(`ALTER TABLE usuarioDocumentos ADD COLUMN emissao TEXT`);
  const agora = `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`;
  run(`CREATE TABLE IF NOT EXISTS contratoArquivos (
    chave TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, conteudoBase64 TEXT NOT NULL, criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS empJuridico (
    empreendimentoId INTEGER PRIMARY KEY, defaultsJson TEXT NOT NULL, vendedoraTipo TEXT NOT NULL DEFAULT 'PF', vendedoraJson TEXT NOT NULL,
    modeloCpcv TEXT NOT NULL DEFAULT 'MODELO-CPCV-BOM-JARDIMS-v3.docx', modeloVersao TEXT NOT NULL DEFAULT 'CPCV-BJ v3.0',
    marcaSlug TEXT NOT NULL DEFAULT 'bomjardims', atualizadoPor INTEGER, atualizadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS contratoSeq (ano INTEGER PRIMARY KEY, ultimo INTEGER NOT NULL)`);
  run(`CREATE TABLE IF NOT EXISTS contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, empreendimentoId INTEGER NOT NULL, loteId INTEGER, loteCodigo TEXT NOT NULL,
    leadId INTEGER, corretorUserId INTEGER NOT NULL, simulacaoJson TEXT NOT NULL, dadosJson TEXT NOT NULL, overridesJson TEXT,
    status TEXT NOT NULL DEFAULT 'rascunho', modoAssinatura TEXT NOT NULL DEFAULT 'eletronica', codigoVerificacao TEXT NOT NULL UNIQUE,
    pdfAtual TEXT, hashAtual TEXT, asaasCustomerId TEXT, usoLiberado INTEGER NOT NULL DEFAULT 0, usoLiberadoEm INTEGER, criadoPor INTEGER,
    criadoEm ${agora}, atualizadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS contratoVersoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, versao INTEGER NOT NULL, etapa TEXT NOT NULL, arquivo TEXT NOT NULL,
    sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, criadoEm ${agora}, UNIQUE(contratoId, versao)
  )`);
  run(`CREATE TABLE IF NOT EXISTS assinaturaSignatarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, papel TEXT NOT NULL, nome TEXT NOT NULL, cpf TEXT NOT NULL, email TEXT,
    whatsapp TEXT, metodo TEXT, ordem INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', token TEXT NOT NULL UNIQUE, assinadoEm INTEGER,
    evidenciasJson TEXT
  )`);
  run(`CREATE TABLE IF NOT EXISTS assinaturaPosicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER, modeloVersao TEXT, papel TEXT NOT NULL, pagina INTEGER NOT NULL,
    x TEXT NOT NULL, y TEXT NOT NULL, w TEXT NOT NULL, h TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS assinaturaOtp (
    signatarioId INTEGER PRIMARY KEY, codigoHash TEXT NOT NULL, expiraEm INTEGER NOT NULL, tentativas INTEGER NOT NULL DEFAULT 0
  )`);
  run(`CREATE TABLE IF NOT EXISTS assinaturaEventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, signatarioId INTEGER, evento TEXT NOT NULL, ip TEXT, userAgent TEXT,
    detalhe TEXT, criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS cobrancas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, tipo TEXT NOT NULL, numero INTEGER NOT NULL, total INTEGER NOT NULL,
    vencimento TEXT NOT NULL, valor TEXT NOT NULL, jurosParcela TEXT, amortizacao TEXT, saldoDevedor TEXT, splitValor TEXT NOT NULL DEFAULT '0',
    asaasPaymentId TEXT UNIQUE, nossoNumero TEXT, linhaDigitavel TEXT, codigoBarras TEXT, pixPayload TEXT, bankSlipUrl TEXT,
    status TEXT NOT NULL DEFAULT 'prevista', pagoEm TEXT, valorPago TEXT, UNIQUE(contratoId, tipo, numero)
  )`);
  run(`CREATE TABLE IF NOT EXISTS asaasWebhookLog (
    eventId TEXT PRIMARY KEY, evento TEXT NOT NULL, paymentId TEXT, payload TEXT NOT NULL, processado INTEGER NOT NULL DEFAULT 0, recebidoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS pessoas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL DEFAULT 'PF', nome TEXT NOT NULL, nomeSocial TEXT, cpfCnpj TEXT NOT NULL UNIQUE,
    rg TEXT, rgOrgao TEXT, rgUf TEXT, rgEmissao TEXT, cnh TEXT, nascimento TEXT, naturalidade TEXT, nacionalidade TEXT NOT NULL DEFAULT 'brasileira',
    sexo TEXT, filiacaoMae TEXT, filiacaoPai TEXT, estadoCivil TEXT, regimeBens TEXT, pactoAntenupcial TEXT, dataCasamento TEXT,
    profissao TEXT, empregador TEXT, rendaMensal TEXT, email TEXT, email2 TEXT, telefone1 TEXT, telefone1Whatsapp INTEGER NOT NULL DEFAULT 1,
    telefone2 TEXT, telefone2Whatsapp INTEGER NOT NULL DEFAULT 0, cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT,
    cidade TEXT, uf TEXT, canalPreferido TEXT NOT NULL DEFAULT 'whatsapp', horarioContato TEXT, lgpdConsentimentoEm INTEGER,
    lgpdConsentimentoIp TEXT, lgpdMarketing INTEGER NOT NULL DEFAULT 0, leadId INTEGER, criadoEm ${agora}, atualizadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS contratoPessoas (
    contratoId INTEGER NOT NULL, pessoaId INTEGER NOT NULL, papel TEXT NOT NULL, fracao TEXT, PRIMARY KEY (contratoId, pessoaId, papel)
  )`);
  run(`CREATE TABLE IF NOT EXISTS pessoaReferencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pessoaId INTEGER NOT NULL, nome TEXT NOT NULL, relacao TEXT NOT NULL, telefone TEXT NOT NULL, email TEXT
  )`);
  run(`CREATE TABLE IF NOT EXISTS pessoaDocumentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pessoaId INTEGER NOT NULL, tipo TEXT NOT NULL, arquivo TEXT NOT NULL, sha256 TEXT NOT NULL,
    mime TEXT NOT NULL, validadoPor INTEGER, validadoEm INTEGER, enviadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS chacaraDependentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, nome TEXT NOT NULL, parentesco TEXT NOT NULL, cpf TEXT, nascimento TEXT,
    telefone1 TEXT, telefone2 TEXT, email TEXT, foto TEXT, ativo INTEGER NOT NULL DEFAULT 1, criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS contratoAnexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, alvo TEXT NOT NULL, dependenteId INTEGER, tipo TEXT NOT NULL, nome TEXT NOT NULL,
    arquivo TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, enviadoPor INTEGER NOT NULL, enviadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS carteiras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, titularTipo TEXT NOT NULL, titularId INTEGER NOT NULL,
    numero TEXT NOT NULL UNIQUE, qrToken TEXT NOT NULL UNIQUE, validade TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ativa', emitidaEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS eventosAutorizacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, local TEXT NOT NULL, dataEvento TEXT NOT NULL, horaInicio TEXT NOT NULL,
    horaFim TEXT NOT NULL, descricao TEXT NOT NULL, convidadosSolicitados INTEGER NOT NULL, convidadosAutorizados INTEGER,
    somAmplificado INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'solicitado', decididoPor INTEGER, decididoEm INTEGER, motivo TEXT,
    criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS eventosConvidados (
    id INTEGER PRIMARY KEY AUTOINCREMENT, eventoId INTEGER NOT NULL, nome TEXT NOT NULL, documento TEXT NOT NULL, telefone TEXT, placa TEXT,
    crachaNumero INTEGER, entradaEm INTEGER, saidaEm INTEGER
  )`);
  // v1.10.0 — Bloco Financeiro (server/_core/migrations/addFinanceiro.ts)
  for (const c of ['valorOriginal TEXT', 'vencimentoOriginal TEXT', 'segundaViaEm INTEGER', 'formaPagamento TEXT', 'asaasSnapshot TEXT']) {
    addColumn(`ALTER TABLE cobrancas ADD COLUMN ${c}`);
  }
  addColumn(`ALTER TABLE empJuridico ADD COLUMN asaasBeneficiario TEXT`);
  // v1.12.0 — assinatura eletrônica (server/_core/migrations/addAssinatura.ts)
  for (const c of ['expiraEm INTEGER', 'revisaoManual INTEGER NOT NULL DEFAULT 0']) addColumn(`ALTER TABLE assinaturaSignatarios ADD COLUMN ${c}`);
  for (const c of ['assinaturaIniciadaEm INTEGER', 'manifestoArquivo TEXT']) addColumn(`ALTER TABLE contratos ADD COLUMN ${c}`);
  // v1.26.0 — pagamento manual (comprovante InfinitePay, transferência, dinheiro)
  run(`CREATE TABLE IF NOT EXISTS pagamentosManuais (
    id INTEGER PRIMARY KEY AUTOINCREMENT, forma TEXT NOT NULL, valor TEXT NOT NULL, pagoEm INTEGER NOT NULL, idTransacao TEXT UNIQUE,
    pagadorNome TEXT, pagadorCpfParcial TEXT, pagadorInstituicao TEXT, vinculoPagador TEXT, urlRecibo TEXT, observacao TEXT,
    lancadoPor INTEGER NOT NULL, criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS pagamentoRateio (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pagamentoId INTEGER NOT NULL, cobrancaId INTEGER NOT NULL UNIQUE, contratoId INTEGER NOT NULL,
    valor TEXT NOT NULL, reciboId INTEGER
  )`);
  // Recibos do CRM: crm_recibos. "recibos" é da ZAYRA no banco compartilhado — criada aqui no formato dela,
  // como na produção, para os testes quebrarem se o CRM voltar a usar esse nome (v1.30.6)
  run(`CREATE TABLE IF NOT EXISTS recibos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 1, numero TEXT NOT NULL, tipo TEXT NOT NULL,
    destinatario_nome TEXT NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER
  )`);
  run(`CREATE TABLE IF NOT EXISTS crm_recibos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL UNIQUE, cobrancaId INTEGER NOT NULL UNIQUE, contratoId INTEGER NOT NULL,
    codigoVerif TEXT NOT NULL, valorPago TEXT NOT NULL, pagoEm TEXT NOT NULL, pdfArquivo TEXT, enviadoEm INTEGER, envioErro TEXT, criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS declaracoesQuitacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, anoRef INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'emitida', motivo TEXT,
    valorTotal TEXT, pdfArquivo TEXT, enviadoEm INTEGER, criadoEm ${agora}, UNIQUE(contratoId, anoRef)
  )`);
  run(`CREATE TABLE IF NOT EXISTS indicesIpca (
    competencia TEXT PRIMARY KEY, variacao TEXT NOT NULL, fonte TEXT NOT NULL DEFAULT 'IBGE/SIDRA 1737', atualizadoEm ${agora}
  )`);
  // v1.14.0 — trava de cancelamento (server/_core/migrations/addCancelamento.ts)
  for (const t of ['contratos', 'crm_recibos']) for (const c of ['canceladoEm INTEGER', 'canceladoPor INTEGER', 'canceladoMotivo TEXT']) addColumn(`ALTER TABLE ${t} ADD COLUMN ${c}`);
  run(`CREATE TABLE IF NOT EXISTS contratoSolicitacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, contratoId INTEGER NOT NULL, tipo TEXT NOT NULL, motivo TEXT NOT NULL, solicitanteId INTEGER NOT NULL,
    status TEXT NOT NULL, resolvidoPor INTEGER, resolvidoEm INTEGER, resposta TEXT, criadoEm ${agora}
  )`);
  run(`CREATE TABLE IF NOT EXISTS financeiroAuditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT, acao TEXT NOT NULL, contratoId INTEGER, cobrancaId INTEGER, usuarioId INTEGER, origem TEXT NOT NULL,
    ip TEXT, detalhe TEXT, criadoEm ${agora}
  )`);
  try {
    sqlite.prepare(`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraTipo, vendedoraJson)
      SELECT e.id, ?, 'PF', ? FROM empreendimentos e
      WHERE e.slug = ? AND NOT EXISTS (SELECT 1 FROM empJuridico j WHERE j.empreendimentoId = e.id)`)
      .run(JSON.stringify(SEED_EMP_JURIDICO.defaults), JSON.stringify(SEED_EMP_JURIDICO.vendedora), SEED_EMP_JURIDICO.slug);
  } catch (e: any) { console.error('[SQLite] Seed empJuridico:', e.message); }
  // CPCV v3 (out/2026): Bom Jardims deixa o modelo v2
  run(`UPDATE empJuridico SET modeloCpcv = 'MODELO-CPCV-BOM-JARDIMS-v3.docx', modeloVersao = 'CPCV-BJ v3.0' WHERE modeloCpcv = 'MODELO-CPCV-BOM-JARDIMS-v2.docx'`);
  run(`CREATE TABLE IF NOT EXISTS systemRelease (
    id INTEGER PRIMARY KEY AUTOINCREMENT, versao TEXT NOT NULL UNIQUE, tipo TEXT NOT NULL DEFAULT 'patch', titulo TEXT NOT NULL, itens TEXT NOT NULL,
    obrigatoria INTEGER NOT NULL DEFAULT 0, publico TEXT NOT NULL DEFAULT 'todos', publicadoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    publicadoPor INTEGER, hashArquivo TEXT, ativo INTEGER NOT NULL DEFAULT 1
  )`);
  run(`CREATE TABLE IF NOT EXISTS systemReleaseLeitura (
    releaseId INTEGER NOT NULL, usuarioId INTEGER NOT NULL, lidoEm INTEGER NOT NULL DEFAULT (strftime('%s','now')), PRIMARY KEY (releaseId, usuarioId)
  )`);

  console.log('[SQLite] ✅ Todas as tabelas inicializadas');

  // Captação v1 (server/_core/migrations/addLeadsV1.ts)
  run(`ALTER TABLE properties ADD COLUMN codigo TEXT`);
  run(`ALTER TABLE properties ADD COLUMN exibirPreco INTEGER NOT NULL DEFAULT 1`);
  for (const col of ["funil TEXT DEFAULT 'comprador'", "origemCanal TEXT", "origemCampanhaId INTEGER", "ultimoCanal TEXT", "ultimaCampanhaId INTEGER", "slots TEXT", "tags TEXT", "scoreDetalhe TEXT", "etapa TEXT", "motivoPerda TEXT", "humano INTEGER DEFAULT 0", "modoQualificacao TEXT DEFAULT 'ia'", "perguntasIa INTEGER DEFAULT 0", "falhasIa INTEGER DEFAULT 0"]) {
    run(`ALTER TABLE leadQualifications ADD COLUMN ${col}`);
  }
  run(`CREATE TABLE IF NOT EXISTS leadCampanhas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, canal TEXT NOT NULL,
    funil TEXT NOT NULL DEFAULT 'comprador', propertyId INTEGER, empreendimentoSlug TEXT, metaFormId TEXT, googleFormId TEXT,
    utmSource TEXT, utmCampaign TEXT, gastoTotal REAL NOT NULL DEFAULT 0, inicio INTEGER, fim INTEGER, ativa INTEGER NOT NULL DEFAULT 1,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')), updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS leadMensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId INTEGER NOT NULL, direcao TEXT NOT NULL, autor TEXT NOT NULL,
    texto TEXT NOT NULL, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS leadEventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId INTEGER, visitanteId TEXT, tipo TEXT NOT NULL, propertyId INTEGER,
    campanhaId INTEGER, dados TEXT, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS leadVisitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId INTEGER NOT NULL, propertyId INTEGER, quando INTEGER NOT NULL,
    local TEXT, status TEXT NOT NULL DEFAULT 'agendada', observacao TEXT, responsavelId INTEGER, criadoPor INTEGER,
    lembreteClienteAt INTEGER, avisoCorretorAt INTEGER, resultadoPedidoAt INTEGER, confirmadaAt INTEGER,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')), updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  // Mensagens do link de agendamento (server/_core/migrations/addMensagensAgendamento.ts)
  addColumn(`ALTER TABLE leadVisitas ADD COLUMN pedidoJson TEXT`);
  addColumn(`ALTER TABLE leadVisitas ADD COLUMN confirmacaoEnviadaAt INTEGER`);
  // Camada SaaS fase 1 (server/_core/migrations/addSaas.ts)
  const agoraS = `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`;
  run(`CREATE TABLE IF NOT EXISTS saasConfig (chave TEXT PRIMARY KEY, valor TEXT, atualizadoPor INTEGER, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS saasPlanos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, publico TEXT NOT NULL, nome TEXT NOT NULL, precoMensal TEXT NOT NULL,
    precoAnual TEXT, storageGb INTEGER NOT NULL DEFAULT 5, incluiAvalieimob INTEGER NOT NULL DEFAULT 0, unico INTEGER NOT NULL DEFAULT 0, conteudo TEXT,
    ativo INTEGER NOT NULL DEFAULT 1, createdAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS saasCupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, tipo TEXT NOT NULL, valor TEXT NOT NULL DEFAULT '0', precosFixosJson TEXT, planoAlvo TEXT,
    limiteUsos INTEGER NOT NULL DEFAULT 1, usosRealizados INTEGER NOT NULL DEFAULT 0, validade TEXT, duracaoCiclos INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ativo', descricao TEXT, criadoPor INTEGER, createdAt ${agoraS}, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS saasAssinaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, planoId INTEGER NOT NULL, empreendimentoId INTEGER, chave TEXT NOT NULL UNIQUE,
    origem TEXT NOT NULL, ciclo TEXT NOT NULL DEFAULT 'MENSAL', status TEXT NOT NULL, precoOverride TEXT, cupomId INTEGER, ciclosCupomRestantes INTEGER,
    trialFim TEXT, periodoFim TEXT, diasTolerancia INTEGER NOT NULL DEFAULT 3, contratoGestaoNr TEXT, mpPreapprovalId TEXT, lembretesJson TEXT, motivo TEXT,
    version INTEGER NOT NULL DEFAULT 0, createdAt ${agoraS}, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS saasFaturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, assinaturaId INTEGER NOT NULL, competencia TEXT NOT NULL, valor TEXT NOT NULL, incluiImplantacao INTEGER NOT NULL DEFAULT 0,
    metodo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ABERTA', vencimento TEXT NOT NULL, pagoEm TEXT, mpPaymentId TEXT UNIQUE, linkPagamento TEXT, nfseId INTEGER,
    observacao TEXT, criadoPor INTEGER, createdAt ${agoraS}, UNIQUE (assinaturaId, competencia))`);
  run(`CREATE TABLE IF NOT EXISTS saasEventosPagamento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, provedor TEXT NOT NULL DEFAULT 'mercadopago', eventoId TEXT NOT NULL UNIQUE, tipo TEXT NOT NULL, recursoId TEXT,
    payloadJson TEXT, processado INTEGER NOT NULL DEFAULT 0, tentativas INTEGER NOT NULL DEFAULT 0, erro TEXT, recebidoEm ${agoraS}, processadoEm TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS autoRespostaConfig (
    empreendimentoId INTEGER PRIMARY KEY, ativo INTEGER NOT NULL DEFAULT 0, condicaoValidaAte TEXT, avisoLegal TEXT, loteAncora TEXT,
    entradaParcelas INTEGER NOT NULL DEFAULT 6, atualizadoPor INTEGER, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS autoRespostaTextos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER NOT NULL, intencao TEXT NOT NULL, texto TEXT NOT NULL, midias TEXT,
    ativo INTEGER NOT NULL DEFAULT 1, updatedAt ${agoraS}, UNIQUE (empreendimentoId, intencao))`);
  run(`CREATE TABLE IF NOT EXISTS autoRespostaMidias (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER NOT NULL, codigo TEXT NOT NULL, tipo TEXT NOT NULL, url TEXT NOT NULL,
    nomeArquivo TEXT, legenda TEXT, ativo INTEGER NOT NULL DEFAULT 1, updatedAt ${agoraS}, UNIQUE (empreendimentoId, codigo))`);
  run(`CREATE TABLE IF NOT EXISTS financeiroDespesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER, descricao TEXT NOT NULL, categoria TEXT NOT NULL, fornecedor TEXT,
    valor TEXT NOT NULL, vencimento TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aberta', pagoEm TEXT, valorPago TEXT, formaPagamento TEXT,
    grupo TEXT, parcela TEXT, comprovanteUrl TEXT, observacao TEXT, criadoPor INTEGER, createdAt ${agoraS}, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS linksOferta (
    token TEXT PRIMARY KEY, leadId INTEGER NOT NULL, empreendimentoId INTEGER NOT NULL, aberturas INTEGER NOT NULL DEFAULT 0,
    primeiraAberturaAt INTEGER, ultimaAberturaAt INTEGER, createdAt ${agoraS}, UNIQUE (leadId, empreendimentoId))`);
  run(`CREATE TABLE IF NOT EXISTS zapiMensagensVistas (messageId TEXT PRIMARY KEY, createdAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS reunioesAgenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, empreendimentoId INTEGER, quando INTEGER NOT NULL, local TEXT, linkVideo TEXT,
    descricao TEXT, tokenGeral TEXT NOT NULL UNIQUE, folderMime TEXT, folderNome TEXT, folderBase64 TEXT, criadoPor INTEGER NOT NULL,
    canceladaEm INTEGER, createdAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS reuniaoConvidados (
    id INTEGER PRIMARY KEY AUTOINCREMENT, reuniaoId INTEGER NOT NULL, nome TEXT NOT NULL, telefone TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
    origem TEXT NOT NULL DEFAULT 'lista', status TEXT NOT NULL DEFAULT 'pendente', respondidoEm INTEGER, conviteEnviadoEm INTEGER,
    createdAt ${agoraS}, UNIQUE (reuniaoId, telefone))`);
  run(`CREATE TABLE IF NOT EXISTS linksDivulgacao (
    id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descricao TEXT, url TEXT NOT NULL, utmSource TEXT, utmCampaign TEXT,
    textoWhatsapp TEXT NOT NULL, empreendimento TEXT, destaque INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, criadoPor INTEGER, criadoEm ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS loteFilaEspera (
    id INTEGER PRIMARY KEY AUTOINCREMENT, empreendimentoId INTEGER NOT NULL, loteId INTEGER NOT NULL, loteCodigo TEXT NOT NULL, leadId INTEGER,
    nome TEXT NOT NULL, telefone TEXT, corretorId INTEGER, status TEXT NOT NULL DEFAULT 'aguardando', avisadoEm INTEGER, observacao TEXT,
    criadoPor INTEGER, criadoEm ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS campanhaCliques (
    id INTEGER PRIMARY KEY AUTOINCREMENT, campanha TEXT NOT NULL, acao TEXT NOT NULL, corretorId INTEGER, utmSource TEXT, criadoEm ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS rankingCampanhas (
    empreendimentoId INTEGER PRIMARY KEY, modo TEXT NOT NULL DEFAULT 'indeterminado', dataEncerramento TEXT, premio TEXT,
    encerradaEm INTEGER, motivoEncerramento TEXT, congeladoJson TEXT, atualizadoPor INTEGER, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS autoRespostaRegua (
    leadId INTEGER PRIMARY KEY, empreendimentoId INTEGER NOT NULL, desde INTEGER NOT NULL, passo INTEGER NOT NULL DEFAULT 0,
    proximoAt INTEGER, seguidas INTEGER NOT NULL DEFAULT 0, updatedAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS saasNfse (
    id INTEGER PRIMARY KEY AUTOINCREMENT, faturaId INTEGER NOT NULL UNIQUE, assinaturaId INTEGER NOT NULL, usuarioId INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'PENDENTE',
    competencia TEXT NOT NULL, valor TEXT NOT NULL, itemServico TEXT NOT NULL, discriminacao TEXT NOT NULL, tomadorNome TEXT NOT NULL, tomadorDoc TEXT, tomadorEmail TEXT,
    tomadorTelefone TEXT, tomadorEndereco TEXT, numero TEXT, codigoVerificacao TEXT, emitidaEm TEXT, emitidaPor INTEGER, observacao TEXT, createdAt ${agoraS}, updatedAt ${agoraS})`);
  for (const c of ['metodo TEXT', 'cancelarNoFim INTEGER NOT NULL DEFAULT 0', 'avalieimobEstado TEXT', 'avalieimobErro TEXT']) addColumn(`ALTER TABLE saasAssinaturas ADD COLUMN ${c}`);
  for (const c of ['pixCopiaCola TEXT', 'modo TEXT', 'upgradePlanoId INTEGER', 'escolhaJson TEXT']) addColumn(`ALTER TABLE saasFaturas ADD COLUMN ${c}`);
  addColumn(`ALTER TABLE saasAssinaturas ADD COLUMN checkoutPendenteJson TEXT`);
  for (const c of ['provedor TEXT', 'externoId TEXT', 'externoStatus TEXT', 'ambiente TEXT', 'pdfUrl TEXT', 'xmlUrl TEXT', 'mensagem TEXT', 'enviadaEm TEXT']) addColumn(`ALTER TABLE saasNfse ADD COLUMN ${c}`);
  run(`CREATE TABLE IF NOT EXISTS saasTrials (cpfCnpj TEXT PRIMARY KEY, usuarioId INTEGER, usadoEm ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS auditoriaAcesso (id INTEGER PRIMARY KEY AUTOINCREMENT, usuarioId INTEGER NOT NULL, evento TEXT NOT NULL, detalheJson TEXT, ip TEXT, criadoEm ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS corretoresExternos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, cpf TEXT NOT NULL UNIQUE, creci TEXT, creciUf TEXT, telefone TEXT, email TEXT, observacao TEXT,
    recrutamentoId INTEGER, ativo INTEGER NOT NULL DEFAULT 1, criadoPor INTEGER, createdAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS talonarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, numeroInicial INTEGER NOT NULL, numeroFinal INTEGER NOT NULL, externoId INTEGER, usuarioId INTEGER,
    entregueEm TEXT NOT NULL, entreguePor INTEGER NOT NULL, observacao TEXT, createdAt ${agoraS})`);
  run(`CREATE TABLE IF NOT EXISTS talonarioFolhas (
    talonarioId INTEGER NOT NULL, numero INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'EM_BRANCO', contratoId INTEGER, referencia TEXT, arquivoNome TEXT,
    arquivoMime TEXT, arquivoBase64 TEXT, lancadoPor INTEGER, lancadoEm TEXT, PRIMARY KEY (talonarioId, numero))`);
  {
    for (const p of PLANOS_PADRAO) {
      sqlite.prepare(`INSERT OR IGNORE INTO saasPlanos (codigo, publico, nome, precoMensal, precoAnual, storageGb, incluiAvalieimob, unico, conteudo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(p.codigo, p.publico, p.nome, String(p.precoMensal), p.precoAnual == null ? null : String(p.precoAnual), p.storageGb, p.incluiAvalieimob ? 1 : 0, p.unico ? 1 : 0, p.conteudo);
    }
  }
  // Recrutamento e senha provisória (server/_core/migrations/addRecrutamento.ts)
  addColumn(`ALTER TABLE users ADD COLUMN trocarSenha INTEGER NOT NULL DEFAULT 0`);
  addColumn(`ALTER TABLE users ADD COLUMN senhaProvisoriaExpira INTEGER`);
  run(`CREATE TABLE IF NOT EXISTS recrutamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, perfil TEXT NOT NULL, nome TEXT NOT NULL, telefone TEXT NOT NULL, email TEXT, empreendimentoSlug TEXT,
    token TEXT NOT NULL UNIQUE, tokenExpira INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'convidado', dadosJson TEXT, usuarioId INTEGER,
    criadoPor INTEGER NOT NULL, enviadoEm INTEGER, preenchidoEm INTEGER, decididoEm INTEGER, decididoPor INTEGER, motivo TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')), updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS recrutamentoDocs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, recrutamentoId INTEGER NOT NULL, tipo TEXT NOT NULL, nome TEXT NOT NULL, mime TEXT NOT NULL,
    tamanhoBytes INTEGER NOT NULL, conteudoBase64 TEXT NOT NULL, validade TEXT, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE (recrutamentoId, tipo)
  )`);
  // Reuniões com clientes (server/_core/migrations/addReunioes.ts)
  run(`CREATE TABLE IF NOT EXISTS reunioes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId INTEGER, titulo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'presencial',
    status TEXT NOT NULL DEFAULT 'gravando', criadoPor INTEGER NOT NULL, consentimento INTEGER NOT NULL DEFAULT 0,
    duracaoSeg INTEGER NOT NULL DEFAULT 0, transcricao TEXT, resumoJson TEXT, erro TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')), updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS reuniaoPartes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, reuniaoId INTEGER NOT NULL, ordem INTEGER NOT NULL, duracaoSeg INTEGER NOT NULL DEFAULT 0,
    texto TEXT, erro TEXT, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE (reuniaoId, ordem)
  )`);
  addColumn(`ALTER TABLE reuniaoPartes ADD COLUMN audioBase64 TEXT`);
  addColumn(`ALTER TABLE reuniaoPartes ADD COLUMN mime TEXT`);
  run(`CREATE TABLE IF NOT EXISTS modelosMensagem (
    chave TEXT PRIMARY KEY, texto TEXT NOT NULL, atualizadoPor INTEGER, updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS leadScoreHistorico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId INTEGER NOT NULL, score INTEGER NOT NULL, classe TEXT NOT NULL,
    regras TEXT NOT NULL, detalhes TEXT NOT NULL, motivo TEXT, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS leadInteresses (
    leadId INTEGER NOT NULL, propertyId INTEGER NOT NULL, campanhaId INTEGER,
    primeiroContatoAt INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE (leadId, propertyId)
  )`);
  run(`CREATE TABLE IF NOT EXISTS materiais (
    id INTEGER PRIMARY KEY AUTOINCREMENT, propertyId INTEGER, empreendimentoSlug TEXT, titulo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'outro', url TEXT NOT NULL, mime TEXT, tamanhoBytes INTEGER, liberado INTEGER NOT NULL DEFAULT 1,
    observacao TEXT, ordem INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
}
