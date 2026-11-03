import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.APP_PUBLIC_URL = 'https://romateccrm.com';

const { addMateriaisDivulgacaoBJ, VIDEOS_DIVULGACAO_BJ } = await import('./_core/migrations/addMateriaisDivulgacaoBJ');
const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const { videosDaGaleria } = await import('../shared/mapa3dBomJardims');

describe('vídeos de divulgação em Materiais do Bom Jardims', () => {
  it('todo arquivo listado existe no site com o tamanho registrado', () => {
    for (const v of VIDEOS_DIVULGACAO_BJ) {
      const arq = `client/public${v.caminho}`;
      expect(existsSync(arq), arq).toBe(true);
      expect(statSync(arq).size, arq).toBe(v.bytes);
    }
  });
  it('insere uma vez (idempotente) e vinhetas ficam marcadas como "não divulgar"', async () => {
    expect(await addMateriaisDivulgacaoBJ()).toBe(VIDEOS_DIVULGACAO_BJ.length);
    expect(await addMateriaisDivulgacaoBJ()).toBe(0);
    const db: any = await getDb();
    const rows: any[] = await db.select().from(S.materiais);
    expect(rows).toHaveLength(VIDEOS_DIVULGACAO_BJ.length);
    expect(rows.every(r => r.empreendimentoSlug === 'bom-jardims' && r.tipo === 'video' && r.url.startsWith('https://romateccrm.com/bom-jardims/'))).toBe(true);
    expect(rows.filter(r => !r.liberado).map(r => r.titulo).every((t: string) => t.startsWith('Vinheta'))).toBe(true);
  });
  it('não aparecem na galeria da página pública (que não mostra preço)', () => {
    const g = videosDaGaleria(VIDEOS_DIVULGACAO_BJ.map(v => ({ titulo: v.titulo, tipo: 'video', mime: 'video/mp4', url: `https://romateccrm.com${v.caminho}`, liberado: true })));
    expect(g.some(x => /\/bom-jardims\/(ig|vinhetas)\//.test(x.url))).toBe(false);
  });
});
