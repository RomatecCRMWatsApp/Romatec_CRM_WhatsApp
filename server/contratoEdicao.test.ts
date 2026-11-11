import { beforeAll, describe, expect, it } from 'vitest';

// Editar e excluir contrato: só o administrador, com a senha; excluir só sem dinheiro envolvido
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./contratos/servico');
const E = await import('./contratos/edicao');
const { hashPassword } = await import('./auth-security');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const comprador = { nome: 'Cliente de Teste', cpf: '529.982.247-25', estadoCivil: 'solteiro', telefone1: '(99) 9 9123-4567', logradouro: 'Rua A', numero: '10', cidade: 'Açailândia', uf: 'MA', sexo: 'M' };
const real = { nome: 'Maria Ficticia de Teste', cpf: '111.444.777-35', estadoCivil: 'solteiro', telefone1: '(99) 9 9888-7766', logradouro: 'Rua B', numero: '20', cidade: 'Açailândia', uf: 'MA', sexo: 'F' };
const plano = { modalidade: 'financiado' as const, entradaParcelas: 6, prazo: 120, dataPrimeiroPagamento: '2026-12-10' };
const admin = { id: 1, name: 'José Romário', role: 'admin' };
const SENHA = 'senha-do-admin-123';

let db: any;
beforeAll(async () => {
  db = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci) VALUES (1, 'u1', 'José Romário', 'admin', '4705')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, creci) VALUES (2, 'u2', 'Corretor', 'user', 'corretor', '9999')`);
  db.run(sql`UPDATE users SET password_hash = ${await hashPassword(SENHA)} WHERE id = 1`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Bom Jardims', 'Açailândia', 'MA')`);
  for (const [cod, e] of [['D16', 236000], ['D17', 236055]] as const) db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, ${cod}, 'D', 16, '3025.11', '220.01', 'disponivel', ${q(e, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{"vend_nome":"MARIA"}')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
});
const lote = async (c: string) => (await db.select().from(schema.lotes)).find((l: any) => l.codigo === c);

describe('editar e excluir contrato (administrador)', () => {
  it('troca o comprador de teste pelo cliente real; senha errada é recusada; a chácara acompanha', async () => {
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'D16', corretorUserId: 1, plano, comprador }, 1);
    await expect(E.editarContratoAdmin(r.id, admin, 'errada', { comprador: real })).rejects.toThrow(/Senha incorreta/);
    const x = await E.editarContratoAdmin(r.id, admin, SENHA, { comprador: real, corretorUserId: 2, condicoesEspecificas: 'Entrega das chaves em março.', plano: { ...plano, modalidade: 'avista' } });
    expect(x.campos).toEqual(expect.arrayContaining(['comprador', 'corretor', 'condições específicas', 'plano de pagamento']));
    const { comprador: comp } = await S.pessoasDe(r.id);
    expect(comp.nome).toBe('Maria Ficticia de Teste');
    const c = await S.contratoPorId(r.id);
    expect(c.corretorUserId).toBe(2);
    const p = typeof c.simulacaoJson === 'string' ? JSON.parse(c.simulacaoJson) : c.simulacaoJson;
    expect(p.modalidade).toBe('avista');
    expect(await lote('D16')).toMatchObject({ clienteNome: 'Maria Ficticia de Teste', corretorId: 2, numParcelas: 1 });
  });

  it('exclui contrato sem dinheiro (chácara volta a disponível); com boleto emitido recusa e indica Cancelar', async () => {
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'D17', corretorUserId: 1, plano, comprador }, 1);
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, asaasPaymentId) VALUES (${r.id}, 'entrada', 1, 6, '2026-12-10', '8000', 'emitida', 'pay_123')`);
    expect((await E.edicaoPermitida(r.id)).excluir).toBe(false);
    await expect(E.excluirContratoAdmin(r.id, admin, SENHA, 'teste')).rejects.toMatchObject({ status: 409 });
    db.run(sql`DELETE FROM cobrancas WHERE contratoId = ${r.id}`);
    const x = await E.excluirContratoAdmin(r.id, admin, SENHA, 'contrato de teste');
    expect(x.loteLiberado).toBe(true);
    await expect(S.contratoPorId(r.id)).rejects.toMatchObject({ status: 404 });
    expect(await lote('D17')).toMatchObject({ situacao: 'disponivel', contratoReservaId: null, clienteNome: null });
  });
});
