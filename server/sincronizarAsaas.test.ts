import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
delete process.env.ZAPI_INSTANCE_ID;
process.env.ASAAS_API_KEY_BOM_JARDIMS = '$aact_prod_teste';

// Situação de cada boleto "no Asaas" (nenhuma chamada sai para a rede)
const remoto: Record<string, string> = { pay_pago: 'RECEIVED', pay_atrasado: 'OVERDUE', pay_aberto: 'PENDING' };
vi.mock('./financeiro/asaas', async orig => ({
  ...(await orig<any>()),
  obterCobranca: vi.fn(async (_c: any, id: string) => ({ id, status: remoto[id], value: 1234.51, billingType: 'PIX', paymentDate: '2026-10-20', dueDate: '2026-10-10' })),
}));
vi.mock('./financeiro/servico', async orig => ({ ...(await orig<any>()), enviarRecibo: vi.fn(async () => ({ enviado: false })) }));

const S = await import('./financeiro/sincronizar');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{}')`);
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
    VALUES (1, 'BJ-2026-0001', 1, 'A01', 1, '{"saldo_qtd":120}', '{}', 'ativo', 'CODIGO000001')`);
  db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status, asaasPaymentId) VALUES
    (1, 1, 'saldo', 1, 120, '2026-10-10', '1234.51', 'emitida', 'pay_pago'),
    (2, 1, 'saldo', 2, 120, '2026-10-10', '1234.51', 'emitida', 'pay_atrasado'),
    (3, 1, 'saldo', 3, 120, '2026-12-10', '1234.51', 'emitida', 'pay_aberto')`);
});

describe('Sincronizar com o Asaas', () => {
  it('situação do Asaas → evento do webhook', () => {
    expect(S.eventoDaSituacao('RECEIVED_IN_CASH')).toBe('PAYMENT_RECEIVED_IN_CASH');
    expect(S.eventoDaSituacao('PENDING')).toBeNull();
  });

  it('baixa o que foi pago (com recibo), marca vencida a atrasada e deixa a em aberto; rodar de novo não repete', async () => {
    expect(await S.sincronizarComAsaas()).toEqual({ conferidas: 3, pagas: 1, vencidas: 1, outras: 0, erros: 0 });
    const st: any[] = db.all(sql`SELECT id, status, pagoEm FROM cobrancas ORDER BY id`);
    expect(st.map(c => c.status)).toEqual(['paga', 'vencida', 'emitida']);
    expect(st[0].pagoEm).toBe('2026-10-20');
    expect(db.all(sql`SELECT COUNT(*) AS n FROM crm_recibos`)[0].n).toBe(1);
    // 2ª vez: a paga não é mais conferida; a vencida continua vencida sem evento novo
    expect(await S.sincronizarComAsaas()).toEqual({ conferidas: 2, pagas: 0, vencidas: 0, outras: 0, erros: 0 });
    expect(db.all(sql`SELECT COUNT(*) AS n FROM crm_recibos`)[0].n).toBe(1);
  });
});
