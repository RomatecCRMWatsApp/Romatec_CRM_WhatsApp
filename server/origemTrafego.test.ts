import { describe, it, expect } from 'vitest';
import { classificarOrigem, limparReferrer, hostDe, linhaOrigem } from '../shared/origemTrafego';
import { rotuloUtm } from './lead-intake';
import { tipoDoCanal } from './leads/relatorio';
import { rotuloCanal } from './leads/inbound';

describe('Origem do visitante (mesma regra do AvalieImob)', () => {
  it('Google sem UTM = busca orgânica', () => {
    expect(classificarOrigem(null, { referrer: 'https://www.google.com/' })).toEqual({ canal: 'busca_organica', rotulo: 'Google (orgânico)', host: 'google.com' });
    expect(classificarOrigem({}, { referrer: 'https://www.google.com.br/' }).canal).toBe('busca_organica');
    expect(classificarOrigem(null, { referrer: 'https://www.bing.com/search' }).rotulo).toBe('Bing (orgânico)');
  });

  it('redes e links compartilhados', () => {
    expect(classificarOrigem(null, { referrer: 'https://l.instagram.com/' }).canal).toBe('instagram_organico');
    expect(classificarOrigem(null, { referrer: 'https://m.facebook.com/' }).canal).toBe('facebook_organico');
    expect(classificarOrigem(null, { referrer: 'https://web.whatsapp.com/' }).canal).toBe('indicacao');
    expect(classificarOrigem(null, { referrer: 'https://www.youtube.com/' }).canal).toBe('outras_redes');
    expect(classificarOrigem(null, { referrer: 'https://www.olx.com.br/' }).canal).toBe('portal_olx');
  });

  it('site de terceiro, direto e navegação interna', () => {
    expect(classificarOrigem(null, { referrer: 'https://romatecavalieimob.com.br/blog' })).toMatchObject({ canal: 'site', rotulo: 'Site parceiro (romatecavalieimob.com.br)' });
    expect(classificarOrigem(null, { referrer: null })).toMatchObject({ canal: 'site', host: null });
    expect(classificarOrigem(null, { referrer: 'https://romateccrm.com/imoveis' }).rotulo).toContain('Direto');
    expect(classificarOrigem(null, {})).toMatchObject({ canal: 'site' });
  });

  it('UTM vence o referrer (quem decide é a campanha/UTM)', () => {
    expect(classificarOrigem({ source: 'instagram' }, { referrer: 'https://www.google.com/' }).canal).toBeNull();
    expect(rotuloUtm({ source: 'instagram', medium: 'bio' })).toBe('Link marcado: instagram · bio');
  });

  it('gclid sem UTM = Google Ads', () => {
    expect(classificarOrigem(null, { referrer: 'https://www.google.com/', paginaEntrada: '/bom-jardims?gclid=abc' }).canal).toBe('google_ads');
  });

  it('referrer sem query string (pode ter dados pessoais)', () => {
    expect(limparReferrer('https://www.google.com/search?q=chacara+acailandia&email=x@y.com')).toBe('https://www.google.com/search');
    expect(limparReferrer('javascript:alert(1)')).toBeNull();
    expect(limparReferrer('')).toBeNull();
    expect(hostDe('www.Instagram.com')).toBe('instagram.com');
  });

  it('linha do aviso e canais novos contam como orgânico no relatório', () => {
    expect(linhaOrigem('Google (orgânico)', { paginaEntrada: '/bom-jardims?x=1' })).toBe('Google (orgânico) · entrou por /bom-jardims');
    expect(['busca_organica', 'facebook_organico', 'outras_redes'].map(tipoDoCanal)).toEqual(['organico', 'organico', 'organico']);
    expect(rotuloCanal('busca_organica')).toBe('Google/busca orgânica');
  });
});
