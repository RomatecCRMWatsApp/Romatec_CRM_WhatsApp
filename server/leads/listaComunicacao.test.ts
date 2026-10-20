import { describe, it, expect } from 'vitest';
import { mensagemListaComunicacao, podeEnviarLista, INTERVALO_LISTA_MS } from './listaComunicacao';

describe('Lista de comunicação do empreendimento', () => {
  it('mensagem: lista, regularização, sem venda/reserva, aviso primeiro, SAIR — sem preço e sem escassez', () => {
    const m = mensagemListaComunicacao('maria souza', 'Condomínio de Chácaras Bom Jardims');
    expect(m).toMatch(/^Olá, Maria!/);
    expect(m).toContain('*lista de comunicação do Condomínio de Chácaras Bom Jardims*');
    expect(m).toContain('regularização');
    expect(m).toContain('ainda não estamos vendendo nem reservando');
    expect(m).toContain('recebe o aviso primeiro');
    expect(m).toContain('SAIR');
    expect(m).not.toMatch(/R\$|últimas|poucas unidades|corra|garanta/i);
  });
  it('sem nome válido, só "Olá!"', () => {
    expect(mensagemListaComunicacao('Cliente', 'X')).toMatch(/^Olá! Obrigado/);
  });
  it('no máximo 1 vez a cada 24 h', () => {
    const agora = Date.UTC(2026, 9, 20, 15);
    expect(podeEnviarLista(null, agora)).toBe(true);
    expect(podeEnviarLista(new Date(agora - 3600_000), agora)).toBe(false);
    expect(podeEnviarLista(new Date(agora - INTERVALO_LISTA_MS), agora)).toBe(true);
  });
});
