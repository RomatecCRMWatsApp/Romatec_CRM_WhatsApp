import { describe, it, expect } from 'vitest';
import { perfilDe, podeChamar, podeAbrir, telaInicial, normalizarCreci, tipoLogin, conviteValido, mascararEmail } from '../shared/equipe';
import { serieLeadsPorDia } from './leads/painelEmpreendedor';

describe('Equipe — perfis', () => {
  it('admin vem do role; colaborador do campo perfil (padrão corretor; antigo "equipe" também)', () => {
    expect(perfilDe({ role: 'admin', perfil: 'empreendedor' })).toBe('admin');
    expect(perfilDe({ role: 'user', perfil: 'empreendedor' })).toBe('empreendedor');
    expect(perfilDe({ role: 'user', perfil: null })).toBe('corretor');
    expect(perfilDe({ role: 'user', perfil: 'equipe' })).toBe('corretor');
    expect(perfilDe({ role: 'user', perfil: 'secretario' })).toBe('secretario');
    expect(perfilDe(null)).toBeNull();
  });
});

describe('Equipe — o que cada perfil acessa', () => {
  it('empreendedor só chama o painel dele, login e versão (o resto é negado por padrão)', () => {
    for (const p of ['empreendedor.painel', 'empreendedor.materiais', 'auth.me', 'auth.changePassword', 'system.versao']) expect(podeChamar('empreendedor', p)).toBe(true);
    for (const p of ['crm.kanban', 'crm.lead', 'crm.relatorio', 'leadCampanhas.list', 'materiais.list', 'contacts.list', 'companyConfig.get', 'equipe.list', 'system.notifyOwner']) expect(podeChamar('empreendedor', p)).toBe(false);
  });
  it('corretor e secretário usam o CRM, menos configurações, equipe e ZAYRA', () => {
    for (const p of ['crm.kanban', 'crm.lead', 'materiais.create', 'leadCampanhas.list', 'companyConfig.get']) expect(podeChamar('corretor', p)).toBe(true);
    for (const p of ['companyConfig.update', 'equipe.list', 'equipe.create', 'zaira.chat']) expect(podeChamar('corretor', p)).toBe(false);
  });
  it('admin chama tudo; sem perfil, nada', () => {
    expect(podeChamar('admin', 'equipe.create')).toBe(true);
    expect(podeChamar(null, 'auth.me')).toBe(false);
  });
  it('telas: empreendedor só /empreendedor; corretor não abre /equipe nem /settings', () => {
    expect(telaInicial('empreendedor')).toBe('/empreendedor');
    expect(telaInicial('corretor')).toBe('/dashboard');
    expect(podeAbrir('empreendedor', '/empreendedor')).toBe(true);
    expect(podeAbrir('empreendedor', '/dashboard')).toBe(false);
    expect(podeAbrir('empreendedor', '/leads')).toBe(false);
    expect(podeAbrir('corretor', '/leads/funil')).toBe(true);
    expect(podeAbrir('corretor', '/equipe')).toBe(false);
    expect(podeAbrir('corretor', '/settings')).toBe(false);
    expect(podeAbrir('admin', '/equipe')).toBe(true);
  });
});

describe('Equipe — login por CRECI e convite', () => {
  it('CRECI só com dígitos; e-mail se tiver @', () => {
    expect(normalizarCreci('CRECI/MA 4.705')).toBe('4705');
    expect(normalizarCreci('4705-F')).toBe('4705');
    expect(normalizarCreci('12')).toBeNull();
    expect(normalizarCreci('')).toBeNull();
    expect(tipoLogin('4705')).toBe('creci');
    expect(tipoLogin('jose@gmail.com')).toBe('email');
    expect(tipoLogin('012.091.853-69')).toBe('cpf');
  });
  it('todos os perfis abrem e editam o próprio cadastro (empreendedor também)', () => {
    expect(podeAbrir('empreendedor', '/meu-cadastro')).toBe(true);
    expect(podeChamar('empreendedor', 'cadastro.dados')).toBe(true);
    expect(podeChamar('secretario', 'equipe.list')).toBe(false);
  });
  it('convite vale até expirar; e-mail mascarado na tela de primeiro acesso', () => {
    const agora = Date.UTC(2026, 9, 18);
    expect(conviteValido(new Date(agora + 1000), agora)).toBe(true);
    expect(conviteValido(new Date(agora - 1000), agora)).toBe(false);
    expect(conviteValido(null, agora)).toBe(false);
    expect(mascararEmail('daniele.romatec@gmail.com')).toBe('d***@gmail.com');
  });
});

describe('Painel do empreendedor — leads por dia', () => {
  it('30 dias no fuso do Maranhão, com zeros nos dias sem lead', () => {
    const agora = Date.UTC(2026, 9, 18, 15); // 18/10 12h em Açailândia
    const s = serieLeadsPorDia([new Date(Date.UTC(2026, 9, 18, 2)), new Date(Date.UTC(2026, 9, 17, 12)), null, new Date(Date.UTC(2026, 7, 1))], 30, agora);
    expect(s).toHaveLength(30);
    expect(s.at(-1)).toEqual({ dia: '2026-10-18', leads: 0 });   // 02h UTC de 18/10 = 23h de 17/10 em Açailândia
    expect(s.at(-2)).toEqual({ dia: '2026-10-17', leads: 2 });
    expect(s.reduce((a, b) => a + b.leads, 0)).toBe(2);           // agosto fica fora da janela
  });
});
