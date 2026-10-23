import { describe, expect, it } from 'vitest';
import {
  MODULOS, comissaoNaSimulacao, comissaoPropria, linhaFinanceira, marcarAcesso, minhaComissaoNaVenda, moduloDoCaminho, moduloLiberado, permissoesEfetivas, temAcesso,
} from '../shared/permissoes';
import type { CondicoesPagamento } from '../shared/simulador';
import { pctComissaoCorretor } from './permissoes';

const acessos = [{ tipo: 'empreendimento' as const, refId: 1 }, { tipo: 'imovel' as const, refId: 7 }];

describe('permissões — pacote base e ajuste por corretor', () => {
  it('sem linhas no banco = padrão do código; ajuste do corretor prevalece sobre o pacote base', () => {
    const padrao = permissoesEfetivas([], []);
    expect(Object.keys(padrao).sort()).toEqual(MODULOS.map(m => m.chave).sort());
    const p = permissoesEfetivas([{ modulo: 'campanhas', permitido: 0 }], [{ modulo: 'campanhas', permitido: 1 }, { modulo: 'financeiro', permitido: false }]);
    expect(p.campanhas).toBe(true);
    expect(p.financeiro).toBe(false);
  });

  it('módulo desligado bloqueia os procedimentos dele; admin sempre passa', () => {
    const p = permissoesEfetivas([], [{ modulo: 'simulador', permitido: false }]);
    expect(moduloDoCaminho('simulador.simular')?.chave).toBe('simulador');
    expect(moduloLiberado('equipe', p, 'simulador.simular')).toBe(false);
    expect(moduloLiberado('equipe', p, 'empreendimentosAdmin.detalhe')).toBe(true);
    expect(moduloLiberado('admin', p, 'simulador.simular')).toBe(true);
    expect(moduloLiberado('equipe', p, 'auth.me')).toBe(true);
  });
});

describe('permissões — escopo por empreendimento/imóvel', () => {
  it('corretor não acessa empreendimento não habilitado; admin acessa tudo', () => {
    expect(temAcesso('equipe', acessos, 'empreendimento', 1)).toBe(true);
    expect(temAcesso('equipe', acessos, 'empreendimento', 2)).toBe(false);
    expect(temAcesso('equipe', acessos, 'imovel', 1)).toBe(false);
    expect(temAcesso('admin', [], 'empreendimento', 2)).toBe(true);
    expect(temAcesso('empreendedor', acessos, 'empreendimento', 1)).toBe(false);
  });

  it('lista mostra todos, marcando os sem acesso', () => {
    const l = marcarAcesso('equipe', acessos, 'empreendimento', [{ id: 1 }, { id: 2 }]);
    expect(l).toEqual([{ id: 1, acesso: true }, { id: 2, acesso: false }]);
  });
});

const C: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};

describe('simulador — comissão não vaza para a equipe', () => {
  it('admin vê o breakdown completo (empresa/corretor e venda direta)', () => {
    const k = comissaoNaSimulacao('admin', 160000, 6, C, 0.02);
    expect(k.comissao?.comCorretor).toMatchObject({ total: 8000, corretor: 3200, romatec: 4800 });
    expect(k.comissao?.vendaDireta.romatec).toBe(8000);
    expect(k.minhaComissao).toBeNull();
  });

  it('corretor só recebe a própria comissão (padrão = % do empreendimento, 2%), nunca o breakdown', () => {
    const k = comissaoNaSimulacao('equipe', 160000, 6, C, C.comissaoCorretorPct);
    expect(k.comissao).toBeNull();
    expect(k.minhaComissao).toMatchObject({ pct: 0.02, valor: 3200, parcelada: true });
    expect(k.minhaComissao?.pagamentos.map(p => p.valor)).toEqual([1600, 1600]);
    expect(JSON.stringify(k)).not.toMatch(/romatec|vendaDireta|4800/i);
    expect(comissaoNaSimulacao('equipe', 160000, 1, C, 0.02).minhaComissao?.pagamentos).toHaveLength(1);
  });
});

describe('financeiro — tudo menos comissão de terceiros', () => {
  const venda = (corretorId: number | null, situacao = 'vendido_parcelado') =>
    ({ loteId: 1, codigo: 'A01', situacao, corretorId, valorVenda: 160000, valorEntrada: 48000, cliente: 'Maria' });

  it('corretor vê a venda de outro corretor com todos os dados, sem comissão nenhuma', () => {
    const l = linhaFinanceira('equipe', 5, venda(9), C, 0.02);
    expect(l).toMatchObject({ valorVenda: 160000, valorEntrada: 48000, cliente: 'Maria', comissao: null, minhaComissao: null });
  });

  it('corretor vê a própria comissão (50/50 na venda parcelada ou com sinal; 100% à vista)', () => {
    expect(linhaFinanceira('equipe', 5, venda(5), C, 0.02).minhaComissao?.pagamentos.map(p => p.valor)).toEqual([1600, 1600]);
    expect(linhaFinanceira('equipe', 5, venda(5, 'entrada'), C, 0.02).parcelada).toBe(true);
    expect(linhaFinanceira('equipe', 5, venda(5, 'vendido_avista'), C, 0.02).minhaComissao?.pagamentos).toHaveLength(1);
    expect(linhaFinanceira('equipe', 5, venda(5), C, 0.02).comissao).toBeNull();
  });

  it('admin vê o breakdown de todas as vendas', () => {
    const l = linhaFinanceira('admin', 1, venda(9), C, 0.02);
    expect(l.comissao).toMatchObject({ total: 8000, corretor: 3200, romatec: 4800 });
    expect(linhaFinanceira('admin', 1, venda(null), C, 0.02).comissao).toMatchObject({ corretor: 0, romatec: 8000 });
  });
});

describe('permissões — comissão do corretor', () => {
  it('parcelada: 50% na 1ª parcela do sinal e 50% na 2ª', () => {
    const c = comissaoPropria(160000, 0.1, true);
    expect(c.valor).toBe(16000);
    expect(c.pagamentos).toEqual([{ quando: '1ª parcela do sinal', valor: 8000 }, { quando: '2ª parcela do sinal', valor: 8000 }]);
  });

  it('à vista: 100% no sinal; centavo ímpar fica na 2ª parcela', () => {
    expect(comissaoPropria(160000, 0.1, false).pagamentos).toEqual([{ quando: 'No pagamento do sinal (à vista)', valor: 16000 }]);
    const c = comissaoPropria(166256.96, 0.02, true);
    expect(c.valor).toBe(3325.14);
    expect(c.pagamentos.map(p => p.valor)).toEqual([1662.57, 1662.57]);
  });

  it('% do corretor: o do vínculo dele; sem ajuste, o do empreendimento (padrão atual)', () => {
    const p = { perfil: 'equipe' as const, modulos: null, acessos: [{ tipo: 'empreendimento' as const, refId: 1, comissaoPct: '0.1000' }, { tipo: 'empreendimento' as const, refId: 2, comissaoPct: null }] };
    expect(pctComissaoCorretor(p, 1, 0.02)).toBe(0.1);
    expect(pctComissaoCorretor(p, 2, 0.02)).toBe(0.02);
    expect(pctComissaoCorretor(p, 3, 0.02)).toBe(0.02);
  });

  it('corretor só vê a comissão da própria venda', () => {
    expect(minhaComissaoNaVenda(5, { corretorId: 5, valorVenda: 160000 }, 0.1, true)?.valor).toBe(16000);
    expect(minhaComissaoNaVenda(5, { corretorId: 9, valorVenda: 160000 }, 0.1, true)).toBeNull();
    expect(minhaComissaoNaVenda(5, { corretorId: null, valorVenda: 160000 }, 0.1, true)).toBeNull();
  });
});
