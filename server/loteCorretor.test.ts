import { describe, expect, it } from 'vitest';
import { SITUACOES_CORRETOR, corretorPodeAlterarLote } from '../shared/lotes';

describe('corretor muda a situação da chácara', () => {
  it('pode reserva, sinal e venda; não pode bloqueio nem quitação', () => {
    for (const s of ['reservado', 'entrada', 'vendido_parcelado', 'vendido_avista', 'interesse']) expect(SITUACOES_CORRETOR).toContain(s);
    expect(SITUACOES_CORRETOR).not.toContain('bloqueado');
    expect(SITUACOES_CORRETOR).not.toContain('quitado');
  });
  it('só em chácara livre ou dele', () => {
    expect(corretorPodeAlterarLote({ situacao: 'disponivel', corretorId: null }, 5)).toBe(true);
    expect(corretorPodeAlterarLote({ situacao: 'reservado', corretorId: 5 }, 5)).toBe(true);
    expect(corretorPodeAlterarLote({ situacao: 'reservado', corretorId: 9 }, 5)).toBe(false);
    expect(corretorPodeAlterarLote({ situacao: 'bloqueado', corretorId: null }, 5)).toBe(false);
    expect(corretorPodeAlterarLote({ situacao: 'quitado', corretorId: 5 }, 5)).toBe(false);
  });
});
