/**
 * Proteção contra requisição forjada de outro site (CSRF). O cookie de sessão é SameSite=None (necessário em alguns
 * fluxos), então o navegador o envia mesmo quando a página que dispara o POST é de outro domínio. Regra: escrita
 * (POST/PUT/PATCH/DELETE) COM o cookie de sessão e com o cabeçalho Origin de outro host é recusada.
 *
 * Não afeta: webhooks (Asaas, Meta, Spedy, Z-API — servidores não mandam cookie nem Origin), formulários públicos
 * sem sessão, nem chamadas do próprio CRM (mesma origem).
 */
import type { NextFunction, Request, Response } from 'express';
import { COOKIE_NAME } from '../../shared/const';

const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Host da requisição como o navegador o vê (atrás do proxy do Railway vem em X-Forwarded-Host) */
function hostDaRequisicao(req: Pick<Request, 'headers'>): string {
  const h = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase();
  return h;
}

export function origemCruzadaComSessao(req: Pick<Request, 'method' | 'headers'>): boolean {
  if (!ESCRITA.has(String(req.method).toUpperCase())) return false;
  const cookie = String(req.headers.cookie ?? '');
  if (!cookie.split(';').some(c => c.trim().startsWith(`${COOKIE_NAME}=`))) return false;
  const origem = String(req.headers.origin ?? '').trim();
  if (!origem || origem === 'null') {
    // Sem Origin: navegadores modernos mandam Sec-Fetch-Site; "cross-site" denuncia a origem cruzada
    return String(req.headers['sec-fetch-site'] ?? '') === 'cross-site';
  }
  let hostOrigem: string;
  try { hostOrigem = new URL(origem).host.toLowerCase(); } catch { return true; }
  const host = hostDaRequisicao(req);
  return !!host && hostOrigem !== host;
}

export function bloquearOrigemCruzada(req: Request, res: Response, next: NextFunction) {
  if (origemCruzadaComSessao(req)) return res.status(403).json({ erro: 'origem', mensagem: 'Requisição de outro site recusada' });
  next();
}
