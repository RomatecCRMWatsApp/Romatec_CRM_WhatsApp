/**
 * Rotas do Bloco Financeiro (Express): PDFs, 2ª via, recibos, declaração, verificação pública e webhook do Asaas.
 * Acesso: Administrador/Secretário logados, ou link assinado (HMAC, 7 dias) para o comprador. Tudo vai para a auditoria.
 */
import express, { type Express, type Request, type Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { declaracoesQuitacao, recibos } from '../../drizzle/schema';
import { lerArquivo } from '../contratos/arquivos';
import { linkValido } from './links';
import { blocoDoCarne, dadosCarne, dadosParcela, SemDadosAsaasError } from './dados';
import { renderBoletoA4, renderCarneV2 } from './render/documentos';
import {
  auditar, cobrancaPorId, cobrancasDoContrato, contextoDocs, enviarRecibo, FinanceiroErro, pdfRecibo, processarEventoAsaas, segundaVia,
  type EventoAsaas,
} from './servico';
import { AsaasErro } from './asaas';

type Acesso = { usuarioId: number | null; origem: 'perfil' | 'link' };

/** Administrador e Secretário (perfil) ou link assinado válido para este caminho */
async function acesso(req: Request, caminho: string, permitirLink = true): Promise<Acesso | null> {
  const { sdk } = await import('../_core/sdk');
  const user: any = await sdk.authenticateRequest(req).catch(() => null);
  if (user && user.ativo !== false && user.ativo !== 0) {
    const { perfilDe } = await import('../../shared/equipe');
    const perfil = perfilDe(user);
    if (perfil === 'admin' || perfil === 'secretario') return { usuarioId: user.id, origem: 'perfil' };
  }
  if (permitirLink && linkValido(caminho, req.query.exp, req.query.sig)) return { usuarioId: null, origem: 'link' };
  return null;
}

function erro(res: Response, e: any) {
  if (e instanceof FinanceiroErro || e instanceof AsaasErro) return res.status(e.status).json({ erro: e.codigo, mensagem: e.message });
  if (e instanceof SemDadosAsaasError) return res.status(409).json({ erro: 'sem_asaas', mensagem: e.message });
  console.error('[Financeiro]', e);
  return res.status(500).json({ erro: 'falha', mensagem: 'Falha ao gerar o documento' });
}

const pdf = (res: Response, buf: Buffer, nome: string) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buf);
};

/** Webhook: token do painel do Asaas (header asaas-access-token, ou ?token= na URL), comparado em tempo constante */
export function tokenConfere(recebido: unknown, esperado: string | undefined): boolean {
  if (!esperado || typeof recebido !== 'string' || !recebido) return false;
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** O Asaas às vezes manda JSON com content-type que o express.json não reconhece (lição do ZAYRA) */
export function corpoDoEvento(body: unknown): EventoAsaas {
  if (typeof body === 'string') {
    const s = body.trim();
    if (!s) return {};
    try { return JSON.parse(s); } catch { /* form-urlencoded */ }
    try { const p = new URLSearchParams(s); const d = p.get('data') || p.get('payload'); if (d) return JSON.parse(d); } catch { /* desconhecido */ }
    return {};
  }
  if (Buffer.isBuffer(body)) return corpoDoEvento(body.toString('utf8'));
  return (body && typeof body === 'object' ? body : {}) as EventoAsaas;
}

/** Página pública de verificação do recibo: dados mínimos, sem CPF; o PDF só com o código de verificação */
export async function verificarRecibo(numero: string, codigo?: string): Promise<{ status: number; html?: string; pdf?: Buffer }> {
  const db = (await getDb()) as any;
  const [r] = await db.select().from(recibos).where(eq(recibos.numero, numero)).limit(1);
  if (!r) return { status: 404, html: pagina('Recibo não encontrado', '<p>Confira o número impresso no recibo.</p>') };
  // Recibo cancelado pelo administrador: a verificação pública avisa e não entrega o PDF
  if (r.canceladoEm) return { status: 410, html: pagina(`Recibo ${r.numero} — CANCELADO`, '<p>Este recibo foi cancelado pela administração e não tem mais validade. Em caso de dúvida, fale com a Romatec.</p>') };
  if (codigo) {
    const ok = codigo.trim().toUpperCase() === String(r.codigoVerif).toUpperCase();
    if (!ok) return { status: 403, html: pagina('Código de verificação incorreto', '<p>Confira o código impresso no recibo.</p>') };
    return { status: 200, pdf: await pdfRecibo(r.id, true) };
  }
  const { cobranca, ctx } = await (await import('./servico')).dadosRecibo(r.id, true);
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const br = (s: string) => String(s).slice(0, 10).split('-').reverse().join('/');
  return {
    status: 200,
    html: pagina(`Recibo ${r.numero} — autêntico`, `
      <dl><dt>Contrato</dt><dd>${ctx.contrato.numero}</dd><dt>Parcela</dt><dd>${(await import('./dados')).rotuloParcela(cobranca)} · Chácara ${ctx.lote.codigo}</dd>
      <dt>Valor pago</dt><dd>${brl(Number(r.valorPago))}</dd><dt>Data do pagamento</dt><dd>${br(r.pagoEm)}</dd></dl>
      <form method="get"><label>Código de verificação para ver o PDF</label><input name="codigo" placeholder="XXXX-XXXX-XXXX" maxlength="14" required><button>Ver recibo</button></form>`),
  };
}

function pagina(titulo: string, corpo: string): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#F7F3E8;color:#1d2b22}header{background:#0C3320;color:#fff;padding:16px;border-bottom:3px solid #C9A646}
main{max-width:520px;margin:24px auto;padding:0 16px}h1{font-size:20px;color:#0C3320}dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;background:#fff;padding:16px;border-radius:10px;border:1px solid #C9A646}
dt{color:#666;font-size:13px}dd{margin:0;font-weight:600}form{margin-top:20px;display:grid;gap:8px}input{padding:10px;font-size:16px;border:1px solid #bbb;border-radius:8px}
button{padding:10px;background:#0C3320;color:#fff;border:0;border-radius:8px;font-size:16px}</style></head>
<body><header><strong>Condomínio de Chácaras Bom Jardims</strong></header><main><h1>${esc(titulo)}</h1>${corpo}</main></body></html>`;
}

export function registrarRotasFinanceiro(app: Express) {
  const base = '/api/financeiro';

  // Tabelas de financiamento (aba Financeiro): PDF de um lote/área/valor e a tabela geral — escopo do usuário
  const tabelaPdf = (geral: boolean) => async (req: any, res: any) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).send('Faça login');
      const { carregarPermissoes } = await import('../permissoes');
      const { moduloLiberado } = await import('../../shared/permissoes');
      const perm = await carregarPermissoes(user);
      if (!moduloLiberado(perm.perfil, perm.modulos, 'financeiro.tabela')) return res.status(403).send('Sem acesso ao Financeiro');
      const T = await import('./tabelas');
      const { cartaoDoUsuario } = await import('../cartaoVendas');
      const q = req.query as Record<string, string | undefined>;
      const slug = q.slug && /^[a-z0-9-]{1,80}$/.test(q.slug) ? q.slug : 'bom-jardims';
      const b = await T.baseDoEmpreendimento(slug, perm);
      const cartao = await cartaoDoUsuario(user.id).catch(() => null);
      if (geral) return pdf(res, await T.pdfTabelaGeral(b, cartao), `Tabela-geral-${slug}.pdf`);
      const n = (v?: string) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
      const t = T.calcularTabela(b, {
        lote: q.lote && /^[A-Za-z0-9]{1,10}$/.test(q.lote) ? q.lote : null, areaM2: n(q.area), preco: n(q.preco),
        entrada: Number(q.entrada) || 6, prazo: Number(q.prazo) || 120, dataPrimeiro: q.data ?? null,
      });
      const nome = t.origem.tipo === 'lote' ? t.origem.codigo : t.origem.tipo === 'area' ? `area-${Math.round(t.origem.areaM2)}` : `valor-${Math.round(t.origem.preco)}`;
      pdf(res, await T.pdfTabelaFinanciamento(b, t, cartao), `Tabela-financiamento-${slug}-${nome}.pdf`);
    } catch (e: any) {
      if (e?.name === 'TabelaErro') return res.status(e.status).send(e.message);
      console.error('[Financeiro] tabela:', e);
      res.status(500).send('Falha ao gerar a tabela');
    }
  };
  app.get(`${base}/tabela.pdf`, tabelaPdf(false));
  app.get(`${base}/tabela-geral.pdf`, tabelaPdf(true));

  app.get(`${base}/cobrancas/:id/boleto-a4.pdf`, async (req, res) => {
    try {
      const a = await acesso(req, req.path);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const c = await cobrancaPorId(Number(req.params.id) || 0);
      const ctx = await contextoDocs(c.contratoId);
      const buf = await renderBoletoA4(dadosParcela(ctx, c, []));
      await auditar('boleto_a4', { contratoId: c.contratoId, cobrancaId: c.id, usuarioId: a.usuarioId, origem: a.origem, ip: req.ip });
      pdf(res, buf, `Boleto-${ctx.contrato.numero}-${c.tipo}-${c.numero}.pdf`);
    } catch (e) { erro(res, e); }
  });

  app.post(`${base}/cobrancas/:id/segunda-via`, async (req, res) => {
    try {
      const a = await acesso(req, req.path);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const id = Number(req.params.id) || 0;
      const r = await segundaVia(id);
      const c = await cobrancaPorId(id);
      await auditar('segunda_via_pedida', { contratoId: c.contratoId, cobrancaId: id, usuarioId: a.usuarioId, origem: a.origem, ip: req.ip, detalhe: { total: r.total } });
      pdf(res, r.pdf, `2a-via-${id}.pdf`);
    } catch (e) { erro(res, e); }
  });

  app.get(`${base}/contratos/:id/carne-v2.pdf`, async (req, res) => {
    try {
      const bloco = req.query.bloco === 'completo' ? 'completo' : Math.max(1, Number(req.query.bloco) || 1);
      const a = await acesso(req, `${req.path}?bloco=${bloco}`);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const contratoId = Number(req.params.id) || 0;
      const ctx = await contextoDocs(contratoId);
      const doBloco = blocoDoCarne(await cobrancasDoContrato(contratoId), bloco);
      if (!doBloco.length) return res.status(404).json({ erro: 'bloco_vazio' });
      const buf = await renderCarneV2(dadosCarne(ctx, doBloco, bloco));
      await auditar('carne_v2', { contratoId, usuarioId: a.usuarioId, origem: a.origem, ip: req.ip, detalhe: { bloco } });
      pdf(res, buf, `Carne-${ctx.contrato.numero}-${bloco}.pdf`);
    } catch (e) { erro(res, e); }
  });

  // Plano completo do contrato em planilha (todas as parcelas, com status e pagamento)
  app.get(`${base}/contratos/:id/plano.xlsx`, async (req, res) => {
    try {
      const a = await acesso(req, req.path, false);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const contratoId = Number(req.params.id) || 0;
      const ctx = await contextoDocs(contratoId);
      const cobs = await cobrancasDoContrato(contratoId);
      const { rotuloParcela } = await import('./dados');
      const { gerarXlsx } = await import('./planilha');
      const br = (s: string | null) => (s ? s.split('-').reverse().join('/') : '');
      const linhas = cobs.length
        ? cobs.map((c, i) => [i + 1, rotuloParcela(c), br(c.vencimentoOriginal ?? c.vencimento), c.valorOriginal ?? c.valor, c.juros, c.amortizacao, c.saldoDevedor, c.status, br(c.pagoEm || null), c.valorPago])
        : ctx.plano.parcelas.map((p, i) => [i + 1, rotuloParcela(p), br(p.vencimento), p.valor, p.juros, p.amortizacao, p.saldoDevedor, 'prevista', '', null]);
      const buf = gerarXlsx(`Plano ${ctx.contrato.numero}`, [
        ['Nº', 'Parcela', 'Vencimento', 'Valor (R$)', 'Juros (R$)', 'Amortização (R$)', 'Saldo após (R$)', 'Situação', 'Pago em', 'Valor pago (R$)'],
        ...linhas as any,
      ], [6, 16, 13, 14, 12, 16, 16, 12, 12, 15]);
      await auditar('plano_xlsx', { contratoId, usuarioId: a.usuarioId, origem: a.origem, ip: req.ip });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Plano-${ctx.contrato.numero}.xlsx"`);
      res.send(buf);
    } catch (e) { erro(res, e); }
  });

  app.get(`${base}/recibos/:id.pdf`, async (req, res) => {
    try {
      const a = await acesso(req, req.path);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const id = Number(req.params.id) || 0;
      const buf = await pdfRecibo(id);
      await auditar('recibo_pdf', { usuarioId: a.usuarioId, origem: a.origem, ip: req.ip, detalhe: { reciboId: id } });
      pdf(res, buf, `Recibo-${id}.pdf`);
    } catch (e) { erro(res, e); }
  });

  app.post(`${base}/recibos/:id/reenviar`, async (req, res) => {
    try {
      const a = await acesso(req, req.path, false);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const r = await enviarRecibo(Number(req.params.id) || 0, 'perfil');
      res.status(r.enviado ? 200 : 409).json(r);
    } catch (e) { erro(res, e); }
  });

  app.get(`${base}/contratos/:id/declaracao/:ano.pdf`, async (req, res) => {
    try {
      const a = await acesso(req, req.path);
      if (!a) return res.status(401).json({ erro: 'nao_autorizado' });
      const db = (await getDb()) as any;
      const contratoId = Number(req.params.id) || 0, ano = Number(req.params.ano) || 0;
      const linhas = await db.select().from(declaracoesQuitacao).where(eq(declaracoesQuitacao.contratoId, contratoId));
      const dcl = linhas.find((l: any) => Number(l.anoRef) === ano);
      if (!dcl) return res.status(404).json({ erro: 'nao_emitida' });
      if (dcl.status !== 'emitida' || !dcl.pdfArquivo) return res.status(409).json({ erro: 'retida', mensagem: dcl.motivo ?? 'Declaração retida — débito em aberto' });
      const arq = await lerArquivo(dcl.pdfArquivo);
      if (!arq) return res.status(404).json({ erro: 'arquivo' });
      await auditar('declaracao_pdf', { contratoId, usuarioId: a.usuarioId, origem: a.origem, ip: req.ip, detalhe: { ano } });
      pdf(res, arq.buf, `Declaracao-quitacao-${ano}.pdf`);
    } catch (e) { erro(res, e); }
  });

  // Carnê digital do comprador (/c/:codigo) — os documentos saem por links assinados
  app.get('/api/c/:codigo', async (req, res) => {
    try {
      const { carneDigital, dentroDoLimite } = await import('./carneDigital');
      const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '';
      if (!dentroDoLimite(ip)) return res.status(429).json({ erro: 'limite', mensagem: 'Muitas consultas — tente de novo em alguns minutos' });
      res.setHeader('Cache-Control', 'no-store');
      res.json(await carneDigital(String(req.params.codigo).toUpperCase(), { ip }));
    } catch (e) { erro(res, e); }
  });

  // Verificação pública do recibo (sem CPF; PDF só com o código de verificação)
  app.get('/r/:numero', async (req, res) => {
    try {
      const codigo = typeof req.query.codigo === 'string' ? req.query.codigo : undefined;
      const r = await verificarRecibo(String(req.params.numero), codigo);
      if (r.pdf) {
        await auditar('recibo_verificado', { origem: 'publico', ip: req.ip, detalhe: { numero: req.params.numero } });
        return pdf(res, r.pdf, `${req.params.numero}.pdf`);
      }
      res.status(r.status).type('html').send(r.html);
    } catch (e) { erro(res, e); }
  });

  // Webhook do Asaas
  app.post('/api/webhook/asaas', express.text({ type: () => true, limit: '2mb' }), async (req, res) => {
    const esperado = (process.env.ASAAS_WEBHOOK_TOKEN || '').trim();
    if (!esperado) return res.status(503).json({ erro: 'webhook não configurado' });
    const recebido = (req.header('asaas-access-token') || '').trim() || (typeof req.query.token === 'string' ? req.query.token.trim() : '');
    if (!tokenConfere(recebido, esperado)) {
      console.warn(`[Asaas webhook] 401: token ${recebido ? 'diferente' : 'ausente'}`);
      return res.status(401).json({ erro: 'token inválido' });
    }
    try {
      const ev = corpoDoEvento(req.body);
      const r = await processarEventoAsaas(ev);
      console.log(`[Asaas webhook] ${ev.event ?? '-'} ${ev.payment?.id ?? '-'} → ${r.acao}`);
      res.json({ ok: true, ...r });
    } catch (e) {
      console.error('[Asaas webhook] falha:', e);
      res.status(500).json({ erro: 'falha ao processar' });
    }
  });
}
