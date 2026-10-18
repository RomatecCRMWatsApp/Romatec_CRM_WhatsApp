/**
 * Entrada única de leads de captação
 * Usada por todas as portas: landing do lote (bio do Instagram), Meta Lead Ads, Direct.
 *
 * Fluxo: normaliza telefone → dedupe → grava contato + lead → 1ª mensagem
 * no WhatsApp (Z-API) → avisa corretor no Telegram.
 * Depois disso o lead cai no fluxo normal do bot (processBotMessage carrega
 * o estado do banco quando ele responder).
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db';
import { contacts, leadQualifications, properties, leadCampanhas, leadInteresses } from '../drizzle/schema';
import { mesclarSlots, slotsDeRespostas } from './leads/slots';
import { isLeadBlocked } from './lead-persistence';

export const LEAD_ORIGENS = ['instagram_ads', 'instagram_dm', 'instagram_bio', 'google_ads', 'site', 'indicacao', 'whatsapp', 'whatsapp_empreendimento'] as const;
export type LeadOrigem = typeof LEAD_ORIGENS[number];

export interface LeadIntakeInput {
  nome: string;
  phone: string;
  origem: LeadOrigem;
  campanha?: string;
  propertyId?: number;
  metaLeadId?: string;
  instagramUserId?: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string };
  /** Lead de empreendimento (ex.: bom-jardims): roteiro próprio, atendimento humano, sem bot genérico */
  empreendimentoSlug?: string;
  loteCodigo?: string;
  leadScore?: number;
  consentimento?: { at: string; texto: string; origem: string; ip?: string };
  /** Respostas extras do formulário (finalidade, prazo, pagamento, cidade, email...) */
  answers?: Record<string, string>;
  /** Substitui a mensagem genérica de boas-vindas */
  welcomeMessage?: string;
  /** form_id do Meta Lead Ads → campanha cadastrada (leadCampanhas.metaFormId) */
  metaFormId?: string;
  funil?: 'comprador' | 'proprietario';
}

/** Canal de atribuição (leadCampanhas.canal) a partir da origem do lead */
export function canalDaOrigem(origem: LeadOrigem): string {
  const map: Record<string, string> = {
    instagram_ads: 'meta_leadads', instagram_dm: 'instagram_organico', instagram_bio: 'instagram_organico',
    google_ads: 'google_ads', site: 'site', indicacao: 'indicacao', whatsapp: 'whatsapp_direto',
    whatsapp_empreendimento: 'whatsapp_direto',
  };
  return map[origem] || 'outro';
}

export type LeadIntakeResult =
  | { ok: true; created: boolean; messageSent: boolean; phone: string }
  | { ok: false; reason: 'invalid_phone' | 'duplicate' | 'blocked' | 'db_unavailable' };

/** Lead que já conversou há menos que isso não recebe nova abordagem (evita spam) */
const REENGAGE_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * Normaliza celular BR para o formato que o webhook Z-API entrega: 55 + DDD + 9 + 8 dígitos.
 * Aceita "(99) 9 9181-1246", "099991811246", "+55 99 99181-1246", número antigo sem o 9.
 * Retorna null se não for celular brasileiro válido.
 */
export function normalizePhoneBR(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  // Celular antigo sem o 9: 55 + DDD + 8 dígitos começando em 6-9 (fixo começa em 2-5)
  if (d.length === 12 && d.startsWith('55') && /[6-9]/.test(d[4])) d = d.slice(0, 4) + '9' + d.slice(4);
  if (d.length !== 13 || !d.startsWith('55') || d[4] !== '9') return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

function firstName(nome: string): string {
  const f = nome.trim().split(/\s+/)[0] || 'tudo bem';
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
}

export function buildWelcomeMessage(nome: string, imovel?: string): string {
  const interesse = imovel ? `no *${imovel}*` : 'em nossos lotes e chácaras';
  return [
    `Olá, *${firstName(nome)}*! 👋`,
    ``,
    `Aqui é da *Romatec Imóveis*. Recebemos seu interesse ${interesse} 🏡`,
    ``,
    `Posso te passar valores, condições de pagamento e agendar uma visita. Podemos conversar por aqui?`,
  ].join('\n');
}

// ─── Formulário público (landing do lote / link da bio) ──────────────────────
const utmField = z.string().trim().max(100).optional();

export const publicLeadSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  phone: z.string().trim().min(8).max(25),
  propertyId: z.coerce.number().int().positive().optional(),
  consent: z.literal(true, { message: 'É preciso aceitar o contato' }),
  utm: z.object({ source: utmField, medium: utmField, campaign: utmField, content: utmField }).optional(),
  // Honeypot: campo invisível no formulário. Robô preenche, humano não.
  website: z.string().max(500).optional(),
});

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

/** Origem a partir das UTMs (padrão: utm_source = meta | google | whatsapp | indicacao | organico | instagram) */
export function origemFromUtm(utm?: PublicLeadInput['utm']): LeadOrigem {
  const src = (utm?.source || '').toLowerCase();
  const medium = (utm?.medium || '').toLowerCase();
  if (src === 'meta' && (medium === 'cpc' || medium === 'lead_ads')) return 'instagram_ads';
  if (src === 'google') return 'google_ads';
  if (src === 'indicacao') return 'indicacao';
  if (src === 'whatsapp') return 'whatsapp';
  if (src.includes('instagram') || src === 'ig' || src === 'meta' || src === 'organico') return 'instagram_bio';
  if (src.includes('facebook') || src === 'fb') return 'instagram_bio';
  return 'site';
}

// ─── Ingestão ────────────────────────────────────────────────────────────────
export async function ingestLead(input: LeadIntakeInput): Promise<LeadIntakeResult> {
  const phone = normalizePhoneBR(input.phone);
  if (!phone) return { ok: false, reason: 'invalid_phone' };

  const db = await getDb();
  if (!db) return { ok: false, reason: 'db_unavailable' };

  const nome = input.nome.trim();
  const now = new Date();

  // Webhook da Meta reenvia o mesmo evento — um leadgen id vira um lead só
  if (input.metaLeadId) {
    const dup = await db.select({ id: leadQualifications.id }).from(leadQualifications)
      .where(eq(leadQualifications.metaLeadId, input.metaLeadId)).limit(1);
    if (dup[0]) return { ok: false, reason: 'duplicate' };
  }

  if (await isLeadBlocked(phone)) return { ok: false, reason: 'blocked' };

  let imovel: string | undefined;
  let imovelInfo: { codigo: string | null; preco: number | null } | undefined;
  if (input.propertyId) {
    const prop = await db.select({ denomination: properties.denomination, codigo: properties.codigo, price: properties.price, exibirPreco: properties.exibirPreco })
      .from(properties).where(eq(properties.id, input.propertyId)).limit(1);
    imovel = prop[0]?.denomination;
    if (prop[0]) imovelInfo = { codigo: prop[0].codigo, preco: prop[0].exibirPreco === false ? null : Number(prop[0].price) || null };
  }

  // Campanha cadastrada pelo form_id do Meta Lead Ads
  const [campanhaCad] = input.metaFormId
    ? await db.select().from(leadCampanhas).where(eq(leadCampanhas.metaFormId, input.metaFormId)).limit(1)
    : [];
  const canal = campanhaCad?.canal || canalDaOrigem(input.origem);
  const funil = input.funil || (campanhaCad?.funil as 'comprador' | 'proprietario') || 'comprador';

  // Contato (tabela usada por campanhas e pelo webhook pra achar o nome)
  let contactId: number | undefined;
  const existingContact = await db.select({ id: contacts.id }).from(contacts)
    .where(eq(contacts.phone, phone)).limit(1);
  if (existingContact[0]) {
    contactId = existingContact[0].id;
  } else {
    try {
      // Lead de empreendimento consentiu só com contato sobre aquele empreendimento:
      // fica 'inactive' para não ser sorteado nas campanhas de outros imóveis (que citam preço)
      const inserted = await db.insert(contacts).values({
        name: nome,
        phone,
        ...(input.empreendimentoSlug ? { status: 'inactive' as const } : {}),
      });
      contactId = Number(inserted?.[0]?.insertId ?? inserted?.lastInsertRowid) || undefined;
    } catch (e: any) {
      console.warn('[LeadIntake] Contato não inserido (não crítico):', e?.message);
    }
  }

  const campanha = campanhaCad?.nome || input.campanha || input.utm?.campaign || imovel;
  const existingLead = await db.select().from(leadQualifications)
    .where(eq(leadQualifications.phone, phone)).limit(1);
  const lead = existingLead[0];
  // Respostas do formulário que batem com o enum viram slots (fonte form)
  const { slots } = mesclarSlots((lead?.funil as any) || funil, lead?.slots as any, slotsDeRespostas(input.answers), 'form', now);

  let shouldMessage: boolean;
  if (lead) {
    // Lead que volta por outro anúncio: atualiza origem/interesse sem perder a etapa da qualificação
    const lastActivity = lead.lastActivityAt ? new Date(lead.lastActivityAt).getTime() : 0;
    shouldMessage = now.getTime() - lastActivity > REENGAGE_AFTER_MS;
    await db.update(leadQualifications).set({
      origem: input.origem,
      ...(campanha ? { campanhaOrigem: campanha } : {}),
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      ...(input.metaLeadId ? { metaLeadId: input.metaLeadId } : {}),
      ...(input.instagramUserId ? { instagramUserId: input.instagramUserId } : {}),
      ...(input.utm ? { utm: input.utm } : {}),
      ...(input.empreendimentoSlug ? { empreendimentoSlug: input.empreendimentoSlug } : {}),
      ...(input.loteCodigo ? { loteCodigo: input.loteCodigo } : {}),
      ...(input.leadScore !== undefined ? { leadScore: input.leadScore } : {}),
      ...(input.consentimento ? { consentimento: input.consentimento } : {}),
      ...(input.answers ? { answers: { ...((lead.answers as any) || {}), ...input.answers } } : {}),
      ...(lead.nome ? {} : { nome }),
      // 1º toque fica; último toque e slots do formulário atualizam
      ...(lead.origemCanal ? {} : { origemCanal: canal, origemCampanhaId: campanhaCad?.id ?? null }),
      ultimoCanal: canal,
      ...(campanhaCad ? { ultimaCampanhaId: campanhaCad.id } : {}),
      slots,
      ...(shouldMessage ? { stage: input.empreendimentoSlug ? 'novo_lead' : 'abordagem_enviada', lastActivityAt: now } : {}),
      updatedAt: now,
    }).where(eq(leadQualifications.phone, phone));
  } else {
    shouldMessage = true;
    await db.insert(leadQualifications).values({
      phone,
      contactId,
      nome,
      answers: { nome, ...(input.answers || {}) } as any,
      // Lead de empreendimento segue o funil próprio (novo_lead → contato_feito → ...), fora do bot genérico
      stage: input.empreendimentoSlug ? 'novo_lead' : 'abordagem_enviada',
      score: 'frio',
      origem: input.origem,
      campanhaOrigem: campanha || null,
      propertyId: input.propertyId ?? null,
      metaLeadId: input.metaLeadId ?? null,
      instagramUserId: input.instagramUserId ?? null,
      utm: input.utm ?? null,
      empreendimentoSlug: input.empreendimentoSlug ?? null,
      loteCodigo: input.loteCodigo ?? null,
      leadScore: input.leadScore ?? null,
      consentimento: input.consentimento ?? null,
      funil,
      origemCanal: canal,
      origemCampanhaId: campanhaCad?.id ?? null,
      ultimoCanal: canal,
      ultimaCampanhaId: campanhaCad?.id ?? null,
      slots,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    } as any);
  }

  console.log(`[LeadIntake] ${lead ? 'Atualizado' : 'Novo'} lead ${phone} origem=${input.origem} imovel=${imovel || '-'}`);

  let messageSent = false;
  if (shouldMessage) {
    messageSent = await sendWelcome(phone, input.welcomeMessage ?? buildWelcomeMessage(nome, imovel), {
      // Lead de empreendimento não entra no follow-up genérico do bot
      registerFollowUp: !input.empreendimentoSlug,
      nome,
    });
  }

  // Interesse lead × imóvel (para o lead recorrente com outro imóvel)
  const [leadRow] = await db.select({ id: leadQualifications.id }).from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
  if (leadRow && input.propertyId) {
    await db.insert(leadInteresses).values({ leadId: leadRow.id, propertyId: input.propertyId, campanhaId: campanhaCad?.id ?? null }).catch(() => {});
  }

  // Aviso ao José pelos canais configurados (NOTIFY_CANAIS; padrão Telegram)
  try {
    const { notificarLead } = await import('./leads/notificacao');
    const { rotuloCanal } = await import('./leads/inbound');
    const titulo = input.loteCodigo ? `${imovel || input.empreendimentoSlug} — chácara ${input.loteCodigo}` : (imovel || input.empreendimentoSlug);
    const quentePorEmpreendimento = input.empreendimentoSlug && (input.leadScore ?? 0) >= 60;
    const score = input.leadScore ?? null;
    const classe = score === null ? null : quentePorEmpreendimento || score >= 70 ? 'quente' : score >= 40 ? 'morno' : 'frio';
    await notificarLead({
      tipo: lead ? 'recorrente' : 'novo_lead',
      leadId: leadRow?.id ?? 0,
      nome,
      telefone: phone,
      funil,
      score,
      classe,
      // Empreendimento sem preço público (Bom Jardims): nunca mostra valor
      imovel: titulo ? { codigo: imovelInfo?.codigo ?? null, titulo, preco: input.empreendimentoSlug ? null : imovelInfo?.preco ?? null } : null,
      origem: rotuloCanal(canal),
      campanhaCodigo: campanhaCad?.codigo ?? null,
      detalhes: [
        ...(campanha && !campanhaCad ? [`📢 Campanha: ${campanha}`] : []),
        ...Object.entries(input.answers || {}).filter(([k, v]) => v && k !== 'nome').map(([k, v]) => `📝 ${k}: ${v}`),
        messageSent || !shouldMessage ? '🤖 1ª mensagem enviada no WhatsApp' : '⚠️ 1ª mensagem NÃO saiu no WhatsApp — contate manualmente',
      ],
    });
  } catch (e) {
    console.warn('[LeadIntake] Aviso falhou (não crítico):', e);
  }

  return { ok: true, created: !lead, messageSent, phone };
}

async function sendWelcome(phone: string, message: string, opts: { registerFollowUp: boolean; nome: string }): Promise<boolean> {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  if (!instanceId || !token) {
    console.error('[LeadIntake] Credenciais Z-API não encontradas no env — 1ª mensagem não enviada');
    return false;
  }
  try {
    const { sendMessageViaZAPI } = await import('./zapi-integration');
    const result = await sendMessageViaZAPI({
      instanceId,
      token,
      clientToken: process.env.ZAPI_CLIENT_TOKEN || undefined,
      phone,
      message,
    });
    if (!result.success) {
      console.error(`[LeadIntake] ❌ Falha ao enviar 1ª mensagem para ${phone}: ${result.error}`);
      return false;
    }
    // Liga o follow-up automático e deixa o bot esperando a resposta na etapa de abordagem
    if (opts.registerFollowUp) {
      const { registerBotMessage } = await import('./bot-ai');
      registerBotMessage(phone, opts.nome);
    }
    return true;
  } catch (e) {
    console.error('[LeadIntake] Erro ao enviar 1ª mensagem:', e);
    return false;
  }
}

// ─── Rate limit do formulário público (em memória, por IP) ───────────────────
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number = Date.now()): boolean => {
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    // Limpeza simples pra não crescer sem limite
    if (hits.size > 5000) {
      for (const [k, ts] of Array.from(hits.entries())) {
        if (ts.every(t => now - t >= windowMs)) hits.delete(k);
      }
    }
    return true;
  };
}
