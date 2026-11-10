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
  for (const t of ['gestaoAditivos', 'gestaoAportes', 'gestaoContratos', 'empJuridico', 'lotes', 'empreendimentos']) db.run(sql.raw(`DELETE FROM ${t}`));
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
    expect(t).toMatch(/CLÁUSULA 6ª — DA PRESTAÇÃO DE CONTAS E DOS TRIBUTOS/);
    expect(t).toMatch(/6\.3\. Todos os tributos incidentes sobre os recebimentos, as movimentações financeiras e os ativos do EMPREENDIMENTO são de responsabilidade exclusiva da EMPREENDEDORA, conforme a legislação e as alíquotas vigentes/);
    expect(t).toMatch(/vinculados ao CNPJ da GESTORA/);
    expect(t).toMatch(/6\.5\. Fica a GESTORA autorizada a reter e provisionar/);
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

describe('Motor de aditivos', () => {
  it('número por extenso, itens do texto numerados, valor e ratificação', async () => {
    const M = await import('./aditivos/motor');
    expect(M.ordinalAditivo(2)).toBe('SEGUNDO TERMO ADITIVO');
    expect(M.ordinalAditivo(21)).toBe('TERMO ADITIVO N.º 21');
    expect(M.paragrafosDe('1. Primeira alteração\n\n2) Segunda alteração\n \nTerceira')).toEqual(['Primeira alteração', 'Segunda alteração', 'Terceira']);
    const bl = M.blocosAditivo({
      numero: 2, instrumento: 'Contrato X n.º 1', contexto: 'Empreendimento', local: 'Açailândia/MA', data: '2026-11-10',
      partes: [{ papel: 'EMPREENDEDORA', nome: 'A', qualif: 'CPF 1' }, { papel: 'PROMISSÁRIO(A) COMPRADOR(A)', nome: 'B', qualif: 'CPF 2' }],
      objeto: 'a inclusão de um serviço.', texto: 'Inclui o serviço Y.\nO prazo é de 30 dias.', valor: { valor: 1500, descricao: 'pelo serviço' },
      testemunhas: [{ nome: '', cpf: '' }],
    });
    const t = texto(bl);
    expect(t).toMatch(/^SEGUNDO TERMO ADITIVO AO CONTRATO X N\.º 1/);
    expect(t).toMatch(/doravante denominado\(a\) PROMISSÁRIO\(A\) COMPRADOR\(A\)/);
    expect(t).toMatch(/1\.1\. O presente Termo Aditivo tem por objeto a inclusão de um serviço\./);
    expect(t).toMatch(/2\.1\. Inclui o serviço Y\.\n2\.2\. O prazo é de 30 dias\./);
    expect(t).toMatch(/CLÁUSULA 3ª — DO VALOR\n3\.1\. R\$ 1\.500,00 \(mil e quinhentos reais\), pelo serviço\./);
    expect(t).toMatch(/CLÁUSULA 4ª — DA RATIFICAÇÃO E DA AUSÊNCIA DE NOVAÇÃO/);
    expect(bl.at(-1)).toMatchObject({ k: 'ass' });
    expect((bl.at(-1) as any).blocos).toHaveLength(3);
  });

  it('aditivo ao Contrato de Gestão: reconhecimento de adiantamentos com a tabela dos recibos, numeração sequencial, PDF e Word', async () => {
    await G.criarAporte('bom-jardims', { data: '2026-11-10', valor: 1000, descricao: 'Marcos', categoria: 'materiais', favorecido: '', formaPagamento: 'pix', comprovante: '' }, 1);
    await G.criarAporte('bom-jardims', { data: '2026-11-11', valor: 250.5, descricao: 'Combustível', categoria: 'agrimensura', favorecido: '', formaPagamento: 'pix', comprovante: '' }, 1);
    let g = await G.dadosContrato('bom-jardims');
    await expect(G.criarAditivoGestao('bom-jardims', { tipo: 'adiantamentos', data: '2026-11-12', objeto: '', texto: '', valor: null, aportes: [] }, 1)).rejects.toThrow(/Escolha os adiantamentos/);
    await expect(G.criarAditivoGestao('bom-jardims', { tipo: 'outro', data: '2026-11-12', objeto: '', texto: '', valor: null, aportes: [] }, 1)).rejects.toThrow(/Descreva/);
    expect((await G.criarAditivoGestao('bom-jardims', { tipo: 'adiantamentos', data: '2026-11-12', objeto: '', texto: '', valor: null, aportes: g.aportes.map(a => a.id) }, 1)).numero).toBe(1);
    expect((await G.criarAditivoGestao('bom-jardims', { tipo: 'servicos', data: '2026-11-13', objeto: '', texto: 'Fica incluída a locação de 10 pontos adicionais.', valor: 2000, aportes: [] }, 1)).numero).toBe(2);
    g = await G.dadosContrato('bom-jardims');
    const [a1, a2] = g.aditivos;
    const t1 = texto(C.blocosAditivoGestao(g, a1));
    expect(t1).toMatch(/^PRIMEIRO TERMO ADITIVO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO N\.º GE-\d{4}-0007/);
    expect(t1).toMatch(/MARIA SINTETICA DE TESTE/);
    expect(t1).toMatch(/TOTAL\s+1\.250,50/);
    expect(t1).toMatch(/R\$ 1\.250,50 \(mil duzentos e cinquenta reais e cinquenta centavos\), total dos adiantamentos ora reconhecidos/);
    const t2 = texto(C.blocosAditivoGestao(g, a2));
    expect(t2).toMatch(/^SEGUNDO TERMO ADITIVO/);
    expect(t2).toMatch(/2\.1\. Fica incluída a locação de 10 pontos adicionais\./);
    expect(t2).toMatch(/R\$ 2\.000,00 \(dois mil reais\), pelos serviços ora incluídos/);
    expect((await PDFDocument.load(await C.blocosParaPdf(C.blocosAditivoGestao(g, a1), 'Aditivo', 'rodapé'))).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(strFromU8(unzipSync(new Uint8Array(C.blocosParaDocx(C.blocosAditivoGestao(g, a2))))['word/document.xml'])).toContain('SEGUNDO TERMO ADITIVO');
    await G.excluirAditivoGestao('bom-jardims', a1.id);
    expect((await G.criarAditivoGestao('bom-jardims', { tipo: 'receber', data: '2026-11-14', objeto: '', texto: '', valor: 500, aportes: [] }, 1)).numero).toBe(3);
  });

  it('recibo com serviço contratado mostra o saldo; recibo, Anexo I e aditivo ficam vinculados pelos números', async () => {
    await G.criarAporte('bom-jardims', { data: '2026-11-10', valor: 7000, descricao: 'Adiantamento dos planos ambientais', categoria: 'licencas', favorecido: 'Engenheiro', formaPagamento: 'pix', comprovante: 'E1', valorContratado: 15000, referencia: 'Proposta' }, 1);
    let g = await G.dadosContrato('bom-jardims');
    let r = texto(C.blocosRecibo(g, g.aportes[0]));
    expect(r).toMatch(/RECIBO DE ADIANTAMENTO N\.º 001\/2026/);
    expect(r).toMatch(/Vínculo: Contrato de Gestão n\.º GE-\d{4}-0007 \(Cláusula 5ª e Anexo I\)/);
    expect(r).toMatch(/R\$ 15\.000,00 R\$ 7\.000,00 R\$ 8\.000,00/);
    expect(r).toMatch(/O saldo de R\$ 8\.000,00 \(oito mil reais\)/);
    expect(r).toMatch(/Documento de origem: Proposta\./);
    await G.criarAditivoGestao('bom-jardims', { tipo: 'adiantamentos', data: '2026-11-11', objeto: '', texto: '', valor: null, aportes: [g.aportes[0].id] }, 1);
    g = await G.dadosContrato('bom-jardims');
    expect(g.aportes[0].aditivos).toEqual([1]);
    r = texto(C.blocosRecibo(g, g.aportes[0]));
    expect(r).toMatch(/reconhecido no Termo Aditivo n\.º 1/);
    expect(texto(C.blocosContrato(g))).toMatch(/001\/2026 10\/11\/2026 Adiantamento dos planos ambientais 7\.000,00 Aditivo n\.º 1/);
    expect(texto(C.blocosAditivoGestao(g, g.aditivos[0]))).toMatch(/001\/2026/);
  });

  it('engenharia, legalização e obras civis ficam fora da gestão e da agrimensura, fixadas por aditivo antes de cada frente; arquitetura e locação entram na agrimensura', async () => {
    await G.salvarParametros('bom-jardims', { ...PARAMETROS_PADRAO, construtoraNome: 'CONSTRUTORA FICTICIA LTDA', construtoraCnpj: '11.222.333/0001-81' }, 1);
    const t = texto(C.blocosContrato(await G.dadosContrato('bom-jardims')));
    expect(t).toMatch(/CLÁUSULA 4ª-A — DOS SERVIÇOS DE ENGENHARIA E DAS OBRAS CIVIS/);
    expect(t).toMatch(/Não estão compreendidos na remuneração da Cláusula 3ª nem nos valores da Cláusula 4ª, e serão contratados e cobrados à parte/);
    expect(t).toMatch(/projetos de engenharia e de legalização.*terraplenagem, drenagem pluvial/);
    expect(t).toMatch(/acompanhamento técnico e a fiscalização de engenharia da terraplenagem, do aterro e do empiçarramento do arruamento, da drenagem, das obras elétricas e das obras do poço/);
    expect(t).toMatch(/stand de vendas, o portal de entrada/);
    expect(t).toMatch(/construtora da GESTORA, CONSTRUTORA FICTICIA LTDA, CNPJ 11\.222\.333\/0001-81/);
    expect(t).toMatch(/fixados em termo aditivo próprio, firmado antes do seu início/);
    expect(t).toMatch(/preço global, por preço unitário apurado em boletim de medição, ou por administração/);
    expect(t).toMatch(/4\.8\. Estão incluídos nos valores da Cláusula 4\.4, sem acréscimo, os serviços de arquitetura e de locação/);
    expect(t).toMatch(/\(b\) fixar, antes do início de cada frente, o escopo, os valores/);
    expect(t).toMatch(/sem incluir o acompanhamento técnico de engenharia nem a execução de obras/);
  });

  it('comprovante e medição anexos ao recibo: tipo validado, saem no PDF do recibo e no fim do contrato, com a tarja do recibo', async () => {
    await G.criarAporte('bom-jardims', { data: '2026-11-10', valor: 13000, descricao: 'locação de trator de esteira', categoria: 'obras', formaPagamento: 'pix', favorecido: '', comprovante: '', valorContratado: 25245, referencia: 'medição' }, 1);
    const [a] = (await G.dadosContrato('bom-jardims')).aportes;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const med = await PDFDocument.create(); med.addPage([400, 300]); med.addPage([400, 300]);
    const medBuf = Buffer.from(await med.save());
    await expect(G.anexarAporte('bom-jardims', a.id, { tipo: 'comprovante', nome: 'falso.png', mime: 'image/png', conteudoBase64: Buffer.from('nao e imagem').toString('base64'), descricao: '' })).rejects.toMatchObject({ status: 400 });
    await G.anexarAporte('bom-jardims', a.id, { tipo: 'origem', nome: 'medicao.pdf', mime: 'application/pdf', conteudoBase64: medBuf.toString('base64'), descricao: 'boletim de horas da máquina' });
    await G.anexarAporte('bom-jardims', a.id, { tipo: 'comprovante', nome: 'pix.png', mime: 'image/png', conteudoBase64: png.toString('base64'), descricao: 'PIX de 10/11' });
    const g = await G.dadosContrato('bom-jardims');
    expect(g.aportes[0].anexos.map(x => x.nome)).toEqual(['medicao.pdf', 'pix.png']);
    expect(texto(C.blocosRecibo(g, g.aportes[0]))).toMatch(/Anexos deste recibo, dele inseparáveis: \(1\) Comprovante de pagamento — PIX de 10\/11; \(2\) Documento de origem — boletim de horas da máquina/);
    const D = await import('./gestao/documentos');
    const so = await PDFDocument.load(await C.blocosParaPdf(C.blocosRecibo(g, g.aportes[0]), 't', 'r'));
    const rec = await PDFDocument.load(await D.pdfRecibo(g, g.aportes[0]));
    expect(rec.getPageCount()).toBe(so.getPageCount() + 3);
    const ctr = await PDFDocument.load(await D.pdfContrato(g));
    const ctrSo = await PDFDocument.load(await C.blocosParaPdf(C.blocosContrato(g), 't', 'r'));
    expect(ctr.getPageCount()).toBe(ctrSo.getPageCount() + 3);
    expect(texto(C.blocosContrato(g))).toMatch(/comprovantes de pagamento e os documentos de origem de cada recibo seguem ao final/);
    await G.removerAnexoAporte('bom-jardims', a.id, g.aportes[0].anexos[0].chave);
    expect((await G.dadosContrato('bom-jardims')).aportes[0].anexos.map(x => x.nome)).toEqual(['pix.png']);
    await expect(G.removerAnexoAporte('bom-jardims', a.id, 'inexistente')).rejects.toMatchObject({ status: 404 });
  });

  it('aditivo livre ao CPCV: valida objeto, texto e contrato', async () => {
    const L = await import('./aditivos/cpcv');
    await expect(L.criarAditivoLivre(1, { objeto: 'abc', texto: 'x y' }, 1)).rejects.toThrow(/objeto/);
    await expect(L.criarAditivoLivre(1, { objeto: 'a alteração do vencimento', texto: '' }, 1)).rejects.toThrow(/alterações/);
    await expect(L.criarAditivoLivre(99999, { objeto: 'a alteração do vencimento', texto: 'Novo vencimento no dia 15.' }, 1)).rejects.toMatchObject({ status: 404 });
    expect(L.pontosLivre({ objeto: 'a alteração do vencimento.', texto: 'Novo vencimento no dia 15.' })).toEqual(['a alteração do vencimento', 'Novo vencimento no dia 15.', 'As demais cláusulas do contrato continuam valendo']);
  });
});
