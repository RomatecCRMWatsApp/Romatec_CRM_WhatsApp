/**
 * Bot IA Inteligente v3.0 - Romatec CRM
 * Vendedor Virtual WhatsApp — Fluxo Completo
 * 1 cliente por hora | Detecção de 5 intenções | Roteiro por empreendimento
 */
import { invokeLLM } from './_core/llm';
import { transcribeAudio } from './_core/voiceTranscription';

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
}

// ============ ESTÁGIOS DA CONVERSA ============
type ConversationStage =
  | 'nao_iniciado'
  | 'abordagem_enviada'
  | 'interesse_identificado'
  | 'imovel_apresentado'
  | 'visita_agendada'
  | 'sem_interesse'
  | 'concluido';

interface ConversationState {
  phone: string;
  stage: ConversationStage;
  senderName: string;
  propertySlug?: string;
  lastBotMessageAt: number;
  lastUserReplyAt: number | null;
  followUpStep: number;
}

const conversationStates = new Map<string, ConversationState>();

function getState(phone: string): ConversationState | undefined {
  return conversationStates.get(phone.replace(/\D/g, ''));
}

function setState(phone: string, state: Partial<ConversationState>) {
  const clean = phone.replace(/\D/g, '');
  const existing = conversationStates.get(clean) || {
    phone: clean,
    stage: 'nao_iniciado',
    senderName: 'Cliente',
    lastBotMessageAt: Date.now(),
    lastUserReplyAt: null,
    followUpStep: 0,
  };
  conversationStates.set(clean, { ...existing, ...state });
}

// ============ DADOS DOS IMÓVEIS ============
const PROPERTIES = [
  { slug: 'cond-chacaras-giuliano', name: 'Condomínio de Chácaras Giuliano', value: 160000, beds: 0, area: '~1.000m² por unidade', type: 'Chácara', units: 6, remaining: 3, city: 'Açailândia' },
  { slug: 'mod-vaz-03', name: 'Mod Vaz 03', value: 210000, beds: 3, area: '92m²', type: 'Apartamento', city: 'Açailândia' },
  { slug: 'mod-vaz-02', name: 'Mod Vaz 02', value: 250000, beds: 3, area: '110m²', type: 'Casa', city: 'Açailândia' },
  { slug: 'mod-vaz-01', name: 'Mod Vaz 01', value: 300000, beds: 2, area: '68m²', type: 'Apartamento', city: 'Açailândia' },
  { slug: 'alacide', name: 'Alacide', value: 380000, beds: 2, area: '58m²', type: 'Apartamento', city: 'Açailândia' },
] as const;

const BANKS = [
  { name: 'Caixa', rate: 10.26 },
  { name: 'Itaú', rate: 11.60 },
  { name: 'Santander', rate: 11.69 },
  { name: 'Bradesco', rate: 11.70 },
  { name: 'Banco do Brasil', rate: 12.00 },
];

const SITE_URL = 'https://romateccrmwhatsapp-production.up.railway.app';

const PLANTAO = {
  data: 'Sábado, 19 de Abril',
  horario: '9h às 17h',
  local: 'Stand de Vendas — Rua São Raimundo, 10 - Centro, Açailândia - MA',
  telefone: '(99) 99181-1246',
};

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
function formatAttendantLink(): string {
  return `\n👤 *Falar com especialista:*\n\n🟢 *José Romário* — wa.me/5599991811246\n🟢 *Daniele* — wa.me/5599992062871\n\nEstamos prontos para te atender!`;
}
function getProperty(slug?: string) {
  if (!slug) return PROPERTIES[0];
  return PROPERTIES.find(p => p.slug === slug) || PROPERTIES[0];
}

// ============ ROTEIROS POR EMPREENDIMENTO ============
function getAbordagem(prop: typeof PROPERTIES[number], name: string): string {
  const fn = firstName(name);
  if (prop.slug === 'cond-chacaras-giuliano') {
    return `Bom dia, *${fn}*! Aqui é da *Romatec Imóveis*.\n\nTemos uma oportunidade exclusiva: *Condomínio de Chácaras Giuliano* em Açailândia.\n\nSão chácaras de *~1.000m²* cada, por apenas *R$ 160 mil*.\n⚠️ *Restam apenas 3 unidades* de 6!\n\nVocê buscaria um imóvel para moradia, lazer ou investimento?`;
  }
  if (prop.slug === 'alacide') {
    return `Bom dia, *${fn}*! Aqui é da *Romatec Imóveis*.\n\nTemos o *Alacide*, um excelente apartamento em Açailândia com condições especiais de financiamento.\n\n✅ Aceita FGTS\n✅ Minha Casa Minha Vida\n✅ A partir de *R$ 380 mil*\n\nVocê busca imóvel para moradia ou investimento?`;
  }
  return `Bom dia, *${fn}*! Aqui é da *Romatec Imóveis*.\n\nPosso apresentar uma oportunidade em Açailândia?\n\nTemos o *${prop.name}* — ${prop.type} com ${prop.beds > 0 ? prop.beds + ' quartos, ' : ''}${prop.area}.\n\n💰 A partir de *${fmt(prop.value)}*\n\nVocê busca imóvel para moradia ou investimento?`;
}

function getApresentacao(prop: typeof PROPERTIES[number], name: string, finalidade: string): string {
  const fn = firstName(name);
  const fin = prop.value * 0.8;
  const pmt300 = calcPrice(fin, 10.26, 300);

  if (prop.slug === 'cond-chacaras-giuliano') {
    return `Perfeito, *${fn}*! O *Condomínio de Chácaras Giuliano* oferece:\n\n✅ Chácaras de *~1.000m²*\n✅ Escritura garantida\n✅ Infraestrutura completa\n✅ Condomínio fechado e seguro\n✅ Financiamento facilitado\n\n💰 *R$ 160.000* por unidade\n📊 Parcela a partir de *${fmtFull(pmt300)}/mês*\n\n⚠️ *Restam apenas 3 unidades!*\n\n🔗 ${SITE_URL}/imovel/${prop.slug}\n\nVocê teria disponibilidade para uma visita ao Stand de Vendas?`;
  }

  return `Perfeito, *${fn}*! O *${prop.name}* oferece:\n\n✅ ${prop.beds > 0 ? prop.beds + ' quartos' : 'Área de ' + prop.area}\n✅ Escritura garantida\n✅ Infraestrutura completa\n✅ Financiamento facilitado${prop.slug === 'alacide' ? '\n✅ Aceita FGTS e MCMV' : ''}\n\n💰 *${fmt(prop.value)}*\n📊 Parcela a partir de *${fmtFull(pmt300)}/mês*\n\n🔗 ${SITE_URL}/imovel/${prop.slug}\n\nVocê teria disponibilidade para uma visita ao nosso Stand de Vendas?`;
}

function getConviteVisita(name: string): string {
  const fn = firstName(name);
  return `Ótimo, *${fn}*! 📅\n\nNosso *Plantão de Vendas* é:\n\n📅 *${PLANTAO.data}*\n🕐 *${PLANTAO.horario}*\n📍 *${PLANTAO.local}*\n\nConfirmo sua presença com atendimento exclusivo?`;
}

function getConfirmacaoVisita(name: string): string {
  const fn = firstName(name);
  return `Perfeito! Aguardamos o(a) senhor(a) com satisfação, *${fn}*! 🤝\n\n📅 *${PLANTAO.data}*\n📍 *${PLANTAO.local}*\n📞 *${PLANTAO.telefone}*\n\nAté lá! — *Romatec Imóveis*`;
}

function getEncerramento(name: string): string {
  const fn = firstName(name);
  return `Compreendo, *${fn}*. Agradeço sua atenção.\n\nFico à disposição caso mude de ideia. Tenha um ótimo dia! 😊\n\n— *Romatec Imóveis*`;
}

function getObjecaoPreco(name: string, prop: typeof PROPERTIES[number]): string {
  const fn = firstName(name);
  const fin = prop.value * 0.8;
  const pmt300 = calcPrice(fin, 10.26, 300);
  return `Entendo a preocupação, *${fn}*! Trabalhamos com:\n\n✅ Entrada facilitada\n✅ Parcelamento direto com a construtora\n✅ Sem burocracia de banco${prop.slug === 'alacide' ? '\n✅ Aceita FGTS e Minha Casa Minha Vida' : ''}\n\n💰 Parcela a partir de *${fmtFull(pmt300)}/mês* em 25 anos\n\nPosso detalhar as condições para o(a) senhor(a)?`;
}

function getObjecaoTempo(name: string): string {
  const fn = firstName(name);
  return `Sem problema, *${fn}*! Quando seria um bom momento?\n\nEstou à disposição durante toda a semana. 😊`;
}

// ============ DETECÇÃO DE INTENÇÃO ============
type IntentType = 'SIM' | 'NAO' | 'PRECO' | 'TEMPO' | 'DISTANCIA' | 'SAUDACAO' | 'OUTROS';

function detectIntent(message: string): IntentType {
  const msg = message.toLowerCase().trim();

  if (/\b(sim|pode|quero|gostei|me\s*interessa|claro|confirmo|confirmado|vamos|ok|certo|beleza|top|show|perfeito|blz|aceito|vou|lá\s*estarei)\b/.test(msg)) return 'SIM';

  if (/\b(n[aã]o|nao|sem\s*interesse|obrigad[oa]|tchau|at[eé]\s*mais|desculp[ae]|agora\s*n[aã]o|outro\s*momento|n[aã]o\s*tenho\s*interesse|não\s*quero|parem|remov[ae]|bloquei)\b/.test(msg)) return 'NAO';

  if (/\b(caro|t[aá]\s*caro|sem\s*dinheiro|grana|pre[çc]o|valor|quanto|or[çc]amento|parcela|entrada|financiamento|banco|fgts|consegue\s*baixar|desconto)\b/.test(msg)) return 'PRECO';

  if (/\b(ocupado|depois|agora\s*n[aã]o|outro\s*dia|quando|hor[aá]rio|disponibilidade|mais\s*tarde|essa\s*semana|pr[oó]xima\s*semana)\b/.test(msg)) return 'TEMPO';

  if (/\b(longe|onde\s*fica|localiza[çc][aã]o|endere[çc]o|bairro|fica\s*onde|mapa|como\s*chegar|dist[aâ]ncia)\b/.test(msg)) return 'DISTANCIA';

  if (/^\s*(oi|ol[aá]|hey|ei|bom\s*dia|boa\s*(tarde|noite)|opa|eae|fala|salve|hello|hi)\s*[!?.]*\s*$/.test(msg)) return 'SAUDACAO';

  return 'OUTROS';
}

// ============ PROCESSAMENTO POR ESTÁGIO ============
async function processStage(context: BotContext, state: ConversationState): Promise<BotResponse> {
  const msg = context.message || '';
  const intent = detectIntent(msg);
  const prop = getProperty(state.propertySlug || context.propertySlug);
  const name = state.senderName || context.senderName || 'Cliente';

  // Se cliente disse NAO em qualquer estágio — encerra
  if (intent === 'NAO' && state.stage !== 'nao_iniciado') {
    setState(context.phone, { stage: 'sem_interesse', lastUserReplyAt: Date.now() });
    return { text: getEncerramento(name), qualified: false };
  }

  switch (state.stage) {

    case 'nao_iniciado':
    case 'abordagem_enviada': {
      // Cliente respondeu à abordagem
      if (intent === 'NAO') {
        setState(context.phone, { stage: 'sem_interesse', lastUserReplyAt: Date.now() });
        return { text: getEncerramento(name), qualified: false };
      }
      if (intent === 'SIM' || intent === 'OUTROS' || intent === 'SAUDACAO') {
        // Identifica finalidade e apresenta imóvel
        const finalidade = /investimento|renda|alugar/i.test(msg) ? 'investimento' : 'moradia';
        setState(context.phone, { stage: 'imovel_apresentado', lastUserReplyAt: Date.now() });
        return { text: getApresentacao(prop, name, finalidade), qualified: true };
      }
      if (intent === 'PRECO') {
        setState(context.phone, { stage: 'imovel_apresentado', lastUserReplyAt: Date.now() });
        return { text: getObjecaoPreco(name, prop), qualified: true };
      }
      if (intent === 'TEMPO') {
        setState(context.phone, { lastUserReplyAt: Date.now() });
        return { text: getObjecaoTempo(name), qualified: true };
      }
      setState(context.phone, { stage: 'interesse_identificado', lastUserReplyAt: Date.now() });
      return { text: getApresentacao(prop, name, 'moradia'), qualified: true };
    }

    case 'interesse_identificado':
    case 'imovel_apresentado': {
      if (intent === 'SIM') {
        setState(context.phone, { stage: 'visita_agendada', lastUserReplyAt: Date.now() });
        return { text: getConviteVisita(name), qualified: true };
      }
      if (intent === 'PRECO') {
        setState(context.phone, { lastUserReplyAt: Date.now() });
        return { text: getObjecaoPreco(name, prop), qualified: true };
      }
      if (intent === 'TEMPO') {
        setState(context.phone, { lastUserReplyAt: Date.now() });
        return { text: getObjecaoTempo(name), qualified: true };
      }
      if (intent === 'DISTANCIA') {
        setState(context.phone, { lastUserReplyAt: Date.now() });
        return {
          text: `Fica em *Açailândia - MA*, com fácil acesso.\n\n📍 ${PLANTAO.local}\n\nPosso te enviar o mapa completo. Teria disponibilidade para uma visita?`,
          qualified: true
        };
      }
      // Resposta ambígua — convidar para visita
      setState(context.phone, { stage: 'visita_agendada', lastUserReplyAt: Date.now() });
      return { text: getConviteVisita(name), qualified: true };
    }

    case 'visita_agendada': {
      if (intent === 'SIM') {
        setState(context.phone, { stage: 'concluido', lastUserReplyAt: Date.now() });
        return { text: getConfirmacaoVisita(name), qualified: true };
      }
      if (intent === 'PRECO') {
        setState(context.phone, { lastUserReplyAt: Date.now() });
        return { text: getObjecaoPreco(name, prop) + '\n\nCom essas condições, conseguiria visitar o Stand de Vendas?', qualified: true };
      }
      if (intent === 'TEMPO') {
        setState(context.phone, { lastUserReplyAt: Date.now() });
        return { text: getObjecaoTempo(name), qualified: true };
      }
      setState(context.phone, { stage: 'concluido', lastUserReplyAt: Date.now() });
      return { text: getConfirmacaoVisita(name), qualified: true };
    }

    case 'concluido': {
      return { text: `Até ${PLANTAO.data}, *${firstName(name)}*! 😊\n\nQualquer dúvida, estou à disposição.\n\n— *Romatec Imóveis*`, qualified: true };
    }

    case 'sem_interesse': {
      return { text: `Obrigado, *${firstName(name)}*! Estarei à disposição se precisar. 😊`, qualified: false };
    }

    default:
      return { text: getAbordagem(prop, name), qualified: false };
  }
}

// ============ FOLLOW-UP AUTOMÁTICO ============
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
      return `Oi${fn !== 'Cliente' ? `, *${fn}*` : ''} 👋\n\nVi que você ainda não respondeu.\n\nEsse imóvel está chamando muita atenção hoje 🔥\n\nQuer que eu te mande os detalhes rápidos agora?`;
    },
  },
  {
    step: 2,
    delayMinutes: 120,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `Passando rapidinho${fn !== 'Cliente' ? `, *${fn}*` : ''} 👀\n\nEssa oportunidade costuma sair rápido.\n\nJá tivemos bastante procura hoje.\n\nQuer garantir as informações antes que acabe?`;
    },
  },
  {
    step: 3,
    delayMinutes: 1440,
    getMessage: (name: string) => {
      const fn = firstName(name);
      return `Último contato sobre essa oportunidade${fn !== 'Cliente' ? `, *${fn}*` : ''} 🚨\n\nAlgumas unidades já foram reservadas.\n\nSe ainda tiver interesse, me fala que te priorizo agora 👍`;
    },
  },
];

const followUpStates = new Map<string, FollowUpState>();

export function registerBotMessage(phone: string, senderName?: string) {
  const clean = phone.replace(/\D/g, '');
  followUpStates.set(clean, {
    phone: clean,
    step: 0,
    lastBotMessageAt: Date.now(),
    lastUserReplyAt: null,
  });
  // Inicializa estado de conversa se não existir
  if (!conversationStates.has(clean)) {
    setState(clean, {
      stage: 'abordagem_enviada',
      senderName: senderName || 'Cliente',
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

  for (const [phone, state] of followUpStates.entries()) {
    // Verificar se cliente já está em estágio finalizado
    const convState = conversationStates.get(phone);
    if (convState && (convState.stage === 'sem_interesse' || convState.stage === 'concluido')) continue;

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
  for (const [phone, state] of followUpStates.entries()) {
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

  // Transcrever áudio se necessário
  if (context.audioUrl && !messageText) {
    try {
      const result = await transcribeAudio({ audioUrl: context.audioUrl, language: 'pt', prompt: 'Mensagem de cliente sobre imóvel' });
      messageText = (result && 'text' in result) ? result.text || '' : '';
      if (messageText) console.log(`[Bot] Áudio transcrito: "${messageText.substring(0, 80)}"`);
    } catch (e) {
      console.error('[Bot] Erro ao transcrever áudio:', e);
    }
    if (!messageText) return { text: 'Recebi seu áudio! Pode me enviar por texto também? Assim consigo te ajudar melhor 😉' };
  }

  if (!messageText) {
    return { text: 'Olá! Sou o assistente da *Romatec Imóveis*. Como posso te ajudar hoje?' };
  }

  const senderName = context.senderName || 'Cliente';
  const clean = context.phone.replace(/\D/g, '');

  // Registrar resposta do usuário
  registerUserReply(context.phone);

  // Buscar ou criar estado da conversa
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

  // Atualizar nome se necessário
  if (senderName !== 'Cliente' && state.senderName === 'Cliente') {
    setState(clean, { senderName });
    state = getState(clean)!;
  }

  // Processar pelo estágio atual
  const response = await processStage({ ...context, message: messageText }, state);

  console.log(`[Bot] Estágio: ${state.stage} → Intenção: ${detectIntent(messageText)} em ${Date.now() - startTime}ms`);
  return response;
}

// ============ SIMULAÇÃO DE FINANCIAMENTO ============
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
  return `💰 *PARCELAS A PARTIR DE:*\n\n🏠 Imóvel: *${fmt(propertyValue)}*\n💳 Entrada (${entryPct}%): *${fmt(entry)}*\n\n🏦 *Caixa Econômica* (menor taxa: 10,26% a.a.)\n   ✅ Em *20 anos (240x)*: *${fmtFull(pmt240)}/mês*\n   ✅ Em *25 anos (300x)*: *${fmtFull(pmt300)}/mês*\n\nℹ️ Taxas reais de abril/2026 + TR`;
}

export function recommendProperties(budget: number) {
  return [...PROPERTIES].filter(p => p.value <= budget * 1.15).sort((a, b) => a.value - b.value);
}
