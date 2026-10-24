import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration v1.10.0 — Bloco Financeiro v1.0 (boleto A4, carnê v2, 2ª via atualizada, recibos, declaração anual).
 * Idempotente e não destrutiva. Reconciliação com o spec:
 * - cobrancas.saldo_apos = coluna saldoDevedor, que já existe (saldo devedor após a parcela);
 *   juros_parcela e amortizacao também já existem (v1.9.0) — só entram as colunas da 2ª via e do pagamento;
 * - recibos/declarações guardam o PDF em contratoArquivos (chave em pdfArquivo), como os contratos;
 * - recibos numerados por ano (REC-BJ-AAAA-NNNNNN): o índice único do número resolve emissões simultâneas;
 * - financeiroAuditoria registra quem gerou/baixou/reenviou cada documento ("tudo em auditoria").
 */
const COLUNAS: [string, string, string][] = [
  ['cobrancas', 'valorOriginal', 'DECIMAL(12,2) NULL'],
  ['cobrancas', 'vencimentoOriginal', 'DATE NULL'],
  ['cobrancas', 'segundaViaEm', 'DATETIME NULL'],
  ['cobrancas', 'formaPagamento', 'VARCHAR(12) NULL'],
  ['cobrancas', 'asaasSnapshot', 'JSON NULL'],
  // Beneficiário = titular da conta Asaas da chave do empreendimento (lido de /myAccount; muda sozinho ao trocar a chave)
  ['empJuridico', 'asaasBeneficiario', 'JSON NULL'],
];

const TABELAS: [string, string][] = [
  ['recibos', `CREATE TABLE IF NOT EXISTS recibos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(24) NOT NULL,
    cobrancaId INT NOT NULL,
    contratoId INT NOT NULL,
    codigoVerif CHAR(14) NOT NULL,
    valorPago DECIMAL(12,2) NOT NULL,
    pagoEm DATE NOT NULL,
    pdfArquivo VARCHAR(255) NULL,
    enviadoEm DATETIME NULL,
    envioErro VARCHAR(255) NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_recibo_numero (numero),
    UNIQUE KEY ux_recibo_cobranca (cobrancaId),
    INDEX ix_recibo_contrato (contratoId),
    CONSTRAINT fk_recibo_cobranca FOREIGN KEY (cobrancaId) REFERENCES cobrancas(id)
  )`],
  ['declaracoesQuitacao', `CREATE TABLE IF NOT EXISTS declaracoesQuitacao (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contratoId INT NOT NULL,
    anoRef SMALLINT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'emitida',
    motivo VARCHAR(255) NULL,
    valorTotal DECIMAL(12,2) NULL,
    pdfArquivo VARCHAR(255) NULL,
    enviadoEm DATETIME NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_declaracao (contratoId, anoRef),
    CONSTRAINT fk_decl_contrato FOREIGN KEY (contratoId) REFERENCES contratos(id)
  )`],
  ['indicesIpca', `CREATE TABLE IF NOT EXISTS indicesIpca (
    competencia CHAR(7) PRIMARY KEY,
    variacao DECIMAL(8,4) NOT NULL,
    fonte VARCHAR(40) NOT NULL DEFAULT 'IBGE/SIDRA 1737',
    atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`],
  ['financeiroAuditoria', `CREATE TABLE IF NOT EXISTS financeiroAuditoria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    acao VARCHAR(40) NOT NULL,
    contratoId INT NULL,
    cobrancaId INT NULL,
    usuarioId INT NULL,
    origem VARCHAR(20) NOT NULL,
    ip VARCHAR(45) NULL,
    detalhe JSON NULL,
    criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_fin_aud_contrato (contratoId, id)
  )`],
];

const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  ...COLUNAS.map(([t, c, tipo]) => ({ nome: `${t}.${c}`, stmt: sql.raw(`ALTER TABLE ${t} ADD COLUMN ${c} ${tipo}`) })),
  ...TABELAS.map(([nome, ddl]) => ({ nome, stmt: sql.raw(ddl) })),
];

export async function addFinanceiro(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(msg)) console.warn(`[Migration] addFinanceiro (${nome}):`, msg);
    }
  }
  console.log('[Migration] ✅ addFinanceiro (2ª via, recibos, declarações, IPCA)');
}
