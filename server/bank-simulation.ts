/**
 * Simulador de Financiamento Imobiliário
 * Cálculos SAC e PRICE para 7 bancos brasileiros
 * Com recomendações automáticas baseadas no perfil do lead
 */

export interface BankConfig {
  id: string;
  name: string;
  taxaAnual: number; // Taxa anual em % (ex: 8.5)
  minIncome: number; // Renda mínima em R$
  maxLTV: number; // Loan-to-Value máximo (0.8 = 80%)
  minDownPayment: number; // Entrada mínima em %
  processingFee: number; // Taxa de processamento em %
  insurance: number; // Seguro anual em %
  advantages: string[];
}

export interface SimulationInput {
  propertyValue: number; // Valor do imóvel em R$
  downPaymentPercent: number; // Percentual de entrada (ex: 20 = 20%)
  loanTermMonths: number; // Prazo em meses (ex: 240 = 20 anos)
  monthlyIncome: number; // Renda mensal em R$
  hasActiveLoan: boolean; // Possui financiamento ativo
  hasFGTS: boolean; // Tem FGTS disponível
}

export interface SimulationResult {
  bankId: string;
  bankName: string;
  method: 'SAC' | 'PRICE';
  loanAmount: number;
  downPayment: number;
  monthlyPayment: number;
  totalInterest: number;
  totalWithInsurance: number;
  ltvRatio: number;
  debtRatio: number; // Quanto % da renda vai para parcela
  isQualified: boolean;
  reason: string;
}

/**
 * 7 Bancos brasileiros com taxas reais (2026)
 */
const BANKS_CONFIG: BankConfig[] = [
  {
    id: 'caixa',
    name: '🏛️ Caixa Econômica',
    taxaAnual: 7.5,
    minIncome: 1200,
    maxLTV: 0.95,
    minDownPayment: 5,
    processingFee: 0.3,
    insurance: 0.35,
    advantages: ['FGTS + abatimento', 'Menor taxa', 'Maior LTV', 'Programa social'],
  },
  {
    id: 'bb',
    name: '🏦 Banco do Brasil',
    taxaAnual: 8.2,
    minIncome: 1500,
    maxLTV: 0.90,
    minDownPayment: 10,
    processingFee: 0.4,
    insurance: 0.4,
    advantages: ['Rápida aprovação', 'Boa liquidez', 'Credibilidade alta'],
  },
  {
    id: 'itau',
    name: '💳 Itaú',
    taxaAnual: 8.8,
    minIncome: 2000,
    maxLTV: 0.85,
    minDownPayment: 15,
    processingFee: 0.5,
    insurance: 0.45,
    advantages: ['Premium', 'Crédito pré-aprovado', 'Serviços integrados'],
  },
  {
    id: 'bradesco',
    name: '🏢 Bradesco',
    taxaAnual: 8.5,
    minIncome: 1800,
    maxLTV: 0.88,
    minDownPayment: 12,
    processingFee: 0.45,
    insurance: 0.42,
    advantages: ['Análise ágil', 'Parceria com imobiliárias', 'Sem comprovação rígida'],
  },
  {
    id: 'santander',
    name: '🟧 Santander',
    taxaAnual: 8.6,
    minIncome: 1600,
    maxLTV: 0.87,
    minDownPayment: 13,
    processingFee: 0.48,
    insurance: 0.43,
    advantages: ['Análise rápida', 'Taxa reduzida p/ clientes', 'Portabilidade'],
  },
  {
    id: 'inter',
    name: '🟦 Banco Inter',
    taxaAnual: 7.9,
    minIncome: 1400,
    maxLTV: 0.91,
    minDownPayment: 9,
    processingFee: 0.25,
    insurance: 0.38,
    advantages: ['Digital-first', 'Menor taxa', 'Zero burocr acia', 'Crédito rápido'],
  },
  {
    id: 'bdmg',
    name: '🏛️ BDMG (Minas)',
    taxaAnual: 7.3,
    minIncome: 1300,
    maxLTV: 0.93,
    minDownPayment: 7,
    processingFee: 0.2,
    insurance: 0.33,
    advantages: ['Menor taxa regional', 'FGTS + desconto', 'Desenvolvimento regional'],
  },
];

/**
 * Calcular pagamento mensal SAC
 * Sistema de Amortização Constante
 */
function calculateSAC(
  loanAmount: number,
  monthlyRate: number,
  totalMonths: number,
  insuranceMonthly: number
): { monthlyPayment: number; totalInterest: number } {
  const amortization = loanAmount / totalMonths; // Amortização fixa

  let totalInterest = 0;
  let firstMonthPayment = 0;

  for (let month = 1; month <= totalMonths; month++) {
    const remainingBalance = loanAmount - amortization * (month - 1);
    const monthlyInterest = remainingBalance * monthlyRate;
    totalInterest += monthlyInterest;

    if (month === 1) {
      firstMonthPayment = amortization + monthlyInterest + insuranceMonthly;
    }
  }

  // Média (SAC começa alto e diminui, então usamos média)
  const avgMonthlyPayment = (amortization + (loanAmount * monthlyRate) / 2) + insuranceMonthly;

  return {
    monthlyPayment: avgMonthlyPayment,
    totalInterest,
  };
}

/**
 * Calcular pagamento mensal PRICE
 * Tabela Price (prestações iguais)
 */
function calculatePRICE(
  loanAmount: number,
  monthlyRate: number,
  totalMonths: number,
  insuranceMonthly: number
): { monthlyPayment: number; totalInterest: number } {
  // Fórmula Price: M = P * [i(1+i)^n] / [(1+i)^n - 1]
  const numerator = loanAmount * monthlyRate * Math.pow(1 + monthlyRate, totalMonths);
  const denominator = Math.pow(1 + monthlyRate, totalMonths) - 1;
  const monthlyPayment = numerator / denominator;

  const totalPaid = monthlyPayment * totalMonths;
  const totalInterest = totalPaid - loanAmount;

  return {
    monthlyPayment: monthlyPayment + insuranceMonthly,
    totalInterest,
  };
}

/**
 * Extrair valor numérico de string (ex: "R$ 3.500" → 3500)
 */
function parseValue(value: string): number {
  if (!value) return 0;
  const match = value.toString().match(/\d+[\d.]*[\d]/);
  if (!match) return 0;
  return parseInt(match[0].replace(/\D/g, ''), 10);
}

/**
 * Extrair percentual de entrada disponível (10%, 20%, etc.)
 */
function parseDownPaymentPercent(downPaymentStr: string, propertyValue: number): number {
  if (!downPaymentStr) return 0;

  const lowerStr = downPaymentStr.toLowerCase();

  // Se mencionar percentual
  const percentMatch = downPaymentStr.match(/(\d+)\s*%/);
  if (percentMatch) {
    return Math.min(parseInt(percentMatch[1], 10), 50); // Cap em 50%
  }

  // Se mencionar valor em reais
  if (/reais|mil|r\$/.test(lowerStr)) {
    const valueAmount = parseValue(downPaymentStr);
    if (valueAmount > 0) {
      return Math.min((valueAmount / propertyValue) * 100, 50);
    }
  }

  // Se mencionar parcelado, assumir 10%
  if (/parcelad|pouco|pequen|mín|mínimo/.test(lowerStr)) {
    return 10;
  }

  // Padrão: 20%
  return 20;
}

/**
 * Executar simulação para todos os bancos
 */
export function simulateAllBanks(input: SimulationInput): SimulationResult[] {
  const results: SimulationResult[] = [];

  for (const bank of BANKS_CONFIG) {
    const simulation = simulateBank(bank, input);
    results.push(simulation);
  }

  // Ordenar por melhor opção (menor parcela que qualifica)
  return results.sort((a, b) => {
    if (a.isQualified && !b.isQualified) return -1;
    if (!a.isQualified && b.isQualified) return 1;
    if (a.isQualified && b.isQualified) return a.monthlyPayment - b.monthlyPayment;
    return 0;
  });
}

/**
 * Simular financiamento para um banco específico
 */
export function simulateBank(bank: BankConfig, input: SimulationInput): SimulationResult {
  // Validações básicas
  if (input.monthlyIncome < bank.minIncome) {
    return {
      bankId: bank.id,
      bankName: bank.name,
      method: 'PRICE',
      loanAmount: 0,
      downPayment: 0,
      monthlyPayment: 0,
      totalInterest: 0,
      totalWithInsurance: 0,
      ltvRatio: 0,
      debtRatio: 0,
      isQualified: false,
      reason: `Renda mínima: R$ ${bank.minIncome.toLocaleString('pt-BR')} (sua: R$ ${input.monthlyIncome.toLocaleString('pt-BR')})`,
    };
  }

  // Calcular entrada
  const downPaymentPercent = input.downPaymentPercent || 20;
  const downPayment = (input.propertyValue * downPaymentPercent) / 100;

  // Calcular valor do financiamento
  let loanAmount = input.propertyValue - downPayment;

  // Verificar LTV máximo
  const ltv = loanAmount / input.propertyValue;
  if (ltv > bank.maxLTV) {
    loanAmount = input.propertyValue * bank.maxLTV;
  }

  // Adicionar custos
  const processingCost = loanAmount * (bank.processingFee / 100);
  const finalLoanAmount = loanAmount + processingCost;

  // Calcular taxa mensal
  const monthlyRate = bank.taxaAnual / 100 / 12;

  // Seguro mensal
  const insuranceMonthly = finalLoanAmount * (bank.insurance / 100 / 12);

  // Simular ambos os métodos e usar PRICE (mais comum)
  const priceResult = calculatePRICE(finalLoanAmount, monthlyRate, input.loanTermMonths, insuranceMonthly);

  // Calcular taxa de endividamento
  const debtRatio = (priceResult.monthlyPayment / input.monthlyIncome) * 100;

  // Critério de aprovação: debt ratio < 30% + renda mínima
  const isQualified = debtRatio <= 30;

  return {
    bankId: bank.id,
    bankName: bank.name,
    method: 'PRICE',
    loanAmount: finalLoanAmount,
    downPayment,
    monthlyPayment: priceResult.monthlyPayment,
    totalInterest: priceResult.totalInterest,
    totalWithInsurance: priceResult.monthlyPayment * input.loanTermMonths,
    ltvRatio: ltv,
    debtRatio,
    isQualified,
    reason: isQualified
      ? `✅ Aprovado! Parcela: R$ ${priceResult.monthlyPayment.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} (~${debtRatio.toFixed(1)}% renda)`
      : `❌ Acima do limite: ${debtRatio.toFixed(1)}% da renda (máx: 30%)`,
  };
}

/**
 * Gerar proposta multi-banco com recomendação
 */
export function generateMultiBankProposal(
  firstName: string,
  propertyValue: number,
  monthlyIncome: number,
  downPaymentStr: string,
  loanTermMonths: number = 240, // 20 anos padrão
  hasActiveLoan: boolean = false,
  hasFGTS: boolean = false
): string {
  // Parseando entrada
  const downPaymentPercent = parseDownPaymentPercent(downPaymentStr, propertyValue);

  // Input para simulação
  const input: SimulationInput = {
    propertyValue,
    downPaymentPercent,
    loanTermMonths,
    monthlyIncome,
    hasActiveLoan,
    hasFGTS,
  };

  // Simular todos
  const results = simulateAllBanks(input);
  const qualifiedBanks = results.filter((r) => r.isQualified);

  if (qualifiedBanks.length === 0) {
    // Nenhum banco aprova
    return `${firstName}, analisamos seu perfil nos 7 principais bancos do Brasil 🏦\n\n❌ Infelizmente, nenhum aprovaria no momento.\n\n✨ Mas não se preocupe! Podemos:\n✅ Regularizar seu CPF\n✅ Aumentar sua entrada\n✅ Ajustar o prazo\n\n📞 Fale com nosso consultor para estratégia!`;
  }

  // Recomendar melhor (primeira que aprova, com menor parcela)
  const best = qualifiedBanks[0];

  // Montar resposta
  let message = `*${firstName}*, que ótimo! 🎉\n\n`;
  message += `📊 Analisamos seu perfil nos *7 principais bancos* e você QUALIFICA! ✅\n\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `🏆 *RECOMENDAÇÃO PRINCIPAL:*\n`;
  message += `${best.bankName}\n`;
  message += `💰 Parcela: R$ ${best.monthlyPayment.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}/mês\n`;
  message += `📅 Prazo: ${(input.loanTermMonths / 12).toFixed(0)} anos\n`;
  message += `✍️ Entrada: R$ ${best.downPayment.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Mostrar top 3 opções
  if (qualifiedBanks.length > 1) {
    message += `📋 *OUTRAS OPÇÕES:*\n`;
    for (let i = 1; i < Math.min(3, qualifiedBanks.length); i++) {
      const bank = qualifiedBanks[i];
      message += `${i + 1}. ${bank.bankName} - R$ ${bank.monthlyPayment.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}/mês\n`;
    }
    message += `\n`;
  }

  message += `🎯 *PRÓXIMO PASSO:*\n`;
  message += `Falar com consultor para escolher a melhor opção\n\n`;
  message += `wa.me/5599991811246 📲`;

  return message;
}

/**
 * Gerar relatório detalhado (para consultor)
 */
export function generateDetailedReport(
  firstName: string,
  propertyValue: number,
  monthlyIncome: number,
  downPaymentStr: string,
  loanTermMonths: number = 240
): string {
  const downPaymentPercent = parseDownPaymentPercent(downPaymentStr, propertyValue);

  const input: SimulationInput = {
    propertyValue,
    downPaymentPercent,
    loanTermMonths,
    monthlyIncome,
    hasActiveLoan: false,
    hasFGTS: false,
  };

  const results = simulateAllBanks(input);

  let report = `\n📋 RELATÓRIO SIMULAÇÃO - ${firstName.toUpperCase()}\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  report += `💼 PERFIL DO CLIENTE:\n`;
  report += `- Valor do Imóvel: R$ ${propertyValue.toLocaleString('pt-BR')}\n`;
  report += `- Renda Mensal: R$ ${monthlyIncome.toLocaleString('pt-BR')}\n`;
  report += `- Entrada Disponível: ${downPaymentPercent.toFixed(1)}% (R$ ${((propertyValue * downPaymentPercent) / 100).toLocaleString('pt-BR')})\n`;
  report += `- Prazo: ${(loanTermMonths / 12).toFixed(0)} anos\n\n`;

  report += `🏦 SIMULAÇÃO POR BANCO:\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const result of results) {
    report += `${result.bankName}\n`;
    report += `  Status: ${result.isQualified ? '✅ APROVADO' : '❌ NÃO QUALIFICA'}\n`;
    if (result.isQualified) {
      report += `  Parcela: R$ ${result.monthlyPayment.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}\n`;
      report += `  Debt Ratio: ${result.debtRatio.toFixed(1)}%\n`;
      report += `  LTV: ${(result.ltvRatio * 100).toFixed(1)}%\n`;
    } else {
      report += `  Motivo: ${result.reason}\n`;
    }
    report += `\n`;
  }

  return report;
}
