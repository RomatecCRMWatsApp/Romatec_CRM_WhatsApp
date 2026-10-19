import { describe, it, expect } from 'vitest';
import { leadInativo } from './inativo';

describe('Lead desativado some da lista', () => {
  const agora = Date.UTC(2026, 9, 19, 12);
  it('descartado, sem interesse, perdido ou bloqueado (SAIR)', () => {
    expect(leadInativo({ stage: 'descartado' }, agora)).toBe(true);
    expect(leadInativo({ stage: 'sem_interesse' }, agora)).toBe(true);
    expect(leadInativo({ etapa: 'perdido' }, agora)).toBe(true);
    expect(leadInativo({ stage: 'qual_etapa_1', blockedUntil: new Date(agora + 86400_000) }, agora)).toBe(true);
  });
  it('ativo: em qualificação, qualificado, bloqueio já vencido', () => {
    expect(leadInativo({ stage: 'qual_etapa_1' }, agora)).toBe(false);
    expect(leadInativo({ stage: 'qualificado', etapa: 'proposta' }, agora)).toBe(false);
    expect(leadInativo({ stage: 'nao_iniciado', blockedUntil: new Date(agora - 1000) }, agora)).toBe(false);
  });
});
