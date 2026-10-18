import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: captação v1 — código IMV-xxxx e exibirPreco em properties,
 * tabelas leadCampanhas e leadInteresses, e colunas de funil/atribuição/slots
 * em leadQualifications. Idempotente (ignora coluna/tabela/índice existente).
 */
const MYSQL: { label: string; stmt: ReturnType<typeof sql> }[] = [
  { label: 'properties.codigo', stmt: sql`ALTER TABLE properties ADD COLUMN codigo VARCHAR(12) NULL` },
  { label: 'properties.exibirPreco', stmt: sql`ALTER TABLE properties ADD COLUMN exibirPreco BOOLEAN NOT NULL DEFAULT TRUE` },
  {
    label: 'leadCampanhas',
    stmt: sql`CREATE TABLE IF NOT EXISTS leadCampanhas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(20) NOT NULL UNIQUE,
      nome VARCHAR(160) NOT NULL,
      canal VARCHAR(30) NOT NULL,
      funil VARCHAR(20) NOT NULL DEFAULT 'comprador',
      propertyId INT NULL,
      empreendimentoSlug VARCHAR(80) NULL,
      metaFormId VARCHAR(40) NULL,
      googleFormId VARCHAR(40) NULL,
      utmSource VARCHAR(60) NULL,
      utmCampaign VARCHAR(120) NULL,
      gastoTotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      inicio TIMESTAMP NULL,
      fim TIMESTAMP NULL,
      ativa BOOLEAN NOT NULL DEFAULT TRUE,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    label: 'leadInteresses',
    stmt: sql`CREATE TABLE IF NOT EXISTS leadInteresses (
      leadId INT NOT NULL,
      propertyId INT NOT NULL,
      campanhaId INT NULL,
      primeiroContatoAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lead_interesse (leadId, propertyId)
    )`,
  },
  { label: 'lead.funil', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN funil VARCHAR(20) DEFAULT 'comprador'` },
  { label: 'lead.origemCanal', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN origemCanal VARCHAR(30)` },
  { label: 'lead.origemCampanhaId', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN origemCampanhaId INT` },
  { label: 'lead.ultimoCanal', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN ultimoCanal VARCHAR(30)` },
  { label: 'lead.ultimaCampanhaId', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN ultimaCampanhaId INT` },
  { label: 'lead.slots', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN slots JSON` },
  { label: 'lead.tags', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN tags JSON` },
  // PR (e): qualificação por IA
  { label: 'lead.modoQualificacao', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN modoQualificacao VARCHAR(10) DEFAULT 'ia'` },
  { label: 'lead.perguntasIa', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN perguntasIa INT DEFAULT 0` },
  { label: 'lead.falhasIa', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN falhasIa INT DEFAULT 0` },
  {
    label: 'leadMensagens',
    stmt: sql`CREATE TABLE IF NOT EXISTS leadMensagens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NOT NULL,
      direcao VARCHAR(3) NOT NULL,
      autor VARCHAR(10) NOT NULL,
      texto TEXT NOT NULL,
      createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_msg_lead (leadId, createdAt)
    )`,
  },
  // PR (d): kanban e handoff humano
  { label: 'lead.etapa', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN etapa VARCHAR(30)` },
  { label: 'lead.motivoPerda', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN motivoPerda VARCHAR(120)` },
  { label: 'lead.humano', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN humano BOOLEAN DEFAULT FALSE` },
  // PR (c): rastreio da landing e do QR
  {
    label: 'leadEventos',
    stmt: sql`CREATE TABLE IF NOT EXISTS leadEventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NULL,
      visitanteId VARCHAR(36) NULL,
      tipo VARCHAR(40) NOT NULL,
      propertyId INT NULL,
      campanhaId INT NULL,
      dados JSON NULL,
      createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_evento_lead (leadId, createdAt),
      INDEX idx_evento_visitante (visitanteId)
    )`,
  },
  // PR (b): score por regras com detalhamento e histórico
  { label: 'lead.scoreDetalhe', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN scoreDetalhe JSON` },
  {
    label: 'leadScoreHistorico',
    stmt: sql`CREATE TABLE IF NOT EXISTS leadScoreHistorico (
      id INT AUTO_INCREMENT PRIMARY KEY,
      leadId INT NOT NULL,
      score INT NOT NULL,
      classe VARCHAR(10) NOT NULL,
      regras VARCHAR(20) NOT NULL,
      detalhes JSON NOT NULL,
      motivo VARCHAR(60) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_score_lead (leadId, createdAt)
    )`,
  },
];

function isAlreadyApplied(e: any): boolean {
  const code = e?.code || e?.cause?.code || '';
  const msg = e?.message || '';
  return code === 'ER_DUP_FIELDNAME' || code === 'ER_DUP_KEYNAME' || msg.includes('Duplicate column') || msg.includes('Duplicate key name');
}

export function formatCodigoImovel(id: number): string {
  return `IMV-${String(id).padStart(4, '0')}`;
}

export async function addLeadsV1(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;

  for (const { label, stmt } of MYSQL) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      if (!isAlreadyApplied(e)) console.error(`[Migration] Erro addLeadsV1 (${label}):`, e?.message);
    }
  }

  // Código IMV-xxxx a partir do id (imóveis já cadastrados e os novos sem código)
  try {
    await (db as any).execute(sql`UPDATE properties SET codigo = CONCAT('IMV-', LPAD(id, 4, '0')) WHERE codigo IS NULL OR codigo = ''`);
    await (db as any).execute(sql`ALTER TABLE properties ADD UNIQUE INDEX uq_properties_codigo (codigo)`);
  } catch (e: any) {
    if (!isAlreadyApplied(e)) console.error('[Migration] Erro addLeadsV1 (codigo IMV):', e?.message);
  }
  console.log('[Migration] ✅ addLeadsV1 (códigos IMV, campanhas, funis, slots)');
}
