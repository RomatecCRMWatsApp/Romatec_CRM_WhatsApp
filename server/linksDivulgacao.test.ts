import { describe, expect, it } from 'vitest';
import { LINKS_FIXOS, linkSchema, montarLink, textoComLink } from '../shared/linksDivulgacao';
import { podeChamar } from '../shared/equipe';

const BASE = 'https://romateccrm.com';

describe('links de divulgação', () => {
  it('link interno sai com a UTM da campanha e o ?c= de quem compartilha', () => {
    const obras = LINKS_FIXOS.find(l => l.chave === 'fixo:obras')!;
    expect(montarLink(BASE, obras, 'abc123XYZ9')).toBe('https://romateccrm.com/obras-bom-jardim?utm_source=instagram&utm_campaign=IG-OBRAS-NOV26&c=abc123XYZ9');
    expect(montarLink(BASE, obras, null)).toBe('https://romateccrm.com/obras-bom-jardim?utm_source=instagram&utm_campaign=IG-OBRAS-NOV26');
  });

  it('link externo e KML não ganham ?c= nem UTM; UTM já presente no link é mantida', () => {
    expect(montarLink(BASE, { url: 'https://www.instagram.com/avalieimob', utmSource: 'x', utmCampaign: 'Y' }, 'ref')).toBe('https://www.instagram.com/avalieimob');
    expect(montarLink(BASE, { url: '/bom-jardims.kml', utmSource: null, utmCampaign: null }, 'ref')).toBe('https://romateccrm.com/bom-jardims.kml');
    expect(montarLink(BASE, { url: '/bom-jardims?utm_source=placa', utmSource: 'instagram', utmCampaign: null }, null)).toBe('https://romateccrm.com/bom-jardims?utm_source=placa');
  });

  it('o texto recebe o link no lugar de {link} (ou no fim)', () => {
    expect(textoComLink('Veja: {link}', 'https://x')).toBe('Veja: https://x');
    expect(textoComLink('Veja a página', 'https://x')).toBe('Veja a página\n\nhttps://x');
    for (const l of LINKS_FIXOS) expect(textoComLink(l.textoWhatsapp, 'L')).toContain('L');
  });

  it('cadastro: só caminho do site ou https', () => {
    const base = { titulo: 'Stories', textoWhatsapp: 'Veja {link}' };
    expect(linkSchema.safeParse({ ...base, url: '/obras-bom-jardim' }).success).toBe(true);
    expect(linkSchema.safeParse({ ...base, url: 'https://instagram.com/avalieimob' }).success).toBe(true);
    expect(linkSchema.safeParse({ ...base, url: 'javascript:alert(1)' }).success).toBe(false);
    expect(linkSchema.safeParse({ ...base, url: 'http://inseguro.com' }).success).toBe(false);
  });

  it('a equipe lista; o empreendedor não vê os links', () => {
    expect(podeChamar('corretor', 'linksDivulgacao.listar')).toBe(true);
    expect(podeChamar('empreendedor', 'linksDivulgacao.listar')).toBe(false);
  });
});

import { CARTAO_PADRAO, assinaturaWhatsApp, comAssinatura, linhasRodape } from '../shared/cartaoVendas';

describe('dados do corretor em tudo que ele divulga', () => {
  const alan = { ...CARTAO_PADRAO, nome: 'Alan Martins', creci: 'CRECI/MA 8.662', telefones: ['(99) 9 8888-7777'], whatsapp: '5599988887777', instagram: 'alanmartins', papel: 'Corretor(a)' };

  it('texto do WhatsApp termina com nome, CRECI, WhatsApp e Instagram do corretor', () => {
    const t = comAssinatura('Veja: https://x', alan);
    expect(t).toContain('*Alan Martins*');
    expect(t).toContain('CRECI/MA 8.662');
    expect(t).toContain('(99) 9 8888-7777');
    expect(t).toContain('@alanmartins');
    expect(comAssinatura(t, alan)).toBe(t);
  });

  it('sem CRECI cadastrado a linha some (não sai "null")', () => {
    expect(assinaturaWhatsApp({ ...alan, creci: null })).not.toMatch(/null|CRECI/);
    expect(linhasRodape({ ...alan, creci: null }).nome).toBe('Alan Martins');
  });

  it('rodapé do banner/vídeo/PDF', () => {
    expect(linhasRodape(alan)).toEqual({ nome: 'Alan Martins · CRECI/MA 8.662', detalhe: 'WhatsApp (99) 9 8888-7777  ·  @alanmartins' });
  });
});
