/**
 * Páginas públicas só de leitura dos documentos (shared/documentosCliente.ts): o PDF é gerado como no modelo da aba
 * Contratos, convertido em imagens (pdftoppm → sharp, WEBP com a tarja "somente leitura") e só as imagens saem do
 * servidor — o cliente lê, mas não copia o texto, não baixa o PDF e não edita. Cache em memória por dia.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
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
  if (doc === 'estatuto' || doc === 'diretrizes' || doc === 'tabela' || doc === 'carne') {
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
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.json({ ok: true, paginas: paginas.length });
    } catch (e: any) { erro(res, e, 'páginas'); }
  });

  /** Uma página como imagem (nunca o PDF) */
  app.get('/api/public/documentos/:emp/:doc/:n.webp', async (req, res) => {
    try {
      const n = Number(req.params.n);
      if (!Number.isInteger(n) || n < 1 || n > 500) return res.status(404).end();
      const paginas = await paginasDoDocumento(req.params.emp, req.params.doc);
      const img = paginas[n - 1];
      if (!img) return res.status(404).end();
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.send(img);
    } catch (e: any) { erro(res, e, 'imagem'); }
  });
}
