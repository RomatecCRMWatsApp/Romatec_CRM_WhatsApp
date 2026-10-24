/** Download das versões do contrato (PDF guardado no banco): admin/secretário, ou o corretor do contrato */
import type { Express } from 'express';
import { contratoPorId, pdfDaVersao, ContratoErro } from './servico';

export function registrarRotasContratos(app: Express) {
  app.get('/api/contratos/:id/versoes/:versao.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login para abrir o contrato');
      const { perfilDe } = await import('../../shared/equipe');
      const perfil = perfilDe(user);
      const c = await contratoPorId(Number(req.params.id) || 0);
      const pode = perfil === 'admin' || perfil === 'secretario' || (perfil === 'corretor' && c.corretorUserId === user.id);
      if (!pode) return res.status(404).send('Contrato não encontrado');
      const { pdf, nome } = await pdfDaVersao(c.id, Number(req.params.versao) || 0);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${c.numero}-${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof ContratoErro) return res.status(e.status).send(e.message);
      console.error('[Contratos] download:', e);
      res.status(500).send('Falha ao abrir o contrato');
    }
  });
}
