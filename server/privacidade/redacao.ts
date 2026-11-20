/**
 * Redação de dados pessoais e segredos nos logs do servidor (LGPD art. 46 — medidas de segurança).
 *
 * Os logs do Railway são lidos por quem administra a infraestrutura e ficam retidos fora do banco: telefone, CPF,
 * e-mail, chaves e tokens não precisam estar lá para diagnóstico. Mantemos só os 4 últimos dígitos do telefone
 * (dá para achar o lead no CRM) e nada do resto.
 *
 * Ligado por padrão; LOG_REDACAO=off desliga (diagnóstico pontual, com aprovação).
 */

const SUBSTITUICOES: Array<[RegExp, (m: string, ...g: string[]) => string]> = [
  // Cabeçalho/parâmetro de autorização e tokens explícitos
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (_m, tipo) => `${tipo} [REDIGIDO]`],
  [/\b(access_token|token|senha|password|secret|apikey|api_key|client_token|clientToken|access-token)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]{4,}/gi, (_m, k, sep) => `${k}${sep}[REDIGIDO]`],
  // Chave do Asaas, chaves "sk-" e JWT
  [/\$?aact_[A-Za-z0-9_]{6,}/g, () => '[CHAVE-ASAAS]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, () => '[CHAVE]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, () => '[JWT]'],
  // E-mail
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => '[EMAIL]'],
  // CPF formatado e CNPJ formatado
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, () => '[CPF]'],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, () => '[CNPJ]'],
  // Telefone BR (com ou sem +55, DDD, 8 ou 9 dígitos, com ou sem pontuação): mantém os 4 últimos
  [/(?<![\d])(?:\+?55[\s-]?)?\(?[1-9]{2}\)?[\s-]?9?\s?\d{4}[\s.-]?\d{4}(?![\d])/g, (m) => `[TEL…${m.replace(/\D/g, '').slice(-4)}]`],
  // CPF sem pontuação (11 dígitos isolados) que não foi pego como telefone
  [/(?<![\d])\d{11}(?![\d])/g, () => '[CPF]'],
];

/** Texto com dados pessoais/segredos substituídos */
export function redigir(texto: string): string {
  let out = String(texto);
  for (const [re, fn] of SUBSTITUICOES) out = out.replace(re, fn as any);
  return out;
}

/** Redige qualquer valor que vá para o console (Error vira mensagem + stack redigidos) */
export function redigirValor(v: unknown): unknown {
  if (typeof v === 'string') return redigir(v);
  if (v instanceof Error) {
    const e = new Error(redigir(v.message));
    e.name = v.name;
    e.stack = v.stack ? redigir(v.stack) : undefined;
    return e;
  }
  if (v && typeof v === 'object') {
    try { return redigir(JSON.stringify(v)); } catch { return '[objeto]'; }
  }
  return v;
}

let instalada = false;

/** Envolve console.log/info/warn/error/debug com a redação. Idempotente. */
export function instalarRedacaoDeLogs(env: Record<string, string | undefined> = process.env): boolean {
  if (instalada || String(env.LOG_REDACAO ?? '').toLowerCase() === 'off') return false;
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[m].bind(console);
    console[m] = (...args: unknown[]) => original(...args.map(redigirValor));
  }
  instalada = true;
  return true;
}
