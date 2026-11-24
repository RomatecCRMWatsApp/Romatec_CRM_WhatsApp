/**
 * WhatsApp oficial (WhatsApp Business Platform — Cloud API da Meta).
 *
 * Liga com WHATSAPP_PROVIDER=cloud. Daí em diante todo envio do CRM (robô, retomada, avisos, documentos)
 * sai pela API oficial em vez da Z-API, sem mudar nada nos módulos: o desvio fica no cliente de envio
 * (server/leads/zapiClient.ts). As mensagens que chegam (webhook /api/webhook/whatsapp-cloud) são convertidas
 * para o mesmo formato do webhook da Z-API e seguem o mesmo caminho (robô, leads, caixa de entrada).
 *
 * Regra da Meta: texto livre só até 24 h depois da última mensagem do cliente. Fora dessa janela, só
 * modelo aprovado. Por isso:
 *  - a retomada dos leads importados usa o modelo WHATSAPP_CLOUD_TEMPLATE_RETOMADA ({{1}} = primeiro nome);
 *  - qualquer outro texto recusado por estar fora da janela é reenviado no modelo WHATSAPP_CLOUD_TEMPLATE_PADRAO
 *    ({{1}} = o texto, numa linha só), se ele existir.
 *
 * Variáveis: WHATSAPP_PROVIDER, WHATSAPP_CLOUD_TOKEN, WHATSAPP_CLOUD_PHONE_NUMBER_ID, WHATSAPP_CLOUD_VERIFY_TOKEN,
 * WHATSAPP_CLOUD_APP_SECRET (ou META_APP_SECRET), WHATSAPP_CLOUD_GRAPH_VERSION, WHATSAPP_CLOUD_TEMPLATE_RETOMADA,
 * WHATSAPP_CLOUD_TEMPLATE_PADRAO, WHATSAPP_CLOUD_TEMPLATE_IDIOMA. Passo a passo em docs/whatsapp-api-oficial.md.
 */
import crypto from 'crypto';

export class CloudError extends Error {
  constructor(public codigo: string, message: string, public metaCodigo?: number) { super(message); this.name = 'CloudError'; }
}

export interface CloudConfig {
  token: string;
  phoneNumberId: string;
  versao: string;
  templateRetomada: string;
  templatePadrao: string;
  idioma: string;
}

/** Códigos da Meta para "fora da janela de 24 h" (precisa de modelo) */
const FORA_DA_JANELA = new Set([131047, 470]);

export function cloudAtivo(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.WHATSAPP_PROVIDER || '').trim().toLowerCase() === 'cloud';
}

export function configCloud(env: NodeJS.ProcessEnv = process.env): CloudConfig {
  return {
    token: String(env.WHATSAPP_CLOUD_TOKEN || '').trim(),
    phoneNumberId: String(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '').trim(),
    versao: String(env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v23.0').trim(),
    templateRetomada: String(env.WHATSAPP_CLOUD_TEMPLATE_RETOMADA || '').trim(),
    templatePadrao: String(env.WHATSAPP_CLOUD_TEMPLATE_PADRAO || '').trim(),
    idioma: String(env.WHATSAPP_CLOUD_TEMPLATE_IDIOMA || 'pt_BR').trim(),
  };
}

/** Número no formato da Meta: só dígitos, com 55 */
export function numeroCloud(telefone: string): string {
  const d = String(telefone).replace(/\D/g, '');
  if (d.length < 10) throw new CloudError('TELEFONE_INVALIDO', `Telefone inválido: ${telefone}`);
  return d.startsWith('55') ? d : `55${d}`;
}

/** Parâmetro de modelo: a Meta recusa quebra de linha, tab e mais de 4 espaços seguidos; máximo 1024 caracteres */
export function paramModelo(texto: string, max = 1000): string {
  const limpo = String(texto).replace(/[\r\n\t]+/g, ' · ').replace(/ {2,}/g, ' ').replace(/( · )+/g, ' · ').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

type Opts = { config?: CloudConfig; fetchImpl?: typeof fetch; timeoutMs?: number; /** não reenviar no modelo padrão fora da janela (ex.: disparo de campanha) */ semModeloPadrao?: boolean };

async function chamarGraph(caminho: string, init: RequestInit, opts: Opts): Promise<any> {
  const c = opts.config ?? configCloud();
  if (!c.token || !c.phoneNumberId) throw new CloudError('CLOUD_NAO_CONFIGURADA', 'WhatsApp oficial sem token ou Phone Number ID');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  try {
    const r = await (opts.fetchImpl ?? fetch)(`https://graph.facebook.com/${c.versao}/${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.token}`, ...(init.headers ?? {}) },
      signal: ctrl.signal,
    });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok || body?.error) {
      const e = body?.error ?? {};
      const cod = Number(e.code ?? 0) || undefined;
      const detalhe = e.error_data?.details || e.message || `HTTP ${r.status}`;
      throw new CloudError(cod && FORA_DA_JANELA.has(cod) ? 'FORA_DA_JANELA' : `CLOUD_HTTP_${r.status}`, String(detalhe), cod);
    }
    return body;
  } catch (e: any) {
    if (e instanceof CloudError) throw e;
    if (e?.name === 'AbortError') throw new CloudError('CLOUD_TIMEOUT', 'A API do WhatsApp não respondeu a tempo');
    throw new CloudError('CLOUD_REDE', e?.message || 'falha de rede');
  } finally {
    clearTimeout(t);
  }
}

async function enviarMensagem(telefone: string, conteudo: Record<string, unknown>, opts: Opts): Promise<string> {
  const c = opts.config ?? configCloud();
  const body = await chamarGraph(`${c.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: numeroCloud(telefone), ...conteudo }),
  }, { ...opts, config: c });
  return String(body?.messages?.[0]?.id ?? '');
}

/** Modelo aprovado com parâmetros no corpo ({{1}}, {{2}}…) */
export async function enviarModeloCloud(telefone: string, nome: string, parametros: string[], opts: Opts = {}): Promise<string> {
  const c = opts.config ?? configCloud();
  return enviarMensagem(telefone, {
    type: 'template',
    template: {
      name: nome,
      language: { code: c.idioma },
      ...(parametros.length ? { components: [{ type: 'body', parameters: parametros.map(p => ({ type: 'text', text: paramModelo(p) })) }] } : {}),
    },
  }, { ...opts, config: c });
}

/**
 * Texto livre. Fora da janela de 24 h a Meta recusa: se houver o modelo padrão, reenvia o mesmo texto nele;
 * senão, avisa com o erro FORA_DA_JANELA (o módulo que chamou registra a falha como já fazia com a Z-API).
 */
export async function enviarTextoCloud(telefone: string, mensagem: string, opts: Opts = {}): Promise<string> {
  const c = opts.config ?? configCloud();
  try {
    return await enviarMensagem(telefone, { type: 'text', text: { body: mensagem.slice(0, 4096), preview_url: /https?:\/\//.test(mensagem) } }, { ...opts, config: c });
  } catch (e) {
    if (e instanceof CloudError && e.codigo === 'FORA_DA_JANELA' && c.templatePadrao && !opts.semModeloPadrao) {
      return enviarModeloCloud(telefone, c.templatePadrao, [mensagem], { ...opts, config: c });
    }
    throw e;
  }
}

/** Sobe um arquivo para a Meta e devolve o media id (imagem e documento chegam em base64 dos módulos) */
export async function subirMidiaCloud(arquivo: { base64: string; mime: string; nomeArquivo?: string }, opts: Opts = {}): Promise<string> {
  const c = opts.config ?? configCloud();
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', arquivo.mime);
  form.append('file', new Blob([Buffer.from(arquivo.base64, 'base64')], { type: arquivo.mime }), arquivo.nomeArquivo || 'arquivo');
  const body = await chamarGraph(`${c.phoneNumberId}/media`, { method: 'POST', body: form }, { timeoutMs: 60_000, ...opts, config: c });
  if (!body?.id) throw new CloudError('CLOUD_MIDIA', 'A Meta não devolveu o id do arquivo');
  return String(body.id);
}

export async function enviarImagemCloud(telefone: string, img: { base64: string; mime: string; legenda?: string }, opts: Opts = {}): Promise<string> {
  const id = await subirMidiaCloud({ base64: img.base64, mime: img.mime, nomeArquivo: 'imagem' }, opts);
  return enviarMensagem(telefone, { type: 'image', image: { id, ...(img.legenda ? { caption: img.legenda.slice(0, 1024) } : {}) } }, opts);
}

export async function enviarDocumentoCloud(telefone: string, doc: { base64: string; mime: string; nomeArquivo: string; legenda?: string }, opts: Opts = {}): Promise<string> {
  const id = await subirMidiaCloud(doc, opts);
  return enviarMensagem(telefone, { type: 'document', document: { id, filename: doc.nomeArquivo, ...(doc.legenda ? { caption: doc.legenda.slice(0, 1024) } : {}) } }, opts);
}

/** Vídeo por link público (.mp4, até 16 MB); a Meta baixa o arquivo */
export async function enviarVideoCloud(telefone: string, video: { url: string; legenda?: string }, opts: Opts = {}): Promise<string> {
  return enviarMensagem(telefone, { type: 'video', video: { link: video.url, ...(video.legenda ? { caption: video.legenda.slice(0, 1024) } : {}) } }, { timeoutMs: 60_000, ...opts });
}

// ─── Webhook (mensagens que chegam) ──────────────────────────────────────────

/** GET de verificação da Meta: devolve o hub.challenge se o token conferir */
export function verificarWebhookCloud(query: Record<string, unknown>, verifyToken = process.env.WHATSAPP_CLOUD_VERIFY_TOKEN): string | null {
  if (!verifyToken) return null;
  if (query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== verifyToken) return null;
  return String(query['hub.challenge'] ?? '');
}

/** Assinatura X-Hub-Signature-256 (HMAC SHA-256 do corpo cru com o App Secret) */
export function assinaturaCloudValida(rawBody: Buffer | undefined, cabecalho: unknown, segredo = process.env.WHATSAPP_CLOUD_APP_SECRET || process.env.META_APP_SECRET): boolean {
  if (!segredo || !rawBody || typeof cabecalho !== 'string' || !cabecalho.startsWith('sha256=')) return false;
  const esperado = `sha256=${crypto.createHmac('sha256', segredo).update(rawBody).digest('hex')}`;
  const a = Buffer.from(cabecalho), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Mensagem recebida já no formato do webhook da Z-API (o mesmo fluxo trata as duas) */
export interface EntradaConvertida {
  phone: string;
  messageId: string;
  fromMe: false;
  senderName: string;
  momment: number;
  type: 'ReceivedCallback';
  text?: { message: string };
  image?: { caption: string; imageUrl?: string; mimeType?: string };
  /** media id da Meta (áudio, imagem, documento) para baixar depois, se precisar */
  midiaCloud?: { tipo: string; id: string };
}

function textoDaMensagem(m: any): string {
  switch (m?.type) {
    case 'text': return String(m.text?.body ?? '');
    case 'button': return String(m.button?.text ?? m.button?.payload ?? '');
    case 'interactive': return String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '');
    case 'image': case 'video': case 'document': return String(m[m.type]?.caption ?? '');
    case 'location': return [m.location?.name, m.location?.address, `${m.location?.latitude},${m.location?.longitude}`].filter(Boolean).join(' · ');
    default: return '';
  }
}

/** Converte o corpo do webhook da Cloud API nas mensagens recebidas (ignora status de entrega/leitura) */
export function converterEntradaCloud(body: any): EntradaConvertida[] {
  if (body?.object !== 'whatsapp_business_account') return [];
  const saida: EntradaConvertida[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (change?.field !== 'messages' || !Array.isArray(v?.messages)) continue;
      const nomes = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), String(c.profile?.name ?? '')]));
      for (const m of v.messages) {
        const phone = String(m?.from ?? '').replace(/\D/g, '');
        if (!phone || !m?.id) continue;
        const texto = textoDaMensagem(m).trim();
        const midia = ['audio', 'image', 'video', 'document', 'sticker'].includes(m.type) && m[m.type]?.id ? { tipo: String(m.type), id: String(m[m.type].id) } : undefined;
        saida.push({
          phone, messageId: String(m.id), fromMe: false, senderName: nomes.get(phone) || nomes.get(String(m.from)) || '',
          momment: Number(m.timestamp ?? 0) * 1000 || Date.now(), type: 'ReceivedCallback',
          ...(texto ? { text: { message: texto } } : {}),
          ...(midia ? { midiaCloud: midia } : {}),
        });
      }
    }
  }
  return saida;
}

const MIDIA_MAX = 16 * 1024 * 1024;

/**
 * Baixa um arquivo recebido (áudio, foto) e devolve como data URI: a transcrição de áudio e o agente de imóveis
 * leem por URL, e o link da Meta exige o token — assim eles funcionam igual aos links da Z-API.
 */
export async function baixarMidiaCloud(id: string, opts: Opts = {}): Promise<string | null> {
  const c = opts.config ?? configCloud();
  try {
    const info = await chamarGraph(encodeURIComponent(id), { method: 'GET' }, { ...opts, config: c });
    if (!info?.url || Number(info.file_size ?? 0) > MIDIA_MAX) return null;
    const r = await (opts.fetchImpl ?? fetch)(String(info.url), { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MIDIA_MAX) return null;
    return `data:${String(info.mime_type || r.headers.get('content-type') || 'application/octet-stream').split(';')[0]};base64,${buf.toString('base64')}`;
  } catch (e: any) {
    console.warn('[WhatsApp oficial] Não baixou o arquivo recebido:', e?.message);
    return null;
  }
}

/** Completa a mensagem convertida com o áudio ou a foto (no formato da Z-API: audio.audioUrl / image.imageUrl) */
export async function anexarMidiaCloud(m: EntradaConvertida, opts: Opts = {}): Promise<EntradaConvertida & { audio?: { audioUrl: string } }> {
  if (!m.midiaCloud || !['audio', 'image'].includes(m.midiaCloud.tipo)) return m;
  const url = await baixarMidiaCloud(m.midiaCloud.id, opts);
  if (!url) return m;
  return m.midiaCloud.tipo === 'audio'
    ? { ...m, type: 'ReceivedCallback', audio: { audioUrl: url } }
    : { ...m, image: { imageUrl: url, caption: m.text?.message ?? '' } };
}

/**
 * Automação de conversa do número oficial: mensagem de boas-vindas e os "atalhos" que aparecem quando o cliente
 * abre a conversa pela primeira vez (ice breakers, até 4, 80 caracteres cada).
 */
export const ATALHOS_PADRAO = [
  'Quero conhecer as chácaras do Bom Jardims',
  'Quais são os preços e as condições?',
  'Quero agendar uma visita',
  'Como chego ao condomínio?',
];

export async function configurarAutomacaoCloud(p: { boasVindas: boolean; atalhos: string[] }, opts: Opts = {}): Promise<boolean> {
  const c = opts.config ?? configCloud();
  const atalhos = p.atalhos.map(a => a.trim().slice(0, 80)).filter(Boolean).slice(0, 4);
  const b = await chamarGraph(`${c.phoneNumberId}/conversational_automation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enable_welcome_message: p.boasVindas, prompts: atalhos }),
  }, { ...opts, config: c });
  return b?.success === true;
}

/** Situação do número oficial para o painel: conectado, nome aprovado, qualidade e limite de envio por dia */
export interface StatusCloud {
  ok: boolean;
  numero?: string; nome?: string; status?: string; nomeStatus?: string; qualidade?: string; limite?: string; modo?: string;
  /** frase curta para o painel */
  resumo: string;
  erro?: string;
}

const LIMITE_TXT: Record<string, string> = {
  TIER_50: '50 clientes novos por dia', TIER_250: '250 clientes novos por dia', TIER_1K: '1 mil clientes novos por dia',
  TIER_10K: '10 mil clientes novos por dia', TIER_100K: '100 mil clientes novos por dia', TIER_UNLIMITED: 'sem limite diário',
};
const QUALIDADE_TXT: Record<string, string> = { GREEN: 'alta', YELLOW: 'média (cuidado)', RED: 'baixa (risco de restrição)' };

export function resumoStatusCloud(b: any): StatusCloud {
  const status = String(b?.status ?? '');
  const ok = !status || status === 'CONNECTED';
  const partes = [
    ok ? 'Conectado' : `Situação: ${status}`,
    b?.quality_rating && QUALIDADE_TXT[b.quality_rating] ? `qualidade ${QUALIDADE_TXT[b.quality_rating]}` : null,
    b?.messaging_limit_tier && LIMITE_TXT[b.messaging_limit_tier] ? `limite de ${LIMITE_TXT[b.messaging_limit_tier]}` : null,
    b?.name_status && !['APPROVED', 'AVAILABLE_WITHOUT_REVIEW'].includes(b.name_status) ? `nome de exibição ${b.name_status === 'PENDING_REVIEW' ? 'em análise' : 'não aprovado'}` : null,
    b?.account_mode === 'SANDBOX' ? 'modo de teste' : null,
  ].filter(Boolean);
  return {
    ok, numero: b?.display_phone_number, nome: b?.verified_name, status: status || undefined, nomeStatus: b?.name_status,
    qualidade: b?.quality_rating, limite: b?.messaging_limit_tier, modo: b?.account_mode, resumo: partes.join(' · '),
  };
}

export async function statusCloud(opts: Opts = {}): Promise<StatusCloud> {
  const c = opts.config ?? configCloud();
  try {
    const b = await chamarGraph(`${c.phoneNumberId}?fields=display_phone_number,verified_name,status,quality_rating,messaging_limit_tier,name_status,account_mode`, { method: 'GET' }, { ...opts, config: c });
    return resumoStatusCloud(b);
  } catch (e: any) {
    return { ok: false, resumo: 'Não foi possível consultar o número oficial', erro: e?.message || 'falha' };
  }
}
