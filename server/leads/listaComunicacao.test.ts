import { describe, it, expect } from 'vitest';
import { mensagemListaComunicacao, boasVindasListaExclusiva, falaDaLista, podeEnviarLista, INTERVALO_LISTA_MS } from './listaComunicacao';

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
