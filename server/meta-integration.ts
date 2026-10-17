/**
 * Integração Meta (Instagram / Facebook) — Lead Ads
 *
 * Fluxo: Meta dispara webhook `leadgen` → validamos X-Hub-Signature-256 →
 * buscamos o lead na Graph API (GET /{leadgen_id}) → mapeamos os campos do
 * formulário para nome/telefone → ingestLead (origem instagram_ads).
 * A Meta reenvia eventos; o dedupe por metaLeadId fica no ingestLead.
 */

import crypto from 'crypto';
import { normalizePhoneBR, type LeadIntakeInput, type LeadIntakeResult } from './lead-intake';
import { bomJardimsFromMeta, isBomJardimsName, type MetaDisclaimerResponse } from './bom-jardims';

export const DEFAULT_GRAPH_VERSION = 'v26.0';

// ─── Assinatura do webhook ───────────────────────────────────────────────────
/**
 * Valida o cabeçalho X-Hub-Signature-256 ("sha256=<hex>") — HMAC-SHA256 do
 * corpo cru da requisição com o App Secret. Precisa do corpo exatamente como
 * chegou: JSON.stringify do body parseado não bate com a assinatura da Meta.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | string[] | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || rawBody === undefined) return false;
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header || !header.startsWith('sha256=')) return false;
  const received = header.slice('sha256='.length).trim().toLowerCase();
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}

// ─── Verificação do webhook (GET) ────────────────────────────────────────────
/**
 * Handshake da Meta ao cadastrar o webhook: devolve o hub.challenge quando
 * hub.mode=subscribe e hub.verify_token confere; null caso contrário.
 */
export function verifyMetaWebhook(query: Record<string, unknown>, verifyToken: string): string | null {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (!verifyToken) return null;
  if (mode !== 'subscribe' || typeof token !== 'string' || typeof challenge !== 'string') return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return challenge;
}

// ─── Graph API ───────────────────────────────────────────────────────────────
export interface MetaLeadField { name: string; values?: string[] }

export interface MetaLead {
  id: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  field_data?: MetaLeadField[];
  /** Caixas de seleção do "aviso personalizado" do formulário (consentimento LGPD) */
  custom_disclaimer_responses?: MetaDisclaimerResponse[];
}

type FetchFn = typeof fetch;

export interface GraphOptions {
  accessToken: string;
  graphVersion?: string;
  fetchImpl?: FetchFn;
}

async function graphGet<T>(path: string, fields: string, opts: GraphOptions): Promise<T> {
  if (!opts.accessToken) throw new Error('META_PAGE_ACCESS_TOKEN não configurado');
  const version = opts.graphVersion || DEFAULT_GRAPH_VERSION;
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(path)}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', opts.accessToken);
  const res = await (opts.fetchImpl ?? fetch)(url.toString());
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new Error(`Graph API ${res.status}: ${body?.error?.message || 'erro desconhecido'}`);
  }
  return body as T;
}

export function fetchMetaLead(leadgenId: string, opts: GraphOptions): Promise<MetaLead> {
  return graphGet<MetaLead>(
    leadgenId,
    'id,created_time,ad_id,ad_name,adset_name,campaign_name,form_id,platform,field_data,custom_disclaimer_responses',
    opts,
  );
}

/** Nome do formulário (não vem no lead). Falha aqui não pode derrubar o lead. */
export async function fetchMetaFormName(formId: string, opts: GraphOptions): Promise<string | undefined> {
  try {
    const form = await graphGet<{ name?: string }>(formId, 'name', opts);
    return form.name || undefined;
  } catch (e: any) {
    console.warn(`[Meta] Nome do formulário ${formId} não obtido:`, e?.message);
    return undefined;
  }
}

// ─── Mapeamento dos campos do formulário ─────────────────────────────────────
/** "Número do WhatsApp" → "numero_do_whatsapp" */
function normalizeKey(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const NAME_KEYS = ['full_name', 'nome_completo', 'nome', 'name', 'seu_nome', 'qual_e_o_seu_nome'];
// WhatsApp primeiro: se o formulário pergunta o WhatsApp, é o número que o bot deve usar
const PHONE_KEY_PATTERNS = [/whats|zap/, /^phone_number$/, /celular/, /telefone|fone/, /phone/];

export interface MappedLeadFields {
  nome?: string;
  phone?: string;
  email?: string;
  /** Demais perguntas do formulário (múltipla escolha, cidade...) pela chave normalizada */
  extras: Record<string, string>;
}

export function mapLeadFields(fieldData: MetaLeadField[] = []): MappedLeadFields {
  const byKey = new Map<string, string>();
  for (const f of fieldData) {
    const value = (f?.values ?? []).map(v => String(v ?? '').trim()).find(Boolean);
    if (f?.name && value) byKey.set(normalizeKey(f.name), value);
  }

  let nome = NAME_KEYS.map(k => byKey.get(k)).find(Boolean);
  if (!nome) {
    const parts = [byKey.get('first_name'), byKey.get('last_name')].filter(Boolean);
    if (parts.length) nome = parts.join(' ');
  }

  // Candidatos em ordem de prioridade; fica com o primeiro que for celular BR válido
  const keys = Array.from(byKey.keys());
  const candidates: string[] = [];
  for (const pattern of PHONE_KEY_PATTERNS) {
    for (const k of keys) {
      const v = byKey.get(k)!;
      if (pattern.test(k) && !candidates.includes(v)) candidates.push(v);
    }
  }
  const phone = candidates.find(c => normalizePhoneBR(c)) ?? candidates[0];

  const used = new Set([...NAME_KEYS, 'first_name', 'last_name', 'email']);
  const extras: Record<string, string> = {};
  for (const [k, v] of Array.from(byKey.entries())) {
    if (!used.has(k) && !PHONE_KEY_PATTERNS.some(p => p.test(k))) extras[k] = v;
  }

  return { nome, phone, email: byKey.get('email'), extras };
}

// ─── Processamento do evento ─────────────────────────────────────────────────
export interface LeadgenEvent {
  leadgenId: string;
  formId?: string;
  adId?: string;
  pageId?: string;
}

/** Extrai os eventos `leadgen` do corpo do webhook (object=page) */
export function extractLeadgenEvents(body: any): LeadgenEvent[] {
  if (body?.object !== 'page' || !Array.isArray(body?.entry)) return [];
  const events: LeadgenEvent[] = [];
  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'leadgen' || !change?.value?.leadgen_id) continue;
      const v = change.value;
      events.push({
        leadgenId: String(v.leadgen_id),
        formId: v.form_id ? String(v.form_id) : undefined,
        adId: v.ad_id ? String(v.ad_id) : undefined,
        pageId: v.page_id ? String(v.page_id) : entry?.id ? String(entry.id) : undefined,
      });
    }
  }
  return events;
}

export type LeadgenOutcome =
  | { leadgenId: string; status: 'ingested'; result: LeadIntakeResult }
  | { leadgenId: string; status: 'missing_phone' }
  | { leadgenId: string; status: 'fetch_error'; error: string };

export interface ProcessLeadgenDeps extends GraphOptions {
  ingest: (input: LeadIntakeInput) => Promise<LeadIntakeResult>;
}

export async function processLeadgenEvent(event: LeadgenEvent, deps: ProcessLeadgenDeps): Promise<LeadgenOutcome> {
  let lead: MetaLead;
  try {
    lead = await fetchMetaLead(event.leadgenId, deps);
  } catch (e: any) {
    console.error(`[Meta] Falha ao buscar lead ${event.leadgenId}:`, e?.message);
    return { leadgenId: event.leadgenId, status: 'fetch_error', error: String(e?.message || e) };
  }

  const fields = mapLeadFields(lead.field_data);
  if (!fields.phone) {
    console.warn(`[Meta] Lead ${event.leadgenId} sem telefone no formulário — ignorado`);
    return { leadgenId: event.leadgenId, status: 'missing_phone' };
  }

  const formId = lead.form_id || event.formId;
  const adNames = [lead.ad_name, lead.adset_name, lead.campaign_name];
  // Nome do formulário: sem nome de anúncio, ou para reconhecer o empreendimento pelo formulário
  const formName = formId && (!lead.ad_name || !adNames.some(isBomJardimsName))
    ? await fetchMetaFormName(formId, deps)
    : undefined;
  const campanha = lead.ad_name || formName || lead.campaign_name || undefined;
  const nome = fields.nome || 'Lead Instagram';

  // Empreendimento com roteiro próprio: sem preço, atendimento humano, consentimento LGPD
  const empreendimento = [...adNames, formName].some(isBomJardimsName)
    ? bomJardimsFromMeta({
      nome,
      extras: fields.extras,
      email: fields.email,
      disclaimers: lead.custom_disclaimer_responses,
      createdTime: lead.created_time,
      formLabel: `formulário ${formName || formId || '?'}${lead.ad_name ? ` / anúncio ${lead.ad_name}` : ''}`,
    })
    : {};

  const result = await deps.ingest({
    nome,
    phone: fields.phone,
    origem: 'instagram_ads',
    metaLeadId: lead.id || event.leadgenId,
    campanha,
    ...empreendimento,
  });
  console.log(`[Meta] Lead ${event.leadgenId} → ${result.ok ? (result.created ? 'novo' : 'atualizado') : result.reason}`);
  return { leadgenId: event.leadgenId, status: 'ingested', result };
}

export async function processMetaWebhook(body: any, deps: ProcessLeadgenDeps): Promise<LeadgenOutcome[]> {
  const outcomes: LeadgenOutcome[] = [];
  for (const event of extractLeadgenEvents(body)) {
    outcomes.push(await processLeadgenEvent(event, deps));
  }
  return outcomes;
}
