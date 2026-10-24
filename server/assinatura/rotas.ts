/**
 * Rotas públicas da assinatura (sem login — o link individual é a credencial) e da verificação do contrato.
 * O .pfx e a senha do certificado NUNCA são gravados nem logados: chegam no corpo, assinam em memória e são zerados.
 */
import express, { type Express, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { assinaturaSignatarios, empreendimentos } from '../../drizzle/schema';
import {
  AssinaturaErro, assinarComCertificado, conferirArquivo, confirmarAvancada, evento, exigirVez, pdfAtual, receberGovbr, signatarioPorToken, solicitarOtp,
  verificacaoPublica,
} from './servico';
import { ROTULO_METODO, ROTULO_PAPEL } from './pdf';
import { temAssinaturaDigital } from './icp';

/** IP real do signatário (o Railway fica na frente: primeiro endereço do X-Forwarded-For) */
export const ipDe = (req: Request) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '';

function erro(res: Response, e: any) {
  if (e instanceof AssinaturaErro) return res.status(e.status).json({ erro: e.codigo, mensagem: e.message });
  console.error('[Assinatura]', e?.message ?? e);
  return res.status(500).json({ erro: 'falha', mensagem: 'Não foi possível concluir. Tente de novo ou fale com a administração.' });
}

export function registrarRotasAssinatura(app: Express) {
  const base = '/api/assinar/:token';

  app.get(base, async (req, res) => {
    try {
      const { s, c } = await signatarioPorToken(req.params.token);
      const d = (await getDb()) as any;
      const [emp] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
      const todos: any[] = await d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, c.id));
      let vez = true, aguardando: string | null = null;
      try { await exigirVez(s); } catch (e: any) { vez = false; aguardando = e.message; }
      const pdf = await pdfAtual(c.id);
      if (s.status !== 'assinado') await evento(c.id, s.id, 'link_aberto', { ip: ipDe(req), ua: req.get('user-agent') });
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        contrato: { numero: c.numero, empreendimento: emp?.nome ?? '', lote: c.loteCodigo, status: c.status, codigoVerificacao: c.codigoVerificacao },
        signatario: { nome: s.nome, papel: s.papel, papelRotulo: ROTULO_PAPEL[s.papel] ?? s.papel, metodo: s.metodo, metodoRotulo: ROTULO_METODO[s.metodo] ?? s.metodo,
          status: s.status, assinadoEm: s.assinadoEm, telefoneFinal: s.whatsapp ? String(s.whatsapp).slice(-4) : null },
        vez, aguardando, pdfComAssinaturaDigital: temAssinaturaDigital(pdf), bytes: pdf.length,
        outros: todos.sort((a, b) => a.ordem - b.ordem).map(t => ({ papel: ROTULO_PAPEL[t.papel] ?? t.papel, nome: t.nome.split(' ')[0], status: t.status })),
      });
    } catch (e) { erro(res, e); }
  });

  app.get(`${base}/contrato.pdf`, async (req, res) => {
    try {
      const { c } = await signatarioPorToken(req.params.token);
      const pdf = await pdfAtual(c.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${req.query.baixar ? 'attachment' : 'inline'}; filename="Contrato-${c.numero}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(pdf);
    } catch (e) { erro(res, e); }
  });

  app.post(`${base}/codigo`, async (req, res) => {
    try { res.json(await solicitarOtp(req.params.token, { ip: ipDe(req), ua: req.get('user-agent') })); } catch (e) { erro(res, e); }
  });

  app.post(`${base}/avancada`, async (req, res) => {
    try {
      const b = req.body ?? {};
      const geo = b.geo && Number.isFinite(b.geo.lat) && Number.isFinite(b.geo.lon) ? { lat: Number(b.geo.lat), lon: Number(b.geo.lon) } : null;
      const r = await confirmarAvancada(req.params.token, String(b.codigo ?? ''), { ip: ipDe(req), ua: req.get('user-agent'), leuAteOFim: b.leuAteOFim === true, aceite: b.aceite === true, geo });
      res.json({ ok: true, ...r });
    } catch (e) { erro(res, e); }
  });

  // Certificado A1: { pfxBase64, senha } — nada é guardado; o buffer é zerado e a senha sai do corpo
  app.post(`${base}/certificado`, async (req, res) => {
    const b = req.body ?? {};
    const pfx = typeof b.pfxBase64 === 'string' && b.pfxBase64.length < 200_000 ? Buffer.from(b.pfxBase64, 'base64') : null;
    const senha = typeof b.senha === 'string' ? b.senha : '';
    b.pfxBase64 = undefined;
    b.senha = undefined;
    try {
      if (!pfx || !pfx.length || !senha) throw new AssinaturaErro('CERTIFICADO', 'Envie o arquivo .pfx e a senha', 400);
      const r = await assinarComCertificado(req.params.token, pfx, senha, { ip: ipDe(req), ua: req.get('user-agent') });
      res.json({ ok: true, ...r });
    } catch (e) { erro(res, e); } finally { pfx?.fill(0); }
  });

  // gov.br: o PDF assinado no assinador.iti.br (corpo binário)
  app.post(`${base}/govbr`, express.raw({ type: () => true, limit: '40mb' }), async (req, res) => {
    try {
      const buf = Buffer.isBuffer(req.body) ? req.body : null;
      if (!buf || buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new AssinaturaErro('ARQUIVO', 'Envie o PDF assinado no gov.br', 400);
      res.json({ ok: true, ...(await receberGovbr(req.params.token, buf, { ip: ipDe(req), ua: req.get('user-agent') })) });
    } catch (e) { erro(res, e); }
  });

  // Verificação pública do contrato
  app.get('/api/c/v/:codigo', async (req, res) => {
    try { res.json(await verificacaoPublica(String(req.params.codigo).toUpperCase())); } catch (e) { erro(res, e); }
  });
  app.post('/api/c/v/:codigo/conferir', async (req, res) => {
    try { res.json(await conferirArquivo(String(req.params.codigo).toUpperCase(), String(req.body?.sha256 ?? ''))); } catch (e) { erro(res, e); }
  });
}
