/**
 * "Sincronizar com o Asaas" (portado do ZAYRA): para cada cobrança em aberto que tem boleto no Asaas, consulta a situação
 * lá e, se mudou, aplica como se o webhook tivesse chegado — o mesmo processarEventoAsaas (baixa, recibo, vencida,
 * cancelada, estornada). Serve para quando um aviso do webhook não chegou (fila interrompida, fora do ar).
 */
import { and, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas } from '../../drizzle/schema';
import { configAsaas, obterCobranca } from './asaas';
import { processarEventoAsaas, slugDoContrato, type EventoAsaas } from './servico';

/** Situação do Asaas → evento equivalente do webhook (null = nada a fazer) */
export function eventoDaSituacao(status: string | null | undefined): string | null {
  switch (String(status ?? '').toUpperCase()) {
    case 'RECEIVED': return 'PAYMENT_RECEIVED';
    case 'CONFIRMED': return 'PAYMENT_CONFIRMED';
    case 'RECEIVED_IN_CASH': return 'PAYMENT_RECEIVED_IN_CASH';
    case 'OVERDUE': return 'PAYMENT_OVERDUE';
    case 'DELETED': return 'PAYMENT_DELETED';
    case 'REFUNDED': case 'REFUND_REQUESTED': return 'PAYMENT_REFUNDED';
    case 'CHARGEBACK_REQUESTED': case 'CHARGEBACK_DISPUTE': return 'PAYMENT_CHARGEBACK_REQUESTED';
    default: return null;
  }
}

export async function sincronizarComAsaas(): Promise<{ conferidas: number; pagas: number; vencidas: number; outras: number; erros: number }> {
  const d: any = await getDb();
  if (!d) throw new Error('Banco indisponível');
  const abertas: any[] = await d.select({ id: cobrancas.id, contratoId: cobrancas.contratoId, asaasPaymentId: cobrancas.asaasPaymentId, status: cobrancas.status })
    .from(cobrancas).where(and(isNotNull(cobrancas.asaasPaymentId), inArray(cobrancas.status, ['emitida', 'vencida'])));
  const r = { conferidas: 0, pagas: 0, vencidas: 0, outras: 0, erros: 0 };
  const cfgs = new Map<number, ReturnType<typeof configAsaas>>();
  for (const c of abertas) {
    try {
      if (!cfgs.has(c.contratoId)) cfgs.set(c.contratoId, configAsaas(process.env, await slugDoContrato(c.contratoId)));
      const cfg = cfgs.get(c.contratoId);
      if (!cfg) { r.erros++; continue; }
      const pay = await obterCobranca(cfg, c.asaasPaymentId);
      r.conferidas++;
      const evento = eventoDaSituacao(pay?.status);
      if (!evento || (evento === 'PAYMENT_OVERDUE' && c.status === 'vencida')) continue;
      const ev: EventoAsaas = { id: `sync:${c.asaasPaymentId}:${pay.status}`, event: evento, payment: pay as any };
      const res = await processarEventoAsaas(ev);
      if (res.acao.startsWith('pago')) r.pagas++;
      else if (evento === 'PAYMENT_OVERDUE') r.vencidas++;
      else r.outras++;
    } catch (e: any) {
      r.erros++;
      console.warn(`[Asaas sync] cobrança ${c.id}:`, e?.message);
    }
  }
  return r;
}
