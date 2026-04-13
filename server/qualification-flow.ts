/**
 * Fluxo de Qualificação Inteligente - 10 Perguntas
 * Sistema conversacional para qualificar leads de forma natural e eficiente
 */

export interface QualificationQuestion {
  id: string;
  question: (firstName: string) => string;
  expectedFormat?: string;
  validation?: (answer: string) => boolean;
}

export interface QualificationAnswers {
  nome?: string;                    // P1: Nome completo
  rendaMensal?: string;             // P2: Renda mensal bruta
  financiamentoAtivo?: string;      // P3: Possui financiamento ativo?
  fgtsDisponivel?: string;          // P4: FGTS disponível + tempo carteira
  entradaDisponivel?: string;       // P5: Tem entrada disponível?
  tipoImovelBusca?: string;         // P6: Tipo de imóvel
  regiaoBairro?: string;            // P7: Região/bairro preferência
  valorImovelPretendido?: string;   // P8: Valor do imóvel
  isMoradiaOuInvestimento?: string; // P9: Moradia própria ou investimento?
  prazoPrefido?: string;            // P10: Prazo para fechar negócio
}

/**
 * Sequência de 10 perguntas para qualificação
 */
export const QUALIFICATION_SEQUENCE: QualificationQuestion[] = [
  {
    id: 'nome',
    question: (fn) =>
      `Ótimo, tudo bem! 😊\n\n📝 Qual é seu *nome completo*?`,
  },
  {
    id: 'rendaMensal',
    question: (fn) =>
      `Prazer, *${fn}*! 🤝\n\n💰 Qual é sua *renda mensal bruta* (individual ou familiar)?`,
    expectedFormat: 'Valor em reais ou faixa (ex: R$ 3.000 ou 3-5 mil)',
  },
  {
    id: 'financiamentoAtivo',
    question: (fn) =>
      `Entendi, *${fn}*!\n\n🏦 Você já possui algum *financiamento ativo* (imóvel, veículo, etc)?`,
    expectedFormat: 'Responda: Sim ou Não',
  },
  {
    id: 'fgtsDisponivel',
    question: (fn) =>
      `Anotado!\n\n📊 Você tem *FGTS disponível*? Se sim, há quanto tempo tem carteira assinada?`,
    expectedFormat: 'Ex: "Sim, 5 anos" ou "Não tenho"',
  },
  {
    id: 'entradaDisponivel',
    question: (fn) =>
      `Ótimo!\n\n💸 Você consegue disponibilizar uma *entrada* (mesmo que parcelada)? Qual valor aproximado?`,
    expectedFormat: 'Ex: "R$ 50 mil" ou "Precisa ser parcelado"',
  },
  {
    id: 'tipoImovelBusca',
    question: (fn) =>
      `Perfeito!\n\n🏠 Qual *tipo de imóvel* você procura?\n\n1️⃣ Casa\n2️⃣ Apartamento\n3️⃣ Comercial\n4️⃣ Chácara`,
    expectedFormat: 'Digite: 1, 2, 3 ou 4 (ou nome do tipo)',
  },
  {
    id: 'regiaoBairro',
    question: (fn) =>
      `Legal!\n\n📍 Qual *região ou bairro* você tem preferência?`,
    expectedFormat: 'Ex: "Centro, Zona Norte" ou "Qualquer lugar"',
  },
  {
    id: 'valorImovelPretendido',
    question: (fn) =>
      `Anotado!\n\n💵 Qual é o *valor do imóvel* que você está buscando?`,
    expectedFormat: 'Ex: "Até R$ 300 mil" ou "Entre 250 a 350 mil"',
  },
  {
    id: 'isMoradiaOuInvestimento',
    question: (fn) =>
      `Entendido!\n\n🎯 É para *moradia própria* ou *investimento*?`,
    expectedFormat: 'Responda: Moradia ou Investimento',
  },
  {
    id: 'prazoPrefido',
    question: (fn) =>
      `Quase pronto, *${fn}*! 🎉\n\n⏰ Qual o *prazo ideal* para você *fechar o negócio*?`,
    expectedFormat: 'Ex: "Imediato", "30 dias", "3 meses", "Sem pressa"',
  },
];

/**
 * Detectar intenção: positiva (SIM), negativa (NAO = rejeição de venda), ou neutra
 *
 * REGRA: "não" / "nao" SOZINHO nunca é rejeição — é resposta válida ao formulário.
 * Só retorna NAO para frases compostas que indicam recusa ao atendimento.
 */
export function detectQualificationIntent(message: string): 'SIM' | 'NAO' | 'NEUTRO' {
  const msg = message.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos para comparação

  // Palavras sozinhas que NUNCA são rejeição de venda
  const palavrasSozinhas = ['nao', 'n', 'negativo', 'nope'];
  if (palavrasSozinhas.includes(msg)) return 'NEUTRO';

  // Palavras-chave POSITIVAS
  const positivoRegex = /\b(sim|claro|pode|quero|aceito|vou|com\s*certeza|tenho|possuo|consigo|dou|disponho|beleza|ok|certo|vamos|topa|blz|perfeito|show|top|boa|positivo|afirmativo|confirmo|confirmado)\b/;
  if (positivoRegex.test(msg)) return 'SIM';

  // Frases compostas de REJEIÇÃO DE VENDA — lista L99 completa
  const fraseRejeicao = [
    // Rejeição direta
    'nao quero', 'nao quero isso', 'nao quero comprar', 'nao quero saber',
    'nao quero nada', 'nao tenho interesse', 'sem interesse', 'zero interesse',
    'nao me interessa', 'nao estou interessado', 'nao estou interessada',
    'nao preciso', 'nao preciso disso', 'nao preciso de imovel', 'nao preciso de imoveis',
    'nao vou comprar', 'nao vou adquirir', 'nao vou fechar', 'nao vou',
    'nao quero mais contato', 'nao quero mais', 'desisto', 'desisti',
    'nao tenho mais interesse', 'nao me convenceu', 'nao gostei',
    'nao e pra mim', 'nao e para mim', 'nao serve pra mim', 'nao serve para mim',
    // Remover da lista
    'para de me mandar', 'pare de me mandar', 'para de mandar mensagem', 'pare de mandar mensagem',
    'para de me incomodar', 'pare de me incomodar', 'para de me ligar', 'pare de me ligar',
    'para de me chamar', 'pare de me chamar',
    'me tira da lista', 'me tire da lista', 'me remove da lista', 'me remova da lista',
    'tira meu numero', 'remove meu numero', 'remova meu numero',
    'delete meu numero', 'deleta meu numero',
    'nao me manda mais', 'nao me mande mais', 'nao me liga mais',
    'nao quero receber', 'nao quero mensagem', 'nao quero contato',
    'vou te bloquear', 'vou bloquear', 'bloqueando',
    'para com isso', 'pare com isso', 'chega de mensagem', 'chega de msg',
    'isso e spam', 'vou denunciar',
    // Encerramento agressivo
    'me deixa em paz', 'me deixa', 'suma', 'vai embora', 'some',
    'nao me chateia', 'nao me perturbe', 'nao me enche', 'me larga', 'me largue',
    'to fora', 'tou fora', 'estou fora',
    'nao to afim', 'nao estou afim',
    'nao quero ser incomodado', 'nao quero ser incomodada',
    'pessimo atendimento', 'horrivel',
    // Financeiro (encerramento, não objeção que pode ser revertida)
    'nao tenho dinheiro', 'sem dinheiro', 'sem grana', 'nao tenho grana',
    'nao consigo pagar', 'nao posso pagar', 'nao tenho como pagar',
    'estou negativado', 'estou negativada', 'to negativado',
    'nao consigo financiar', 'cpf sujo',
    // Já resolveu
    'ja comprei', 'ja adquiri', 'ja fechei', 'ja tenho imovel', 'ja tenho casa',
    'ja tenho apartamento', 'ja resolvi', 'ja encontrei',
    'ja estou atendido', 'ja estou atendida', 'ja comprei com outro',
    'fechei com outra imobiliaria', 'fechei com outro corretor',
    'nao preciso mais', 'nao procuro mais', 'nao estou mais procurando',
    'desisti de comprar', 'prefiro alugar', 'decidi alugar', 'optei por alugar',
    // Recusa de contato
    'nao autorizei contato', 'lgpd', 'violacao de dados',
    'vou processar', 'vou acionar a lgpd', 'numero errado', 'engano',
    // Expressões coloquiais
    'deixa pra la', 'esquece isso', 'nao rola', 'nao vai rolar',
    'nao tem como', 'impossivel', 'sem chance', 'nem a pau', 'nem pensar',
    'de jeito nenhum', 'de forma alguma', 'jamais', 'nunca vou comprar',
    'jamais vou comprar', 'nao va dar', 'nao vai dar',
    'falido', 'falida', 'sem emprego', 'desempregado', 'desempregada',
    'perdi o emprego', 'fui demitido', 'fui demitida',
    // Desconfiança
    'parece golpe', 'parece fraude', 'isso e golpe', 'isso e fraude',
    'nao confio', 'parece mentira', 'empresa fantasma',
    'ja fui enganado', 'ja fui enganada',
    'nao vou passar dados', 'nao vou informar dados',
  ];

  for (const frase of fraseRejeicao) {
    if (msg.includes(frase)) return 'NAO';
  }

  // Palavras sozinhas que encerram (contexto óbvio de recusa)
  if (/^(chega|basta|pare|para|some|suma|desisto|desisti|jamais|nunca)$/.test(msg)) return 'NAO';

  return 'NEUTRO';
}

/**
 * Gerar resposta bot para rejeição educada
 */
export function generateRejectionResponse(firstName: string): string {
  return `Tudo bem, *${firstName}*! 😊\n\nAgradecemos seu contato. Caso mude de ideia, estaremos por aqui!\n\n*Sucesso sempre!* 🙏\n— Romatec Imóveis`;
}

/**
 * Validar se a resposta está completa para avançar para próxima pergunta
 */
export function isResponseValid(answer: string, questionId?: string): boolean {
  if (!answer || answer.trim().length === 0) return false;

  // Respostas muito curtas provavelmente são dúvidas
  if (answer.length < 2) return false;

  // Se tem ponto de interrogação, é provável que seja dúvida, não resposta
  if (answer.trim().endsWith('?')) return false;

  // Válido para avançar
  return true;
}

/**
 * Calcular score do lead baseado nas respostas
 */
export function calculateLeadScore(answers: QualificationAnswers): 'quente' | 'morno' | 'frio' {
  let score = 0;
  let maxScore = 0;

  // Renda > R$ 2.500/mês = positivo
  if (answers.rendaMensal) {
    maxScore += 2;
    if (/\d{4,}|[5-9]\s*mil|[1-9][0-9]*\s*mil/.test(answers.rendaMensal)) {
      score += 2;
    }
  }

  // Sem financiamento ativo = melhor
  if (answers.financiamentoAtivo) {
    maxScore += 2;
    if (!/sim|tenho|tem|possui|ativo/.test(answers.financiamentoAtivo.toLowerCase())) {
      score += 2;
    }
  }

  // Tem FGTS = positivo
  if (answers.fgtsDisponivel) {
    maxScore += 2;
    if (/sim|tenho|tem|disponível|disponvel|anos/.test(answers.fgtsDisponivel.toLowerCase())) {
      score += 2;
    }
  }

  // Tem entrada = muito positivo
  if (answers.entradaDisponivel) {
    maxScore += 3;
    if (/sim|tenho|consigo|reais|[0-9]|r\$|mil/.test(answers.entradaDisponivel.toLowerCase())) {
      score += 3;
    }
  }

  // Valor do imóvel na faixa = positivo
  if (answers.valorImovelPretendido) {
    maxScore += 1;
    if (/[0-9]{5,}|até|entre|mil|reais|[0-9]{3}\s*mil/.test(answers.valorImovelPretendido.toLowerCase())) {
      score += 1;
    }
  }

  // Morar (não investimento) = preferencial
  if (answers.isMoradiaOuInvestimento) {
    maxScore += 1;
    if (/moradia|próprio|casa|morar|mora|viver/.test(answers.isMoradiaOuInvestimento.toLowerCase())) {
      score += 1;
    }
  }

  // Prazo curto = positivo
  if (answers.prazoPrefido) {
    maxScore += 1;
    if (/imediato|urgente|logo|30|dias|hoje|agora|semana|2\s*meses|rápido/.test(answers.prazoPrefido.toLowerCase())) {
      score += 1;
    }
  }

  // Calcular proporção
  const proportion = maxScore > 0 ? score / maxScore : 0;

  if (proportion >= 0.75) return 'quente';
  if (proportion >= 0.45) return 'morno';
  return 'frio';
}

/**
 * Gerar mensagem de proposta com recomendações
 */
export function generateProposalMessage(
  firstName: string,
  answers: QualificationAnswers,
  score: 'quente' | 'morno' | 'frio'
): string {
  const messages: Record<typeof score, string> = {
    quente: `*${firstName}*, seu perfil é *EXCELENTE* para financiamento! 🔥\n\n✅ Pré-aprovado para os melhores imóveis\n✅ Entrada compatível com sua renda\n✅ Sem restrições\n\n🏠 Vou te enviar os imóveis que combinam com seu perfil!\n\n👤 *Falar com consultor agora:*\nwa.me/5599991811246`,

    morno: `Ótimo, *${firstName}*! Seu perfil é *VIÁVEL* 😊\n\n📊 Temos algumas opções ideais para sua realidade:\n✅ Financiamento com entrada parcelada\n✅ Parcelas que cabem no orçamento\n✅ Simulação personalizada gratuita\n\n🔗 Deixa eu te mandar as opções melhores!`,

    frio: `Entendemos, *${firstName}*! 💭\n\nMesmo que o momento não seja ideal, *nós nos importamos*:\n✅ Podemos regularizar seu CPF\n✅ Guardaremos seu contato com prioridade\n✅ Quando estiver pronto, saímos na frente!\n\n📞 Volte a falar com a gente em breve!`,
  };

  return messages[score];
}
