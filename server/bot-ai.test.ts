import { describe, it, expect } from 'vitest';
import { simulateFinancing, recommendProperties, formatSimulationWhatsApp, formatRecommendationsWhatsApp } from './bot-ai';

describe('Bot AI - Simulação de Financiamento', () => {
  it('deve calcular financiamento com taxas reais', () => {
    const result = simulateFinancing(300000, 20);
    expect(result.propertyValue).toBe(300000);
    expect(result.entry).toBe(60000);
    expect(result.financed).toBe(240000);
    expect(result.months).toBe(240);
    expect(result.simulations).toHaveLength(5);
    // Caixa deve ter a menor parcela
    const caixa = result.simulations[0];
    expect(caixa.bank).toBe('Caixa');
    expect(caixa.rate).toBe(10.26);
    expect(caixa.monthlyPayment).toBeGreaterThan(2000);
    expect(caixa.monthlyPayment).toBeLessThan(3500);
    // BB deve ter a maior parcela
    const bb = result.simulations[4];
    expect(bb.bank).toBe('Banco do Brasil');
    expect(bb.monthlyPayment).toBeGreaterThan(caixa.monthlyPayment);
  });

  it('deve calcular com diferentes entradas', () => {
    const r20 = simulateFinancing(210000, 20);
    const r40 = simulateFinancing(210000, 40);
    expect(r20.financed).toBe(168000);
    expect(r40.financed).toBe(126000);
    expect(r20.simulations[0].monthlyPayment).toBeGreaterThan(r40.simulations[0].monthlyPayment);
  });

  it('deve formatar parcelas simples para WhatsApp (240x e 300x)', () => {
    const msg = formatSimulationWhatsApp(250000);
    expect(msg).toContain('PARCELAS A PARTIR DE');
    expect(msg).toContain('Caixa');
    expect(msg).toContain('20 anos (240x)');
    expect(msg).toContain('25 anos (300x)');
    expect(msg).toContain('10,26%');
  });
});

describe('Bot AI - Recomendação de Imóveis', () => {
  it('deve recomendar imóveis dentro do orçamento', () => {
    const recs = recommendProperties(260000);
    expect(recs.length).toBeGreaterThanOrEqual(2);
    expect(recs.every(p => p.value <= 260000 * 1.15)).toBe(true);
  });

  it('deve retornar vazio para orçamento muito baixo', () => {
    const recs = recommendProperties(50000);
    expect(recs).toHaveLength(0);
  });

  it('deve retornar todos para orçamento alto', () => {
    const recs = recommendProperties(500000);
    expect(recs).toHaveLength(4);
  });

  it('deve formatar recomendações para WhatsApp', () => {
    const msg = formatRecommendationsWhatsApp(300000);
    expect(msg).toContain('IMÓVEIS DENTRO DO SEU ORÇAMENTO');
    expect(msg).toContain('Alacide');
    expect(msg).toContain('/imovel/');
  });

  it('deve mostrar mensagem para orçamento baixo', () => {
    const msg = formatRecommendationsWhatsApp(50000);
    expect(msg).toContain('210.000');
  });
});
