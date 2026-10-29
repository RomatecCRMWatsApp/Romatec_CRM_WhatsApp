import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const zap: [string, string][] = [];
vi.mock('./leads/zapiClient', () => ({ enviarTexto: async (t: string, m: string) => { zap.push([t, m]); return 'id'; } }));

const C = await import('./caixaEntrada');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const AGORA = Date.parse('2026-10-29T15:00:00Z');
const todos = <T,>(l: T[]) => l;
const ve = () => true;
const corpo = (mid: string, texto: string, eco = false, ts = AGORA - 60_000) => ({
  object: 'instagram', entry: [{ id: 'PAGE', time: ts, messaging: [{ sender: { id: eco ? 'PAGE' : '1789' }, recipient: { id: eco ? '1789' : 'PAGE' }, timestamp: ts, message: { mid, text: texto, ...(eco ? { is_echo: true } : {}) } }] }],
});

describe('caixa de entrada', () => {
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'u1', 'José', 'admin')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, responsavelId) VALUES (7, '5599911112222', 'Carlos WhatsApp', 1)`);
    const t = (ms: number) => new Date(ms).toISOString().slice(0, -1).replace('T', ' ');
    db.run(sql`INSERT INTO leadMensagens (leadId, direcao, autor, texto, createdAt) VALUES (7, 'in', 'lead', 'Oi, quero saber da chácara', ${t(AGORA - 3_600_000)})`);
  });

  it('Instagram: grava a conversa, não duplica o reenvio da Meta e guarda o eco como "out"', async () => {
    const perfil = async () => ({ nome: 'Ana Insta', username: 'ana.insta' });
    expect(C.mensagensDoWebhook({ object: 'page', entry: [] })).toEqual([]);
    expect(await C.receberInstagram(corpo('m1', 'Oi! Tem chácara?'), { perfil, agora: AGORA })).toBe(1);
    expect(await C.receberInstagram(corpo('m1', 'Oi! Tem chácara?'), { perfil, agora: AGORA })).toBe(0);
    expect(await C.receberInstagram(corpo('m2', 'Temos sim', true, AGORA - 30_000), { perfil, agora: AGORA })).toBe(1);
    const [c] = db.all(sql`SELECT nome, username FROM igConversas`);
    expect(c).toMatchObject({ nome: 'Ana Insta', username: 'ana.insta' });
  });

  it('lista WhatsApp e Instagram juntos, mais recente primeiro', async () => {
    const l = await C.listarConversas('admin', 1, todos, AGORA);
    expect(l.map(x => [x.canal, x.nome, x.aguardando])).toEqual([['instagram', 'Ana Insta', false], ['whatsapp', 'Carlos WhatsApp', true]]);
    const ms = await C.mensagensDa('instagram', l[0].id, 'admin', 1, ve);
    expect(ms.map(m => m.direcao)).toEqual(['in', 'out']);
    expect(await C.listarConversas('corretor', 9, () => [], AGORA)).toEqual([]); // corretor sem conversas dele
  });

  it('responde no WhatsApp (assume a conversa) e no Instagram só dentro de 24 h', async () => {
    await C.responder('whatsapp', 7, 'Olá Carlos!', { id: 1, perfil: 'admin' }, ve, AGORA);
    expect(zap[0]).toEqual(['5599911112222', 'Olá Carlos!']);
    const [lead] = db.all(sql`SELECT humano FROM leadQualifications WHERE id = 7`);
    expect(lead.humano).toBe(1);
    const enviados: string[] = [];
    C.definirEnvioIg(async (igsid, t) => { enviados.push(`${igsid}:${t}`); return 'mid-out'; });
    const ig = (await C.listarConversas('admin', 1, todos, AGORA)).find(x => x.canal === 'instagram')!;
    await C.responder('instagram', ig.id, 'Me passa seu WhatsApp?', { id: 1, perfil: 'admin' }, ve, AGORA);
    expect(enviados).toEqual(['1789:Me passa seu WhatsApp?']);
    await expect(C.responder('instagram', ig.id, 'oi', { id: 1, perfil: 'admin' }, ve, AGORA + 25 * 3_600_000)).rejects.toThrow(/24 h/);
  });

  it('liga a conversa do Instagram a um lead pelo WhatsApp', async () => {
    const ig = (await C.listarConversas('admin', 1, todos, AGORA)).find(x => x.canal === 'instagram')!;
    await expect(C.vincularInstagram(ig.id, '123', { id: 1, perfil: 'admin' })).rejects.toThrow(/inválido/);
    const r = await C.vincularInstagram(ig.id, '(99) 9 8888-7777', { id: 1, perfil: 'admin' });
    expect(r.leadId).toBeGreaterThan(0);
  });
});
