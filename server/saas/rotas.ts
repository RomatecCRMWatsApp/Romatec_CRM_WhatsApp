/**
 * Camada SaaS — rotas Express:
 * - licença nas rotas REST autenticadas (/api/…, fora do tRPC): corretor/empreendedor sem licença → 402
 *   (fail-closed: erro ao conferir → 503). Livres: públicas, webhooks, login/sessão, assinatura.
 * - lançamento de folha do talonário (corpo = cópia digitalizada) e a cópia para conferência.
 */
import express, { type Express, type Request, type Response, type NextFunction } from 'express';

const LIVRES_REST = ['/api/public/', '/api/webhook', '/api/oauth', '/api/auth', '/api/trpc', '/api/assinatura', '/api/sistema/', '/api/health'];
const bloqueioAuditado = new Map<number, number>();

async function usuarioDaRequisicao(req: Request) {
  const { sdk } = await import('../_core/sdk');
  return sdk.authenticateRequest(req).catch(() => null) as Promise<any>;
}

export function registrarRotasSaas(app: Express) {
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    const caminho = req.originalUrl.split('?')[0];
    if (LIVRES_REST.some(p => caminho.startsWith(p))) return next();
    try {
      const { lerConfig, resumoLicenca, auditar } = await import('./servico');
      if (!(await lerConfig()).licenciamentoAtivo) return next();
      const user = await usuarioDaRequisicao(req);
      if (!user) return next(); // a própria rota decide sobre o login
      const l = await resumoLicenca(user);
      if (l.liberado) return next();
      const ultima = bloqueioAuditado.get(user.id) ?? 0;
      if (Date.now() - ultima > 10 * 60_000) { bloqueioAuditado.set(user.id, Date.now()); await auditar(user.id, 'BLOQUEIO_402', { rota: caminho, assinatura: l.assinaturaId }, req.ip ?? null); }
      return res.status(402).json({ ok: false, erro: 'ASSINATURA_NECESSARIA', redirecionar: '/assinatura', motivo: l.motivo });
    } catch (e: any) {
      console.error('[licenca]', e?.message);
      return res.status(503).json({ ok: false, erro: 'LICENCA_INDISPONIVEL' });
    }
  });

  // Webhook do Mercado Pago (painel ▸ Webhooks, assinado com MP_WEBHOOK_SECRET): grava uma vez, responde 200 e processa
  app.post('/api/webhooks/mercadopago', async (req, res) => {
    const dataId = String((req.query as any)['data.id'] ?? req.body?.data?.id ?? req.body?.id ?? '').slice(0, 64);
    if (!dataId) return res.sendStatus(400);
    try {
      const { registrarEvento, processarEvento } = await import('./cobranca');
      const r = await registrarEvento({ xSignature: req.header('x-signature') ?? undefined, xRequestId: req.header('x-request-id') ?? undefined }, dataId, req.body);
      res.sendStatus(200);
      if (r.novo) setImmediate(() => { processarEvento(r.eventoId).catch(e => console.error('[MP] webhook', r.eventoId, e?.message)); });
    } catch (e: any) {
      if (e?.name === 'CobrancaErro' && e.status === 401) { console.warn('[MP] webhook recusado: assinatura inválida'); return res.sendStatus(401); }
      console.error('[MP] webhook (gravação):', e?.message);
      if (!res.headersSent) res.sendStatus(500);
    }
  });

  // Webhook da Spedy (NFS-e): assinatura conferida no corpo cru, idempotente pelo id do evento (server/saas/spedy.ts)
  app.post('/api/webhook/spedy', async (req, res) => {
    try {
      const cru = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
      const { receberWebhook } = await import('./spedy');
      const r = await receberWebhook(cru, { 'webhook-id': req.header('webhook-id'), 'webhook-timestamp': req.header('webhook-timestamp'), 'webhook-signature': req.header('webhook-signature') });
      if (!r.ok) console.warn(`[Spedy] webhook recusado: ${r.motivo}`);
      res.sendStatus(r.status);
    } catch (e: any) {
      console.error('[Spedy] webhook:', e?.message);
      if (!res.headersSent) res.sendStatus(500);
    }
  });

  async function escritorio(req: Request) {
    const user = await usuarioDaRequisicao(req);
    const { perfilDe } = await import('../../shared/equipe');
    return user && ['admin', 'secretario'].includes(perfilDe(user) ?? '') ? user : null;
  }

  // Lançar folha: ?status=UTILIZADA|CANCELADA|EXTRAVIADA&externoId=|usuarioId=&contratoId=&referencia=  (corpo = cópia digitalizada)
  app.post('/api/talonarios/:id/folhas/:numero/lancar', express.raw({ type: '*/*', limit: '11mb' }), async (req, res) => {
    try {
      const user = await escritorio(req);
      if (!user) return res.status(403).json({ ok: false, error: 'Só o escritório lança folhas.' });
      const q = (k: string) => (typeof req.query[k] === 'string' ? String(req.query[k]) : '');
      const status = ['UTILIZADA', 'CANCELADA', 'EXTRAVIADA'].includes(q('status')) ? q('status') as any : 'UTILIZADA';
      const { lancarFolha } = await import('./talonarios');
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const r = await lancarFolha({
        talonarioId: Number(req.params.id), numero: Number(req.params.numero), status,
        corretor: { externoId: q('externoId') ? Number(q('externoId')) : null, usuarioId: q('usuarioId') ? Number(q('usuarioId')) : null },
        contratoId: q('contratoId') ? Number(q('contratoId')) : null, referencia: q('referencia') || null,
        arquivo: buf.length ? { buf, nome: decodeURIComponent(String(req.headers['x-nome-arquivo'] ?? '')) } : null,
      }, user.id);
      res.json(r);
    } catch (e: any) {
      if (e?.name === 'TalonarioErro') return res.status(e.status).json({ ok: false, error: e.message });
      if (e?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Arquivo acima de 10 MB' });
      console.error('[Talonários]', e?.message);
      res.status(500).json({ ok: false, error: 'Não foi possível lançar agora.' });
    }
  });

  app.get('/api/talonarios/:id/folhas/:numero/arquivo', async (req, res) => {
    try {
      if (!(await escritorio(req))) return res.status(404).end();
      const { arquivoDaFolha } = await import('./talonarios');
      const a = await arquivoDaFolha(Number(req.params.id), Number(req.params.numero));
      res.type(a.mime).setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome)}"`);
      res.send(a.buf);
    } catch (e: any) {
      res.status(e?.status ?? 500).json({ ok: false, error: e?.message || 'Erro' });
    }
  });
}
