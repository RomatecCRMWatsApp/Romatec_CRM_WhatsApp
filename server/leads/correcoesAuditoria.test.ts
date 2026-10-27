import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const enviados: string[] = [];
vi.mock('./zapiClient', () => ({ enviarTexto: vi.fn(async (fone: string) => { enviados.push(fone); }) }));
vi.mock('./notificacao', async orig => ({ ...(await orig<typeof import('./notificacao')>()), enviarTelegram: vi.fn(async () => {}) }));

const { getDb } = await import('../db');
const S = await import('../../drizzle/schema');
const { mensagemNova } = await import('./inbound');
const { getNextContact } = await import('../scheduler/contactManager');
const { processarSla } = await import('./sla');
const { eq } = await import('drizzle-orm');

let db: any;
beforeAll(async () => { db = await getDb(); });

describe('Z-API reenvia a mesma mensagem: o robô responde uma vez só', () => {
  it('o messageId fica no banco; a segunda chegada é recusada', async () => {
    expect(await mensagemNova('3EB0ABC')).toBe(true);
    expect(await mensagemNova('3EB0ABC')).toBe(false);
    expect(await mensagemNova('3EB0XYZ')).toBe(true);
    expect(await mensagemNova(null)).toBe(true); // sem id: segue como antes
  });
});

describe('Campanha não manda para quem pediu para sair', () => {
  it('lead com bloqueio em vigor (descadastro) é pulado no disparo', async () => {
    await db.insert(S.contacts).values([
      { name: 'Saiu', phone: '+5599981110001', status: 'active' },
      { name: 'Segue', phone: '+5599981110002', status: 'active' },
    ]);
    const cs: any[] = await db.select().from(S.contacts);
    const saiu = cs.find(c => c.name === 'Saiu');
    const segue = cs.find(c => c.name === 'Segue');
    await db.insert(S.leadQualifications).values({ phone: '5599981110001', nome: 'Saiu', blockedUntil: new Date(Date.now() + 30 * 24 * 3600_000) } as any);
    await db.insert(S.campaignContacts).values({ campaignId: 77, contactId: saiu.id, messagesSent: 0, status: 'pending' });
    expect(await getNextContact(77)).toBeNull();
    await db.insert(S.campaignContacts).values({ campaignId: 77, contactId: segue.id, messagesSent: 0, status: 'pending' });
    expect((await getNextContact(77))?.id).toBe(segue.id);
  });
});

describe('Alerta de lead sem atendimento', () => {
  it('60 leads esquecidos que já tiveram os 3 alertas não impedem o alerta do lead novo', async () => {
    const agora = Date.UTC(2026, 9, 28, 15, 0); // 12h em Fortaleza
    await db.insert(S.users).values({ openId: 'adm-sla', name: 'Admin', role: 'admin', telefone: '99988887777' } as any);
    const antigos = Array.from({ length: 60 }, (_, i) => ({
      phone: `55999700${String(i).padStart(4, '0')}`, nome: `Antigo ${i}`, alertaSlaNivel: 3,
      aguardandoCorretorDesde: new Date(agora - 5 * 24 * 3600_000 + i * 60_000),
    }));
    await db.insert(S.leadQualifications).values(antigos as any);
    await db.insert(S.leadQualifications).values({ phone: '5599970099999', nome: 'Novo', aguardandoCorretorDesde: new Date(agora - 10 * 60_000) } as any);
    await processarSla(agora);
    const [novo] = await db.select().from(S.leadQualifications).where(eq(S.leadQualifications.phone, '5599970099999'));
    expect(Number(novo.alertaSlaNivel)).toBe(1);
    expect(enviados.length).toBeGreaterThan(0);
  });
});
