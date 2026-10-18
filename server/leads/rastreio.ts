/**
 * Rastreio comportamental (§6.4) e QR de placa (§6.5).
 *
 * - Beacon POST /t: eventos da landing /i/:codigo, só depois do aceite de cookies
 *   (o navegador nem cria o cookie rmt_vid sem o aceite).
 * - Vínculo visitante → lead: no envio do formulário (mesmo rmt_vid) ou quando a
 *   mensagem do WhatsApp chega em até 30 min de um clique no botão do mesmo imóvel,
 *   com um único visitante candidato nessa janela.
 * - Sinais para o score: mídia vista, tempo na página, sessões em dias diferentes.
 */
import { z } from 'zod';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';

export const TIPOS_EVENTO = [
  'view_imovel', 'view_galeria', 'play_video', 'view_planta', 'view_mapa',
  'tempo_pagina', 'clique_whatsapp', 'submit_form', 'scan_qr',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const eventoSchema = z.object({
  vid: z.string().regex(UUID, 'visitante inválido'),
  tipo: z.enum(TIPOS_EVENTO),
  codigo: z.string().regex(/^IMV-\d{4}$/i).optional(),
  campanha: z.string().trim().max(20).optional(),
  // tempo_pagina manda segundos acumulados na visita (máx. 5 min)
  segundos: z.number().int().min(0).max(300).optional(),
  utm: z.record(z.string().max(40), z.string().max(120)).optional(),
});
export type EventoInput = z.infer<typeof eventoSchema>;

/** Sinais do lead para o score (regra pura a partir dos eventos) */
export function sinaisDosEventos(eventos: { tipo: string; dados?: any; createdAt: Date | string; visitanteId?: string | null }[]) {
  const sinais = new Set(eventos.map(e => e.tipo));
  // tempo_pagina guarda o acumulado da visita: soma o maior valor de cada dia/visitante
  const maxPorVisita = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== 'tempo_pagina') continue;
    const dia = new Date(e.createdAt).toISOString().slice(0, 10);
    const k = `${e.visitanteId || '-'}|${dia}`;
    maxPorVisita.set(k, Math.max(maxPorVisita.get(k) ?? 0, Number(e.dados?.segundos) || 0));
  }
  const tempoPaginaS = Array.from(maxPorVisita.values()).reduce((a, b) => a + b, 0);
  const dias = new Set(eventos.filter(e => e.tipo === 'view_imovel').map(e => new Date(e.createdAt).toISOString().slice(0, 10)));
  return { sinais, tempoPaginaS, sessoesDias: dias.size };
}

/** Janela de 30 min: único visitante que clicou no WhatsApp do imóvel → vincula */
export function visitanteUnico(cliques: { visitanteId: string | null }[]): string | null {
  const ids = Array.from(new Set(cliques.map(c => c.visitanteId).filter((v): v is string => !!v)));
  return ids.length === 1 ? ids[0] : null;
}

async function db() {
  const { getDb } = await import('../db');
  return getDb();
}

export async function registrarEvento(ev: EventoInput): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  const { leadEventos, properties, leadCampanhas } = await import('../../drizzle/schema');
  const [imovel] = ev.codigo
    ? await d.select({ id: properties.id }).from(properties).where(eq(properties.codigo, ev.codigo.toUpperCase())).limit(1)
    : [];
  const [camp] = ev.campanha
    ? await d.select({ id: leadCampanhas.id }).from(leadCampanhas).where(eq(leadCampanhas.codigo, ev.campanha.toUpperCase())).limit(1)
    : [];
  // Visitante já vinculado a um lead: o evento já entra no lead
  const [anterior] = await d.select({ leadId: leadEventos.leadId }).from(leadEventos)
    .where(and(eq(leadEventos.visitanteId, ev.vid))).limit(1);
  await d.insert(leadEventos).values({
    leadId: anterior?.leadId ?? null,
    visitanteId: ev.vid,
    tipo: ev.tipo,
    propertyId: imovel?.id ?? null,
    campanhaId: camp?.id ?? null,
    dados: { ...(ev.segundos !== undefined ? { segundos: ev.segundos } : {}), ...(ev.utm ? { utm: ev.utm } : {}) },
  } as any);
  // Só os eventos que mudam o score (tempo_pagina chega a cada 15 s: recalcula ao bater 2 min)
  const mudaScore = ev.tipo === 'play_video' || ev.tipo === 'view_planta' || ev.tipo === 'view_imovel' || (ev.tipo === 'tempo_pagina' && ev.segundos === 120);
  if (anterior?.leadId && mudaScore) {
    const { recalcularScoreLead } = await import('./scoreService');
    await recalcularScoreLead(anterior.leadId, { motivo: `evento_${ev.tipo}` }).catch(() => {});
  }
  return true;
}

/** Liga os eventos anônimos do visitante ao lead e recalcula o score */
export async function vincularVisitante(visitanteId: string, leadId: number): Promise<number> {
  const d = await db();
  if (!d || !UUID.test(visitanteId)) return 0;
  const { leadEventos } = await import('../../drizzle/schema');
  const r: any = await d.update(leadEventos).set({ leadId } as any)
    .where(and(eq(leadEventos.visitanteId, visitanteId), isNull(leadEventos.leadId)));
  const n = Number(r?.[0]?.affectedRows ?? r?.changes ?? 0);
  if (n) {
    const { recalcularScoreLead } = await import('./scoreService');
    await recalcularScoreLead(leadId, { motivo: 'vinculo_visitante' }).catch(() => {});
  }
  return n;
}

/** Mensagem do WhatsApp chegou: tenta achar o visitante que clicou no botão (30 min) */
export async function vincularPorCliqueWhatsApp(leadId: number, propertyIds: number[], now = new Date()): Promise<string | null> {
  if (!propertyIds.length) return null;
  const d = await db();
  if (!d) return null;
  const { leadEventos } = await import('../../drizzle/schema');
  const cliques = await d.select({ visitanteId: leadEventos.visitanteId }).from(leadEventos).where(and(
    eq(leadEventos.tipo, 'clique_whatsapp'),
    inArray(leadEventos.propertyId, propertyIds),
    isNull(leadEventos.leadId),
    gte(leadEventos.createdAt, new Date(now.getTime() - 30 * 60_000)),
  ));
  const vid = visitanteUnico(cliques);
  if (vid) await vincularVisitante(vid, leadId);
  return vid;
}

/** Eventos do lead para o score */
export async function sinaisDoLead(leadId: number) {
  const d = await db();
  if (!d) return { sinais: new Set<string>(), tempoPaginaS: 0, sessoesDias: 0 };
  const { leadEventos } = await import('../../drizzle/schema');
  const evs = await d.select({ tipo: leadEventos.tipo, dados: leadEventos.dados, createdAt: leadEventos.createdAt, visitanteId: leadEventos.visitanteId })
    .from(leadEventos).where(eq(leadEventos.leadId, leadId));
  return sinaisDosEventos(evs as any);
}

/** QR da placa: garante a campanha PLACA-IMV-xxxx e registra o scan */
export async function registrarScanQr(codigo: string, visitanteId?: string | null): Promise<{ imovelCodigo: string; campanhaCodigo: string } | null> {
  const d = await db();
  if (!d) return null;
  const { properties, leadCampanhas, leadEventos } = await import('../../drizzle/schema');
  const cod = codigo.toUpperCase();
  const [imovel] = await d.select({ id: properties.id, codigo: properties.codigo, titulo: properties.denomination })
    .from(properties).where(eq(properties.codigo, cod)).limit(1);
  if (!imovel) return null;
  const campanhaCodigo = `PLACA-${cod}`;
  let [camp] = await d.select({ id: leadCampanhas.id }).from(leadCampanhas).where(eq(leadCampanhas.codigo, campanhaCodigo)).limit(1);
  if (!camp) {
    await d.insert(leadCampanhas).values({ codigo: campanhaCodigo, nome: `Placa — ${imovel.titulo}`, canal: 'placa_qr', funil: 'comprador', propertyId: imovel.id } as any).catch(() => {});
    [camp] = await d.select({ id: leadCampanhas.id }).from(leadCampanhas).where(eq(leadCampanhas.codigo, campanhaCodigo)).limit(1);
  }
  await d.insert(leadEventos).values({
    visitanteId: visitanteId && UUID.test(visitanteId) ? visitanteId : null,
    tipo: 'scan_qr', propertyId: imovel.id, campanhaId: camp?.id ?? null, dados: {},
  } as any).catch(() => {});
  return { imovelCodigo: cod, campanhaCodigo };
}
