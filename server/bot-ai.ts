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
  { slug: 'alacide', name: 'Alacide', value: 210000, beds: 2, area: '58m\u00b2', type: 'Apartamento' },
  { slug: 'mod-vaz-01', name: 'Mod Vaz 01', value: 250000, beds: 2, area: '68m\u00b2', type: 'Apartamento' },
  { slug: 'mod-vaz-02', name: 'Mod Vaz 02', value: 300000, beds: 3, area: '110m\u00b2', type: 'Casa' },
  { slug: 'mod-vaz-03', name: 'Mod Vaz 03', value: 380000, beds: 3, area: '92m\u00b2', type: 'Apartamento' },
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

export async function processBotMessage(context: BotContext): Promise<BotResponse> {
  let messageText = context.message || '';

  // Se for áudio, transcrever
  if (context.audioUrl && !messageText) {
    messageText = await transcribeAudioMessage(context.audioUrl);
    if (messageText) {
      console.log(`[Bot] \u00c1udio transcrito: "${messageText.substring(0, 80)}"`);
    } else {
      return { text: 'Recebi seu \u00e1udio! Pode me enviar por texto tamb\u00e9m? Assim consigo te ajudar melhor \ud83d\ude09' };
    }
  }

  if (!messageText) {
    return { text: 'Ol\u00e1! Sou o assistente da *Romatec Consultoria Imobili\u00e1ria*. Como posso te ajudar hoje?' };
  }

  // Montar contexto dos imóveis para a IA (com parcelas 240x e 300x)
  const propertiesContext = PROPERTIES.map(p => {
    const fin = p.value * 0.8;
    const pmt240 = calcPrice(fin, 10.26, 240);
    const pmt300 = calcPrice(fin, 10.26, 300);
    return `- ${p.name}: ${p.type}, ${p.beds} quartos, ${p.area}, ${fmt(p.value)}, parcela Caixa 20 anos: ${fmtFull(pmt240)}/mês, 25 anos: ${fmtFull(pmt300)}/mês, link: ${SITE_URL}/imovel/${p.slug}`;
  }).join('\n');

  const banksContext = BANKS.map(b => `- ${b.name}: ${b.rate}% a.a. + TR`).join('\n');

  const systemPrompt = `Voc\u00ea \u00e9 o assistente virtual da Romatec Consultoria Imobili\u00e1ria, especializada em im\u00f3veis em Feira de Santana-BA.
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
10. Se o cliente perguntar algo fora do escopo imobili\u00e1rio, redirecione educadamente.

FORMATO DE RESPOSTA (JSON):
{
  "reply": "texto da resposta para o cliente",
  "interest_level": 0-100,
  "wants_attendant": true/false,
  "budget_detected": null ou n\u00famero,
  "show_simulation": true/false,
  "property_value_for_simulation": null ou n\u00famero
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
            },
            required: ['reply', 'interest_level', 'wants_attendant', 'budget_detected', 'show_simulation', 'property_value_for_simulation'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return { text: 'Ol\u00e1! Sou da *Romatec Consultoria*. Temos im\u00f3veis de *R$ 210 mil* a *R$ 380 mil* com financiamento facilitado. Como posso te ajudar?' };
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
      text: 'Ol\u00e1! Sou da *Romatec Consultoria Imobili\u00e1ria*. Temos \u00f3timas op\u00e7\u00f5es de im\u00f3veis em Feira de Santana!\n\n' +
        '\ud83c\udfe0 A partir de *R$ 210 mil* com financiamento em at\u00e9 *30 anos*.\n\n' +
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
