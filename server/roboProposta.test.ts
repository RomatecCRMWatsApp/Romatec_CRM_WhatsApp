import { describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { valorEmReais } = await import('./qualification-flow');
const { generateMultiBankProposal, valorMaximoQueCabe } = await import('./bank-simulation');
const { extractLeadProfile } = await import('./property-recommendation');
const { slotsComoObjeto, mesclarSlots } = await import('./leads/slots');
const B = await import('./bot-ai');
const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const { eq } = await import('drizzle-orm');

describe('valores escritos pelo lead', () => {
  it('entende milhar com ponto, "mil" e decimais', () => {
    expect(valorEmReais('R$ 350 mil')).toBe(350000);
    expect(valorEmReais('R$ 6.500')).toBe(6500);
    expect(valorEmReais('3,5 mil')).toBe(3500);
    expect(valorEmReais('Até R$ 300 mil')).toBe(300000);
    expect(valorEmReais('não tenho')).toBe(0);
  });
  it('perfil do lead usa os valores em reais (antes "R$ 350 mil" virava 350)', () => {
    const p = extractLeadProfile({ rendaMensal: 'R$ 6.500', entradaDisponivel: 'R$ 80 mil', valorImovelPretendido: 'R$ 350 mil' }, 'quente');
    expect(p).toMatchObject({ budgetMax: 350000, availableDownPayment: 80000, monthlyIncome: 6500 });
  });
});

describe('proposta dos bancos', () => {
  it('quando cabe, recomenda o banco', () => {
    expect(generateMultiBankProposal('João', 300000, 9000, 'R$ 60 mil', 240, false, true)).toContain('RECOMENDAÇÃO PRINCIPAL');
  });
  it('quando não cabe, mostra até quanto a renda comporta (sem falar em CPF)', () => {
    const txt = generateMultiBankProposal('Ana', 350000, 6500, 'R$ 80 mil', 240, false, true);
    expect(txt).toContain('limite de 30% da renda');
    expect(txt).toMatch(/até \*R\$\s3\d{2}\.000\*/);
    expect(txt).not.toContain('CPF');
    const max = valorMaximoQueCabe({ propertyValue: 350000, downPaymentPercent: 0, loanTermMonths: 240, monthlyIncome: 6500, hasActiveLoan: false, hasFGTS: true }, 'R$ 80 mil');
    expect(max).toBeGreaterThan(300000);
    expect(max).toBeLessThan(350000);
  });
});

describe('slots salvos como texto (SQLite)', () => {
  it('não espalha o texto letra a letra', () => {
    expect(slotsComoObjeto('{"objetivo":{"valor":"morar"}}')).toEqual({ objetivo: { valor: 'morar' } });
    expect(slotsComoObjeto('lixo')).toEqual({});
    const { slots } = mesclarSlots('comprador', '{"objetivo":{"valor":"morar","fonte":"bot","at":"x"}}' as any, {}, 'bot');
    expect(Object.keys(slots)).toEqual(['objetivo']);
  });
});

describe('robô: cada resposta vai para o campo da pergunta feita', () => {
  it('nome, renda, financiamento, FGTS e entrada ficam nos campos certos e a proposta sai com CRECI', async () => {
    const phone = '5599990001234';
    B.registerBotMessage(phone, 'Maria Teste');
    let r: any;
    for (const m of ['Sim, tenho interesse', 'Maria Teste', 'R$ 9.000', 'Não', 'Sim, 6 anos', 'R$ 60 mil', 'Casa', 'Centro', 'R$ 300 mil', 'Moradia', 'Imediato']) {
      r = await B.processBotMessage({ phone, message: m, senderName: 'Maria Teste' });
      B.registerUserReply(phone);
    }
    expect(r.text).toContain('RECOMENDAÇÃO PRINCIPAL');
    expect(r.text).toContain('CRECI J-1234');
    const db: any = await getDb();
    const [lead] = await db.select().from(S.leadQualifications).where(eq(S.leadQualifications.phone, phone));
    const ans = typeof lead.answers === 'string' ? JSON.parse(lead.answers) : lead.answers;
    expect(ans).toMatchObject({ nome: 'Maria Teste', rendaMensal: 'R$ 9.000', financiamentoAtivo: 'Não', fgtsDisponivel: 'Sim, 6 anos', entradaDisponivel: 'R$ 60 mil' });
    expect(lead.valorEntrada).toBe('R$ 60 mil');
    expect(lead.prazo).toBe('Imediato');
  }, 20000);
});
