import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

vi.mock('../notificacoes', () => ({ avisarNovoLead: vi.fn() }));
vi.mock('./notificacao', () => ({ notificarLead: vi.fn(async () => {}), formatarReais: (n: number) => String(n) }));

const { getDb } = await import('../db');
const S = await import('../../drizzle/schema');
const { chaveTelefone, ehNumeroDaEquipe } = await import('./numerosDaEquipe');
const { registrarWhatsappDireto } = await import('./inbound');

beforeAll(async () => {
  const db: any = await getDb();
  await db.insert(S.users).values({ openId: 'corretora-1', name: 'Corretora Teste', perfil: 'equipe', telefone: '(99) 98888-7777' } as any);
  await db.insert(S.corretoresExternos).values({ nome: 'Externo', cpf: '12345678909', telefone: '99 8777-6666' } as any);
});

// O mesmo caminho do webhook (server/_core/index.ts): número da equipe para antes da captação
async function mensagemRecebida(phone: string) {
  if (await ehNumeroDaEquipe(phone)) return false;
  return registrarWhatsappDireto({ phone, nome: 'Fulano', texto: 'Oi, quero saber das chácaras' });
}
const leadsDo = async (phone: string) => {
  const db: any = await getDb();
  const { eq } = await import('drizzle-orm');
  return db.select().from(S.leadQualifications).where(eq(S.leadQualifications.phone, phone));
};

describe('número da equipe não vira lead', () => {
  it('mesma chave com/sem 55, com/sem o 9º dígito, com máscara; fixo pelo DDD + número', () => {
    const k = '5599988887777';
    expect(chaveTelefone('(99) 9 8888-7777')).toBe(k);
    expect(chaveTelefone('99988887777')).toBe(k);
    expect(chaveTelefone('+55 99 8888-7777')).toBe(k);
    expect(chaveTelefone('559935381234')).toBe(chaveTelefone('(99) 3538-1234'));
    expect(chaveTelefone('123')).toBe('');
  });

  it('mensagem de corretora cadastrada (em qualquer formato) e de corretor externo: não gera lead', async () => {
    expect(await mensagemRecebida('5599988887777')).toBe(false);
    expect(await mensagemRecebida('559988887777')).toBe(false);
    expect(await mensagemRecebida('5599987776666')).toBe(false);
    expect(await leadsDo('5599988887777')).toHaveLength(0);
    expect(await leadsDo('559988887777')).toHaveLength(0);
  });

  it('o número da empresa / WhatsApp do CRM também não', async () => {
    expect(await ehNumeroDaEquipe('5599991811246')).toBe(true);
  });

  it('número desconhecido: vira lead normal', async () => {
    expect(await mensagemRecebida('5599911112222')).toBe(true);
    expect(await leadsDo('5599911112222')).toHaveLength(1);
  });

  it('limpeza: lista só os leads antigos que são de número da equipe, dizendo de quem é', async () => {
    const db: any = await getDb();
    await db.insert(S.leadQualifications).values({ phone: '559988887777', nome: 'Lead antigo da corretora' } as any);
    const { leadsDaEquipe } = await import('./numerosDaEquipe');
    const r = await leadsDaEquipe();
    expect(r.map(l => l.phone)).toEqual(['559988887777']);
    expect(r[0].quem).toBe('Usuário: Corretora Teste');
  });
});
