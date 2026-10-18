import { describe, it, expect } from 'vitest';
import { eventoSchema, sinaisDosEventos, visitanteUnico, TIPOS_EVENTO } from './rastreio';
import { linkImovel } from './inbound';
import { calcularComprador } from './score';

const VID = '3f2b8c1e-4a5d-4e6f-8a7b-9c0d1e2f3a4b';

describe('Beacon /t — validação do evento', () => {
  it('aceita evento válido', () => {
    expect(eventoSchema.safeParse({ vid: VID, tipo: 'view_imovel', codigo: 'IMV-0012', campanha: 'IG-OUT26-CHAC' }).success).toBe(true);
    expect(eventoSchema.safeParse({ vid: VID, tipo: 'tempo_pagina', codigo: 'imv-0012', segundos: 120 }).success).toBe(true);
  });

  it('recusa visitante inválido, tipo desconhecido, código e tempo fora do padrão', () => {
    expect(eventoSchema.safeParse({ vid: 'abc', tipo: 'view_imovel' }).success).toBe(false);
    expect(eventoSchema.safeParse({ vid: VID, tipo: 'compra_feita' }).success).toBe(false);
    expect(eventoSchema.safeParse({ vid: VID, tipo: 'view_imovel', codigo: 'IMV-12' }).success).toBe(false);
    expect(eventoSchema.safeParse({ vid: VID, tipo: 'tempo_pagina', segundos: 999 }).success).toBe(false);
  });

  it('tipos da spec (§6.4) + scan do QR', () => {
    expect([...TIPOS_EVENTO]).toEqual(['view_imovel', 'view_galeria', 'play_video', 'view_planta', 'view_mapa', 'tempo_pagina', 'clique_whatsapp', 'submit_form', 'scan_qr']);
  });
});

describe('Sinais para o score', () => {
  const ev = (tipo: string, createdAt: string, extra: any = {}) => ({ tipo, createdAt, visitanteId: VID, ...extra });

  it('tempo na página: maior acumulado de cada visita, somado entre visitas', () => {
    const s = sinaisDosEventos([
      ev('tempo_pagina', '2026-10-18T10:00:15Z', { dados: { segundos: 15 } }),
      ev('tempo_pagina', '2026-10-18T10:01:30Z', { dados: { segundos: 90 } }),
      ev('tempo_pagina', '2026-10-19T09:00:45Z', { dados: { segundos: 45 } }),
    ]);
    expect(s.tempoPaginaS).toBe(135);
  });

  it('sessões em dias diferentes e mídia vista', () => {
    const s = sinaisDosEventos([
      ev('view_imovel', '2026-10-18T10:00:00Z'),
      ev('view_imovel', '2026-10-18T15:00:00Z'),
      ev('view_imovel', '2026-10-20T08:00:00Z'),
      ev('view_planta', '2026-10-20T08:01:00Z'),
    ]);
    expect(s.sessoesDias).toBe(2);
    expect(s.sinais.has('view_planta')).toBe(true);
  });

  it('os sinais entram no score do comprador (+5 cada)', () => {
    const s = sinaisDosEventos([
      ev('view_imovel', '2026-10-18T10:00:00Z'),
      ev('view_imovel', '2026-10-19T10:00:00Z'),
      ev('play_video', '2026-10-19T10:00:30Z'),
      ev('tempo_pagina', '2026-10-19T10:02:00Z', { dados: { segundos: 120 } }),
    ]);
    const r = calcularComprador({}, { temCodigoImovel: true, precoImovel: null, ...s });
    expect(r.detalhes).toEqual({ codigo_imovel: 10, midia: 5, tempo_pagina: 5, retorno: 5 });
  });
});

describe('Vínculo visitante → lead pelo clique no WhatsApp (30 min)', () => {
  it('um único visitante candidato → vincula', () => {
    expect(visitanteUnico([{ visitanteId: VID }, { visitanteId: VID }])).toBe(VID);
  });

  it('dois visitantes ou nenhum → não vincula (não dá para saber quem é)', () => {
    expect(visitanteUnico([{ visitanteId: VID }, { visitanteId: '11111111-2222-4333-8444-555555555555' }])).toBeNull();
    expect(visitanteUnico([])).toBeNull();
    expect(visitanteUnico([{ visitanteId: null }])).toBeNull();
  });
});

describe('Link do imóvel nas mensagens', () => {
  it('usa a landing /i/:codigo quando o imóvel tem código', () => {
    expect(linkImovel({ codigo: 'IMV-0012', publicSlug: 'chacara-x' })).toMatch(/\/i\/IMV-0012$/);
    expect(linkImovel({ codigo: null, publicSlug: 'chacara-x' })).toMatch(/\/imovel\/chacara-x$/);
    expect(linkImovel({ codigo: null, publicSlug: null })).toBeNull();
  });
});
