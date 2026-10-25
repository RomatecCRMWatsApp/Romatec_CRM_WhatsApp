/**
 * Recrutamento — rotas de arquivo:
 * - POST /api/public/recrutamento/:token/docs/:tipo?validade=AAAA-MM-DD   anexo do candidato (corpo = arquivo)
 * - GET  /api/public/recrutamento/:token/formulario.(pdf|docx)            formulário para preencher fora
 * - GET  /api/recrutamento/docs/:id                                       conferência (administrador/secretária)
 * - GET  /api/recrutamento/modelo.(pdf|docx)?perfil=&emp=                 formulário em branco (administrador/secretária)
 */
import express, { type Express, type Request, type Response } from 'express';
import { createRateLimiter } from '../lead-intake';

const permite = createRateLimiter(40, 15 * 60 * 1000);
const ipDe = (req: Request) => {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || req.socket.remoteAddress || 'x';
};
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function recrutador(req: Request): Promise<boolean> {
  const { sdk } = await import('../_core/sdk');
  const user: any = await sdk.authenticateRequest(req).catch(() => null);
  const { perfilDe } = await import('../../shared/equipe');
  const { podeRecrutar } = await import('../../shared/recrutamento');
  return !!user && podeRecrutar(perfilDe(user));
}

function erro(res: Response, e: any) {
  if (e?.name === 'RecrutamentoErro') return res.status(e.status).json({ ok: false, error: e.message });
  if (e?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Arquivo acima de 10 MB' });
  console.error('[Recrutamento]', e?.message);
  res.status(500).json({ ok: false, error: 'Não foi possível agora. Tente de novo.' });
}

async function enviarFormulario(res: Response, perfil: any, ext: string, opcoes: { nome?: string | null; empreendimento?: string | null }) {
  const { formularioPdf, formularioDocx } = await import('./formularioArquivos');
  const nome = `Formulario-cadastro-${perfil}.${ext}`;
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  if (ext === 'pdf') { res.type('application/pdf'); return res.send(await formularioPdf(perfil, opcoes)); }
  res.type(DOCX); return res.send(await formularioDocx(perfil, opcoes));
}

export function registrarRotasRecrutamento(app: Express) {
  app.post('/api/public/recrutamento/:token/docs/:tipo', express.raw({ type: '*/*', limit: '11mb' }), async (req, res) => {
    try {
      if (!permite(ipDe(req))) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' });
      const { salvarDocPublico } = await import('./servico');
      const nome = String(req.headers['x-nome-arquivo'] ? decodeURIComponent(String(req.headers['x-nome-arquivo'])) : req.params.tipo);
      const r = await salvarDocPublico(String(req.params.token), String(req.params.tipo), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), nome, typeof req.query.validade === 'string' ? req.query.validade : null);
      res.json(r);
    } catch (e) { erro(res, e); }
  });

  app.get('/api/public/recrutamento/:token/formulario.:ext', async (req, res) => {
    try {
      const ext = String(req.params.ext);
      if (!['pdf', 'docx'].includes(ext)) return res.status(404).end();
      const { formularioPublico } = await import('./servico');
      const f = await formularioPublico(String(req.params.token));
      await enviarFormulario(res, f.perfil, ext, { nome: f.dados?.nome ?? null, empreendimento: f.empreendimento });
    } catch (e) { erro(res, e); }
  });

  app.get('/api/recrutamento/docs/:id', async (req, res) => {
    try {
      if (!(await recrutador(req))) return res.status(404).json({ ok: false });
      const { arquivoDoDoc } = await import('./servico');
      const a = await arquivoDoDoc(Number(req.params.id));
      res.type(a.mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome)}"`);
      res.send(a.buf);
    } catch (e) { erro(res, e); }
  });

  app.get('/api/recrutamento/modelo.:ext', async (req, res) => {
    try {
      if (!(await recrutador(req))) return res.status(404).json({ ok: false });
      const ext = String(req.params.ext);
      const perfil = req.query.perfil === 'secretario' ? 'secretario' : 'corretor';
      if (!['pdf', 'docx'].includes(ext)) return res.status(404).end();
      let empreendimento: string | null = null;
      if (typeof req.query.emp === 'string' && req.query.emp) {
        const { dadosDoProprietario } = await import('./servico');
        empreendimento = (await dadosDoProprietario(req.query.emp).catch(() => null))?.empreendimento ?? null;
      }
      await enviarFormulario(res, perfil, ext, { empreendimento });
    } catch (e) { erro(res, e); }
  });
}
