import { beforeEach, describe, expect, it } from 'vitest';

// Contrato de Gestão (EMPREENDEDORA × GESTORA) com dados fictícios
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const { sql } = await import('drizzle-orm');
const G = await import('./gestao/servico');
const C = await import('./gestao/contrato');
const { PARAMETROS_PADRAO } = await import('../shared/gestao');
const { PDFDocument } = await import('pdf-lib');
const { unzipSync, strFromU8 } = await import('fflate');

const texto = (bs: any[]) => bs.map(b => (b.k === 'par' ? b.tr.map((t: any) => t.t).join('') : b.k === 'clau' ? b.t : b.k === 'cab' ? `${b.t1} ${b.t2}` : b.k === 'tab' ? b.linhas.flat().join(' ') : '')).join('\n');

beforeEach(async () => {
  const db: any = await getDb();
  for (const t of ['gestaoAportes', 'gestaoContratos', 'empJuridico', 'lotes', 'empreendimentos']) db.run(sql.raw(`DELETE FROM ${t}`));
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (7, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  for (let i = 1; i <= 85; i++) db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2) VALUES (7, ${`A${String(i).padStart(2, '0')}`}, 'A', ${i}, '3025.11')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (7, ${JSON.stringify({
    emp_imovel_denominacao: 'FAZENDA EXEMPLO', emp_area_ha: '41,1045', emp_matricula_origem: '99.999', emp_sigef: 'sigef-teste', emp_onus_declarados: '[PREENCHER]',
  })}, ${JSON.stringify({ vend_nome: 'MARIA SINTETICA DE TESTE', vend_cpf: '529.982.247-25', vend_estado_civil: 'solteira', vend_rg: '[PREENCHER]' })})`);
});

describe('Contrato de Gestão', () => {
  it('padrões: 5% sobre todas as vendas, R$ 850 por unidade (lotes + área adm./stand), pontos de banho a R$ 200, promessa de transferência; [PREENCHER] fica de fora', async () => {
    const g = await G.dadosContrato('bom-jardims');
    expect(g.numero).toMatch(/^GE-\d{4}-0007$/);
    expect(g.qtdLotes).toBe(85);
    expect(g.parametros).toEqual(PARAMETROS_PADRAO);
    const t = texto(C.blocosContrato(g));
    expect(t).toMatch(/5% \(cinco por cento\) sobre o valor de cada alienação/);
    expect(t).toMatch(/venda direta pela EMPREENDEDORA/);
    expect(t).toMatch(/concessão, permuta, dação em pagamento/);
    expect(t).toMatch(/locação e piqueteamento, com marcos de concreto nos vértices, de 86 \(oitenta e seis\) unidades — os 85 \(oitenta e cinco\) lotes do parcelamento e a área administrativa e do stand de vendas/);
    expect(t).toMatch(/piqueteamento e locação de 85 \(oitenta e cinco\) pontos de banho na lâmina d'água, ao longo do curso do rio/);
    expect(t).toMatch(/R\$ 850,00 \(oitocentos e cinquenta reais\) por unidade locada, totalizando R\$ 73\.100,00 \(setenta e três mil e cem reais\) para as 86 \(oitenta e seis\) unidades/);
    expect(t).toMatch(/R\$ 200,00 \(duzentos reais\) por ponto de banho locado, totalizando R\$ 17\.000,00 \(dezessete mil reais\) para os 85 \(oitenta e cinco\) pontos/);
    expect(t).toMatch(/no total de R\$ 90\.100,00 \(noventa mil e cem reais\)/);
    expect(t).toMatch(/TOTAL A RECEBER\s+90\.100,00/);
    expect(t).toMatch(/aberto a termos aditivos/);
    expect(t).toMatch(/pontos de locação da faixa marginal do córrego\/rio/);
    expect(t).toMatch(/CLÁUSULA 7ª — DA PROMESSA DE TRANSFERÊNCIA DO IMÓVEL/);
    expect(t).toMatch(/MARIA SINTETICA DE TESTE/);
    expect(t).toMatch(/inscrita no CPF sob o n\.º 529\.982\.247-25/);
    expect(t).toMatch(/imóvel denominado FAZENDA EXEMPLO/);
    expect(t).not.toMatch(/PREENCHER/);
    expect(t).toMatch(/Nenhum adiantamento registrado/);
  });

  it('salva as condições; adiantamentos numerados viram recibos no Anexo I, com total e ressarcimento', async () => {
    await G.salvarParametros('bom-jardims', { ...PARAMETROS_PADRAO, valorPorLote: 900, qtdLotes: 84, dataContrato: '2026-11-10', testemunha1Nome: 'Fulano', testemunha1Cpf: '111.444.777-35' }, 1);
    expect((await G.criarAporte('bom-jardims', { data: '2026-11-10', valor: 12500, descricao: 'Marcos de concreto', categoria: 'materiais', favorecido: 'Loja X', formaPagamento: 'pix', comprovante: 'E1' }, 1)).numero).toBe(1);
    expect((await G.criarAporte('bom-jardims', { data: '2026-11-11', valor: 3800.5, descricao: 'Diárias da equipe de topografia', categoria: 'agrimensura', favorecido: '', formaPagamento: 'dinheiro', comprovante: '' }, 1)).numero).toBe(2);
    let g = await G.dadosContrato('bom-jardims');
    expect(g.numero).toBe('GE-2026-0007');
    const t = texto(C.blocosContrato(g));
    expect(t).toMatch(/R\$ 900,00 .* por unidade locada, totalizando R\$ 76\.500,00 .* para as 85 \(oitenta e cinco\) unidades/);
    expect(t).toMatch(/os adiantamentos somam R\$ 16\.300,50 \(dezesseis mil e trezentos reais e cinquenta centavos\)/);
    expect(t).toMatch(/RECIBO DE ADIANTAMENTO N\.º 002\/2026/);
    expect(t).toMatch(/TOTAL\s+16\.300,50/);
    const segundo = g.aportes[1];
    await G.marcarRessarcido('bom-jardims', segundo.id, '2026-12-01');
    await expect(G.excluirAporte('bom-jardims', segundo.id)).rejects.toThrow(/já ressarcido/);
    await G.excluirAporte('bom-jardims', g.aportes[0].id);
    g = await G.dadosContrato('bom-jardims');
    expect(g.aportes.map(a => [a.numero, a.ressarcidoEm])).toEqual([[2, '2026-12-01']]);
    // a numeração não reaproveita o recibo excluído
    expect((await G.criarAporte('bom-jardims', { data: '2026-12-02', valor: 100, descricao: 'Taxa', categoria: 'documentacao', favorecido: '', formaPagamento: 'boleto', comprovante: '' }, 1)).numero).toBe(3);
  });

  it('gera PDF, Word (.docx válido) e o recibo avulso', async () => {
    await G.criarAporte('bom-jardims', { data: '2026-11-10', valor: 500, descricao: 'Piquetes', categoria: 'materiais', favorecido: '', formaPagamento: 'pix', comprovante: '' }, 1);
    const g = await G.dadosContrato('bom-jardims');
    const bl = C.blocosContrato(g);
    expect((await PDFDocument.load(await C.blocosParaPdf(bl, 'Contrato', 'rodapé'))).getPageCount()).toBeGreaterThanOrEqual(7);
    const zip = unzipSync(new Uint8Array(C.blocosParaDocx(bl)));
    expect(Object.keys(zip).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
    const doc = strFromU8(zip['word/document.xml']);
    expect(doc).toContain('CLÁUSULA 4ª — DOS SERVIÇOS DE AGRIMENSURA E TOPOGRAFIA');
    expect(doc).toContain('<w:br w:type="page"/>');
    expect(doc).not.toMatch(/<[^>]*&[^a-z#]/); // XML escapado
    const recibo = await C.blocosParaPdf(C.blocosRecibo(g, g.aportes[0]), 'Recibo', 'rodapé');
    expect((await PDFDocument.load(recibo)).getPageCount()).toBe(1);
  });

  it('contrato salvo com R$ 800 passa a R$ 850 uma vez; valor escolhido depois é respeitado', async () => {
    const { limparCacheConfig } = await import('./configSistema');
    const db: any = await getDb();
    db.run(sql`DELETE FROM configSistema`); limparCacheConfig();
    await G.salvarParametros('bom-jardims', { ...PARAMETROS_PADRAO, valorPorLote: 800 }, 1);
    expect(await G.ajustarAgrimensura850()).toBe(1);
    expect((await G.dadosContrato('bom-jardims')).parametros.valorPorLote).toBe(850);
    await G.salvarParametros('bom-jardims', { ...PARAMETROS_PADRAO, valorPorLote: 800 }, 1);
    expect(await G.ajustarAgrimensura850()).toBe(0);
    expect((await G.dadosContrato('bom-jardims')).parametros.valorPorLote).toBe(800);
  });

  it('empreendimento inexistente e adiantamento de outro empreendimento: erro 404', async () => {
    await expect(G.dadosContrato('nao-existe')).rejects.toMatchObject({ status: 404 });
    await expect(G.excluirAporte('bom-jardims', 999)).rejects.toMatchObject({ status: 404 });
  });
});
