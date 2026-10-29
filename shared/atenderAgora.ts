/**
 * "Atender agora" (Leads › Atender agora): os leads em ordem de prioridade, com o motivo de cada um.
 * Pontos: esperando corretor > fila de espera com a chácara livre > visita hoje > cliente sem resposta > lead novo >
 * temperatura (score) > esfriando. Fechados, perdidos e bloqueados ficam de fora.
 */

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

export interface EntradaPrioridade {
  score: number | null;
  classe: string | null;
  etapa: string;
  criadoEm: number;
  ultimaAtividade: number | null;
  aguardandoDesde: number | null;
  atendidoEm: number | null;
  /** Última mensagem do cliente e última nossa (qualquer autor) */
  ultimaDoCliente: number | null;
  ultimaNossa: number | null;
  /** Próxima visita agendada/confirmada (timestamp) */
  proximaVisita: number | null;
  /** Fila de espera: a chácara ficou livre e é a vez dele */
  filaAvisado: string | null;
  bloqueadoAte: number | null;
}

export type Urgencia = 'agora' | 'hoje' | 'depois';
export interface Prioridade { pontos: number; urgencia: Urgencia; motivos: string[] }

export const ETAPAS_ENCERRADAS = ['fechado', 'perdido', 'captado'];

const tempo = (ms: number) => {
  if (ms < H) return `${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < D) return `${Math.round(ms / H)} h`;
  const d = Math.round(ms / D);
  return `${d} dia${d > 1 ? 's' : ''}`;
};
const horaBR = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' });
const diaBR = (t: number) => new Date(t - 3 * H).toISOString().slice(0, 10);

/** null = fora da lista (encerrado, bloqueado ou sem nada a fazer) */
export function prioridadeDoLead(e: EntradaPrioridade, agora = Date.now()): Prioridade | null {
  if (ETAPAS_ENCERRADAS.includes(e.etapa)) return null;
  if (e.bloqueadoAte && e.bloqueadoAte > agora) return null;
  let pontos = 0;
  const motivos: string[] = [];
  let urgencia: Urgencia = 'depois';

  const esperando = e.aguardandoDesde && (!e.atendidoEm || e.atendidoEm < e.aguardandoDesde) ? agora - e.aguardandoDesde : null;
  if (esperando != null) {
    pontos += 150 + Math.min(60, Math.round(esperando / MIN));
    motivos.push(`Esperando corretor há ${tempo(esperando)}`);
    urgencia = 'agora';
  }
  if (e.filaAvisado) {
    pontos += 140;
    motivos.push(`Chácara ${e.filaAvisado} livre — é a vez dele na fila`);
    urgencia = 'agora';
  }
  if (e.proximaVisita && e.proximaVisita > agora - 2 * H) {
    const hoje = diaBR(e.proximaVisita) === diaBR(agora);
    const amanha = diaBR(e.proximaVisita) === diaBR(agora + D);
    if (hoje) { pontos += 70; motivos.push(`Visita hoje às ${horaBR(e.proximaVisita)} — confirme`); if (urgencia === 'depois') urgencia = 'hoje'; }
    else if (amanha) { pontos += 35; motivos.push(`Visita amanhã às ${horaBR(e.proximaVisita)}`); if (urgencia === 'depois') urgencia = 'hoje'; }
  }
  const semResposta = e.ultimaDoCliente && (!e.ultimaNossa || e.ultimaNossa < e.ultimaDoCliente) ? agora - e.ultimaDoCliente : null;
  if (semResposta != null && semResposta < 3 * D) {
    pontos += 60 + Math.min(24, Math.round(semResposta / H));
    motivos.push(`Mandou mensagem há ${tempo(semResposta)} e ninguém respondeu`);
    if (urgencia === 'depois') urgencia = semResposta < 2 * H ? 'agora' : 'hoje';
  }
  const idade = agora - e.criadoEm;
  if (idade < D && !e.atendidoEm) {
    pontos += 40;
    motivos.push(`Lead novo (${tempo(idade)}) ainda sem atendimento`);
    if (urgencia === 'depois') urgencia = 'hoje';
  }
  const score = e.score ?? 0;
  pontos += Math.round(score / 2);
  if (score >= 60 || e.classe === 'quente') motivos.push(`Quente${e.score != null ? ` (${e.score})` : ''}`);
  else if (e.classe === 'morno' && motivos.length) motivos.push(`Morno${e.score != null ? ` (${e.score})` : ''}`);

  const parado = e.ultimaAtividade ? agora - e.ultimaAtividade : null;
  if (parado != null && parado >= 3 * D && parado <= 21 * D && (score >= 40 || e.classe === 'quente' || e.classe === 'morno')) {
    pontos += 20;
    motivos.push(`Esfriando: ${tempo(parado)} sem contato`);
  }
  if (!motivos.length) return null;
  return { pontos, urgencia, motivos };
}
