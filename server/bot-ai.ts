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

// ============ DETECCAO DE INTENCAO ============
type IntentType = 'SIM' | 'NAO' | 'PRECO' | 'TEMPO' | 'OUTROS';

function detectIntent(message: string): IntentType {
  const msg = message.toLowerCase().trim();
  if (/\b(sim|pode|quero|gostei|me\s*interessa|claro|confirmo|confirmado|vamos|ok|certo|beleza|top|show|perfeito|blz|aceito|vou|tenho\s*interesse|com\s*certeza|tudo\s*bem|boa)\b/.test(msg)) return 'SIM';
  if (/\b(n[aã]o|nao|sem\s*interesse|obrigad[oa]|tchau|at[eé]\s*mais|desculp[ae]|agora\s*n[aã]o|outro\s*momento|n[aã]o\s*tenho\s*interesse|nao\s*quero|parem|remov[ae]|bloquei|cancelar|parar)\b/.test(msg)) return 'NAO';
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

// ============ PROCESSAMENTO POR ESTAGIO ============
async function processStage(context: BotContext, state: ConversationState): Promise<BotResponse> {
  const msg = (context.message || '').trim();
  const intent = detectIntent(msg);
  const prop = getProperty(state.propertySlug || context.propertySlug);
  const name = state.senderName || context.senderName || 'Cliente';
  const fn = firstName(name);

  // NAO em qualquer estagio inicial — encerra
  if (intent === 'NAO' && ['abordagem_enviada', 'nao_iniciado'].includes(state.stage)) {
    setState(context.phone, { stage: 'sem_interesse', lastUserReplyAt: Date.now() });
    return { text: `Tudo bem, *${fn}*! Fico a disposicao se mudar de ideia. Tenha um otimo dia! 😊\n\n— *Romatec Imoveis*`, qualified: false };
  }

  switch (state.stage) {

    // ---- ABORDAGEM: lead respondeu, iniciar qualificacao ----
    case 'nao_iniciado':
    case 'abordagem_enviada': {
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

    // ---- ETAPA 6: Restricao CPF — calcular score e salvar ----
    case 'qual_etapa_6': {
      const finalAnswers: QualAnswers = { ...state.qualAnswers, restricaoCPF: msg };
      const score = calcScore(finalAnswers, prop.value);

      setState(context.phone, {
        stage: score === 'quente' ? 'visita_agendada' : 'qualificado',
        lastUserReplyAt: Date.now(),
        qualAnswers: finalAnswers,
      });

      // Salvar no banco em background
      saveLeadQualification(
        context.phone, name, finalAnswers, score, prop, state.campaignId,
      ).catch(() => {});

      return { text: getScoreResponse(score, fn, prop, finalAnswers), qualified: score !== 'frio' };
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
    step: 1,
    delayMinutes: 30,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `Oi${fn !== 'Cliente' ? `, *${fn}*` : ''} 👋\n\nVi que voce ainda nao respondeu.\n\nEsse imovel esta chamando muita atencao hoje! 🔥\n\nQuer que eu te mande os detalhes agora?`;
    },
  },
  {
    step: 2,
    delayMinutes: 120,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `Passando rapidinho${fn !== 'Cliente' ? `, *${fn}*` : ''} 👀\n\nEssa oportunidade costuma sair rapido.\n\nJa tivemos bastante procura hoje.\n\nQuer garantir as informacoes antes que acabe?`;
    },
  },
  {
    step: 3,
    delayMinutes: 1440,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `Ultimo contato sobre essa oportunidade${fn !== 'Cliente' ? `, *${fn}*` : ''} 🚨\n\nAlgumas unidades ja foram reservadas.\n\nSe ainda tiver interesse, me fala que te priorizo agora 👍`;
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
    if (state.step >= 3) continue;

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

  registerUserReply(context.phone);

  let state = getState(clean);
  if (!state) {
    setState(clean, {
      stage: 'abordagem_enviada',
      senderName,
      propertySlug: context.propertySlug,
      lastBotMessageAt: Date.now(),
    });
    state = getState(clean)!;
  }

  if (senderName !== 'Cliente' && state.senderName === 'Cliente') {
    setState(clean, { senderName });
    state = getState(clean)!;
  }

  const response = await processStage({ ...context, message: messageText }, state);
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
