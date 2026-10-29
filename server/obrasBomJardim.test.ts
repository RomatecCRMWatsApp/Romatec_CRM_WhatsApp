import { describe, expect, it } from 'vitest';
import { CAMPANHA_OBRAS, MSG_VALOR_OBRAS, utmObras } from '../shared/obrasBomJardim';
import { metaDaRota } from './seo';
import { origemFromUtm } from './lead-intake';
import { rotaDeMarketing } from '../shared/rastreamento';
import { agendamentoSchema } from '../shared/agendamento';

describe('campanha das obras (/obras-bom-jardim)', () => {
  it('sem UTM no link, a origem é Instagram com a campanha IG-OBRAS-NOV26', () => {
    expect(utmObras(null)).toMatchObject({ source: 'instagram', campaign: CAMPANHA_OBRAS });
    expect(utmObras({ source: 'instagram', campaign: 'IG-OBRAS-NOV26' })).toMatchObject({ source: 'instagram', campaign: 'IG-OBRAS-NOV26' });
    expect(origemFromUtm(utmObras(undefined))).toBe('instagram_bio');
  });

  it('prévia de compartilhamento (OG) própria e indexável, sem preço', () => {
    const m = metaDaRota('/obras-bom-jardim');
    expect(m).not.toBe('imovel');
    if (m === 'imovel') return;
    expect(m.image).toBe('/obras-bom-jardim/og.jpg');
    expect(m.indexavel).toBe(true);
    expect(m.description).toContain('14 de novembro');
    expect(`${m.title} ${m.description}`).not.toMatch(/R\$/);
  });

  it('é página de marketing (GA4/Ads) e o agendamento aceita a UTM da campanha', () => {
    expect(rotaDeMarketing('/obras-bom-jardim')).toBe(true);
    const p = agendamentoSchema.safeParse({ nome: 'Fulano de Tal', telefone: '99991811246', dia: '2026-11-14', horario: HORARIO_QUALQUER(), pagamento: PAGAMENTO_QUALQUER(), pessoas: 2, consentimento: true, utm: { source: 'instagram', campaign: 'IG-OBRAS-NOV26' } });
    expect(p.success).toBe(true);
  });

  it('mensagem pré-preenchida do "Quero saber o valor"', () => {
    expect(MSG_VALOR_OBRAS).toBe('Olá, vi a campanha das obras do Bom Jardim e quero saber os valores');
  });
});

import { FORMAS_PAGAMENTO, HORARIOS } from '../shared/agendamento';
function HORARIO_QUALQUER() { return HORARIOS[0][0]; }
function PAGAMENTO_QUALQUER() { return FORMAS_PAGAMENTO[0][0]; }

import { fichaObrasSchema, msgValorComFicha } from '../shared/obrasBomJardim';

describe('"Quero saber o valor" só depois da ficha completa', () => {
  const ok = { nome: 'Maria da Silva', phone: '(99) 9 9181-1246', email: 'maria@gmail.com', cidade: 'Açailândia', finalidade: 'lazer', pagamento: 'parcelado', prazo: '3m', consent: true };

  it('ficha completa passa', () => {
    expect(fichaObrasSchema.safeParse(ok).success).toBe(true);
  });

  it('falta qualquer dado → recusa (nome sem sobrenome, sem e-mail, sem cidade, sem escolhas, fixo, sem autorização)', () => {
    for (const ruim of [
      { nome: 'Maria' }, { email: '' }, { email: 'maria' }, { cidade: '' }, { finalidade: '' }, { pagamento: undefined }, { prazo: 'x' },
      { phone: '(99) 3538-1234' }, { phone: '9918' }, { consent: false },
    ]) expect(fichaObrasSchema.safeParse({ ...ok, ...ruim }).success).toBe(false);
  });

  it('a mensagem do WhatsApp já leva quem é o cliente', () => {
    const m = msgValorComFicha(ok as any);
    expect(m).toContain('quero saber os valores');
    expect(m).toContain('Sou Maria da Silva, de Açailândia');
    expect(m).toContain('lazer de fim de semana');
    expect(m).toContain('parcelado direto');
  });
});
