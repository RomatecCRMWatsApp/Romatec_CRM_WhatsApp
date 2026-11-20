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

describe('mudar o plano depois do boleto da entrada emitido (antes de todos assinarem)', () => {
  const chamadas: string[] = [];
  const fetchOriginal = globalThis.fetch;
  beforeAll(() => {
    const q = (e: number) => JSON.stringify([[e, 9455000], [e + 55, 9455000], [e + 55, 9454945], [e, 9454945]]);
    for (const [cod, e] of [['C10', 237000], ['C11', 237100], ['C13', 237200]] as const) db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, ${cod}, 'C', 10, '3143.41', '220.01', 'disponivel', ${q(e)})`);
    process.env.ASAAS_API_KEY_BOM_JARDIMS = 'aact_teste_local';
    process.env.ASAAS_BASE_URL = 'http://asaas.teste';
    // Asaas simulado (nenhuma cobrança real): pay_ok cancela; pay_pago é recusado como no Asaas
    globalThis.fetch = (async (url: any, init: any) => {
      chamadas.push(`${init?.method} ${String(url)}`);
      if (String(url).endsWith('/payments/pay_pago')) return new Response(JSON.stringify({ errors: [{ description: 'Cobrança já recebida não pode ser removida' }] }), { status: 400 });
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    }) as any;
  });
  const planoC = { modalidade: 'financiado' as const, entradaParcelas: 1, prazo: 120, dataPrimeiroPagamento: '2026-11-24', condicao: 'C' as const };
  const planoB = { modalidade: 'financiado' as const, entradaParcelas: 1, prazo: 180, dataPrimeiroPagamento: '2026-11-24', condicao: 'B' as const, inicioParcelas: '2027-01-05' };
  const emAssinatura = (id: number, asaas: string, status = 'emitida') => {
    db.run(sql`UPDATE contratos SET status = 'em_assinatura' WHERE id = ${id}`);
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, asaasPaymentId) VALUES (${id}, 'entrada', 1, 1, '2026-11-24', '10000', ${status}, ${asaas})`);
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${id}, 'saldo', 1, 120, '2026-12-24', '1282.79', 'prevista')`);
  };

  it('Plano C → Plano B: cancela o boleto da entrada no Asaas, apaga as linhas antigas, volta a rascunho e grava o aviso', async () => {
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'C10', corretorUserId: 1, plano: planoC, comprador }, 1);
    emAssinatura(r.id, 'pay_ok');
    const pode = await E.edicaoPermitida(r.id);
    expect(pode.plano).toBe(true);
    expect(pode.boletosACancelar).toBe(1);
    const x = await E.editarContratoAdmin(r.id, admin, SENHA, { plano: planoB });
    expect(x.campos).toContain('plano de pagamento');
    expect(x.voltouRascunho).toBe(true);
    expect(chamadas).toContain('DELETE http://asaas.teste/payments/pay_ok');
    expect((await db.select().from(schema.cobrancas)).filter((l: any) => l.contratoId === r.id)).toHaveLength(0);
    const c = await S.contratoPorId(r.id);
    expect(c.status).toBe('rascunho');
    const p = typeof c.simulacaoJson === 'string' ? JSON.parse(c.simulacaoJson) : c.simulacaoJson;
    expect(p).toMatchObject({ condicao: 'B', saldo_qtd: 180, entrada_venc1: '2026-11-24', saldo_venc1: '2027-01-05' });
    const dados = typeof c.dadosJson === 'string' ? JSON.parse(c.dadosJson) : c.dadosJson;
    expect(dados.avisoReassinatura.texto).toMatch(/plano de pagamento: de Plano C \(120× de R\$ [\d.,]+\) para Plano B \(180× de R\$ [\d.,]+\)/);
    expect(dados.avisoReassinatura.texto).toContain('1ª parcela: 05/01/2027');
    expect(dados.avisoReassinatura.boletosCancelados).toBe(1);
  });

  it('Asaas recusa o cancelamento (já pago lá): o plano não muda e o motivo aparece', async () => {
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'C11', corretorUserId: 1, plano: planoC, comprador }, 1);
    emAssinatura(r.id, 'pay_pago');
    await expect(E.editarContratoAdmin(r.id, admin, SENHA, { plano: planoB })).rejects.toThrow(/Não consegui cancelar no Asaas/);
    const c = await S.contratoPorId(r.id);
    expect(c.status).toBe('em_assinatura');
    const p = typeof c.simulacaoJson === 'string' ? JSON.parse(c.simulacaoJson) : c.simulacaoJson;
    expect(p.condicao).toBe('C');
  });

  it('com pagamento recebido o plano não muda mais (termo aditivo)', async () => {
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'C13', corretorUserId: 1, plano: planoC, comprador }, 1);
    emAssinatura(r.id, 'pay_x', 'paga');
    expect((await E.edicaoPermitida(r.id)).plano).toBe(false);
    await expect(E.editarContratoAdmin(r.id, admin, SENHA, { plano: planoB })).rejects.toMatchObject({ status: 409 });
    globalThis.fetch = fetchOriginal;
    delete process.env.ASAAS_API_KEY_BOM_JARDIMS;
    delete process.env.ASAAS_BASE_URL;
  });

  it('o aviso só vale para a rodada de assinatura enviada depois da alteração', async () => {
    const { avisoDaRodada } = await import('./assinatura/servico');
    const dadosJson = { avisoReassinatura: { texto: 'plano de pagamento', rodada: '2026-11-21T12:00:00.500Z' } };
    expect(avisoDaRodada({ dadosJson, assinaturaIniciadaEm: new Date('2026-11-21T12:00:00Z') })).toBe('plano de pagamento');
    expect(avisoDaRodada({ dadosJson, assinaturaIniciadaEm: new Date('2026-11-22T09:00:00Z') })).toBeNull();
    expect(avisoDaRodada({ dadosJson: { avisoReassinatura: { texto: 'x' } }, assinaturaIniciadaEm: new Date() })).toBeNull();
  });
});
