import { describe, expect, it } from 'vitest';
import { gatilhosDoPlano, partesDaComissao, resumoRepasses, somarDiasUteis } from '../shared/repasseComissao';

const cob = (tipo: string, numero: number, vencimento: string, pagoEm?: string) => ({ tipo, numero, vencimento, status: pagoEm ? 'paga' : 'emitida', pagoEm: pagoEm ?? null });

describe('comissões de venda a pagar ao corretor', () => {
  it('dias úteis pulam sábado e domingo', () => {
    expect(somarDiasUteis('2026-11-06', 5)).toBe('2026-11-13'); // sexta + 5 úteis
    expect(somarDiasUteis('2026-11-07', 1)).toBe('2026-11-09'); // sábado → segunda
  });

  it('gatilhos por forma de pagamento', () => {
    expect(gatilhosDoPlano({ modalidade: 'avista' }).map(g => g.chave)).toEqual(['avista-1']);
    expect(gatilhosDoPlano({ modalidade: 'financiado', entrada_qtd: 1 }).map(g => g.chave)).toEqual(['entrada-1']);
    expect(gatilhosDoPlano({ modalidade: 'financiado', entrada_qtd: 4 }).map(g => g.chave)).toEqual(['entrada-1', 'entrada-2']);
    expect(gatilhosDoPlano({ modalidade: 'financiado', condicao: 'B' }).map(g => g.chave)).toEqual(['entrada-1', 'saldo-1', 'saldo-2', 'saldo-3', 'saldo-4']);
  });

  it('plano de lançamento: valores, datas e situação de cada parte', () => {
    const partes = partesDaComissao({
      plano: { modalidade: 'financiado', condicao: 'A', comissao_corretor: 3200 }, statusContrato: 'ativo', hoje: '2026-12-20',
      cobrancas: [cob('entrada', 1, '2026-11-10', '2026-11-10'), cob('saldo', 1, '2026-12-10', '2026-12-09'), cob('saldo', 2, '2027-01-10'), cob('saldo', 3, '2027-02-10'), cob('saldo', 4, '2027-03-10')],
      repasses: [{ chave: 'entrada-1', valor: 1600, pagoEm: '2026-11-14' }],
    });
    expect(partes.map(p => p.valor)).toEqual([1600, 400, 400, 400, 400]);
    expect(partes.map(p => p.situacao)).toEqual(['paga', 'atrasada', 'aguardando_cliente', 'aguardando_cliente', 'aguardando_cliente']);
    expect(partes[1].dataRepasse).toBe('2026-12-16');
    expect(partes[2].dataRepasse).toBe('2027-01-15'); // previsão: vencimento + 5 dias úteis
  });

  it('cliente atrasado, entrada paga no ato e contrato cancelado', () => {
    const atraso = partesDaComissao({ plano: { modalidade: 'financiado', entrada_qtd: 2, comissao_corretor: 3000 }, statusContrato: 'ativo', hoje: '2026-12-01',
      cobrancas: [cob('entrada', 1, '2026-11-01', '2026-11-01'), cob('entrada', 2, '2026-11-20')], repasses: [] });
    expect(atraso.map(p => p.situacao)).toEqual(['atrasada', 'cliente_atrasado']);
    const noAto = partesDaComissao({ plano: { modalidade: 'financiado', entrada_qtd: 1, comissao_corretor: 3200, parcelas: [{ tipo: 'entrada', numero: 1, vencimento: '2026-12-01' }] },
      statusContrato: 'assinado', hoje: '2026-12-02', cobrancas: [], repasses: [], entradaPagaNoAto: true });
    expect(noAto[0].situacao).toBe('a_pagar');
    const cancelado = partesDaComissao({ plano: { modalidade: 'avista', comissao_corretor: 3000 }, statusContrato: 'cancelado', hoje: '2026-12-02', cobrancas: [], repasses: [] });
    expect(cancelado[0].situacao).toBe('cancelada');
    expect(partesDaComissao({ plano: { modalidade: 'avista', comissao_corretor: 0 }, statusContrato: 'ativo', hoje: '2026-12-02', cobrancas: [], repasses: [] })).toEqual([]);
  });

  it('resumo por situação e por mês', () => {
    const r = resumoRepasses([
      { valor: 100, situacao: 'paga', dataRepasse: '2026-11-14' },
      { valor: 50, situacao: 'a_pagar', dataRepasse: '2026-11-20' },
      { valor: 30, situacao: 'atrasada', dataRepasse: '2026-11-10' },
      { valor: 20, situacao: 'aguardando_cliente', dataRepasse: '2026-12-15' },
      { valor: 99, situacao: 'cancelada', dataRepasse: '2026-12-15' },
    ]);
    expect([r.pago, r.aPagar, r.atrasado, r.previsto]).toEqual([100, 50, 30, 20]);
    expect(r.porMes).toEqual([{ mes: '2026-11', pago: 100, aPagar: 80, previsto: 0 }, { mes: '2026-12', pago: 0, aPagar: 0, previsto: 20 }]);
  });
});
