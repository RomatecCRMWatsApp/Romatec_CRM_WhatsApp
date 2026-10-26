import { describe, expect, it } from 'vitest';
import { avisoLegal, chacaraCitada, classificar, comAvisoLegal, dentroDoHorario, preencher, TEXTOS_PADRAO, variaveisDaOferta } from '../shared/autoresposta';
import { simular, type CondicoesPagamento } from '../shared/simulador';

const COND: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const LOTES = new Set(['A04', 'A12', 'B22', 'C03']);

describe('classificar (regras, sem custo)', () => {
  it('casos da especificação', () => {
    expect(classificar('quanto fica a parcela?', false).intencao).toBe('valores');
    expect(classificar('quero a c03', false, LOTES)).toEqual({ intencao: 'fechar', chacara: 'C03' });
    expect(classificar('tem a a12?', false, LOTES)).toEqual({ intencao: 'chacara_especifica', chacara: 'A12' });
  });
  it('prioridades e ruídos', () => {
    expect(classificar('quero sair da lista', false).intencao).toBe('optout');
    expect(classificar('Não quero mais receber', false).intencao).toBe('optout');
    expect(classificar('dá desconto no PIX?', false).intencao).toBe('a_vista');
    expect(classificar('onde fica o condomínio?', false).intencao).toBe('mapa');
    expect(classificar('posso agendar uma visita?', false).intencao).toBe('visita');
    expect(classificar('os juros não são caros?', false).intencao).toBe('juros');
    expect(classificar('tem escritura?', false).intencao).toBe('documentacao');
    expect(classificar('Bom dia!', false).intencao).toBe('primeiro_contato');
    expect(classificar('legal', true).intencao).toBe('primeiro_contato');
    expect(classificar('legal', false).intencao).toBe('indefinida');
    // "daqui a 2 dias" não é a chácara A02 quando ela não existe
    expect(chacaraCitada('passo aí daqui a 2 dias', LOTES)).toBeNull();
    expect(chacaraCitada('e a c 3?', LOTES)).toBe('C03');
  });
});

describe('textos com os valores do simulador', () => {
  const sim = simular(3025.11, 6, COND);
  const vars = { ...variaveisDaOferta({ sim, c: COND, disponiveis: 5, condicaoValidaAte: null, entradaParcelas: 6 }), nome: 'Ana', corretor: 'José Romário' };

  it('números iguais ao folder: 6× R$ 8.000 + 120× R$ 1.234,51, à vista R$ 150.000, total R$ 196.141,20', () => {
    expect(vars.entrada_parcela).toBe('R$ 8.000,00');
    expect(vars.parcela_maior).toBe('R$ 1.234,51');
    expect(vars.p12).toBe('R$ 9.631,26');
    expect(vars.avista).toBe('R$ 150.000,00');
    expect(vars.entrada_avista).toBe('R$ 45.000,00');
    expect(vars.total_prazo).toBe('R$ 196.141,20');
    expect(vars.juros_am).toBe('0,4868%');
  });

  it('escassez com a contagem real e sem data inventada; aviso legal no fim de toda mensagem com valores', () => {
    const txt = comAvisoLegal(preencher(TEXTOS_PADRAO.escassez.texto, vars), avisoLegal(vars));
    expect(txt).toContain('somente 5 chácaras');
    expect(txt).toContain('de lançamento e pode mudar sem aviso');
    expect(txt).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(txt.trimEnd().endsWith('(CDC, art. 52)._')).toBe(true);
    const comData = variaveisDaOferta({ sim, c: COND, disponiveis: 5, condicaoValidaAte: '2026-11-30', entradaParcelas: 6 });
    expect(comData.validade_condicao).toBe('válida até 30/11/2026');
    // Sem valores: sem aviso
    expect(comAvisoLegal(preencher(TEXTOS_PADRAO.documentacao.texto, vars), avisoLegal(vars))).not.toContain('CDC');
    for (const k of ['valores', 'primeiro_contato', 'a_vista', 'juros'] as const) {
      expect(comAvisoLegal(preencher(TEXTOS_PADRAO[k].texto, vars), avisoLegal(vars))).toMatch(/\(CDC, art\. 52\)\._$/);
    }
  });

  it('documentação nunca afirma registro ou escritura pronta', () => {
    expect(TEXTOS_PADRAO.documentacao.texto).toContain('fase de aprovação');
    expect(TEXTOS_PADRAO.documentacao.texto).not.toMatch(/registrad[oa] em cartório|já tem escritura/);
  });

  it('horário: 08:00–20:00 em Açailândia', () => {
    expect(dentroDoHorario(Date.parse('2026-10-27T11:00:00Z'))).toBe(true);  // 08:00 local
    expect(dentroDoHorario(Date.parse('2026-10-27T22:59:00Z'))).toBe(true);  // 19:59
    expect(dentroDoHorario(Date.parse('2026-10-27T23:00:00Z'))).toBe(false); // 20:00
    expect(dentroDoHorario(Date.parse('2026-10-27T10:59:00Z'))).toBe(false); // 07:59
  });
});
