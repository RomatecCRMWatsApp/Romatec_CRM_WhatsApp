/**
 * Envio das partes da gravação (áudio cru no corpo). Precisa de login e do módulo de leads liberado.
 * POST /api/reunioes/:id/partes/:ordem?duracao=<segundos>   Content-Type: audio/webm (ou o tipo do arquivo)
 */
import express, { type Express } from 'express';
import { LIMITE_PARTE_MB } from '../../shared/reunioes';

export function registrarRotasReunioes(app: Express) {
  app.post('/api/reunioes/:id/partes/:ordem', express.raw({ type: '*/*', limit: `${LIMITE_PARTE_MB + 1}mb` }), async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ ok: false, error: 'Faça login de novo.' });
      const { carregarPermissoes } = await import('../permissoes');
      const { moduloLiberado } = await import('../../shared/permissoes');
      const permissoes = await carregarPermissoes(user);
      if (!moduloLiberado(permissoes.perfil, permissoes.modulos, 'reunioes.parte')) return res.status(403).json({ ok: false, error: 'Módulo de leads não liberado para você.' });
      const id = Number(req.params.id), ordem = Number(req.params.ordem);
      if (!Number.isInteger(id) || !Number.isInteger(ordem) || ordem < 0 || ordem > 10_000) return res.status(400).json({ ok: false, error: 'Parte inválida' });
      const audio = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const { receberParte } = await import('./servico');
      const r = await receberParte(id, ordem, audio, String(req.headers['content-type'] || 'audio/webm'), Number(req.query.duracao) || 0, { id: user.id, permissoes });
      res.json({ ok: true, ...r });
    } catch (e: any) {
      if (e?.name === 'ReuniaoErro') return res.status(e.status).json({ ok: false, error: e.message });
      if (e?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: `Arquivo maior que ${LIMITE_PARTE_MB} MB.` });
      console.error('[Reuniões] parte:', e?.message);
      res.status(500).json({ ok: false, error: 'Não foi possível enviar esta parte agora.' });
    }
  });
}
