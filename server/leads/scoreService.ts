/**
 * Recalcula e grava o score do lead (§8.3): leadScore + classe (coluna score)
 * + scoreDetalhe; histórico só quando o valor muda; avisa o José quando o
 * lead vira QUENTE ou pede visita/avaliação.
 *
 * Gatilhos: entrada do lead (formulário/Meta/WhatsApp), resposta ao bot,
 * slot editado no painel e o job de inatividade (48 h sem resposta).
 */
import { desc, eq } from 'drizzle-orm';
import { calcularBomJardims, calcularComprador, calcularProprietario, regrasDoLead, type Classe, type ResultadoScore } from './score';
import { valoresSlots, type SlotsLead } from './slots';
import type { TipoAviso } from './notificacao';

const INATIVO_MS = 48 * 3600_000;

/** Quais avisos disparar depois do recálculo (regra pura) */
export function avisosDoRecalculo(params: {
  classeAntes: Classe | null;
  classeDepois: Classe;
  slotsNovos?: Record<string, string>;
  leadNovo?: boolean;
}): TipoAviso[] {
  if (params.leadNovo) return []; // o aviso de lead novo já leva o score
  const avisos: TipoAviso[] = [];
  if (params.classeDepois === 'quente' && params.classeAntes !== 'quente') avisos.push('quente');
  if (params.slotsNovos?.quer_visita === 'sim') avisos.push('visita');
  if (params.slotsNovos?.quer_avaliacao === 'sim') avisos.push('avaliacao');
  return avisos;
}

/** Lead em opt-out (respondeu SAIR) — bloqueio longo gravado pelo bot */
export function emOptout(lead: { blockedUntil?: Date | string | null; discardReason?: string | null }, now = Date.now()): boolean {
  const ate = lead.blockedUntil ? new Date(lead.blockedUntil).getTime() : 0;
  return /opt-?out|sair|parar/i.test(lead.discardReason || '') && ate > now;
}

export interface RecalculoOpts {
  motivo: string;
  /** Slots gravados nesta operação (para avisar visita/avaliação) */
  slotsNovos?: Record<string, string>;
  leadNovo?: boolean;
  notificar?: boolean;
  now?: Date;
}

export async function recalcularScoreLead(leadId: number, opts: RecalculoOpts): Promise<ResultadoScore | null> {
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return null;
  const { leadQualifications, leadScoreHistorico, properties } = await import('../../drizzle/schema');
  const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!lead) return null;

  const now = opts.now ?? new Date();
  const slots = valoresSlots(lead.slots as SlotsLead);
  const optout = emOptout(lead, now.getTime());
  const inativo48h = !!lead.lastActivityAt && now.getTime() - new Date(lead.lastActivityAt).getTime() > INATIVO_MS
    && !['qualificado', 'concluido', 'atendimento_humano', 'descartado'].includes(String(lead.stage));
  const regras = regrasDoLead(lead);

  let r: ResultadoScore;
  if (regras === 'bom_jardims') {
    const { moraPerto } = await import('../bom-jardims');
    const answers = (lead.answers as Record<string, unknown>) || {};
    r = calcularBomJardims({ answers, loteCodigo: lead.loteCodigo, moraPerto: moraPerto(String(answers.cidade || '')), optout });
  } else if (regras === 'proprietario') {
    r = calcularProprietario(slots, { optout, inativo48h });
  } else {
    let precoImovel: number | null = null;
    let temCodigoImovel = false;
    if (lead.propertyId) {
      const [p] = await db.select({ price: properties.price, exibirPreco: properties.exibirPreco, codigo: properties.codigo })
        .from(properties).where(eq(properties.id, lead.propertyId)).limit(1);
      // exibir_preco = false: a regra faixa_valor x preço é ignorada
      if (p && p.exibirPreco !== false) precoImovel = Number(p.price) || null;
      temCodigoImovel = !!p; // chegou com interesse num imóvel específico (código IMV, landing ou formulário)
    }
    r = calcularComprador(slots, { temCodigoImovel, precoImovel, optout, inativo48h });
  }

  const antes = lead.leadScore ?? null;
  const classeAntes = (lead.scoreDetalhe ? lead.score : null) as Classe | null;
  if (antes !== r.score || lead.score !== r.classe || !lead.scoreDetalhe) {
    await db.update(leadQualifications).set({
      leadScore: r.score,
      score: r.classe,
      scoreDetalhe: { regras: r.regras, detalhes: r.detalhes, at: now.toISOString() },
    } as any).where(eq(leadQualifications.id, leadId));
  }
  if (antes !== r.score) {
    await db.insert(leadScoreHistorico).values({
      leadId, score: r.score, classe: r.classe, regras: r.regras, detalhes: r.detalhes, motivo: opts.motivo.slice(0, 60),
    } as any).catch((e: any) => console.warn('[Score] Histórico não gravado:', e?.message));
  }

  if (opts.notificar !== false) {
    const avisos = avisosDoRecalculo({ classeAntes, classeDepois: r.classe, slotsNovos: opts.slotsNovos, leadNovo: opts.leadNovo });
    if (avisos.length) {
      const { notificarLead } = await import('./notificacao');
      const { rotuloCanal } = await import('./inbound');
      const [imovel] = lead.propertyId
        ? await db.select({ codigo: properties.codigo, titulo: properties.denomination, price: properties.price, exibirPreco: properties.exibirPreco })
          .from(properties).where(eq(properties.id, lead.propertyId)).limit(1)
        : [];
      for (const tipo of avisos) {
        await notificarLead({
          tipo, leadId, nome: lead.nome || 'Lead', telefone: lead.phone, funil: (lead.funil as any) || 'comprador',
          score: r.score, classe: r.classe,
          imovel: imovel ? { codigo: imovel.codigo, titulo: imovel.titulo, preco: imovel.exibirPreco === false ? null : Number(imovel.price) || null } : null,
          origem: rotuloCanal(lead.ultimoCanal || lead.origemCanal || lead.origem || 'whatsapp'),
        }).catch(e => console.warn('[Score] Aviso falhou (não crítico):', e?.message));
      }
    }
  }
  return r;
}

export async function recalcularScorePorTelefone(phone: string, opts: RecalculoOpts): Promise<ResultadoScore | null> {
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return null;
  const { leadQualifications } = await import('../../drizzle/schema');
  const [lead] = await db.select({ id: leadQualifications.id }).from(leadQualifications)
    .where(eq(leadQualifications.phone, phone.replace(/\D/g, ''))).limit(1);
  return lead ? recalcularScoreLead(lead.id, opts) : null;
}

export async function historicoScore(leadId: number) {
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return [];
  const { leadScoreHistorico } = await import('../../drizzle/schema');
  return db.select().from(leadScoreHistorico).where(eq(leadScoreHistorico.leadId, leadId)).orderBy(desc(leadScoreHistorico.createdAt)).limit(50);
}

/** Job: leads parados há 48 h perdem pontos (§8.1/8.2). Roda a cada 30 min. */
export async function recalcularInativos(now = new Date()): Promise<number> {
  const { getDb } = await import('../db');
  const db = await getDb();
  if (!db) return 0;
  const { leadQualifications } = await import('../../drizzle/schema');
  const rows = await db.select({ id: leadQualifications.id, lastActivityAt: leadQualifications.lastActivityAt, scoreDetalhe: leadQualifications.scoreDetalhe })
    .from(leadQualifications);
  let n = 0;
  for (const l of rows as any[]) {
    const parado = l.lastActivityAt && now.getTime() - new Date(l.lastActivityAt).getTime() > INATIVO_MS;
    const jaPenalizado = l.scoreDetalhe?.detalhes && 'inatividade' in l.scoreDetalhe.detalhes;
    if (parado && !jaPenalizado && l.scoreDetalhe) {
      await recalcularScoreLead(l.id, { motivo: 'inatividade_48h', now, notificar: false });
      n++;
    }
  }
  return n;
}

let jobIniciado = false;
export function iniciarJobInatividade() {
  if (jobIniciado) return;
  jobIniciado = true;
  setInterval(() => {
    recalcularInativos().then(n => { if (n) console.log(`[Score] ${n} lead(s) parados há 48 h recalculados`); })
      .catch(e => console.warn('[Score] Job de inatividade falhou:', e?.message));
  }, 30 * 60_000).unref?.();
}
