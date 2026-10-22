import { describe, it, expect } from 'vitest';
import {
  mensagemListaComunicacao, boasVindasListaExclusiva, falaDaLista, podeEnviarLista, INTERVALO_LISTA_MS,
  RESPOSTA_PRECO_CAPTACAO, perguntaPreco, respostaAfirmativa, decidirRespostaCaptacao, mensagemConfirmacaoLista,
} from './listaComunicacao';

describe('Lista exclusiva do empreendimento', () => {
  it('boas-vindas: confirma a lista exclusiva com o nome do empreendimento, aviso primeiro, prioridade, SAIR — sem preço', () => {
    const m = boasVindasListaExclusiva('maria souza', 'Residencial Vila Nova');
    expect(m).toMatch(/^Olá, Maria! 👋/);
    expect(m).toContain('*lista exclusiva* do empreendimento *Residencial Vila Nova*');
    expect(m).toContain('recebe o aviso primeiro');
    expect(m).toContain('*atendimento prioritário* com o corretor José Romário (CRECI/MA 4.705)');
    expect(m).toContain('vai te chamar pelo número pessoal dele, *(99) 9 9181-1246*');
    expect(m).toContain('Para sair da lista, responda SAIR.');
    expect(m).not.toMatch(/R\$|valor|pre[çc]o|parcela|entrada|últimas|poucas unidades|corra|garanta/i);
    expect(falaDaLista(m)).toBe(true);
  });
  it('boas-vindas sem empreendimento (ou sem nome): texto genérico, sem quebrar', () => {
    for (const emp of [null, undefined, '', '  ']) {
      const m = boasVindasListaExclusiva('Cliente', emp);
      expect(m).toMatch(/^Olá! 👋/);
      expect(m).toContain('Você está na nossa *lista exclusiva*.');
      expect(m).not.toContain('empreendimento **');
      expect(m).not.toMatch(/undefined|null/);
    }
  });
  it('resposta quando o lead escreve: lista exclusiva, regularização, sem venda/reserva, aviso primeiro, SAIR — sem preço e sem escassez', () => {
    const m = mensagemListaComunicacao('maria souza', 'Condomínio de Chácaras Bom Jardims');
    expect(m).toMatch(/^Olá, Maria!/);
    expect(m).toContain('*lista exclusiva* do empreendimento *Condomínio de Chácaras Bom Jardims*');
    expect(m).not.toContain('lista de comunicação');
    expect(m).toContain('regularização');
    expect(m).toContain('ainda não estamos vendendo nem reservando');
    expect(m).toContain('recebe o aviso primeiro');
    expect(m).toContain('SAIR');
    expect(m).not.toMatch(/R\$|últimas|poucas unidades|corra|garanta/i);
  });
  it('sem nome válido, só "Olá!"; sem empreendimento, frase genérica', () => {
    expect(mensagemListaComunicacao('Cliente', 'X')).toMatch(/^Olá! Obrigado/);
    expect(mensagemListaComunicacao('Ana', null)).toContain('Você está na nossa *lista exclusiva*.');
  });
  it('anti-repetição reconhece a marca nova e a antiga ("lista de comunicação")', () => {
    expect(falaDaLista('Você está na *lista exclusiva* do empreendimento *X*.')).toBe(true);
    expect(falaDaLista('Você está na *lista de comunicação do Condomínio de Chácaras Bom Jardims*.')).toBe(true);
    expect(falaDaLista('Olá! Posso te passar valores?')).toBe(false);
    expect(falaDaLista(null)).toBe(false);
  });
  it('no máximo 1 vez a cada 24 h', () => {
    const agora = Date.UTC(2026, 9, 20, 15);
    expect(podeEnviarLista(null, agora)).toBe(true);
    expect(podeEnviarLista(new Date(agora - 3600_000), agora)).toBe(false);
    expect(podeEnviarLista(new Date(agora - INTERVALO_LISTA_MS), agora)).toBe(true);
  });
});

describe('Resposta padrão para pergunta de valor/preço (captação → lista de exclusividade)', () => {
  const TEXTO_APROVADO = 'Olá! 👋 Obrigado pelo contato! 🌳\n\nNo momento ainda não divulgamos os valores: estamos cadastrando os interessados na nossa *lista de exclusividade*. 📝✨\n\nO lançamento oficial, com *valores e condições*, sai em no máximo *10 a 15 dias* 🚀 — e quem está na lista tem *prioridade* e recebe tudo em *primeira mão*. ⭐\n\nQuer participar da lista? 😉 Responde *OK* que já confirmo seu nome! ✅';
  const EMP = 'Condomínio de Chácaras Bom Jardims';
  const agora = Date.UTC(2026, 9, 21, 15);
  const min = (m: number) => new Date(agora - m * 60_000);

  it('o texto é exatamente o aprovado pelo José', () => {
    expect(RESPOSTA_PRECO_CAPTACAO).toBe(TEXTO_APROVADO);
  });
  it('detecta pergunta de valor/preço (com e sem acento, abreviações)', () => {
    for (const t of ['Qual o valor?', 'valores das chácaras', 'Preço?', 'qual preco', 'quanto custa a C05?', 'Quanto é?', 'quanto está o lote', 'qto?', 'qnto fica', 'Quanto tá a chácara']) {
      expect(perguntaPreco(t), t).toBe(true);
    }
    for (const t of ['Oi, tudo bem?', 'onde fica?', 'quero visitar', 'OK', 'quantos lotes tem?']) expect(perguntaPreco(t), t).toBe(false);
  });
  it('detecta o aceite ("OK", "sim", "quero") e ignora frases longas', () => {
    for (const t of ['OK', 'ok!', 'Okk', 'sim', 'Quero', 'quero sim', 'pode confirmar', 'Beleza', '👍']) expect(respostaAfirmativa(t), t).toBe(true);
    for (const t of ['não', 'qual o valor?', 'ok mas antes queria saber se aceitam financiamento pelo banco']) expect(respostaAfirmativa(t), t).toBe(false);
  });

  it('fluxo: pergunta de valor → resposta padrão; "OK" depois → confirma o nome na lista exclusiva', () => {
    const enviadas: { texto: string; createdAt: Date }[] = [{ texto: boasVindasListaExclusiva('Maria', EMP), createdAt: min(30) }];
    const r1 = decidirRespostaCaptacao({ texto: 'Qual o valor da chácara?', nome: 'maria souza', empreendimento: EMP, enviadas, agora });
    expect(r1).toEqual({ tipo: 'preco', texto: TEXTO_APROVADO });
    enviadas.push({ texto: r1!.texto, createdAt: min(5) });

    const r2 = decidirRespostaCaptacao({ texto: 'OK', nome: 'maria souza', empreendimento: EMP, enviadas, agora });
    expect(r2?.tipo).toBe('confirmacao');
    expect(r2!.texto).toMatch(/^✅ Prontinho, Maria! Seu nome está confirmado na \*lista exclusiva\* do empreendimento \*Condomínio de Chácaras Bom Jardims\*/);
    expect(r2!.texto).toContain('CRECI/MA 4.705');
    expect(r2!.texto).toContain('SAIR');
    expect(falaDaLista(r2!.texto)).toBe(true);     // conta no anti-repetição da lista
    enviadas.push({ texto: r2!.texto, createdAt: min(1) });

    // "OK" de novo não repete a confirmação; volta para o fluxo normal (lista / corretor)
    expect(decidirRespostaCaptacao({ texto: 'ok', nome: 'Maria', empreendimento: EMP, enviadas, agora })).toBeNull();
  });
  it('anti-repetição: a resposta de valor sai no máximo 1 vez a cada 24 h', () => {
    const enviadas = [{ texto: RESPOSTA_PRECO_CAPTACAO, createdAt: min(60) }];
    expect(decidirRespostaCaptacao({ texto: 'e o preço?', enviadas, agora })).toBeNull();
    expect(decidirRespostaCaptacao({ texto: 'e o preço?', enviadas: [{ texto: RESPOSTA_PRECO_CAPTACAO, createdAt: min(25 * 60) }], agora })?.tipo).toBe('preco');
    expect(falaDaLista(RESPOSTA_PRECO_CAPTACAO)).toBe(true);  // boas-vindas da lista não se repete logo depois
  });
  it('"OK" sem resposta de valor antes (ou depois de 48 h) não vira confirmação — segue o fluxo de sempre', () => {
    expect(decidirRespostaCaptacao({ texto: 'OK', enviadas: [{ texto: boasVindasListaExclusiva('Ana', EMP), createdAt: min(10) }], agora })).toBeNull();
    expect(decidirRespostaCaptacao({ texto: 'OK', enviadas: [{ texto: RESPOSTA_PRECO_CAPTACAO, createdAt: min(49 * 60) }], agora })).toBeNull();
  });
  it('empreendimento com preços públicos não usa a resposta de captação', () => {
    expect(decidirRespostaCaptacao({ texto: 'qual o valor?', precosPublicos: true, enviadas: [], agora })).toBeNull();
  });
  it('confirmação sem nome/empreendimento não quebra', () => {
    expect(mensagemConfirmacaoLista('Cliente', null)).toMatch(/^✅ Prontinho! Seu nome está confirmado na \*lista exclusiva\*\. 📝/);
  });
});
