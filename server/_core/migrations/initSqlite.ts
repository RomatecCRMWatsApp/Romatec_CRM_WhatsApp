/**
 * SQLite Initialization — cria todas as tabelas na primeira execução
 * Usado quando DATABASE_DRIVER=sqlite (modo local / Electron)
 * Idempotente: usa CREATE TABLE IF NOT EXISTS em todas as tabelas
 */
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
  for (const c of ['registroMatricula TEXT', 'registroCartorio TEXT', 'utmFuso INTEGER DEFAULT 23', 'responsavelTecnico TEXT']) {
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
