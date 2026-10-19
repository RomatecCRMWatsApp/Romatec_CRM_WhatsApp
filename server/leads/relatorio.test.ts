import { describe, it, expect } from 'vitest';
import { montarRelatorio, canalDoLead, campanhaDoLead, tipoDoCanal, minutosAte1aResposta, relatorioCsv, pct, type LeadRel, type EntradaRelatorio } from './relatorio';
import { mesclarSlots } from './slots';

const t = (min: number) => new Date(Date.UTC(2026, 9, 10, 12, min));
const completos = mesclarSlots('comprador', {}, { objetivo: 'morar', forma_pagamento: 'a_vista', prazo_compra: '1_3m', faixa_valor: '200000', quer_visita: 'sim' }, 'ia').slots;

const lead = (over: Partial<LeadRel>): LeadRel => ({ id: 1, funil: 'comprador', score: 'frio', createdAt: t(0), ...over });

const campanhas = [
  { id: 10, codigo: 'CTWA-OUT', nome: 'Anúncio outubro', canal: 'meta_ctwa', gastoTotal: '300.00' },
  { id: 20, codigo: 'IG-BIO', nome: 'Bio do Instagram', canal: 'instagram_organico', gastoTotal: '0' },
  { id: 30, codigo: 'PLACA-IMV-0001', nome: 'Placa', canal: 'placa_qr', gastoTotal: null },
];
const imoveis = [
  { id: 1, codigo: 'IMV-0001', denomination: 'Casa Centro', propertyType: 'casa' },
  { id: 2, codigo: 'IMV-0002', denomination: 'Chácara', propertyType: 'chacara' },
];

const entrada = (over: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
  leads: [
    lead({ id: 1, origemCanal: 'meta_ctwa', origemCampanhaId: 10, score: 'quente', propertyId: 1, slots: completos }),
    lead({ id: 2, origemCanal: 'meta_ctwa', origemCampanhaId: 10, score: 'quente', etapa: 'fechado' }),
    lead({ id: 3, origemCanal: 'meta_ctwa', origemCampanhaId: 10, ultimoCanal: 'instagram_organico', ultimaCampanhaId: 20 }),
    lead({ id: 4, origemCanal: 'instagram_organico', origemCampanhaId: 20, etapa: 'visita_agendada' }),
    lead({ id: 5, origem: 'whatsapp' }), // lead antigo, sem captação v1
  ],
  campanhas,
  interesses: new Map([[4, [2]]]),
  eventos: [
    { tipo: 'clique_whatsapp', campanhaId: 20 }, { tipo: 'clique_whatsapp', campanhaId: 20 },
    { tipo: 'scan_qr', campanhaId: 30, propertyId: 1 }, { tipo: 'view_imovel', campanhaId: null },
    { tipo: 'view_galeria', campanhaId: 20 },
  ],
  mensagens: [
    { leadId: 1, direcao: 'in', createdAt: t(0) }, { leadId: 1, direcao: 'out', createdAt: t(1) }, { leadId: 1, direcao: 'in', createdAt: t(11) },
    { leadId: 4, direcao: 'out', createdAt: t(0) }, { leadId: 4, direcao: 'in', createdAt: t(30) },
    { leadId: 3, direcao: 'out', createdAt: t(0) }, // nunca respondeu
    { leadId: 99, direcao: 'out', createdAt: t(0) }, { leadId: 99, direcao: 'in', createdAt: t(500) }, // fora do período
  ],
  imoveis,
  ...over,
});

describe('Canal e campanha do lead', () => {
  it('1º toque nunca muda; último toque usa ultimoCanal', () => {
    const l = lead({ origemCanal: 'meta_ctwa', origemCampanhaId: 10, ultimoCanal: 'placa_qr', ultimaCampanhaId: 30 });
    expect([canalDoLead(l), campanhaDoLead(l)]).toEqual(['meta_ctwa', 10]);
    expect([canalDoLead(l, 'ultimo'), campanhaDoLead(l, 'ultimo')]).toEqual(['placa_qr', 30]);
  });
  it('lead antigo cai no canal da coluna origem', () => {
    expect(canalDoLead(lead({ origem: 'instagram_ads' }))).toBe('meta_leadads');
    expect(canalDoLead(lead({ origem: 'instagram_bio' }))).toBe('instagram_organico');
    expect(canalDoLead(lead({}))).toBe('whatsapp_direto');
  });
  it('pago × orgânico', () => {
    expect(['meta_ctwa', 'meta_leadads', 'google_ads'].map(tipoDoCanal)).toEqual(['pago', 'pago', 'pago']);
    expect(['instagram_organico', 'placa_qr', 'site', 'indicacao', 'whatsapp_direto'].every(c => tipoDoCanal(c) === 'organico')).toBe(true);
    expect(tipoDoCanal('portal_olx')).toBe('outro');
  });
});

describe('Relatório — 1º toque', () => {
  const r = montarRelatorio(entrada());

  it('totais', () => {
    expect(r.total).toMatchObject({ leads: 5, comImovel: 2, completa: 1, quentes: 2, visitas: 3, visitasRealizadas: 1, propostas: 1, fechados: 1, cliques: 2, scans: 1, views: 1, gasto: 300, custoPorQuente: 150, custoPorVisita: 300, custoPorVenda: 300 }); // a venda conta como visita (funil sempre decrescente)
  });

  it('orgânico × pago', () => {
    const pago = r.porTipo.find(x => x.tipo === 'pago')!;
    const org = r.porTipo.find(x => x.tipo === 'organico')!;
    expect(pago).toMatchObject({ leads: 3, quentes: 2, gasto: 300, custoPorQuente: 150 });
    expect(org).toMatchObject({ leads: 2, quentes: 0, cliques: 2, scans: 1, views: 1, custoPorQuente: null });
  });

  it('por campanha, com a linha "sem campanha" e eventos de quem não virou lead', () => {
    const ctwa = r.porCampanha.find(c => c.codigo === 'CTWA-OUT')!;
    expect(ctwa).toMatchObject({ leads: 3, quentes: 2, fechados: 1, gasto: 300, custoPorQuente: 150, rotuloCanal: 'Anúncio Click-to-WhatsApp', tipo: 'pago' });
    expect(r.porCampanha.find(c => c.codigo === 'IG-BIO')).toMatchObject({ leads: 1, visitas: 1, cliques: 2 });
    expect(r.porCampanha.find(c => c.codigo === 'PLACA-IMV-0001')).toMatchObject({ leads: 0, scans: 1 });
    const sem = r.porCampanha.find(c => c.campanhaId === null)!;
    expect(sem).toMatchObject({ nome: 'Sem código — WhatsApp direto', leads: 1, views: 0 });
    expect(r.porCampanha.find(c => c.nome === 'Sem código — Site')).toMatchObject({ leads: 0, views: 1 });
    expect(r.porCampanha[0].codigo).toBe('CTWA-OUT'); // mais quentes primeiro
  });

  it('por canal soma o gasto das campanhas do canal', () => {
    expect(r.porCanal.find(c => c.canal === 'meta_ctwa')).toMatchObject({ leads: 3, gasto: 300 });
    expect(r.porCanal.find(c => c.canal === 'whatsapp_direto')).toMatchObject({ leads: 1, rotulo: 'WhatsApp direto' });
  });

  it('ranking de imóveis por leads quentes (propertyId + interesses)', () => {
    expect(r.imoveis).toEqual([
      { propertyId: 1, codigo: 'IMV-0001', titulo: 'Casa Centro', leads: 1, quentes: 1 },
      { propertyId: 2, codigo: 'IMV-0002', titulo: 'Chácara', leads: 1, quentes: 0 },
    ]);
  });

  it('tempo médio até a 1ª resposta só dos leads do período', () => {
    // lead 1: 10 min (a mensagem antes da 1ª nossa não conta); lead 4: 30 min; lead 3 não respondeu
    expect(r.tempoMedioRespostaMin).toBe(20);
    expect(r.leadsComResposta).toBe(2);
  });
});

describe('Relatório — último toque', () => {
  it('o lead 3 passa para a campanha IG-BIO', () => {
    const r = montarRelatorio(entrada({ toque: 'ultimo' }));
    expect(r.porCampanha.find(c => c.codigo === 'CTWA-OUT')!.leads).toBe(2);
    expect(r.porCampanha.find(c => c.codigo === 'IG-BIO')!.leads).toBe(2);
    expect(r.porTipo.find(x => x.tipo === 'organico')!.leads).toBe(3);
  });
});

describe('Auxiliares', () => {
  it('sem resposta e sem mensagem nossa → null', () => {
    expect(minutosAte1aResposta([{ leadId: 1, direcao: 'in', createdAt: t(0) }])).toBeNull();
    expect(minutosAte1aResposta([])).toBeNull();
  });
  it('relatório vazio', () => {
    const r = montarRelatorio({ leads: [], campanhas: [], interesses: new Map(), eventos: [], mensagens: [], imoveis: [] });
    expect(r.total.leads).toBe(0);
    expect(r.porCampanha).toEqual([]);
    expect(r.tempoMedioRespostaMin).toBeNull();
    expect(pct(1, 0)).toBe(0);
  });
  it('CSV com ; , vírgula decimal e aspas escapadas', () => {
    const r = montarRelatorio(entrada({ campanhas: [{ ...campanhas[0], nome: 'Anúncio "out"; chácaras' }, campanhas[1], campanhas[2]] }));
    const csv = relatorioCsv(r);
    const linhas = csv.replace('﻿', '').split('\r\n');
    expect(linhas[0]).toContain('Custo por lead quente (R$)');
    expect(linhas[1]).toBe('CTWA-OUT;"Anúncio ""out""; chácaras";Anúncio Click-to-WhatsApp;Pago;3;33;33;2;2;1;1;1;0;0;0;300,00;150,00;300,00;300,00');
  });
});
