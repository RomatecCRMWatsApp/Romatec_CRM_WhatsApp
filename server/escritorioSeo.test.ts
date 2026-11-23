import { describe, expect, it } from 'vitest';
import { metaDaRota } from './seo';
import { DESCRICAO_ESCRITORIO, LINKS_MAPA_ESCRITORIO, ROTA_ESCRITORIO } from '../shared/escritorio';

describe('página do escritório', () => {
  it('tem prévia própria, endereço, referência e horário', () => {
    const m = metaDaRota(ROTA_ESCRITORIO);
    expect(m !== 'imovel' && m.image).toBe('/brand/og-escritorio-v2.jpg');
    expect(DESCRICAO_ESCRITORIO).toMatch(/Rua São Raimundo, n\.º 10/);
    expect(DESCRICAO_ESCRITORIO).toMatch(/Hotel Girafa/);
    expect(DESCRICAO_ESCRITORIO).toMatch(/9h às 12h e das 15h às 17h/);
    expect(DESCRICAO_ESCRITORIO).toMatch(/somente com agendamento/);
    expect(LINKS_MAPA_ESCRITORIO.google).toContain('google.com/maps');
  });
});

describe('selo de horário do escritório (fuso de Açailândia)', async () => {
  const { situacaoEscritorio, textoSituacao } = await import('../shared/escritorio');
  // Hora de Açailândia (UTC−3) → instante
  const em = (iso: string) => new Date(`${iso}-03:00`).getTime();
  it('terça 10h: aberto até 12h', () => expect(textoSituacao(situacaoEscritorio(em('2026-11-24T10:00:00')))).toBe('Aberto agora · até 12h'));
  it('terça 13h: fechado, abre hoje às 15h', () => expect(textoSituacao(situacaoEscritorio(em('2026-11-24T13:00:00')))).toBe('Fechado agora · abre hoje às 15h'));
  it('terça 18h: abre amanhã às 9h', () => expect(textoSituacao(situacaoEscritorio(em('2026-11-24T18:00:00')))).toBe('Fechado agora · abre amanhã às 9h'));
  it('sexta 17h: abre segunda às 9h', () => expect(textoSituacao(situacaoEscritorio(em('2026-11-27T17:00:00')))).toBe('Fechado agora · abre segunda às 9h'));
  it('sábado: só com agendamento', () => expect(textoSituacao(situacaoEscritorio(em('2026-11-28T10:00:00')))).toBe('Hoje só com agendamento'));
  it('feriado em dia útil (25/12, sexta): só com agendamento', () => expect(textoSituacao(situacaoEscritorio(em('2026-12-25T10:00:00')))).toBe('Feriado · hoje só com agendamento'));
  it('às 12h em ponto já fechou', () => expect(situacaoEscritorio(em('2026-11-24T12:00:00')).tipo).toBe('fechado'));
});

describe('contatos do escritório', async () => {
  const { CONTATOS_ESCRITORIO } = await import('../shared/escritorio');
  it('José e Daniele com WhatsApp no formato 55 + DDD + número', () => {
    for (const c of [CONTATOS_ESCRITORIO.jose, CONTATOS_ESCRITORIO.daniele]) expect(c.whatsapp).toMatch(/^55\d{10,11}$/);
  });
});

describe('prévia do link do contrato', () => {
  it('usa a imagem própria e fica fora do Google', () => {
    const m = metaDaRota('/documentos/bom-jardims/contrato');
    expect(m !== 'imovel' && m.image).toBe('/bom-jardims/og-contrato-v2.jpg');
    expect(m !== 'imovel' && m.indexavel).toBe(false);
  });
});
