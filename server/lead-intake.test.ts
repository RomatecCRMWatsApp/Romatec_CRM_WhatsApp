import { describe, it, expect } from 'vitest';
import {
  normalizePhoneBR,
  buildWelcomeMessage,
  publicLeadSchema,
  origemFromUtm,
  createRateLimiter,
  codigoDaUtm,
} from './lead-intake';
import { detectQualificationIntent } from './qualification-flow';

describe('Lead intake - normalizePhoneBR', () => {
  it('aceita celular formatado com DDD', () => {
    expect(normalizePhoneBR('(99) 9 9181-1246')).toBe('5599991811246');
  });

  it('aceita com +55 e com zero de operadora', () => {
    expect(normalizePhoneBR('+55 99 99181-1246')).toBe('5599991811246');
    expect(normalizePhoneBR('099991811246')).toBe('5599991811246');
  });

  it('corrige número antigo sem o 9', () => {
    expect(normalizePhoneBR('99 9181-1246')).toBe('5599991811246');
  });

  it('rejeita fixo, curto e lixo', () => {
    expect(normalizePhoneBR('(99) 3538-1234')).toBeNull();
    expect(normalizePhoneBR('12345')).toBeNull();
    expect(normalizePhoneBR('abc')).toBeNull();
    expect(normalizePhoneBR('')).toBeNull();
  });
});

describe('Lead intake - mensagem de boas-vindas', () => {
  it('usa primeiro nome e o imóvel', () => {
    const msg = buildWelcomeMessage('maria das graças', 'Loteamento Jardim Romatec');
    expect(msg).toContain('*Maria*');
    expect(msg).toContain('*Loteamento Jardim Romatec*');
  });

  it('sem imóvel fala de lotes e chácaras', () => {
    expect(buildWelcomeMessage('João')).toContain('lotes e chácaras');
  });
});

describe('Lead intake - formulário público', () => {
  const base = { nome: 'João Silva', phone: '99991811246', consent: true, propertyId: 3 };

  it('aceita envio válido', () => {
    expect(publicLeadSchema.safeParse(base).success).toBe(true);
  });

  it('exige consentimento', () => {
    expect(publicLeadSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });

  it('exige nome', () => {
    expect(publicLeadSchema.safeParse({ ...base, nome: ' ' }).success).toBe(false);
  });

  it('honeypot passa na validação (a rota descarta e finge sucesso pro robô)', () => {
    const r = publicLeadSchema.safeParse({ ...base, website: 'http://spam' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.website).toBe('http://spam');
  });

  it('origem vem da UTM', () => {
    expect(origemFromUtm({ source: 'instagram' })).toBe('instagram_bio');
    expect(origemFromUtm({ source: 'ig' })).toBe('instagram_bio');
    expect(origemFromUtm({ source: 'google' })).toBe('google_ads');
    expect(origemFromUtm({ source: 'meta', medium: 'lead_ads' })).toBe('instagram_ads');
    expect(origemFromUtm({ source: 'site-parceiro' })).toBe('site');
    expect(origemFromUtm(undefined)).toBe('site');
  });
});

describe('Lead intake - rate limit', () => {
  it('bloqueia acima do limite e libera após a janela', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('1.1.1.1', 0)).toBe(true);
    expect(allow('1.1.1.1', 10)).toBe(true);
    expect(allow('1.1.1.1', 20)).toBe(false);
    expect(allow('2.2.2.2', 20)).toBe(true);
    expect(allow('1.1.1.1', 1500)).toBe(true);
  });
});

describe('Opt-out PARAR', () => {
  it('PARAR encerra a conversa', () => {
    expect(detectQualificationIntent('PARAR')).toBe('NAO');
    expect(detectQualificationIntent('pare!')).toBe('NAO');
    expect(detectQualificationIntent('sair')).toBe('NAO');
  });

  it('"não" sozinho continua neutro', () => {
    expect(detectQualificationIntent('não')).toBe('NEUTRO');
  });
});

describe('Lead intake - utm_campaign liga o lead à campanha cadastrada', () => {
  it('normaliza o utm_campaign para o código da campanha', () => {
    expect(codigoDaUtm('BJ-IG-BIO')).toBe('BJ-IG-BIO');
    expect(codigoDaUtm('bj-ig-bio')).toBe('BJ-IG-BIO');
    expect(codigoDaUtm('#bj_status_wa')).toBe('BJ-STATUS-WA');
    expect(codigoDaUtm(' bj story ')).toBe('BJ-STORY');
  });
  it('texto que não pode ser código fica de fora (cai só no utmCampaign)', () => {
    expect(codigoDaUtm('outubro/2026 chácaras')).toBeNull();
    expect(codigoDaUtm('x')).toBeNull();
  });
});
