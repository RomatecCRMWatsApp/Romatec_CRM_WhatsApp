import { describe, expect, it } from 'vitest';
import { CARTAO_PADRAO, cartaoDe, linhaCartao, origemDoCartao } from '../shared/cartaoVendas';
import { refDoUsuario, usuarioDaRef } from './cartaoVendas';
import { destinatarios, textoNotificacao, urlDaNotificacao } from '../shared/notificacoes';
import { perfilDe } from '../shared/equipe';
import { tagsIntermediacao } from './contratos/contexto';

describe('cartão de vendas por usuário logado', () => {
  it('admin, corretor e secretária usam os próprios dados; empreendedor usa os do administrador', () => {
    expect(origemDoCartao('admin')).toBe('proprio');
    expect(origemDoCartao('corretor')).toBe('proprio');
    expect(origemDoCartao('secretario')).toBe('proprio');
    expect(origemDoCartao('empreendedor')).toBe('admin');
  });

  it('corretor com CRECI, telefone, e-mail e foto; CRECI some quando não há (secretária)', () => {
    const c = cartaoDe({ name: 'Maria Souza', creci: '12345', creciUf: 'ma', telefone: '99981234567', email: 'maria@x.com', fotoUrl: 'https://f/m.jpg' }, 'corretor');
    expect(c).toMatchObject({ nome: 'Maria Souza', creci: 'CRECI/MA 12.345', telefones: ['(99) 9 8123-4567'], whatsapp: '5599981234567', fotoUrl: 'https://f/m.jpg' });
    expect(linhaCartao(c)).toBe('Corretor(a) Maria Souza · CRECI/MA 12.345 · (99) 9 8123-4567 · maria@x.com');
    const s = cartaoDe({ name: 'Ana Secretária', telefone: '(99) 99111-2222', cpf: '52998224725' } as any, 'secretario');
    expect(s.creci).toBeNull();
    expect(s.papel).toBe('Atendimento');
    expect(JSON.stringify(s)).not.toContain('52998224725'); // CPF nunca vai para material de divulgação
    expect(linhaCartao(s)).toBe('Atendimento Ana Secretária · (99) 9 9111-2222');
  });

  it('sem foto e sem telefone: fallback (admin herda os contatos padrão)', () => {
    const a = cartaoDe({ name: 'José Romário Pinto Bezerra', creci: '4705', creciUf: 'MA' }, 'admin');
    expect(a.fotoUrl).toBeNull();
    expect(a.telefones).toEqual(CARTAO_PADRAO.telefones);
    expect(a.creci).toBe('CRECI/MA 4.705');
    const c = cartaoDe({ name: 'Sem Telefone' }, 'corretor');
    expect(c.telefones).toEqual([]);
    expect(c.whatsapp).toBeNull();
  });

  it('referência do link: assinada, não dá para trocar o id', () => {
    const ref = refDoUsuario(42);
    expect(usuarioDaRef(ref)).toBe(42);
    expect(usuarioDaRef(`${(43).toString(36)}${ref.slice((42).toString(36).length)}`)).toBeNull();
    expect(usuarioDaRef('xx')).toBeNull();
  });
});

describe('pedido de cancelamento: só o administrador recebe', () => {
  it('sininho/push vai só para admin ativo, não para quem pediu', () => {
    const us = [
      { id: 1, role: 'admin' }, { id: 2, role: 'user', perfil: 'corretor' }, { id: 3, role: 'user', perfil: 'secretario' },
      { id: 4, role: 'admin', ativo: false }, { id: 5, role: 'user', perfil: 'empreendedor', empreendimentoSlug: 'bom-jardims' },
    ];
    expect(destinatarios('solicitacao_cancelamento', us, [], perfilDe as any, { empreendimentoId: 1, empreendimentoSlug: '', autorId: 2 })).toEqual([1]);
    const t = textoNotificacao('solicitacao_cancelamento', { contrato: 'BJ-2026-0001', lote: 'A02', comprador: 'Carlos', motivo: 'desistiu', autor: 'Corretor' });
    expect(t.mensagem).toContain('BJ-2026-0001');
    expect(t.mensagem).toContain('Carlos');
    expect(t.mensagem).toContain('desistiu');
    expect(urlDaNotificacao('solicitacao_cancelamento', { contratoId: 7 }, 'admin')).toBe('/contratos/7');
  });
});

describe('intermediação: o cliente vê só os 2% do corretor', () => {
  const cred = (nome: string) => ({ nome, cpf: '52998224725', creci: '1.234', creciUf: 'MA', creciValidade: '', certidaoCodigo: '', certidaoEmissao: '', certidaoValidade: '' });
  const plano: any = { modalidade: 'financiado', preco_tabela: 160000, total_pagar: 196141.2, comissao_percentual: 0.05, comissao_corretor_percentual: 0.02 };
  it('parceiro quando houver; senão o responsável; valor 2% do preço; nada da administradora', () => {
    const t = tagsIntermediacao({ corretor: cred('José'), parceiro: cred('Maria'), plano });
    expect(t).toMatchObject({ intermed_nome: 'MARIA', intermed_comissao_pct: '2%', intermed_comissao_valor: '3.200,00', intermed_creci: 'MA 1.234' });
    expect(Object.values(t).join(' ')).not.toMatch(/5%|8\.000,00/);
    expect(tagsIntermediacao({ corretor: cred('José'), parceiro: null, plano }).intermed_nome).toBe('JOSÉ');
    expect(tagsIntermediacao({ corretor: cred('José'), parceiro: null, plano: { ...plano, modalidade: 'avista', total_pagar: 150000 } }).intermed_comissao_valor).toBe('3.000,00');
  });
});
