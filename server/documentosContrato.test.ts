import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./contratos/servico');
const D = await import('./contratos/documentosContrato');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const comprador = {
  nome: 'Fulano de Tal', cpf: '529.982.247-25', estadoCivil: 'casado', regimeBens: 'comunhao_parcial', telefone1: '(99) 9 9123-4567',
  logradouro: 'Rua A', numero: '10', cidade: 'Açailândia', uf: 'MA', sexo: 'M',
};
const conjuge = { nome: 'Beltrana de Tal', cpf: '111.444.777-35', sexo: 'F' };
const plano = { modalidade: 'financiado' as const, entradaParcelas: 6, prazo: 120, dataPrimeiroPagamento: '2026-12-10' };
const PDF = Buffer.from('%PDF-1.4\n%teste\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
let contratoId = 0;

beforeAll(async () => {
  const db: any = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci) VALUES (1, 'u1', 'José Romário', 'admin', '4705')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'A01', 'A', 1, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{"emp_nome":"Condomínio de Chácaras Bom Jardims"}', '{"vend_nome":"VALMA"}')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
  const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01', corretorUserId: 1, plano, comprador, conjuge,
    dependentes: [{ nome: 'Filho de Tal', parentesco: 'filho', cpf: '390.533.447-05', nascimento: '2015-03-01', telefone1: '(99) 9 9111-2222', email: 'filho@exemplo.com' } as any] }, 1);
  contratoId = r.id;
});

describe('anexos do contrato (documentos pessoais)', () => {
  it('reconhece o tipo pelo conteúdo e recusa o resto', async () => {
    expect(D.mimeDe(PDF)).toBe('application/pdf');
    expect(D.mimeDe(Buffer.from('MZ executável'))).toBeNull();
    await expect(D.salvarAnexo(contratoId, { alvo: 'comprador', tipo: 'cpf', nome: 'x.exe' }, Buffer.from('MZ executável'), 1)).rejects.toMatchObject({ status: 415 });
    await expect(D.salvarAnexo(contratoId, { alvo: 'comprador', tipo: 'invalido', nome: 'x.pdf' }, PDF, 1)).rejects.toMatchObject({ status: 400 });
  });

  it('comprador, cônjuge e dependente (pela posição logo após criar); lista, abre e remove', async () => {
    await D.salvarAnexo(contratoId, { alvo: 'comprador', tipo: 'comprovante_residencia', nome: 'conta de luz.pdf' }, PDF, 1);
    await D.salvarAnexo(contratoId, { alvo: 'conjuge', tipo: 'documento_foto', nome: 'rg.pdf' }, PDF, 1);
    await D.salvarAnexo(contratoId, { alvo: 'dependente', dependente: 0, tipo: 'documento_dependente', nome: 'certidao.pdf' }, PDF, 1);
    await expect(D.salvarAnexo(contratoId, { alvo: 'dependente', dependente: 5, tipo: 'documento_dependente', nome: 'x.pdf' }, PDF, 1)).rejects.toMatchObject({ status: 404 });
    const lista = await D.listarAnexos(contratoId);
    expect(lista.map(a => [a.alvo, a.tipo])).toEqual([['comprador', 'comprovante_residencia'], ['conjuge', 'documento_foto'], ['dependente', 'documento_dependente']]);
    expect(lista[2].dependente).toBe('Filho de Tal');
    expect(lista[0].rotulo).toBe('Comprovante de endereço');
    const f = await D.lerAnexo(contratoId, lista[0].id);
    expect(f?.buf.equals(PDF)).toBe(true);
    expect(await D.lerAnexo(contratoId + 99, lista[0].id)).toBeNull();
    await expect(D.removerAnexo(contratoId, lista[0].id, { id: 7 }, false)).rejects.toMatchObject({ status: 403 });
    await D.removerAnexo(contratoId, lista[0].id, { id: 1 }, false);
    expect(await D.listarAnexos(contratoId)).toHaveLength(2);
  });
});
