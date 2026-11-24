import { describe, expect, it } from 'vitest';
import { situacaoExtrato } from './financeiro/relatorios';

// Extrato por comprador: contrato sem cobranças do comprador só é "aguardando assinatura" se ainda não foi assinado
describe('situação no extrato por comprador', () => {
  it('concessão da proprietária assinada (sem boleto do comprador) não aparece como aguardando assinatura', () => {
    expect(situacaoExtrato({ status: 'ativo', simulacaoJson: { concessao: { valorReferencia: 156864.68 } } }, 0, 0, 0)).toBe('CONCESSAO');
    expect(situacaoExtrato({ status: 'ativo', simulacaoJson: JSON.stringify({ concessao: {} }) }, 0, 0, 0)).toBe('CONCESSAO');
  });
  it('sem cobranças: em assinatura → aguardando; assinado → assinado sem parcelas', () => {
    expect(situacaoExtrato({ status: 'em_assinatura', simulacaoJson: {} }, 0, 0, 0)).toBe('AGUARDANDO_ASSINATURA');
    expect(situacaoExtrato({ status: 'assinado', simulacaoJson: {} }, 0, 0, 0)).toBe('SEM_PARCELAS');
  });
  it('com cobranças segue como antes', () => {
    expect(situacaoExtrato({ status: 'ativo' }, 3, 0, 0)).toBe('QUITADO');
    expect(situacaoExtrato({ status: 'ativo' }, 3, 2, 100)).toBe('EM_ATRASO');
    expect(situacaoExtrato({ status: 'ativo' }, 3, 2, 0)).toBe('EM_DIA');
  });
});
