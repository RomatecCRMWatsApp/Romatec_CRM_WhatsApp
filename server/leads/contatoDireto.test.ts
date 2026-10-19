import { describe, it, expect } from 'vitest';
import { ehRespostaAutomatica, pareceNome, podeResponder, LIMITE_RESPOSTAS, JANELA_MS } from './antiLoop';
import { abrirConversa } from './qualificacaoService';
import { montarSystemPrompt } from './iaQualificacao';

describe('Resposta automática de outro sistema', () => {
  it('reconhece as mensagens automáticas mais comuns', () => {
    expect(ehRespostaAutomatica('Boa noite! Esta é uma mensagem automática da Romatec Consultoria Total.')).toBe(true);
    expect(ehRespostaAutomatica('Olá! No momento estamos fora do horário de atendimento.')).toBe(true);
    expect(ehRespostaAutomatica('Resposta automática: retornaremos em breve.')).toBe(true);
    expect(ehRespostaAutomatica('Por favor, não responda esta mensagem.')).toBe(true);
  });
  it('não confunde com mensagem de cliente', () => {
    expect(ehRespostaAutomatica('Oi')).toBe(false);
    expect(ehRespostaAutomatica('Quero saber da chácara no Bom Jardims')).toBe(false);
    expect(ehRespostaAutomatica('O carro é automático?')).toBe(false);
    expect(ehRespostaAutomatica('')).toBe(false);
  });
});

describe('Limite de respostas seguidas', () => {
  it(`no máximo ${LIMITE_RESPOSTAS} respostas por número em 10 min`, () => {
    const mapa = new Map<string, number[]>();
    const t0 = Date.UTC(2026, 9, 19, 13);
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) expect(podeResponder('5599911112222', t0 + i * 1000, mapa)).toBe(true);
    expect(podeResponder('5599911112222', t0 + 10_000, mapa)).toBe(false);
    expect(podeResponder('5599933334444', t0 + 10_000, mapa)).toBe(true); // outro número não é afetado
    expect(podeResponder('+55 (99) 91111-2222', t0 + JANELA_MS + 1000, mapa)).toBe(true); // a janela passou
  });
});

describe('Nome', () => {
  it('saudação, número ou pergunta não é nome', () => {
    for (const t of ['Oi', 'olá!', 'Bom dia', 'tudo bem?', 'sim', '10000', 'quanto custa?', '']) expect(pareceNome(t)).toBe(false);
  });
  it('nome de verdade passa', () => {
    for (const t of ['Maria', 'José Romário Pinto Bezerra', "Ana D'Ávila"]) expect(pareceNome(t)).toBe(true);
  });
});

describe('Primeira resposta da IA para quem chamou direto', () => {
  const rodape = 'Seus dados são usados só para este atendimento. Se não quiser receber mensagens, responda SAIR.';
  it('apresenta a Romatec, mantém a pergunta da IA e inclui o SAIR', () => {
    const t = abrirConversa('Maria Souza', 'Você procura casa, lote ou chácara?', 'Assistente Romatec', rodape);
    expect(t).toMatch(/^Olá, Maria! Aqui é Assistente Romatec, da Romatec Consultoria Total\./);
    expect(t).toContain('Você procura casa, lote ou chácara?');
    expect(t).toContain('SAIR');
  });
  it('não usa nome estranho do perfil e não repete "Olá"', () => {
    const t = abrirConversa('🏡 Imóveis 2', 'Olá! Você procura casa, lote ou chácara?', 'Assistente Romatec', rodape);
    expect(t.startsWith('Olá! Aqui é')).toBe(true);
    expect(t.match(/Olá/g)?.length).toBe(1);
  });
  it('o prompt manda não tratar saudação como nome', () => {
    const p = montarSystemPrompt({ assistente: 'X', funil: 'comprador', pendentes: [], preenchidos: {}, imovel: null });
    expect(p).toMatch(/Saudação .* não é nome/);
  });
});
