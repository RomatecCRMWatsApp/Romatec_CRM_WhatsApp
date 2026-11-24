import { describe, expect, it } from 'vitest';
import { perfilDe, podeAbrir, daEquipe } from '../shared/equipe';
import { leadVisivel, permissoesEfetivas, podeDistribuirLeads } from '../shared/permissoes';
import { documentosDoPerfil, mensagemConvite, PERFIS_RECRUTAMENTO } from '../shared/recrutamento';

describe('ajudante administrativo (atendente)', () => {
  it('é reconhecido como perfil próprio e da equipe', () => {
    expect(perfilDe({ perfil: 'atendente' })).toBe('atendente');
    expect(daEquipe('atendente')).toBe(true);
    expect(PERFIS_RECRUTAMENTO).toContain('atendente');
  });

  it('não pede CRECI no recrutamento', () => {
    const tipos = documentosDoPerfil('atendente').map(d => d.tipo);
    expect(tipos).not.toContain('cartao_creci');
    expect(tipos).not.toContain('certidao_creci');
    expect(tipos).toEqual(expect.arrayContaining(['foto', 'cnh']));
    expect(mensagemConvite('Ana Souza', 'atendente', 'https://x/f/1')).toContain('Ajudante administrativo');
  });

  it('vê só os leads em que é responsável e não distribui', () => {
    expect(leadVisivel('atendente', 7, { responsavelId: 7 })).toBe(true);
    expect(leadVisivel('atendente', 7, { responsavelId: 8 })).toBe(false);
    expect(podeDistribuirLeads('atendente')).toBe(false);
  });

  it('pacote base sem financeiro, contratos e disparos', () => {
    const p = permissoesEfetivas([], [], 'atendente');
    expect(p.leads).toBe(true);
    expect(p.financeiro).toBe(false);
    expect(p.contratos).toBe(false);
    expect(p.campanhas).toBe(false);
  });

  it('não abre telas do escritório', () => {
    expect(podeAbrir('atendente', '/leads/recebidos')).toBe(true);
    expect(podeAbrir('atendente', '/recrutamento')).toBe(false);
    expect(podeAbrir('atendente', '/leads/distribuicao')).toBe(false);
    expect(podeAbrir('atendente', '/settings')).toBe(false);
  });
});
