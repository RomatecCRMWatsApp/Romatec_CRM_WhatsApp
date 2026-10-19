/**
 * Qualificação conversacional por IA (§7.3) — regras do turno, sem banco.
 *
 * A IA conduz a conversa e só EXTRAI respostas em JSON estrito; cada slot é
 * validado contra o enum (valor inválido é descartado) e a nota vem das regras
 * do score. Erro, timeout de 15 s ou JSON inválido → falha; 2 falhas seguidas
 * → o bot de perguntas (regex) assume.
 */
import { z } from 'zod';
import type { Funil } from './atribuicao';
import { fraseCorretorChama } from './config';
import { mesclarSlots, slotsDoFunil, slotsPendentes, valoresSlots, type SlotsLead } from './slots';

export const MAX_PERGUNTAS = 8;
export const MAX_FALHAS = 2;
export const TIMEOUT_MS = 15_000;
const MAX_RESPOSTA = 350;

// ─── Formato da resposta da IA ───────────────────────────────────────────────
const NOMES_SLOTS = Array.from(new Set([...slotsDoFunil('comprador'), ...slotsDoFunil('proprietario')].map(s => s.nome)));

/** JSON Schema para structured outputs (objetos fechados, tudo obrigatório) */
export const SCHEMA_RESPOSTA = {
  type: 'object',
  additionalProperties: false,
  required: ['resposta_ao_lead', 'slots_extraidos', 'funil_detectado', 'pedir_humano', 'qualificacao_completa', 'optout'],
  properties: {
    resposta_ao_lead: { type: 'string', description: 'Mensagem curta ao cliente, no máximo 350 caracteres, com no máximo 1 pergunta' },
    slots_extraidos: {
      type: 'array',
      description: 'Somente o que o cliente informou nesta conversa; valores no formato normalizado da lista de slots',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slot', 'valor'],
        properties: { slot: { type: 'string', enum: NOMES_SLOTS }, valor: { type: 'string' } },
      },
    },
    funil_detectado: { type: 'string', enum: ['comprador', 'proprietario'] },
    pedir_humano: { type: 'boolean' },
    qualificacao_completa: { type: 'boolean' },
    optout: { type: 'boolean' },
  },
} as const;

const respostaSchema = z.object({
  resposta_ao_lead: z.string(),
  slots_extraidos: z.array(z.object({ slot: z.string(), valor: z.union([z.string(), z.number()]) })),
  funil_detectado: z.enum(['comprador', 'proprietario']),
  pedir_humano: z.boolean(),
  qualificacao_completa: z.boolean(),
  optout: z.boolean(),
});
export type RespostaIa = z.infer<typeof respostaSchema>;

/** Lê o JSON da IA (tolera cerca ```json); null se inválido */
export function parseRespostaIa(texto: string | null | undefined): RespostaIa | null {
  if (!texto) return null;
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const r = respostaSchema.safeParse(JSON.parse(limpo));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ─── Prompt (§7.5) ───────────────────────────────────────────────────────────
export interface ImovelPrompt { codigo?: string | null; titulo: string; cidade?: string | null; area?: string | null; preco: string; tipo?: string | null }

const VALORES_SLOT = (funil: Funil) => slotsDoFunil(funil)
  .map(d => `- ${d.nome}: ${'enum' in d.tipo ? d.tipo.enum.join(' | ') : 'numero' in d.tipo ? 'número em reais (ex.: 150000)' : 'texto curto'}`)
  .join('\n');

export function montarSystemPrompt(p: {
  assistente: string;
  funil: Funil;
  pendentes: string[];
  preenchidos: Record<string, string>;
  imovel: ImovelPrompt | null;
}): string {
  return [
    `Você é ${p.assistente}, assistente da Romatec Consultoria Total (Açailândia/MA), escritório de`,
    `José Romário Pinto Bezerra — corretor CRECI/MA 4.705 e avaliador CNAI 031161.`,
    `Objetivo: entender a necessidade do cliente e preencher os slots pendentes do funil ${p.funil}.`,
    `Regras:`,
    `- Português do Brasil, tom cordial e direto, sem jargão. Uma pergunta por mensagem. Máximo de ${MAX_RESPOSTA} caracteres.`,
    `- Nunca invente dados do imóvel: use só os dados em IMOVEL. Se não souber, diga que o José confirma.`,
    `- Se o preço do imóvel for "Valor sob consulta", não fale de valores: diga que o José passa as condições.`,
    `- Nunca prometa desconto, aprovação de crédito, prazo de cartório ou valor de avaliação.`,
    `- Não peça CPF, RG, renda exata nem dados bancários.`,
    `- Se ainda não souber o que o cliente procura (casa, lote, chácara, área rural), comece por isso.`,
    `- Chácara, lote e área rural: pergunte forma de pagamento (à vista ou parcelado direto com o vendedor), prazo para comprar e uso (lazer, moradia ou investimento). Não fale de FGTS nem de financiamento bancário, a não ser que o cliente pergunte.`,
    `- Nunca diga que há poucas unidades, muitas consultas ou prazo acabando: só fatos do IMOVEL.`,
    `- Se o cliente quiser visita, pergunte o melhor dia/turno e registre quer_visita = "sim".`,
    `- Se o cliente quiser vender ou avaliar o imóvel dele, use funil_detectado = "proprietario".`,
    `- Se o cliente pedir para parar (SAIR, PARAR, não quero), marque optout = true e despeça-se.`,
    `- Se o cliente pedir para falar com o corretor, marque pedir_humano = true.`,
    `- Em slots_extraidos, registre apenas o que o cliente disse, no formato normalizado abaixo.`,
    `- Marque qualificacao_completa = true quando não houver mais slots pendentes.`,
    ``,
    `FORMATO DOS SLOTS:`,
    VALORES_SLOT(p.funil),
    ``,
    `SLOTS_PENDENTES: ${p.pendentes.length ? p.pendentes.join(', ') : '(nenhum)'}`,
    `SLOTS_PREENCHIDOS: ${JSON.stringify(p.preenchidos)}`,
    `IMOVEL: ${p.imovel ? JSON.stringify(p.imovel) : 'null'}`,
  ].join('\n');
}

// ─── Atalhos locais (sem gastar IA) ──────────────────────────────────────────
const sem = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function pediuOptout(texto: string): boolean {
  const t = sem(texto);
  return /^(sair|parar|stop|cancelar)[.!]?$/.test(t) || /\b(nao quero mais|nao me mande|para de mandar|pare de mandar|me tira da lista)\b/.test(t);
}

export function pediuHumano(texto: string): boolean {
  return /\bfalar com (o |a |um |uma )?(corretor|atendente|humano|pessoa|jose|responsavel)\b/.test(sem(texto));
}

// O lead fala primeiro com o CRM; o José assume pelo número pessoal dele
export const MSG_HANDOFF = `Vou chamar o José Romário 👍 ${fraseCorretorChama()}`;
export const MSG_OPTOUT = 'Tudo bem! Não vou mais te enviar mensagens. Se mudar de ideia, é só chamar por aqui. 😊';
export const MSG_COMPLETA = `Obrigado pelas respostas! 🏡 ${fraseCorretorChama()}`;

// ─── Turno ───────────────────────────────────────────────────────────────────
export interface MensagemHistorico { role: 'user' | 'assistant'; content: string }
export type ChamadaIa = (p: { system: string; mensagens: MensagemHistorico[] }) => Promise<string>;

export interface EstadoQualificacao {
  funil: Funil;
  slots: SlotsLead | null;
  perguntasIa: number;
  falhasIa: number;
  tipoImovel?: string | null;
  imovel: ImovelPrompt | null;
  historico: MensagemHistorico[];
}

export type ResultadoTurno =
  | { tipo: 'falha'; falhasIa: number; cairNoBot: boolean; erro: string }
  | {
    tipo: 'ok';
    texto: string;
    funil: Funil;
    slots: SlotsLead;
    aceitos: string[];
    recusados: string[];
    perguntasIa: number;
    acao: 'continuar' | 'handoff' | 'optout' | 'completa';
  };

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout de ${ms / 1000}s`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export async function processarTurno(
  estado: EstadoQualificacao,
  textoLead: string,
  deps: { chamar: ChamadaIa; assistente: string; timeoutMs?: number; now?: Date },
): Promise<ResultadoTurno> {
  const slotsAtuais = estado.slots || {};
  const base = { funil: estado.funil, slots: slotsAtuais, aceitos: [] as string[], recusados: [] as string[], perguntasIa: estado.perguntasIa };

  // SAIR e "falar com corretor" não dependem da IA
  if (pediuOptout(textoLead)) return { tipo: 'ok', texto: MSG_OPTOUT, acao: 'optout', ...base };
  if (pediuHumano(textoLead)) return { tipo: 'ok', texto: MSG_HANDOFF, acao: 'handoff', ...base };

  const pendentes = slotsPendentes(estado.funil, slotsAtuais, { tipoImovel: estado.tipoImovel });
  const system = montarSystemPrompt({
    assistente: deps.assistente, funil: estado.funil, pendentes, preenchidos: valoresSlots(slotsAtuais), imovel: estado.imovel,
  });
  const mensagens: MensagemHistorico[] = [...estado.historico.slice(-12), { role: 'user', content: textoLead }];

  let r: RespostaIa | null = null;
  let erro = 'JSON inválido';
  try {
    r = parseRespostaIa(await comTimeout(deps.chamar({ system, mensagens }), deps.timeoutMs ?? TIMEOUT_MS));
  } catch (e: any) {
    erro = e?.message || String(e);
  }
  if (!r) {
    const falhasIa = estado.falhasIa + 1;
    return { tipo: 'falha', falhasIa, cairNoBot: falhasIa >= MAX_FALHAS, erro };
  }

  const funil: Funil = r.funil_detectado;
  const extraidos = Object.fromEntries(r.slots_extraidos.map(s => [s.slot, s.valor]));
  const { slots, aceitos, recusados } = mesclarSlots(funil, slotsAtuais, extraidos, 'ia', deps.now);
  const texto = r.resposta_ao_lead.trim().slice(0, MAX_RESPOSTA);
  const comum = { funil, slots, aceitos, recusados };

  if (r.optout) return { tipo: 'ok', texto: texto || MSG_OPTOUT, acao: 'optout', perguntasIa: estado.perguntasIa, ...comum };
  if (r.pedir_humano) return { tipo: 'ok', texto: MSG_HANDOFF, acao: 'handoff', perguntasIa: estado.perguntasIa, ...comum };

  const restantes = slotsPendentes(funil, slots, { tipoImovel: estado.tipoImovel });
  const perguntasIa = estado.perguntasIa + 1;
  if (r.qualificacao_completa || restantes.length === 0 || perguntasIa >= MAX_PERGUNTAS) {
    // Encerra (completa ou parcial no limite de perguntas) e passa para o corretor
    const fecho = texto && !/\?\s*$/.test(texto) ? `${texto}\n\n${MSG_COMPLETA}` : MSG_COMPLETA;
    return { tipo: 'ok', texto: fecho, acao: 'completa', perguntasIa, ...comum };
  }
  return { tipo: 'ok', texto: texto || 'Pode me contar um pouco mais?', acao: 'continuar', perguntasIa, ...comum };
}

// ─── Provedores: Claude (principal) e OpenAI (reserva) ──────────────────────
export function modeloClaude(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
}

export function iaDisponivel(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY);
}

/** Claude via SDK oficial, JSON estrito (structured outputs) e fallback no servidor em caso de recusa */
export const chamarClaude: ChamadaIa = async ({ system, mensagens }) => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ maxRetries: 0, timeout: TIMEOUT_MS });
  const response = await client.beta.messages.create({
    model: modeloClaude(),
    max_tokens: 4096,
    system,
    messages: mensagens,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA_RESPOSTA as any } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  } as any);
  if (response.stop_reason === 'refusal') throw new Error('Claude recusou a resposta');
  const bloco = response.content.find((b: any) => b.type === 'text') as { text?: string } | undefined;
  if (!bloco?.text) throw new Error(`Claude sem texto (stop_reason=${response.stop_reason})`);
  return bloco.text;
};

/** Reserva: OpenAI/forge pelo invokeLLM do projeto */
export const chamarOpenAI: ChamadaIa = async ({ system, mensagens }) => {
  const { invokeLLM } = await import('../_core/llm');
  const r = await invokeLLM({
    messages: [{ role: 'system', content: system }, ...mensagens.map(m => ({ role: m.role, content: m.content }))] as any,
    response_format: { type: 'json_schema', json_schema: { name: 'qualificacao', schema: SCHEMA_RESPOSTA as any, strict: true } },
  });
  const c = r.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: any) => p.text || '').join('') : '';
};

/** Claude primeiro (se ANTHROPIC_API_KEY); se falhar, OpenAI */
export const chamarIaPadrao: ChamadaIa = async (p) => {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await chamarClaude(p);
    } catch (e: any) {
      console.warn('[IA] Claude falhou, tentando OpenAI:', e?.message);
      if (!process.env.OPENAI_API_KEY && !process.env.BUILT_IN_FORGE_API_KEY) throw e;
    }
  }
  return chamarOpenAI(p);
};
