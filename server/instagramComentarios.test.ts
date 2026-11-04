import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
vi.mock('./notificacoes', () => ({ notificarMensagemInstagram: async () => {} }));

const C = await import('./instagramComentarios');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const corpo = (id: string, texto: string, de = '555', media = 'M1', extra: Record<string, unknown> = {}) => ({
  object: 'instagram', entry: [{ id: 'CONTA', time: 1, changes: [{ field: 'comments', value: { id, text: texto, from: { id: de, username: 'maria.acai' }, media: { id: media }, ...extra } }] }],
});
const envio = () => {
  const priv: [string, string][] = []; const pub: [string, string][] = [];
  return { priv, pub, e: { privada: async (c: string, t: string) => { priv.push([c, t]); return 'mid'; }, publica: async (c: string, t: string) => { pub.push([c, t]); } } };
};


describe('comentário com palavra-chave → Direct', () => {
  let db: any;
  beforeAll(async () => { db = await getDb(); });

  it('reconhece as palavras sem acento/caixa e ignora comentário comum', () => {
    expect(C.regraPara('Chácara!!')?.nome).toBe('simulacao');
    expect(C.regraPara('quero saber das chacaras')?.nome).toBe('simulacao');
    expect(C.regraPara('Qual a rota?')?.nome).toBe('rota');
    expect(C.regraPara('que derrota')).toBeNull();
    expect(C.regraPara('Lindo demais 😍')).toBeNull();
    expect(C.regraPara('chácara ' + 'x'.repeat(200))).toBeNull();
  });

  it('ignora comentário da própria conta e respostas em conversa', () => {
    expect(C.comentariosDoWebhook(corpo('c0', 'CHÁCARA', 'CONTA'))).toEqual([]);
    expect(C.comentariosDoWebhook(corpo('c0', 'CHÁCARA', '555', 'M1', { parent_id: 'x' }))).toEqual([]);
    expect(C.comentariosDoWebhook({ object: 'page', entry: [] })).toEqual([]);
  });

  it('manda a simulação no Direct com CRECI e SAIR, responde em público e não repete no mesmo post', async () => {
    const { priv, pub, e } = envio();
    expect(await C.responderComentarios(corpo('c1', 'CHÁCARA'), { envio: e, sortear: () => 0 })).toBe(1);
    expect(priv[0][0]).toBe('c1');
    expect(priv[0][1]).toContain('CRECI/MA 4.705');
    expect(priv[0][1]).toContain('formas-de-pagamento');
    expect(priv[0][1]).toContain('SAIR');
    expect(pub[0]).toEqual(['c1', 'Te mandei a simulação no direct! 📩']);
    expect(await C.responderComentarios(corpo('c2', 'quero'), { envio: e })).toBe(0); // mesma pessoa, mesmo post
    expect(await C.responderComentarios(corpo('c3', 'quero', '555', 'M2'), { envio: e })).toBe(1); // outro post
    const [c] = db.all(sql`SELECT username FROM igConversas WHERE igsid = '555'`);
    expect(c.username).toBe('maria.acai');
  });

  it('se o Direct falhar, libera para tentar de novo', async () => {
    const falha = { privada: async () => { throw new Error('sem permissão'); }, publica: async () => {} };
    expect(await C.responderComentarios(corpo('c4', 'CHÁCARA', '777'), { envio: falha })).toBe(0);
    const { e } = envio();
    expect(await C.responderComentarios(corpo('c5', 'CHÁCARA', '777'), { envio: e })).toBe(1);
  });

  it('IG_COMENTARIO_AUTO=off desliga', async () => {
    process.env.IG_COMENTARIO_AUTO = 'off';
    const { e } = envio();
    expect(await C.responderComentarios(corpo('c6', 'CHÁCARA', '888'), { envio: e })).toBe(0);
    delete process.env.IG_COMENTARIO_AUTO;
  });
});
