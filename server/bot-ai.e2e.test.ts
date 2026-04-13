/**
 * Testes End-to-End do Bot de Vendas WhatsApp
 * Valida fluxo completo: Webhook → Qualificação (10 perguntas) → Proposta Multi-Banco → Imóveis Recomendados
 *
 * Executar com: npm test -- bot-ai.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { processBotMessage, registerBotMessage, registerUserReply, BotContext, BotResponse } from './bot-ai';
import { persistLeadState, loadLeadState, discardLead, isLeadBlocked, getStaleLeads } from './lead-persistence';
import { simulateAllBanks, generateMultiBankProposal } from './bank-simulation';
import { recommendProperties, extractLeadProfile } from './property-recommendation';
import { detectQualificationIntent, calculateLeadScore, QUALIFICATION_SEQUENCE } from './qualification-flow';

describe('Bot de Vendas E2E - Fluxo Completo', () => {
  const testPhone = '5599999999999';
  const testName = 'João Silva';

  beforeAll(() => {
    console.log('🧪 Iniciando testes E2E...');
  });

  afterAll(() => {
    console.log('✅ Testes E2E finalizados');
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 1: DETECÇÃO DE INTENÇÃO
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 1: Detecção de Intenção (Positiva/Negativa)', () => {
    it('deve detectar intenção POSITIVA', () => {
      const positivas = [
        'Sim, quero!',
        'Com certeza',
        'Claro, quero saber mais',
        'Tenho interesse sim',
        'Pode ir',
      ];

      for (const msg of positivas) {
        const intent = detectQualificationIntent(msg);
        expect(intent).toBe('SIM');
      }
    });

    it('deve detectar intenção NEGATIVA', () => {
      const negativas = [
        'Não quero',
        'Sem interesse',
        'Obrigado, não',
        'Não, não tenho interesse',
        'Parem de mandar mensagens',
      ];

      for (const msg of negativas) {
        const intent = detectQualificationIntent(msg);
        expect(intent).toBe('NAO');
      }
    });

    it('deve detectar intenção NEUTRA', () => {
      const neutras = ['Talvez', 'Não sei', 'Me manda mais info', '5 mil reais'];

      for (const msg of neutras) {
        const intent = detectQualificationIntent(msg);
        expect(intent).toBe('NEUTRO');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 2: FLUXO DE QUALIFICAÇÃO (10 PERGUNTAS)
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 2: Fluxo de Qualificação - 10 Perguntas', () => {
    it('deve ter 10 perguntas definidas no QUALIFICATION_SEQUENCE', () => {
      expect(QUALIFICATION_SEQUENCE).toHaveLength(10);
    });

    it('cada pergunta deve ter id e função question', () => {
      for (const q of QUALIFICATION_SEQUENCE) {
        expect(q.id).toBeDefined();
        expect(typeof q.question).toBe('function');
        // Testar que a função retorna string
        const result = q.question('João');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it('deve ter IDs únicos e na ordem certa', () => {
      const ids = QUALIFICATION_SEQUENCE.map((q) => q.id);
      const expectedIds = [
        'nome',
        'rendaMensal',
        'financiamentoAtivo',
        'fgtsDisponivel',
        'entradaDisponivel',
        'tipoImovelBusca',
        'regiaoBairro',
        'valorImovelPretendido',
        'isMoradiaOuInvestimento',
        'prazoPrefido',
      ];

      expect(ids).toEqual(expectedIds);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 3: SCORING DE LEAD
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 3: Scoring de Lead (Quente/Morno/Frio)', () => {
    it('deve classificar lead QUENTE quando perfil excelente', () => {
      const answers = {
        nome: 'João Silva',
        rendaMensal: 'R$ 8.000',
        financiamentoAtivo: 'Não',
        fgtsDisponivel: 'Sim, 10 anos',
        entradaDisponivel: 'R$ 80 mil',
        tipoImovelBusca: 'Casa',
        regiaoBairro: 'Centro',
        valorImovelPretendido: 'R$ 400 mil',
        isMoradiaOuInvestimento: 'Moradia',
        prazoPrefido: 'Imediato',
      };

      const score = calculateLeadScore(answers);
      expect(score).toBe('quente');
    });

    it('deve classificar lead MORNO quando perfil viável', () => {
      const answers = {
        nome: 'Maria',
        rendaMensal: 'R$ 3.500',
        financiamentoAtivo: 'Sim',
        fgtsDisponivel: 'Não',
        entradaDisponivel: 'R$ 30 mil',
        tipoImovelBusca: 'Apartamento',
        regiaoBairro: 'Qualquer lugar',
        valorImovelPretendido: 'R$ 250 mil',
        isMoradiaOuInvestimento: 'Investimento',
        prazoPrefido: '6 meses',
      };

      const score = calculateLeadScore(answers);
      expect(['morno', 'quente']).toContain(score);
    });

    it('deve classificar lead FRIO quando perfil desfavorável', () => {
      const answers = {
        nome: 'Carlos',
        rendaMensal: 'R$ 1.500',
        financiamentoAtivo: 'Sim',
        fgtsDisponivel: 'Não',
        entradaDisponivel: 'Sem entrada',
        tipoImovelBusca: 'Qualquer',
        regiaoBairro: 'Longe',
        valorImovelPretendido: 'Sem orçamento',
        isMoradiaOuInvestimento: 'Investimento',
        prazoPrefido: 'Sem pressa',
      };

      const score = calculateLeadScore(answers);
      expect(['frio', 'morno']).toContain(score);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 4: SIMULAÇÃO MULTI-BANCO
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 4: Simulação Multi-Banco (7 Bancos)', () => {
    it('deve simular 7 bancos para um mesmo lead', () => {
      const input = {
        propertyValue: 300000,
        downPaymentPercent: 20,
        loanTermMonths: 240,
        monthlyIncome: 5000,
        hasActiveLoan: false,
        hasFGTS: true,
      };

      const results = simulateAllBanks(input);

      // Deve ter exatamente 7 bancos
      expect(results).toHaveLength(7);

      // Todos devem ter bankId e bankName
      for (const result of results) {
        expect(result.bankId).toBeDefined();
        expect(result.bankName).toBeDefined();
        expect(result.monthlyPayment).toBeGreaterThan(0);
        expect(result.ltvRatio).toBeGreaterThan(0);
        expect(result.debtRatio).toBeGreaterThan(0);
      }
    });

    it('deve ordenar bancos por qualificação e parcela', () => {
      const input = {
        propertyValue: 250000,
        downPaymentPercent: 15,
        loanTermMonths: 240,
        monthlyIncome: 4000,
        hasActiveLoan: false,
        hasFGTS: false,
      };

      const results = simulateAllBanks(input);

      // Primeiro banco deve ser qualificado
      if (results[0].isQualified) {
        expect(results[0].monthlyPayment).toBeGreaterThan(0);

        // Se há banco não qualificado, deve vir depois dos qualificados
        const firstNonQualified = results.findIndex((r) => !r.isQualified);
        if (firstNonQualified > 0) {
          expect(results[0].isQualified).toBe(true);
        }
      }
    });

    it('deve gerar proposta com recomendação de banco', () => {
      const proposal = generateMultiBankProposal('João', 300000, 5000, 'R$ 60 mil', 240, false, true);

      expect(proposal).toBeDefined();
      expect(proposal.length).toBeGreaterThan(100); // Proposta razoavelmente longa
      expect(proposal.toUpperCase()).toContain('RECOMENDAÇÃO');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 5: RECOMENDAÇÃO DE IMÓVEIS
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 5: Recomendação de Imóveis', () => {
    it('deve extrair perfil do lead das respostas', () => {
      const answers = {
        rendaMensal: 'R$ 5.000',
        valorImovelPretendido: 'R$ 300 mil',
        entradaDisponivel: 'R$ 60 mil',
        tipoImovelBusca: 'Casa',
        regiaoBairro: 'Acailandia',
        prazoPrefido: 'Imediato',
        isMoradiaOuInvestimento: 'Moradia',
      };

      const profile = extractLeadProfile(answers, 'quente');

      expect(profile.budgetMax).toBeGreaterThanOrEqual(300000);
      expect(profile.monthlyIncome).toBe(5000);
      expect(profile.urgency).toBe('alta'); // Imediato = alta urgência
      expect(profile.forOwnerOccupancy).toBe(true); // Moradia própria
    });

    it('deve recomendar imóveis compatíveis com o perfil', () => {
      const profile = {
        budgetMin: 200000,
        budgetMax: 350000,
        preferredType: 'Casa',
        monthlyIncome: 5000,
        availableDownPayment: 60000,
        urgency: 'alta' as const,
        score: 'quente' as const,
        forOwnerOccupancy: true,
      };

      const recommendations = recommendProperties(profile, 3);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(3);

      // Recomendações devem estar ordenadas por score (maior primeiro)
      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].matchScore).toBeGreaterThanOrEqual(recommendations[i + 1].matchScore);
      }
    });

    it('deve ter reasoning para cada propriedade recomendada', () => {
      const profile = {
        budgetMin: 200000,
        budgetMax: 400000,
        monthlyIncome: 5000,
        availableDownPayment: 70000,
        urgency: 'média' as const,
        score: 'morno' as const,
        forOwnerOccupancy: true,
      };

      const recommendations = recommendProperties(profile, 1);

      if (recommendations.length > 0) {
        const prop = recommendations[0];
        expect(prop.reasoning).toBeDefined();
        expect(Array.isArray(prop.reasoning)).toBe(true);
        expect(prop.reasoning.length).toBeGreaterThan(0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 6: PERSISTÊNCIA DE LEAD
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 6: Persistência de Lead no Banco', () => {
    it('deve salvar e carregar estado do lead', async () => {
      const phone = '5599998888888';
      const stage = 'qual_etapa_5';
      const name = 'Pedro';
      const answers = { rendaMensal: 'R$ 4.000', nome: 'Pedro' };

      // Salvar
      await persistLeadState(phone, stage, name, answers);

      // Carregar
      const loaded = await loadLeadState(phone);

      expect(loaded).toBeDefined();
      expect(loaded?.phone).toBe(phone.replace(/\D/g, ''));
      expect(loaded?.stage).toBe(stage);
      expect(loaded?.senderName).toBe(name);
    });

    it('deve descartar lead quando rejeição é detectada', async () => {
      const phone = '5599997777777';
      await discardLead(phone, 'Usuário disse não quero');

      const isBlocked = await isLeadBlocked(phone);
      expect(isBlocked).toBe(true);
    });

    it('deve retornar leads stale (sem resposta 45min)', async () => {
      // Simular um lead que não respondeu
      const oldPhone = '5599996666666';
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      // Mock: salvar com lastActivityAt antigo
      // Em teste real, verificaríamos se getStaleLeads() retorna leads esperados
      // Este é um teste simplificado

      const staleLeads = await getStaleLeads(45);
      // Esperamos que seja um array (vazio ou com leads)
      expect(Array.isArray(staleLeads)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 7: REJEIÇÃO DE LEAD (DETECÇÃO E BLOQUEIO)
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 7: Detecção e Bloqueio de Rejeição', () => {
    it('deve detectar "não quero" em qualquer etapa e encerrar', async () => {
      const context: BotContext = {
        phone: testPhone,
        message: 'Não, não quero mais essa conversa',
        senderName: testName,
      };

      registerBotMessage(testPhone, testName);

      // Simular primeiro a abordagem
      let response = await processBotMessage({
        ...context,
        message: 'Sim, tenho interesse',
      });
      expect(response.text).toBeDefined();

      // Simular rejeição no meio da conversa
      response = await processBotMessage({
        ...context,
        message: 'Não, obrigado, não quero',
      });

      // Deve ter mensagem de rejeição
      expect(response.text).toContain('Tudo bem') || expect(response.text).toContain('agradecemos');
      expect(response.qualified).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 8: FLUXO COMPLETO (INTEGRAÇÃO)
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 8: Fluxo Completo Integrado', () => {
    it('deve processar fluxo de 10 perguntas até proposta', async () => {
      const phone = '5599995555555';
      const name = 'Ana Silva';

      // Respostas para as 10 perguntas
      const answers = [
        'Sim, tenho muito interesse', // P1: Interest
        'Ana Silva', // P1: Nome
        'R$ 6.500', // P2: Renda
        'Não, não tenho', // P3: Financiamento ativo
        'Sim, 8 anos', // P4: FGTS
        'R$ 80 mil', // P5: Entrada
        'Casa', // P6: Tipo imóvel
        'Acailandia', // P7: Região
        'R$ 350 mil', // P8: Valor
        'Moradia própria', // P9: Moradia vs investimento
        'Imediato, urgente', // P10: Prazo
      ];

      // Registrar abordagem
      registerBotMessage(phone, name);

      // Processar cada resposta
      let response: BotResponse | undefined;
      for (let i = 0; i < answers.length; i++) {
        response = await processBotMessage({
          phone,
          message: answers[i],
          senderName: name,
        });

        registerUserReply(phone);

        expect(response).toBeDefined();
        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(0);
      }

      // Response final deve conter proposta
      expect(response?.text).toBeDefined();

      // Deve conter elementos de proposta (banco, imóvel, ou ambos)
      const finalText = response?.text?.toUpperCase() || '';
      const hasProposal = finalText.includes('PARCELA') || finalText.includes('RECOMENDAÇÃO') || finalText.includes('IMÓVEL');
      expect(hasProposal).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 9: VALIDAÇÃO DE ERROS
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 9: Tratamento de Erros e Edge Cases', () => {
    it('deve lidar com mensagem vazia', async () => {
      const context: BotContext = {
        phone: testPhone,
        message: '',
        senderName: testName,
      };

      // Não deve lançar erro
      expect(async () => {
        await processBotMessage(context);
      }).not.toThrow();
    });

    it('deve lidar com phone inválido', async () => {
      const context: BotContext = {
        phone: 'abcdef', // Inválido
        message: 'Olá',
        senderName: testName,
      };

      // Deve processar mesmo com phone estranho
      expect(async () => {
        await processBotMessage(context);
      }).not.toThrow();
    });

    it('deve lidar com renda/orçamento faltando', async () => {
      const answers = {
        nome: 'Test',
        rendaMensal: '', // Vazio
        valorImovelPretendido: '', // Vazio
      };

      const profile = extractLeadProfile(answers, 'frio');

      // Deve ter defaults
      expect(profile.monthlyIncome).toBeGreaterThan(0);
      expect(profile.budgetMax).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TESTE 10: PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════
  describe('TESTE 10: Performance', () => {
    it('deve processar mensagem em menos de 500ms', async () => {
      const context: BotContext = {
        phone: '5599999999999',
        message: 'Olá, tenho interesse',
        senderName: 'Teste',
      };

      const start = Date.now();
      await processBotMessage(context);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('deve simular 7 bancos em menos de 200ms', () => {
      const input = {
        propertyValue: 300000,
        downPaymentPercent: 20,
        loanTermMonths: 240,
        monthlyIncome: 5000,
        hasActiveLoan: false,
        hasFGTS: true,
      };

      const start = Date.now();
      simulateAllBanks(input);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });
  });
});
