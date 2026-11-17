/**
 * Caracterização do endereço público usado nos links do financeiro (boleto, Pix, carnê, recibo).
 * Com a variável definida, ausente e vazia; a variável é lida a cada chamada (não no carregamento do módulo).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { urlPublica } from './financeiro/servico';
import { urlPixDaCobranca } from './financeiro/dados';

const original = process.env.APP_PUBLIC_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
afterEach(() => { if (original === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = original; });

describe('endereço público do financeiro', () => {
  it('variável definida: usa ela e tira as barras do fim', () => {
    process.env.APP_PUBLIC_URL = 'https://crm.exemplo.test//';
    expect(urlPublica()).toBe('https://crm.exemplo.test');
    expect(urlPixDaCobranca(12)).toMatch(/^https:\/\/crm\.exemplo\.test\/pix\/[^/]+$/);
  });
  it('variável ausente: cai em https://romateccrm.com', () => {
    delete process.env.APP_PUBLIC_URL;
    expect(urlPublica()).toBe('https://romateccrm.com');
    expect(urlPixDaCobranca(12)).toMatch(/^https:\/\/romateccrm\.com\/pix\//);
  });
  it('variável vazia: também cai em https://romateccrm.com', () => {
    process.env.APP_PUBLIC_URL = '';
    expect(urlPublica()).toBe('https://romateccrm.com');
  });
  it('não normaliza além da barra final (caminho e caixa ficam como vieram)', () => {
    process.env.APP_PUBLIC_URL = 'https://CRM.exemplo.test/base/';
    expect(urlPublica()).toBe('https://CRM.exemplo.test/base');
  });
  it('lê a variável a cada chamada', () => {
    process.env.APP_PUBLIC_URL = 'https://a.test';
    expect(urlPublica()).toBe('https://a.test');
    process.env.APP_PUBLIC_URL = 'https://b.test';
    expect(urlPublica()).toBe('https://b.test');
  });
});
