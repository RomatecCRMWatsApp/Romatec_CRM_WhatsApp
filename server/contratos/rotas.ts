/** Download das versões do contrato (PDF guardado no banco): admin/secretário, ou o corretor do contrato */
import express, { type Express } from 'express';
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

  // Modelos (intermediação, carnê, recibo) com o contrato fictício — mesmas permissões do contrato modelo; nada é gravado
  app.get('/api/contratos/modelos/:tipo.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../../shared/equipe');
      const { podeCriarContrato } = await import('../../shared/contratos');
      if (!podeCriarContrato(perfilDe(user))) return res.status(403).send('Sem permissão');
      const { modeloDocumento, TIPOS_MODELO } = await import('./modelosDocs');
      const tipo = req.params.tipo as any;
      if (!TIPOS_MODELO.includes(tipo)) return res.status(404).send('Modelo não encontrado');
      const slug = typeof req.query.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(req.query.slug) ? req.query.slug : 'bom-jardims';
      const { pdf, nome } = await modeloDocumento(tipo, slug, user.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof ContratoErro) return res.status(e.status).send(e.message);
      console.error('[Contratos] modelo de documento:', e);
      res.status(500).send('Falha ao gerar o modelo');
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

  // ─── Carteirinhas do condomínio: administrador, secretária ou o corretor do contrato ───
  const contratoDaEquipe = async (req: any) => {
    const { sdk } = await import('../_core/sdk');
    const user: any = await sdk.authenticateRequest(req).catch(() => null);
    if (!user || user.ativo === false || user.ativo === 0) return null;
    const { perfilDe } = await import('../../shared/equipe');
    const perfil = perfilDe(user);
    const c = await contratoPorId(Number(req.params.id) || 0);
    if (!(perfil === 'admin' || perfil === 'secretario' || (perfil === 'corretor' && c.corretorUserId === user.id))) return null;
    return { user, c };
  };
  const tipoRef = (q: any) => {
    const tipo = String(q.tipo ?? '');
    if (!['comprador', 'conjuge', 'dependente'].includes(tipo)) return null;
    const ref = Number(q.ref) || 0;
    return ref > 0 ? { tipo: tipo as 'comprador' | 'conjuge' | 'dependente', ref } : null;
  };

  // PDF da gráfica (CR80, frente e verso): emite as carteiras das pessoas aptas; dependente com pendência fica de fora
  app.get('/api/contratos/:id/carteirinhas.pdf', async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      if (!a) return res.status(404).json({ error: 'Não encontrado' });
      const { carteirinhasPdf } = await import('./carteirinhas');
      const { pdf, nome, bloqueadas } = await carteirinhasPdf(a.c.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.setHeader('X-Carteirinhas-Bloqueadas', String(bloqueadas.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof ContratoErro) return res.status(e.status).json({ error: e.message, pendencias: e.campos ?? null });
      console.error('[Carteirinhas] PDF:', e);
      res.status(500).json({ error: 'Falha ao gerar as carteirinhas' });
    }
  });
  // Foto 3×4 (titular, cônjuge ou dependente)
  app.post('/api/contratos/:id/carteirinhas/foto', express.raw({ type: '*/*', limit: '8mb' }), async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      if (!a) return res.status(404).json({ error: 'Não encontrado' });
      const alvo = tipoRef(req.query);
      if (!alvo || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Envie a foto' });
      const { salvarFoto } = await import('./carteirinhas');
      await salvarFoto(a.c.id, alvo.tipo, alvo.ref, req.body, a.user.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(e instanceof ContratoErro ? e.status : 500).json({ error: e instanceof ContratoErro ? e.message : 'Falha ao salvar a foto' }); }
  });
  app.get('/api/contratos/:id/carteirinhas/foto', async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      const alvo = tipoRef(req.query);
      if (!a || !alvo) return res.status(404).send('Não encontrado');
      const { lerFoto } = await import('./carteirinhas');
      const buf = await lerFoto(a.c.id, alvo.tipo, alvo.ref);
      if (!buf) return res.status(404).send('Sem foto');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buf);
    } catch { res.status(404).send('Não encontrado'); }
  });
  // QR de autenticidade (portaria): pública, sem CPF; a foto ajuda a conferir quem apresenta
  app.get('/p/c/:token', async (req, res) => {
    const { conferirCarteirinha } = await import('./carteirinhas');
    const r = await conferirCarteirinha(String(req.params.token).toLowerCase().slice(0, 40));
    res.status(r.status).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    res.send(r.html);
  });
  app.get('/p/c/:token/foto', async (req, res) => {
    const { fotoDaCarteirinha } = await import('./carteirinhas');
    const buf = await fotoDaCarteirinha(String(req.params.token).toLowerCase().slice(0, 40));
    if (!buf) return res.status(404).send('Sem foto');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
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
