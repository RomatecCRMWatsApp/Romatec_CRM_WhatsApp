/**
 * Páginas públicas só de leitura dos documentos (shared/documentosCliente.ts): o PDF é gerado como no modelo da aba
 * Contratos, convertido em imagens (pdftoppm → sharp, WEBP com a tarja "somente leitura") e só as imagens saem do
 * servidor — o cliente lê, mas não copia o texto, não baixa o PDF e não edita. Cache em memória por dia.
 *
 * Rastreio: cada página sai carimbada com quem enviou o link (?c=: nome, CRECI, código e data) e cada abertura fica
 * registrada em campanhaCliques (campanha "DOC:<doc>", ação "leitura", utmSource = código do link) — um print que
 * vazar mostra de qual link saiu.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { getDb } from './db';
import { campanhaCliques } from '../drizzle/schema';
import { corretorDoLink } from './obrasBomJardim';
import { documentoCliente, empDocsValido } from '../shared/documentosCliente';

const run = promisify(execFile);
const LARGURA = 1240;
const VALIDADE_MS = 6 * 3600_000;
const TARJA = 'SOMENTE LEITURA · ROMATEC';

export class DocErro extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** PDF do documento (mesmos geradores dos modelos da aba Contratos; nada é gravado) */
export async function pdfDoDocumento(emp: string, doc: string): Promise<Buffer> {
  if (doc === 'contrato') {
    const { contratoModelo } = await import('./contratos/modelo');
    return contratoModelo(emp, 'A01', null);
  }
  if (doc === 'tarifa-agua') {
    const { prepararModelo } = await import('./contratos/modelo');
    const { anexoTarifaAgua } = await import('./contratos/anexos');
    const m = await prepararModelo(emp, 'A01', null);
    const pdf = await anexoTarifaAgua(m.j.marcaSlug);
    if (!pdf) throw new DocErro(404, 'Tabela tarifária ainda não anexada');
    return pdf;
  }
  if (doc === 'intermediacao' || doc === 'estatuto' || doc === 'diretrizes' || doc === 'tabela' || doc === 'carne') {
    const { modeloDocumento } = await import('./contratos/modelosDocs');
    return (await modeloDocumento(doc, emp, null)).pdf;
  }
  throw new DocErro(404, 'Documento não encontrado');
}

const tarjaSvg = (w: number, h: number) => {
  const fs_ = Math.round(w / 18);
  const linhas = Array.from({ length: Math.ceil(h / (w * 0.55)) + 1 }, (_, i) => {
    const y = Math.round(w * 0.3 + i * w * 0.55);
    return `<text x="${w / 2}" y="${y}" transform="rotate(-30 ${w / 2} ${y})" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fs_}" fill="#0C3320" fill-opacity="0.07" letter-spacing="4">${TARJA}</text>`;
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${linhas}</svg>`);
};

/** PDF → páginas WEBP com a tarja (pdftoppm vem do Dockerfile, como em server/credenciais.ts) */
export async function paginasDoPdf(pdf: Buffer): Promise<Buffer[]> {
  const sharp = (await import('sharp')).default;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-leitura-'));
  try {
    const entrada = path.join(dir, 'doc.pdf');
    await fs.writeFile(entrada, pdf);
    await run('pdftoppm', ['-png', '-r', '150', '-scale-to-x', String(LARGURA), '-scale-to-y', '-1', entrada, path.join(dir, 'p')], { timeout: 120_000 });
    const arquivos = (await fs.readdir(dir)).filter(f => f.startsWith('p') && f.endsWith('.png')).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
    if (!arquivos.length) throw new Error('PDF sem páginas');
    const out: Buffer[] = [];
    for (const f of arquivos) {
      const img = sharp(await fs.readFile(path.join(dir, f)));
      const { width = LARGURA, height = LARGURA } = await img.metadata();
      out.push(await img.composite([{ input: tarjaSvg(width, height) }]).webp({ quality: 82 }).toBuffer());
    }
    return out;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Rastreio ────────────────────────────────────────────────────────────────
export interface Remetente { id: number | null; nome: string; creci: string | null; ref: string | null }
const refValida = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{9,16}$/.test(v) ? v : null);
const remetentes = new Map<string, { em: number; r: Remetente }>();

/** Quem enviou o link (?c=); sem código válido, "Romatec" */
export async function remetenteDoLink(ref: unknown): Promise<Remetente> {
  const c = refValida(ref);
  if (!c) return { id: null, nome: 'Romatec Consultoria Total', creci: 'CRECI/MA 4.705', ref: null };
  const x = remetentes.get(c);
  if (x && Date.now() - x.em < 10 * 60_000) return x.r;
  const u = await corretorDoLink(c).catch(() => null);
  const r: Remetente = u ? { id: u.id, nome: u.nome, creci: u.creci, ref: c } : { id: null, nome: 'Link não identificado', creci: null, ref: c };
  remetentes.set(c, { em: Date.now(), r });
  return r;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataBR = () => hoje().split('-').reverse().join('/');

/** Linha do carimbo: "Enviado por NOME · CRECI · cód. XXXX · 29/10/2026" */
export const textoCarimbo = (r: Remetente) =>
  ['Enviado por ' + r.nome, r.creci, r.ref ? `cód. ${r.ref}` : null, dataBR()].filter(Boolean).join(' · ');

const carimboSvg = (w: number, h: number, r: Remetente) => {
  const linha = esc(textoCarimbo(r));
  const marca = esc(`${r.nome}${r.ref ? ` · ${r.ref}` : ''}`);
  const fs_ = Math.round(w / 48);
  const diagonais = Array.from({ length: Math.ceil(h / (w * 0.55)) + 1 }, (_, i) => {
    const y = Math.round(w * 0.58 + i * w * 0.55);
    return `<text x="${w / 2}" y="${y}" transform="rotate(-30 ${w / 2} ${y})" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${Math.round(w / 34)}" fill="#8A2D2D" fill-opacity="0.07">${marca}</text>`;
  }).join('');
  const faixa = Math.round(fs_ * 2.2);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${diagonais}
<rect x="0" y="0" width="${w}" height="${faixa}" fill="#F3EEDF" fill-opacity="0.92"/>
<text x="${w / 2}" y="${Math.round(faixa * 0.68)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fs_}" fill="#0C3320">${linha}</text></svg>`);
};

const carimbadas = new Map<string, Buffer>();
/** Página com o carimbo de quem enviou (cache curto por link, página e dia) */
export async function paginaCarimbada(base: Buffer, r: Remetente, chave: string): Promise<Buffer> {
  const k = `${chave}:${r.ref ?? '-'}:${hoje()}`;
  const c = carimbadas.get(k);
  if (c) return c;
  const sharp = (await import('sharp')).default;
  const img = sharp(base);
  const { width = LARGURA, height = LARGURA } = await img.metadata();
  const out = await img.composite([{ input: carimboSvg(width, height, r) }]).webp({ quality: 82 }).toBuffer();
  if (carimbadas.size > 400) carimbadas.delete(carimbadas.keys().next().value!);
  carimbadas.set(k, out);
  return out;
}

const vistos = new Map<string, number>();
/** Uma abertura por IP + documento + link a cada 30 min */
export async function registrarLeitura(doc: string, r: Remetente, ip: string) {
  const k = `${ip}:${doc}:${r.ref ?? '-'}`;
  const ult = vistos.get(k);
  if (ult && Date.now() - ult < 30 * 60_000) return;
  vistos.set(k, Date.now());
  if (vistos.size > 5000) vistos.clear();
  try {
    const d: any = await getDb();
    if (d) await d.insert(campanhaCliques).values({ campanha: `DOC:${doc}`, acao: 'leitura', corretorId: r.id, utmSource: r.ref, criadoEm: new Date() });
  } catch (e: any) { console.warn('[Documentos] leitura não registrada:', e?.message); }
}

const ipDe = (req: any) => {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
  return fwd[fwd.length - 1] || req.socket?.remoteAddress || 'unknown';
};

type Gerador = (emp: string, doc: string) => Promise<Buffer[]>;
let gerador: Gerador = async (emp, doc) => paginasDoPdf(await pdfDoDocumento(emp, doc));
/** Testes trocam o gerador (sem LibreOffice/poppler na máquina) */
export const definirGerador = (g: Gerador | null) => { gerador = g ?? (async (emp, doc) => paginasDoPdf(await pdfDoDocumento(emp, doc))); cache.clear(); };

const cache = new Map<string, { em: number; paginas: Promise<Buffer[]> }>();
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Páginas do documento; pedidos simultâneos esperam a mesma geração */
export async function paginasDoDocumento(emp: string, doc: string): Promise<Buffer[]> {
  const d = documentoCliente(doc);
  if (!empDocsValido(emp) || !d || d.forma !== 'pdf') throw new DocErro(404, 'Documento não encontrado');
  const chave = `${emp}:${doc}:${hoje()}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.em < VALIDADE_MS) return c.paginas;
  const paginas = gerador(emp, doc);
  cache.set(chave, { em: Date.now(), paginas });
  // Falhou: sai do cache para a próxima visita tentar de novo
  paginas.catch(() => { if (cache.get(chave)?.paginas === paginas) cache.delete(chave); });
  return paginas;
}

export function registrarRotasDocumentosCliente(app: Express) {
  const erro = (res: any, e: any, onde: string) => {
    if (e instanceof DocErro) return res.status(e.status).json({ ok: false, error: e.message });
    if (e?.status === 404) return res.status(404).json({ ok: false, error: e.message || 'Não encontrado' });
    console.error(`[Documentos] ${onde}:`, e);
    res.status(503).json({ ok: false, error: 'Documento indisponível no momento. Tente de novo em instantes.' });
  };

  /** Quantas páginas o documento tem (gera e guarda as imagens) */
  app.get('/api/public/documentos/:emp/:doc', async (req, res) => {
    try {
      const paginas = await paginasDoDocumento(req.params.emp, req.params.doc);
      registrarLeitura(req.params.doc, await remetenteDoLink(req.query.c), ipDe(req)).catch(() => {});
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.json({ ok: true, paginas: paginas.length });
    } catch (e: any) { erro(res, e, 'páginas'); }
  });

  /** Uma página como imagem (nunca o PDF), carimbada com quem enviou o link */
  app.get('/api/public/documentos/:emp/:doc/:n.webp', async (req, res) => {
    try {
      const n = Number(req.params.n);
      if (!Number.isInteger(n) || n < 1 || n > 500) return res.status(404).end();
      const paginas = await paginasDoDocumento(req.params.emp, req.params.doc);
      const base = paginas[n - 1];
      if (!base) return res.status(404).end();
      const img = await paginaCarimbada(base, await remetenteDoLink(req.query.c), `${req.params.emp}:${req.params.doc}:${n}`);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=1800');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.send(img);
    } catch (e: any) { erro(res, e, 'imagem'); }
  });
}
