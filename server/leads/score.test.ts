import { describe, it, expect, afterEach } from 'vitest';
import { calcularComprador, calcularProprietario, calcularBomJardims, classificar, regrasDoLead, pesos, ROTULO_REGRA, type ResultadoScore } from './score';
import { avisosDoRecalculo, emOptout } from './scoreService';

const soma = (r: ResultadoScore) => Object.values(r.detalhes).reduce((a, b) => a + b, 0);
const ctx = { temCodigoImovel: false, precoImovel: null as number | null };

describe('Score comprador (§8.1)', () => {
  it('cada regra pontua o valor da tabela', () => {
    expect(calcularComprador({}, { ...ctx, temCodigoImovel: true }).detalhes).toEqual({ codigo_imovel: 10 });
    expect(calcularComprador({ forma_pagamento: 'a_vista' }, ctx).detalhes.pagamento).toBe(25);
    expect(calcularComprador({ forma_pagamento: 'financiamento', credito_aprovado: 'sim' }, ctx).detalhes.pagamento).toBe(20);
    expect(calcularComprador({ forma_pagamento: 'fgts_financiamento', credito_aprovado: 'em_analise' }, ctx).detalhes.pagamento).toBe(10);
    expect(calcularComprador({ forma_pagamento: 'financiamento', credito_aprovado: 'nao' }, ctx).detalhes.pagamento).toBeUndefined();
    expect(calcularComprador({ forma_pagamento: 'permuta' }, ctx).detalhes.pagamento).toBe(8);
    expect(calcularComprador({ forma_pagamento: 'parcelado_direto' }, ctx).detalhes.pagamento).toBe(8);
    expect(calcularComprador({ prazo_compra: 'ate_30d' }, ctx).detalhes.prazo).toBe(20);
    expect(calcularComprador({ prazo_compra: '1_3m' }, ctx).detalhes.prazo).toBe(12);
    expect(calcularComprador({ prazo_compra: '3_6m' }, ctx).detalhes.prazo).toBe(5);
    expect(calcularComprador({ prazo_compra: 'pesquisando' }, ctx).detalhes.prazo).toBe(-10);
    expect(calcularComprador({ quer_visita: 'sim' }, ctx).detalhes.visita).toBe(20);
    expect(calcularComprador({}, { ...ctx, sinais: new Set(['view_planta']) }).detalhes.midia).toBe(5);
    expect(calcularComprador({}, { ...ctx, tempoPaginaS: 130 }).detalhes.tempo_pagina).toBe(5);
    expect(calcularComprador({}, { ...ctx, sessoesDias: 2 }).detalhes.retorno).toBe(5);
    expect(calcularComprador({}, { ...ctx, respondeuRapido: true }).detalhes.resposta_rapida).toBe(5);
    expect(calcularComprador({}, { ...ctx, inativo48h: true }).detalhes.inatividade).toBe(-10);
  });

  it('faixa de valor x preço: ≥ 90% soma, < 70% tira, entre os dois nada', () => {
    const c = { ...ctx, precoImovel: 100000 };
    expect(calcularComprador({ faixa_valor: '95000' }, c).detalhes.faixa_valor).toBe(10);
    expect(calcularComprador({ faixa_valor: '60000' }, c).detalhes.faixa_valor).toBe(-10);
    expect(calcularComprador({ faixa_valor: '80000' }, c).detalhes.faixa_valor).toBeUndefined();
  });

  it('exibir_preco = false (precoImovel null): a regra faixa_valor é ignorada', () => {
    expect(calcularComprador({ faixa_valor: '10000' }, { ...ctx, precoImovel: null }).detalhes).not.toHaveProperty('faixa_valor');
  });

  it('o detalhamento soma exatamente a nota', () => {
    const r = calcularComprador({ forma_pagamento: 'financiamento', credito_aprovado: 'em_analise', prazo_compra: '1_3m', quer_visita: 'sim' },
      { ...ctx, temCodigoImovel: true, respondeuRapido: true });
    expect(r.score).toBe(10 + 10 + 12 + 20 + 5);
    expect(soma(r)).toBe(r.score);
    expect(r.classe).toBe('morno');
  });

  it('limites 0 e 100', () => {
    const baixo = calcularComprador({ prazo_compra: 'pesquisando' }, { ...ctx, inativo48h: true, precoImovel: 100000 });
    expect(soma(baixo)).toBe(-20);
    expect(baixo.score).toBe(0);
    const alto = calcularComprador({ forma_pagamento: 'a_vista', prazo_compra: 'ate_30d', faixa_valor: '200000', quer_visita: 'sim' },
      { temCodigoImovel: true, precoImovel: 100000, sinais: new Set(['play_video']), tempoPaginaS: 300, sessoesDias: 3, respondeuRapido: true });
    expect(soma(alto)).toBe(105);
    expect(alto.score).toBe(100);
    expect(alto.classe).toBe('quente');
  });

  it('optout zera e deixa frio', () => {
    expect(calcularComprador({ forma_pagamento: 'a_vista', quer_visita: 'sim' }, { ...ctx, optout: true })).toMatchObject({ score: 0, classe: 'frio' });
  });
});

describe('Score proprietário (§8.2)', () => {
  it('regras e soma', () => {
    const r = calcularProprietario({ documentacao: 'matricula', urgencia: 'ate_30d', aceita_exclusividade: 'sim', quer_avaliacao: 'sim', valor_pretendido: '300000' }, { respondeuRapido: true });
    expect(r.detalhes).toEqual({ documentacao: 25, urgencia: 20, exclusividade: 25, avaliacao: 15, valor_pretendido: 5, resposta_rapida: 5 });
    expect(r.score).toBe(95);
    expect(r.classe).toBe('quente');
  });

  it('documentação e exclusividade parciais', () => {
    expect(calcularProprietario({ documentacao: 'contrato_compra_venda' }, {}).detalhes.documentacao).toBe(12);
    expect(calcularProprietario({ documentacao: 'posse' }, {}).detalhes.documentacao).toBe(5);
    expect(calcularProprietario({ urgencia: '1_3m' }, {}).detalhes.urgencia).toBe(12);
    expect(calcularProprietario({ urgencia: 'sem_pressa' }, {}).detalhes.urgencia).toBeUndefined();
    expect(calcularProprietario({ aceita_exclusividade: 'quer_saber_mais' }, {}).detalhes.exclusividade).toBe(10);
    expect(calcularProprietario({}, { inativo48h: true }).score).toBe(0);
    expect(calcularProprietario({ documentacao: 'matricula' }, { optout: true }).score).toBe(0);
  });
});

describe('Score Bom Jardims (README do empreendimento)', () => {
  it('prazo, à vista, mora perto e chácara do mapa; quente a partir de 60', () => {
    const r = calcularBomJardims({ answers: { prazo: 'Imediato', pagamento: 'À vista' }, loteCodigo: 'B07', moraPerto: true });
    expect(r.detalhes).toEqual({ prazo: 30, pagamento: 15, mora_perto: 15, chacara_escolhida: 10 });
    expect(r.score).toBe(70);
    expect(r.classe).toBe('quente');
    const q = calcularBomJardims({ answers: { prazo: 'Imediato', pagamento: 'À vista' }, moraPerto: true });
    expect(q.score).toBe(60);
    expect(q.classe).toBe('quente');
    expect(calcularBomJardims({ answers: { prazo: 'Até 3 meses' }, moraPerto: false }).detalhes).toEqual({ prazo: 20 });
    expect(calcularBomJardims({ answers: { prazo: 'Até 12 meses' }, moraPerto: false }).score).toBe(5);
  });
});

describe('Classes e conjunto de regras', () => {
  it('0–39 frio · 40–69 morno · 70–100 quente', () => {
    expect([0, 39, 40, 69, 70, 100].map(n => classificar(n))).toEqual(['frio', 'frio', 'morno', 'morno', 'quente', 'quente']);
  });

  it('escolhe as regras pelo lead', () => {
    expect(regrasDoLead({ funil: 'comprador' })).toBe('comprador');
    expect(regrasDoLead({ funil: 'proprietario' })).toBe('proprietario');
    expect(regrasDoLead({ funil: 'comprador', empreendimentoSlug: 'bom-jardims' })).toBe('bom_jardims');
    expect(regrasDoLead({})).toBe('comprador');
  });

  it('toda regra tem rótulo para o painel', () => {
    const r = calcularComprador({ forma_pagamento: 'a_vista', prazo_compra: 'ate_30d', faixa_valor: '200000', quer_visita: 'sim' },
      { temCodigoImovel: true, precoImovel: 100000, sinais: new Set(['play_video']), tempoPaginaS: 300, sessoesDias: 3, respondeuRapido: true, inativo48h: true });
    for (const k of Object.keys(r.detalhes)) expect(ROTULO_REGRA[k]).toBeTruthy();
  });
});

describe('Pesos configuráveis (config/score.json + SCORE_PESOS)', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('SCORE_PESOS altera só o que foi informado', () => {
    process.env.SCORE_PESOS = JSON.stringify({ comprador: { quer_visita: 30 }, classes: { quente: 80 } });
    expect(pesos().comprador.quer_visita).toBe(30);
    expect(pesos().comprador.pagamento_a_vista).toBe(25);
    expect(calcularComprador({ quer_visita: 'sim' }, ctx).detalhes.visita).toBe(30);
    expect(classificar(75)).toBe('morno');
  });

  it('JSON inválido cai no padrão', () => {
    process.env.SCORE_PESOS = '{quebrado';
    expect(pesos().comprador.quer_visita).toBe(20);
  });
});

describe('Avisos depois do recálculo', () => {
  it('virou quente → aviso; já era quente → não repete', () => {
    expect(avisosDoRecalculo({ classeAntes: 'morno', classeDepois: 'quente' })).toEqual(['quente']);
    expect(avisosDoRecalculo({ classeAntes: 'quente', classeDepois: 'quente' })).toEqual([]);
  });

  it('pediu visita / avaliação', () => {
    expect(avisosDoRecalculo({ classeAntes: 'frio', classeDepois: 'morno', slotsNovos: { quer_visita: 'sim', quer_avaliacao: 'sim' } }))
      .toEqual(['visita', 'avaliacao']);
    expect(avisosDoRecalculo({ classeAntes: 'frio', classeDepois: 'frio', slotsNovos: { quer_visita: 'depois' } })).toEqual([]);
  });

  it('lead novo não dispara aviso extra (o de lead novo já leva o score)', () => {
    expect(avisosDoRecalculo({ classeAntes: null, classeDepois: 'quente', leadNovo: true })).toEqual([]);
  });

  it('opt-out reconhecido pelo bloqueio do SAIR', () => {
    const futuro = new Date(Date.now() + 86400_000);
    expect(emOptout({ blockedUntil: futuro, discardReason: 'opt-out (bom-jardims)' })).toBe(true);
    expect(emOptout({ blockedUntil: futuro, discardReason: 'sem interesse' })).toBe(false);
    expect(emOptout({ blockedUntil: new Date(Date.now() - 1000), discardReason: 'opt-out' })).toBe(false);
  });
});
