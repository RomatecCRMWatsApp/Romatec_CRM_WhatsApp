/**
 * Ritmo seguro dos Disparos WhatsApp (mensagem para quem ainda não falou com a Romatec).
 *
 * Mandar a primeira mensagem para muitos desconhecidos é o que mais bloqueia número.
 * Por isso os Disparos só saem:
 * - de segunda a sábado, das 8h às 20h (Maranhão) — nada de madrugada, mesmo no "modo noite";
 * - até DISPARO_LIMITE_DIA mensagens por dia (padrão 30), contando no banco (sobrevive a restart).
 * A parada automática após 3 falhas seguidas da Z-API continua em messageDispatcher.ts.
 * Respostas do bot, follow-up e alertas não passam por aqui.
 */
import { and, gte, inArray } from 'drizzle-orm';

const FUSO = 3 * 3600_000; // UTC-3
export const HORA_INICIO = 8;
export const HORA_FIM = 20;

export function limiteDiario(): number {
  const n = Number(process.env.DISPARO_LIMITE_DIA);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30;
}

/** Dentro da janela de Disparos? (seg–sáb, 8h–20h no Maranhão) */
export function dentroDoHorario(agora = Date.now()): boolean {
  const local = new Date(agora - FUSO);
  const dow = local.getUTCDay(), h = local.getUTCHours();
  return dow !== 0 && h >= HORA_INICIO && h < HORA_FIM;
}

/** 0h de hoje no Maranhão, em horário UTC */
export function inicioDoDia(agora = Date.now()): Date {
  const local = new Date(agora - FUSO);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + FUSO);
}

export type Bloqueio = 'fora_do_horario' | 'limite_diario' | null;

/** Decide se o próximo Disparo pode sair (função pura) */
export function motivoBloqueio(enviadosHoje: number, agora = Date.now(), limite = limiteDiario()): Bloqueio {
  if (!dentroDoHorario(agora)) return 'fora_do_horario';
  if (enviadosHoje >= limite) return 'limite_diario';
  return null;
}

/** Disparos de hoje (enviados ou em envio) registrados em messageSendLog */
export async function disparosHoje(db: any, agora = Date.now()): Promise<number> {
  const { messageSendLog } = await import('../../drizzle/schema');
  const rows: any[] = await db.select({ id: messageSendLog.id }).from(messageSendLog)
    .where(and(gte(messageSendLog.sentAt, inicioDoDia(agora)), inArray(messageSendLog.status, ['sent', 'pending'])));
  return rows.length;
}

let ultimoAviso = '';
/** Pode disparar agora? Loga (uma vez por motivo e dia) quando segura */
export async function podeDisparar(db: any, agora = Date.now()): Promise<boolean> {
  const motivo = motivoBloqueio(await disparosHoje(db, agora), agora);
  if (!motivo) return true;
  const chave = `${motivo}:${inicioDoDia(agora).toISOString()}`;
  if (chave !== ultimoAviso) {
    ultimoAviso = chave;
    console.log(motivo === 'limite_diario'
      ? `🛡️ [Disparos] Limite de ${limiteDiario()} mensagens por dia atingido — retoma amanhã às ${HORA_INICIO}h`
      : `🛡️ [Disparos] Fora do horário seguro (seg–sáb, ${HORA_INICIO}h–${HORA_FIM}h) — nada é enviado agora`);
  }
  return false;
}
