import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const V = await import('./imoveis/videos');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Dados fictícios: imóvel 1 com vídeo no cadastro + 2 vídeos liberados e 1 bloqueado em Materiais
beforeAll(async () => {
  const db: any = await getDb();
  db.run(sql`INSERT INTO materiais (id, propertyId, titulo, tipo, url, mime, liberado, ordem) VALUES (1, 1, 'Revisão privada', 'video', 'https://res.cloudinary.test/video/upload/a.mp4', 'video/mp4', 1, 0)`);
  db.run(sql`INSERT INTO materiais (id, propertyId, titulo, tipo, url, mime, liberado, ordem) VALUES (2, 1, 'Carrossel', 'video', 'https://res.cloudinary.test/video/upload/b.mp4', 'video/mp4', 1, 1)`);
  db.run(sql`INSERT INTO materiais (id, propertyId, titulo, tipo, url, mime, liberado, ordem) VALUES (3, 1, 'Bruto', 'video', 'https://res.cloudinary.test/video/upload/c.mp4', 'video/mp4', 0, 2)`);
  db.run(sql`INSERT INTO materiais (id, propertyId, titulo, tipo, url, mime, liberado, ordem) VALUES (4, 1, 'Foto fachada', 'feed', 'https://res.cloudinary.test/image/upload/f.jpg', 'image/jpeg', 1, 0)`);
});

describe('vídeos do imóvel', () => {
  it('junta o do cadastro com os liberados de Materiais, sem bloqueados, fotos ou repetidos', async () => {
    const [r] = await V.comVideos([{ id: 1, videoUrl: 'https://res.cloudinary.test/video/upload/a.mp4' }, { id: 2, videoUrl: null }]);
    expect(r.videos).toEqual(['https://res.cloudinary.test/video/upload/a.mp4', 'https://res.cloudinary.test/video/upload/b.mp4']);
    const [, sem] = await V.comVideos([{ id: 1, videoUrl: null }, { id: 2, videoUrl: null }]);
    expect(sem.videos).toEqual([]);
  });
  it('reconhece vídeo pelo tipo, mime ou extensão', () => {
    expect(V.ehVideo({ tipo: 'video', url: 'https://x/y' })).toBe(true);
    expect(V.ehVideo({ mime: 'video/quicktime', url: 'https://x/y' })).toBe(true);
    expect(V.ehVideo({ url: 'https://x/y.MP4?x=1' })).toBe(true);
    expect(V.ehVideo({ tipo: 'feed', mime: 'image/jpeg', url: 'https://x/y.jpg' })).toBe(false);
  });
});

describe('texto de divulgação do imóvel', async () => {
  const { textoDivulgacaoImovel } = await import('../shared/anuncioImovel');
  const { CARTAO_PADRAO } = await import('../shared/cartaoVendas');
  it('ficha + vídeos + link + pedido de compartilhar + assinatura completa', () => {
    const t = textoDivulgacaoImovel({ id: 1, denomination: 'ALACIDE', codigo: 'IMV-0001', city: 'Açailândia', state: 'MA', price: 380000, offerPrice: 350000, bedrooms: 3 } as any,
      'https://romateccrm.com/i/IMV-0001?utm_source=whatsapp&c=abc123def', CARTAO_PADRAO, 2);
    expect(t).toContain('🏡 *ALACIDE* (IMV-0001)');
    expect(t).toContain('🎥 2 vídeos do imóvel no link');
    expect(t).toContain('👉 Fotos, vídeos e detalhes: https://romateccrm.com/i/IMV-0001?utm_source=whatsapp&c=abc123def');
    expect(t).toContain('📸 Siga no Instagram: https://www.instagram.com/avalieimob');
    expect(t).toContain('compartilhe este link com seus familiares e amigos');
    expect(t).toContain('CRECI/MA F-4.705');
    expect(t).toContain('Romatec Consultoria Total');
  });
});
