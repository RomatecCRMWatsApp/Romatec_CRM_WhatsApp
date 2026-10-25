import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
delete process.env.ZAPI_INSTANCE_ID;

const R = await import('./financeiro/relatorios');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const HOJE = '2026-11-20';
let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  for (const [id, numero, lote, status] of [[1, 'BJ-2026-0001', 'A01', 'ativo'], [2, 'BJ-2026-0002', 'A02', 'ativo'], [3, 'BJ-2026-0003', 'A03', 'minuta'], [4, 'BJ-2026-0004', 'A04', 'cancelado']] as const) {
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (${id}, ${numero}, 1, ${lote}, 1, '{}', '{}', ${status}, ${`CODIGO00000${id}`})`);
  }
  db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Fulano de Tal', '52998224725', '99991234567'), (2, 'Ciclana Souza', '11144477735', NULL)`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (2, 2, 'comprador')`);
  // Contrato 1: entrada 1 paga (PIX em out), entrada 2 vencida (10/11), entrada 3 a vencer (10/12)
  db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, pagoEm, valorPago, formaPagamento) VALUES
    (1, 'entrada', 1, 3, '2026-10-10', '8000.00', 'paga', '2026-10-09', '8000.00', 'PIX'),
    (1, 'entrada', 2, 3, '2026-11-10', '8000.00', 'emitida', NULL, NULL, NULL),
    (1, 'entrada', 3, 3, '2026-12-10', '8000.00', 'prevista', NULL, NULL, NULL)`);
  // Contrato 2: à vista pago por boleto em nov — quitado
  db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, pagoEm, valorPago, formaPagamento) VALUES
    (2, 'avista', 1, 1, '2026-11-05', '150000.00', 'paga', '2026-11-05', '150000.00', 'BOLETO')`);
});

describe('extrato por comprador', () => {
  it('contratado, recebido, vencido, a vencer, % pago e situação; cancelado fica de fora', async () => {
    const e = await R.extratoCompradores(HOJE);
    const [c1, c2, c3] = e.linhas;
    expect(c1).toMatchObject({ contratoNumero: 'BJ-2026-0001', comprador: 'Fulano de Tal', contratado: 24000, recebido: 8000, vencido: 8000, aVencer: 8000, emAberto: 16000,
      pctPago: 33.3, situacao: 'EM_ATRASO', diasAtraso: 10, ultimoPagamento: '2026-10-09', proximoVencimento: '2026-12-10' });
    expect(c2).toMatchObject({ contratoNumero: 'BJ-2026-0002', situacao: 'QUITADO', pctPago: 100 });
    expect(c3).toMatchObject({ contratoNumero: 'BJ-2026-0003', situacao: 'AGUARDANDO_ASSINATURA' });
    expect(e.linhas.some(l => l.contratoNumero === 'BJ-2026-0004')).toBe(false);
    expect(e.totais).toMatchObject({ contratos: 3, recebido: 158000, vencido: 8000, emAtraso: 1, quitados: 1 });
    expect((await R.extratoXlsx(HOJE)).subarray(0, 2).toString()).toBe('PK');
  });
});

describe('fluxo de caixa', () => {
  it('saldo inicial, entradas por mês com acumulado, por forma e previsão com o atrasado', async () => {
    const f = await R.fluxoCaixa('2026-11-01', '2026-11-30', 'mes', HOJE);
    expect(f).toMatchObject({ saldoInicial: 8000, totalEntradas: 150000, saldoFinal: 158000, serie: [{ periodo: '2026-11', entradas: 150000, acumulado: 158000 }] });
    expect(f.porForma).toEqual([{ forma: 'BOLETO', valor: 150000 }]);
    expect(f.previsao).toEqual([{ mes: 'ATRASADO', valor: 8000 }, { mes: '2026-12', valor: 8000 }]);
    await expect(R.fluxoCaixa('2026-12-01', '2026-11-01')).rejects.toMatchObject({ codigo: 'PERIODO' });
  });
});

describe('cobrança por WhatsApp', () => {
  it('lista quem cobrar com a mensagem pronta (vencida + a vencer em N dias)', async () => {
    const l = await R.aCobrar(30, HOJE);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ contratoNumero: 'BJ-2026-0001', telefone: '5599991234567', total: 16000, diasAtraso: 10, ultimoEnvio: null });
    expect(l[0].mensagem).toContain('Olá, Fulano!');
    expect(l[0].mensagem).toContain('Entrada 2/3 — venceu em 10/11/2026: R$ 8.000,00');
    expect(l[0].mensagem).toContain('/c/CODIGO000001');
    expect((await R.aCobrar(5, HOJE))[0].parcelas).toHaveLength(1); // só a vencida
  });
  it('envia só aos escolhidos, registra na auditoria; sem Z-API e sem envio de teste, recusa', async () => {
    await expect(R.enviarCobrancas([1], 1)).rejects.toMatchObject({ codigo: 'ZAPI' });
    const enviadas: string[] = [];
    const r = await R.enviarCobrancas([1, 2], 1, { dias: 5, hoje: HOJE, intervaloMs: 0, enviar: async fone => { enviadas.push(fone); } });
    expect(r).toEqual({ enviando: 1, semTelefone: [] }); // o contrato 2 está quitado: nada a cobrar
    expect(enviadas).toEqual(['5599991234567']);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM financeiroAuditoria WHERE acao = 'cobranca_whatsapp'`)[0].n).toBe(1);
  });
});
