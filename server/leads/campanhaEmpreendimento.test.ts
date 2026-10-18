import { describe, it, expect } from 'vitest';
import { montarAbertura, RODAPE_LGPD } from './inbound';

describe('Campanha ligada a empreendimento (BJ-IG-PAGO → Bom Jardims)', () => {
  it('abertura do Bom Jardims: roteiro próprio, corretor com CRECI, sem preço e sem as 3 perguntas do bot', () => {
    const m = montarAbertura({ funil: 'comprador', nome: 'maria silva', empreendimento: { slug: 'bom-jardims', nome: 'Condomínio de Chácaras Bom Jardims' } });
    expect(m).toContain('Olá, Maria!');
    expect(m).toContain('Condomínio de Chácaras Bom Jardims');
    expect(m).toContain('CRECI/MA 4.705');
    expect(m).toContain('vai te chamar pelo número pessoal dele, *(99) 9 9181-1246*');
    expect(m).toContain(RODAPE_LGPD);
    expect(m).not.toMatch(/R\$|valor|3 perguntas/i);
    expect(m.split('\n').length).toBeGreaterThan(3);
  });

  it('outro empreendimento: mensagem genérica de atendimento humano', () => {
    const m = montarAbertura({ funil: 'comprador', nome: null, empreendimento: { slug: 'outro', nome: 'Residencial X' } });
    expect(m).toContain('*Residencial X*');
    expect(m).toContain('vai te chamar pelo número pessoal dele, *(99) 9 9181-1246*');
    expect(m).not.toContain('3 perguntas');
  });

  it('sem empreendimento continua a abertura de sempre', () => {
    expect(montarAbertura({ funil: 'comprador', nome: 'Ana' })).toContain('3 perguntas');
  });
});

describe('O corretor chama pelo número pessoal (lead fala primeiro com o CRM)', () => {
  it('proprietário, handoff e fim da qualificação avisam o número do José', async () => {
    const { MSG_HANDOFF, MSG_COMPLETA } = await import('./iaQualificacao');
    const prop = montarAbertura({ funil: 'proprietario', nome: 'João' });
    for (const m of [prop, MSG_HANDOFF, MSG_COMPLETA]) expect(m).toContain('(99) 9 9181-1246');
    expect(MSG_HANDOFF).not.toContain('por aqui');
    expect(MSG_COMPLETA).not.toContain('por aqui');
  });
});
