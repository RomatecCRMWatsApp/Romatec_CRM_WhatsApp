import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const M = await import('./lotes/expirarReservas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Motor das reservas: 24 h a contar da reserva, venha de onde vier. Dados fictícios.
const H = 3_600_000;
let db: any;
const lote = (codigo: string) => db.all(sql`SELECT * FROM lotes WHERE codigo = ${codigo}`)[0];
const iso = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

beforeAll(async () => {
  db = await getDb();
  const agora = Date.now();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'teste', 'Teste')`);
  const ins = (codigo: string, situacao: string, reservadoAte: string | null, dataSituacao: string | null = null) =>
    db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, situacao, corretorId, reservadoAte, dataSituacao, clienteNome) VALUES (1, ${codigo}, ${situacao}, 2, ${reservadoAte}, ${dataSituacao}, ${'Cliente ' + codigo})`);
  ins('B01', 'reservado', iso(agora - H));                 // vencida (contrato sem assinatura)
  ins('B02', 'reservado', iso(agora + 10 * H));            // em dia
  ins('B03', 'reservado', null, iso(agora - 25 * H));      // reserva manual antiga, sem prazo: conta da data da situação
  ins('B04', 'reservado', null, iso(agora - 2 * H));       // reserva manual recente
  ins('B05', 'reservado', iso(agora - H));                 // vencida, mas contrato já assinado
  ins('B06', 'entrada', iso(agora - 50 * H));              // sinal pago: não é reserva
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, status, simulacaoJson, dadosJson, codigoVerificacao) VALUES
    (11, 'TS-2026-0011', 1, 0, 'B01', 2, 'em_assinatura', '{}', '{}', 'a1'), (12, 'TS-2026-0012', 1, 0, 'B05', 2, 'assinado', '{}', '{}', 'a2')`);
  db.run(sql`UPDATE lotes SET contratoReservaId = 11 WHERE codigo = 'B01'`);
  db.run(sql`UPDATE lotes SET contratoReservaId = 12 WHERE codigo = 'B05'`);
});

describe('motor das reservas (24 h)', () => {
  it('vencimento: prazo gravado, ou 24 h da data da situação; só "reservado" tem prazo', () => {
    const t = Date.parse('2026-11-14T12:00:00Z');
    expect(M.venceEm({ situacao: 'reservado', reservadoAte: new Date(t) })).toBe(t);
    expect(M.venceEm({ situacao: 'reservado', dataSituacao: new Date(t) })).toBe(t + 24 * H);
    expect(M.venceEm({ situacao: 'entrada', reservadoAte: new Date(t) })).toBeNull();
  });

  it('libera as vencidas (inclusive reserva manual sem prazo) e mantém as em dia, o sinal pago e o contrato assinado', async () => {
    const liberadas = await M.expirarReservas();
    expect(liberadas.sort()).toEqual(['B01', 'B03']);
    expect(lote('B01')).toMatchObject({ situacao: 'disponivel', status: 'disponivel', corretorId: null, clienteNome: null, contratoReservaId: null, reservadoAte: null });
    expect(lote('B02').situacao).toBe('reservado');
    expect(lote('B04').situacao).toBe('reservado');
    expect(lote('B05').situacao).toBe('reservado');
    expect(lote('B06').situacao).toBe('entrada');
    const h = db.all(sql`SELECT detalhe FROM loteHistorico WHERE loteId = ${lote('B01').id}`);
    expect(h[0].detalhe).toMatch(/24 h vencida.*contrato TS-2026-0011 sem assinatura/);
    expect(await M.expirarReservas()).toEqual([]);
  });
});
