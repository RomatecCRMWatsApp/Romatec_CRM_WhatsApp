import { describe, expect, it } from 'vitest';
import { montarCondicoes, separarCondicoes, textoCondicaoEspecifica } from '../shared/condicoesEspecificas';

describe('condições específicas pré-redigidas', () => {
  it('monta as padrão marcadas e o texto livre; separa de volta', () => {
    const t = montarCondicoes(['liberacao_uso', 'congelamento'], 'Entrega das chaves em março.', { inicioComplemento: 15 });
    const [a, b, c] = t.split('\n');
    expect(a).toMatch(/^Congelamento do complemento da entrada: .*no 15º mês contado do pagamento do valor do ato/);
    expect(b).toMatch(/^Liberação de uso: .*quitação da 3ª \(terceira\) parcela do financiamento/);
    expect(c).toBe('Entrega das chaves em março.');
    expect(separarCondicoes(t)).toEqual({ marcadas: ['congelamento', 'liberacao_uso'], livre: 'Entrega das chaves em março.' });
    expect(separarCondicoes('Não há.')).toEqual({ marcadas: [], livre: '' });
    expect(textoCondicaoEspecifica('congelamento', { inicioComplemento: 18 })).toMatch(/18º mês/);
  });
});
