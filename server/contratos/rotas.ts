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
  /** Id do empreendimento do empreendedor (pelo empreendimentoSlug do cadastro) */
  const empreendimentoDoEmpreendedor = async (user: any): Promise<number | null> => {
    if (!user?.empreendimentoSlug) return null;
    const { getDb } = await import('../db');
    const { empreendimentos } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const d: any = await getDb();
    const [e]: any[] = d ? await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, String(user.empreendimentoSlug))).limit(1) : [];
    return e ? Number(e.id) : null;
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
      const { perfilDe } = await import('../../shared/equipe');
      // Oficial: escritório e empreendedor; o corretor baixa só rascunho (tarja "sem validade")
      const { pdf, nome, bloqueadas } = await carteirinhasPdf(a.c.id, req.query.formato === 'a4' ? 'a4' : 'cr80', perfilDe(a.user) === 'corretor');
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
  // Modelo da carteirinha (para apresentar ao cliente): dados digitados na tela, sem foto e sem gravar nada
  app.get('/api/carteirinhas/modelo.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).json({ error: 'Faça login' });
      const { perfilDe } = await import('../../shared/equipe');
      const perfilModelo = String(perfilDe(user));
      if (!['admin', 'secretario', 'corretor', 'empreendedor'].includes(perfilModelo)) return res.status(404).json({ error: 'Não encontrado' });
      const campo = (k: string, padrao: string, max: number) => String(req.query[k] ?? '').trim().slice(0, max) || padrao;
      const validade = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
      const { renderCarteirinhas } = await import('./carteirinhas');
      const pdf = await renderCarteirinhas([{
        nome: campo('nome', 'Nome do Titular', 80), vinculo: campo('vinculo', 'Titular', 40), unidade: campo('unidade', 'Chácara A01 · Quadra A', 60),
        numero: 'MODELO', validade, qrToken: 'modelo', foto: null, contratoNumero: 'MODELO', empreendimento: 'Condomínio de Chácaras Bom Jardims',
      }], req.query.formato === 'cr80' ? 'cr80' : 'a4', { rascunho: perfilModelo === 'corretor' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="MODELO-CARTEIRINHA${perfilModelo === 'corretor' ? '-RASCUNHO' : ''}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      console.error('[Carteirinhas] modelo:', e);
      res.status(500).json({ error: 'Falha ao gerar o modelo' });
    }
  });

  // Tela de Carteirinhas: PDF das pessoas marcadas, de vários contratos (?itens=contrato:tipo:ref,…&formato=cr80|a4)
  app.get('/api/carteirinhas.pdf', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).json({ error: 'Faça login' });
      const { perfilDe } = await import('../../shared/equipe');
      const perfil = perfilDe(user);
      if (!['admin', 'secretario', 'corretor', 'empreendedor'].includes(String(perfil))) return res.status(404).json({ error: 'Não encontrado' });
      const itens = String(req.query.itens ?? '').split(',').slice(0, 600).map(t => {
        const [c, tipo, ref] = t.split(':');
        return { contratoId: Number(c) || 0, tipo: tipo as any, ref: Number(ref) || 0 };
      }).filter(i => i.contratoId > 0 && i.ref > 0 && ['comprador', 'conjuge', 'dependente'].includes(i.tipo));
      if (!itens.length) return res.status(400).json({ error: 'Marque ao menos uma carteirinha' });
      // Corretor: só dos contratos dele; empreendedor: só do empreendimento dele
      const empDoEmpreendedor = perfil === 'empreendedor' ? await empreendimentoDoEmpreendedor(user) : null;
      if (perfil === 'empreendedor' && !empDoEmpreendedor) return res.status(404).json({ error: 'Não encontrado' });
      if (perfil === 'corretor' || perfil === 'empreendedor') {
        for (const id of Array.from(new Set(itens.map(i => i.contratoId)))) {
          const c = await contratoPorId(id).catch(() => null);
          const dele = perfil === 'corretor' ? c?.corretorUserId === user.id : Number(c?.empreendimentoId) === empDoEmpreendedor;
          if (!c || !dele) return res.status(404).json({ error: 'Não encontrado' });
        }
      }
      const { carteirinhasSelecaoPdf } = await import('./carteirinhas');
      const formato = req.query.formato === 'a4' ? 'a4' : 'cr80';
      // Oficial: escritório e empreendedor; o corretor baixa só rascunho (tarja "sem validade")
      const rascunho = perfil === 'corretor';
      const { pdf, quantidade, foraDoPdf } = await carteirinhasSelecaoPdf(itens, formato, rascunho);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="CARTEIRINHAS-${quantidade}${formato === 'a4' ? '-A4' : ''}${rascunho ? '-RASCUNHO' : ''}.pdf"`);
      res.setHeader('X-Carteirinhas-Fora', String(foraDoPdf));
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e instanceof ContratoErro) return res.status(e.status).json({ error: e.message });
      console.error('[Carteirinhas] seleção:', e);
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
  // ─── Anexos do contrato (documentos do comprador, cônjuge e dependentes): escritório ou o corretor do contrato ───
  const erroAnexo = (res: any, e: any, msg: string) => {
    if (e instanceof ContratoErro) return res.status(e.status).json({ error: e.message });
    console.error(`[Contratos] ${msg}:`, e);
    res.status(500).json({ error: msg });
  };
  app.post('/api/contratos/:id/anexos', express.raw({ type: '*/*', limit: '11mb' }), async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      if (!a) return res.status(404).json({ error: 'Não encontrado' });
      const alvo = String(req.query.alvo ?? '');
      if (!['comprador', 'conjuge', 'dependente'].includes(alvo) || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Envie o arquivo' });
      const { salvarAnexo } = await import('./documentosContrato');
      res.json(await salvarAnexo(a.c.id, {
        alvo: alvo as any, dependente: req.query.dependente != null ? Number(req.query.dependente) : null,
        tipo: String(req.query.tipo ?? ''), nome: String(req.query.nome ?? '').slice(0, 200),
      }, req.body, a.user.id));
    } catch (e: any) { erroAnexo(res, e, 'Falha ao salvar o anexo'); }
  });
  app.get('/api/contratos/:id/anexos', async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      if (!a) return res.status(404).json({ error: 'Não encontrado' });
      const { listarAnexos } = await import('./documentosContrato');
      res.json(await listarAnexos(a.c.id));
    } catch (e: any) { erroAnexo(res, e, 'Falha ao listar os anexos'); }
  });
  app.get('/api/contratos/:id/anexos/:anexoId', async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      if (!a) return res.status(404).send('Não encontrado');
      const { lerAnexo } = await import('./documentosContrato');
      const f = await lerAnexo(a.c.id, Number(req.params.anexoId) || 0);
      if (!f) return res.status(404).send('Não encontrado');
      res.setHeader('Content-Type', f.mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.nome)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(f.buf);
    } catch { res.status(404).send('Não encontrado'); }
  });
  app.delete('/api/contratos/:id/anexos/:anexoId', async (req, res) => {
    try {
      const a = await contratoDaEquipe(req);
      if (!a) return res.status(404).json({ error: 'Não encontrado' });
      const { perfilDe } = await import('../../shared/equipe');
      const { removerAnexo } = await import('./documentosContrato');
      res.json(await removerAnexo(a.c.id, Number(req.params.anexoId) || 0, a.user, ['admin', 'secretario'].includes(String(perfilDe(a.user)))));
    } catch (e: any) { erroAnexo(res, e, 'Falha ao remover o anexo'); }
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
