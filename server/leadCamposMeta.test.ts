import { describe, expect, it } from 'vitest';
import { campoDoRoteiro, ehFormularioQualificado, pontuar } from '../shared/leadScoreForm';

describe('campos do formulário do Meta pelo texto da pergunta', () => {
  it('reconhece as 6 perguntas mesmo sem nome de campo definido', () => {
    expect(campoDoRoteiro('o_que_você_procura?')).toBe('procura');
    expect(campoDoRoteiro('quando_pretende_comprar?')).toBe('momento');
    expect(campoDoRoteiro('entrada_de_r$_10_mil_+_parcelas_fixas:_como_prefere_pagar?')).toBe('pagamento');
    expect(campoDoRoteiro('o_que_é_mais_importante_para_você?')).toBe('prioridade');
    expect(campoDoRoteiro('onde_você_mora?')).toBe('regiao');
    expect(campoDoRoteiro('quer_conhecer_a_chácara_pessoalmente?')).toBe('visita');
  });
  it('continua aceitando os nomes curtos e ignora os campos de contato', () => {
    expect(campoDoRoteiro('momento')).toBe('momento');
    expect(campoDoRoteiro('full_name')).toBeNull();
    expect(campoDoRoteiro('city')).toBeNull();
    expect(campoDoRoteiro('phone_number')).toBeNull();
  });
  it('um cadastro do Meta com as perguntas por extenso sai com nota A', () => {
    const extras: Record<string, string> = {
      'quando_pretende_comprar?': 'Agora, nos próximos 30 dias',
      'entrada_de_r$_10_mil_+_parcelas_fixas:_como_prefere_pagar?': 'A entrada + parcelas cabem no meu planejamento',
      'o_que_é_mais_importante_para_você?': 'Contato com a natureza e o rio',
      'onde_você_mora?': 'Moro em Açailândia',
      'quer_conhecer_a_chácara_pessoalmente?': 'Sim, neste fim de semana',
    };
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(extras)) { const c = campoDoRoteiro(k); if (c) r[c] = v; }
    expect(ehFormularioQualificado(r)).toBe(true);
    expect(pontuar(r)).toMatchObject({ leadScore: 100, faixa: 'A' });
  });
});

describe('respostasDoRoteiro com o formulário do Meta', () => {
  it('lê o formulário novo pelo texto das perguntas e ignora o formulário antigo', async () => {
    process.env.DATABASE_DRIVER = 'sqlite'; process.env.SQLITE_PATH = ':memory:';
    const { respostasDoRoteiro } = await import('./leads/leadsQualificados');
    const novo = respostasDoRoteiro({
      full_name: 'Ana', 'o_que_você_procura?': 'Chácara em condomínio fechado', 'quando_pretende_comprar?': 'De 1 a 3 meses',
      'onde_você_mora?': 'Moro em Açailândia', 'quer_conhecer_a_chácara_pessoalmente?': 'Sim, em outro dia',
    });
    expect(novo).toMatchObject({ procura: 'Chácara em condomínio fechado', momento: 'De 1 a 3 meses', regiao: 'Moro em Açailândia', visita: 'Sim, em outro dia' });
    const antigo = respostasDoRoteiro({ 'você_procura_a_chácara_para:': 'lazer', 'quando_pretende_comprar?': 'até_3_meses' });
    expect(antigo).toEqual({});
    expect(respostasDoRoteiro({ momento: 'Agora', visita: 'Sim' })).toEqual({ momento: 'Agora', visita: 'Sim' });
  });
});
