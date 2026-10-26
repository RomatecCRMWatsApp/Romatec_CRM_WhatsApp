import { describe, expect, it } from 'vitest';
import {
  MODULOS, ajustesNovoCorretor, comissaoNaSimulacao, comissaoPropria, leadVisivel, linhaFinanceira, marcarAcesso, minhaComissaoNaVenda, moduloDoCaminho, moduloLiberado, permissoesEfetivas, temAcesso,
} from '../shared/permissoes';
import type { CondicoesPagamento } from '../shared/simulador';
import { podeAbrir } from '../shared/equipe';
import { exigirDistribuicao, exigirLead, leadsVisiveis, pctComissaoCorretor } from './permissoes';

const acessos = [{ tipo: 'empreendimento' as const, refId: 1 }, { tipo: 'imovel' as const, refId: 7 }];

describe('permissões — pacote base e ajuste por corretor', () => {
  it('sem linhas no banco = padrão do código; ajuste do corretor prevalece sobre o pacote base', () => {
    const padrao = permissoesEfetivas([], []);
    expect(Object.keys(padrao).sort()).toEqual(MODULOS.map(m => m.chave).sort());
    const p = permissoesEfetivas([{ modulo: 'contatos', permitido: 0 }], [{ modulo: 'contatos', permitido: 1 }, { modulo: 'financeiro', permitido: false }]);
    expect(p.contatos).toBe(true);
    expect(p.financeiro).toBe(false);
  });

  it('Disparos WhatsApp (campanhas) é só do escritório: o corretor nunca recebe, a secretária sim', () => {
    expect(permissoesEfetivas([{ modulo: 'campanhas', permitido: 1 }], [{ modulo: 'campanhas', permitido: 1 }], 'corretor').campanhas).toBe(false);
    expect(permissoesEfetivas([], [], 'secretario').campanhas).toBe(true);
    expect(podeAbrir('corretor', '/campaigns')).toBe(false);
    expect(podeAbrir('empreendedor', '/campaigns')).toBe(false);
    expect(podeAbrir('secretario', '/campaigns')).toBe(true);
  });

  it('corretor NOVO começa sem nada: só o que o admin marcou fica liberado, mesmo com o pacote base todo ligado', () => {
    const nenhum = permissoesEfetivas([], ajustesNovoCorretor([]));
    expect(Object.values(nenhum).every(v => v === false)).toBe(true);
    const alguns = permissoesEfetivas(MODULOS.map(m => ({ modulo: m.chave, permitido: true })), ajustesNovoCorretor(['simulador', 'financeiro', 'inexistente']));
    expect(Object.entries(alguns).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(['financeiro', 'simulador']);
  });

  it('módulo desligado bloqueia os procedimentos dele; admin sempre passa', () => {
    const p = permissoesEfetivas([], [{ modulo: 'simulador', permitido: false }]);
    expect(moduloDoCaminho('simulador.simular')?.chave).toBe('simulador');
    expect(moduloLiberado('corretor', p, 'simulador.simular')).toBe(false);
    expect(moduloLiberado('corretor', p, 'empreendimentosAdmin.detalhe')).toBe(true);
    expect(moduloLiberado('admin', p, 'simulador.simular')).toBe(true);
    expect(moduloLiberado('corretor', p, 'auth.me')).toBe(true);
  });
});

describe('leads do corretor (v1.6.0)', () => {
  it('corretor vê só os leads em que é o responsável; secretário e admin veem todos; empreendedor nenhum', () => {
    expect(leadVisivel('corretor', 5, { responsavelId: 5 })).toBe(true);
    expect(leadVisivel('corretor', 5, { responsavelId: 9 })).toBe(false);
    expect(leadVisivel('corretor', 5, { responsavelId: null })).toBe(false);
    expect(leadVisivel('secretario', 5, { responsavelId: 9 })).toBe(true);
    expect(leadVisivel('admin', 1, { responsavelId: null })).toBe(true);
    expect(leadVisivel('empreendedor', 7, { responsavelId: 7 })).toBe(false);
  });

  it('servidor: filtra listas e recusa (403) lead de outro responsável; distribuição só admin', () => {
    const corretor = { perfil: 'corretor' as const, modulos: null, acessos: [] };
    const leads = [{ id: 1, responsavelId: 5 }, { id: 2, responsavelId: 9 }, { id: 3, responsavelId: null }];
    expect(leadsVisiveis(corretor, 5, leads).map(l => l.id)).toEqual([1]);
    expect(leadsVisiveis({ ...corretor, perfil: 'secretario' }, 5, leads)).toHaveLength(3);
    expect(() => exigirLead(corretor, 5, { responsavelId: 9 })).toThrow(/outro responsável/);
    expect(() => exigirLead(corretor, 5, { responsavelId: 5 })).not.toThrow();
    expect(() => exigirDistribuicao({ ...corretor, perfil: 'secretario' })).toThrow(/administrador/);
    expect(() => exigirDistribuicao({ ...corretor, perfil: 'admin' })).not.toThrow();
  });

  it('pacote base por perfil: Desempenho fica desligado para corretor e secretário (matriz)', () => {
    expect(permissoesEfetivas([], [], 'corretor').desempenho).toBe(false);
    expect(permissoesEfetivas([], [], 'secretario').desempenho).toBe(false);
    expect(permissoesEfetivas([], [], 'secretario').leads).toBe(true);
  });

  it('secretário abre todos os empreendimentos/imóveis e não tem comissão própria', () => {
    expect(temAcesso('secretario', [], 'empreendimento', 2)).toBe(true);
    expect(comissaoNaSimulacao('secretario', 160000, 6, C, 0.02, 150000)).toEqual({ comissao: null, minhaComissao: null, comissaoAvistaTotal: null, minhaComissaoAvistaTotal: null });
  });
});

describe('permissões — escopo por empreendimento/imóvel', () => {
  it('corretor não acessa empreendimento não habilitado; admin acessa tudo', () => {
    expect(temAcesso('corretor', acessos, 'empreendimento', 1)).toBe(true);
    expect(temAcesso('corretor', acessos, 'empreendimento', 2)).toBe(false);
    expect(temAcesso('corretor', acessos, 'imovel', 1)).toBe(false);
    expect(temAcesso('admin', [], 'empreendimento', 2)).toBe(true);
    expect(temAcesso('empreendedor', acessos, 'empreendimento', 1)).toBe(false);
  });

  it('lista mostra todos, marcando os sem acesso', () => {
    const l = marcarAcesso('corretor', acessos, 'empreendimento', [{ id: 1 }, { id: 2 }]);
    expect(l).toEqual([{ id: 1, acesso: true }, { id: 2, acesso: false }]);
  });
});

const C: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625, descontoAvistaTotal: 10000,
  jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};

describe('simulador — comissão não vaza para a equipe', () => {
  it('admin vê o breakdown completo (empresa/corretor e venda direta)', () => {
    const k = comissaoNaSimulacao('admin', 160000, 6, C, 0.02, 150000);
    expect(k.comissao?.comCorretor).toMatchObject({ total: 8000, corretor: 3200, romatec: 4800 });
    expect(k.comissao?.vendaDireta.romatec).toBe(8000);
    expect(k.minhaComissao).toBeNull();
  });

  it('à vista total: mesmo % sobre o valor à vista, 100% no ato (sem 50/50)', () => {
    const a = comissaoNaSimulacao('admin', 160000, 6, C, 0.02, 150000).comissaoAvistaTotal!;
    expect(a.comCorretor).toMatchObject({ total: 7500, corretor: 3000, romatec: 4500 });
    expect(a.comCorretor.no1oPagamento).toEqual({ total: 7500, corretor: 3000, romatec: 4500 });
    expect(a.comCorretor.no2oPagamento.total).toBe(0);
    const k = comissaoNaSimulacao('corretor', 160000, 6, C, 0.02, 150000);
    expect(k.comissaoAvistaTotal).toBeNull();
    expect(k.minhaComissaoAvistaTotal).toMatchObject({ valor: 3000, parcelada: false, pagamentos: [{ quando: 'No pagamento à vista', valor: 3000 }] });
    expect(JSON.stringify(k)).not.toMatch(/romatec|vendaDireta|4500/i);
  });

  it('corretor só recebe a própria comissão (padrão = % do empreendimento, 2%), nunca o breakdown', () => {
    const k = comissaoNaSimulacao('corretor', 160000, 6, C, C.comissaoCorretorPct, 150000);
    expect(k.comissao).toBeNull();
    expect(k.minhaComissao).toMatchObject({ pct: 0.02, valor: 3200, parcelada: true });
    expect(k.minhaComissao?.pagamentos.map(p => p.valor)).toEqual([1600, 1600]);
    expect(JSON.stringify(k)).not.toMatch(/romatec|vendaDireta|4800/i);
    expect(comissaoNaSimulacao('corretor', 160000, 1, C, 0.02, 150000).minhaComissao?.pagamentos).toHaveLength(1);
  });
});

describe('financeiro — tudo menos comissão de terceiros', () => {
  const venda = (corretorId: number | null, situacao = 'vendido_parcelado') =>
    ({ loteId: 1, codigo: 'A01', situacao, corretorId, valorVenda: 160000, valorEntrada: 48000, cliente: 'Maria' });

  it('corretor vê a venda de outro corretor com todos os dados, sem comissão nenhuma', () => {
    const l = linhaFinanceira('corretor', 5, venda(9), C, 0.02);
    expect(l).toMatchObject({ valorVenda: 160000, valorEntrada: 48000, cliente: 'Maria', comissao: null, minhaComissao: null });
  });

  it('corretor vê a própria comissão (50/50 na venda parcelada ou com sinal; 100% à vista)', () => {
    expect(linhaFinanceira('corretor', 5, venda(5), C, 0.02).minhaComissao?.pagamentos.map(p => p.valor)).toEqual([1600, 1600]);
    expect(linhaFinanceira('corretor', 5, venda(5, 'entrada'), C, 0.02).parcelada).toBe(true);
    expect(linhaFinanceira('corretor', 5, venda(5, 'vendido_avista'), C, 0.02).minhaComissao?.pagamentos).toHaveLength(1);
    expect(linhaFinanceira('corretor', 5, venda(5), C, 0.02).comissao).toBeNull();
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
    const p = { perfil: 'corretor' as const, modulos: null, acessos: [{ tipo: 'empreendimento' as const, refId: 1, comissaoPct: '0.1000' }, { tipo: 'empreendimento' as const, refId: 2, comissaoPct: null }] };
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
