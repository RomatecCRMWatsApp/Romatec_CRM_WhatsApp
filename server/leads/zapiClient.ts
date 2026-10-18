/**
 * Cliente Z-API do módulo de captação (envio de texto com timeout).
 * Credenciais: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN.
 */

export class ZApiError extends Error {
  constructor(public codigo: string, message: string) { super(message); }
}

export interface ZApiCreds { instanceId?: string; token?: string; clientToken?: string }

function credsDoEnv(): ZApiCreds {
  return { instanceId: process.env.ZAPI_INSTANCE_ID, token: process.env.ZAPI_TOKEN, clientToken: process.env.ZAPI_CLIENT_TOKEN };
}

/** Envia texto; devolve o messageId. Lança ZApiError em qualquer falha. */
export async function enviarTexto(
  telefone: string,
  mensagem: string,
  opts: { creds?: ZApiCreds; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<string> {
  const { instanceId, token, clientToken } = opts.creds ?? credsDoEnv();
  if (!instanceId || !token) throw new ZApiError('ZAPI_NAO_CONFIGURADA', 'Z-API sem Instance ID/Token');
  const phone = telefone.replace(/\D/g, '');
  if (phone.length < 12) throw new ZApiError('TELEFONE_INVALIDO', `Telefone inválido: ${telefone}`);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const r = await (opts.fetchImpl ?? fetch)(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
      body: JSON.stringify({ phone, message: mensagem }),
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
