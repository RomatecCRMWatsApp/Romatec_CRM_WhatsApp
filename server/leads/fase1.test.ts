import { describe, it, expect } from 'vitest';
import { CADENCIA_DIAS, quandoSai, proximoHorarioComercial, followUpPausado, mensagemFollowUp } from './followup';
import { acaoSla, precisaDeGente, escolherResponsavel, horarioDeAlerta, tokenAtendido, tokenAtendidoValido } from './sla';
import { montarAviso } from './notificacao';
import { idsDeClique } from '../../shared/origemTrafego';

const DIA = 24 * 3600_000;
// 2026-10-19 é segunda-feira; 13h UTC = 10h em Açailândia
const seg10h = Date.UTC(2026, 9, 19, 13);

describe('Follow-up persistente', () => {
  it('cadência 1, 3, 7, 14 e 30 dias depois da última conversa; depois acaba', () => {
    expect(CADENCIA_DIAS).toEqual([1, 3, 7, 14, 30]);
    expect(quandoSai(1, seg10h)).toBe(seg10h + DIA);
    expect(quandoSai(5, seg10h)).toBe(seg10h + 30 * DIA);
    expect(quandoSai(6, seg10h)).toBeNull();
  });

  it('só em horário comercial (seg–sáb, 8h–19h no Maranhão)', () => {
    expect(proximoHorarioComercial(seg10h)).toBe(seg10h);
    const seg22h = Date.UTC(2026, 9, 20, 1); // segunda 22h local
    expect(proximoHorarioComercial(seg22h)).toBe(Date.UTC(2026, 9, 20, 11)); // terça 8h local
    const sab20h = Date.UTC(2026, 9, 24, 23); // sábado 20h local
    expect(proximoHorarioComercial(sab20h)).toBe(Date.UTC(2026, 9, 26, 11)); // pula o domingo → segunda 8h
    const seg6h = Date.UTC(2026, 9, 19, 9); // segunda 6h local
    expect(proximoHorarioComercial(seg6h)).toBe(Date.UTC(2026, 9, 19, 11));
  });

  it('pausa: pediu para sair, com o corretor, encerrado', () => {
    expect(followUpPausado({ blockedUntil: new Date(seg10h + DIA) }, seg10h)).toBe('pediu para sair');
    expect(followUpPausado({ humano: true })).toBe('com o corretor');
    expect(followUpPausado({ etapa: 'fechado' })).toBe('encerrado');
    expect(followUpPausado({ stage: 'descartado' })).toBe('encerrado');
    expect(followUpPausado({ stage: 'abordagem_enviada', etapa: 'novo' })).toBeNull();
  });

  it('mensagens sem escassez inventada, sem preço e com saída', () => {
    for (let p = 1; p <= 5; p++) {
      const m = mensagemFollowUp(p, { nome: 'maria souza', funil: 'comprador', empreendimentoSlug: 'bom-jardims' })!;
      expect(m).toMatch(/^Oi, Maria!/);
      expect(m).not.toMatch(/consultas|últimas unidades|reservad|prazo limitado|R\$/i);
      if (p >= 3) expect(m).toContain('SAIR');
    }
    expect(mensagemFollowUp(2, { funil: 'comprador', empreendimentoSlug: 'bom-jardims' })).toContain('/bom-jardims');
    expect(mensagemFollowUp(1, { funil: 'proprietario' })).toMatch(/venda|vender/);
    expect(mensagemFollowUp(6, { funil: 'comprador' })).toBeNull();
  });
});

describe('Responsável e alerta de 5 minutos', () => {
  it('quem precisa de gente', () => {
    for (const t of ['quente', 'visita', 'avaliacao', 'humano', 'completa'] as const) expect(precisaDeGente(t)).toBe(true);
    expect(precisaDeGente('novo_lead')).toBe(false);
    expect(precisaDeGente('novo_lead', { empreendimento: true })).toBe(true);
    expect(precisaDeGente('novo_lead', { funil: 'proprietario' })).toBe(true);
    expect(precisaDeGente('recorrente')).toBe(false);
  });

  it('5 min → lembra; 15 → repassa; 60 → administrador', () => {
    expect(acaoSla(4, 0)).toBe('nada');
    expect(acaoSla(5, 0)).toBe('lembrar');
    expect(acaoSla(10, 1)).toBe('nada');
    expect(acaoSla(15, 1)).toBe('repassar');
    expect(acaoSla(59, 2)).toBe('nada');
    expect(acaoSla(60, 2)).toBe('avisar_admin');
    expect(acaoSla(500, 3)).toBe('nada');
  });

  it('rodízio: quem recebeu lead há mais tempo (nunca recebeu = primeiro)', () => {
    const c = [{ id: 1, ultimoLeadAt: new Date(seg10h) }, { id: 2, ultimoLeadAt: null }, { id: 3, ultimoLeadAt: new Date(seg10h - DIA) }];
    expect(escolherResponsavel(c)?.id).toBe(2);
    expect(escolherResponsavel(c, 2)?.id).toBe(3);
    expect(escolherResponsavel([{ id: 1 }], 1)).toBeNull();
  });

  it('alertas só entre 7h e 21h', () => {
    expect(horarioDeAlerta(seg10h)).toBe(true);
    expect(horarioDeAlerta(Date.UTC(2026, 9, 20, 2))).toBe(false); // 23h local
  });

  it('link "Já atendi" assinado', () => {
    const t = tokenAtendido(42);
    expect(tokenAtendidoValido(42, t)).toBe(true);
    expect(tokenAtendidoValido(43, t)).toBe(false);
    expect(tokenAtendidoValido(42, 'x')).toBe(false);
  });

  it('aviso mostra responsável, link do lead e "Já atendi"', () => {
    const txt = montarAviso({ tipo: 'quente', leadId: 7, nome: 'Ana', telefone: '5599911112222', funil: 'comprador', origem: 'WhatsApp direto', responsavelNome: 'Daniele', linkAtendido: 'https://romateccrm.com/a/7/abc' });
    expect(txt).toContain('Responsável: Daniele');
    expect(txt).toContain('/leads/lead/7');
    expect(txt).toContain('Já atendi');
  });
});

describe('Código do clique no anúncio', () => {
  it('lê gclid/gbraid/wbraid/fbclid da página de entrada', () => {
    expect(idsDeClique('/bom-jardims?utm_source=google&gclid=Cj0KCQjw-abc_123')).toEqual({ gclid: 'Cj0KCQjw-abc_123' });
    expect(idsDeClique('/i/IMV-0001?fbclid=IwAR0xyz123')).toEqual({ fbclid: 'IwAR0xyz123' });
    expect(idsDeClique('/bom-jardims')).toEqual({});
    expect(idsDeClique('/x?gclid=<script>')).toEqual({});
    expect(idsDeClique(null)).toEqual({});
  });
});
