import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { simular } = await import('../shared/simulador');
const { compararComTabela } = await import('../shared/autorizacaoProprietaria');
const { planoDoContrato } = await import('./contratos/plano');
const { tagsPlano } = await import('./contratos/contexto');
const { avaliarGate } = await import('./contratos/gate');
const M = await import('./contratos/autorizacaoProprietaria');
const R = await import('./financeiro/renegociacao');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Plano negociado fora da tabela + autorização assinada pela proprietária. Dados fictícios.
const C = { precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625, descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 };
const sim = simular(3159.13, 1, C);
const negociado = (k: any) => planoDoContrato(sim, { modalidade: 'financiado', dataPrimeiroPagamento: '2026-11-20', personalizado: k }, C, true);

describe('plano negociado', () => {
  it('entrada de R$ 50 mil + 180 × R$ 1.000: parcelas fixas, saldo zera, taxa ≈ 6,37% a.a.; contrato sem "desconto à vista"', () => {
    const p = negociado({ entrada: 50000, entradaParcelas: 1, prazo: 180, parcela: 1000 });
    const saldo = p.parcelas.filter(x => x.tipo === 'saldo');
    expect(saldo).toHaveLength(180);
    expect(saldo.slice(0, -1).every(x => x.valor === 1000)).toBe(true);
    expect(saldo.at(-1)!.saldoDevedor).toBe(0);
    expect(p).toMatchObject({ plano_autorizado: true, entrada_valor: 50000, saldo_qtd: 180, parcela_tabela: 978.03 });
    expect(p.taxa_aa).toBeCloseTo(0.0637, 3);
    expect(tagsPlano(p).plano_entrada_forma).toBe('em parcela única de R$ 50.000,00, sem desconto, com vencimento em 20/11/2026');
  });

  it('comparação com a tabela: 180× ganha; 120× perde (valor presente)', () => {
    const cmp = (p: any) => compararComTabela({ precoTabela: sim.preco, precoProposta: p.preco_tabela, entrada: p.entrada_valor, prazo: p.saldo_qtd, taxaTabelaAa: 0.06, linhas: p.parcelas, taxaPropostaAm: p.taxa_am });
    const a = cmp(negociado({ entrada: 50000, entradaParcelas: 1, prazo: 180, parcela: 1000 }));
    expect(a.diferencaVp).toBeGreaterThan(0);
    expect(a.parcelaTabela).toBe(978.03);
    const b = cmp(negociado({ entrada: 50000, entradaParcelas: 1, prazo: 120, parcela: 1000 }));
    expect(b.diferencaVp).toBeLessThan(-26000);
    expect(b.diferencaNominal).toBeCloseTo(-34871, -1);
  });

  it('preço negociado e entrada parcelada; parcelas que não cobrem o saldo são recusadas', () => {
    const p = negociado({ preco: 150000, entrada: 30000, entradaParcelas: 3, prazo: 120, parcela: 1200 });
    expect(p).toMatchObject({ preco_tabela: 150000, preco_tabela_original: 167088.4, entrada_qtd: 3 });
    expect(p.parcelas.filter(x => x.tipo === 'entrada').map(x => x.vencimento)).toEqual(['2026-11-20', '2026-12-20', '2027-01-20']);
    expect(p.saldo_venc1).toBe('2027-02-20');
    expect(() => negociado({ entrada: 50000, entradaParcelas: 1, prazo: 100, parcela: 1000 })).toThrow(/não cobrem o saldo/);
  });
});

describe('autorização antes do contrato: 2 chácaras → proprietária (empresa) assina pelo link → contrato de cada chácara', () => {
  let db: any;
  const msgs: [string, string][] = [];
  const AV = () => import('./autorizacoes/servico');
  const plano = { entrada: 10000, entradaParcelas: 4, prazo: 180, parcela: 1000, inicioParcelas: '2027-03-15' };
  beforeAll(async () => {
    db = await getDb();
    R.definirEnviador(async (t, m) => { msgs.push([t, m]); });
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
      VALUES (1, '160000', '3025.11', '1', '0.3', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-01-01', 1)`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'VERA PROPRIETARIA FICTICIA', vend_cpf: '111.444.777-35', vend_telefone: '(99) 9 9000-0001' })})`);
    db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (1, 'D01', 'D', 1, '3157.17', 'disponivel'), (1, 'D18', 'D', 18, '3154.38', 'disponivel')`);
  });

  it('gera a autorização com as 2 chácaras, a empresa e o representante; o link vai ao WhatsApp informado', async () => {
    const r = await (await AV()).criarAutorizacao({
      empreendimentoSlug: 'bom-jardims', clienteNome: 'Cliente Ficticio das Quatro',
      proprietario: { nome: 'Rui Representante Ficticio', empresa: 'Empresa Ficticia Ltda', documento: '11.222.333/0001-81', telefone: '(99) 9 8000-0002' },
      itens: ['D01', 'D18'].map(loteCodigo => ({ loteCodigo, dataPrimeiroPagamento: '2026-11-20', personalizado: plano })),
    }, 1);
    expect(r).toMatchObject({ numero: 1, enviado: true });
    expect(msgs.at(-1)![0]).toBe('5599980000002');
    expect(msgs.at(-1)![1]).toMatch(/Olá, Rui! O pedido de Autorização n.º 1/);
    expect(r.totais.parcelaMensal).toBe(2000);
    // ainda não assinada: não aparece no Novo contrato
    expect(await (await AV()).disponiveisPara('bom-jardims', 'D01')).toEqual([]);
  });

  it('a proprietária assina pela página pública com o código; a chácara fica disponível para o contrato', async () => {
    const A = await AV();
    const a = await A.porToken(db.all(sql`SELECT token FROM autorizacoesVenda WHERE numero = 1`)[0].token);
    expect((await A.paginaPublica(a)).comprador).toBe('Rui');
    await A.enviarCodigoPublico(a);
    const codigo = msgs.at(-1)![1].match(/(\d{6})/)![1];
    await A.assinarPublico(await A.porToken(a.token), codigo, { aceite: true, ip: '1.2.3.4', ua: 'teste' });
    const disp = await A.disponiveisPara('bom-jardims', 'D01');
    expect(disp).toHaveLength(1);
    expect(disp[0]).toMatchObject({ numero: 1, prazo: 180, parcela: 1000, entradaQtd: 4 });
  });

  it('via do cliente: só depois de assinada; sem a comparação com a tabela; com o selo da assinatura da proprietária', async () => {
    const A = await AV();
    const via = await A.viaDoCliente(1);
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(via!.buf), verbosity: 0 }).promise;
    let t = '';
    for (let n = 1; n <= doc.numPages; n++) t += (await (await doc.getPage(n)).getTextContent()).items.map((i: any) => i.str).join(' ') + ' ';
    expect(t).toMatch(/CONDIÇÕES DE PAGAMENTO APROVADAS/);
    expect(t.replace(/\s+/g, ' ')).toMatch(/aprovou\s*as condições de pagamento abaixo para Cliente Ficticio das Quatro/);
    expect(t).toMatch(/CNPJ 11\.222\.333\/0001-81 · \d{2}\/\d{2}\/\d{4}/);
    expect(t).toMatch(/180× R\$ 1\.000,00/);
    expect(t).toMatch(/ASSINADO ELETRONICAMENTE/);
    expect(t).not.toMatch(/tabela|valor presente|Diferença/i);
    // autorização ainda não assinada: não tem via do cliente
    await A.criarAutorizacao({ empreendimentoSlug: 'bom-jardims', clienteNome: 'Outro Ficticio', itens: [{ loteCodigo: 'D01', dataPrimeiroPagamento: '2026-11-20', personalizado: plano }] }, 1);
    const id2 = db.all(sql`SELECT id FROM autorizacoesVenda WHERE numero = 2`)[0].id;
    await expect(A.viaDoCliente(id2)).rejects.toThrow(/depois que a proprietária assina/);
  });

  it('contrato da D01 com o plano da autorização: vale e anexa; outra chácara/plano diferente não vale; a D01 sai da lista', async () => {
    const A = await AV();
    const { escolha, numero } = await A.escolhaDaAutorizacao(1, 1, 'D01');
    const p = planoDoContrato(simular(3157.17, 1, C), escolha as any, C, true);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, status, simulacaoJson, dadosJson, codigoVerificacao) VALUES (1, 'BJ-2026-0077', 1, 0, 'D01', 1, 'rascunho', ${JSON.stringify({ ...p, autorizacao_venda: { id: 1, numero } })}, '{}', 'C77')`);
    expect((await M.situacaoAutorizacao(1)).situacao).toBe('pendente'); // ainda não vinculado
    await A.vincularContrato(1, 'D01', 1);
    expect((await M.situacaoAutorizacao(1)).situacao).toBe('valida');
    expect((await M.pdfAutorizacaoValida(1))?.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await A.disponiveisPara('bom-jardims', 'D01')).toEqual([]);
    expect(await A.disponiveisPara('bom-jardims', 'D18')).toHaveLength(1);
    await expect(A.escolhaDaAutorizacao(1, 1, 'D01')).rejects.toThrow(/já tem contrato/);
    const outro = planoDoContrato(simular(3157.17, 1, C), { ...(escolha as any), personalizado: { ...plano, parcela: 1100 } }, C, true);
    db.run(sql`UPDATE contratos SET simulacaoJson = ${JSON.stringify({ ...outro, autorizacao_venda: { id: 1, numero } })} WHERE id = 1`);
    expect((await M.situacaoAutorizacao(1)).situacao).toBe('pendente');
    const g = avaliarGate({ aut_proprietaria: 'pendente' } as any, 'definitivo');
    expect(g.bloqueios.some(b => /autorização assinada da proprietária/.test(b))).toBe(true);
  });

  it('editar: troca a chácara (D01 → D18) com o mesmo número, link novo e nova assinatura; com contrato gerado não edita', async () => {
    const A = await AV();
    const id2 = db.all(sql`SELECT id FROM autorizacoesVenda WHERE numero = 2`)[0].id;
    const tokenAntes = db.all(sql`SELECT token FROM autorizacoesVenda WHERE id = ${id2}`)[0].token;
    const p0 = await A.pedidoDaAutorizacao(id2);
    expect(p0.itens.map(i => i.loteCodigo)).toEqual(['D01']);
    const r = await A.editarAutorizacao(id2, { ...p0, itens: [{ ...p0.itens[0], loteCodigo: 'D18' }] }, 1);
    expect(r).toMatchObject({ numero: 2, enviado: true });
    const linha = db.all(sql`SELECT * FROM autorizacoesVenda WHERE id = ${id2}`)[0];
    expect(linha).toMatchObject({ loteCodigos: 'D18', status: 'aguardando', numero: 2 });
    expect(linha.token).not.toBe(tokenAntes);
    expect(await A.porToken(tokenAntes)).toBeNull();
    expect(msgs.at(-1)![1]).toMatch(/Autorização n.º 2/);
    await expect(A.editarAutorizacao(1, await A.pedidoDaAutorizacao(1), 1)).rejects.toThrow(/já tem contrato/);
  });
});

describe('interessado empresa: todos os sócios com nome e CPF', () => {
  it('valida CNPJ e sócios e monta a qualificação', async () => {
    const A = await import('./autorizacoes/servico');
    const i = A.interessadoValido({ tipo: 'PJ', nome: 'Empresa Ficticia Compradora Ltda', documento: '11222333000181', socios: [{ nome: 'Ana Socia Ficticia', cpf: '52998224725' }, { nome: 'Bruno Socio Ficticio', cpf: '390.533.447-05' }] }, '');
    expect(A.qualificacaoInteressado(i)).toBe('Empresa Ficticia Compradora Ltda, inscrita no CNPJ sob o n.º 11.222.333/0001-81, sócios: Ana Socia Ficticia (CPF 529.982.247-25) e Bruno Socio Ficticio (CPF 390.533.447-05)');
    expect(() => A.interessadoValido({ tipo: 'PJ', nome: 'Empresa X Ltda', documento: '11222333000181', socios: [] }, '')).toThrow(/sócios/);
    expect(() => A.interessadoValido({ tipo: 'PJ', nome: 'Empresa X Ltda', documento: '11222333000181', socios: [{ nome: 'Ana Socia', cpf: '123' }] }, '')).toThrow(/CPF com 11 dígitos/);
    expect(() => A.interessadoValido({ tipo: 'PJ', nome: 'Empresa X Ltda', documento: '123', socios: [{ nome: 'Ana Socia', cpf: '52998224725' }] }, '')).toThrow(/CNPJ/);
    expect(A.qualificacaoInteressado(A.interessadoValido({ tipo: 'PF', nome: 'Pedro Ficticio', documento: '52998224725' }, ''))).toBe('Pedro Ficticio, CPF 529.982.247-25');
  });
});
