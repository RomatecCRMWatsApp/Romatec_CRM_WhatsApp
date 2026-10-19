/**
 * Trava do webhook público da Z-API (/api/webhook/zapi).
 *
 * A Z-API não assina os avisos, então qualquer pessoa que descobrisse a URL poderia
 * injetar "mensagens" falsas (aciona o bot, a IA e os alertas). Conferimos:
 * 1. instanceId do aviso = a instância do CRM (Configurações ou ZAPI_INSTANCE_ID);
 * 2. opcional: ?k=<ZAPI_WEBHOOK_TOKEN> na URL cadastrada no painel da Z-API.
 * Desliga a conferência da instância com ZAPI_WEBHOOK_CHECAR=off (emergência).
 */
import crypto from 'crypto';

export type MotivoRecusa = 'token_invalido' | 'instancia_ausente' | 'instancia_desconhecida' | null;

const igual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Por que recusar este aviso (null = aceitar). Função pura. */
export function motivoRecusaWebhook(
  body: any,
  opts: { instancias: (string | null | undefined)[]; token?: string | null; tokenRecebido?: unknown; checarInstancia?: boolean },
): MotivoRecusa {
  if (opts.token) {
    const recebido = typeof opts.tokenRecebido === 'string' ? opts.tokenRecebido : '';
    if (!recebido || !igual(recebido, opts.token)) return 'token_invalido';
  }
  if (opts.checarInstancia === false) return null;
  const conhecidas = opts.instancias.map(i => String(i ?? '').trim()).filter(Boolean);
  if (!conhecidas.length) return null; // CRM sem Z-API configurada: nada para comparar
  const veio = String(body?.instanceId ?? '').trim();
  if (!veio) return 'instancia_ausente';
  return conhecidas.some(c => igual(c, veio)) ? null : 'instancia_desconhecida';
}

/** Lê a configuração e decide; usado no handler do webhook */
export async function recusarWebhook(body: any, tokenRecebido: unknown): Promise<MotivoRecusa> {
  let doBanco: string | null = null;
  try {
    const { getCompanyConfig } = await import('./db');
    doBanco = (await getCompanyConfig())?.zApiInstanceId ?? null;
  } catch { /* banco fora: compara só com o env */ }
  return motivoRecusaWebhook(body, {
    instancias: [doBanco, process.env.ZAPI_INSTANCE_ID],
    token: process.env.ZAPI_WEBHOOK_TOKEN || null,
    tokenRecebido,
    checarInstancia: (process.env.ZAPI_WEBHOOK_CHECAR || 'on').toLowerCase() !== 'off',
  });
}
