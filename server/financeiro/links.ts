/**
 * Links assinados (HMAC-SHA256, validade 7 dias) para o comprador abrir boleto, 2ª via, carnê e recibos sem login.
 * A assinatura cobre o caminho e a validade; qualquer alteração invalida o link.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const VALIDADE_LINK_DIAS = 7;

function segredo(): string {
  const s = process.env.FINANCEIRO_LINK_SECRET || process.env.JWT_SECRET || '';
  if (!s) throw new Error('Defina JWT_SECRET para assinar os links do financeiro');
  return s;
}

const assinatura = (caminho: string, exp: number) => createHmac('sha256', segredo()).update(`${caminho}|${exp}`).digest('base64url');

export function assinarLink(caminho: string, agora = Date.now(), dias = VALIDADE_LINK_DIAS): string {
  const exp = Math.floor(agora / 1000) + dias * 86_400;
  return `${caminho}${caminho.includes('?') ? '&' : '?'}exp=${exp}&sig=${assinatura(caminho, exp)}`;
}

/** caminho = path SEM exp/sig (ex.: /api/financeiro/cobrancas/12/boleto-a4.pdf) */
export function linkValido(caminho: string, exp: unknown, sig: unknown, agora = Date.now()): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < agora || typeof sig !== 'string' || !sig) return false;
  const a = Buffer.from(assinatura(caminho, e));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
