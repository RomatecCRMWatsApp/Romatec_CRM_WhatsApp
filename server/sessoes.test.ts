import { describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'teste-sessoes-segredo';

const { encerrarSessoes, manterSoEsteAparelho } = await import('./sessoes');
const { sessaoValida, sdk } = await import('./_core/sdk');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('sair de todos os aparelhos', () => {
  it('subir a versão derruba os tokens antigos; o aparelho atual recebe um cookie novo válido', async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (5, 'cor-5', 'Corretor', 'user')`);
    const antigo = await sdk.verifySession(await sdk.createSessionToken('cor-5', { name: 'Corretor', sessaoVersao: 0 }));
    expect(sessaoValida(antigo!.sv, 0)).toBe(true);
    expect(await encerrarSessoes(5)).toBe(1);
    expect(sessaoValida(antigo!.sv, 1)).toBe(false);
    const cookies: any[] = [];
    await manterSoEsteAparelho({ req: { headers: {}, protocol: 'https' }, res: { cookie: (...a: any[]) => cookies.push(a) } }, { id: 5, openId: 'cor-5', name: 'Corretor' });
    const [u]: any[] = db.all(sql`SELECT sessaoVersao FROM users WHERE id = 5`);
    expect(u.sessaoVersao).toBe(2);
    const novo = await sdk.verifySession(cookies[0][1]);
    expect(sessaoValida(novo!.sv, 2)).toBe(true);
    expect(sessaoValida(antigo!.sv, 2)).toBe(false);
  });
});
