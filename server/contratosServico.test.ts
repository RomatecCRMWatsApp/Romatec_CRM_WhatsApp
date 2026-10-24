import { beforeAll, describe, expect, it } from 'vitest';

// Banco local em memória (SQLite) com as mesmas tabelas da produção
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./contratos/servico');
const { acoesDaParcela, cpfValido, pendenciasComprador, exigePacto } = await import('../shared/contratos');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql, eq } = await import('drizzle-orm');

const comprador = {
  nome: 'Fulano de Tal', cpf: '529.982.247-25', estadoCivil: 'casado', regimeBens: 'comunhao_parcial', telefone1: '(99) 9 9123-4567',
  logradouro: 'Rua A', numero: '10', cidade: 'Açailândia', uf: 'MA', sexo: 'M',
};
const conjuge = { nome: 'Beltrana de Tal', cpf: '111.444.777-35', sexo: 'F' };
const plano = { modalidade: 'financiado' as const, entradaParcelas: 6, prazo: 120, dataPrimeiroPagamento: '2026-12-10' };

let db: any;
beforeAll(async () => {
  db = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci) VALUES (1, 'u1', 'José Romário', 'admin', '4705')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, creci) VALUES (2, 'u2', 'Corretor Parceiro', 'user', 'corretor', '9999')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'A01', 'A', 1, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'A02', 'A', 2, '3025.11', '220.01', 'disponivel', ${q(236055, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{"emp_nome":"Condomínio de Chácaras Bom Jardims"}', '{"vend_nome":"VALMA"}')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
});

const lote = async (codigo: string) => (await db.select().from(schema.lotes)).find((l: any) => l.codigo === codigo);

describe('contrato: criação, reserva e numeração', () => {
  it('cria com número BJ-AAAA-0001, plano recalculado no servidor (R$ 196.141,20) e reserva a chácara', async () => {
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01', corretorUserId: 1, plano, comprador, conjuge }, 1);
    expect(r.numero).toBe(`BJ-${new Date().getFullYear()}-0001`);
    const c = await S.contratoPorId(r.id);
    expect(c.status).toBe('rascunho');
    const p = typeof c.simulacaoJson === 'string' ? JSON.parse(c.simulacaoJson) : c.simulacaoJson;
    expect(p.total_pagar).toBe(196141.2);
    const l = await lote('A01');
    expect(l).toMatchObject({ situacao: 'reservado', status: 'reservado', contratoReservaId: r.id, clienteNome: 'Fulano de Tal' });
    const { comprador: comp, conjuge: conj } = await S.pessoasDe(r.id);
    expect(comp.cpfCnpj).toBe('52998224725');
    expect(conj.nome).toBe('Beltrana de Tal');
  });

  it('a mesma chácara não entra em dois contratos; o número segue a sequência', async () => {
    await expect(S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01', corretorUserId: 1, plano, comprador, conjuge }, 1))
      .rejects.toMatchObject({ codigo: 'LOTE_INDISPONIVEL', status: 409 });
    const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'A02', corretorUserId: 2, plano: { ...plano, modalidade: 'avista' }, comprador: { ...comprador, estadoCivil: 'solteiro' } }, 1);
    expect(r.numero.endsWith('-0002')).toBe(true);
  });

  it('comprador casado sem cônjuge: recusa com os campos que faltam', async () => {
    await expect(S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'A02', corretorUserId: 1, plano, comprador, conjuge: null }, 1))
      .rejects.toMatchObject({ codigo: 'CAMPOS', campos: expect.objectContaining({ 'conjuge.nome': expect.any(String) }) });
  });
});

describe('contrato: contexto, gate, ativação e cancelamento', () => {
  it('monta o contexto do banco: memorial da geometria, corretor responsável e parceiro; definitivo bloqueado sem registro', async () => {
    const { entrada, unidade } = await S.entradaDoContrato(2);
    expect(unidade.memorial.vertices).toHaveLength(4);
    expect(unidade.memorial.vertices.some(v => /Lote 01 da Quadra A/.test(v.confronta))).toBe(true);
    expect(entrada.corretor.creci).toBe('4.705');
    expect(entrada.parceiro?.creci).toBe('9.999'); // contrato 2 é do corretor parceiro
    const g = await S.gateDoContrato(1);
    expect(g.minuta.ok).toBe(true);
    expect(g.definitivo.ok).toBe(false);
    expect(g.definitivo.bloqueios.join()).toMatch(/Parcelamento não registrado/);
  });

  it('ativação só depois do definitivo; ativo marca a chácara vendida e grava as 126 parcelas previstas', async () => {
    await expect(S.registrarAssinado(1, null, 1)).rejects.toMatchObject({ codigo: 'STATUS' });
    await db.update(schema.contratos).set({ status: 'apto_assinatura' }).where(eq(schema.contratos.id, 1));
    await expect(S.registrarAssinado(1, Buffer.from('não é pdf'), 1)).rejects.toMatchObject({ codigo: 'PDF' });
    const r = await S.registrarAssinado(1, Buffer.from('%PDF-1.7 assinado'), 1);
    expect(r.cobrancas).toBe(126);
    expect((await S.contratoPorId(1)).status).toBe('ativo');
    expect((await lote('A01')).situacao).toBe('vendido_parcelado');
    await expect(S.cancelarContrato(1, 1, 'teste')).rejects.toMatchObject({ codigo: 'STATUS' });
  });

  it('cancelar contrato em andamento libera a chácara', async () => {
    await S.cancelarContrato(2, 1, 'desistência antes da assinatura');
    expect((await S.contratoPorId(2)).status).toBe('cancelado');
    expect(await lote('A02')).toMatchObject({ situacao: 'disponivel', contratoReservaId: null, clienteNome: null });
    const lista = await S.listarContratos({ corretorUserId: 2 });
    expect(lista.map(c => c.id)).toEqual([2]);
  });
});

describe('regras da tela', () => {
  it('CPF, cônjuge e pacto', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(exigePacto('casado', 'separacao_total')).toBe(true);
    expect(exigePacto('casado', 'comunhao_parcial')).toBe(false);
    expect(Object.keys(pendenciasComprador({ ...comprador, estadoCivil: 'casado', regimeBens: 'separacao_total' } as any, conjuge as any))).toContain('comprador.pactoAntenupcial');
  });

  it('ações da parcela: boleto até vencer, 2ª via até 59 dias, depois negociação; recibo só paga', () => {
    const base = { asaas: true, recibo: false };
    expect(acoesDaParcela({ ...base, status: 'emitida', vencimento: '2027-07-10' }, '2027-07-01')).toMatchObject({ boleto: true, segundaVia: false });
    expect(acoesDaParcela({ ...base, status: 'vencida', vencimento: '2027-07-10' }, '2027-08-20')).toMatchObject({ boleto: false, segundaVia: true, atraso: 41 });
    expect(acoesDaParcela({ ...base, status: 'vencida', vencimento: '2027-07-10' }, '2027-09-10')).toMatchObject({ segundaVia: false, negociacao: true });
    expect(acoesDaParcela({ ...base, status: 'paga', vencimento: '2027-07-10', recibo: true }, '2027-09-10')).toMatchObject({ recibo: true, negociacao: false });
    expect(acoesDaParcela({ ...base, asaas: false, status: 'prevista', vencimento: '2027-07-10' }, '2027-07-01')).toMatchObject({ boleto: false });
  });
});
