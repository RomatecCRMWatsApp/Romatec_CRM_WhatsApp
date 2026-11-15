/**
 * Rotas binárias dos relatórios fotográficos (autenticadas; nada público):
 *  POST /api/relatorios/:id/fotos            — envia uma foto (corpo binário, até 15 MB)
 *  GET  /api/relatorios/fotos/:uid/:variante  — miniatura | previa | original (privado, no-store)
 *  GET  /api/relatorios/:id.pdf?cliente=1     — PDF (versão interna ou do cliente)
 */
import express, { type Express, type Request, type Response } from 'express';
import { MAX_BYTES_FOTO, ORIGENS_CAPTURA } from '../../shared/relatoriosFotograficos';

async function usuario(req: Request) {
  const { sdk } = await import('../_core/sdk');
  return sdk.authenticateRequest(req).catch(() => null);
}
function erro(res: Response, e: any) {
  if (e?.name === 'RelatorioErro') return res.status(Number(e.status) || 400).json({ erro: e.message });
  if (e?.type === 'entity.too.large') return res.status(413).json({ erro: 'Foto acima do limite.' });
  console.error('[Relatórios]', e?.message ?? e);
  return res.status(500).json({ erro: 'Falha ao processar o relatório.' });
}
const nomeSeguro = (s: string) => s.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'arquivo';

export function registrarRotasRelatorios(app: Express) {
  app.post('/api/relatorios/:id/fotos', express.raw({ type: '*/*', limit: MAX_BYTES_FOTO + 1024 }), async (req, res) => {
    try {
      const user = await usuario(req);
      if (!user) return res.status(401).json({ erro: 'nao_autenticado' });
      const S = await import('./servico');
      const origemH = String(req.headers['x-origem-captura'] ?? '');
      const lat = Number(req.headers['x-geo-lat']), lng = Number(req.headers['x-geo-lng']);
      const consent = String(req.headers['x-geo-consentimento'] ?? '') === '1';
      const nome = (() => { try { return decodeURIComponent(String(req.headers['x-file-name'] ?? '')); } catch { return ''; } })();
      const foto = await S.adicionarFoto(S.atorDe(user), Number(req.params.id) || 0, req.body as Buffer, {
        nome, origem: (ORIGENS_CAPTURA as readonly string[]).includes(origemH) ? (origemH as any) : 'other',
        geo: consent && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      });
      res.json({ ok: true, foto });
    } catch (e) { erro(res, e); }
  });

  app.get('/api/relatorios/fotos/:uid/:variante', async (req, res) => {
    try {
      const user = await usuario(req);
      if (!user) return res.status(401).json({ erro: 'nao_autenticado' });
      const v = String(req.params.variante);
      if (!['miniatura', 'previa', 'original'].includes(v)) return res.status(404).json({ erro: 'variante' });
      const S = await import('./servico');
      const a = await S.arquivoDaFoto(S.atorDe(user), String(req.params.uid), v as any);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', a.mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `${v === 'original' ? 'attachment' : 'inline'}; filename="${nomeSeguro(a.nome)}"`);
      res.send(a.buf);
    } catch (e) { erro(res, e); }
  });

  app.get('/api/relatorios/:id.pdf', async (req, res) => {
    try {
      const user = await usuario(req);
      if (!user) return res.status(401).json({ erro: 'nao_autenticado' });
      const S = await import('./servico');
      const r = await S.gerarPdfRelatorio(S.atorDe(user), Number(req.params.id) || 0, { cliente: req.query.cliente === '1', previa: req.query.previa === '1' });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${req.query.baixar === '1' ? 'attachment' : 'inline'}; filename="${nomeSeguro(r.nome)}"`);
      res.send(r.buf);
    } catch (e) { erro(res, e); }
  });
}
