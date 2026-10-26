/**
 * Mercado Pago — cliente HTTP mínimo (sem SDK) e validação do webhook, portados do AvalieImob
 * (backend/services/mercadopago_service.py e mp_webhook_seguranca.py).
 * Modo TESTE por padrão (MP_ACCESS_TOKEN_TESTE); produção (MP_ACCESS_TOKEN) só quando o administrador liga.
 * O webhook usado é o do painel (Suas integrações ▸ Webhooks), que chega assinado: o AvalieImob viu que o
 * notification_url por pagamento nem sempre vem com x-signature — por isso o CRM não usa notification_url.
 */
import crypto from 'node:crypto';

export class MpErro extends Error { constructor(msg: string, public status = 502, public detalhe?: unknown) { super(msg); this.name = 'MpErro'; } }

export type ModoMp = 'teste' | 'producao';
const API = 'https://api.mercadopago.com';

export const tokenDoModo = (modo: ModoMp) => (modo === 'producao' ? process.env.MP_ACCESS_TOKEN : process.env.MP_ACCESS_TOKEN_TESTE)?.trim() || '';
export const mpConfigurado = (modo: ModoMp) => !!tokenDoModo(modo);

/** Chamada à API do MP (trocável nos testes) */
export const mp = {
  async req<T = any>(modo: ModoMp, metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown, idempotencia?: string): Promise<T> {
    const token = tokenDoModo(modo);
    if (!token) throw new MpErro(`Mercado Pago (${modo}) não configurado: falta ${modo === 'producao' ? 'MP_ACCESS_TOKEN' : 'MP_ACCESS_TOKEN_TESTE'} no Railway`, 412);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(`${API}${caminho}`, {
        method: metodo, signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}) },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
      const txt = await r.text();
      let j: any = {};
      try { j = txt ? JSON.parse(txt) : {}; } catch { j = { message: txt.slice(0, 200) }; }
      if (!r.ok) throw new MpErro(`Mercado Pago recusou (${r.status}): ${j?.message || j?.error || 'erro'}`, r.status >= 500 ? 502 : 400, j);
      return j as T;
    } catch (e: any) {
      if (e?.name === 'MpErro') throw e;
      throw new MpErro(e?.name === 'AbortError' ? 'Mercado Pago não respondeu a tempo' : `Falha ao falar com o Mercado Pago: ${e?.message}`, 502);
    } finally { clearTimeout(t); }
  },
};

/** Manifest assinado pelo MP: id:{data.id};request-id:{x-request-id};ts:{ts}; — partes ausentes omitidas; id alfanumérico em minúsculas */
export function montarManifest(dataId?: string | null, requestId?: string | null, ts?: string | null): string {
  let m = '';
  if (dataId) m += `id:${/^\d+$/.test(dataId) ? dataId : dataId.toLowerCase()};`;
  if (requestId) m += `request-id:${requestId};`;
  if (ts) m += `ts:${ts};`;
  return m;
}

/** x-signature "ts=...,v1=<hmac>" confere com o segredo? (sem segredo: recusa — o CRM exige assinatura) */
export function assinaturaValida(xSignature: string | undefined, xRequestId: string | undefined, dataId: string | undefined, segredo: string | undefined): boolean {
  if (!segredo || !xSignature) return false;
  let ts = '', v1 = '';
  for (const parte of String(xSignature).split(',')) {
    const [k, ...v] = parte.split('=');
    if (k?.trim() === 'ts') ts = v.join('=').trim();
    if (k?.trim() === 'v1') v1 = v.join('=').trim();
  }
  if (!ts || !/^[a-f0-9]{64}$/i.test(v1)) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(montarManifest(dataId, xRequestId, ts)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(v1.toLowerCase()));
}
