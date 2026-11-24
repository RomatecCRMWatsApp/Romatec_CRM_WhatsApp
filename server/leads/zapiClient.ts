/**
 * Cliente Z-API do módulo de captação (envio de texto e documento com timeout).
 * Credenciais: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN.
 * Com WHATSAPP_PROVIDER=cloud, os envios saem pela API oficial da Meta (server/leads/whatsappCloud.ts),
 * a não ser que o chamador passe credenciais Z-API explícitas.
 */

export class ZApiError extends Error {
  constructor(public codigo: string, message: string) { super(message); }
}

export interface ZApiCreds { instanceId?: string; token?: string; clientToken?: string }

/** atraso: segundos que a Z-API espera antes de mandar (delayMessage) e mostrando "digitando…" (delayTyping), de 1 a 15 */
type Opcoes = { creds?: ZApiCreds; fetchImpl?: typeof fetch; timeoutMs?: number; atraso?: { mensagem?: number; digitando?: number } };

const seg = (n: number | undefined) => (n == null ? undefined : Math.max(1, Math.min(15, Math.round(n))));

function credsDoEnv(): ZApiCreds {
  return { instanceId: process.env.ZAPI_INSTANCE_ID, token: process.env.ZAPI_TOKEN, clientToken: process.env.ZAPI_CLIENT_TOKEN };
}

/** Vai pela API oficial? (provedor "cloud" e o chamador não forçou uma instância Z-API) */
async function pelaCloud(opts: Opcoes) {
  if (opts.creds) return null;
  const c = await import('./whatsappCloud');
  return c.cloudAtivo() ? c : null;
}

/** Erros da API oficial no mesmo formato dos da Z-API (os módulos tratam um só tipo) */
async function viaCloud<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e instanceof ZApiError) throw e;
    throw new ZApiError(e?.codigo || 'CLOUD_ERRO', e?.message || 'falha na API oficial do WhatsApp');
  }
}

/** Envia texto; devolve o messageId. Lança ZApiError em qualquer falha. */
export async function enviarTexto(telefone: string, mensagem: string, opts: Opcoes = {}): Promise<string> {
  const c = await pelaCloud(opts);
  if (c) return viaCloud(() => c.enviarTextoCloud(telefone, mensagem, { fetchImpl: opts.fetchImpl }));
  return postZApi('send-text', telefone, { message: mensagem }, opts);
}

/** Envia um arquivo (base64) como documento no WhatsApp; devolve o messageId. Lança ZApiError em qualquer falha. */
export async function enviarDocumento(
  telefone: string,
  doc: { base64: string; extensao: string; mime: string; nomeArquivo: string; legenda?: string },
  opts: Opcoes = {},
): Promise<string> {
  const c = await pelaCloud(opts);
  if (c) return viaCloud(() => c.enviarDocumentoCloud(telefone, doc, { fetchImpl: opts.fetchImpl }));
  return postZApi(`send-document/${doc.extensao}`, telefone, {
    document: `data:${doc.mime};base64,${doc.base64}`,
    fileName: doc.nomeArquivo,
    ...(doc.legenda ? { caption: doc.legenda } : {}),
  }, { timeoutMs: 30_000, ...opts });
}

/** Envia uma imagem (base64, ex.: PNG) com legenda; devolve o messageId. Lança ZApiError em qualquer falha. */
export async function enviarImagem(
  telefone: string,
  img: { base64: string; mime: string; legenda?: string },
  opts: Opcoes = {},
): Promise<string> {
  const c = await pelaCloud(opts);
  if (c) return viaCloud(() => c.enviarImagemCloud(telefone, img, { fetchImpl: opts.fetchImpl }));
  return postZApi('send-image', telefone, {
    image: `data:${img.mime};base64,${img.base64}`,
    ...(img.legenda ? { caption: img.legenda } : {}),
  }, { timeoutMs: 30_000, ...opts });
}

/** Envia um vídeo (link público .mp4 que a Z-API baixa) com legenda; devolve o messageId. Lança ZApiError em qualquer falha. */
export async function enviarVideo(
  telefone: string,
  video: { url: string; legenda?: string },
  opts: Opcoes = {},
): Promise<string> {
  const c = await pelaCloud(opts);
  if (c) return viaCloud(() => c.enviarVideoCloud(telefone, video, { fetchImpl: opts.fetchImpl }));
  return postZApi('send-video', telefone, {
    video: video.url,
    ...(video.legenda ? { caption: video.legenda } : {}),
  }, { timeoutMs: 60_000, ...opts });
}

async function postZApi(rota: string, telefone: string, corpo: Record<string, unknown>, opts: Opcoes): Promise<string> {
  const { instanceId, token, clientToken } = opts.creds ?? credsDoEnv();
  if (!instanceId || !token) throw new ZApiError('ZAPI_NAO_CONFIGURADA', 'Z-API sem Instance ID/Token');
  const phone = telefone.replace(/\D/g, '');
  if (phone.length < 12) throw new ZApiError('TELEFONE_INVALIDO', `Telefone inválido: ${telefone}`);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const r = await (opts.fetchImpl ?? fetch)(`https://api.z-api.io/instances/${instanceId}/token/${token}/${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
      body: JSON.stringify({
        phone, ...corpo,
        ...(seg(opts.atraso?.mensagem) ? { delayMessage: seg(opts.atraso?.mensagem) } : {}),
        ...(seg(opts.atraso?.digitando) ? { delayTyping: seg(opts.atraso?.digitando) } : {}),
      }),
      signal: ctrl.signal,
    });
    const body: any = await r.json().catch(() => ({}));
    if (!r.ok || body?.error) {
      throw new ZApiError(`ZAPI_HTTP_${r.status}`, String(body?.error || body?.message || `HTTP ${r.status}`));
    }
    return String(body?.messageId ?? body?.zaapId ?? body?.id ?? '');
  } catch (e: any) {
    if (e instanceof ZApiError) throw e;
    if (e?.name === 'AbortError') throw new ZApiError('ZAPI_TIMEOUT', 'Z-API não respondeu a tempo');
    throw new ZApiError('ZAPI_REDE', e?.message || 'falha de rede');
  } finally {
    clearTimeout(t);
  }
}
