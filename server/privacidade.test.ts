import { describe, expect, it } from 'vitest';
import { metaDaRota } from './seo';
import { ESCRITORIO } from '../shared/escritorio';
import { ROTA_PRIVACIDADE, SECOES_PRIVACIDADE, TITULO_PRIVACIDADE } from '../shared/privacidade';

describe('política de privacidade (/privacidade)', () => {
  it('é página pública indexável, com título próprio', () => {
    const m = metaDaRota(ROTA_PRIVACIDADE);
    expect(m !== 'imovel' && m.title).toBe(TITULO_PRIVACIDADE);
    expect(m !== 'imovel' && m.indexavel).toBe(true);
  });

  it('identifica o controlador e explica como sair e exercer os direitos (LGPD)', () => {
    const texto = SECOES_PRIVACIDADE.flatMap(s => [s.titulo, ...(s.paragrafos ?? []), ...(s.itens ?? [])]).join(' ');
    expect(texto).toContain(ESCRITORIO.cnpj);
    expect(texto).toContain(ESCRITORIO.razaoSocial);
    expect(texto).toMatch(/encarregado/i);
    expect(texto).toMatch(/"sair"/);
    expect(texto).toMatch(/art\. 18/);
    expect(texto).toMatch(/ANPD/);
  });
});
