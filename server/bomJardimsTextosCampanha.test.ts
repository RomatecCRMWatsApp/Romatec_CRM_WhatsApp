import { describe, expect, it } from 'vitest';
import { aplicarTrocas, FICHA_SEMENTE, TROCAS_FICHA } from './_core/migrations/bomJardimsFichaCampanha';
import { SOBRE_BOM_JARDIMS, FAQ_BOM_JARDIMS, DESCRICAO_BOM_JARDIMS } from '../shared/bomJardimsSeo';
import { DESCRICAO_OBRAS, LANCAMENTO_OBRAS } from '../shared/obrasBomJardim';
import * as links from '../shared/linksDivulgacao';

const PROIBIDOS = [/cal[çc]ada/i, /Licen[çc]a de Opera[çc][aã]o/i, /certificad[ao] no SIGEF/i, /100% documentado/i, /14 de novembro/i, /14\/11/, /liberado para vendas/i];

describe('Textos públicos do Bom Jardims (campanha)', () => {
  it('a ficha semente não afirma o que ainda não foi entregue', () => {
    for (const re of [/Licen[çc]a de Opera[çc][aã]o/i, /14 de novembro/i]) expect(FICHA_SEMENTE).not.toMatch(re);
    expect(FICHA_SEMENTE).toMatch(/5 de dezembro de 2026/);
    expect(FICHA_SEMENTE).toMatch(/em andamento/);
  });
  it('a migração troca os trechos antigos e preserva o resto', () => {
    const antigo = `intro\n${TROCAS_FICHA.map(([de]) => de).join('\n')}\nfim`;
    const novo = aplicarTrocas(antigo);
    for (const [de, para] of TROCAS_FICHA) { expect(novo).not.toContain(de); expect(novo).toContain(para); }
    expect(novo.startsWith('intro')).toBe(true);
    expect(aplicarTrocas(novo)).toBe(novo);
  });
  it('SEO, obras e textos de divulgação sem afirmações proibidas', () => {
    const texto = JSON.stringify({ s: SOBRE_BOM_JARDIMS, f: FAQ_BOM_JARDIMS, d: DESCRICAO_BOM_JARDIMS, DESCRICAO_OBRAS, links });
    for (const re of PROIBIDOS) expect(texto).not.toMatch(re);
    expect(LANCAMENTO_OBRAS).toBe('5 de dezembro');
  });
});
