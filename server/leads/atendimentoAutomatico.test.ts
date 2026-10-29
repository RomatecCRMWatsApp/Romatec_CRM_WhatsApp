import { describe, expect, it } from 'vitest';
import { montarAviso } from './notificacao';
import { ehRoboDePrevia, linkWhatsAppAtendido, tokenAtendido, tokenAtendidoValido } from './sla';
import { podeDistribuirLeads } from '../../shared/permissoes';
import { textoEncaminhamento } from './encaminhamento';

const base = { tipo: 'novo_lead' as const, leadId: 42, nome: 'Maria da Silva', telefone: '5599988887777', funil: 'comprador' as const, score: 40, classe: 'morno' as const, origem: 'Instagram' };

describe('lead atendido automaticamente', () => {
  it('o aviso traz o link do CRM que marca o atendimento e abre o WhatsApp', () => {
    const t = montarAviso({ ...base, linkWhatsApp: linkWhatsAppAtendido(42) });
    expect(t).toMatch(/💬 Atender no WhatsApp \(já conta como atendido\): https?:\/\/[^\s]+\/w\/42\/[0-9a-f]{20}/);
    expect(t).not.toContain('https://wa.me/');
  });

  it('o link é assinado: token de outro lead não vale', () => {
    expect(tokenAtendidoValido(42, tokenAtendido(42))).toBe(true);
    expect(tokenAtendidoValido(43, tokenAtendido(42))).toBe(false);
  });

  it('pré-visualização de link (robôs) não conta como atendimento; celular conta', () => {
    for (const ua of ['WhatsApp/2.23.20.0 A', 'TelegramBot (like TwitterBot)', 'facebookexternalhit/1.1', 'Slackbot-LinkExpanding 1.0']) expect(ehRoboDePrevia(ua)).toBe(true);
    expect(ehRoboDePrevia('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(ehRoboDePrevia('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(false);
  });

  it('secretária e administrador encaminham; corretor não', () => {
    expect(podeDistribuirLeads('secretario')).toBe(true);
    expect(podeDistribuirLeads('admin')).toBe(true);
    expect(podeDistribuirLeads('corretor')).toBe(false);
  });

  it('o corretor recebe no WhatsApp o lead encaminhado com o link de atender', () => {
    const t = textoEncaminhamento({ leadId: 42, cliente: 'Maria da Silva', telefone: '5599988887777', porNome: 'Secretária Ana', empreendimento: 'Condomínio de Chácaras Bom Jardims' });
    expect(t).toContain('Lead encaminhado para você* por Secretária Ana');
    expect(t).toContain('Maria da Silva');
    expect(t).toMatch(/\/w\/42\//);
    expect(t).toContain('/leads/lead/42');
  });
});
