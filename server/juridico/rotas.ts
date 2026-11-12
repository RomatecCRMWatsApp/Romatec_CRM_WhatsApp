/**
 * Arquivos do corpo jurídico: PDF dos documentos (notificação, requerimento, ata, avulsos) e o envio de um PDF avulso
 * (ofício, alteração, solicitação) para assinar com certificado. Advogado: só do empreendimento dele; empreendedor:
 * só leitura dos do empreendimento dele; administrador e secretária: todos.
 */
import express, { type Express } from 'express';
import { eq } from 'drizzle-orm';

async function usuario(req: any) {
  const { sdk } = await import('../_core/sdk');
  const u: any = await sdk.authenticateRequest(req).catch(() => null);
  return u && u.ativo !== false && u.ativo !== 0 ? u : null;
}
async function idDoSlug(slug: string | null | undefined): Promise<number | null> {
  if (!slug) return null;
  const { getDb } = await import('../db');
  const { empreendimentos } = await import('../../drizzle/schema');
  const d: any = await getDb();
  const [e]: any[] = d ? await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1) : [];
  return e ? Number(e.id) : null;
}

export function registrarRotasJuridico(app: Express) {
  app.get('/api/juridico/documentos/:id.pdf', async (req, res) => {
    try {
      const u = await usuario(req);
      if (!u) return res.status(401).send('Faça login');
      const { perfilDe } = await import('../../shared/equipe');
      const perfil = perfilDe(u);
      const { pdfDoDocumento } = await import('./inadimplencia');
      const r = await pdfDoDocumento(Number(req.params.id) || 0);
      const meu = perfil === 'admin' || perfil === 'secretario' || ((perfil === 'juridico' || perfil === 'empreendedor') && (await idDoSlug(u.empreendimentoSlug)) === r.empreendimentoId);
      if (!meu) return res.status(404).send('Documento não encontrado');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `${req.query.baixar === '1' ? 'attachment' : 'inline'}; filename="${r.nome}"`);
      res.send(r.buf);
    } catch (e: any) { res.status(e?.status ?? 500).send(e?.message ?? 'Falha'); }
  });

  // PDF avulso para assinar: corpo = o arquivo; x-titulo e x-slug (admin escolhe o empreendimento) nos cabeçalhos
  app.post('/api/juridico/documentos/avulso', express.raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
    try {
      const u = await usuario(req);
      if (!u) return res.status(401).json({ ok: false, error: 'Faça login' });
      const { perfilDe } = await import('../../shared/equipe');
      const perfil = perfilDe(u);
      if (perfil !== 'admin' && perfil !== 'juridico') return res.status(403).json({ ok: false, error: 'Só o administrador e os advogados enviam documentos jurídicos' });
      const slug = perfil === 'juridico' ? u.empreendimentoSlug : decodeURIComponent(String(req.get('x-slug') ?? 'bom-jardims'));
      const empId = await idDoSlug(slug);
      if (!empId) return res.status(404).json({ ok: false, error: 'Empreendimento não encontrado' });
      const titulo = decodeURIComponent(String(req.get('x-titulo') ?? '')).slice(0, 240);
      const { salvarAvulso } = await import('./inadimplencia');
      const r = await salvarAvulso(empId, titulo, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), u.id);
      res.json({ ok: true, id: r.id });
    } catch (e: any) { res.status(e?.status ?? 500).json({ ok: false, error: e?.message ?? 'Falha' }); }
  });
}
