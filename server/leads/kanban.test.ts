import { describe, it, expect } from 'vitest';
import { ETAPAS, etapaDoLead, validarMovimento, escolherSimilar, imovelDoProprietario, resumoProprietario } from './kanban';
import { mesclarSlots } from './slots';

describe('Etapas dos funis (§12.1)', () => {
  it('colunas na ordem da spec', () => {
    expect(ETAPAS.comprador).toEqual(['novo', 'qualificando', 'qualificado', 'visita_agendada', 'visitou', 'proposta', 'fechado', 'perdido']);
    expect(ETAPAS.proprietario).toEqual(['novo', 'qualificando', 'avaliacao', 'exclusividade', 'captado', 'perdido']);
  });

  it('etapa escolhida no painel vale; senão é deduzida do stage do bot', () => {
    expect(etapaDoLead({ funil: 'comprador', etapa: 'proposta', stage: 'qual_etapa_3' })).toBe('proposta');
    expect(etapaDoLead({ funil: 'comprador', stage: 'abordagem_enviada' })).toBe('novo');
    expect(etapaDoLead({ funil: 'comprador', stage: 'qual_etapa_4' })).toBe('qualificando');
    expect(etapaDoLead({ funil: 'comprador', stage: 'qualificado' })).toBe('qualificado');
    expect(etapaDoLead({ funil: 'comprador', stage: 'visita_agendada' })).toBe('visita_agendada');
    expect(etapaDoLead({ funil: 'comprador', stage: 'descartado' })).toBe('perdido');
    expect(etapaDoLead({ funil: 'comprador', stage: 'concluido' })).toBe('fechado');
    expect(etapaDoLead({ funil: 'proprietario', stage: 'atendimento_humano' })).toBe('novo');
    expect(etapaDoLead({ funil: 'proprietario', etapa: 'visitou' })).toBe('novo'); // etapa de outro funil é ignorada
    expect(etapaDoLead({ stage: 'novo_lead' })).toBe('novo');
  });

  it('perdido exige motivo válido; etapa precisa existir no funil', () => {
    expect(validarMovimento('comprador', 'perdido')).toMatchObject({ ok: false });
    expect(validarMovimento('comprador', 'perdido', 'achei caro')).toMatchObject({ ok: false });
    expect(validarMovimento('comprador', 'perdido', 'preco')).toEqual({ ok: true });
    expect(validarMovimento('comprador', 'perdido', 'outro: mudou de cidade')).toEqual({ ok: true });
    expect(validarMovimento('comprador', 'avaliacao')).toMatchObject({ ok: false });
    expect(validarMovimento('proprietario', 'exclusividade')).toEqual({ ok: true });
  });
});

describe('Imóvel similar (mesmo tipo, preço ±20%)', () => {
  const base = { id: 1, codigo: 'IMV-0001', denomination: 'Chácara A', propertyType: 'Chácara', price: 100000, status: 'available' };
  const carteira = [
    base,
    { id: 2, codigo: 'IMV-0002', denomination: 'Chácara B', propertyType: 'Chácara', price: 115000, status: 'available' },
    { id: 3, codigo: 'IMV-0003', denomination: 'Chácara C', propertyType: 'Chácara', price: 95000, status: 'available' },
    { id: 4, codigo: 'IMV-0004', denomination: 'Casa D', propertyType: 'Casa', price: 100000, status: 'available' },
    { id: 5, codigo: 'IMV-0005', denomination: 'Chácara E', propertyType: 'Chácara', price: 200000, status: 'available' },
    { id: 6, codigo: 'IMV-0006', denomination: 'Chácara F', propertyType: 'Chácara', price: 101000, status: 'sold' },
  ];

  it('escolhe o mais próximo do preço, mesmo tipo, disponível', () => {
    expect(escolherSimilar(base, carteira)?.id).toBe(3);
  });

  it('não repete o que o lead já recebeu e devolve null quando não há', () => {
    expect(escolherSimilar(base, carteira, [3])?.id).toBe(2);
    expect(escolherSimilar(base, carteira, [2, 3])).toBeNull();
  });
});

describe('Proprietário captado → imóvel', () => {
  const slots = mesclarSlots('proprietario', {}, { tipo_imovel: 'rural', localizacao: 'Grajaú/MA', area: '120 ha', documentacao: 'posse', valor_pretendido: '1,2 milhão' }, 'manual').slots;

  it('monta o cadastro inativo e sem preço público', () => {
    expect(imovelDoProprietario({ nome: 'Seu Zé', slots })).toMatchObject({
      denomination: 'Fazenda/Área rural — Grajaú/MA',
      address: 'Grajaú/MA',
      price: '1200000',
      exibirPreco: false,
      status: 'inactive',
    });
  });

  it('resumo para o card', () => {
    expect(resumoProprietario(slots)).toBe('Fazenda/Área rural · Grajaú/MA · 120 ha · Doc: posse');
    expect(resumoProprietario({})).toBeNull();
  });
});
