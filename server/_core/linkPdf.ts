/**
 * Link compartilhável de qualquer PDF do sistema (WhatsApp, e-mail): quem está logado gera um link assinado
 * (HMAC-SHA256) para aquele endereço exato; quem recebe abre sem login, por 30 dias, vendo o PDF exatamente como quem
 * enviou o veria. Só vale para GET de /api/…​.pdf; qualquer mudança no endereço invalida a assinatura; o link para de
 * abrir se a pessoa for desativada ou tiver o perfil trocado (versão da sessão entra na assinatura).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const VALIDADE_LINK_PDF_DIAS = 30;
const PARAMS = ['_u', '_e', '_s'];
/** Parâmetros que não mudam o documento (abrir × baixar) e ficam fora da assinatura */
const LIVRES = ['baixar'];

function segredo(): string {
  const s = process.env.FINANCEIRO_LINK_SECRET || process.env.JWT_SECRET || '';
  if (!s) throw new Error('Defina JWT_SECRET para assinar os links de PDF');
  return s;
}

/** Caminho é de PDF do sistema? (/api/… terminando em .pdf, fora das rotas públicas, sem "..") */
export function caminhoPdfValido(caminho: string): boolean {
  if (typeof caminho !== 'string' || caminho.length > 600 || !caminho.startsWith('/api/') || caminho.startsWith('/api/public/')) return false;
  if (caminho.includes('..') || caminho.includes('//') || /[\s#\\]/.test(caminho)) return false;
  const path = caminho.split('?')[0];
  return /^\/api\/[A-Za-z0-9/_.\-%]+\.pdf$/.test(path);
}

/** Forma canônica: caminho + parâmetros em ordem alfabética, sem os do link e os livres */
function canonico(caminho: string): string {
  const u = new URL(caminho, 'http://x');
  const q = Array.from(u.searchParams.entries()).filter(([k]) => !PARAMS.includes(k) && !LIVRES.includes(k)).sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  return `${u.pathname}?${q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
}

const assinatura = (canon: string, usuarioId: number, sv: number, exp: number) =>
  createHmac('sha256', segredo()).update(`pdf|${canon}|${usuarioId}|${sv}|${exp}`).digest('base64url').slice(0, 32);

/** Link assinado para o caminho (relativo ao domínio do sistema) */
export function assinarLinkPdf(caminho: string, usuarioId: number, sessaoVersao: number, agora = Date.now(), dias = VALIDADE_LINK_PDF_DIAS): string {
  if (!caminhoPdfValido(caminho)) throw new Error('Endereço de PDF inválido');
  const exp = Math.floor(agora / 1000) + dias * 86_400;
  const sig = assinatura(canonico(caminho), usuarioId, Number(sessaoVersao) || 0, exp);
  return `${caminho}${caminho.includes('?') ? '&' : '?'}_u=${usuarioId}&_e=${exp}&_s=${sig}`;
}

/**
 * Se a requisição é um GET de PDF com link assinado válido, devolve o id de quem compartilhou; a versão da sessão
 * atual da pessoa é conferida por quem chama (a assinatura a inclui).
 */
export function lerLinkPdf(req: { method?: string; originalUrl?: string; url?: string }, sessaoVersaoDe: (id: number) => number | null, agora = Date.now()): number | null {
  if ((req.method ?? 'GET').toUpperCase() !== 'GET') return null;
  const caminho = String(req.originalUrl ?? req.url ?? '');
  if (!caminhoPdfValido(caminho)) return null;
  const u = new URL(caminho, 'http://x');
  const id = u.searchParams.get('_u'), e = u.searchParams.get('_e'), s = u.searchParams.get('_s');
  if (!id || !/^\d{1,10}$/.test(id) || !e || !/^\d{1,12}$/.test(e) || !s) return null;
  if (Number(e) * 1000 < agora) return null;
  const sv = sessaoVersaoDe(Number(id));
  if (sv == null) return null;
  const a = Buffer.from(assinatura(canonico(caminho), Number(id), sv, Number(e)));
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b) ? Number(id) : null;
}

/** Tem os parâmetros de link? (para só consultar o banco quando precisa) */
export const pareceLinkPdf = (req: { originalUrl?: string; url?: string }) => /[?&]_s=/.test(String(req.originalUrl ?? req.url ?? ''));

/**
 * Middleware: em qualquer GET /api/….pdf com ?baixar=1, o PDF vem como download (Content-Disposition: attachment),
 * sem precisar mexer em cada rota.
 */
export function forcarDownloadPdf(req: { method?: string; path?: string; query?: Record<string, unknown> }, res: { setHeader: (k: string, v: any) => any }, next: () => void) {
  if ((req.method ?? 'GET').toUpperCase() === 'GET' && /^\/api\/.+\.pdf$/.test(String(req.path ?? '')) && req.query?.baixar === '1') {
    const original = res.setHeader.bind(res);
    res.setHeader = (k: string, v: any) => original(k, String(k).toLowerCase() === 'content-disposition' && typeof v === 'string' ? v.replace(/^\s*inline/i, 'attachment') : v);
  }
  next();
}
