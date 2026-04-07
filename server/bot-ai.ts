/**
 * Bot IA Inteligente - Romatec CRM
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
  propertySlug?: string; // imóvel que originou o contato
}

export interface BotResponse {
  text: string;
  qualified?: boolean;
}

// ============ DADOS ============

const PROPERTIES = [
  { slug: 'cond-chacaras-giuliano', name: 'Cond. Chácaras Giuliano', value: 160000, beds: 0, area: '~1.000m² por unidade', type: 'Chácara (Condomínio)', units: 6, remaining: 3 },
  { slug: 'alacide', name: 'Alacide', value: 210000, beds: 2, area: '58m²', type: 'Apartamento' },
  { slug: 'mod-vaz-01', name: 'Mod Vaz 01', value: 250000, beds: 2, area: '68m²', type: 'Apartamento' },
  { slug: 'mod-vaz-02', name: 'Mod Vaz 02', value: 300000, beds: 3, area: '110m²', type: 'Casa' },
  { slug: 'mod-vaz-03', name: 'Mod Vaz 03', value: 380000, beds: 3, area: '92m²', type: 'Apartamento' },
];

const BANKS = [
  { name: 'Caixa', emoji: '\ud83c\udfe6', rate: 10.26 },
  { name: 'Ita\u00fa', emoji: '\ud83d\udfe0', rate: 11.60 },
  { name: 'Santander', emoji: '\ud83d\udd34', rate: 11.69 },
  { name: 'Bradesco', emoji: '\ud83e\ude77', rate: 11.70 },
  { name: 'Banco do Brasil', emoji: '\u2b50', rate: 12.00 },
];

const SITE_URL = 'https://romatecwa-2uygcczr.manus.space';

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
  const pmt240 = calcPrice(financed, 10.26, 240); // 20 anos
  const pmt300 = calcPrice(financed, 10.26, 300); // 25 anos

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
    `\ud83d\udfe2 *Jos\u00e9 Rom\u00e1rio* \u2014 wa.me/5575988310407\n` +
    `\ud83d\udfe2 *Daniele* \u2014 wa.me/5575991949818\n\n` +
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

// ============ IA: ANÁLISE + RESPOSTA ============

// ============ RESPOSTAS RÁPIDAS (sem LLM) ============

const GREETING_PATTERNS = /^\s*(oi|ol[aá]|ola|hey|ei|bom\s*dia|boa\s*(tarde|noite)|opa|eae|eai|fala|salve|hello|hi)\s*[!?.]*\s*$/i;
const FINANCING_PATTERNS = /\b(financ\w*|parcela\w*|presta[çc][aã]o|entrada|caixa|banco|cr[eé]dito|consorcio|cons[oó]rcio|pagar|pagamento|quanto\s*custa|valor|pre[çc]o)/i;
const INTEREST_PATTERNS = /\b(interesse|interessad[oa]|quero|gostei|gostaria|visitar|conhecer|agendar|visita|ver\s*o\s*im[oó]vel|comprar)\b/i;
const SELL_PATTERNS = /\b(vender|vendo|anunciar|anuncio|captar|capta[çc][aã]o|avaliar|avalia[çc][aã]o|colocar\s*(pra|para)\s*vend|quero\s*vender|tenho\s*(um|uma|pra|para)\s*(im[oó]vel|casa|apto|apartamento|terreno|lote|ch[aá]cara|sitio|s[ií]tio)|meu\s*(im[oó]vel|casa|apto|apartamento|terreno))\b/i;

function getQuickSellReply(name: string): string {
  const firstName = name ? name.split(' ')[0] : 'Cliente';
  return `Olá, *${firstName}*! 🏠 Que ótimo saber que você tem um imóvel para vender!\n\n` +
    `A *Romatec Consultoria Imobiliária* também trabalha com *captação de imóveis* para venda. ` +
    `Nossos especialistas podem avaliar seu imóvel e encontrar o melhor comprador para você!\n\n` +
    `📋 *Para dar andamento, entre em contato direto com nosso especialista:*\n\n` +
    `🟢 *José Romário* (CEO) — wa.me/5575988310407\n` +
    `🟢 *Daniele* — wa.me/5575991949818\n\n` +
    `Eles vão te orientar sobre documentação, avaliação e divulgação do seu imóvel. 💪`;
}

function getQuickGreeting(name: string): string {
  const firstName = name ? name.split(' ')[0] : 'Cliente';
  const greetings = [
    `Olá, *${firstName}*! Seja muito bem-vindo(a) à *Romatec Consultoria Imobiliária*, sua especialista em imóveis em Açailândia - MA. Temos excelentes opções de apartamentos e casas, com valores a partir de *R$ 160.000*. Como podemos te ajudar a encontrar o imóvel dos seus sonhos hoje?`,
    `Olá, *${firstName}*! \ud83c\udfe0 Bem-vindo(a) à *Romatec*! Somos especialistas em imóveis em Açailândia - MA, com opções de *R$ 160 mil* a *R$ 380 mil*. Posso te ajudar a encontrar o imóvel ideal?`,
    `Oi, *${firstName}*! Que bom falar com você! Aqui é a *Romatec Consultoria Imobiliária*. Temos apartamentos e casas incríveis em Açailândia - MA. O que você está procurando?`,
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

function getQuickFinancingReply(name: string): string {
  const firstName = name ? name.split(' ')[0] : 'Cliente';
  // Mostrar parcelas do imóvel mais acessível
  const cheapest = PROPERTIES[0];
  const fin = cheapest.value * 0.8;
  const pmt240 = calcPrice(fin, 10.26, 240);
  const pmt300 = calcPrice(fin, 10.26, 300);
  
  return `Olá, *${firstName}*! \ud83c\udfe6 Ótima pergunta! Na Romatec trabalhamos com as melhores condições de financiamento.\n\n` +
    `\ud83d\udcb0 *Parcelas a partir de ${fmtFull(pmt300)}/mês* (Caixa, 25 anos)\n` +
    `\ud83c\udfe0 Imóveis de *${fmt(PROPERTIES[0].value)}* a *${fmt(PROPERTIES[PROPERTIES.length-1].value)}*\n` +
    `\ud83d\udcb3 Entrada a partir de *20%*\n\n` +
    `Você tem algum valor de parcela em mente ou um tipo de imóvel que procura?` +
    formatAttendantLink();
}

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

  // === RESPOSTAS RÁPIDAS (sem LLM - <100ms) ===
  
  // 1. Saudações simples: Oi, Olá, Bom dia, etc.
  if (GREETING_PATTERNS.test(messageText)) {
    const reply = getQuickGreeting(senderName);
    console.log(`[Bot] Resposta rápida (saudação) em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: false };
  }

  // 2. Financiamento/parcelas: resposta rápida com dados reais
  if (FINANCING_PATTERNS.test(messageText) && messageText.length < 50) {
    const reply = getQuickFinancingReply(senderName);
    console.log(`[Bot] Resposta rápida (financiamento) em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: true };
  }

  // 3. Intenção de VENDA: direcionar para captação
  if (SELL_PATTERNS.test(messageText)) {
    const reply = getQuickSellReply(senderName);
    console.log(`[Bot] Resposta rápida (VENDA/CAPTAÇÃO) em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: true };
  }

  // 4. Interesse direto: conectar com atendente
  if (INTEREST_PATTERNS.test(messageText) && messageText.length < 60) {
    const firstName = senderName.split(' ')[0];
    const reply = `Que ótimo, *${firstName}*! \ud83c\udf89 Ficamos muito felizes com seu interesse!\n\n` +
      `Nossos especialistas podem te mostrar todos os detalhes e agendar uma visita:\n` +
      formatAttendantLink();
    console.log(`[Bot] Resposta rápida (interesse) em ${Date.now() - startTime}ms`);
    return { text: reply, qualified: true };
  }

  // === MENSAGENS COMPLEXAS: usar LLM ===
  console.log(`[Bot] Mensagem complexa, usando IA: "${messageText.substring(0, 50)}"`);

  // Montar contexto dos imóveis para a IA (com parcelas 240x e 300x)
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
- Jos\u00e9 Rom\u00e1rio (CEO) \u2014 wa.me/5575988310407
- Daniele \u2014 wa.me/5575991949818

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
12. Se o cliente quer VENDER um imóvel (não comprar), responda com empatia, diga que a Romatec também faz captação de imóveis para venda, e direcione para os especialistas. NÃO tente vender imóveis para quem quer vender.
11. Para o Cond. Chácaras Giuliano: ENFATIZE que CADA chácara custa R$ 160 mil, com ~1.000m² cada unidade. São 6 unidades no total e RESTAM APENAS 3! Use gatilho de urgência/escassez: "estão sendo comercializadas rapidamente", "poucas unidades restantes", "oportunidade única". NÃO diga "lote/chácara" — diga apenas "chácara".

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

    // Adicionar simulação se solicitado
    if (parsed.show_simulation && parsed.property_value_for_simulation) {
      fullReply += '\n\n' + formatSimulationWhatsApp(parsed.property_value_for_simulation);
    }

    // Adicionar recomendações se detectou orçamento
    if (parsed.budget_detected && !parsed.show_simulation) {
      fullReply += '\n\n' + formatRecommendationsWhatsApp(parsed.budget_detected);
    }

    // Se quer VENDER, sempre direcionar para especialista
    if (parsed.wants_to_sell) {
      fullReply += '\n' + formatAttendantLink();
      console.log(`[Bot] Cliente quer VENDER imóvel - direcionando para captação`);
      return { text: fullReply, qualified: true };
    }

    // Adicionar link de atendente se qualificado
    const qualified = parsed.interest_level >= 60 || parsed.wants_attendant;
    if (qualified) {
      fullReply += '\n' + formatAttendantLink();
    }

    console.log(`[Bot] Interesse: ${parsed.interest_level}%, Qualificado: ${qualified}, Simula\u00e7\u00e3o: ${parsed.show_simulation}`);

    return { text: fullReply, qualified };
  } catch (error) {
    console.error('[Bot] Erro IA:', error);
    return {
      text: 'Olá! Sou da *Romatec Consultoria Imobiliária*. Temos ótimas opções de imóveis em Açailândia - MA!\n\n' +
        '🏠 A partir de *R$ 160 mil* com financiamento em até *25 anos*.\n\n' +
        'Como posso te ajudar?',
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
