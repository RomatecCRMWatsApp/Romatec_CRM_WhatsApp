/**
 * Downloads do Contrato de Gestão (só o administrador):
 * GET /api/gestao/:slug/contrato.pdf · /api/gestao/:slug/contrato.docx · /api/gestao/:slug/recibo/:id.pdf
 */
import type { Express, Request, Response } from 'express';

async function admin(req: Request, res: Response): Promise<any | null> {
  const { sdk } = await import('../_core/sdk');
  const user: any = await sdk.authenticateRequest(req).catch(() => null);
  if (!user || user.ativo === false || user.ativo === 0) { res.status(401).send('Faça login'); return null; }
  const { perfilDe } = await import('../../shared/equipe');
  if (perfilDe(user) !== 'admin') { res.status(404).send('Não encontrado'); return null; }
  return user;
}

const slugOk = (s: string) => /^[a-z0-9-]{1,80}$/.test(s);

export function registrarRotasGestao(app: Express) {
  app.get('/api/gestao/:slug/contrato.:formato', async (req, res) => {
    try {
      const user = await admin(req, res);
      if (!user) return;
      const { slug, formato } = req.params;
      if (!slugOk(slug) || !['pdf', 'docx'].includes(formato)) return res.status(404).send('Não encontrado');
      const { dadosContrato } = await import('./servico');
      const C = await import('./contrato');
      const g = await dadosContrato(slug);
      const blocos = C.blocosContrato(g);
      const nome = `Contrato-de-Gestao-${g.numero}.${formato}`;
      const arq = formato === 'pdf'
        ? await C.blocosParaPdf(blocos, `Contrato de Gestão ${g.numero} — ${g.empreendimento.nome}`, `Contrato de Gestão n.º ${g.numero} · documento interno`)
        : C.blocosParaDocx(blocos);
      const { auditar } = await import('../financeiro/servico');
      await auditar('contrato_gestao_' + formato, { usuarioId: user.id, origem: 'perfil', ip: req.ip }).catch(() => {});
      res.setHeader('Content-Type', formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `${formato === 'pdf' && req.query.baixar !== '1' ? 'inline' : 'attachment'}; filename="${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(arq);
    } catch (e: any) {
      if (e?.name === 'GestaoErro') return res.status(e.status).send(e.message);
      console.error('[Gestão] contrato:', e);
      res.status(500).send('Falha ao gerar o contrato de gestão');
    }
  });

  app.get('/api/gestao/:slug/aditivo/:id.:formato', async (req, res) => {
    try {
      const user = await admin(req, res);
      if (!user) return;
      const { slug, formato } = req.params;
      const id = Number(req.params.id);
      if (!slugOk(slug) || !['pdf', 'docx'].includes(formato) || !Number.isInteger(id) || id <= 0) return res.status(404).send('Não encontrado');
      const { dadosContrato } = await import('./servico');
      const C = await import('./contrato');
      const g = await dadosContrato(slug);
      const ad = g.aditivos.find(x => x.id === id);
      if (!ad) return res.status(404).send('Termo aditivo não encontrado');
      const blocos = C.blocosAditivoGestao(g, ad);
      const nome = `Termo-Aditivo-${String(ad.numero).padStart(2, '0')}-${g.numero}.${formato}`;
      const arq = formato === 'pdf'
        ? await C.blocosParaPdf(blocos, `Termo Aditivo ${ad.numero} — ${g.numero}`, `Termo Aditivo n.º ${ad.numero} ao Contrato de Gestão n.º ${g.numero}`)
        : C.blocosParaDocx(blocos);
      res.setHeader('Content-Type', formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `${formato === 'pdf' ? 'inline' : 'attachment'}; filename="${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(arq);
    } catch (e: any) {
      if (e?.name === 'GestaoErro') return res.status(e.status).send(e.message);
      console.error('[Gestão] aditivo:', e);
      res.status(500).send('Falha ao gerar o termo aditivo');
    }
  });

  app.get('/api/gestao/:slug/recibo/:id.pdf', async (req, res) => {
    try {
      const user = await admin(req, res);
      if (!user) return;
      const { slug } = req.params;
      const id = Number(req.params.id);
      if (!slugOk(slug) || !Number.isInteger(id) || id <= 0) return res.status(404).send('Não encontrado');
      const { dadosContrato } = await import('./servico');
      const C = await import('./contrato');
      const g = await dadosContrato(slug);
      const a = g.aportes.find(x => x.id === id);
      if (!a) return res.status(404).send('Adiantamento não encontrado');
      const pdf = await C.blocosParaPdf(C.blocosRecibo(g, a), `Recibo de Adiantamento ${a.numero} — ${g.numero}`, `Recibo de Adiantamento n.º ${a.numero} · Contrato de Gestão n.º ${g.numero}`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Recibo-Adiantamento-${String(a.numero).padStart(3, '0')}-${g.numero}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e?.name === 'GestaoErro') return res.status(e.status).send(e.message);
      console.error('[Gestão] recibo:', e);
      res.status(500).send('Falha ao gerar o recibo');
    }
  });
}
