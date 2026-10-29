import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const T = await import('./tour360');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;
const img = async (w: number, h: number) => (await sharp({ create: { width: w, height: h, channels: 3, background: '#3a7' } }).jpeg().toBuffer()).toString('base64');

describe('tour 360°', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Bom Jardims', 'Açailândia', 'MA')`);
  });
  it('aceita só foto 2:1, reduz para até 4096 px e lista a da chácara antes das gerais', async () => {
    expect(T.ehEquirretangular(6000, 3000)).toBe(true);
    expect(T.ehEquirretangular(4000, 3000)).toBe(false);
    await expect(T.adicionarTour({ slug: 'bom-jardims', titulo: 'Errada', base64: await img(800, 600) }, 1)).rejects.toThrow(/2:1/);
    expect(await T.adicionarTour({ slug: 'bom-jardims', titulo: 'Portal', base64: await img(6000, 3000) }, 1)).toMatchObject({ largura: 4096 });
    await T.adicionarTour({ slug: 'bom-jardims', loteCodigo: 'a05', titulo: 'Frente da A05', base64: await img(2000, 1000) }, 1);
    const l = await T.toursDe('bom-jardims', 'A05');
    expect(l.map(t => [t.titulo, t.loteCodigo])).toEqual([['Frente da A05', 'A05'], ['Portal', null]]);
    expect((await T.toursDe('bom-jardims', 'B07')).map(t => t.titulo)).toEqual(['Portal']);
    await T.excluirTour(l[0].id);
    expect((await T.toursDe('bom-jardims', 'A05')).length).toBe(1);
  });
});
