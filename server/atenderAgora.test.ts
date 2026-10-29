import { describe, expect, it } from 'vitest';
import { prioridadeDoLead, type EntradaPrioridade } from '../shared/atenderAgora';

const AGORA = Date.parse('2026-10-29T15:00:00Z'); // 12:00 em Açailândia
const MIN = 60_000, H = 60 * MIN, D = 24 * H;
const base = (x: Partial<EntradaPrioridade> = {}): EntradaPrioridade => ({
  score: 30, classe: 'frio', etapa: 'qualificando', criadoEm: AGORA - 10 * D, ultimaAtividade: AGORA - D, aguardandoDesde: null, atendidoEm: AGORA - 5 * D,
  ultimaDoCliente: null, ultimaNossa: null, proximaVisita: null, filaAvisado: null, bloqueadoAte: null, ...x,
});

describe('Atender agora — prioridade', () => {
  it('esperando corretor vem antes de tudo, com o tempo de espera', () => {
    const p = prioridadeDoLead(base({ aguardandoDesde: AGORA - 12 * MIN }), AGORA)!;
    expect(p.urgencia).toBe('agora');
    expect(p.motivos[0]).toBe('Esperando corretor há 12 min');
    const quente = prioridadeDoLead(base({ score: 95, classe: 'quente', ultimaDoCliente: AGORA - 20 * H }), AGORA)!;
    expect(p.pontos).toBeGreaterThan(quente.pontos);
  });
  it('mensagem sem resposta, visita hoje, fila de espera e lead novo', () => {
    expect(prioridadeDoLead(base({ ultimaDoCliente: AGORA - 30 * MIN, ultimaNossa: AGORA - 2 * H }), AGORA)).toMatchObject({ urgencia: 'agora', motivos: ['Mandou mensagem há 30 min e ninguém respondeu'] });
    expect(prioridadeDoLead(base({ ultimaDoCliente: AGORA - 2 * H, ultimaNossa: AGORA - 30 * MIN }), AGORA)).toBeNull();
    expect(prioridadeDoLead(base({ proximaVisita: AGORA + 3 * H }), AGORA)!.motivos).toEqual(['Visita hoje às 15:00 — confirme']);
    expect(prioridadeDoLead(base({ filaAvisado: 'B07' }), AGORA)!.motivos).toEqual(['Chácara B07 livre — é a vez dele na fila']);
    expect(prioridadeDoLead(base({ criadoEm: AGORA - 3 * H, atendidoEm: null }), AGORA)).toMatchObject({ urgencia: 'hoje', motivos: ['Lead novo (3 h) ainda sem atendimento'] });
  });
  it('quente esfriando entra; frio parado e encerrado/bloqueado ficam fora', () => {
    expect(prioridadeDoLead(base({ score: 70, classe: 'quente', ultimaAtividade: AGORA - 5 * D }), AGORA)!.motivos).toEqual(['Quente (70)', 'Esfriando: 5 dias sem contato']);
    expect(prioridadeDoLead(base(), AGORA)).toBeNull();
    expect(prioridadeDoLead(base({ etapa: 'fechado', aguardandoDesde: AGORA - MIN }), AGORA)).toBeNull();
    expect(prioridadeDoLead(base({ bloqueadoAte: AGORA + D, aguardandoDesde: AGORA - MIN }), AGORA)).toBeNull();
  });
});
