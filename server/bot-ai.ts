/**
 * Bot IA Inteligente v2.0 - Romatec CRM
 * Sistema de intenções estruturado + follow-up automático
 * Responde mensagens de clientes com lógica persuasiva
 * Transcreve áudio, qualifica leads, simula financiamento
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

// ============ DADOS (PREÇOS CORRETOS DO BANCO) ============

const PROPERTIES = [
  { slug: 'cond-chacaras-giuliano', name: 'Cond. Chácaras Giuliano', value: 160000, beds: 0, area: '~1.000m² por unidade', type: 'Chácara (Condomínio)', units: 6, remaining: 3 },
  { slug: 'mod-vaz-03', name: 'Mod Vaz 03', value: 210000, beds: 3, area: '92m²', type: 'Apartamento' },
  { slug: 'mod-vaz-02', name: 'Mod Vaz 02', value: 250000, beds: 3, area: '110m²', type: 'Casa' },
  { slug: 'mod-vaz-01', name: 'Mod Vaz 01', value: 300000, beds: 2, area: '68m²', type: 'Apartamento' },
  { slug: 'alacide', name: 'Alacide', value: 380000, beds: 2, area: '58m²', type: 'Apartamento' },
];

const BANKS = [
  { name: 'Caixa', emoji: '\ud83c\udfe6', rate: 10.26 },
  { name: 'Ita\u00fa', emoji: '\ud83d\udfe0', rate: 11.60 },
  { name: 'Santander', emoji: '\ud83d\udd34', rate: 11.69 },
  { name: 'Bradesco', emoji: '\ud83e\ude77', rate: 11.70 },
  { name: 'Banco do Brasil', emoji: '\u2b50', rate: 12.00 },
];

const SITE_URL = 'https://romatecwa-2uygcczr.manus.space';

// ============ SISTEMA DE INTENÇÕES ============

interface Intent {
  intent: string;
  keywords: RegExp;
  getResponse: (name: string) => string;
}

const INTENTS: Intent[] = [
  {
    intent: 'SAUDACAO',
    keywords: /^\s*(oi|ol[aá]|ola|hey|ei|bom\s*dia|boa\s*(tarde|noite)|opa|eae|eai|fala|salve|hello|hi|iniciar|come[çc]ar|menu)\s*[!?.]*\s*$/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      const greetings = [
        `Olá, *${firstName}*! 👋 Seja bem-vindo(a) à *Romatec Consultoria Imobiliária*.\n\nComo posso te ajudar hoje?\n\n1️⃣ Ver valores 💰\n2️⃣ Ver localização 📍\n3️⃣ Ver fotos 📸\n4️⃣ Agendar visita 📅\n\nMe diga o número ou o que você precisa 😉`,
        `Olá, *${firstName}*! \ud83c\udfe0 Bem-vindo(a) à *Romatec*! Somos especialistas em imóveis em Açailândia - MA, com opções de *R$ 160 mil* a *R$ 380 mil*.\n\nComo posso te ajudar?\n\n1️⃣ Valores 💰\n2️⃣ Localização 📍\n3️⃣ Fotos 📸\n4️⃣ Agendar visita 📅`,
        `Oi, *${firstName}*! Que bom falar com você! Aqui é a *Romatec Consultoria Imobiliária*.\n\nTemos apartamentos, casas e chácaras incríveis em Açailândia - MA.\n\n1️⃣ Valores 💰\n2️⃣ Localização 📍\n3️⃣ Fotos 📸\n4️⃣ Agendar visita 📅\n\nO que você gostaria de saber?`,
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    },
  },
  {
    intent: 'PRECO',
    keywords: /\b(pre[çc]o|preco|valor|quanto\s*custa|quanto\s*[eé]|qto|vlr|custa\s*quanto|tabela|or[çc]amento|orcamento|tem\s*desconto|promo[çc][aã]o|promocao|mais\s*barato|1️⃣|opção\s*1|opcao\s*1)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      let msg = `Perfeito, *${firstName}*! 💰 Aqui estão nossos imóveis:\n\n`;
      PROPERTIES.forEach(p => {
        const financed = p.value * 0.8;
        const pmt300 = calcPrice(financed, 10.26, 300);
        const scarcity = p.remaining ? ` ⚠️ *Restam ${p.remaining}!*` : '';
        msg += `🏠 *${p.name}* — ${p.type}\n`;
        msg += `   💰 *${fmt(p.value)}* | Parcela: *${fmtFull(pmt300)}/mês*${scarcity}\n`;
        msg += `   🔗 ${SITE_URL}/imovel/${p.slug}\n\n`;
      });
      msg += `Você busca algo mais econômico ou mais completo? 😉`;
      return msg;
    },
  },
  {
    intent: 'INTERESSE',
    keywords: /\b(tenho\s*interesse|gostei|quero|me\s*mostra|tem\s*dispon[ií]vel|disponivel|ainda\s*tem|tem\s*unidade|quero\s*ver|manda\s*mais\s*info|informa[çc][oõ]es|detalhes|quero\s*comprar|sim|SIM)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Ótima escolha, *${firstName}*! 🔥\n\nVou te mostrar os detalhes completos 👇\n\nO que você quer ver primeiro?\n📸 Fotos\n📍 Localização\n💰 Valores\n\nOu se preferir, fale direto com nosso especialista:\n` + formatAttendantLink();
    },
  },
  {
    intent: 'LOCALIZACAO',
    keywords: /\b(onde\s*fica|localiza[çc][aã]o|localizacao|endere[çc]o|endereco|bairro|fica\s*onde|mapa|regi[aã]o|regiao|perto\s*de|qual\s*cidade|2️⃣|opção\s*2|opcao\s*2)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      let msg = `Excelente pergunta, *${firstName}*! 📍\n\nTodos os nossos imóveis ficam em *Açailândia - MA*, em localizações estratégicas:\n\n`;
      PROPERTIES.forEach(p => {
        msg += `📍 *${p.name}*: ${SITE_URL}/imovel/${p.slug}\n`;
      });
      msg += `\nCada página tem o mapa com a localização exata! Quer que eu te envie mais detalhes de algum? 😉`;
      return msg;
    },
  },
  {
    intent: 'FOTOS',
    keywords: /\b(fotos?|imagens?|videos?|v[ií]deos?|planta|planta\s*baixa|ver\s*fotos|mostra\s*fotos|galeria|3️⃣|opção\s*3|opcao\s*3)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      let msg = `Perfeito, *${firstName}*! 📸\n\nAcesse as fotos completas de cada imóvel:\n\n`;
      PROPERTIES.forEach(p => {
        const scarcity = p.remaining ? ` ⚠️ *Restam ${p.remaining}!*` : '';
        msg += `📸 *${p.name}* — ${fmt(p.value)}${scarcity}\n   🔗 ${SITE_URL}/imovel/${p.slug}\n\n`;
      });
      msg += `Depois me diz o que achou! 😉`;
      return msg;
    },
  },
  {
    intent: 'AGENDAMENTO',
    keywords: /\b(visitar|agendar|marcar|quero\s*visitar|posso\s*ir|quando\s*posso\s*ver|hor[aá]rio|horario|agenda|disponibilidade|4️⃣|opção\s*4|opcao\s*4)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Perfeito, *${firstName}*! 📅\n\nVamos agendar sua visita!\n\nPara facilitar, fale direto com nosso especialista que ele agenda no melhor horário pra você:\n` + formatAttendantLink();
    },
  },
  {
    intent: 'FINANCIAMENTO',
    keywords: /\b(financia\w*|parcela\w*|presta[çc][aã]o|entrada|caixa|banco|cr[eé]dito|consorcio|cons[oó]rcio|pagar|pagamento|fgts|aprova[çc][aã]o|aprovacao|escritura|contrato|documenta[çc][aã]o|documentacao)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      const cheapest = PROPERTIES[0];
      const fin = cheapest.value * 0.8;
      const pmt240 = calcPrice(fin, 10.26, 240);
      const pmt300 = calcPrice(fin, 10.26, 300);
      return `Ótima dúvida, *${firstName}*! 🧾\n\nSim, trabalhamos com financiamento!\n\n` +
        `🏦 *Caixa Econômica* (menor taxa: 10,26% a.a.)\n` +
        `💰 Parcelas a partir de *${fmtFull(pmt300)}/mês* (25 anos)\n` +
        `💳 Entrada a partir de *20%*\n` +
        `🏠 Imóveis de *${fmt(PROPERTIES[0].value)}* a *${fmt(PROPERTIES[PROPERTIES.length-1].value)}*\n\n` +
        `Quer que eu simule as parcelas pra um imóvel específico? 👇\n\nOu fale direto com nosso especialista:\n` + formatAttendantLink();
    },
  },
  {
    intent: 'OBJECAO',
    keywords: /\b(t[aá]\s*caro|ta\s*caro|caro|vou\s*pensar|depois\s*vejo|agora\s*n[aã]o|sem\s*interesse|n[aã]o\s*sei|nao\s*sei|complicado|n[aã]o\s*(quero|tenho|posso|preciso)|sem\s*(comprar|interesse|condi[çc]|dinheiro|grana)|no\s*momento\s*n[aã]o|tou\s*sem|esse\s*m[eê]s\s*n[aã]o|n[aã]o\s*estou\s*interessad|desculpa|obrigad[oa]\s*mas)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Sem problema, *${firstName}*! 👍\n\nPosso te mostrar opções mais acessíveis ou condições melhores de pagamento.\n\n` +
        `Temos imóveis a partir de *${fmt(PROPERTIES[0].value)}* com parcelas que cabem no bolso.\n\n` +
        `Quer que eu ajuste pra sua realidade? Ou quando estiver pronto(a), pode nos chamar a qualquer momento! 🏠`;
    },
  },
  {
    intent: 'CONFIRMACAO',
    keywords: /^\s*(ok|certo|entendi|pode\s*ser|beleza|show|top|perfeito|blz|bom|legal|massa|dahora)\s*[!?.]*\s*$/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Perfeito, *${firstName}*! 👍\n\nMe diz uma coisa:\n👉 Você busca algo mais econômico ou mais completo?\n\n` +
        `Temos opções de *${fmt(PROPERTIES[0].value)}* a *${fmt(PROPERTIES[PROPERTIES.length-1].value)}* 😉`;
    },
  },
  {
    intent: 'DUVIDA',
    keywords: /\b(como\s*funciona|explica|n[aã]o\s*entendi|nao\s*entendi|d[uú]vida|duvida|pode\s*explicar|quero\s*saber\s*mais)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Claro, *${firstName}*! 👇\n\nMe diz melhor sua dúvida que eu te explico detalhado 😉\n\n` +
        `Ou se preferir, fale direto com nosso especialista:\n` + formatAttendantLink();
    },
  },
  {
    intent: 'DESPEDIDA',
    keywords: /\b(obrigad[oa]|valeu|tchau|at[eé]\s*mais|finalizar|encerrar|flw|falou)\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Eu que agradeço, *${firstName}*! 🙌\n\nQualquer coisa, estou por aqui 😉\n\nA *Romatec* está sempre pronta pra te ajudar! 🏠`;
    },
  },
  {
    intent: 'VENDA',
    keywords: /\b(vender|vendo|anunciar|anuncio|captar|capta[çc][aã]o|avaliar|avalia[çc][aã]o|colocar\s*(pra|para)\s*vend|quero\s*vender|tenho\s*(um|uma|pra|para)\s*(im[oó]vel|casa|apto|apartamento|terreno|lote|ch[aá]cara|sitio|s[ií]tio)|meu\s*(im[oó]vel|casa|apto|apartamento|terreno))\b/i,
    getResponse: (name: string) => {
      const firstName = name.split(' ')[0] || 'Cliente';
      return `Olá, *${firstName}*! 🏠 Que ótimo saber que você tem um imóvel para vender!\n\n` +
        `A *Romatec Consultoria Imobiliária* também trabalha com *captação de imóveis* para venda. ` +
        `Nossos especialistas podem avaliar seu imóvel e encontrar o melhor comprador para você!\n\n` +
        `📋 *Para dar andamento, entre em contato direto com nosso especialista:*\n\n` +
        `🟢 *José Romário* (CEO) — wa.me/5599991811246\n` +
        `🟢 *Daniele* — wa.me/5599992062871\n\n` +
        `Eles vão te orientar sobre documentação, avaliação e divulgação do seu imóvel. 💪`;
    },
  },
];

const FALLBACK_RESPONSE = (name: string) => {
  const firstName = name.split(' ')[0] || 'Cliente';
  return `*${firstName}*, não entendi muito bem 😅\n\nPosso te ajudar com:\n\n1️⃣ Valores 💰\n2️⃣ Localização 📍\n3️⃣ Fotos 📸\n4️⃣ Agendar visita 📅\n\nMe diga o número ou o que você quer 😉`;
};

// ============ FOLLOW-UP AUTOMÁTICO ============

export interface FollowUpState {
  phone: string;
  step: number; // 0 = nenhum, 1-3 = etapa do follow-up
  lastBotMessageAt: number; // timestamp
  lastUserReplyAt: number | null;
  campaignName?: string;
}

const FOLLOWUP_SEQUENCE = [
  {
    step: 1,
    delayMinutes: 30,
    getMessage: (name: string) => {
      const firstName = name.split(' ')[0] || '';
      return `Oi${firstName ? `, *${firstName}*` : ''} 👋\n\nVi que você ainda não respondeu.\n\nEsse imóvel está chamando muita atenção hoje 🔥\n\nQuer que eu te mande os detalhes rápidos agora?`;
    },
  },
  {
    step: 2,
    delayMinutes: 120,
    getMessage: (name: string) => {
      const firstName = name.split(' ')[0] || '';
      return `Passando aqui rapidinho${firstName ? `, *${firstName}*` : ''} 👀\n\nEsse tipo de oportunidade costuma sair rápido.\n\nJá tivemos bastante procura hoje.\n\nQuer garantir as informações antes que acabe?`;
    },
  },
  {
    step: 3,
    delayMinutes: 1440, // 24 horas
    getMessage: (name: string) => {
      const firstName = name.split(' ')[0] || '';
      return `Último contato sobre essa oportunidade${firstName ? `, *${firstName}*` : ''} 🚨\n\nAlgumas unidades já foram reservadas.\n\nSe ainda tiver interesse, me fala que te priorizo agora 👍`;
    },
  },
];

// Estado de follow-up em memória (por telefone)
const followUpStates = new Map<string, FollowUpState>();

/**
 * Registra que o bot enviou uma mensagem (campanha ou resposta)
 * Inicia sequência de follow-up
 */
export function registerBotMessage(phone: string, senderName?: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  followUpStates.set(cleanPhone, {
    phone: cleanPhone,
    step: 0,
    lastBotMessageAt: Date.now(),
    lastUserReplyAt: null,
  });
}

/**
 * Registra que o usuário respondeu
 * Para a sequência de follow-up (reset_if_user_reply)
 */
export function registerUserReply(phone: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const state = followUpStates.get(cleanPhone);
  if (state) {
    state.lastUserReplyAt = Date.now();
    state.step = 0; // Reset follow-up
  }
}

/**
 * Verifica quais follow-ups precisam ser enviados
 * Retorna lista de { phone, message } para enviar
 */
export function getFollowUpsToSend(): { phone: string; message: string; step: number }[] {
  const now = Date.now();
  const toSend: { phone: string; message: string; step: number }[] = [];

  const entries = Array.from(followUpStates.entries());
  for (const [phone, state] of entries) {
    // Se o usuário já respondeu, não enviar follow-up
    if (state.lastUserReplyAt && state.lastUserReplyAt > state.lastBotMessageAt) {
      continue;
    }

    // Se já enviou todos os 3 follow-ups, parar
    if (state.step >= 3) {
      continue;
    }

    const nextStep = state.step + 1;
    const followUp = FOLLOWUP_SEQUENCE[nextStep - 1];
    if (!followUp) continue;

    const referenceTime = state.lastBotMessageAt;
    const elapsedMinutes = (now - referenceTime) / (1000 * 60);

    if (elapsedMinutes >= followUp.delayMinutes) {
      toSend.push({
        phone: state.phone,
        message: followUp.getMessage(''),
        step: nextStep,
      });
      // Atualizar estado
      state.step = nextStep;
      state.lastBotMessageAt = now; // Resetar timer para próximo follow-up
    }
  }

  return toSend;
}

/**
 * Limpa follow-ups antigos (mais de 48h)
 */
export function cleanupOldFollowUps() {
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000; // 48h
  const cleanupEntries = Array.from(followUpStates.entries());
  for (const [phone, state] of cleanupEntries) {
    if (now - state.lastBotMessageAt > maxAge) {
      followUpStates.delete(phone);
    }
  }
}

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

// ============ PARCELAS SIMPLES WHATSAPP ============

/**
 * Formata parcelas simples e atrativas para WhatsApp
 * Mostra apenas Caixa (menor taxa) em 240x (20 anos) e 300x (25 anos)
 */
export function formatSimulationWhatsApp(propertyValue: number, entryPct: number = 20): string {
  const entry = propertyValue * (entryPct / 100);
  const financed = propertyValue - entry;
  const pmt240 = calcPrice(financed, 10.26, 240);
  const pmt300 = calcPrice(financed, 10.26, 300);

  let msg = `\ud83d\udcb0 *PARCELAS A PARTIR DE:*\n\n`;
  msg += `\ud83c\udfe0 Im\u00f3vel: *${fmt(propertyValue)}*\n`;
  msg += `\ud83d\udcb3 Entrada (${entryPct}%): *${fmt(entry)}*\n\n`;
  msg += `\ud83c\udfe6 *Caixa Econ\u00f4mica* (menor taxa: 10,26% a.a.)\n`;
  msg += `   \u2705 Em *20 anos (240x)*: *${fmtFull(pmt240)}/m\u00eas*\n`;
  msg += `   \u2705 Em *25 anos (300x)*: *${fmtFull(pmt300)}/m\u00eas*\n\n`;
  msg += `\u2139\ufe0f Taxas reais de abril/2026 + TR`;
  return msg;
}

// ============ RECOMENDAÇÃO DE IMÓVEIS ============

export function recommendProperties(budget: number): typeof PROPERTIES {
  return PROPERTIES.filter(p => p.value <= budget * 1.15).sort((a, b) => a.value - b.value);
}

export function formatRecommendationsWhatsApp(budget: number): string {
  const recs = recommendProperties(budget);
  if (recs.length === 0) {
    return `No momento nossos im\u00f3veis come\u00e7am a partir de ${fmt(PROPERTIES[0].value)}. Posso te mostrar as op\u00e7\u00f5es dispon\u00edveis?`;
  }

  let msg = `\ud83c\udfe1 *IM\u00d3VEIS DENTRO DO SEU OR\u00c7AMENTO*\n\n`;
  recs.forEach(p => {
    const financed = p.value * 0.8;
    const pmt240 = calcPrice(financed, 10.26, 240);
    const pmt300 = calcPrice(financed, 10.26, 300);
    msg += `\ud83d\udccd *${p.name}* \u2014 ${p.type}\n`;
    msg += `   Valor: *${fmt(p.value)}* | ${p.beds} quartos | ${p.area}\n`;
    msg += `   \u2705 Parcela 20 anos: *${fmtFull(pmt240)}* | 25 anos: *${fmtFull(pmt300)}*\n`;
    msg += `   \ud83d\udd17 ${SITE_URL}/imovel/${p.slug}\n\n`;
  });
  return msg;
}

// ============ LINK DE ATENDENTE ============

function formatAttendantLink(): string {
  return `\n\ud83d\udc64 *Quer falar com um especialista?*\n\n` +
    `\ud83d\udfe2 *Jos\u00e9 Rom\u00e1rio* \u2014 wa.me/5599991811246\n` +
    `\ud83d\udfe2 *Daniele* \u2014 wa.me/5599992062871\n\n` +
    `Estamos prontos para te atender!`;
}

// ============ TRANSCRIÇÃO DE ÁUDIO ============

async function transcribeAudioMessage(audioUrl: string): Promise<string> {
  try {
    const result = await transcribeAudio({
      audioUrl,
      language: 'pt',
      prompt: 'Transcrever mensagem de cliente sobre im\u00f3vel ou financiamento',
    });
    if (result && 'text' in result) {
      return result.text || '';
    }
    return '';
  } catch (error) {
    console.error('[Bot] Erro ao transcrever \u00e1udio:', error);
    return '';
  }
}

// ============ PROCESSAMENTO PRINCIPAL ============

export async function processBotMessage(context: BotContext): Promise<BotResponse> {
  const startTime = Date.now();
  let messageText = context.message || '';

  // Se for áudio, transcrever
  if (context.audioUrl && !messageText) {
    messageText = await transcribeAudioMessage(context.audioUrl);
    if (messageText) {
      console.log(`[Bot] Áudio transcrito: "${messageText.substring(0, 80)}"`);
    } else {
      return { text: 'Recebi seu áudio! Pode me enviar por texto também? Assim consigo te ajudar melhor \ud83d\ude09' };
    }
  }

  if (!messageText) {
    return { text: 'Olá! Sou o assistente da *Romatec Consultoria Imobiliária*. Como posso te ajudar hoje?' };
  }

  const senderName = context.senderName || 'Cliente';

  // Registrar que o usuário respondeu (para follow-up)
  registerUserReply(context.phone);

  // === SISTEMA DE INTENÇÕES (sem LLM - <100ms) ===
  
  // Prioridade: VENDA primeiro (antes de interesse para evitar conflito)
  const vendaIntent = INTENTS.find(i => i.intent === 'VENDA');
  if (vendaIntent && vendaIntent.keywords.test(messageText)) {
    const reply = vendaIntent.getResponse(senderName);
    console.log(`[Bot] Intenção: VENDA em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: true };
  }

  // Prioridade: OBJECAO antes de interesse (para "não quero" não casar com "quero")
  const objecaoIntent = INTENTS.find(i => i.intent === 'OBJECAO');
  if (objecaoIntent && objecaoIntent.keywords.test(messageText)) {
    const reply = objecaoIntent.getResponse(senderName);
    console.log(`[Bot] Intenção: OBJECAO em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: false };
  }

  // Testar todas as outras intenções
  for (const intent of INTENTS) {
    if (intent.intent === 'VENDA' || intent.intent === 'OBJECAO') continue; // Já testados
    
    if (intent.keywords.test(messageText)) {
      const reply = intent.getResponse(senderName);
      const qualified = ['INTERESSE', 'AGENDAMENTO', 'FINANCIAMENTO', 'PRECO'].includes(intent.intent);
      console.log(`[Bot] Intenção: ${intent.intent} em ${Date.now() - startTime}ms`);
      return { text: reply, qualified };
    }
  }

  // === MENSAGENS CURTAS SEM MATCH: usar fallback ===
  if (messageText.length < 20) {
    const reply = FALLBACK_RESPONSE(senderName);
    console.log(`[Bot] Fallback (msg curta) em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: false };
  }

  // === MENSAGENS COMPLEXAS: usar LLM ===
  console.log(`[Bot] Mensagem complexa, usando IA: "${messageText.substring(0, 50)}"`);

  const propertiesContext = PROPERTIES.map((p: any) => {
    const fin = p.value * 0.8;
    const pmt240 = calcPrice(fin, 10.26, 240);
    const pmt300 = calcPrice(fin, 10.26, 300);
    const scarcity = p.remaining ? ` ⚠️ RESTAM APENAS ${p.remaining} UNIDADES de ${p.units}!` : '';
    const bedsInfo = p.beds > 0 ? `${p.beds} quartos, ` : '';
    return `- ${p.name}: ${p.type}, ${bedsInfo}${p.area}, ${fmt(p.value)} cada, parcela Caixa 20 anos: ${fmtFull(pmt240)}/mês, 25 anos: ${fmtFull(pmt300)}/mês, link: ${SITE_URL}/imovel/${p.slug}${scarcity}`;
  }).join('\n');

  const banksContext = BANKS.map(b => `- ${b.name}: ${b.rate}% a.a. + TR`).join('\n');

  const systemPrompt = `Voc\u00ea \u00e9 o assistente virtual da Romatec Consultoria Imobili\u00e1ria, especializada em imóveis em Açailândia - MA.
Seu objetivo \u00e9 ser persuasivo, profissional e amig\u00e1vel. Voc\u00ea qualifica leads e vende im\u00f3veis.

IM\u00d3VEIS DISPON\u00cdVEIS:
${propertiesContext}

TAXAS DE FINANCIAMENTO (abril/2026):
${banksContext}

ESPECIALISTAS:
- Jos\u00e9 Rom\u00e1rio (CEO) \u2014 wa.me/5599991811246
- Daniele \u2014 wa.me/5599992062871

REGRAS:
1. Responda SEMPRE em portugu\u00eas, de forma natural e persuasiva
2. Use *negrito* para destacar valores e nomes (formato WhatsApp)
3. Quando cliente diz "Oi/Ol\u00e1": apresente a Romatec, mencione os im\u00f3veis (faixa de pre\u00e7o) e pergunte o que procura
4. Quando pergunta sobre preço/financiamento: mostre as parcelas da Caixa em 20 anos (240x) e 25 anos (300x) - a de 25 anos é mais atrativa por ser menor
5. Quando menciona or\u00e7amento: recomende im\u00f3veis compat\u00edveis e envie os links
6. Quando demonstra interesse alto: ofere\u00e7a conectar com especialista
7. M\u00e1ximo 4-5 linhas por resposta. Seja direto.
8. NUNCA invente dados. Use apenas os im\u00f3veis e taxas listados acima.
9. Inclua links dos im\u00f3veis quando relevante.
10. Se o cliente perguntar algo fora do escopo imobiliário, redirecione educadamente.
11. Para o Cond. Chácaras Giuliano: ENFATIZE que CADA chácara custa R$ 160 mil, com ~1.000m² cada unidade. São 6 unidades no total e RESTAM APENAS 3! Use gatilho de urgência/escassez.
12. Se o cliente quer VENDER um imóvel, direcione para os especialistas.

FORMATO DE RESPOSTA (JSON):
{
  "reply": "texto da resposta para o cliente",
  "interest_level": 0-100,
  "wants_attendant": true/false,
  "budget_detected": null ou n\u00famero,
  "show_simulation": true/false,
  "property_value_for_simulation": null ou número,
  "wants_to_sell": true/false
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Cliente "${context.senderName || 'Cliente'}": "${messageText}"` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'bot_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              reply: { type: 'string' },
              interest_level: { type: 'number' },
              wants_attendant: { type: 'boolean' },
              budget_detected: { type: ['number', 'null'] },
              show_simulation: { type: 'boolean' },
              property_value_for_simulation: { type: ['number', 'null'] },
              wants_to_sell: { type: 'boolean' },
            },
            required: ['reply', 'interest_level', 'wants_attendant', 'budget_detected', 'show_simulation', 'property_value_for_simulation', 'wants_to_sell'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return { text: 'Ol\u00e1! Sou da *Romatec Consultoria*. Temos imóveis de *R$ 160 mil* a *R$ 380 mil* com financiamento facilitado. Como posso te ajudar?' };
    }

    const parsed = JSON.parse(content);
    let fullReply = parsed.reply || '';

    if (parsed.show_simulation && parsed.property_value_for_simulation) {
      fullReply += '\n\n' + formatSimulationWhatsApp(parsed.property_value_for_simulation);
    }

    if (parsed.budget_detected && !parsed.show_simulation) {
      fullReply += '\n\n' + formatRecommendationsWhatsApp(parsed.budget_detected);
    }

    if (parsed.wants_to_sell) {
      fullReply += '\n' + formatAttendantLink();
      console.log(`[Bot] Cliente quer VENDER imóvel - direcionando para captação`);
      return { text: fullReply, qualified: true };
    }

    const qualified = parsed.interest_level >= 60 || parsed.wants_attendant;
    if (qualified) {
      fullReply += '\n' + formatAttendantLink();
    }

    console.log(`[Bot] IA: Interesse ${parsed.interest_level}%, Qualificado: ${qualified} em ${Date.now() - startTime}ms`);

    return { text: fullReply, qualified };
  } catch (error) {
    console.error('[Bot] Erro IA:', error);
    return {
      text: FALLBACK_RESPONSE(senderName),
    };
  }
}

// ============ SIMULAÇÃO (para tRPC) ============

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
