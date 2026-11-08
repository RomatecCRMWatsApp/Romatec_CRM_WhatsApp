import { describe, expect, it } from 'vitest';
import { agrupamento, calcularPainel, periodoAnterior, variacao } from '../shared/painelFinanceiro';

const rec = (id: number, data: string, valor: number) => ({ id, data, valor, contratoId: 1, cliente: 'Cliente Teste', descricao: 'x', tipo: 'saldo', forma: 'PIX', empreendimentoId: 1 });
const tit = (id: number, vencimento: string, valor: number) => ({ id, contratoId: 1, cliente: 'Cliente Teste', descricao: 'x', vencimento, valor, status: 'emitida', empreendimentoId: 1 });

describe('painel financeiro — regras', () => {
  it('recebimento entra no caixa pela data do pagamento, não pela emissão', () => {
    const p = calcularPainel({ de: '2027-01-01', ate: '2027-01-31', corte: '2027-01-31', recebimentos: [rec(1, '2027-01-10', 300), rec(2, '2026-12-28', 500)], pagamentos: [], aReceber: [], aPagar: [] });
    expect(p.caixa.recebido).toBe(300);
  });
  it('resultado de caixa = recebido − pago, sem erro de arredondamento', () => {
    const p = calcularPainel({ de: '2026-11-01', ate: '2026-11-30', corte: '2026-11-30', recebimentos: [rec(1, '2026-11-02', 0.1), rec(2, '2026-11-03', 0.2)],
      pagamentos: [{ id: 1, data: '2026-11-05', valor: 0.05, fornecedor: 'F', descricao: 'd', categoria: 'c', empreendimentoId: null }], aReceber: [], aPagar: [] });
    expect(p.caixa.recebido).toBe(0.3);
    expect(p.caixa.resultado).toBe(0.25);
  });
  it('vencido só antes da data de corte; vence hoje fica separado; quitado não entra', () => {
    const p = calcularPainel({ de: '2026-11-01', ate: '2026-11-30', corte: '2026-11-08', recebimentos: [], pagamentos: [],
      aReceber: [tit(1, '2026-11-01', 400), tit(2, '2026-11-08', 250), tit(3, '2026-12-08', 250)], aPagar: [] });
    expect(p.posicao.vencidos).toBe(400);
    expect(p.posicao.qtdVencidos).toBe(1);
    expect(p.posicao.venceHoje).toBe(250);
    expect(p.posicao.aReceber).toBe(900);
    expect(p.alertas.atrasados[0].diasAtraso).toBe(7);
  });
  it('comparação com base zero não gera infinito', () => {
    expect(variacao(500, 0)).toEqual({ absoluta: 500, percentual: null });
    expect(variacao(150, 100).percentual).toBe(50);
  });
  it('período anterior: mês em andamento compara com os mesmos dias do mês anterior; intervalo livre, mesma duração', () => {
    expect(periodoAnterior('2026-11-01', '2026-11-08')).toEqual({ de: '2026-10-01', ate: '2026-10-08' });
    expect(periodoAnterior('2026-03-01', '2026-03-31')).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(periodoAnterior('2026-11-10', '2026-11-19')).toEqual({ de: '2026-10-31', ate: '2026-11-09' });
  });
  it('gráfico preenche o período e a distribuição concilia com o recebido', () => {
    const p = calcularPainel({ de: '2026-11-01', ate: '2026-11-07', corte: '2026-11-07', recebimentos: [rec(1, '2026-11-02', 100), { ...rec(2, '2026-11-03', 50), tipo: 'entrada' }], pagamentos: [], aReceber: [], aPagar: [] });
    expect(p.serie).toHaveLength(7);
    expect(p.distribuicao.reduce((s, x) => s + x.valor, 0)).toBe(p.caixa.recebido);
    expect(agrupamento('2026-01-01', '2026-12-31')).toBe('mes');
  });
});
