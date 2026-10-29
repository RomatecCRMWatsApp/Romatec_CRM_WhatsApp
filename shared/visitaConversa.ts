/**
 * Visita marcada na própria conversa do WhatsApp (robô do empreendimento): o cliente pede visita → o robô oferece 3
 * horários livres → o cliente responde o número ("2") ou escreve o dia/hora ("sábado às 9h") → visita na agenda.
 */
import { HORARIOS, type FaixaHorario } from './agendamento';

export interface OpcaoVisita { dia: string; horario: FaixaHorario }

const H = 3_600_000;
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** Faixas oferecidas pelo robô (as outras ficam para o corretor combinar) */
const FAIXAS_OFERECIDAS: FaixaHorario[] = ['08-10', '10-12', '15-17'];

const diaLocal = (t: number) => new Date(t - 3 * H).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** "terça, 04/11 — 10h às 12h" */
export function rotuloOpcao(o: OpcaoVisita): string {
  const [, m, d] = o.dia.split('-');
  return `${DIAS_SEMANA[diaDaSemana(o.dia)]}, ${d}/${m} — ${HORARIOS.find(h => h[0] === o.horario)?.[1] ?? o.horario}`;
}

/**
 * 3 opções a partir de amanhã (sem domingo), alternando manhã/tarde, pulando as faixas já ocupadas por outra visita
 * do empreendimento (`ocupadas` = "AAAA-MM-DD|08-10").
 */
export function opcoesDeVisita(agora: number, ocupadas: Set<string>, n = 3): OpcaoVisita[] {
  const out: OpcaoVisita[] = [];
  let dia = somarDias(diaLocal(agora), 1);
  for (let k = 0; out.length < n && k < 21; k++, dia = somarDias(dia, 1)) {
    if (diaDaSemana(dia) === 0) continue;
    const ordem = out.length % 2 === 0 ? FAIXAS_OFERECIDAS : [...FAIXAS_OFERECIDAS].reverse();
    const faixa = ordem.find(f => !ocupadas.has(`${dia}|${f}`));
    if (faixa) out.push({ dia, horario: faixa });
  }
  return out;
}

export function mensagemOpcoes(opcoes: OpcaoVisita[], intro: string): string {
  const num = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
  return `${intro}\n\nTenho estes horários para a sua visita:\n${opcoes.map((o, i) => `${num[i]} ${rotuloOpcao(o)}`).join('\n')}\n\n` +
    'Responda com o *número* da opção ou me diga outro dia e horário (ex.: "sábado às 9h").';
}

/** "2", "opção 2", "a segunda", "fico com a 3" → índice (0-based); null = não escolheu por número */
export function escolhaPorNumero(texto: string, total: number): number | null {
  const t = texto.trim().toLowerCase();
  const ord: Record<string, number> = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3 };
  let n: number | null = null;
  const m = t.match(/^(?:op[çc][ãa]o\s*)?([1-4])(?:\s*[).️⃣]|\s*$|\s+(?:por favor|pfv|pf|ok|blz|beleza))/) ?? t.match(/\b(?:op[çc][ãa]o|a|fico com a|quero a|pode ser a)\s+([1-4])\b/);
  if (m) n = Number(m[1]);
  else { const w = t.match(/\b(primeira|primeiro|segunda|segundo|terceira|terceiro)\b(?![\s-]*feira)/); if (w) n = ord[w[1]]; }
  return n && n >= 1 && n <= total ? n - 1 : null;
}

/** A mensagem fala de dia/hora? (só então vale a pena pedir para a IA interpretar) */
export const falaDeDataOuHora = (texto: string) =>
  /\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|amanh[ãa]|hoje|depois de amanh[ãa]|manh[ãa]|tarde|\d{1,2}\s*h(?:oras?)?\b|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})/i.test(texto);

/** Hora (0–23) → faixa de atendimento; fora do horário de visitas → null */
export function faixaDaHora(h: number): FaixaHorario | null {
  const f = [...HORARIOS].reverse().find(x => h >= x[2]);
  return f && h < 19 ? f[0] : null;
}
