import { describe, expect, it } from 'vitest';
import { opcoesPool } from './db';

describe('pool MySQL', () => {
  it('padrão: 10 conexões (o que já rodava), fila limitada, keep-alive e devolução de ociosas', () => {
    const o = opcoesPool({});
    expect(o).toMatchObject({ connectionLimit: 10, queueLimit: 500, waitForConnections: true, enableKeepAlive: true, idleTimeout: 60_000, maxIdle: 5, connectTimeout: 10_000 });
  });
  it('ajuste por variável de ambiente, com limites de segurança', () => {
    expect(opcoesPool({ DB_POOL_LIMITE: '20', DB_POOL_FILA: '100', DB_POOL_OCIOSAS: '8' })).toMatchObject({ connectionLimit: 20, queueLimit: 100, maxIdle: 8 });
    expect(opcoesPool({ DB_POOL_LIMITE: '999' }).connectionLimit).toBe(50);
    expect(opcoesPool({ DB_POOL_LIMITE: 'abc' }).connectionLimit).toBe(10);
    expect(opcoesPool({ DB_POOL_LIMITE: '3' }).maxIdle).toBe(3); // ociosas nunca acima do limite
  });
});

import { consultasLentasCrm, cronometrar, registrarLenta, textoDaConsulta } from './db';

describe('registro de consultas lentas do CRM', () => {
  it('guarda só o SQL com "?" (sem valores), agrupa repetidas e ignora as rápidas', () => {
    expect(textoDaConsulta({ sql: 'select *\n  from `users`   where id = ?', values: [42] })).toBe('select * from `users` where id = ?');
    registrarLenta('select 1 rapida', 50);
    registrarLenta('select pesada where x = ?', 1500, new Date('2026-11-09T10:00:00Z'));
    registrarLenta('select pesada where x = ?', 3200, new Date('2026-11-09T11:00:00Z'));
    const l = consultasLentasCrm();
    expect(l.itens.find(x => x.consulta === 'select 1 rapida')).toBeUndefined();
    expect(l.itens.find(x => x.consulta === 'select pesada where x = ?')).toMatchObject({ vezes: 2, ms: 3200, ultimaEm: '2026-11-09T11:00:00.000Z' });
  });
  it('o cronômetro não muda o resultado nem engole erros', async () => {
    const pool: any = { query: async (q: string) => [[{ ok: q }]], execute: async () => { throw new Error('falhou'); } };
    cronometrar(pool);
    expect(await pool.query('select ?')).toEqual([[{ ok: 'select ?' }]]);
    await expect(pool.execute('update x')).rejects.toThrow('falhou');
  });
});
