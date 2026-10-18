import { describe, it, expect, vi } from 'vitest';
import {
  processarTurno, parseRespostaIa, montarSystemPrompt, pediuOptout, pediuHumano, SCHEMA_RESPOSTA,
  MSG_HANDOFF, MSG_OPTOUT, MSG_COMPLETA, MAX_PERGUNTAS, type EstadoQualificacao, type RespostaIa,
} from './iaQualificacao';
import { elegivelIa } from './qualificacaoService';
import { mesclarSlots } from './slots';

const resposta = (over: Partial<RespostaIa> = {}): string => JSON.stringify({
  resposta_ao_lead: 'Perfeito! E você pensa em pagar à vista ou financiado?',
  slots_extraidos: [],
  funil_detectado: 'comprador',
  pedir_humano: false,
  qualificacao_completa: false,
  optout: false,
  ...over,
});

const estado = (over: Partial<EstadoQualificacao> = {}): EstadoQualificacao => ({
  funil: 'comprador', slots: {}, perguntasIa: 0, falhasIa: 0, tipoImovel: 'chacara',
  imovel: { codigo: 'IMV-0012', titulo: 'Chácara Nova Esperança', preco: 'Valor sob consulta' },
  historico: [{ role: 'assistant', content: 'Posso te fazer 3 perguntas rápidas?' }],
  ...over,
});
const deps = (chamar: any) => ({ chamar, assistente: 'Assistente Romatec', timeoutMs: 50 });

describe('Turno da IA — JSON válido', () => {
  it('grava os slots válidos e responde com 1 pergunta', async () => {
    const chamar = vi.fn(async () => resposta({ slots_extraidos: [{ slot: 'objetivo', valor: 'morar' }, { slot: 'prazo_compra', valor: '1_3m' }] }));
    const r = await processarTurno(estado(), 'Quero morar, compro em 2 meses', deps(chamar));
    expect(r).toMatchObject({ tipo: 'ok', acao: 'continuar', aceitos: ['objetivo', 'prazo_compra'], perguntasIa: 1 });
    if (r.tipo !== 'ok') throw new Error();
    expect(r.slots.objetivo).toMatchObject({ valor: 'morar', fonte: 'ia' });
    expect(r.texto).toContain('à vista ou financiado');
    // A IA recebe o histórico + a mensagem nova e o prompt com os pendentes
    const arg = chamar.mock.calls[0][0] as any;
    expect(arg.mensagens.at(-1)).toEqual({ role: 'user', content: 'Quero morar, compro em 2 meses' });
    expect(arg.system).toContain('SLOTS_PENDENTES: objetivo, forma_pagamento, prazo_compra, faixa_valor, quer_visita');
  });

  it('slot fora do enum é descartado e continua pendente', async () => {
    const chamar = vi.fn(async () => resposta({ slots_extraidos: [{ slot: 'forma_pagamento', valor: 'cartao_de_credito' }, { slot: 'quer_visita', valor: 'sim' }] }));
    const r = await processarTurno(estado(), 'no cartão, e quero visitar', deps(chamar));
    if (r.tipo !== 'ok') throw new Error();
    expect(r.recusados).toEqual(['forma_pagamento']);
    expect(r.aceitos).toEqual(['quer_visita']);
    expect(r.slots.forma_pagamento).toBeUndefined();
  });

  it('resposta longa é cortada em 350 caracteres', async () => {
    const r = await processarTurno(estado(), 'oi', deps(vi.fn(async () => resposta({ resposta_ao_lead: 'a'.repeat(500) + '?' }))));
    if (r.tipo !== 'ok') throw new Error();
    expect(r.texto.length).toBe(350);
  });

  it('cliente quer vender → muda para o funil proprietário', async () => {
    const chamar = vi.fn(async () => resposta({ funil_detectado: 'proprietario', slots_extraidos: [{ slot: 'tipo_imovel', valor: 'rural' }], resposta_ao_lead: 'Onde fica a fazenda?' }));
    const r = await processarTurno(estado(), 'na verdade quero vender minha fazenda', deps(chamar));
    expect(r).toMatchObject({ tipo: 'ok', funil: 'proprietario', aceitos: ['tipo_imovel'] });
  });
});

describe('Turno da IA — falhas e fallback para o bot', () => {
  it('JSON inválido: 1ª falha não cai no bot; 2ª cai, sem perder slots', async () => {
    const slots = mesclarSlots('comprador', {}, { objetivo: 'morar' }, 'ia').slots;
    const lixo = vi.fn(async () => 'claro! posso ajudar 😊');
    const r1 = await processarTurno(estado({ slots }), 'oi', deps(lixo));
    expect(r1).toMatchObject({ tipo: 'falha', falhasIa: 1, cairNoBot: false });
    const r2 = await processarTurno(estado({ slots, falhasIa: 1 }), 'oi', deps(lixo));
    expect(r2).toMatchObject({ tipo: 'falha', falhasIa: 2, cairNoBot: true });
    // os slots não são tocados numa falha (ficam no lead como estavam)
    expect(slots.objetivo.valor).toBe('morar');
  });

  it('timeout de 15 s (aqui 50 ms) conta como falha', async () => {
    const lenta = vi.fn(() => new Promise<string>(res => setTimeout(() => res(resposta()), 500)));
    const r = await processarTurno(estado(), 'oi', deps(lenta));
    expect(r).toMatchObject({ tipo: 'falha', falhasIa: 1 });
    if (r.tipo === 'falha') expect(r.erro).toContain('timeout');
  });

  it('erro da API conta como falha', async () => {
    const r = await processarTurno(estado({ falhasIa: 1 }), 'oi', deps(vi.fn(async () => { throw new Error('503 overloaded'); })));
    expect(r).toMatchObject({ tipo: 'falha', cairNoBot: true });
  });
});

describe('Turno da IA — handoff, optout, fim', () => {
  it('"falar com o corretor" passa para o José sem chamar a IA', async () => {
    const chamar = vi.fn();
    const r = await processarTurno(estado(), 'Quero falar com o corretor', deps(chamar));
    expect(r).toMatchObject({ tipo: 'ok', acao: 'handoff', texto: MSG_HANDOFF });
    expect(chamar).not.toHaveBeenCalled();
  });

  it('IA pede humano', async () => {
    const r = await processarTurno(estado(), 'é complicado, explico pessoalmente', deps(vi.fn(async () => resposta({ pedir_humano: true }))));
    expect(r).toMatchObject({ acao: 'handoff', texto: MSG_HANDOFF });
  });

  it('SAIR encerra sem chamar a IA; optout da IA também', async () => {
    const chamar = vi.fn();
    expect(await processarTurno(estado(), 'SAIR', deps(chamar))).toMatchObject({ acao: 'optout', texto: MSG_OPTOUT });
    expect(chamar).not.toHaveBeenCalled();
    const r = await processarTurno(estado(), 'não tenho interesse', deps(vi.fn(async () => resposta({ optout: true, resposta_ao_lead: 'Tudo bem, obrigado!' }))));
    expect(r).toMatchObject({ acao: 'optout', texto: 'Tudo bem, obrigado!' });
  });

  it('todos os obrigatórios preenchidos → completa e passa para o corretor', async () => {
    const quase = mesclarSlots('comprador', {}, { objetivo: 'morar', prazo_compra: '1_3m', faixa_valor: '200000' }, 'ia').slots;
    const chamar = vi.fn(async () => resposta({ slots_extraidos: [{ slot: 'forma_pagamento', valor: 'a_vista' }, { slot: 'quer_visita', valor: 'sim' }], resposta_ao_lead: 'Ótimo, anotado.' }));
    const r = await processarTurno(estado({ slots: quase }), 'à vista, e quero visitar sábado', deps(chamar));
    expect(r).toMatchObject({ tipo: 'ok', acao: 'completa' });
    if (r.tipo === 'ok') expect(r.texto).toBe(`Ótimo, anotado.\n\n${MSG_COMPLETA}`);
  });

  it(`limite de ${MAX_PERGUNTAS} perguntas encerra mesmo com pendentes`, async () => {
    const r = await processarTurno(estado({ perguntasIa: MAX_PERGUNTAS - 1 }), 'hmm', deps(vi.fn(async () => resposta())));
    expect(r).toMatchObject({ acao: 'completa', perguntasIa: MAX_PERGUNTAS, texto: MSG_COMPLETA });
  });
});

describe('Prompt e formato', () => {
  it('prompt usa o nome configurado, nunca ZAYRA, e protege "Valor sob consulta"', () => {
    const p = montarSystemPrompt({ assistente: 'Assistente Romatec', funil: 'comprador', pendentes: ['objetivo'], preenchidos: {}, imovel: { titulo: 'X', preco: 'Valor sob consulta' } });
    expect(p).toContain('Você é Assistente Romatec, assistente da Romatec');
    expect(p).not.toMatch(/zayra/i);
    expect(p).toContain('"Valor sob consulta", não fale de valores');
    expect(p).toContain('forma_pagamento: a_vista | financiamento | parcelado_direto | permuta | fgts_financiamento');
    expect(p).toContain('Não peça CPF');
  });

  it('JSON com cerca ``` é aceito; formato errado não', () => {
    expect(parseRespostaIa('```json\n' + resposta() + '\n```')).not.toBeNull();
    expect(parseRespostaIa('{"resposta_ao_lead": "oi"}')).toBeNull();
    expect(parseRespostaIa('')).toBeNull();
  });

  it('schema de structured outputs tem objetos fechados e tudo obrigatório', () => {
    expect(SCHEMA_RESPOSTA.additionalProperties).toBe(false);
    expect(SCHEMA_RESPOSTA.required).toHaveLength(6);
    expect(SCHEMA_RESPOSTA.properties.slots_extraidos.items.additionalProperties).toBe(false);
    expect(SCHEMA_RESPOSTA.properties.slots_extraidos.items.properties.slot.enum).toContain('documentacao');
  });

  it('atalhos de SAIR e de pedir corretor', () => {
    expect(pediuOptout('Sair')).toBe(true);
    expect(pediuOptout('para de mandar mensagem')).toBe(true);
    expect(pediuOptout('quero sair de Imperatriz e morar aí')).toBe(false);
    expect(pediuHumano('posso falar com um atendente?')).toBe(true);
    expect(pediuHumano('quero falar com o José')).toBe(true);
    expect(pediuHumano('quero falar sobre o preço')).toBe(false);
  });
});

describe('Quem passa pela IA', () => {
  const base = { origemCanal: 'meta_ctwa', humano: false, empreendimentoSlug: null, modoQualificacao: 'ia', blockedUntil: null, stage: 'abordagem_enviada' };
  it('lead da captação, sem corretor, no modo IA', () => {
    expect(elegivelIa(base)).toBe(true);
  });
  it('fora: lead antigo, com corretor, Bom Jardims, modo bot, bloqueado, já qualificado', () => {
    expect(elegivelIa({ ...base, origemCanal: null })).toBe(false);
    expect(elegivelIa({ ...base, humano: true })).toBe(false);
    expect(elegivelIa({ ...base, empreendimentoSlug: 'bom-jardims' })).toBe(false);
    expect(elegivelIa({ ...base, modoQualificacao: 'bot' })).toBe(false);
    expect(elegivelIa({ ...base, blockedUntil: new Date(Date.now() + 3600_000) })).toBe(false);
    expect(elegivelIa({ ...base, stage: 'qualificado' })).toBe(false);
  });
});
