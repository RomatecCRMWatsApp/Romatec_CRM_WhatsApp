/**
 * SQLite Initialization — cria todas as tabelas na primeira execução
 * Usado quando DATABASE_DRIVER=sqlite (modo local / Electron)
 * Idempotente: usa CREATE TABLE IF NOT EXISTS em todas as tabelas
 */
export function initSqliteTables(sqlite: any): void {
  const run = (sql: string) => {
    try { sqlite.prepare(sql).run(); }
    catch (e: any) {
      if (!e.message?.includes('already exists')) {
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
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    lastSignedIn INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

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

  console.log('[SQLite] ✅ Todas as tabelas inicializadas');
}
