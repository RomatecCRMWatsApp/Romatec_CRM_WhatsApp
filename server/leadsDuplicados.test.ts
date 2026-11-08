import { describe, expect, it } from 'vitest';
import { chaveTelefoneBR, variantesTelefoneBR } from '../shared/telefone';
import { gruposDuplicados } from './leads/mesclarDuplicados';

describe('mesma pessoa em dois leads (celular com e sem o 9)', () => {
  it('as formas do mesmo celular se reconhecem', () => {
    const a = variantesTelefoneBR('+559992098091');      // WhatsApp, sem o 9
    const b = variantesTelefoneBR('5599992098091');      // formulário do Meta, com o 9
    expect(a).toContain('5599992098091');
    expect(b).toContain('559992098091');
    expect(b).toContain('+5599992098091');
    expect(chaveTelefoneBR('+559992098091')).toBe(chaveTelefoneBR('(99) 99209-8091'));
  });
  it('agrupa os duplicados e mantém o mais antigo primeiro', () => {
    const g = gruposDuplicados([
      { id: 7, phone: '+5599992098091', createdAt: '2026-11-08T10:00:00Z' },
      { id: 3, phone: '559992098091', createdAt: '2026-11-07T10:00:00Z' },
      { id: 9, phone: '5599991811246', createdAt: '2026-11-01T10:00:00Z' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].map(x => x.id)).toEqual([3, 7]);
  });
  it('números diferentes não se misturam', () => {
    expect(chaveTelefoneBR('5599992098091')).not.toBe(chaveTelefoneBR('5599992098092'));
  });
});
