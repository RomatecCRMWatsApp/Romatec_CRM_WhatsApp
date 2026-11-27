/**
 * Lead score do formulário qualificado (Meta "Maior intenção" e o mesmo roteiro no robô do WhatsApp): nota 0–100 e
 * faixa A/B/C pelas respostas com os nomes de campo procura, momento, pagamento, prioridade, regiao e visita.
 * A (≥70) vai na hora ao corretor; B (45–69) o robô confirma e agenda; C (<45) vai para a nutrição.
 * Porte fiel de scripts/lead_score.py (kit de campanhas, nov/2026). Também a projeção do funil (funil_vendas.py).
 */

const REGRAS: Record<string, [string, number][]> = {
  momento: [['agora', 30], ['30 dias', 30], ['1 a 3', 20], ['3 a 6', 10]],
  pagamento: [['vista', 25], ['cabem', 25], ['entrada menor', 8], ['nao sei', 3]],
  prioridade: [['seguranca', 10], ['natureza', 10], ['rio', 10], ['familia', 10], ['lazer', 10], ['investimento', 10], ['valorizacao', 10]],
  regiao: [['acailandia', 15], ['imperatriz', 12], ['regiao', 12], ['outra cidade', 8], ['outro estado', 4]],
  visita: [['fim de semana', 20], ['esta semana', 20], ['outro dia', 12], ['informacoes primeiro', 2]],
};
const EVENTOS: Record<string, number> = { respondeu_whatsapp: 10, visita_confirmada: 15, sem_resposta_24h: -15, numero_invalido: -100 };

export type Faixa = 'A' | 'B' | 'C';
export const ACAO_FAIXA: Record<Faixa, string> = {
  A: 'Quente: vai ao corretor na hora; WhatsApp ou ligação em até 5 min; oferecer visita',
  B: 'Morno: o robô confirma o interesse e agenda; corretor em até 24 h',
  C: 'Frio: não vai ao corretor; nutrição (lista de transmissão e Reels da obra); reavaliar em 30 dias',
};
export const CAMPOS_FORM = ['procura', 'momento', 'pagamento', 'prioridade', 'regiao', 'visita'] as const;

export function norm(t: unknown): string {
  return String(t ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/_/g, ' ').trim();
}

/**
 * Nome do campo do roteiro a partir da chave que o Meta manda. Sem nome de campo definido no formulário, o Meta usa o
 * texto da pergunta ("o_que_você_procura?", "quando_pretende_comprar?"...); aqui a pergunta vira o campo certo.
 */
const PISTAS: [typeof CAMPOS_FORM[number], RegExp][] = [
  ['procura', /\bprocura\b/],
  ['momento', /pretende comprar|\bquando\b/],
  ['pagamento', /\bpagar\b|pagamento|parcelas/],
  ['prioridade', /importante|prioridade/],
  ['regiao', /\bmora\b|\bregiao\b/],
  ['visita', /conhecer|\bvisita\b/],
];
export function campoDoRoteiro(chave: unknown): typeof CAMPOS_FORM[number] | null {
  const k = norm(chave).replace(/[?!.:]/g, '').replace(/\s+/g, ' ');
  if ((CAMPOS_FORM as readonly string[]).includes(k.replace(/ /g, '_'))) return k.replace(/ /g, '_') as typeof CAMPOS_FORM[number];
  return PISTAS.find(([, re]) => re.test(k))?.[0] ?? null;
}

/** As respostas vieram do formulário qualificado (tem pelo menos um campo do roteiro novo) */
export function ehFormularioQualificado(resp: Record<string, unknown>): boolean {
  const ks = Object.keys(resp).map(norm);
  return ['momento', 'visita', 'regiao', 'prioridade'].some(k => ks.includes(k));
}

export function pontuar(resp: Record<string, unknown>) {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resp)) r[norm(k)] = v;
  let total = 0;
  const detalhe: Record<string, number> = {};
  for (const [campo, regras] of Object.entries(REGRAS)) {
    const valor = norm(r[campo]);
    const pts = regras.find(([trecho]) => valor.includes(trecho))?.[1] ?? 0;
    detalhe[campo] = pts;
    total += pts;
  }
  for (const [ev, pts] of Object.entries(EVENTOS)) {
    if (['1', 'sim', 'true', 'yes'].includes(String(r[ev.replace(/_/g, ' ')] ?? '').toLowerCase())) { total += pts; detalhe[ev] = pts; }
  }
  total = Math.max(0, Math.min(100, total));
  const faixa: Faixa = total >= 70 ? 'A' : total >= 45 ? 'B' : 'C';
  return { leadScore: total, faixa, acao: ACAO_FAIXA[faixa], detalhe };
}

// ─── Funil: lead → qualificado (A+B) → visita → venda ──────────────────────────
export interface TaxasFunil { cpl: number; qualif: number; visita: number; fecha: number }
export const CENARIOS_FUNIL: Record<string, TaxasFunil> = {
  conservador: { cpl: 45, qualif: 0.35, visita: 0.25, fecha: 0.12 },
  base: { cpl: 30, qualif: 0.45, visita: 0.30, fecha: 0.15 },
  otimista: { cpl: 20, qualif: 0.55, visita: 0.35, fecha: 0.20 },
};

export function projetarFunil(verba: number, unidades: number, mesesMeta: number, c: TaxasFunil) {
  const leads = verba / c.cpl, qualificados = leads * c.qualif, visitas = qualificados * c.visita, vendas = visitas * c.fecha;
  const alvo = unidades / mesesMeta;
  return {
    leads: Math.round(leads), qualificados: Math.round(qualificados), visitas: Math.round(visitas), vendasMes: Math.round(vendas * 10) / 10,
    mesesParaVender: vendas > 0 ? Math.round((unidades / vendas) * 10) / 10 : null,
    custoPorVenda: vendas > 0 ? Math.round(verba / vendas) : null,
    verbaParaMeta: vendas > 0 ? Math.round((verba * alvo) / vendas) : null, vendasMesAlvo: Math.round(alvo * 10) / 10,
  };
}
