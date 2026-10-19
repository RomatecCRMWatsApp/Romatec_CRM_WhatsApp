import { describe, it, expect } from 'vitest';
import { montarRelatorio, percentil, minutosDeAtendimento, type LeadRel } from './relatorio';

const t = (min: number) => new Date(Date.UTC(2026, 9, 10, 12, min));
const lead = (over: Partial<LeadRel>): LeadRel => ({ id: 1, funil: 'comprador', score: 'frio', createdAt: t(0), origemCanal: 'meta_ctwa', origemCampanhaId: 10, ...over });
const base = { campanhas: [{ id: 10, codigo: 'CTWA', nome: 'Anúncio', canal: 'meta_ctwa', gastoTotal: '600' }], interesses: new Map<number, number[]>(), eventos: [], mensagens: [], imoveis: [] };

describe('Percentil e tempo de atendimento', () => {
  it('mediana e pior 10%', () => {
    expect(percentil([], 50)).toBeNull();
    expect(percentil([3, 1, 2], 50)).toBe(2);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 90)).toBe(9);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 100)).toBe(100);
  });
  it('minutos do pedido de corretor até o atendimento', () => {
    expect(minutosDeAtendimento({ aguardandoCorretorDesde: t(0), atendidoAt: t(7) })).toBe(7);
    expect(minutosDeAtendimento({ aguardandoCorretorDesde: t(0), atendidoAt: null })).toBeNull();
    expect(minutosDeAtendimento({ aguardandoCorretorDesde: null, atendidoAt: t(3) })).toBeNull();
  });
});

describe('Funil até a venda e custo por visita', () => {
  const r = montarRelatorio({
    ...base,
    leads: [
      lead({ id: 1, etapa: 'visita_agendada', responsavelId: 7, aguardandoCorretorDesde: t(0), atendidoAt: t(3) }),
      lead({ id: 2, etapa: 'visita_agendada', responsavelId: 7, aguardandoCorretorDesde: t(0), atendidoAt: t(20) }), // visita realizada na agenda
      lead({ id: 3, etapa: 'proposta', responsavelId: 8, aguardandoCorretorDesde: t(0), atendidoAt: t(4) }),
      lead({ id: 4, etapa: 'fechado', responsavelId: 8 }),
      lead({ id: 5, responsavelId: 8, aguardandoCorretorDesde: t(0) }), // ainda esperando
    ],
    visitasRealizadas: new Set([2]),
    responsaveis: new Map([[7, 'Daniele'], [8, 'José']]),
  });

  it('cada etapa ≤ a anterior: pediram visita, visitaram, propostas, vendas', () => {
    expect(r.total).toMatchObject({ leads: 5, visitas: 4, visitasRealizadas: 3, propostas: 2, fechados: 1 });
  });
  it('custo por visita realizada e por venda usam o gasto da campanha', () => {
    expect(r.total.custoPorVisita).toBe(200);
    expect(r.total.custoPorVenda).toBe(600);
    expect(r.porCampanha[0]).toMatchObject({ codigo: 'CTWA', custoPorVisita: 200, custoPorVenda: 600 });
  });
  it('atendimento geral e por corretor', () => {
    expect(r.atendimento).toMatchObject({ atendidos: 3, esperando: 1, medianaMin: 4, p90Min: 20, ate5min: 67 });
    const jose = r.atendimento.porCorretor.find(c => c.nome === 'José')!;
    expect(jose).toMatchObject({ leads: 3, visitasRealizadas: 2, fechados: 1, atendidos: 1, esperando: 1, medianaMin: 4 });
    const dani = r.atendimento.porCorretor.find(c => c.nome === 'Daniele')!;
    expect(dani).toMatchObject({ leads: 2, visitasRealizadas: 1, atendidos: 2, medianaMin: 3, p90Min: 20 });
  });
  it('sem gasto, custo fica vazio', () => {
    const s = montarRelatorio({ ...base, campanhas: [], leads: [lead({ id: 1, etapa: 'fechado' })] });
    expect([s.total.custoPorVisita, s.total.custoPorVenda]).toEqual([null, null]);
    expect(s.atendimento.porCorretor[0].nome).toBe('Sem responsável');
  });
});
