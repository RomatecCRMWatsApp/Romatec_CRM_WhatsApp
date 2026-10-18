/**
 * Status real do WhatsApp (Z-API), consultado na hora — para o painel.
 *
 * O campo companyConfig.zApiConnected só muda quando o disparo de campanha
 * falha 3 vezes (vira false) ou quando alguém clica "Verificar agora" (vira true),
 * então fica preso no último valor. Aqui a consulta é feita direto no Z-API,
 * com o motivo exato e o que fazer, e o campo é sincronizado com o resultado.
 */

export type WhatsAppState =
  | 'connected'
  | 'phone_disconnected'   // instância existe, mas o celular não está pareado (ler QR code)
  | 'instance_not_found'   // ID/token não existem mais no Z-API (instância apagada, recriada ou assinatura vencida)
  | 'unauthorized'         // Client-Token errado ou ausente
  | 'not_configured'
  | 'error';

export interface WhatsAppStatus {
  state: WhatsAppState;
  title: string;
  detail: string;
  /** Passos curtos para resolver, na ordem */
  steps: string[];
  checkedAt: string;
}

const STEPS_CREDENCIAIS = [
  'Entre em app.z-api.io e confira se a instância existe e se a assinatura está em dia',
  'Copie o Instance ID, o Token e o Client-Token da instância',
  'Atualize em Configurações › Z-API e nas variáveis ZAPI_* do Railway',
  'Clique em "Verificar agora"',
];

export function classifyZApiStatus(httpStatus: number, body: any, now: Date = new Date()): WhatsAppStatus {
  const checkedAt = now.toISOString();
  const msg = String(body?.error || body?.message || '').toLowerCase();

  if (httpStatus >= 200 && httpStatus < 300 && body?.connected === true) {
    return { state: 'connected', title: 'WhatsApp conectado', detail: 'Z-API ativo, envios funcionando.', steps: [], checkedAt };
  }
  if (msg.includes('instance not found') || httpStatus === 404) {
    return {
      state: 'instance_not_found',
      title: 'Instância do Z-API não encontrada',
      detail: 'O Z-API não reconhece o Instance ID/Token do CRM. Nenhuma mensagem está saindo: campanhas, boas-vindas de leads e bot.',
      steps: STEPS_CREDENCIAIS,
      checkedAt,
    };
  }
  if (httpStatus === 401 || httpStatus === 403 || msg.includes('client-token') || msg.includes('not allowed')) {
    return {
      state: 'unauthorized',
      title: 'Z-API recusou o acesso',
      detail: 'O Client-Token do CRM não confere com o da conta Z-API.',
      steps: ['Em app.z-api.io › Segurança, copie o Client-Token', 'Atualize em Configurações › Z-API e em ZAPI_CLIENT_TOKEN no Railway', 'Clique em "Verificar agora"'],
      checkedAt,
    };
  }
  if (httpStatus >= 200 && httpStatus < 300 && body?.connected === false) {
    return {
      state: 'phone_disconnected',
      title: 'Celular desconectado do Z-API',
      detail: body?.smartphoneConnected === false
        ? 'A instância existe, mas o celular está sem internet ou desligado.'
        : 'A instância existe, mas o WhatsApp não está pareado.',
      steps: ['Abra app.z-api.io › sua instância', 'Leia o QR code com o WhatsApp do celular da Romatec (Aparelhos conectados)', 'Clique em "Verificar agora"'],
      checkedAt,
    };
  }
  return {
    state: 'error',
    title: 'Não foi possível consultar o Z-API',
    detail: `Resposta inesperada (HTTP ${httpStatus}${msg ? `: ${msg}` : ''}).`,
    steps: ['Tente "Verificar agora" em alguns minutos', 'Se continuar, confira o status do Z-API em app.z-api.io'],
    checkedAt,
  };
}

export interface ZApiCreds { instanceId?: string | null; token?: string | null; clientToken?: string | null }

let cache: { at: number; key: string; value: WhatsAppStatus } | null = null;
const CACHE_MS = 60_000;

/** Consulta o Z-API (com cache de 1 min para o painel não martelar a API) */
export async function checkWhatsAppStatus(
  creds: ZApiCreds,
  opts: { force?: boolean; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<WhatsAppStatus> {
  const now = opts.now ?? new Date();
  if (!creds.instanceId || !creds.token) {
    return {
      state: 'not_configured',
      title: 'Z-API não configurado',
      detail: 'Faltam o Instance ID e o Token do Z-API.',
      steps: ['Abra Configurações › Z-API e preencha Instance ID, Token e Client-Token'],
      checkedAt: now.toISOString(),
    };
  }
  const key = `${creds.instanceId}:${creds.token}`;
  if (!opts.force && cache && cache.key === key && now.getTime() - cache.at < CACHE_MS) return cache.value;

  let value: WhatsAppStatus;
  try {
    const res = await (opts.fetchImpl ?? fetch)(
      `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/status`,
      { headers: creds.clientToken ? { 'Client-Token': creds.clientToken } : {} },
    );
    const body = await res.json().catch(() => ({}));
    value = classifyZApiStatus(res.status, body, now);
  } catch (e: any) {
    value = classifyZApiStatus(0, { error: e?.message || 'sem resposta' }, now);
  }
  cache = { at: now.getTime(), key, value };
  return value;
}

/** Só para testes */
export function _resetWhatsAppStatusCache() { cache = null; }
