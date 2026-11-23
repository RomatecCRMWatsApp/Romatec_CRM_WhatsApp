import { describe, expect, it } from 'vitest';
import { metaDaRota } from './seo';
import { DESCRICAO_ESCRITORIO, LINKS_MAPA_ESCRITORIO, ROTA_ESCRITORIO } from '../shared/escritorio';

describe('página do escritório', () => {
  it('tem prévia própria, endereço, referência e horário', () => {
    const m = metaDaRota(ROTA_ESCRITORIO);
    expect(m !== 'imovel' && m.image).toBe('/brand/og-escritorio.jpg');
    expect(DESCRICAO_ESCRITORIO).toMatch(/Rua São Raimundo, n\.º 10/);
    expect(DESCRICAO_ESCRITORIO).toMatch(/Hotel Girafa/);
    expect(DESCRICAO_ESCRITORIO).toMatch(/9h às 12h e das 15h às 17h/);
    expect(DESCRICAO_ESCRITORIO).toMatch(/somente com agendamento/);
    expect(LINKS_MAPA_ESCRITORIO.google).toContain('google.com/maps');
  });
});
