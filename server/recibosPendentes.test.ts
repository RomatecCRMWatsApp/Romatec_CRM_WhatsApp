import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const F = await import('./financeiro/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
    VALUES (1, 'BJ-2026-0001', 1, 'A01', 1, '{}', '{}', 'ativo', 'CODIGO0000001')`);
  db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status, pagoEm, valorPago, formaPagamento) VALUES
    (1, 1, 'entrada', 1, 3, '2026-10-10', '8000.00', 'paga', '2026-10-09', '8000.00', 'PIX'),
    (2, 1, 'entrada', 2, 3, '2026-11-10', '8000.00', 'paga', '2026-11-08', '8000.00', 'BOLETO'),
    (3, 1, 'entrada', 3, 3, '2026-12-10', '8000.00', 'emitida', NULL, NULL, NULL)`);
  // Recibo da ZAYRA na tabela "recibos" (banco compartilhado): o CRM não pode ler nem gravar nela
  db.run(sql`INSERT INTO recibos (numero, tipo, destinatario_nome, token) VALUES ('RZ-0001', 'funcionario', 'Fulano', 'tok1')`);
});

describe('recibos pendentes (tabela "recibos" era da ZAYRA)', () => {
  it('emite os recibos das parcelas pagas sem recibo, uma vez só; a tabela da ZAYRA fica intacta', async () => {
    const r = await F.emitirRecibosPendentes();
    expect(r).toEqual({ emitidos: ['REC-BJ-2026-000001', 'REC-BJ-2026-000002'], falhas: 0 });
    expect(db.all(sql`SELECT cobrancaId FROM crm_recibos ORDER BY cobrancaId`).map((x: any) => x.cobrancaId)).toEqual([1, 2]);
    expect(await F.emitirRecibosPendentes()).toEqual({ emitidos: [], falhas: 0 });
    expect(db.all(sql`SELECT numero FROM recibos`)).toEqual([{ numero: 'RZ-0001' }]);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM financeiroAuditoria WHERE acao = 'recibo_emitido_pendente'`)[0].n).toBe(2);
  });
});
