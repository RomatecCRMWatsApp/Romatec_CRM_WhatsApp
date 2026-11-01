/**
 * Proteções gerais do servidor (revisão de segurança de 01/11/2026), sem bibliotecas novas:
 *
 * 1. Tamanho do corpo JSON: 1 MB nas rotas públicas e webhooks; 50 MB só para o CRM logado (tRPC ou cookie de sessão),
 *    que manda fotos/documentos em base64. Uploads binários seguem com o limite próprio de cada rota (express.raw).
 * 2. Cabeçalhos de segurança: nosniff, Referrer-Policy, HSTS (em HTTPS), Permissions-Policy e frame-ancestors (o CRM
 *    só pode ser exibido em iframe nos domínios da Romatec — evita roubo de clique). Sem CSP de script, para não
 *    quebrar mapas, Cloudinary e fontes.
 * 3. Limite global de requisições por IP nas rotas /api: generoso com sessão, mais justo sem; webhooks ficam de fora.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { COOKIE_NAME } from '../../shared/const';

export const LIMITE_JSON_PUBLICO = '1mb';
export const LIMITE_JSON_LOGADO = '50mb';

export const temSessao = (req: Pick<Request, 'headers'>) =>
  String(req.headers.cookie ?? '').split(';').some(c => c.trim().startsWith(`${COOKIE_NAME}=`));

/** IP real atrás do proxy do Railway: o último do X-Forwarded-For (os anteriores vêm do cliente) */
export const ipReal = (req: Pick<Request, 'headers' | 'socket'>) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',').map(x => x.trim()).filter(Boolean).pop() || req.socket?.remoteAddress || '';

export const precisaCorpoGrande = (req: Pick<Request, 'url' | 'headers'>) =>
  String(req.url ?? '').startsWith('/api/trpc') || temSessao(req);

/** express.json com limite por tipo de requisição (o `verify` guarda o corpo cru dos webhooks assinados) */
export function jsonComLimite(verify: (req: any, res: any, buf: Buffer) => void) {
  const grande = express.json({ limit: LIMITE_JSON_LOGADO, verify });
  const pequeno = express.json({ limit: LIMITE_JSON_PUBLICO, verify });
  const formGrande = express.urlencoded({ limit: LIMITE_JSON_LOGADO, extended: true });
  const formPequeno = express.urlencoded({ limit: LIMITE_JSON_PUBLICO, extended: true });
  return [
    (req: Request, res: Response, next: NextFunction) => (precisaCorpoGrande(req) ? grande : pequeno)(req, res, next),
    (req: Request, res: Response, next: NextFunction) => (precisaCorpoGrande(req) ? formGrande : formPequeno)(req, res, next),
  ];
}

/** Domínios onde o CRM pode aparecer em iframe (FRAME_ANCESTORS_EXTRA acrescenta outros, separados por espaço) */
export function frameAncestors(env: NodeJS.ProcessEnv = process.env): string {
  const extra = String(env.FRAME_ANCESTORS_EXTRA ?? '').split(/\s+/).filter(Boolean);
  return ["'self'", 'https://romateccrm.com', 'https://*.romateccrm.com', 'https://romatecavalieimob.com.br', 'https://*.romatecavalieimob.com.br', 'https://*.manus.space', ...extra].join(' ');
}

export function cabecalhosSeguranca(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors()}`);
  // Câmera (documentos), microfone (agente de voz) e localização (evidência da assinatura) só no próprio site
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=()');
  const https = req.protocol === 'https' || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

/** Janela fixa de 1 minuto por IP (memória do processo; limpa as janelas vencidas a cada minuto) */
export const LIMITE_MIN = { comSessao: 1200, semSessao: 180 } as const;
const ROTAS_LIVRES = /^\/api\/(webhook|webhooks)\//;

export function criarLimiteGlobal(agora: () => number = Date.now) {
  const janelas = new Map<string, { inicio: number; n: number }>();
  let limpeza = agora();
  return function limiteGlobal(req: Request, res: Response, next: NextFunction) {
    const url = String(req.url ?? '');
    if (!url.startsWith('/api/') || ROTAS_LIVRES.test(url)) return next();
    const t = agora();
    if (t - limpeza > 60_000) {
      janelas.forEach((v, k) => { if (t - v.inicio >= 60_000) janelas.delete(k); });
      limpeza = t;
    }
    const sessao = temSessao(req);
    const chave = `${sessao ? 's' : 'a'}:${ipReal(req)}`;
    const j = janelas.get(chave);
    if (!j || t - j.inicio >= 60_000) { janelas.set(chave, { inicio: t, n: 1 }); return next(); }
    j.n++;
    const max = sessao ? LIMITE_MIN.comSessao : LIMITE_MIN.semSessao;
    if (j.n > max) {
      res.setHeader('Retry-After', String(Math.ceil((j.inicio + 60_000 - t) / 1000)));
      return res.status(429).json({ erro: 'limite', mensagem: 'Muitas requisições — aguarde um minuto e tente de novo' });
    }
    next();
  };
}
