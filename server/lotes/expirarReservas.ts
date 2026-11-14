/**
 * Motor das reservas: toda chácara "reservado" é liberada sozinha 24 h depois da reserva, venha de onde vier
 * (contrato novo, mudança manual no controle de lotes, escritório). Conta de reservadoAte; reserva antiga sem prazo
 * conta da data da situação. Contrato já assinado não é reserva: a chácara fica. O contrato ainda não assinado continua
 * existindo, mas perde a chácara: para ativar, ela precisa estar livre (ou com ele) — ver registrarAssinado.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { contratos, loteHistorico, lotes } from '../../drizzle/schema';
import { HORAS_RESERVA_LOTE, statusPublicoDe } from '../../shared/lotes';

const H = 3_600_000;
/** Contrato nestas situações já é venda: a chácara não volta para a vitrine */
const CONTRATO_FIRME = ['assinado', 'ativo', 'quitado'];

/** Momento em que a reserva vence (null = não é reserva) */
export function venceEm(l: { situacao?: string | null; reservadoAte?: Date | string | null; dataSituacao?: Date | string | null }): number | null {
  if (l.situacao !== 'reservado') return null;
  if (l.reservadoAte) return new Date(l.reservadoAte).getTime();
  if (l.dataSituacao) return new Date(l.dataSituacao).getTime() + HORAS_RESERVA_LOTE * H;
  return null;
}

/** Libera as reservas vencidas. Devolve os códigos liberados. */
export async function expirarReservas(agora = Date.now()): Promise<string[]> {
  const d = (await getDb()) as any;
  if (!d) return [];
  const rows: any[] = await d.select().from(lotes).where(eq(lotes.situacao, 'reservado'));
  const vencidas = rows.filter(l => { const v = venceEm(l); return v != null && v <= agora; });
  if (!vencidas.length) return [];
  const cIds = Array.from(new Set(vencidas.map(l => l.contratoReservaId).filter(Boolean))) as number[];
  const cs: any[] = cIds.length ? await d.select({ id: contratos.id, numero: contratos.numero, status: contratos.status }).from(contratos).where(inArray(contratos.id, cIds)) : [];
  const C = new Map(cs.map(c => [Number(c.id), c]));
  const liberadas: string[] = [];
  for (const l of vencidas) {
    const c = l.contratoReservaId ? C.get(Number(l.contratoReservaId)) : null;
    if (c && CONTRATO_FIRME.includes(String(c.status))) continue;
    const quando = new Date(agora);
    // Só libera se ninguém mexeu na chácara entre a leitura e agora
    const r: any = await d.update(lotes).set({
      situacao: 'disponivel', status: statusPublicoDe('disponivel'), comercializavel: true, contratoReservaId: null, reservadoAte: null,
      leadId: null, corretorId: null, clienteNome: null, valorVenda: null, valorEntrada: null, numParcelas: null, dataSituacao: quando, updatedAt: quando,
    } as any).where(and(eq(lotes.id, l.id), eq(lotes.situacao, 'reservado')));
    const n = Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? r?.rowsAffected ?? 1);
    if (n !== 1) continue;
    await d.insert(loteHistorico).values({
      loteId: l.id, de: 'reservado', para: 'disponivel', leadId: l.leadId ?? null, corretorId: l.corretorId ?? null, usuarioId: null,
      detalhe: `Reserva de ${HORAS_RESERVA_LOTE} h vencida: chácara liberada automaticamente${c ? ` (contrato ${c.numero} sem assinatura)` : ''}`, createdAt: quando,
    } as any).catch(() => undefined);
    liberadas.push(String(l.codigo));
    import('./filaEspera').then(F => F.avisarProximoDaFila(l.id)).catch((e: any) => console.warn('[Reservas] fila de espera:', e?.message ?? e));
  }
  if (liberadas.length) console.log(`[Reservas] ${liberadas.length} reserva(s) vencida(s) liberada(s): ${liberadas.join(', ')}`);
  return liberadas;
}

let timer: NodeJS.Timeout | null = null;
/** Liga o motor: confere a cada 5 minutos */
export function iniciarMotorReservas(intervaloMs = 5 * 60_000): void {
  if (timer) return;
  const rodar = () => { expirarReservas().catch((e: any) => console.warn('[Reservas] motor:', e?.message ?? e)); };
  setTimeout(rodar, 30_000).unref();
  timer = setInterval(rodar, intervaloMs);
  timer.unref();
}
