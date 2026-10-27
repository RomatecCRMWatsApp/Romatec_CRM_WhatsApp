import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const C = await import('./contatosCadastro');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { PESSOA_VAZIA_SERVIDOR } = { PESSOA_VAZIA_SERVIDOR: {
  nome: '', cpf: '', sexo: '', nacionalidade: 'brasileira', estadoCivil: '', regimeBens: '', pactoAntenupcial: '', profissao: '', nascimento: '',
  rg: '', rgOrgao: 'SSP', rgUf: 'MA', email: '', telefone1: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'MA',
} };

let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO contacts (name, phone, status) VALUES ('Zenaide Medeiros', '+5599991274759', 'active')`);
});

describe('Clientes: cadastro completo (mesma ficha do comprador nos contratos)', () => {
  it('sem CPF salva só o contato; com CPF grava a ficha e ela volta ao editar', async () => {
    const r1 = await C.salvarContatoCompleto(null, { ...PESSOA_VAZIA_SERVIDOR, nome: 'Carlos Cliente', telefone1: '(99) 98877-6655', email: 'carlos@exemplo.com' });
    expect(r1.ficha).toBe(false);
    const c1 = await C.cadastroDoContato(r1.id);
    expect(c1.contato).toMatchObject({ name: 'Carlos Cliente', phone: '+5599988776655', email: 'carlos@exemplo.com' });
    expect(c1.pessoa).toBeNull();

    // Editar o contato existente (importado do WhatsApp) com a ficha completa
    const [z] = db.all(sql`SELECT id FROM contacts WHERE phone = '+5599991274759'`);
    const ficha = {
      ...PESSOA_VAZIA_SERVIDOR, nome: 'Zenaide Medeiros da Silva', cpf: '529.982.247-25', telefone1: '(99) 99127-4759', estadoCivil: 'casado', regimeBens: 'comunhao_parcial',
      profissao: 'professora', nascimento: '1980-03-02', rg: '123456', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA', cep: '65930-000',
    };
    const r2 = await C.salvarContatoCompleto(z.id, ficha);
    expect(r2).toEqual({ id: z.id, ficha: true });
    const c2 = await C.cadastroDoContato(z.id);
    expect(c2.contato.name).toBe('Zenaide Medeiros da Silva');
    expect(c2.pessoa).toMatchObject({ cpf: '52998224725', estadoCivil: 'casado', profissao: 'professora', cidade: 'Açailândia', nascimento: '1980-03-02', cep: '65930000' });
    // Mesmo CPF de novo: atualiza a ficha, não duplica
    await C.salvarContatoCompleto(z.id, { ...ficha, profissao: 'diretora' });
    expect(db.all(sql`SELECT COUNT(*) AS n FROM pessoas WHERE cpfCnpj = '52998224725'`)[0].n).toBe(1);
    expect((await C.cadastroDoContato(z.id)).pessoa?.profissao).toBe('diretora');
  });

  it('validação: nome, celular, CPF e telefone já usado por outro contato', async () => {
    await expect(C.salvarContatoCompleto(null, { ...PESSOA_VAZIA_SERVIDOR, nome: '', telefone1: '99988776600' })).rejects.toThrow('Informe o nome');
    await expect(C.salvarContatoCompleto(null, { ...PESSOA_VAZIA_SERVIDOR, nome: 'X', telefone1: '123' })).rejects.toThrow(/Telefone inválido/);
    await expect(C.salvarContatoCompleto(null, { ...PESSOA_VAZIA_SERVIDOR, nome: 'X', telefone1: '99988770000', cpf: '111.111.111-11' })).rejects.toThrow('CPF inválido');
    await expect(C.salvarContatoCompleto(null, { ...PESSOA_VAZIA_SERVIDOR, nome: 'Outro', telefone1: '99 99127-4759' })).rejects.toThrow('Já existe um contato com este telefone');
  });
});

describe('Clientes: quem abre a ficha (CPF/RG), edita e exclui', () => {
  it('corretor só o cliente de um lead dele (pelo telefone); escritório qualquer um; criar novo continua aberto', async () => {
    const { appRouter } = await import('./routers');
    const caller = (user: Record<string, unknown>) => appRouter.createCaller({ user: { ativo: true, role: 'user', ...user }, req: { headers: {} } as any, res: {} as any } as any);
    const [z] = db.all(sql`SELECT id FROM contacts WHERE phone = '+5599991274759'`);
    db.run(sql`INSERT INTO leadQualifications (phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES ('99991274759', 'Zenaide', 'novo_lead', 'frio', 21, ${Date.now()}, ${Date.now()})`);
    const dono = caller({ id: 21, perfil: 'corretor' });
    const outro = caller({ id: 22, perfil: 'corretor' });

    await expect(outro.contacts.cadastro({ id: z.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(outro.contacts.getById({ id: z.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(outro.contacts.update({ id: z.id, name: 'Trocado' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(outro.contacts.delete({ id: z.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(outro.contacts.salvarCompleto({ id: z.id, pessoa: { ...PESSOA_VAZIA_SERVIDOR, nome: 'Trocado', telefone1: '99991274759' } as any })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect((await dono.contacts.cadastro({ id: z.id })).contato.id).toBe(z.id);
    expect((await caller({ id: 30, perfil: 'secretario' }).contacts.cadastro({ id: z.id })).contato.id).toBe(z.id);
    const novo = await outro.contacts.salvarCompleto({ id: null, pessoa: { ...PESSOA_VAZIA_SERVIDOR, nome: 'Cliente Novo', telefone1: '(99) 98111-2233' } as any });
    expect(novo.id).toBeGreaterThan(0);
  });
});
