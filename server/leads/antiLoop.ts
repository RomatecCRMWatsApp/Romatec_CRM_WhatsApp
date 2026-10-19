/**
 * Proteções da conversa automática:
 * - resposta automática de outra empresa ("mensagem automática", "fora do horário"…)
 *   não recebe resposta do bot — dois robôs conversando viram um loop;
 * - no máximo LIMITE_RESPOSTAS respostas do bot por número em JANELA_MS;
 * - saudação ("oi", "bom dia") não vale como nome.
 */

const AUTOMATICA = [
  /mensage(m|ns) autom[aá]tica/i,
  /resposta autom[aá]tica/i,
  /atendimento autom[aá]tico/i,
  /n[aã]o (responda|responder) (a )?esta mensagem/i,
  /fora do (nosso )?(hor[aá]rio|expediente)( de atendimento)?/i,
  /(retornaremos|responderemos) (assim que|em breve|o mais breve)/i,
  /\bauto-?reply\b|\bautomated (message|reply)\b|\bout of (the )?office\b/i,
];

/** A mensagem recebida parece uma resposta automática de outro sistema? */
export function ehRespostaAutomatica(texto: string | null | undefined): boolean {
  const t = String(texto || '');
  return t.length >= 12 && AUTOMATICA.some(r => r.test(t));
}

const SAUDACOES = /^(oi+|ol[aá]+|opa|e a[ií]|eai|bom dia|boa tarde|boa noite|tudo bem|td bem|ok|sim|n[aã]o|obrigad[oa]|valeu|blz|beleza|hello|hi|al[oô])[\s!.,?]*$/i;

/** O texto parece um nome de pessoa (e não "oi", "sim", um número…)? */
export function pareceNome(texto: string | null | undefined): boolean {
  const t = String(texto || '').trim();
  if (t.length < 2 || t.length > 60) return false;
  if (SAUDACOES.test(t)) return false;
  if (/\d|@|https?:|\?/.test(t)) return false;
  const palavras = t.split(/\s+/);
  if (palavras.length > 6) return false;
  return palavras.every(p => /^[A-Za-zÀ-ÿ'.-]+$/.test(p));
}

export const LIMITE_RESPOSTAS = 6;
export const JANELA_MS = 10 * 60_000;
const respostas = new Map<string, number[]>();

/** Pode responder a este número agora? (registra a resposta quando sim) */
export function podeResponder(phone: string, agora = Date.now(), mapa = respostas): boolean {
  const k = phone.replace(/\D/g, '');
  const recentes = (mapa.get(k) || []).filter(t => agora - t < JANELA_MS);
  if (recentes.length >= LIMITE_RESPOSTAS) { mapa.set(k, recentes); return false; }
  recentes.push(agora);
  mapa.set(k, recentes);
  if (mapa.size > 5000) for (const [kk, v] of Array.from(mapa)) if (!v.some(t => agora - t < JANELA_MS)) mapa.delete(kk);
  return true;
}
