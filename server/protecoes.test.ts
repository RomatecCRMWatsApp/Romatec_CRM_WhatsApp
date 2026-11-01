import { describe, expect, it } from 'vitest';
import { criarLimiteGlobal, frameAncestors, ipReal, LIMITE_MIN, precisaCorpoGrande, cabecalhosSeguranca } from './_core/protecoes';

const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers, socket: { remoteAddress: '10.0.0.1' }, protocol: 'http' } as any);
function res() {
  const h: Record<string, string> = {};
  const r: any = { statusCode: 200, corpo: null, setHeader: (k: string, v: string) => { h[k] = v; }, status(c: number) { r.statusCode = c; return r; }, json(b: any) { r.corpo = b; return r; } };
  return { r, h };
}

describe('proteções gerais', () => {
  it('corpo grande só para o CRM logado (tRPC ou cookie de sessão)', () => {
    expect(precisaCorpoGrande(req('/api/trpc/contratos.criar'))).toBe(true);
    expect(precisaCorpoGrande(req('/api/qualquer', { cookie: 'app_session_id=x' }))).toBe(true);
    expect(precisaCorpoGrande(req('/api/public/lead'))).toBe(false);
    expect(precisaCorpoGrande(req('/api/webhook/asaas'))).toBe(false);
  });

  it('IP real é o último do X-Forwarded-For', () => {
    expect(ipReal(req('/', { 'x-forwarded-for': '1.1.1.1, 200.0.0.9' }))).toBe('200.0.0.9');
    expect(ipReal(req('/'))).toBe('10.0.0.1');
  });

  it('limite por IP: sem sessão para em 180/min, webhooks e páginas não contam, a janela renova', () => {
    let t = 1_000_000;
    const lim = criarLimiteGlobal(() => t);
    const chamar = (r: any) => { const { r: s } = res(); let passou = false; lim(r, s, () => { passou = true; }); return { passou, s }; };
    const pub = () => req('/api/public/lead', { 'x-forwarded-for': '9.9.9.9' });
    for (let i = 0; i < LIMITE_MIN.semSessao; i++) expect(chamar(pub()).passou).toBe(true);
    const bloqueada = chamar(pub());
    expect(bloqueada.passou).toBe(false);
    expect(bloqueada.s.statusCode).toBe(429);
    // Outro IP, webhook e página do site seguem livres
    expect(chamar(req('/api/public/lead', { 'x-forwarded-for': '8.8.8.8' })).passou).toBe(true);
    expect(chamar(req('/api/webhook/asaas', { 'x-forwarded-for': '9.9.9.9' })).passou).toBe(true);
    expect(chamar(req('/bom-jardims', { 'x-forwarded-for': '9.9.9.9' })).passou).toBe(true);
    // Com sessão o limite é maior (contado à parte)
    expect(chamar(req('/api/trpc/x', { 'x-forwarded-for': '9.9.9.9', cookie: 'app_session_id=a' })).passou).toBe(true);
    t += 60_000;
    expect(chamar(pub()).passou).toBe(true);
  });

  it('cabeçalhos de segurança; HSTS só em HTTPS; iframe só nos domínios da Romatec', () => {
    const { r, h } = res();
    cabecalhosSeguranca(req('/', { 'x-forwarded-proto': 'https' }), r, () => {});
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Strict-Transport-Security']).toContain('max-age=');
    expect(h['Content-Security-Policy']).toBe(`frame-ancestors ${frameAncestors()}`);
    const { r: r2, h: h2 } = res();
    cabecalhosSeguranca(req('/'), r2, () => {});
    expect(h2['Strict-Transport-Security']).toBeUndefined();
    expect(frameAncestors({ FRAME_ANCESTORS_EXTRA: 'https://parceiro.com.br' } as any)).toContain('https://parceiro.com.br');
  });
});
