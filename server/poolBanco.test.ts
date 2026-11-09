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
