/**
 * Junta um comprovante (PDF ou imagem) ao fim de um PDF gerado pelo CRM: o PDF entra página a página (até 5),
 * a imagem vira uma página A4 com o título. Se o comprovante não abrir, devolve o PDF original.
 */
import { PDFDocument } from 'pdf-lib';

export type FonteAnexo = { url: string } | { buf: Buffer; mime?: string | null };

async function lerFonte(f: FonteAnexo): Promise<{ buf: Buffer; tipo: string } | null> {
  if ('buf' in f) return { buf: f.buf, tipo: String(f.mime ?? '') };
  const r = await fetch(f.url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return null;
  return { buf: Buffer.from(await r.arrayBuffer()), tipo: String(r.headers.get('content-type') ?? '') };
}

export async function anexarAoPdf(pdf: Buffer, fonte: FonteAnexo | null, titulo = 'ANEXO — COMPROVANTE DE PAGAMENTO'): Promise<Buffer> {
  if (!fonte) return pdf;
  try {
    const lido = await lerFonte(fonte);
    if (!lido) return pdf;
    const { buf, tipo } = lido;
    const doc = await PDFDocument.load(pdf);
    if (tipo.includes('pdf') || buf.subarray(0, 4).toString() === '%PDF') {
      const origem = await PDFDocument.load(buf, { ignoreEncryption: true });
      const paginas = await doc.copyPages(origem, origem.getPageIndices().slice(0, 5));
      paginas.forEach(p => doc.addPage(p));
    } else {
      const img = tipo.includes('png') || buf[0] === 0x89 ? await doc.embedPng(buf) : await doc.embedJpg(buf);
      const pg = doc.addPage([595.28, 841.89]);
      const max = { w: 595.28 - 80, h: 841.89 - 110 };
      const esc = Math.min(max.w / img.width, max.h / img.height, 1);
      const w = img.width * esc, h = img.height * esc;
      pg.drawText(titulo, { x: 40, y: 841.89 - 50, size: 11 });
      pg.drawImage(img, { x: (595.28 - w) / 2, y: 841.89 - 70 - h, width: w, height: h });
    }
    return Buffer.from(await doc.save());
  } catch (e: any) {
    console.warn('[PDF] Comprovante não anexado:', e?.message);
    return pdf;
  }
}
