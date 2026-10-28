import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const E = await import('./exclusao');
const R = await import('./recrutamento/servico');
const { hashPassword } = await import('./auth-security');
const { eq } = await import('drizzle-orm');

const SENHA = 'senha-do-admin-123';
const admin = { id: 0, name: 'José', role: 'admin' };
const secretaria = { id: 0, name: 'Secretária', role: 'user', perfil: 'secretario' };
let db: any;
const idDe = (r: any) => Number(r?.[0]?.insertId ?? r?.lastInsertRowid);
const novoUsuario = async (v: Record<string, unknown>) => idDe(await db.insert(S.users).values({ openId: `u:${Math.random()}`, ...v } as any));
const auditoria = async (acao: string) => (await db.select().from(S.financeiroAuditoria).where(eq(S.financeiroAuditoria.acao, acao)));

beforeAll(async () => {
  db = await getDb();
  admin.id = await novoUsuario({ name: 'José', role: 'admin', passwordScrypt: await hashPassword(SENHA) });
  secretaria.id = await novoUsuario({ name: 'Secretária', perfil: 'secretario', passwordScrypt: await hashPassword(SENHA) });
});

describe('convites de recrutamento', () => {
  it('mesmo WhatsApp não duplica: o convite cancelado volta a valer em vez de criar outro', async () => {
    const a = await R.criarConvite({ perfil: 'corretor', nome: 'Paulim', telefone: '(99) 98111-2222' }, admin.id);
    await R.recusarRecrutamento(a.id, '', admin.id, true);
    const b = await R.criarConvite({ perfil: 'corretor', nome: 'Paulim Silva', telefone: '99 9 8111-2222' }, admin.id);
    expect(b).toMatchObject({ id: a.id, reaproveitado: true });
    const lista = (await R.listarRecrutamentos()).filter(r => r.id === a.id);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ status: 'convidado', nome: 'Paulim Silva', duplicado: false });
  });

  it('excluir: só o administrador, com a senha certa; some do banco e fica na auditoria', async () => {
    const { id } = await R.criarConvite({ perfil: 'corretor', nome: 'Fulano', telefone: '(99) 98333-4444' }, admin.id);
    await expect(E.excluirRecrutamento(id, secretaria, SENHA)).rejects.toMatchObject({ codigo: 'SO_ADMIN' });
    await expect(E.excluirRecrutamento(id, admin, 'errada')).rejects.toMatchObject({ codigo: 'SENHA' });
    await E.excluirRecrutamento(id, admin, SENHA);
    expect(await db.select().from(S.recrutamentos).where(eq(S.recrutamentos.id, id))).toHaveLength(0);
    expect((await auditoria('exclusao.convite')).length).toBe(1);
  });
});

describe('leads', () => {
  it('excluir apaga o lead e a conversa, com auditoria', async () => {
    const id = idDe(await db.insert(S.leadQualifications).values({ phone: '5599988887777', nome: 'Lead da corretora', stage: 'descartado' } as any));
    await db.insert(S.leadMensagens).values({ leadId: id, direcao: 'in', autor: 'lead', texto: 'oi' } as any);
    await E.excluirLead(id, admin, SENHA);
    expect(await db.select().from(S.leadQualifications).where(eq(S.leadQualifications.id, id))).toHaveLength(0);
    expect(await db.select().from(S.leadMensagens).where(eq(S.leadMensagens.leadId, id))).toHaveLength(0);
    expect((await auditoria('exclusao.lead')).length).toBe(1);
  });
});

describe('usuários', () => {
  it('ativo não sai; desativado sem vínculo é apagado; com lead sob responsabilidade é arquivado', async () => {
    const livre = await novoUsuario({ name: 'Sem histórico', perfil: 'corretor', ativo: 1 });
    await expect(E.removerUsuario(livre, admin, SENHA)).rejects.toMatchObject({ codigo: 'ATIVO' });
    await db.update(S.users).set({ ativo: 0 } as any).where(eq(S.users.id, livre));
    expect(await E.removerUsuario(livre, admin, SENHA)).toMatchObject({ modo: 'excluido' });
    expect(await db.select().from(S.users).where(eq(S.users.id, livre))).toHaveLength(0);

    const comLead = await novoUsuario({ name: 'Alan', perfil: 'corretor', ativo: 0 });
    await db.insert(S.leadQualifications).values({ phone: '5599911110000', nome: 'Cliente do Alan', responsavelId: comLead } as any);
    const r = await E.removerUsuario(comLead, admin, SENHA);
    expect(r).toEqual({ modo: 'arquivado', vinculos: ['leads'] });
    const [u]: any[] = await db.select().from(S.users).where(eq(S.users.id, comLead));
    expect(u.arquivadoEm).toBeTruthy();
    await expect(E.removerUsuario(admin.id, admin, SENHA)).rejects.toMatchObject({ codigo: 'ADMIN' });
  });
});
