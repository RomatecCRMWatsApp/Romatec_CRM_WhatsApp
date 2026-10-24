import { describe, expect, it } from 'vitest';
import {
  comissao, condicoesDaLinha, dividirEntrada, evolucao, vencimento, mensagemSimulacao, parcelaPrice, precoLote, r2, seloDoLote, simular, taxaMensal, textoEntrada, textoJuros,
  type CondicoesPagamento,
} from '../shared/simulador';
import { podeChamar } from '../shared/equipe';

/** Condições do seed (condicoesPagamento do Bom Jardims, vigentes desde 23/10/2026) */
const C: CondicoesPagamento = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6,
  descontoAvistaPct: 0.0625, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const parcelas = (area: number) => simular(area, 6, C).planos.map(p => p.parcela);

describe('simulador Bom Jardims — valores exatos da spec', () => {
  it('A01 padrão (3.025,11 m²)', () => {
    const s = simular(3025.11, 6, C);
    expect(s.preco).toBe(160000);
    expect(s.entradaAvista).toBe(45000);
    expect(s.saldo).toBe(112000);
    expect(parcelas(3025.11)).toEqual([9631.26, 4955.89, 3399.2, 2157.01, 1234.51]);
    expect(s.parcelasEntrada).toEqual([8000, 8000, 8000, 8000, 8000, 8000]);
  });

  it('C04 (3.143,41 m²)', () => {
    const s = simular(3143.41, 6, C);
    expect(s.preco).toBe(166256.96);
    expect(s.entrada30).toBe(49877.09);
    expect(s.entradaAvista).toBe(46759.77);
    expect(s.saldo).toBe(116379.87);
    expect(parcelas(3143.41)).toEqual([10007.9, 5149.7, 3532.13, 2241.36, 1282.79]);
  });

  it('B15 (3.984,47 m²)', () => {
    const s = simular(3984.47, 6, C);
    expect(s.preco).toBe(210741.16);
    expect(s.entradaAvista).toBe(59270.95);
    expect(s.saldo).toBe(147518.81);
    expect(parcelas(3984.47)).toEqual([12685.64, 6527.56, 4477.19, 2841.06, 1626.01]);
  });

  it('evolução 6x + 120: 126 linhas e a última zera o saldo', () => {
    const ev = evolucao(simular(3025.11, 6, C), 120);
    expect(ev.length).toBe(126);
    expect(ev[ev.length - 1].saldoDevedor).toBe(0);
    expect(ev[6]).toMatchObject({ mes: 6, tipo: 'saldo', numero: 1, parcela: 1234.51 });
  });

  it('comissão: 5% = 8.000; 1º pagamento do sinal = 4.000 (corretor 1.600)', () => {
    const k = comissao(160000, true, false);
    expect(k.total).toBe(8000);
    expect(k.no1oPagamento.total).toBe(4000);
    expect(k.no1oPagamento.corretor).toBe(1600);
    expect(k.corretor).toBe(3200);
    expect(k.romatec).toBe(4800);
    expect(k.no2oPagamento).toEqual({ total: 4000, corretor: 1600, romatec: 2400 });
  });

  it('entrada acima do limite lança erro', () => {
    expect(() => simular(3025.11, 7, C)).toThrow();
    expect(() => simular(3025.11, 0, C)).toThrow();
  });
});

describe('simulador — lote, condições do banco e acesso', () => {
  it('selo: A03/B14 (não comercializável), vendido bloqueia, reserva em negociação', () => {
    expect(seloDoLote({ situacao: 'bloqueado', comercializavel: 0 })).toBe('nao_comercializavel');
    expect(seloDoLote({ situacao: 'disponivel', comercializavel: false })).toBe('nao_comercializavel');
    expect(seloDoLote({ situacao: 'vendido_parcelado', comercializavel: 1 })).toBe('vendido');
    expect(seloDoLote({ situacao: 'quitado', comercializavel: 1 })).toBe('vendido');
    expect(seloDoLote({ situacao: 'reservado', comercializavel: 1 })).toBe('negociacao');
    expect(seloDoLote({ situacao: null, comercializavel: 1 })).toBe('disponivel');
  });

  it('condições vindas do mysql2 (DECIMAL em texto, prazos em JSON) dão o mesmo cálculo', () => {
    const c = condicoesDaLinha({
      precoBase: '160000.00', areaBaseM2: '3025.11', toleranciaAreaM2: '1.00', entradaPct: '0.3000', entradaMaxParcelas: 6,
      descontoAvistaPct: '0.0625', jurosAaEfetivo: '0.0600', metodo: 'PRICE', prazos: '[120, 12, 24, 36, 60]',
      comissaoTotalPct: '0.0500', comissaoCorretorPct: '0.0200', comissao1aParcelaPct: '0.5000',
    });
    expect(c).toEqual(C);
    expect(simular(3025.11, 1, c).planos.map(p => p.parcela)).toEqual([9631.26, 4955.89, 3399.2, 2157.01, 1234.51]);
  });

  it('precoTabela do lote prevalece sobre o preço pela área', () => {
    expect(simular(3025.11, 1, C, 170000).preco).toBe(170000);
    expect(simular(3025.11, 1, C, null).preco).toBe(160000);
  });

  it('equipe usa o simulador; empreendedor não', () => {
    expect(podeChamar('equipe', 'simulador.simular')).toBe(true);
    expect(podeChamar('equipe', 'simulador.salvar')).toBe(true);
    expect(podeChamar('empreendedor', 'simulador.simular')).toBe(false);
  });
});

describe('simulador — vencimentos da evolução', () => {
  it('data da venda + meses, mantendo o dia; fim de mês vai para o último dia', () => {
    expect(vencimento('2026-10-23', 0)).toBe('2026-10-23');
    expect(vencimento('2026-10-23', 3)).toBe('2027-01-23');
    expect(vencimento('2027-01-31', 1)).toBe('2027-02-28');
    expect(vencimento('2028-01-31', 1)).toBe('2028-02-29');
    expect(vencimento('2026-10-23', 125)).toBe('2037-03-23');
  });

  it('entrada em 6x: vencimentos mensais de 0 a 5; 1ª do saldo no mês seguinte à última da entrada', () => {
    const ev = evolucao(simular(3025.11, 6, C), 120);
    const datas = ev.map(l => vencimento('2026-10-23', l.mes));
    expect(ev.filter(l => l.tipo === 'entrada')).toHaveLength(6);
    expect(datas.slice(0, 7)).toEqual(['2026-10-23', '2026-11-23', '2026-12-23', '2027-01-23', '2027-02-23', '2027-03-23', '2027-04-23']);
    expect(datas[datas.length - 1]).toBe('2037-03-23');
  });
});

describe('simulador — regras auxiliares', () => {
  it('tolerância de 1 m² mantém o preço base; acima, proporcional', () => {
    expect(precoLote(3026.11, C)).toBe(160000);
    expect(precoLote(3026.12, C)).toBe(r2((3026.12 * 160000) / 3025.11));
  });

  it('taxa mensal 0,4867551% e Price sem juros = saldo / n', () => {
    expect(taxaMensal(0.06)).toBeCloseTo(0.004867551, 9);
    expect(parcelaPrice(1200, 12, 0)).toBe(100);
  });

  it('entrada parcelada: a última absorve o arredondamento', () => {
    expect(dividirEntrada(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(dividirEntrada(49877.09, 6).reduce((a, b) => a + b, 0)).toBeCloseTo(49877.09, 2);
  });

  it('à vista: entrada efetiva com desconto, saldo inalterado e saldo começa no mês 1', () => {
    const s = simular(3025.11, 1, C);
    expect(s.parcelasEntrada).toEqual([45000]);
    expect(s.saldo).toBe(112000);
    expect(s.planos[4].totalPago).toBe(r2(45000 + 1234.51 * 120));
    const ev = evolucao(s, 12);
    expect(ev.length).toBe(13);
    expect(ev[1]).toMatchObject({ mes: 1, tipo: 'saldo', numero: 1 });
    expect(ev[12].saldoDevedor).toBe(0);
  });

  it('venda direta (sem corretor) e sinal à vista: 100% no ato para a Romatec', () => {
    const k = comissao(160000, false, true);
    expect(k).toMatchObject({ total: 8000, corretor: 0, romatec: 8000 });
    expect(k.no1oPagamento).toEqual({ total: 8000, corretor: 0, romatec: 8000 });
    expect(k.no2oPagamento).toEqual({ total: 0, corretor: 0, romatec: 0 });
  });

  it('textos: juros sempre com "efetivos" e mensagem do WhatsApp com preço', () => {
    expect(textoJuros(C)).toBe('Juros 6,00% a.a. efetivos (0,4868% a.m.) · Tabela Price · sem correção');
    const s = simular(3025.11, 1, C);
    expect(textoEntrada(s).replace(/ /g, ' ')).toBe('à vista R$ 45.000,00 (desconto de R$ 3.000,00)');
    expect(textoEntrada(simular(3025.11, 6, C)).replace(/ /g, ' ')).toBe('6× de R$ 8.000,00');
    const msg = mensagemSimulacao('A01', simular(3025.11, 6, C), 120, C).replace(/ /g, ' ');
    expect(msg).toContain('Chácara A01 (3.025,11 m²)');
    expect(msg).toContain('Preço: *R$ 160.000,00*');
    expect(msg).toContain('Entrada (30%): 6× de R$ 8.000,00');
    expect(msg).toContain('Saldo: *120× de R$ 1.234,51* fixas — juros 6% a.a. efetivos (Tabela Price)');
    expect(msg).toContain('Total a pagar: R$ 196.141,20');
  });
});
