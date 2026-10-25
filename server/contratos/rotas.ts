/** Download das versões do contrato (PDF guardado no banco): admin/secretário, ou o corretor do contrato */
import type { Express } from 'express';
import { contratoPorId, pdfDaVersao, ContratoErro } from './servico';

export function registrarRotasContratos(app: Express) {
  // Contrato modelo: minuta com o cliente fictício (nada é gravado) — admin, secretária e corretor
  app.get('/api/contratos/modelo.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../../shared/equipe');
      const { podeCriarContrato } = await import('../../shared/contratos');
      if (!podeCriarContrato(perfilDe(user))) return res.status(403).send('Sem permissão');
      const slug = typeof req.query.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(req.query.slug) ? req.query.slug : 'bom-jardims';
      const lote = typeof req.query.lote === 'string' && /^[A-Z0-9]{1,6}$/.test(req.query.lote) ? req.query.lote : 'A01';
      const { contratoModelo } = await import('./modelo');
      const pdf = await contratoModelo(slug, lote, user.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="CONTRATO-MODELO-CPCV-${slug.toUpperCase()}-${lote}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof ContratoErro) return res.status(e.status).send(e.message);
      console.error('[Contratos] modelo:', e);
      res.status(500).send('Falha ao gerar o contrato modelo');
    }
  });

  // Contrato de comissão Empreendedora × Romatec (5%): SÓ o administrador — nunca corretor nem secretária
  app.get('/api/contratos/:id/comissao-romatec.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../../shared/equipe');
      if (perfilDe(user) !== 'admin') return res.status(404).send('Não encontrado');
      const { entradaDoContrato } = await import('./servico');
      const { montarContexto } = await import('./contexto');
      const { docComissaoRomatec } = await import('./docsComissao');
      const { auditar } = await import('../financeiro/servico');
      const c = await contratoPorId(Number(req.params.id) || 0);
      const { entrada, plano, marca } = await entradaDoContrato(c.id);
      const parceiro = entrada.parceiro;
      const pdf = await docComissaoRomatec(montarContexto(entrada), plano, marca, {
        corretorDaVenda: parceiro?.nome ?? null, creciDaVenda: parceiro ? [parceiro.creciUf, parceiro.creci].filter(Boolean).join(' ') : null, comprador: entrada.comprador.nome,
      });
      await auditar('comissao_romatec_pdf', { contratoId: c.id, usuarioId: user.id, origem: 'perfil', ip: req.ip });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Comissao-Romatec-${c.numero}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof ContratoErro) return res.status(e.status).send(e.message);
      console.error('[Contratos] comissão Romatec:', e);
      res.status(500).send('Falha ao gerar o contrato de comissão');
    }
  });

  // PDF atual do contrato (tela de posicionar as assinaturas)
  app.get('/api/contratos/:id/atual.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../../shared/equipe');
      const perfil = perfilDe(user);
      const c = await contratoPorId(Number(req.params.id) || 0);
      if (!(perfil === 'admin' || perfil === 'secretario' || (perfil === 'corretor' && c.corretorUserId === user.id)) || !c.pdfAtual) return res.status(404).send('Contrato sem PDF');
      const { lerArquivo } = await import('./arquivos');
      const a = await lerArquivo(c.pdfAtual);
      if (!a) return res.status(404).send('Contrato sem PDF');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(a.buf);
    } catch (e: any) { res.status(e instanceof ContratoErro ? e.status : 500).send(e?.message ?? 'Falha'); }
  });

  // Manifesto de assinaturas (Anexo VII)
  app.get('/api/contratos/:id/manifesto.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../../shared/equipe');
      const perfil = perfilDe(user);
      const c = await contratoPorId(Number(req.params.id) || 0);
      if (!(perfil === 'admin' || perfil === 'secretario' || (perfil === 'corretor' && c.corretorUserId === user.id)) || !c.manifestoArquivo) return res.status(404).send('Manifesto não encontrado');
      const { lerArquivo } = await import('./arquivos');
      const a = await lerArquivo(c.manifestoArquivo);
      if (!a) return res.status(404).send('Manifesto não encontrado');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Manifesto-${c.numero}.pdf"`);
      res.send(a.buf);
    } catch (e: any) { res.status(e instanceof ContratoErro ? e.status : 500).send(e?.message ?? 'Falha'); }
  });

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
