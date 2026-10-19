import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: controle de vendas dos lotes, histórico, arquivos e registro do empreendimento. Idempotente.
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'lotes.situacao', stmt: sql`ALTER TABLE lotes ADD COLUMN situacao VARCHAR(20) DEFAULT 'disponivel'` },
  { nome: 'lotes.leadId', stmt: sql`ALTER TABLE lotes ADD COLUMN leadId INT NULL` },
  { nome: 'lotes.corretorId', stmt: sql`ALTER TABLE lotes ADD COLUMN corretorId INT NULL` },
  { nome: 'lotes.clienteNome', stmt: sql`ALTER TABLE lotes ADD COLUMN clienteNome VARCHAR(160) NULL` },
  { nome: 'lotes.valorVenda', stmt: sql`ALTER TABLE lotes ADD COLUMN valorVenda DECIMAL(12,2) NULL` },
  { nome: 'lotes.valorEntrada', stmt: sql`ALTER TABLE lotes ADD COLUMN valorEntrada DECIMAL(12,2) NULL` },
  { nome: 'lotes.numParcelas', stmt: sql`ALTER TABLE lotes ADD COLUMN numParcelas INT NULL` },
  { nome: 'lotes.dataSituacao', stmt: sql`ALTER TABLE lotes ADD COLUMN dataSituacao TIMESTAMP NULL` },
  { nome: 'lotes.observacao', stmt: sql`ALTER TABLE lotes ADD COLUMN observacao VARCHAR(500) NULL` },
  { nome: 'lotes.verticesUtm', stmt: sql`ALTER TABLE lotes ADD COLUMN verticesUtm JSON NULL` },
  { nome: 'lotes.poligono', stmt: sql`ALTER TABLE lotes ADD COLUMN poligono JSON NULL` },
  { nome: 'emp.registroMatricula', stmt: sql`ALTER TABLE empreendimentos ADD COLUMN registroMatricula VARCHAR(60) NULL` },
  { nome: 'emp.registroCartorio', stmt: sql`ALTER TABLE empreendimentos ADD COLUMN registroCartorio VARCHAR(160) NULL` },
  { nome: 'emp.utmFuso', stmt: sql`ALTER TABLE empreendimentos ADD COLUMN utmFuso INT DEFAULT 23` },
  { nome: 'emp.responsavelTecnico', stmt: sql`ALTER TABLE empreendimentos ADD COLUMN responsavelTecnico VARCHAR(200) NULL` },
  {
    nome: 'loteHistorico',
    stmt: sql`CREATE TABLE IF NOT EXISTS loteHistorico (
      id INT AUTO_INCREMENT PRIMARY KEY,
      loteId INT NOT NULL,
      de VARCHAR(20) NULL, para VARCHAR(20) NOT NULL,
      leadId INT NULL, corretorId INT NULL, usuarioId INT NULL,
      detalhe VARCHAR(500) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_lotehist_lote (loteId)
    )`,
  },
  {
    nome: 'empreendimentoArquivos',
    stmt: sql`CREATE TABLE IF NOT EXISTS empreendimentoArquivos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empreendimentoId INT NOT NULL,
      nome VARCHAR(200) NOT NULL,
      categoria VARCHAR(30) NOT NULL DEFAULT 'outro',
      mime VARCHAR(100) NULL, tamanhoBytes INT NULL,
      conteudoBase64 LONGTEXT NOT NULL,
      enviadoPor INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_emparq_emp (empreendimentoId)
    )`,
  },
  // Situação interna a partir do status público dos lotes que já existiam
  {
    nome: 'lotes.situacao (preencher)',
    stmt: sql`UPDATE lotes SET situacao = CASE status
      WHEN 'reservado' THEN 'reservado' WHEN 'em_negociacao' THEN 'interesse' WHEN 'vendido' THEN 'vendido_avista'
      WHEN 'nao_comercializavel' THEN 'bloqueado' ELSE 'disponivel' END
      WHERE situacao IS NULL OR (situacao = 'disponivel' AND status <> 'disponivel')`,
  },
];

export async function addControleLotes(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.warn(`[Migration] addControleLotes (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addControleLotes (vendas dos lotes, histórico, arquivos)');
}
