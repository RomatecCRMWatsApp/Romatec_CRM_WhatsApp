import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { podeChamar } from '../shared/equipe';

const { renderCarteirinhas } = await import('./contratos/carteirinhas');

const cartao = {
  nome: 'Maria de Teste', vinculo: 'Titular', unidade: 'Chácara A01 · Quadra A', numero: 'MODELO', validade: '2027-10-27',
  qrToken: 'modelo', foto: null, contratoNumero: 'MODELO', empreendimento: 'Condomínio de Chácaras Bom Jardims',
};

describe('carteirinhas: oficial x rascunho', () => {
  it('rascunho (corretor) sai marcado como "RASCUNHO sem validade"; o oficial não', async () => {
    const oficial = await PDFDocument.load(await renderCarteirinhas([cartao], 'cr80'));
    const rascunho = await PDFDocument.load(await renderCarteirinhas([cartao], 'cr80', { rascunho: true }));
    expect(oficial.getTitle()).toBe('Carteirinhas do condomínio');
    expect(rascunho.getTitle()).toMatch(/RASCUNHO sem validade/);
    expect(rascunho.getPageCount()).toBe(2); // frente e verso, cada face com a tarja
    const a4 = await PDFDocument.load(await renderCarteirinhas([cartao, cartao], 'a4', { rascunho: true }));
    expect(a4.getPageCount()).toBe(1);
  });

  it('empreendedor chega à lista das carteirinhas (só do empreendimento dele, no servidor) e a nada mais dos contratos', () => {
    expect(podeChamar('empreendedor', 'contratos.carteirinhasLista')).toBe(true);
    for (const p of ['contratos.listar', 'contratos.detalhe', 'contratos.criar', 'contratos.carteirinhas']) expect(podeChamar('empreendedor', p)).toBe(false);
  });
});
