/**
 * Bot IA Inteligente v4.0 - Romatec CRM
 * Consultor Imobiliario Virtual com Qualificacao de Leads
 * Fluxo: Abordagem -> Qualificacao (6 etapas) -> Score -> CTA
 */
import { invokeLLM } from './_core/llm';
import { transcribeAudio } from './_core/voiceTranscription';
import { getDb } from './db';
import { leadQualifications, contacts, campaigns } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  QUALIFICATION_SEQUENCE,
  detectQualificationIntent,
  calculateLeadScore,
  generateRejectionResponse,
  generateProposalMessage,
  isResponseValid,
  QualificationAnswers,
} from './qualification-flow';
import {
  persistLeadState,
  loadLeadState,
  discardLead,
  isLeadBlocked,
} from './lead-persistence';
import {
  generateMultiBankProposal,
  simulateAllBanks,
  SimulationInput,
} from './bank-simulation';
import {
  generateAutomatedProposal,
  extractLeadProfile,
  recommendProperties,
} from './property-recommendation';

// ============ TIPOS ============
export interface BotContext {
  phone: string;
  message?: string;
  audioUrl?: string;
  senderName?: string;
  propertySlug?: string;
}
export interface BotResponse {
  text: string;
  qualified?: boolean;
  buttons?: Array<{ id: string; label: string }>;
}

type ConversationStage =
  | 'nao_iniciado'
  | 'abordagem_enviada'
  | 'qual_etapa_1'   // Nome
  | 'qual_etapa_2'   // Renda mensal
  | 'qual_etapa_3'   // Financiamento ativo?
  | 'qual_etapa_4'   // FGTS disponível?
  | 'qual_etapa_5'   // Entrada disponível?
  | 'qual_etapa_6'   // Tipo de imóvel
  | 'qual_etapa_7'   // Região/bairro
  | 'qual_etapa_8'   // Valor do imóvel
  | 'qual_etapa_9'   // Moradia ou investimento?
  | 'qual_etapa_10'  // Prazo ideal
  | 'qualificado'
  | 'proposta_enviada'
  | 'visita_agendada'
  | 'sem_interesse'
  | 'descartado'
  | 'concluido';

interface QualAnswers {
  prazo?: string;
  primeiroImovel?: string;
  valorParcela?: string;
  valorEntrada?: string;
  tipoEmprego?: string;
  restricaoCPF?: string;
}

interface ConversationState {
  phone: string;
  stage: ConversationStage;
  senderName: string;
  propertySlug?: string;
  campaignId?: number;
  lastBotMessageAt: number;
  lastUserReplyAt: number | null;
  followUpStep: number;
  qualAnswers: QualAnswers;
}

const conversationStates = new Map<string, ConversationState>();

function getState(phone: string): ConversationState | undefined {
  return conversationStates.get(phone.replace(/\D/g, ''));
}

function setState(phone: string, state: Partial<ConversationState>) {
  const clean = phone.replace(/\D/g, '');
  const existing = conversationStates.get(clean) || {
    phone: clean,
    stage: 'nao_iniciado' as ConversationStage,
    senderName: 'Cliente',
    lastBotMessageAt: Date.now(),
    lastUserReplyAt: null,
    followUpStep: 0,
    qualAnswers: {},
  };
  conversationStates.set(clean, { ...existing, ...state });
}

// ============ DADOS DOS IMOVEIS ============
const PROPERTIES = [
  { slug: 'cond-chacaras-giuliano', name: 'Condominio de Chacaras Giuliano', value: 160000, beds: 0, area: '~1.000m2 por unidade', type: 'Chacara', city: 'Acailandia' },
  { slug: 'mod-vaz-03', name: 'Mod Vaz 03', value: 210000, beds: 3, area: '92m2', type: 'Apartamento', city: 'Acailandia' },
  { slug: 'mod-vaz-02', name: 'Mod Vaz 02', value: 250000, beds: 3, area: '110m2', type: 'Casa', city: 'Acailandia' },
  { slug: 'mod-vaz-01', name: 'Mod Vaz 01', value: 300000, beds: 2, area: '68m2', type: 'Apartamento', city: 'Acailandia' },
  { slug: 'alacide', name: 'Alacide', value: 380000, beds: 2, area: '58m2', type: 'Apartamento', city: 'Acailandia' },
] as const;

const BANKS = [
  { name: 'Caixa', rate: 10.26 },
  { name: 'Itau', rate: 11.60 },
  { name: 'Santander', rate: 11.69 },
  { name: 'Bradesco', rate: 11.70 },
  { name: 'Banco do Brasil', rate: 12.00 },
];

const SITE_URL = 'https://romateccrmwhatsapp-production.up.railway.app';

const PLANTAO = {
  data: 'Sabado, 19 de Abril',
  horario: '9h as 17h',
  local: 'Stand de Vendas — Rua Sao Raimundo, 10 - Centro, Acailandia - MA',
  telefone: '(99) 99181-1246',
};

const CONSULTOR_LINK = `\n\n👤 *Falar agora com consultor:*\n🟢 *Jose Romario* — wa.me/5599991811246\n🟢 *Daniele* — wa.me/5599992062871`;

// ============ HELPERS ============
function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtFull(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function calcPrice(financed: number, annualRate: number, months: number): number {
  const r = annualRate / 100 / 12;
  return (financed * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}
function firstName(name: string): string {
  return name.split(' ')[0] || 'Cliente';
}
function getProperty(slug?: string) {
  if (!slug) return PROPERTIES[0];
  return PROPERTIES.find(p => p.slug === slug) || PROPERTIES[0];
}

/**
 * Extrair valor numérico de string (ex: "R$ 3.500" → 3500)
 */
function parseNumericValue(value: string): number {
  if (!value) return 0;
  const match = value.toString().match(/\d+[\d.]*[\d]/);
  if (!match) return 0;
  return parseInt(match[0].replace(/[^\d]/g, ''), 10);
}

/**
 * Extrair percentual de entrada disponível
 * Retorna percentual (0-50)
 */
function parseDownPaymentPercent(downPaymentStr: string, propertyValue: number): number {
  if (!downPaymentStr) return 20; // Default 20%

  const lowerStr = downPaymentStr.toLowerCase();

  // Se mencionar percentual explícito
  const percentMatch = downPaymentStr.match(/(\d+)\s*%/);
  if (percentMatch) {
    return Math.min(parseInt(percentMatch[1], 10), 50);
  }

  // Se mencionar valor em reais
  if (/reais|mil|r\$|k|milhões?/.test(lowerStr)) {
    const valueAmount = parseNumericValue(downPaymentStr);
    if (valueAmount > 0 && propertyValue > 0) {
      return Math.min((valueAmount / propertyValue) * 100, 50);
    }
  }

  // Se mencionar parcelado ou flexível
  if (/parcelad|pouco|pequen|mín|mínimo|flexível|possível/.test(lowerStr)) {
    return 10;
  }

  // Padrão: 20%
  return 20;
}

// ============ INICIACAO — LEAD NOVO MANDA PRIMEIRO CONTATO ============
const PALAVRAS_INICIACAO = [
  'oi', 'ola', 'olá', 'eai', 'ei', 'opa', 'oii', 'oie', 'hey', 'hi',
  'bom dia', 'boa tarde', 'boa noite', 'bom tarde',
  'tudo bem', 'tudo bom', 'td bem', 'td bom', 'como vai', 'como esta',
  'quero saber', 'quero informacao', 'quero informação', 'me interessa',
  'tenho interesse', 'quero comprar', 'quero imovel', 'procuro imovel',
  'info', 'informacao', 'informação', 'mais info', 'detalhes',
  'vim pelo anuncio', 'vi o anuncio', 'anuncio', 'campanha',
  'quanto custa', 'qual o preco', 'qual o preço', 'valor do imovel',
  'ainda disponivel', 'ainda disponível', 'disponivel', 'disponível',
  'pode me ajudar', 'preciso de ajuda', 'quero ajuda',
  'boa', 'certo', 'ok', 'show', 'entendi', 'blz',
];

const RESPOSTAS_INICIACAO = [
  `Olá! Seja bem-vindo(a) à *Romatec Imóveis*! 🏠\n\nSou a assistente virtual e vou te ajudar a encontrar o imóvel ideal.\n\nVamos começar? 😊`,
  `Oi! Que bom ter você aqui! 🎉\n\nSou da equipe *Romatec Imóveis* — especialistas em imóveis em Açailândia/MA.\n\nPronto(a) para te ajudar a conquistar sua casa própria! 🔑`,
  `Olá! Bem-vindo(a) à *Romatec Imóveis*! 🌟\n\nTemos ótimas oportunidades de casas, apartamentos e muito mais.\n\nVamos encontrar o imóvel certo pra você? 🏠`,
  `Boa! Obrigado pelo contato com a *Romatec Imóveis*! 😃\n\nSou sua consultora virtual e estou aqui pra facilitar tudo.\n\nVamos nessa? 💪`,
  `Olá, bem-vindo(a)! 👋\n\n*Romatec Imóveis* — seu sonho, nossa missão!\n\nVou te fazer algumas perguntas rápidas para encontrar o imóvel ideal. Pode ser? 😊`,
];

function isIniciacao(msg: string): boolean {
  const m = msg.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Mensagem muito curta (até 20 chars) = provavelmente iniciação
  if (m.length <= 20) {
    for (const palavra of PALAVRAS_INICIACAO) {
      const p = palavra.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (m === p || m.startsWith(p + ' ') || m.endsWith(' ' + p) || m.includes(' ' + p + ' ')) return true;
    }
  }
  // Frases explícitas de interesse em imóvel (qualquer tamanho)
  if (/\b(quero\s*(comprar|imovel|casa|apartamento|info)|tenho\s*interesse|vim\s*pelo\s*anuncio|vi\s*o\s*anuncio|quanto\s*custa|ainda\s*disponiv)\b/.test(m)) return true;
  return false;
}

function getRespostaIniciacao(): string {
  return RESPOSTAS_INICIACAO[Math.floor(Math.random() * RESPOSTAS_INICIACAO.length)];
}

// ============ PERSUASÃO E GATILHOS ============
const RESPOSTAS_PERSUASAO = {
  HESITACAO: [
    `Entendo, *{fn}*! 🤔\n\nMas sabia que *97% dos imóveis* que apresentamos saem em menos de 30 dias?\n\nEnquanto você pensa, outros estão decidindo.\n\nO que te faz hesitar? Me conta que resolvo aqui mesmo! 💪`,
    `*{fn}*, é natural querer pensar! 😊\n\nMas as *condições de hoje* podem não estar disponíveis amanhã.\n\nTaxa especial + entrada facilitada = janela aberta agora!\n\nQual é sua maior dúvida? Me fala! 🏠`,
    `Pode pensar à vontade, *{fn}*! 😌\n\n⚠️ Só um aviso: temos *poucas unidades* disponíveis e alta demanda.\n\nO que está pesando na decisão? Talvez eu possa ajudar! 🤝`,
  ],
  OBJECAO_PRECO: [
    `*{fn}*, entendo a preocupação com o valor! 💰\n\n✅ Entrada a partir de *10%*\n✅ FGTS pode ser usado na entrada\n✅ Parcelas em até *360 meses*\n✅ Financiamento com taxa *10,26% a.a.*\n\nQual valor você consegue pagar por mês? Me conta! 😊`,
    `*{fn}*, deixa eu mostrar como fica na prática:\n\n🏦 Financiamento em *até 360 meses*\n📉 Taxa de *10,26% a.a.* — menor do mercado\n🔑 Entrada parcelada disponível\n\nAlguns clientes saem com parcelas de *menos de R$ 1.000/mês*!\n\nQuer uma simulação personalizada? 🔢`,
    `Entendo, *{fn}*! 😊\n\nMas vou ser direto: *aguardar* geralmente custa mais caro.\n\nInflação + alta de juros = imóvel mais caro em 6 meses.\n\n*Hoje* é o melhor momento. Posso mostrar as condições pra você?`,
  ],
  OBJECAO_SCORE: [
    `*{fn}*, isso não é um problema! 😊\n\n✅ Trabalhamos com Caixa, Santander, Itaú, Bradesco e BB\n✅ Cada banco tem critérios diferentes\n✅ Muitos clientes com restrições conseguiram aprovação\n\nVamos ver seu caso com atenção. Pode continuar! 💪`,
    `Não se preocupe com o score, *{fn}*! 🤝\n\nAlguns bancos aprovam com score abaixo de 500.\n\nAlém disso, *FGTS como garantia* aumenta muito as chances!\n\nMe conta mais sobre sua situação pra eu ver a melhor opção. 👇`,
  ],
  OBJECAO_RENDA: [
    `*{fn}*, tem opções pra todos os perfis de renda! 😊\n\n✅ Minha Casa Minha Vida: renda de *até R$ 8.000*\n✅ Subsídio de *até R$ 55.000* do governo\n✅ Parcelas a partir de *R$ 300/mês*\n\nQual programa encaixa melhor no seu perfil? 🏠`,
    `Entendo, *{fn}*! Mas *renda familiar* conta na hora do financiamento.\n\nSe tiver cônjuge ou familiar, podem somar rendas!\n\nIsso muda bastante o que você consegue financiar. Qual a renda total da família? 💰`,
  ],
  SINAL_COMPRA: [
    `*{fn}*, percebi que você está *muito interessado(a)*! 🔥\n\nEsse é o momento certo para conversar com nosso consultor.\n\n👤 *José Romário* está disponível agora:\n🟢 wa.me/5599991811246\n\nOu me diz um horário e ele te liga! 📞`,
    `Ótimo, *{fn}*! 🎉 Parece que você encontrou o que procurava!\n\nVou conectar você com nossa especialista agora:\n\n🟢 *Daniele* — wa.me/5599992062871\n\nEla pode esclarecer tudo e garantir as melhores condições! 🏠`,
  ],
};

type PersuasionTrigger = 'HESITACAO' | 'OBJECAO_PRECO' | 'OBJECAO_SCORE' | 'OBJECAO_RENDA' | 'SINAL_COMPRA';

function detectPersuasionTrigger(msg: string): PersuasionTrigger | null {
  const m = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // SINAL_COMPRA — prioridade máxima
  if (/\b(quero\s*comprar|quero\s*fechar|vou\s*comprar|quero\s*assinar|quero\s*esse|e\s*esse\s*mesmo|me\s*interesso|fechado|fecha\s*ai|bora\s*fechar|quero\s*ja|quero\s*agora)\b/.test(m)) return 'SINAL_COMPRA';

  // HESITACAO
  if (/\b(vou\s*pensar|deixa\s*eu\s*pensar|preciso\s*pensar|vou\s*ver|nao\s*sei|talvez|quem\s*sabe|nao\s*tenho\s*certeza|tenho\s*duvida|to\s*em\s*duvida|estou\s*em\s*duvida|ainda\s*nao\s*sei|deixa\s*pra\s*depois|me\s*da\s*um\s*tempo|preciso\s*de\s*tempo)\b/.test(m)) return 'HESITACAO';

  // OBJECAO_PRECO
  if (/\b(muito\s*caro|caro\s*demais|nao\s*tenho\s*esse\s*dinheiro|nao\s*posso\s*pagar\s*isso|e\s*caro|parcela\s*alta|parcela\s*cara|nao\s*tenho\s*entrada|sem\s*entrada|nao\s*consigo\s*a\s*entrada|nao\s*cabe\s*no\s*orcamento)\b/.test(m)) return 'OBJECAO_PRECO';

  // OBJECAO_SCORE
  if (/\b(cpf\s*sujo|score\s*baixo|restricao|negativado|serasa|spc|nome\s*sujo|nao\s*consigo\s*financiar|nao\s*aprovaram|reprovado|banco\s*nao\s*aprovou)\b/.test(m)) return 'OBJECAO_SCORE';

  // OBJECAO_RENDA
  if (/\b(renda\s*baixa|pouca\s*renda|ganho\s*pouco|salario\s*minimo|nao\s*ganho\s*o\s*suficiente|nao\s*tenho\s*renda\s*suficiente|minha\s*renda\s*e\s*pouca)\b/.test(m)) return 'OBJECAO_RENDA';

  return null;
}

function getPersuasionResponse(trigger: PersuasionTrigger, fn: string): string {
  const responses = RESPOSTAS_PERSUASAO[trigger];
  const msg = responses[Math.floor(Math.random() * responses.length)];
  return msg.replace(/\{fn\}/g, fn);
}

// ============ DETECCAO DE INTENCAO ============
type IntentType = 'SIM' | 'NAO' | 'PRECO' | 'TEMPO' | 'OUTROS';

function detectIntent(message: string): IntentType {
  const msg = message.toLowerCase().trim();
  if (/\b(sim|pode|quero|gostei|me\s*interessa|claro|confirmo|confirmado|vamos|ok|certo|beleza|top|show|perfeito|blz|aceito|vou|tenho\s*interesse|com\s*certeza|tudo\s*bem|boa)\b/.test(msg)) return 'SIM';
  // NAO: apenas frases compostas de recusa — "não" sozinho é resposta ao formulário
  if (/\b(sem\s*interesse|n[aã]o\s*tenho\s*interesse|n[aã]o\s*quero|parem|remov[ae]|bloquei|cancelar|para\s*de|pare\s*de|me\s*tira)\b/.test(msg)) return 'NAO';
  if (/\b(caro|preco|valor|quanto|parcela|entrada|financiamento|banco|fgts|desconto|custo)\b/.test(msg)) return 'PRECO';
  if (/\b(ocupado|depois|agora\s*n[aã]o|outro\s*dia|quando|horario|disponibilidade|mais\s*tarde|semana)\b/.test(msg)) return 'TEMPO';
  return 'OUTROS';
}

// ============ QUALIFICACAO — PERGUNTAS EXPANDIDAS ============
// Usando o novo QUALIFICATION_SEQUENCE do módulo qualification-flow.ts
const QUAL_QUESTIONS: Record<string, (fn: string) => string> = {
  // Wrapper para manter compatibilidade com código legado
  // enquanto usa o novo QUALIFICATION_SEQUENCE
  ...Object.fromEntries(
    QUALIFICATION_SEQUENCE.map((q, idx) => [
      `etapa_${idx + 1}`,
      (fn: string) => q.question(fn),
    ])
  ),

  // Manter perguntas legadas para compatibilidade
  etapa_old_1: (fn) => `Que otimo, *${fn}*! Sou consultor da *Romatec Imoveis* e vou te ajudar a encontrar o imovel ideal.\n\nPrimeira pergunta rapida:\n\n📅 Voce tem interesse em adquirir um imovel nos *proximos 3 meses*?`,
  etapa_old_2: (fn) => `Perfeito, *${fn}*!\n\n🏠 Voce ja possui algum imovel proprio ou seria o *primeiro*?`,
};

// ============ SCORING ============
type LeadScore = 'quente' | 'morno' | 'frio';

function calcScore(answers: QualAnswers, propValue: number): LeadScore {
  const restricao = (answers.restricaoCPF || '').toLowerCase();
  const temRestricao = /sim|tenho|tem|possui/.test(restricao);

  const parcela = answers.valorParcela || '';
  const parcelaNum = parseFloat(parcela.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const parcelaMinima = calcPrice(propValue * 0.8, 10.26, 300);

  const entrada = answers.valorEntrada || '';
  const temEntrada20 = /sim|tenho|tem|posso|consigo|dou|disponho/.test(entrada.toLowerCase());

  const prazo = (answers.prazo || '').toLowerCase();
  const interessePrazo = !/nao|n[aã]o|depois|muito\s*tempo|ano\s*que\s*vem/.test(prazo);

  if (!interessePrazo) return 'frio';
  if (temRestricao) return 'frio';
  if (temEntrada20 && (parcelaNum === 0 || parcelaNum >= parcelaMinima * 0.7)) return 'quente';
  return 'morno';
}

function getScoreResponse(score: LeadScore, fn: string, prop: typeof PROPERTIES[number], answers: QualAnswers): string {
  const fin = prop.value * 0.8;
  const pmt300 = calcPrice(fin, 10.26, 300);
  const link = `${SITE_URL}/imovel/${prop.slug}`;

  if (score === 'quente') {
    return `*${fn}*, pelo que me contou, voce esta em um *perfil excelente* para financiar o *${prop.name}*! 🔥\n\n✅ Perfil aprovado para financiamento\n✅ Entrada compativel\n✅ Sem restricoes\n\n💰 *${fmt(prop.value)}* | Parcela partir de *${fmtFull(pmt300)}/mes*\n\n🔗 ${link}\n\nPerfeito! Vou agendar um *consultor para falar com voce hoje*.\n\n📅 Qual o *melhor horario* para te ligar — manha, tarde ou noite?${CONSULTOR_LINK}`;
  }

  if (score === 'morno') {
    const fgts = prop.value <= 300000 ? '\n✅ *FGTS pode ser usado como entrada*' : '';
    return `*${fn}*, entendo sua situacao! Temos otimas opcoes para voce. 😊\n\n${fgts}\n✅ Financiamento com entrada parcelada\n✅ Parcelas que cabem no orcamento\n✅ Simulacao personalizada gratuita\n\n💰 *${fmt(prop.value)}* — financiamento em ate 360 meses\n\n🔗 Veja o imovel: ${link}\n\nPosso te enviar uma *simulacao personalizada*?\n\nOu prefere falar com um consultor essa semana?`;
  }

  // frio
  return `*${fn}*, obrigado pela honestidade! 😊\n\nEntendemos que o momento nao e ideal agora. Mas nao se preocupe:\n\n✅ Podemos *regularizar seu CPF* em parceria com especialistas\n✅ Guardamos seu contato com prioridade\n✅ Quando estiver pronto, saimos na frente!\n\n🔗 Enquanto isso, veja nossos imoveis: ${link}\n\nPosso entrar em contato *daqui 30 dias* para atualizar sua situacao?`;
}

// ============ SALVAR QUALIFICACAO NO BANCO ============
async function saveLeadQualification(
  phone: string,
  nome: string,
  answers: QualAnswers,
  score: LeadScore,
  prop: typeof PROPERTIES[number],
  campaignId?: number,
) {
  try {
    const db = await getDb();
    if (!db) return;

    let contactId: number | undefined;
    const contactResult = await db.select().from(contacts).where(eq(contacts.phone, phone)).limit(1);
    if (contactResult[0]) contactId = contactResult[0].id;

    await db.insert(leadQualifications).values({
      contactId: contactId || null,
      campaignId: campaignId || null,
      phone,
      nome,
      valorParcela: answers.valorParcela || null,
      valorEntrada: answers.valorEntrada || null,
      tipoEmprego: answers.tipoEmprego || null,
      restricaoCPF: answers.restricaoCPF || null,
      prazo: answers.prazo || null,
      primeiroImovel: answers.primeiroImovel || null,
      score,
      campanhaOrigem: prop.name,
    } as any);

    console.log(`[Bot] Lead qualificado: ${nome} (${phone}) — Score: ${score.toUpperCase()}`);
  } catch (e) {
    console.error('[Bot] Erro ao salvar qualificacao:', e);
  }
}

// ============ DETECCAO DE REJEICAO (GATE PRINCIPAL) ============
/**
 * Detecta se o lead quer PARAR a conversa
 * Se sim → encerra com elegância e bloqueia
 */
function checkForRejection(context: BotContext, state: ConversationState, fn: string): BotResponse | null {
  const msg = (context.message || '').trim();
  const qualIntent = detectQualificationIntent(msg);

  // Rejeição detectada em qualquer etapa
  if (qualIntent === 'NAO') {
    console.log(`[Bot] ❌ REJEIÇÃO: ${state.phone} recusou em estágio ${state.stage}`);

    // Encerrar com elegância
    setState(context.phone, {
      stage: 'descartado',
      lastUserReplyAt: Date.now(),
    });

    return {
      text: generateRejectionResponse(fn),
      qualified: false,
    };
  }

  return null; // Continuar processamento normal
}

// ============ PROCESSAMENTO POR ESTAGIO ============
async function processStage(context: BotContext, state: ConversationState): Promise<BotResponse> {
  const msg = (context.message || '').trim();
  const intent = detectIntent(msg);
  const prop = getProperty(state.propertySlug || context.propertySlug);
  const name = state.senderName || context.senderName || 'Cliente';
  const fn = firstName(name);

  // ═══════════════════════════════════════════════════════════════════
  // GATE 1: DETECTAR REJEIÇÃO (CRÍTICO)
  // Se o cliente diz "não quero" em QUALQUER etapa, encerrar com elegância
  // ═══════════════════════════════════════════════════════════════════
  const rejectionResponse = checkForRejection(context, state, fn);
  if (rejectionResponse) {
    return rejectionResponse;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GATE 2: GATILHOS DE PERSUASÃO (hesitação/objeção durante qualificação)
  // Responde ao gatilho SEM avançar o estágio — lead precisa responder de novo
  // ═══════════════════════════════════════════════════════════════════
  const QUAL_STAGES = ['qual_etapa_1','qual_etapa_2','qual_etapa_3','qual_etapa_4','qual_etapa_5','qual_etapa_6','qual_etapa_7','qual_etapa_8','qual_etapa_9','qual_etapa_10'];
  if (QUAL_STAGES.includes(state.stage)) {
    const trigger = detectPersuasionTrigger(msg);
    if (trigger) {
      console.log(`[Bot] 💬 GATILHO ${trigger}: ${state.phone} em estágio ${state.stage}`);
      setState(context.phone, { lastUserReplyAt: Date.now() });
      return { text: getPersuasionResponse(trigger, fn), qualified: true };
    }
  }

  // NAO em qualquer estagio inicial — encerra (compatibilidade legada)
  if (intent === 'NAO' && ['abordagem_enviada', 'nao_iniciado'].includes(state.stage)) {
    setState(context.phone, { stage: 'sem_interesse', lastUserReplyAt: Date.now() });
    return { text: `Tudo bem, *${fn}*! Fico a disposicao se mudar de ideia. Tenha um otimo dia! 😊\n\n— *Romatec Imoveis*`, qualified: false };
  }

  switch (state.stage) {

    // ---- ABORDAGEM: lead respondeu, iniciar qualificacao ----
    case 'nao_iniciado':
    case 'abordagem_enviada': {
      // Se é uma mensagem de iniciação (oi, olá, tenho interesse...) → boas-vindas antes do formulário
      if (isIniciacao(msg)) {
        setState(context.phone, { stage: 'qual_etapa_1', lastUserReplyAt: Date.now() });
        const welcome = getRespostaIniciacao();
        const firstQuestion = QUAL_QUESTIONS.etapa_1(fn);
        return {
          text: `${welcome}\n\n${firstQuestion}`,
          qualified: true,
        };
      }
      setState(context.phone, { stage: 'qual_etapa_1', lastUserReplyAt: Date.now() });
      return {
        text: QUAL_QUESTIONS.etapa_1(fn),
        qualified: true,
        buttons: [
          { id: 'sim_3meses', label: 'Sim, tenho interesse!' },
          { id: 'talvez', label: 'Talvez, quero saber mais' },
          { id: 'nao_agora', label: 'Nao por agora' },
        ],
      };
    }

    // ---- ETAPA 1: Interesse nos proximos 3 meses ----
    case 'qual_etapa_1': {
      setState(context.phone, {
        stage: 'qual_etapa_2',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, prazo: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_2(fn), qualified: true };
    }

    // ---- ETAPA 2: Primeiro imovel? ----
    case 'qual_etapa_2': {
      setState(context.phone, {
        stage: 'qual_etapa_3',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, primeiroImovel: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_3(fn), qualified: true };
    }

    // ---- ETAPA 3: Valor parcela mensal ----
    case 'qual_etapa_3': {
      setState(context.phone, {
        stage: 'qual_etapa_4',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, valorParcela: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_4(fn), qualified: true };
    }

    // ---- ETAPA 4: Entrada 20% ----
    case 'qual_etapa_4': {
      setState(context.phone, {
        stage: 'qual_etapa_5',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, valorEntrada: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_5(fn), qualified: true };
    }

    // ---- ETAPA 5: Tipo emprego ----
    case 'qual_etapa_5': {
      setState(context.phone, {
        stage: 'qual_etapa_6',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, tipoEmprego: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_6(fn), qualified: true };
    }

    // ---- ETAPA 6: Tipo de Imóvel (NOVO) ----
    case 'qual_etapa_6': {
      setState(context.phone, {
        stage: 'qual_etapa_7',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, tipoImovelBusca: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_6(fn), qualified: true };
    }

    // ---- ETAPA 7: Região/Bairro (NOVO) ----
    case 'qual_etapa_7': {
      setState(context.phone, {
        stage: 'qual_etapa_8',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, regiaoBairro: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_7(fn), qualified: true };
    }

    // ---- ETAPA 8: Valor do Imóvel (NOVO) ----
    case 'qual_etapa_8': {
      setState(context.phone, {
        stage: 'qual_etapa_9',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, valorImovelPretendido: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_8(fn), qualified: true };
    }

    // ---- ETAPA 9: Moradia ou Investimento? (NOVO) ----
    case 'qual_etapa_9': {
      setState(context.phone, {
        stage: 'qual_etapa_10',
        lastUserReplyAt: Date.now(),
        qualAnswers: { ...state.qualAnswers, isMoradiaOuInvestimento: msg },
      });
      return { text: QUAL_QUESTIONS.etapa_9(fn), qualified: true };
    }

    // ---- ETAPA 10: Prazo Ideal — QUALIFICAÇÃO COMPLETA (NOVO) ----
    case 'qual_etapa_10': {
      const finalAnswers = { ...state.qualAnswers, prazoPrefido: msg };
      const score = calculateLeadScore(finalAnswers);

      console.log(`[Bot] ✅ QUALIFICADO: ${name} (${state.phone}) — Score: ${score.toUpperCase()}`);

      setState(context.phone, {
        stage: 'qualificado',
        lastUserReplyAt: Date.now(),
        qualAnswers: finalAnswers,
      });

      // Salvar no banco em background
      saveLeadQualification(
        context.phone,
        name,
        finalAnswers,
        score,
        prop,
        state.campaignId,
      ).catch(() => {});

      // ═══════════════════════════════════════════════════════════════════
      // GERAR PROPOSTA INTEGRADA COM MULTI-BANCO + RECOMENDAÇÕES
      // ═══════════════════════════════════════════════════════════════════
      let proposalMsg = generateProposalMessage(fn, finalAnswers, score);
      let propertyRecommendations = '';

      try {
        // Extrair dados financeiros das respostas
        const propertyValue = parseNumericValue(finalAnswers.valorImovelPretendido || '');
        const monthlyIncome = parseNumericValue(finalAnswers.rendaMensal || '');
        const downPaymentStr = finalAnswers.entradaDisponivel || '';

        // Determinar prazo do empréstimo baseado na resposta
        let loanTermMonths = 240; // 20 anos padrão
        const prazoStr = (finalAnswers.prazoPrefido || '').toLowerCase();
        if (/imediato|urgente|logo|30|dias/.test(prazoStr)) {
          loanTermMonths = 180; // 15 anos para quem quer rápido
        } else if (/3\s*meses|semana/.test(prazoStr)) {
          loanTermMonths = 240; // 20 anos normal
        } else if (/6\s*meses|meio\s*ano/.test(prazoStr)) {
          loanTermMonths = 240;
        } else if (/sem\s*pressa|ano|dois/.test(prazoStr)) {
          loanTermMonths = 300; // 25 anos para quem tem tempo
        }

        // Se temos dados financeiros válidos, gerar proposta completa
        if (propertyValue > 50000 && monthlyIncome > 800) {
          // 1️⃣ MULTI-BANCO PROPOSAL
          const multiProposal = generateMultiBankProposal(
            fn,
            propertyValue,
            monthlyIncome,
            downPaymentStr,
            loanTermMonths,
            /sim|tenho|tem|possui|ativo/.test((finalAnswers.financiamentoAtivo || '').toLowerCase()),
            /sim|tenho|tem|disponível|disponvel|anos/.test((finalAnswers.fgtsDisponivel || '').toLowerCase())
          );

          // 2️⃣ RECOMENDAÇÕES DE IMÓVEL
          const leadProfile = extractLeadProfile(finalAnswers, score);
          const propRecommendations = generateAutomatedProposal(fn, leadProfile, SITE_URL);

          // Combinar as duas mensagens
          proposalMsg = multiProposal + '\n\n' + propRecommendations;
          propertyRecommendations = propRecommendations;

          console.log(`[Bot] 🏦 Proposta multi-banco gerada para ${name} — ${propertyValue.toLocaleString('pt-BR')} / ${monthlyIncome.toLocaleString('pt-BR')}/mês`);
          console.log(`[Bot] 🏠 Recomendações de imóvel geradas — ${recommendProperties(leadProfile).length} propriedades encontradas`);
        } else {
          console.log(`[Bot] ⚠️  Dados financeiros insuficientes para simulação — Usando proposta simples`);
        }
      } catch (error) {
        console.error(`[Bot] ❌ Erro ao gerar proposta multi-banco/recomendações:`, error);
        // Fallback para proposta simples em caso de erro
      }

      return {
        text: proposalMsg,
        qualified: score !== 'frio',
        buttons: [
          { id: 'agendar_visita', label: '📅 Agendar Visita' },
          { id: 'mais_detalhes', label: '📋 Mais Detalhes' },
          { id: 'simulacao', label: '💰 Ver Simulação' },
        ],
      };
    }

    // ---- VISITA AGENDADA: confirmar horario ----
    case 'visita_agendada': {
      setState(context.phone, { stage: 'concluido', lastUserReplyAt: Date.now() });
      return {
        text: `Perfeito, *${fn}*! 🤝\n\nUm de nossos consultores vai entrar em contato com voce *hoje* no melhor horario.\n\n📅 *${PLANTAO.data}*\n📍 *${PLANTAO.local}*\n📞 *${PLANTAO.telefone}*\n\nAte logo! — *Romatec Imoveis*`,
        qualified: true,
      };
    }

    case 'qualificado': {
      return {
        text: `Olá, *${fn}*! Estou aqui para qualquer duvida sobre o *${prop.name}*.\n\n🔗 ${SITE_URL}/imovel/${prop.slug}${CONSULTOR_LINK}`,
        qualified: true,
      };
    }

    case 'concluido': {
      return { text: `Ate logo, *${fn}*! 😊 Qualquer duvida estou aqui. — *Romatec Imoveis*`, qualified: true };
    }

    case 'descartado': {
      return {
        text: `Tudo bem, *${fn}*! 😊\n\nAgradecemos o contato. Estaremos aqui se mudar de ideia!\n\n*Sucesso sempre!* 🙏\n— *Romatec Imóveis*`,
        qualified: false,
      };
    }

    case 'proposta_enviada': {
      return {
        text: `*${fn}*, sua proposta foi enviada! 🎉\n\nUm consultor vai entrar em contato em breve com mais detalhes.\n\n📞 Dúvidas? Chama a gente!`,
        qualified: true,
      };
    }

    case 'sem_interesse': {
      return { text: `Obrigado, *${fn}*! Estarei a disposicao se precisar. 😊`, qualified: false };
    }

    default:
      return { text: QUAL_QUESTIONS.etapa_1(fn), qualified: false };
  }
}

// ============ FOLLOW-UP AUTOMATICO ============
export interface FollowUpState {
  phone: string;
  step: number;
  lastBotMessageAt: number;
  lastUserReplyAt: number | null;
}

const FOLLOWUP_SEQUENCE = [
  {
    // T+5min — ESCASSEZ: impacto inicial, despertar urgência
    step: 1,
    delayMinutes: 5,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `${fn !== 'Cliente' ? `*${fn}*, ` : ''}vi que você ainda não respondeu 👋\n\n🔥 Esse imóvel está *chamando muita atenção hoje*!\n\nTivemos *3 consultas nas últimas horas*.\n\nQuer garantir as informações antes que acabe? 🏠`;
    },
  },
  {
    // T+15min — PROVA SOCIAL: outros comprando, criar FOMO
    step: 2,
    delayMinutes: 15,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `${fn !== 'Cliente' ? `*${fn}*, ` : ''}passando rapidinho! 👀\n\n📊 *Outros clientes* já estão fazendo simulações de financiamento para este imóvel.\n\nNão deixa essa oportunidade passar! Posso te enviar os detalhes agora? 😊`;
    },
  },
  {
    // T+25min — AUTORIDADE: credibilidade da empresa
    step: 3,
    delayMinutes: 25,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `${fn !== 'Cliente' ? `*${fn}*, ` : ''}você sabia? 🏆\n\nA *Romatec Imóveis* já ajudou *centenas de famílias* a conquistar a casa própria em Açailândia.\n\n✅ Financiamento facilitado\n✅ Parcelas que cabem no bolso\n✅ Atendimento especializado\n\nQuer fazer parte desse grupo? Me chama! 🤝`;
    },
  },
  {
    // T+35min — URGÊNCIA: prazo limitado
    step: 4,
    delayMinutes: 35,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `⚠️ ${fn !== 'Cliente' ? `*${fn}*, ` : ''}atenção!\n\nAs *condições especiais de financiamento* que estamos oferecendo têm prazo limitado.\n\n⏰ Não deixe para depois o que você pode resolver hoje!\n\nUm consultor pode te atender *agora mesmo*. Bora? 🚀`;
    },
  },
  {
    // T+44min — ÚLTIMA CHANCE: encerramento com gancho
    step: 5,
    delayMinutes: 44,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `🚨 ${fn !== 'Cliente' ? `*${fn}*, ` : ''}último contato!\n\nAlgumas unidades já foram *reservadas hoje*.\n\nSe ainda tiver interesse, me fala *agora* que te priorizo na fila! 🏠\n\nOu fala direto com nosso consultor:\n👤 wa.me/5599991811246`;
    },
  },
];

const followUpStates = new Map<string, FollowUpState>();

export function registerBotMessage(phone: string, senderName?: string, campaignId?: number) {
  const clean = phone.replace(/\D/g, '');
  followUpStates.set(clean, {
    phone: clean,
    step: 0,
    lastBotMessageAt: Date.now(),
    lastUserReplyAt: null,
  });
  if (!conversationStates.has(clean)) {
    setState(clean, {
      stage: 'abordagem_enviada',
      senderName: senderName || 'Cliente',
      campaignId,
      lastBotMessageAt: Date.now(),
    });
  }
}

export function registerUserReply(phone: string) {
  const clean = phone.replace(/\D/g, '');
  const state = followUpStates.get(clean);
  if (state) {
    state.lastUserReplyAt = Date.now();
    state.step = 0;
  }
}

export function getFollowUpsToSend(): { phone: string; message: string; step: number }[] {
  const now = Date.now();
  const toSend: { phone: string; message: string; step: number }[] = [];

  for (const [phone, state] of Array.from(followUpStates.entries())) {
    const convState = conversationStates.get(phone);
    if (convState && (convState.stage === 'sem_interesse' || convState.stage === 'concluido' || convState.stage === 'qualificado')) continue;
    if (state.lastUserReplyAt && state.lastUserReplyAt > state.lastBotMessageAt) continue;
    if (state.step >= 5) continue;

    const nextStep = state.step + 1;
    const followUp = FOLLOWUP_SEQUENCE[nextStep - 1];
    if (!followUp) continue;

    const elapsedMinutes = (now - state.lastBotMessageAt) / (1000 * 60);
    if (elapsedMinutes >= followUp.delayMinutes) {
      const name = convState?.senderName || 'Cliente';
      toSend.push({ phone: state.phone, message: followUp.getMessage(name), step: nextStep });
      state.step = nextStep;
      state.lastBotMessageAt = now;
    }
  }
  return toSend;
}

export function cleanupOldFollowUps() {
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000;
  for (const [phone, state] of Array.from(followUpStates.entries())) {
    if (now - state.lastBotMessageAt > maxAge) {
      followUpStates.delete(phone);
      conversationStates.delete(phone);
    }
  }
}

// ============ PROCESSAMENTO PRINCIPAL ============
export async function processBotMessage(context: BotContext): Promise<BotResponse> {
  const startTime = Date.now();
  let messageText = context.message || '';

  if (context.audioUrl && !messageText) {
    try {
      const result = await transcribeAudio({ audioUrl: context.audioUrl, language: 'pt', prompt: 'Mensagem de cliente sobre imovel' });
      messageText = (result && 'text' in result) ? result.text || '' : '';
      if (messageText) console.log(`[Bot] Audio transcrito: "${messageText.substring(0, 80)}"`);
    } catch (e) {
      console.error('[Bot] Erro ao transcrever audio:', e);
    }
    if (!messageText) return { text: 'Recebi seu audio! Pode me enviar por texto tambem? Assim consigo te ajudar melhor 😉' };
  }

  if (!messageText) {
    return { text: 'Ola! Sou consultor da *Romatec Imoveis*. Como posso te ajudar hoje?' };
  }

  const senderName = context.senderName || 'Cliente';
  const clean = context.phone.replace(/\D/g, '');

  // ═══════════════════════════════════════════════════════════════════════
  // GATE 0: VERIFICAR SE LEAD ESTÁ BLOQUEADO (não mandar mensagens)
  // ═══════════════════════════════════════════════════════════════════════
  const blocked = await isLeadBlocked(clean);
  if (blocked) {
    console.log(`[Bot] 🚫 Lead ${clean} está bloqueado. Ignorando mensagem.`);
    return { text: 'Entendido! Respeitamos sua decisão. Tenha um ótimo dia! 😊', qualified: false };
  }

  registerUserReply(context.phone);

  let state = getState(clean);
  if (!state) {
    // ═════════════════════════════════════════════════════════════════════
    // CARREGAR DO BANCO SE EXISTIR (persistência)
    // ═════════════════════════════════════════════════════════════════════
    const savedState = await loadLeadState(clean);
    if (savedState) {
      console.log(`[Bot] 📥 Carregado estado do banco: stage=${savedState.stage}`);
      setState(clean, {
        stage: savedState.stage as ConversationStage,
        senderName: savedState.senderName,
        propertySlug: context.propertySlug,
        qualAnswers: savedState.answers,
        lastBotMessageAt: Date.now(),
      });
    } else {
      setState(clean, {
        stage: 'abordagem_enviada',
        senderName,
        propertySlug: context.propertySlug,
        lastBotMessageAt: Date.now(),
      });
    }
    state = getState(clean)!;
  }

  if (senderName !== 'Cliente' && state.senderName === 'Cliente') {
    setState(clean, { senderName });
    state = getState(clean)!;
  }

  const response = await processStage({ ...context, message: messageText }, state);

  // ═════════════════════════════════════════════════════════════════════════
  // SALVAR ESTADO NO BANCO (persistência automática)
  // ═════════════════════════════════════════════════════════════════════════
  const updatedState = getState(clean);
  if (updatedState) {
    await persistLeadState(
      clean,
      updatedState.stage,
      updatedState.senderName,
      updatedState.qualAnswers,
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SE FOI DESCARTADO, BLOQUEAR PARA 90 DIAS
  // ═════════════════════════════════════════════════════════════════════════
  if (updatedState?.stage === 'descartado') {
    await discardLead(clean, 'cliente_recusou_em_conversa');
  }

  console.log(`[Bot] ${clean} | Estagio: ${state.stage} | ${Date.now() - startTime}ms`);
  return response;
}

// ============ SIMULACAO DE FINANCIAMENTO ============
export function simulateFinancing(propertyValue: number, entryPercent: number = 20) {
  const entry = propertyValue * (entryPercent / 100);
  const financed = propertyValue - entry;
  const months = 240;
  const simulations = BANKS.map(bank => {
    const r = bank.rate / 100 / 12;
    const monthlyPayment = (financed * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    const totalPaid = monthlyPayment * months;
    const totalInterest = totalPaid - financed;
    return { bank: bank.name, rate: bank.rate, monthlyPayment, totalPaid, totalInterest };
  });
  return { propertyValue, entry, financed, months, simulations };
}

export function formatSimulationWhatsApp(propertyValue: number, entryPct: number = 20): string {
  const entry = propertyValue * (entryPct / 100);
  const financed = propertyValue - entry;
  const pmt240 = calcPrice(financed, 10.26, 240);
  const pmt300 = calcPrice(financed, 10.26, 300);
  return `*PARCELAS A PARTIR DE:*\n\nImovel: *${fmt(propertyValue)}*\nEntrada (${entryPct}%): *${fmt(entry)}*\n\n*Caixa Economica* (10,26% a.a.)\nEm *20 anos (240x)*: *${fmtFull(pmt240)}/mes*\nEm *25 anos (300x)*: *${fmtFull(pmt300)}/mes*\n\nTaxas reais de abril/2026 + TR`;
}

export function recommendProperties(budget: number) {
  return [...PROPERTIES].filter(p => p.value <= budget * 1.15).sort((a, b) => a.value - b.value);
}
