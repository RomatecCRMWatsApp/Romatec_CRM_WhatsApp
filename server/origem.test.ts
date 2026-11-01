import { describe, expect, it } from 'vitest';
import { origemCruzadaComSessao } from './_core/origem';

const req = (method: string, headers: Record<string, string>) => ({ method, headers } as any);
const sessao = 'app_session_id=abc; outro=1';

describe('CSRF: escrita com sessão vinda de outro site', () => {
  it('recusa POST com sessão e Origin de outro host', () => {
    expect(origemCruzadaComSessao(req('POST', { cookie: sessao, origin: 'https://site-malicioso.com', host: 'romateccrm.com' }))).toBe(true);
    expect(origemCruzadaComSessao(req('POST', { cookie: sessao, 'sec-fetch-site': 'cross-site', host: 'romateccrm.com' }))).toBe(true);
  });
  it('aceita a mesma origem (inclusive atrás do proxy), GET, webhooks e formulários sem sessão', () => {
    expect(origemCruzadaComSessao(req('POST', { cookie: sessao, origin: 'https://romateccrm.com', host: 'romateccrm.com' }))).toBe(false);
    expect(origemCruzadaComSessao(req('POST', { cookie: sessao, origin: 'https://romateccrm.com', host: 'interno:8080', 'x-forwarded-host': 'romateccrm.com' }))).toBe(false);
    expect(origemCruzadaComSessao(req('GET', { cookie: sessao, origin: 'https://site-malicioso.com', host: 'romateccrm.com' }))).toBe(false);
    expect(origemCruzadaComSessao(req('POST', { host: 'romateccrm.com' }))).toBe(false);
    expect(origemCruzadaComSessao(req('POST', { origin: 'https://romatecavalieimob.com.br', host: 'romateccrm.com' }))).toBe(false);
    expect(origemCruzadaComSessao(req('POST', { cookie: sessao, host: 'romateccrm.com', 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });
});
