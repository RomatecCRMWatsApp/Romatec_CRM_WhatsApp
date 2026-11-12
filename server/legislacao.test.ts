import { describe, expect, it } from 'vitest';
import { DISPOSITIVOS, DOUTRINA, TEMAS_LEGISLACAO, buscarDispositivos, citacao } from '../shared/legislacao';

describe('biblioteca de legislação do portal jurídico', () => {
  it('todo tema tem dispositivos e todo dispositivo pertence a um tema, com id único', () => {
    for (const t of TEMAS_LEGISLACAO) expect(DISPOSITIVOS.some(d => d.tema === t.id)).toBe(true);
    expect(new Set(DISPOSITIVOS.map(d => d.id)).size).toBe(DISPOSITIVOS.length);
    expect(DOUTRINA.every(d => TEMAS_LEGISLACAO.some(t => t.id === d.tema))).toBe(true);
  });

  it('busca sem acento em todos os temas e filtra por tema', () => {
    const r = buscarDispositivos('restituicao');
    expect(r.map(d => d.id)).toContain('6766-32a');
    expect(buscarDispositivos('', 'associacao').every(d => d.tema === 'associacao')).toBe(true);
    expect(buscarDispositivos('cancelamento registro').map(d => d.id)).toContain('6015-251a');
    expect(buscarDispositivos('palavra-que-nao-existe')).toEqual([]);
  });

  it('citação pronta traz norma, dispositivo e resumo', () => {
    const d = DISPOSITIVOS.find(x => x.id === 'stj-76')!;
    expect(citacao(d)).toMatch(/^STJ, Súmula 76: A falta de registro/);
  });
});
