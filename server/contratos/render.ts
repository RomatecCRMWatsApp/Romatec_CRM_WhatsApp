/**
 * Geração do PDF do contrato (spec §5.3 e §12): marca do empreendimento → merge DOCX → LibreOffice → anexos → faixa de minuta.
 */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import type { Ctx } from './contexto';

const exec = promisify(execFile);
export const pastaTemplates = () => path.resolve(process.env.CONTRATOS_TEMPLATES ?? 'templates');

export const TEXTO_MINUTA = 'MINUTA — SEM VALOR CONTRATUAL';

/** Mídias referenciadas por um .rels, na ordem gravada pelo gerador dos modelos */
function alvos(zip: PizZip, rels: string): string[] {
  const xml = zip.file(rels)?.asText();
  if (!xml) throw new Error(`Modelo sem ${rels}`);
  return Array.from(xml.matchAll(/Target="(media\/[^"]+)"/g), m => `word/${m[1]}`);
}

/** Troca cabeçalho, marca d'água e rodapé do modelo pelos da marca do empreendimento (header1: [0]=cabeçalho, [1]=marca d'água · footer1: [0]=rodapé) */
export async function aplicarMarca(zip: PizZip, slug: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Marca inválida');
  const dir = path.join(pastaTemplates(), 'marca', slug);
  const [cab, agua] = alvos(zip, 'word/_rels/header1.xml.rels');
  const [rod] = alvos(zip, 'word/_rels/footer1.xml.rels');
  if (!cab || !agua || !rod) throw new Error("Modelo fora do padrão de marca (cabeçalho/marca d'água/rodapé)");
  zip.file(cab, await readFile(path.join(dir, 'cabecalho.png')));
  zip.file(agua, await readFile(path.join(dir, 'marca_dagua.png')));
  zip.file(rod, await readFile(path.join(dir, 'rodape.png')));
}

/** Preenche o modelo. Na minuta, campo vazio sai como "[PREENCHER: tag]"; no definitivo, vazio (o gate já barrou o que é obrigatório) */
export async function mergeDocx(modelo: string, ctx: Ctx, opcoes: { minuta: boolean; marca: string }): Promise<Buffer> {
  const zip = new PizZip(await readFile(path.join(pastaTemplates(), modelo)));
  await aplicarMarca(zip, opcoes.marca);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part: any) => {
      if (part.module) return '';
      const tag = String(part.value ?? '');
      if (tag.endsWith('_resumo')) return '';
      return opcoes.minuta ? `[PREENCHER: ${tag}]` : '';
    },
  });
  // Texto vazio também é "a preencher" na minuta (os defaults do empreendimento trazem campos em branco)
  const dados = opcoes.minuta
    ? Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' && !k.endsWith('_resumo') ? null : v]))
    : ctx;
  try {
    doc.render(dados);
  } catch (e: any) {
    const det = e?.properties?.errors?.map((x: any) => x.properties?.explanation).join('; ') ?? e.message;
    throw new Error(`Falha no merge do modelo ${modelo}: ${det}`);
  }
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** DOCX → PDF pelo LibreOffice (perfil temporário por conversão, para rodar em paralelo) */
export async function docxParaPdf(docx: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ctr-'));
  try {
    const entrada = path.join(dir, 'c.docx');
    await writeFile(entrada, docx);
    await exec(process.env.SOFFICE_BIN ?? 'soffice',
      ['--headless', '--norestore', `-env:UserInstallation=${pathToFileURL(path.join(dir, 'lo')).href}`, '--convert-to', 'pdf', '--outdir', dir, entrada],
      { timeout: 120_000 });
    return await readFile(path.join(dir, 'c.pdf'));
  } catch (e: any) {
    throw new Error(`LibreOffice falhou na conversão: ${e.stderr || e.message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Faixa diagonal em todas as páginas (minuta) */
export async function marcaDagua(pdf: Buffer, texto: string): Promise<Buffer> {
  const d = await PDFDocument.load(pdf);
  const f = await d.embedFont(StandardFonts.HelveticaBold);
  const winAnsi = texto.replace(/—/g, '-');
  for (const p of d.getPages()) {
    const { width, height } = p.getSize();
    const size = Math.min(width, height) / 15;
    const w = f.widthOfTextAtSize(winAnsi, size);
    const ang = Math.atan2(height, width);
    p.drawText(winAnsi, {
      x: width / 2 - (w / 2) * Math.cos(ang), y: height / 2 - (w / 2) * Math.sin(ang),
      size, font: f, color: rgb(0.75, 0.1, 0.1), opacity: 0.18, rotate: degrees((ang * 180) / Math.PI),
    });
  }
  return Buffer.from(await d.save({ useObjectStreams: false }));
}

/** Contrato + anexos, na ordem recebida */
export async function anexar(principal: Buffer, anexos: Buffer[]): Promise<Buffer> {
  const out = await PDFDocument.load(principal);
  for (const a of anexos) {
    const src = await PDFDocument.load(a);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(pg => out.addPage(pg));
  }
  // Sem object streams: facilita as assinaturas incrementais depois
  return Buffer.from(await out.save({ useObjectStreams: false }));
}

export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
