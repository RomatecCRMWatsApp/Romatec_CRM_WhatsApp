import { describe, it, expect } from 'vitest';
import { montarAbertura } from './inbound';

describe('Campanha ligada a empreendimento (BJ-IG-PAGO → Bom Jardims)', () => {
  it('abertura do Bom Jardims: lista exclusiva do empreendimento, corretor com CRECI, sem preço e sem as 3 perguntas do bot', () => {
    const m = montarAbertura({ funil: 'comprador', nome: 'maria silva', empreendimento: { slug: 'bom-jardims', nome: 'Condomínio de Chácaras Bom Jardims' } });
    expect(m).toContain('Olá, Maria!');
    expect(m).toContain('*lista exclusiva* do empreendimento *Condomínio de Chácaras Bom Jardims*');
    expect(m).toContain('CRECI/MA 4.705');
    expect(m).toContain('vai te chamar pelo número pessoal dele, *(99) 9 9181-1246*');
    expect(m).toContain('Para sair da lista, responda SAIR.');
    expect(m).not.toMatch(/R\$|valor|3 perguntas/i);
    expect(m.split('\n').length).toBeGreaterThan(3);
  });

  it('outro empreendimento: a mesma mensagem padrão, com o nome dele', () => {
    const m = montarAbertura({ funil: 'comprador', nome: null, empreendimento: { slug: 'outro', nome: 'Residencial X' } });
    expect(m).toContain('*lista exclusiva* do empreendimento *Residencial X*');
    expect(m).toContain('vai te chamar pelo número pessoal dele, *(99) 9 9181-1246*');
    expect(m).not.toContain('3 perguntas');
  });

  it('empreendimento sem nome cadastrado: lista exclusiva genérica', () => {
    const m = montarAbertura({ funil: 'comprador', nome: 'Ana', empreendimento: { slug: 'sumiu', nome: null } });
    expect(m).toContain('Você está na nossa *lista exclusiva*.');
    expect(m).not.toContain('sumiu');
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

describe('Mensagem pronta do link da campanha', () => {
  it('campanha ligada ao Bom Jardims cita o empreendimento e mantém o código', async () => {
    const { mensagemPreenchida, extrairAtribuicao } = await import('./atribuicao');
    const m = mensagemPreenchida({ funil: 'comprador', campanhaCodigo: 'IG-OUT26-CHAC', empreendimentoNome: 'Condomínio de Chácaras Bom Jardims' });
    expect(m).toBe('Olá! Quero saber mais sobre o Condomínio de Chácaras Bom Jardims (#IG-OUT26-CHAC).');
    expect(extrairAtribuicao(m).campanhaCodigo).toBe('IG-OUT26-CHAC');
    expect(extrairAtribuicao(m).funilSugerido).not.toBe('proprietario');
    expect(mensagemPreenchida({ funil: 'comprador', campanhaCodigo: 'X-1A' })).toContain('imóveis da Romatec');
  });
});
