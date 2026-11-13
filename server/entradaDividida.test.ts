import { describe, expect, it } from 'vitest';
import { simular } from '../shared/simulador';
import { atoPagoEm, linhasDoAto } from '../shared/entradaAto';
import { acoesDaParcela } from '../shared/contratos';
import { partesDaComissao } from '../shared/repasseComissao';
import { planoDoContrato } from './contratos/plano';
import { tagsPlano } from './contratos/contexto';
import { splitDaComissao } from './financeiro/emissao';
import { payloadCobranca } from './financeiro/asaas';
import { planejarEmissao } from './financeiro/emissaoAuto';

// Entrada de R$ 10 mil dos planos de lançamento dividida no ato (R$ 5 mil boleto/PIX + R$ 5 mil cartão) e
// 1º vencimento das parcelas escolhido no contrato. Dados fictícios.
const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const sim = simular(3025.11, 1, C);
const escolha = { modalidade: 'financiado' as const, prazo: 180, condicao: 'B' as const, dataPrimeiroPagamento: '2026-11-20', entradaForma: 'boleto_cartao' as const, inicioParcelas: '2027-03-15' };

describe('entrada dividida (boleto/PIX + cartão) e 1º vencimento das parcelas', () => {
  const p = planoDoContrato(sim, escolha, C, true);

  it('o ato vira duas cobranças no mesmo dia: R$ 5 mil boleto/PIX e R$ 5 mil cartão', () => {
    const ent = p.parcelas.filter(x => x.tipo === 'entrada');
    expect(ent.map(x => [x.numero, x.total, x.valor, x.vencimento, x.forma ?? null])).toEqual([
      [1, 2, 5000, '2026-11-20', null],
      [2, 2, 5000, '2026-11-20', 'cartao'],
    ]);
    expect(p).toMatchObject({ entrada_forma: 'boleto_cartao', entrada_boleto: 5000, entrada_cartao: 5000, entrada_valor: 10000 });
  });

  it('as parcelas começam na data escolhida e seguem mês a mês, no mesmo valor', () => {
    const saldo = p.parcelas.filter(x => x.tipo === 'saldo');
    expect(saldo[0].vencimento).toBe('2027-03-15');
    expect(saldo[1].vencimento).toBe('2027-04-15');
    expect(saldo.at(-1)!.vencimento).toBe('2042-02-15');
    expect(p.saldo_venc1).toBe('2027-03-15');
    const semData = planoDoContrato(sim, { ...escolha, entradaForma: 'unica', inicioParcelas: undefined }, C, true);
    expect(semData.parcelas.find(x => x.tipo === 'saldo')!.valor).toBe(saldo[0].valor);
    expect(semData.parcelas.filter(x => x.tipo === 'entrada')).toHaveLength(1);
    expect(() => planoDoContrato(sim, { ...escolha, inicioParcelas: '2026-11-20' }, C, true)).toThrow(/depois do pagamento da entrada/);
  });

  it('o contrato descreve as duas partes da entrada e a data da 1ª parcela', () => {
    const t = tagsPlano(p);
    expect(t.plano_entrada_forma).toBe('no ato, sem desconto, com vencimento em 20/11/2026, em duas partes: R$ 5.000,00 por boleto bancário ou PIX e R$ 5.000,00 por cartão de crédito');
    expect(t.plano_saldo_venc1).toBe('15/03/2027');
    const c = tagsPlano(planoDoContrato(sim, { ...escolha, condicao: 'C', prazo: 120 }, C, true));
    expect(String(c.plano_entrada_forma)).toMatch(/^R\$ 10\.000,00 no ato \(R\$ 5\.000,00 por boleto bancário ou PIX e R\$ 5\.000,00 por cartão de crédito\)/);
  });

  it('a retenção da comissão do ato fica no boleto, sem passar do valor dele', () => {
    const m = splitDaComissao(p);
    expect(m.get('entrada:1')).toBeGreaterThan(0);
    expect(m.get('entrada:1')!).toBeLessThanOrEqual(5000);
    expect(m.has('entrada:2')).toBe(false);
  });

  it('a parte do cartão sai no Asaas como cartão de crédito', () => {
    const base = { customerId: 'cus_1', cobrancaId: 9, valor: 5000, vencimento: '2026-11-20', descricao: 'Entrada 2/2' };
    expect(payloadCobranca({ ...base, billingType: 'CREDIT_CARD' }).billingType).toBe('CREDIT_CARD');
    expect(payloadCobranca(base).billingType).toBe('UNDEFINED');
  });

  it('a entrada só conta como paga com as duas partes pagas (via assinada, comissão, linha do tempo)', () => {
    const cobs = [
      { tipo: 'entrada', numero: 1, vencimento: '2026-11-20', status: 'paga', pagoEm: '2026-11-20' },
      { tipo: 'entrada', numero: 2, vencimento: '2026-11-20', status: 'emitida', pagoEm: null },
      { tipo: 'saldo', numero: 1, vencimento: '2027-03-15', status: 'prevista', pagoEm: null },
    ];
    expect(linhasDoAto(cobs).map(x => x.numero)).toEqual([1, 2]);
    expect(atoPagoEm(cobs)).toBeNull();
    const pagas = cobs.map(x => (x.tipo === 'entrada' ? { ...x, status: 'paga', pagoEm: x.numero === 2 ? '2026-11-22' : x.pagoEm } : x));
    expect(atoPagoEm(pagas)).toBe('2026-11-22');
    // Entrada de 30% parcelada (meses diferentes): o ato continua só a nº 1
    expect(linhasDoAto([{ tipo: 'entrada', numero: 1, vencimento: '2026-11-20' }, { tipo: 'entrada', numero: 2, vencimento: '2026-12-20' }]).map(x => x.numero)).toEqual([1]);

    const plano = { modalidade: 'financiado', condicao: 'B', comissao_corretor: 3200, parcelas: p.parcelas } as any;
    const ate = (lista: typeof cobs) => partesDaComissao({ plano, statusContrato: 'ativo', cobrancas: lista as any, repasses: [], hoje: '2026-12-01' })[0];
    expect(ate(cobs).clientePagouEm).toBeNull();
    expect(ate(pagas).clientePagouEm).toBe('2026-11-22');
  });

  it('a parte do cartão não tem boleto nem 2ª via: só o link de pagamento no cartão', () => {
    const a = acoesDaParcela({ status: 'emitida', vencimento: '2026-11-20', asaas: true, recibo: false, cartao: true }, '2026-11-19');
    expect(a).toMatchObject({ cartao: true, boleto: false, segundaVia: false });
    expect(acoesDaParcela({ status: 'emitida', vencimento: '2026-11-20', asaas: true, recibo: false }, '2026-11-19')).toMatchObject({ cartao: false, boleto: true });
  });

  it('entrada recebida no ato: nenhuma das duas partes vira cobrança na emissão automática', () => {
    const linhas = [
      { id: 1, tipo: 'entrada', numero: 1, vencimento: '2026-11-20', status: 'prevista' },
      { id: 2, tipo: 'entrada', numero: 2, vencimento: '2026-11-20', status: 'prevista' },
      { id: 3, tipo: 'saldo', numero: 1, vencimento: '2027-03-15', status: 'prevista' },
    ];
    const plano = planejarEmissao(linhas, '2027-02-10', true);
    const ids = plano.blocos.flatMap((b: any) => b.ids ?? b.linhas?.map((l: any) => l.id) ?? []);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(plano.vencidasSemBoleto).toBe(0);
  });
});
