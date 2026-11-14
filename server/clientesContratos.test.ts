import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./clientes/sincronizar');
const A = await import('./assinatura/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Pessoas dos contratos → lista de Clientes; correção do número de quem ainda não assinou. Dados fictícios.
let db: any;
const enviados: { tel: string; msg: string }[] = [];

beforeAll(async () => {
  db = await getDb();
  A.definirEnviador(async (tel: string, msg: string) => { enviados.push({ tel, msg }); });
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'teste', 'Teste')`);
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, status, simulacaoJson, dadosJson, codigoVerificacao) VALUES (5, 'TS-2026-0005', 1, 0, 'A01', 1, 'em_assinatura', '{}', '{}', 'c5')`);
  db.run(sql`INSERT INTO pessoas (id, tipo, nome, cpfCnpj, telefone1, email) VALUES (1, 'PF', 'Paulo Comprador Ficticio', '52998224725', '(55) 9 9919-1235', 'paulo@exemplo.com'), (2, 'PF', 'Rita Conjuge Ficticia', '39053344705', '(99) 9 9213-8719', NULL)`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (5, 1, 'comprador'), (5, 2, 'conjuge')`);
  db.run(sql`INSERT INTO contacts (name, phone, status) VALUES ('Ritinha 🌸', '+5599992138719', 'active'), ('Outro Contato', '+5599991110000', 'active')`);
  db.run(sql`INSERT INTO assinaturaSignatarios (id, contratoId, papel, nome, cpf, whatsapp, metodo, ordem, status, token) VALUES
    (10, 5, 'comprador', 'Paulo Comprador Ficticio', '52998224725', '5555999191235', 'avancada', 1, 'convidado', ${'a'.repeat(43)}),
    (11, 5, 'conjuge', 'Rita Conjuge Ficticia', '39053344705', '5599992138719', 'avancada', 2, 'assinado', ${'b'.repeat(43)})`);
  db.run(sql`INSERT INTO assinaturaOtp (signatarioId, codigoHash, expiraEm) VALUES (10, ${'0'.repeat(64)}, '2099-01-01 00:00:00')`);
});

const contato = (fim: string) => db.all(sql`SELECT * FROM contacts`).find((c: any) => String(c.phone).endsWith(fim));

describe('pessoas dos contratos na lista de Clientes', () => {
  it('regra: casa pelo telefone; contato existente fica com o nome do cadastro', () => {
    const m = new Map([['99992138719', { id: 1, name: 'Ritinha', phone: '+5599992138719', email: null }]]);
    expect(S.planoDoCliente({ nome: 'Rita Conjuge Ficticia', telefone1: '(99) 9 9213-8719' }, m)).toEqual({ tipo: 'atualizar', id: 1, dados: { name: 'Rita Conjuge Ficticia' } });
    expect(S.planoDoCliente({ nome: 'Novo Cliente', telefone1: '99 98888-7777' }, m)).toMatchObject({ tipo: 'inserir', dados: { phone: '+5599988887777' } });
    expect(S.planoDoCliente({ nome: 'Sem Telefone', telefone1: '' }, m)).toEqual({ tipo: 'nada' });
  });

  it('migração: comprador entra, cônjuge atualiza o contato que já existia; rodar de novo não duplica', async () => {
    expect(await S.sincronizarTodosClientes()).toEqual({ inseridos: 1, atualizados: 1 });
    expect(contato('55999191235')).toMatchObject({ name: 'Paulo Comprador Ficticio', email: 'paulo@exemplo.com' });
    expect(contato('99992138719').name).toBe('Rita Conjuge Ficticia');
    expect(await S.sincronizarTodosClientes()).toEqual({ inseridos: 0, atualizados: 0 });
  });
});

describe('corrigir o número de quem ainda não assinou', () => {
  it('grava no signatário e no cadastro, anula o código, reenvia o convite e registra na trilha', async () => {
    const r = await A.corrigirTelefoneSignatario(5, 10, '(99) 9 8765-4321', 1);
    expect(r).toMatchObject({ enviado: true, cadastro: true });
    expect(db.all(sql`SELECT whatsapp FROM assinaturaSignatarios WHERE id = 10`)[0].whatsapp).toBe('5599987654321');
    expect(db.all(sql`SELECT telefone1 FROM pessoas WHERE id = 1`)[0].telefone1).toBe('(99) 9 8765-4321');
    expect(db.all(sql`SELECT * FROM assinaturaOtp WHERE signatarioId = 10`)).toHaveLength(0);
    expect(enviados.at(-1)?.tel).toBe('5599987654321');
    const ev = db.all(sql`SELECT * FROM assinaturaEventos WHERE signatarioId = 10 AND evento = 'telefone_corrigido'`);
    expect(ev).toHaveLength(1);
    await new Promise(res => setTimeout(res, 50));
    expect(contato('99987654321')?.name).toBe('Paulo Comprador Ficticio');
  });

  it('quem já assinou e número inválido são recusados', async () => {
    await expect(A.corrigirTelefoneSignatario(5, 11, '(99) 9 8765-4321', 1)).rejects.toThrow(/já assinou/);
    await expect(A.corrigirTelefoneSignatario(5, 10, '123', 1)).rejects.toThrow(/Telefone inválido/);
  });
});
