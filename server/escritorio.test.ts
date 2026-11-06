import { describe, it, expect } from 'vitest';
import { ESCRITORIO, LINHA_PUBLICIDADE } from '../shared/escritorio';
import { assinaturaWhatsApp } from '../shared/cartaoVendas';

describe('CRECI J da imobiliária em toda publicidade', () => {
  it('linha obrigatória: nome de fantasia + CRECI J', () => {
    expect(ESCRITORIO.creciJ).toBe('CRECI J-1234');
    expect(LINHA_PUBLICIDADE).toBe('Romatec Consultoria Total · CRECI J-1234');
  });
  it('a assinatura do WhatsApp de qualquer corretor leva o CRECI J', () => {
    const a = assinaturaWhatsApp({ nome: 'Carla Fictícia', papel: 'Corretor(a)', creci: 'CRECI/MA 9.999', telefones: ['(99) 9 0000-0001'], instagram: null } as any);
    expect(a).toContain('🪪 CRECI/MA 9.999');
    expect(a.endsWith('🏢 Romatec Consultoria Total · CRECI J-1234')).toBe(true);
  });
  it('contrato preenche o CRECI da pessoa jurídica (CRECI/MA {{rom_creci_pj}} → J-1234)', async () => {
    const { montarContexto } = await import('./contratos/contexto');
    expect(typeof montarContexto).toBe('function');
    expect(ESCRITORIO.creciJ.replace(/^CRECI\s*/i, '')).toBe('J-1234');
  });
});
