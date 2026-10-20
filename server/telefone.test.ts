import { describe, it, expect } from 'vitest';
import { normalizePhoneBR, mascaraTelefoneBR, exibirTelefoneBR } from '../shared/telefone';
import { normalizePhoneBR as doIntake } from './lead-intake';

describe('Telefone BR (destino da lista no WhatsApp)', () => {
  it('normaliza com ou sem DDI/9 para o formato da Z-API (55 + DDD + 9 + 8)', () => {
    for (const n of ['(99) 99181-1246', '99 9 9181-1246', '+55 (99) 99181-1246', '5599991811246', '099991811246', '(99) 9181-1246']) {
      expect(normalizePhoneBR(n)).toBe('5599991811246');
    }
  });
  it('recusa fixo, incompleto e lixo', () => {
    for (const n of ['(99) 3538-1234', '9918112', '', 'abc', '+1 415 555 0100']) expect(normalizePhoneBR(n)).toBeNull();
  });
  it('lead-intake usa a mesma regra', () => {
    expect(doIntake).toBe(normalizePhoneBR);
  });
  it('máscara enquanto digita, com e sem DDI, sem travar o backspace', () => {
    expect(mascaraTelefoneBR('9')).toBe('(9');
    expect(mascaraTelefoneBR('99')).toBe('(99');
    expect(mascaraTelefoneBR('(99) ')).toBe('(99');
    expect(mascaraTelefoneBR('999')).toBe('(99) 9');
    expect(mascaraTelefoneBR('9991811')).toBe('(99) 9181-1');
    expect(mascaraTelefoneBR('9935381234')).toBe('(99) 3538-1234');
    expect(mascaraTelefoneBR('99991811246')).toBe('(99) 99181-1246');
    expect(mascaraTelefoneBR('5599991811246')).toBe('+55 (99) 99181-1246');
    expect(mascaraTelefoneBR('+55 99')).toBe('+55 (99');
    expect(normalizePhoneBR(mascaraTelefoneBR('5599991811246'))).toBe('5599991811246');
    expect(normalizePhoneBR(mascaraTelefoneBR('999918112469999'))).toBeNull(); // número a mais: recusado
  });
  it('exibição do número normalizado', () => {
    expect(exibirTelefoneBR('5599991811246')).toBe('+55 (99) 99181-1246');
  });
});
