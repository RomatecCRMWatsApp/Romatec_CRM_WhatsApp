import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
delete process.env.ZAPI_INSTANCE_ID;
process.env.ASAAS_API_KEY_BOM_JARDIMS = '$aact_prod_teste';

// Asaas falso (nenhuma chamada sai para a rede)
const asaas = { status: 'PENDING', recebidos: [] as { id: string; data: string; valor: number }[] };
vi.mock('./financeiro/asaas', async orig => ({
  ...(await orig<any>()),
  obterCobranca: vi.fn(async (_c: any, id: string) => ({ id, status: asaas.status, value: 1234.51, dueDate: '2027-06-10' })),
  receberEmDinheiro: vi.fn(async (_c: any, id: string, i: { data: string; valor: number }) => { asaas.recebidos.push({ id, ...i }); return { id, status: 'RECEIVED_IN_CASH' }; }),
}));
vi.mock('./financeiro/servico', async orig => ({ ...(await orig<any>()), enviarRecibo: vi.fn(async () => ({ enviado: false })) }));

const P = await import('./financeiro/pagamentoManual');
const IP = await import('./financeiro/infinitepay');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const fixture = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');

let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{}')`);
  for (const [id, numero, lote] of [[1, 'BJ-2026-0001', 'A01'], [2, 'BJ-2026-0002', 'A02']] as const) {
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (${id}, ${numero}, 1, ${lote}, 1, '{"saldo_qtd":120}', '{}', 'ativo', ${`CODIGO00000${id}`})`);
  }
  db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj) VALUES (1, 'Fulano de Tal', '52998224725'), (2, 'Ciclana Souza', '11144477735')`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (2, 2, 'comprador')`);
  // Contrato 1: entrada 1 (sem boleto) e saldo 1 (boleto no Asaas); contrato 2: entrada 1
  db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status) VALUES (10, 1, 'entrada', 1, 6, '2026-11-10', '8000.00', 'emitida')`);
  db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status, asaasPaymentId) VALUES (11, 1, 'saldo', 1, 120, '2027-06-10', '1234.51', 'emitida', 'pay_saldo1')`);
  db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status) VALUES (20, 2, 'entrada', 1, 6, '2026-11-10', '350.00', 'vencida')`);
});

describe('recibo InfinitePay (portado do ZAYRA)', () => {
  it('lê valor, data, pagador, CPF parcial e E2E; destino Romatec / J R P BEZERRA', () => {
    const r = IP.parseReciboHtml(fixture('recibo-infinitepay-ok.html'));
    expect(r).toMatchObject({ valor: 300, pago_em: '2026-10-10 14:03:00', id_transacao: 'E18236120202610101703s0aa11bb22c' });
    expect(r.origem).toMatchObject({ nome: 'MARIA TESTE DA SILVA', cpf: '***.189.983-**' });
    expect(IP.destinoEhRomatec(r)).toBe(true);
    expect(IP.destinoEhRomatec({ ...r, destino: { nome: 'J R P BEZERRA LTDA', cnpj: null, chave: null } })).toBe(true);
    expect(IP.destinoEhRomatec({ ...r, destino: { nome: 'OUTRA EMPRESA', cnpj: '00.000.000/0001-00', chave: 'x@y.com' } })).toBe(false);
    expect(() => IP.parseReciboHtml(fixture('recibo-infinitepay-nao-encontrado.html'))).toThrow(/não encontrado/);
    expect(IP.parseReciboHtml(fixture('recibo-infinitepay-nextdata.html')).valor).toBeGreaterThan(0);
    expect(() => IP.validarUrlRecibo('https://outro.site/statements/x')).toThrow(/recibo.infinitepay.io/);
  });
  it('CPF parcial do comprovante', () => {
    expect(P.cpfParcialConfere('***.982.247-**', ['52998224725'])).toBe(true);
    expect(P.cpfParcialConfere('***.189.983-**', ['52998224725', null])).toBe(false);
    expect(P.cpfParcialConfere('', ['52998224725'])).toBe(true);
  });
});

describe('lançar pagamento', () => {
  const base = { forma: 'PIX' as const, pagoEm: '2026-10-25T10:30', idTransacao: 'E00000000202610251030aaaaaaaaaaaa', pagadorNome: 'Fulano de Tal', pagadorCpfParcial: '***.982.247-**' };

  it('validações: PIX sem ID, parcela com valor diferente, rateio maior que o pago, CPF de terceiro sem vínculo', async () => {
    await expect(P.lancarPagamento({ ...base, idTransacao: '', valor: 8000, rateio: [{ cobrancaId: 10, valor: 8000 }] }, 1)).rejects.toMatchObject({ codigo: 'SEM_ID' });
    await expect(P.lancarPagamento({ ...base, valor: 5000, rateio: [{ cobrancaId: 10, valor: 5000 }] }, 1)).rejects.toMatchObject({ codigo: 'VALOR_PARCELA' });
    await expect(P.lancarPagamento({ ...base, valor: 100, rateio: [{ cobrancaId: 10, valor: 8000 }] }, 1)).rejects.toMatchObject({ codigo: 'RATEIO' });
    await expect(P.lancarPagamento({ ...base, pagadorCpfParcial: '***.189.983-**', valor: 8000, rateio: [{ cobrancaId: 10, valor: 8000 }] }, 1)).rejects.toMatchObject({ codigo: 'VINCULO_OBRIGATORIO' });
    expect(db.all(sql`SELECT COUNT(*) AS n FROM pagamentosManuais`)[0].n).toBe(0);
  });

  it('um PIX para 2 contratos (rateio): parcelas pagas, recibos emitidos, sobra anotada; o mesmo E2E não entra de novo', async () => {
    const r = await P.lancarPagamento({ ...base, pagadorCpfParcial: '***.189.983-**', vinculoPagador: 'cunhada dos dois compradores', valor: 8400, rateio: [{ cobrancaId: 10, valor: 8000 }, { cobrancaId: 20, valor: 350 }] }, 1);
    expect(r.baixadas.map(b => [b.contrato, b.parcela])).toEqual([['BJ-2026-0001', 'Entrada 1/6'], ['BJ-2026-0002', 'Entrada 1/6']]);
    expect(r.sobra).toBe(50);
    const cob: any[] = db.all(sql`SELECT id, status, pagoEm, valorPago FROM cobrancas WHERE id IN (10, 20) ORDER BY id`);
    expect(cob.map(c => [c.status, c.pagoEm])).toEqual([['paga', '2026-10-25'], ['paga', '2026-10-25']]);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM crm_recibos`)[0].n).toBe(2);
    expect(db.all(sql`SELECT observacao FROM pagamentosManuais`)[0].observacao).toContain('Sobra de R$ 50.00');
    await expect(P.lancarPagamento({ ...base, valor: 1234.51, rateio: [{ cobrancaId: 11, valor: 1234.51 }] }, 1)).rejects.toMatchObject({ codigo: 'TRANSACAO_DUPLICADA' });
    await expect(P.lancarPagamento({ ...base, idTransacao: 'E1', valor: 8000, rateio: [{ cobrancaId: 10, valor: 8000 }] }, 1)).rejects.toMatchObject({ codigo: 'JA_QUITADA' });
  });

  it('parcela com boleto no Asaas: já paga lá → recusa; em aberto → avisa o Asaas (recebido em dinheiro) e dá baixa', async () => {
    asaas.status = 'RECEIVED';
    await expect(P.lancarPagamento({ ...base, idTransacao: 'E2', valor: 1234.51, rateio: [{ cobrancaId: 11, valor: 1234.51 }] }, 1)).rejects.toMatchObject({ codigo: 'JA_PAGO_ASAAS' });
    asaas.status = 'PENDING';
    const r = await P.lancarPagamento({ ...base, forma: 'TRANSFERENCIA', idTransacao: null, valor: 1234.51, rateio: [{ cobrancaId: 11, valor: 1234.51 }] }, 1);
    expect(r.baixadas[0].parcela).toBe('Saldo 1/120');
    expect(asaas.recebidos).toEqual([{ id: 'pay_saldo1', data: '2026-10-25', valor: 1234.51 }]);
    expect((await P.parcelasEmAberto(1))).toEqual([]);
    expect((await P.pagamentosRecentes()).length).toBe(2);
  });
});
