import { describe, expect, it } from 'vitest';
import { classificar, fimDoDia, motivoEncerramento, prazoSchema, textoRanking } from '../shared/ranking';
import { podeAbrir, podeChamar } from '../shared/equipe';

const P = [
  { id: 1, nome: 'Alan Martins', creci: '8662' },
  { id: 2, nome: 'Giegilla Barros', creci: '4706' },
  { id: 3, nome: 'Lidiany Lopes de Souza Lima', creci: '4632' },
  { id: 4, nome: 'Mayara Vieira', creci: '8368' },
];
const v = (corretorId: number, lote: string, dia: string) => ({ corretorId, chave: `1:${lote}`, em: new Date(`${dia}T12:00:00-03:00`) });

describe('ranking de vendas', () => {
  it('ordena por chácaras vendidas; empate → quem chegou antes; sem venda divide a posição', () => {
    const l = classificar(P, [v(2, 'A01', '2026-11-01'), v(2, 'A02', '2026-11-03'), v(4, 'A03', '2026-11-02'), v(4, 'A04', '2026-11-02'), v(1, 'A05', '2026-11-05')]);
    expect(l.map(x => [x.posicao, x.nome, x.vendas])).toEqual([
      [1, 'Mayara Vieira', 2], [2, 'Giegilla Barros', 2], [3, 'Alan Martins', 1], [4, 'Lidiany Lopes de Souza Lima', 0],
    ]);
  });

  it('a mesma chácara só conta uma vez (contrato refeito)', () => {
    const l = classificar(P, [v(1, 'A01', '2026-11-01'), v(1, 'A01', '2026-11-04'), v(2, 'A01', '2026-11-05')]);
    expect(l.find(x => x.id === 1)!.vendas).toBe(1);
    expect(l.find(x => x.id === 2)!.vendas).toBe(0);
  });

  it('encerrada pela data: só conta venda válida até o fim do dia', () => {
    const l = classificar(P, [v(1, 'A01', '2026-11-30'), v(2, 'A02', '2026-12-01')], fimDoDia('2026-11-30'));
    expect(l[0]).toMatchObject({ id: 1, vendas: 1 });
    expect(l.find(x => x.id === 2)!.vendas).toBe(0);
  });

  it('prazo: indeterminado não encerra; data passada encerra; estoque esgotado encerra em qualquer modo', () => {
    const agora = new Date('2026-12-02T10:00:00-03:00').getTime();
    expect(motivoEncerramento({ modo: 'indeterminado', dataEncerramento: null }, 10, agora)).toBeNull();
    expect(motivoEncerramento({ modo: 'data', dataEncerramento: '2026-12-02' }, 10, agora)).toBeNull();
    expect(motivoEncerramento({ modo: 'data', dataEncerramento: '2026-12-01' }, 10, agora)).toBe('data');
    expect(motivoEncerramento({ modo: 'estoque', dataEncerramento: null }, 0, agora)).toBe('estoque');
    expect(motivoEncerramento({ modo: 'indeterminado', dataEncerramento: null }, 0, agora)).toBe('estoque');
    expect(motivoEncerramento({ modo: 'estoque', dataEncerramento: null }, null, agora)).toBeNull();
  });

  it('modo "data" exige a data; senha sempre obrigatória', () => {
    expect(prazoSchema.safeParse({ empreendimentoId: 1, modo: 'data', senha: 'x' }).success).toBe(false);
    expect(prazoSchema.safeParse({ empreendimentoId: 1, modo: 'data', dataEncerramento: '2026-12-31', senha: 'x' }).success).toBe(true);
    expect(prazoSchema.safeParse({ empreendimentoId: 1, modo: 'indeterminado', senha: '' }).success).toBe(false);
  });

  it('mensagem de WhatsApp com a classificação, prêmio e prazo', () => {
    const t = textoRanking({ empreendimento: 'Condomínio de Chácaras Bom Jardims', linhas: classificar(P, [v(3, 'A01', '2026-11-01')]), prazo: { modo: 'data', dataEncerramento: '2026-12-31' }, encerrada: false, estoqueRestante: 81 });
    expect(t).toContain('Bom Jardims');
    expect(t).toContain('🥇 Lidiany Lopes de Souza Lima (CRECI 4632) — *1* chácara');
    expect(t).toContain('Honda Biz 125');
    expect(t).toContain('31/12/2026');
    expect(t).toContain('Chácaras disponíveis: 81');
  });

  it('empreendedor só lê o ranking; corretor abre a tela', () => {
    expect(podeChamar('empreendedor', 'ranking.classificacao')).toBe(true);
    expect(podeChamar('empreendedor', 'ranking.definirPrazo')).toBe(false);
    expect(podeAbrir('empreendedor', '/ranking')).toBe(true);
    expect(podeAbrir('corretor', '/ranking')).toBe(true);
  });
});
