/**
 * Sistema de Recomendação Inteligente de Imóveis
 * Filtra e ordena propriedades baseado no perfil do lead
 * Gera propostas automáticas com CTA para agendamento
 */

export interface Property {
  id?: number;
  slug: string;
  name: string;
  value: number; // Valor em R$
  beds?: number; // Quantidade de quartos
  area?: string; // Área em m²
  type: 'Casa' | 'Apartamento' | 'Chacara' | 'Comercial' | 'Terreno'; // Tipo de imóvel
  city: string;
  description?: string;
  imageUrl?: string;
  features?: string[]; // Amenidades
  urlDetails?: string;
}

export interface LeadProfile {
  budgetMin: number; // Orçamento mínimo
  budgetMax: number; // Orçamento máximo
  preferredType?: string; // Casa, Apartamento, etc
  preferredCity?: string; // Cidade preferência
  beds?: number; // Quartos mínimos desejados
  forOwnerOccupancy: boolean; // Moradia própria ou investimento
  availableDownPayment: number; // Entrada disponível em R$
  monthlyIncome: number; // Renda mensal
  loanTermMonths?: number; // Prazo do financiamento
  urgency: 'alta' | 'média' | 'baixa'; // Urgência da compra
  score: 'quente' | 'morno' | 'frio'; // Score de qualificação
}

export interface RecommendedProperty extends Property {
  matchScore: number; // 0-100, quanto mais alto melhor
  reasoning: string[]; // Razões por que é recomendado
  financingApproximate: {
    monthlyPayment: number;
    downPaymentNeeded: number;
    qualifies: boolean;
  };
}

/**
 * Database de imóveis disponíveis
 * Em produção, viria do banco de dados
 */
export const AVAILABLE_PROPERTIES: Property[] = [
  {
    id: 1,
    slug: 'cond-chacaras-giuliano',
    name: 'Condomínio de Chácaras Giuliano',
    value: 160000,
    area: '~1.000m² por unidade',
    type: 'Chacara',
    city: 'Acailandia',
    description: 'Lote em condomínio fechado com infraestrutura completa',
    features: ['Condomínio', 'Infraestrutura', 'Segurança 24h'],
  },
  {
    id: 2,
    slug: 'mod-vaz-03',
    name: 'Mod Vaz 03',
    value: 210000,
    beds: 3,
    area: '92m²',
    type: 'Apartamento',
    city: 'Acailandia',
    description: 'Apartamento 3 quartos, bem localizado',
    features: ['3 Quartos', 'Próx. Centro', 'Bem iluminado'],
  },
  {
    id: 3,
    slug: 'mod-vaz-02',
    name: 'Mod Vaz 02',
    value: 250000,
    beds: 3,
    area: '110m²',
    type: 'Casa',
    city: 'Acailandia',
    description: 'Casa 3 quartos, espaçosa e bem estruturada',
    features: ['3 Quartos', 'Garagem', 'Quintal'],
  },
  {
    id: 4,
    slug: 'mod-vaz-01',
    name: 'Mod Vaz 01',
    value: 300000,
    beds: 2,
    area: '68m²',
    type: 'Apartamento',
    city: 'Acailandia',
    description: 'Apartamento moderno e funcional',
    features: ['2 Quartos', 'Moderno', 'Sacada'],
  },
  {
    id: 5,
    slug: 'alacide',
    name: 'Alacide',
    value: 380000,
    beds: 2,
    area: '58m²',
    type: 'Apartamento',
    city: 'Acailandia',
    description: 'Apartamento premium em localização nobre',
    features: ['2 Quartos', 'Premium', 'Acabamento fino'],
  },
];

/**
 * Calcular score de correspondência entre lead e propriedade
 * Retorna 0-100
 */
function calculateMatchScore(property: Property, profile: LeadProfile): number {
  let score = 50; // Baseline

  // Preço: se está na faixa de orçamento = +30 pontos
  if (property.value >= profile.budgetMin && property.value <= profile.budgetMax) {
    score += 30;
  } else if (property.value > profile.budgetMax) {
    // Penalidade se acima do orçamento (mas não descartar)
    const exceedPercent = ((property.value - profile.budgetMax) / profile.budgetMax) * 100;
    score -= Math.min(exceedPercent, 20); // Máx -20 por estar caro
  } else {
    // Se abaixo do mínimo, pequena penalidade
    score -= 5;
  }

  // Tipo de imóvel: se combina = +15 pontos
  if (profile.preferredType && property.type.toLowerCase() === profile.preferredType.toLowerCase()) {
    score += 15;
  }

  // Cidade: se combina = +10 pontos
  if (profile.preferredCity && property.city.toLowerCase() === profile.preferredCity.toLowerCase()) {
    score += 10;
  }

  // Quartos: se maior ou igual = +10 pontos
  if (profile.beds && property.beds && property.beds >= profile.beds) {
    score += 10;
  }

  // Score do lead: "quente" ganha +5, "frio" perde -10
  if (profile.score === 'quente') {
    score += 5;
  } else if (profile.score === 'frio') {
    score -= 10;
  }

  // Urgência: se alta e propriedade dentro do budget = +5 bônus
  if (profile.urgency === 'alta' && property.value <= profile.budgetMax) {
    score += 5;
  }

  // Normalizar entre 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Gerar razões de recomendação
 */
function generateReasons(property: Property, profile: LeadProfile, score: number): string[] {
  const reasons: string[] = [];

  if (property.value >= profile.budgetMin && property.value <= profile.budgetMax) {
    reasons.push(`✅ Dentro do orçamento (R$ ${property.value.toLocaleString('pt-BR')})`);
  }

  if (property.type.toLowerCase() === profile.preferredType?.toLowerCase()) {
    reasons.push(`✅ Tipo preferido: ${property.type}`);
  }

  if (property.beds && property.beds >= (profile.beds || 0)) {
    reasons.push(`✅ ${property.beds} quartos (sua preferência)`);
  }

  if (property.area) {
    reasons.push(`📐 Área: ${property.area}`);
  }

  if (profile.score === 'quente') {
    reasons.push(`🔥 Seu perfil é excelente para este imóvel!`);
  }

  if (reasons.length === 0) {
    reasons.push(`📍 Propriedade disponível na sua região`);
  }

  return reasons;
}

/**
 * Calcular aproximação de financiamento para uma propriedade
 */
function calculateFinancingApprox(
  property: Property,
  profile: LeadProfile
): { monthlyPayment: number; downPaymentNeeded: number; qualifies: boolean } {
  const downPayment = Math.max(
    property.value * 0.2, // Mínimo 20%
    profile.availableDownPayment
  );

  const loanAmount = property.value - downPayment;

  // Aproximação simples: taxa 8.5% ao ano, 240 meses
  const monthlyRate = 0.085 / 12;
  const months = profile.loanTermMonths || 240;

  // Fórmula Price
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  // Validação: parcela não deve exceder 30% da renda
  const debtRatio = (monthlyPayment / profile.monthlyIncome) * 100;
  const qualifies = debtRatio <= 30;

  return {
    monthlyPayment,
    downPaymentNeeded: downPayment,
    qualifies,
  };
}

/**
 * Recomendador principal:
 * Filtra, ordena e retorna top 3 imóveis recomendados
 */
export function recommendProperties(profile: LeadProfile, maxResults: number = 3): RecommendedProperty[] {
  const recommended: RecommendedProperty[] = [];

  // Calcular score para cada propriedade
  for (const property of AVAILABLE_PROPERTIES) {
    const matchScore = calculateMatchScore(property, profile);

    // Descartar se score muito baixo (abaixo de 30%)
    if (matchScore < 30) {
      continue;
    }

    const financing = calculateFinancingApprox(property, profile);
    const reasons = generateReasons(property, profile, matchScore);

    recommended.push({
      ...property,
      matchScore,
      reasoning: reasons,
      financingApproximate: financing,
    });
  }

  // Ordenar por match score (decrescente)
  recommended.sort((a, b) => b.matchScore - a.matchScore);

  // Retornar top N
  return recommended.slice(0, maxResults);
}

/**
 * Gerar mensagem de proposta automática
 * Mostra imóveis recomendados com CTA para agendamento
 */
export function generateAutomatedProposal(
  firstName: string,
  profile: LeadProfile,
  baseUrl: string = 'https://romateccrmwhatsapp-production.up.railway.app'
): string {
  const recommendations = recommendProperties(profile, 3);

  if (recommendations.length === 0) {
    return `*${firstName}*, buscamos em nossa carteira, mas ainda não temos uma propriedade que se encaixa perfeitamente no seu perfil.\n\n📞 Deixa a gente te ligar para explorar opções customizadas?\n\nwa.me/5599991811246`;
  }

  let message = `*${firstName}* 🎯\n\n`;
  message += `Analisamos sua busca e achamos algumas opções *PERFEITAS* para você:\n\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Mostrar top 3 recomendações
  for (let i = 0; i < recommendations.length; i++) {
    const prop = recommendations[i];
    const ranking = i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉';

    message += `${ranking} *${prop.name}*\n`;
    message += `💰 R$ ${prop.value.toLocaleString('pt-BR')}\n`;
    message += `🏘️ ${prop.type} | ${prop.city}\n`;

    if (prop.beds) {
      message += `🛏️ ${prop.beds} quarto${prop.beds > 1 ? 's' : ''}\n`;
    }

    if (prop.area) {
      message += `📐 Área: ${prop.area}\n`;
    }

    // Mostrar razões
    for (const reason of prop.reasoning.slice(0, 2)) {
      message += `  ${reason}\n`;
    }

    // Financiamento aproximado
    if (prop.financingApproximate.qualifies) {
      const pmt = prop.financingApproximate.monthlyPayment;
      message += `💵 Aprox. R$ ${pmt.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês\n`;
    } else {
      message += `⚠️ Acima do limite de endividamento\n`;
    }

    message += `\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // CTA forte
  message += `🎯 *PRÓXIMO PASSO:*\n`;
  message += `Agende uma visita agora! 📅\n\n`;
  message += `👤 *José Romário* — wa.me/5599991811246 🟢\n`;
  message += `👤 *Daniele* — wa.me/5599992062871 🟢\n\n`;
  message += `⏰ Essas oportunidades saem RÁPIDO! Garanta a sua! 🚀`;

  return message;
}

/**
 * Gerar resumo para consultor (uso interno)
 * Mostra análise detalhada das recomendações
 */
export function generateConsultorSummary(
  firstName: string,
  profile: LeadProfile
): string {
  const recommendations = recommendProperties(profile, 5);

  let summary = `\n📋 ANÁLISE DE RECOMENDAÇÕES — ${firstName.toUpperCase()}\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  summary += `📊 PERFIL DO LEAD:\n`;
  summary += `- Orçamento: R$ ${profile.budgetMin.toLocaleString('pt-BR')} a R$ ${profile.budgetMax.toLocaleString('pt-BR')}\n`;
  summary += `- Tipo preferido: ${profile.preferredType || 'Qualquer'}\n`;
  summary += `- Quartos desejados: ${profile.beds || 'Sem preferência'}\n`;
  summary += `- Renda mensal: R$ ${profile.monthlyIncome.toLocaleString('pt-BR')}\n`;
  summary += `- Entrada disponível: R$ ${profile.availableDownPayment.toLocaleString('pt-BR')}\n`;
  summary += `- Score: ${profile.score.toUpperCase()}\n`;
  summary += `- Urgência: ${profile.urgency.toUpperCase()}\n\n`;

  summary += `🏠 RECOMENDAÇÕES (Top ${Math.min(5, recommendations.length)}):\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < recommendations.length; i++) {
    const prop = recommendations[i];
    summary += `${i + 1}. ${prop.name} (Match: ${prop.matchScore}%)\n`;
    summary += `   Valor: R$ ${prop.value.toLocaleString('pt-BR')}\n`;
    summary += `   Parcela aprox: R$ ${prop.financingApproximate.monthlyPayment.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês\n`;
    summary += `   Status: ${prop.financingApproximate.qualifies ? '✅ QUALIFICA' : '❌ Acima limite'}\n\n`;
  }

  return summary;
}

/**
 * Extrair perfil do lead a partir das respostas de qualificação
 */
export function extractLeadProfile(
  answers: Record<string, any>,
  score: 'quente' | 'morno' | 'frio'
): LeadProfile {
  // Helper para extrair número
  const parseNum = (str: string): number => {
    if (!str) return 0;
    const match = str.toString().match(/\d+[\d.]*[\d]/);
    if (!match) return 0;
    return parseInt(match[0].replace(/[^\d]/g, ''), 10);
  };

  // Extrair renda
  const rendaMensal = parseNum(answers.rendaMensal || '');

  // Extrair valor do imóvel (budget)
  const valorImovel = parseNum(answers.valorImovelPretendido || '');
  const budgetMax = valorImovel > 100000 ? valorImovel : 300000;
  const budgetMin = Math.max(150000, budgetMax * 0.6);

  // Extrair entrada
  const entradaDisponivel = parseNum(answers.entradaDisponivel || '');

  // Extrair tipo de imóvel
  let preferredType: string | undefined;
  const tipoStr = (answers.tipoImovelBusca || '').toLowerCase();
  if (/casa/.test(tipoStr)) preferredType = 'Casa';
  else if (/apart|apt/.test(tipoStr)) preferredType = 'Apartamento';
  else if (/chácara|chacara/.test(tipoStr)) preferredType = 'Chacara';
  else if (/comercial/.test(tipoStr)) preferredType = 'Comercial';

  // Urgência baseada no prazo
  let urgency: 'alta' | 'média' | 'baixa' = 'média';
  const prazoStr = (answers.prazoPrefido || '').toLowerCase();
  if (/imediato|urgente|logo|30\s*dias/.test(prazoStr)) urgency = 'alta';
  else if (/sem\s*pressa|ano|dois\s*anos/.test(prazoStr)) urgency = 'baixa';

  // Tipo de moradia
  const forOwnerOccupancy = !/investimento/.test((answers.isMoradiaOuInvestimento || '').toLowerCase());

  return {
    budgetMin,
    budgetMax,
    preferredType,
    preferredCity: answers.regiaoBairro ? 'Acailandia' : undefined, // Default city
    beds: undefined,
    forOwnerOccupancy,
    availableDownPayment: Math.max(entradaDisponivel, budgetMax * 0.1), // Mínimo 10%
    monthlyIncome: Math.max(rendaMensal, 1200), // Mínimo de subsistência
    loanTermMonths: 240, // Default 20 anos
    urgency,
    score,
  };
}
