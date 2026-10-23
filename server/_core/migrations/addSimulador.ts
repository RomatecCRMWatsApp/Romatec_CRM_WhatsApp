import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: simulador de financiamento (shared/simulador.ts). Idempotente.
 * - lotes.precoTabela; condicoesPagamento (condições por empreendimento, reajuste sem deploy); simulacoes (centavos).
 * - Seed do Bom Jardims: condições vigentes desde 23/10/2026 (só se ainda não houver) e preço de tabela
 *   dos lotes comercializáveis que ainda não têm preço (área até 3.025,11 + 1 m² = R$ 160.000; acima, proporcional).
 */
const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  { nome: 'lotes.precoTabela', stmt: sql`ALTER TABLE lotes ADD COLUMN precoTabela DECIMAL(12,2) NULL AFTER precoFinanciadoRef` },
  {
    nome: 'condicoesPagamento',
    stmt: sql`CREATE TABLE IF NOT EXISTS condicoesPagamento (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empreendimentoId INT NOT NULL,
      precoBase DECIMAL(12,2) NOT NULL,
      areaBaseM2 DECIMAL(10,2) NOT NULL,
      toleranciaAreaM2 DECIMAL(10,2) NOT NULL DEFAULT 1.00,
      entradaPct DECIMAL(6,4) NOT NULL,
      entradaMaxParcelas INT NOT NULL,
      descontoAvistaPct DECIMAL(6,4) NOT NULL,
      jurosAaEfetivo DECIMAL(6,4) NOT NULL,
      metodo ENUM('PRICE') NOT NULL DEFAULT 'PRICE',
      prazos JSON NOT NULL,
      comissaoTotalPct DECIMAL(6,4) NOT NULL,
      comissaoCorretorPct DECIMAL(6,4) NOT NULL,
      comissao1aParcelaPct DECIMAL(6,4) NOT NULL,
      vigenteDesde DATE NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      INDEX idx_cond_emp (empreendimentoId),
      CONSTRAINT fk_cond_emp FOREIGN KEY (empreendimentoId) REFERENCES empreendimentos(id)
    )`,
  },
  {
    nome: 'simulacoes',
    stmt: sql`CREATE TABLE IF NOT EXISTS simulacoes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      empreendimentoId INT NOT NULL,
      loteId INT NOT NULL,
      leadId INT NULL,
      usuarioId INT NULL,
      entradaParcelas INT NOT NULL,
      prazoSaldo INT NOT NULL,
      precoCents INT NOT NULL,
      entradaCents INT NOT NULL,
      saldoCents INT NOT NULL,
      parcelaSaldoCents INT NOT NULL,
      totalPagoCents INT NOT NULL,
      payload JSON NULL,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sim_lead (leadId),
      INDEX idx_sim_lote (loteId),
      CONSTRAINT fk_sim_emp FOREIGN KEY (empreendimentoId) REFERENCES empreendimentos(id),
      CONSTRAINT fk_sim_lote FOREIGN KEY (loteId) REFERENCES lotes(id)
    )`,
  },
  {
    nome: 'seed condicoesPagamento (Bom Jardims)',
    stmt: sql`INSERT INTO condicoesPagamento
      (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
      SELECT e.id, 160000.00, 3025.11, 1.00, 0.3000, 6, 0.0625, 0.0600, 'PRICE', JSON_ARRAY(12,24,36,60,120), 0.0500, 0.0200, 0.5000, '2026-10-23', TRUE
      FROM empreendimentos e
      WHERE e.slug = 'bom-jardims' AND NOT EXISTS (SELECT 1 FROM condicoesPagamento c WHERE c.empreendimentoId = e.id)`,
  },
  {
    nome: 'seed lotes.precoTabela (Bom Jardims)',
    stmt: sql`UPDATE lotes l JOIN empreendimentos e ON e.id = l.empreendimentoId
      SET l.precoTabela = IF(l.areaM2 <= 3025.11 + 1.00, 160000.00, ROUND(l.areaM2 * 160000.00 / 3025.11, 2))
      WHERE e.slug = 'bom-jardims' AND l.comercializavel = 1 AND l.precoTabela IS NULL AND l.areaM2 IS NOT NULL`,
  },
];

export async function addSimulador(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.warn(`[Migration] addSimulador (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addSimulador (condições de pagamento, simulações, preço de tabela)');
}
