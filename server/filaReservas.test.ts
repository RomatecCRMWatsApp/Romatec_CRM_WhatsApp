import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const F = await import('./lotes/filaReservas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const H = 3_600_000;
let db: any;
const lote = (codigo: string) => db.all(sql`SELECT * FROM lotes WHERE codigo = ${codigo}`)[0];
const iso = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

beforeAll(async () => {
  db = await getDb();
  const agora = Date.now();
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo) VALUES
    (1, 'u1', 'José Admin', 'admin', NULL, 1),
    (2, 'u2', 'Ana Ativa', 'user', 'corretor', 1),
    (3, 'u3', 'Bruno Pausado', 'user', 'corretor', 1),
    (4, 'u4', 'Carla Desativada', 'user', 'corretor', 0),
    (5, 'u5', 'Davi Outro Emp', 'user', 'corretor', 1)`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims'), (2, 'outro', 'Outro')`);
  db.run(sql`INSERT INTO acessosCorretor (usuarioId, tipo, refId) VALUES (2, 'empreendimento', 1), (3, 'empreendimento', 1), (5, 'empreendimento', 2)`);
  db.run(sql`INSERT INTO saasPlanos (id, codigo, publico, nome, precoMensal) VALUES (90, 'X', 'CORRETOR', 'X', '1')`);
  db.run(sql`INSERT INTO saasAssinaturas (usuarioId, planoId, chave, origem, status) VALUES (3, 90, '3:0', 'TRIAL', 'BLOQUEADO')`);
  const ins = (codigo: string, situacao: string, corretorId: number | null, reservadoAte: string | null) =>
    db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, situacao, corretorId, reservadoAte, clienteNome) VALUES (1, ${codigo}, ${situacao}, ${corretorId}, ${reservadoAte}, ${'Cliente ' + codigo})`);
  ins('A01', 'reservado', 2, iso(agora - 5 * H));   // vencida
  ins('A02', 'reservado', 3, iso(agora + 30 * H));  // corretor pausado
  ins('A03', 'entrada', 4, null);                    // corretor desativado
  ins('A04', 'interesse', null, null);               // sem corretor
  ins('A05', 'reservado', 2, iso(agora + 50 * H));  // em dia
  ins('A06', 'vendido_parcelado', 2, null);          // fora (vendida)
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, status, simulacaoJson, dadosJson, codigoVerificacao) VALUES (7, 'BJ-2026-0007', 1, 0, 'A05', 2, 'rascunho', '{}', '{}', 'abc')`);
  db.run(sql`UPDATE lotes SET contratoReservaId = 7 WHERE codigo = 'A05'`);
});

describe('fila de reservas do escritório', () => {
  it('motivo: vencida > sem corretor > corretor sem acesso; em dia fica com o corretor', () => {
    const agora = Date.now();
    expect(F.motivoFila({ situacao: 'reservado', reservadoAte: new Date(agora - H), corretorId: 2 }, true, agora)).toBe('vencida');
    expect(F.motivoFila({ situacao: 'entrada', reservadoAte: new Date(agora - H), corretorId: 2 }, true, agora)).toBeNull(); // entrada não tem prazo
    expect(F.motivoFila({ situacao: 'interesse', corretorId: null }, null, agora)).toBe('sem_corretor');
    expect(F.motivoFila({ situacao: 'reservado', reservadoAte: new Date(agora + H), corretorId: 3 }, false, agora)).toBe('corretor_sem_acesso');
    expect(F.motivoFila({ situacao: 'reservado', reservadoAte: new Date(agora + H), corretorId: 2 }, true, agora)).toBeNull();
  });

  it('lista: na fila as vencidas, de corretor pausado ou desativado e sem corretor; vendidas não entram', async () => {
    const r = await F.listarReservas();
    expect(r.todas.map(i => i.codigo).sort()).toEqual(['A01', 'A02', 'A03', 'A04', 'A05']);
    expect(Object.fromEntries(r.fila.map(i => [i.codigo, i.motivo]))).toEqual({ A01: 'vencida', A02: 'corretor_sem_acesso', A03: 'corretor_sem_acesso', A04: 'sem_corretor' });
    expect(r.fila[0].codigo).toBe('A01');
    const a05 = r.todas.find(i => i.codigo === 'A05')!;
    expect(a05.contrato).toMatchObject({ numero: 'BJ-2026-0007' });
    expect(a05.horasRestantes).toBeGreaterThan(40);
  });

  it('passar para corretor: só ativo e habilitado no empreendimento; histórico registrado', async () => {
    expect((await F.corretoresHabilitados(1)).map(c => c.nome)).toEqual(['Ana Ativa']); // Bruno pausado, Carla desativada, Davi de outro empreendimento
    await expect(F.acaoReserva(lote('A02').id, { tipo: 'reatribuir', corretorId: 5 }, 1)).rejects.toThrow(/habilitado/);
    await F.acaoReserva(lote('A02').id, { tipo: 'reatribuir', corretorId: 2 }, 1);
    expect(lote('A02').corretorId).toBe(2);
    expect(db.all(sql`SELECT detalhe FROM loteHistorico WHERE loteId = ${lote('A02').id}`)[0].detalhe).toMatch(/passada para Ana Ativa/);
  });

  it('assumir, prorrogar 72 h e liberar (com contrato ligado, recusa)', async () => {
    await F.acaoReserva(lote('A03').id, { tipo: 'assumir' }, 1);
    expect(lote('A03').corretorId).toBeNull();
    await expect(F.acaoReserva(lote('A03').id, { tipo: 'prorrogar' }, 1)).rejects.toThrow(/72 h/); // entrada não tem prazo
    await F.acaoReserva(lote('A01').id, { tipo: 'prorrogar' }, 1);
    expect(new Date(lote('A01').reservadoAte).getTime() - Date.now()).toBeGreaterThan(71 * H);
    expect(F.motivoFila(lote('A01'), true)).toBeNull();
    await expect(F.acaoReserva(lote('A05').id, { tipo: 'liberar', motivo: 'desistiu' }, 1)).rejects.toThrow(/contrato BJ-2026-0007/);
    await expect(F.acaoReserva(lote('A04').id, { tipo: 'liberar', motivo: '' }, 1)).rejects.toThrow(/motivo/);
    await F.acaoReserva(lote('A04').id, { tipo: 'liberar', motivo: 'cliente desistiu' }, 1);
    expect(lote('A04')).toMatchObject({ situacao: 'disponivel', corretorId: null, clienteNome: null });
    await expect(F.acaoReserva(lote('A04').id, { tipo: 'assumir' }, 1)).rejects.toThrow(/não está mais reservada/);
  });
});
