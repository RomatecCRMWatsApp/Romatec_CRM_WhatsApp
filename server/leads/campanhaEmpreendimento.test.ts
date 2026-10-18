import { describe, it, expect } from 'vitest';
import { montarAbertura, RODAPE_LGPD } from './inbound';

describe('Campanha ligada a empreendimento (BJ-IG-PAGO → Bom Jardims)', () => {
  it('abertura do Bom Jardims: roteiro próprio, corretor com CRECI, sem preço e sem as 3 perguntas do bot', () => {
    const m = montarAbertura({ funil: 'comprador', nome: 'maria silva', empreendimento: { slug: 'bom-jardims', nome: 'Condomínio de Chácaras Bom Jardims' } });
    expect(m).toContain('Olá, Maria!');
    expect(m).toContain('Condomínio de Chácaras Bom Jardims');
    expect(m).toContain('CRECI/MA 4.705');
    expect(m).toContain(RODAPE_LGPD);
    expect(m).not.toMatch(/R\$|valor|3 perguntas/i);
    expect(m.split('\n').length).toBeGreaterThan(3);
  });

  it('outro empreendimento: mensagem genérica de atendimento humano', () => {
    const m = montarAbertura({ funil: 'comprador', nome: null, empreendimento: { slug: 'outro', nome: 'Residencial X' } });
    expect(m).toContain('*Residencial X*');
    expect(m).toContain('vai falar com você');
    expect(m).not.toContain('3 perguntas');
  });

  it('sem empreendimento continua a abertura de sempre', () => {
    expect(montarAbertura({ funil: 'comprador', nome: 'Ana' })).toContain('3 perguntas');
  });
});
