// @module IntentDetector — Detecção de palavras-chave de intenção (INTERESSE, OBJECAO_, etc.)

/**
 * ROMATEC CRM v9.0 — Detecção de intenção em mensagens recebidas
 *
 * Responsabilidades:
 * - Classificar respostas do lead em: INTERESSE, OBJECAO_PRECO, OBJECAO_TEMPO,
 *   OBJECAO_LOCALIZACAO, PEDIDO_INFO, NEGATIVA, NEUTRO
 * - Normalizar texto (remover acentos, lowercase, trim)
 * - Fornecer utilitário para o webhook de resposta e para o bot-ai
 */

export type IntentType =
  | 'INTERESSE'
  | 'OBJECAO_PRECO'
  | 'OBJECAO_TEMPO'
  | 'OBJECAO_LOCALIZACAO'
  | 'PEDIDO_INFO'
  | 'NEGATIVA'
  | 'NEUTRO';

interface IntentRule {
  intent: IntentType;
  keywords: string[];
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'INTERESSE',
    keywords: [
      'sim', 'quero', 'tenho interesse', 'me interessa', 'quero ver', 'pode sim',
      'me manda', 'manda as fotos', 'falar mais', 'quero saber', 'vamos', 'topo',
      'pode ser', 'manda', 'quero mais', 'posso ver', 'quero conhecer', 'me conta',
    ],
  },
  {
    intent: 'OBJECAO_PRECO',
    keywords: [
      'caro', 'muito caro', 'não tenho dinheiro', 'nao tenho dinheiro', 'sem dinheiro',
      'não posso pagar', 'nao posso pagar', 'acima do meu', 'preço alto', 'preco alto',
      'tá caro', 'ta caro', 'valor alto', 'não consigo', 'nao consigo',
    ],
  },
  {
    intent: 'OBJECAO_TEMPO',
    keywords: [
      'agora não', 'agora nao', 'mais pra frente', 'depois', 'futuramente',
      'não é agora', 'nao e agora', 'outro momento', 'sem pressa', 'não agora', 'nao agora',
    ],
  },
  {
    intent: 'OBJECAO_LOCALIZACAO',
    keywords: [
      'longe', 'muito longe', 'não fica bem', 'nao fica bem', 'não é aqui', 'nao e aqui',
      'prefiro outro bairro', 'outro local', 'outra região', 'outra regiao',
      'não gosto do bairro', 'nao gosto do bairro',
    ],
  },
  {
    intent: 'PEDIDO_INFO',
    keywords: [
      'quanto', 'valor', 'preço', 'preco', 'detalhes', 'informação', 'informacao',
      'me fala mais', 'como funciona', 'área', 'area', 'metros', 'quartos', 'vagas',
      'financiamento', 'entrada', 'fgts', 'documentação', 'documentacao',
    ],
  },
  {
    intent: 'NEGATIVA',
    keywords: [
      'não', 'nao', 'não quero', 'nao quero', 'não tenho interesse', 'nao tenho interesse',
      'pare', 'paro', 'para de mandar', 'remove', 'sair', 'descadastrar',
      'não me manda', 'nao me manda', 'bloquear', 'chega', 'obrigado não', 'obrigado nao',
    ],
  },
];

/** Normaliza texto para comparação: lowercase + remove acentos */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Detecta a intenção principal de uma mensagem recebida.
 * Retorna 'NEUTRO' se nenhuma palavra-chave bater.
 */
export function detectIntent(message: string): IntentType {
  const normalized = normalize(message);

  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(normalize(keyword))) {
        return rule.intent;
      }
    }
  }

  return 'NEUTRO';
}

/**
 * Verifica se a mensagem indica que o lead respondeu
 * (qualquer resposta conta como engajamento — desbloqueio de contato).
 */
export function isLeadReply(message: string): boolean {
  const intent = detectIntent(message);
  return intent !== 'NEUTRO';
}

/**
 * Retorna true se o intent indica interesse positivo (lead quente).
 */
export function isPositiveIntent(intent: IntentType): boolean {
  return intent === 'INTERESSE' || intent === 'PEDIDO_INFO';
}

/**
 * Retorna true se o intent indica objeção (lead precisa de contorno).
 */
export function isObjectionIntent(intent: IntentType): boolean {
  return intent.startsWith('OBJECAO_');
}
