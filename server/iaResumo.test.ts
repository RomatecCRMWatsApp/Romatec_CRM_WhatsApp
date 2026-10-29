import { describe, expect, it } from 'vitest';
import { IaResumoErro, SCHEMA_RESUMO_LEAD, montarPedido, resumoDoLead, validarResumo } from './leads/iaResumo';

describe('resumo da conversa pela IA', () => {
  it('monta o pedido com os dados do lead e a conversa marcada (cliente × nós)', () => {
    const p = montarPedido(
      { nome: 'Maria Souza', empreendimentoSlug: 'bom-jardims', loteCodigo: 'B07', etapa: 'qualificado', score: 'quente', leadScore: 72, slots: { pagamento: { valor: 'financiado' }, prazo: { valor: '' } } },
      [
        { direcao: 'in', autor: 'lead', texto: 'Quero saber o valor da B07', createdAt: new Date('2026-10-29T13:00:00Z') },
        { direcao: 'out', autor: 'bot', texto: 'Posso te mandar a simulação?', createdAt: new Date('2026-10-29T13:01:00Z') },
      ],
      [{ quando: new Date('2026-10-30T13:00:00Z'), status: 'agendada' }],
    );
    expect(p).toContain('Nome: Maria Souza');
    expect(p).toContain('Chácara de interesse: B07');
    expect(p).toContain('Temperatura: quente (72/100)');
    expect(p).toContain('Qualificação: pagamento: financiado');
    expect(p).not.toContain('prazo:');
    expect(p).toContain('Cliente: Quero saber o valor da B07');
    expect(p).toContain('Robô: Posso te mandar a simulação?');
    expect(p).toContain('Visitas: 30/10, 10:00 (agendada)');
  });
  it('valida a resposta e exige resumo e mensagem', () => {
    const r = validarResumo({ resumo: ' Pediu valores. ', interesse: 'B07', objecoes: ['juros', ''], proximoPasso: 'Mandar simulação', mensagemSugerida: 'Oi Maria!' }, 2);
    expect(r).toMatchObject({ resumo: 'Pediu valores.', objecoes: ['juros'], mensagens: 2 });
    expect(() => validarResumo({ resumo: '', mensagemSugerida: '' }, 0)).toThrow(IaResumoErro);
    expect(SCHEMA_RESUMO_LEAD.required).toEqual(['resumo', 'interesse', 'objecoes', 'proximoPasso', 'mensagemSugerida']);
  });
  it('sem chave de IA, avisa qual variável falta', async () => {
    const antes = { a: process.env.ANTHROPIC_API_KEY, o: process.env.OPENAI_API_KEY, f: process.env.BUILT_IN_FORGE_API_KEY };
    delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.BUILT_IN_FORGE_API_KEY;
    await expect(resumoDoLead(1)).rejects.toThrow(/ANTHROPIC_API_KEY ou OPENAI_API_KEY/);
    if (antes.a) process.env.ANTHROPIC_API_KEY = antes.a; if (antes.o) process.env.OPENAI_API_KEY = antes.o; if (antes.f) process.env.BUILT_IN_FORGE_API_KEY = antes.f;
  });
});
