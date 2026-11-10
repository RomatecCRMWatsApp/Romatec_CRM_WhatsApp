/**
 * Anexos dos Recibos de Adiantamento: o comprovante do pagamento (print do PIX, TED, boleto pago) e o documento de origem
 * (medição, boletim de horas da máquina, orçamento) entram logo depois do recibo, cada página com a tarja
 * "Recibo de Adiantamento n.º 001/2026 · Anexo 1 — Comprovante de pagamento", para não se separarem do recibo.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { TIPOS_ANEXO_APORTE } from '../../shared/gestao';
import type { AnexoAporte } from './servico';

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 36;
const TARJA = 30;

export interface ArquivoAnexo extends AnexoAporte { buf: Buffer }
export interface GrupoAnexos { recibo: string; contrato: string; arquivos: ArquivoAnexo[] }

/** Rótulo do anexo no recibo: "Comprovante de pagamento — PIX C6 Bank 12:50" */
export const rotuloAnexo = (a: Pick<AnexoAporte, 'tipo' | 'descricao' | 'nome'>) =>
  `${TIPOS_ANEXO_APORTE[a.tipo] ?? 'Anexo'}${a.descricao ? ` — ${a.descricao}` : ''}`;

/** Troca caracteres fora do WinAnsi (fonte padrão do PDF) por equivalentes */
const winAnsi = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF—–…•ºª€]/g, '');

/** Texto que cabe na largura: diminui a fonte até o mínimo e, se ainda não couber, corta com reticências */
function caber(fonte: PDFFont, texto: string, tam: number, largura: number): { t: string; tam: number } {
  let t = winAnsi(texto);
  for (let s = tam; s >= 6; s -= 0.5) if (fonte.widthOfTextAtSize(t, s) <= largura) return { t, tam: s };
  while (t.length > 4 && fonte.widthOfTextAtSize(`${t}…`, 6) > largura) t = t.slice(0, -1);
  return { t: `${t.trimEnd()}…`, tam: 6 };
}

/** Tarja de identificação no alto da página (as páginas de PDF anexo ganham a faixa acima do conteúdo, sem cobri-lo) */
function tarja(p: PDFPage, f: PDFFont, fb: PDFFont, linha1: string, linha2: string) {
  const { width, height } = p.getSize();
  const larg = width - 2 * MARGEM;
  p.drawLine({ start: { x: MARGEM, y: height - TARJA }, end: { x: width - MARGEM, y: height - TARJA }, thickness: 0.6, color: rgb(0.55, 0.45, 0.2) });
  const a = caber(fb, linha1, 8.5, larg), b = caber(f, linha2, 7.5, larg);
  p.drawText(a.t, { x: MARGEM, y: height - 13, size: a.tam, font: fb, color: rgb(0.1, 0.1, 0.1) });
  p.drawText(b.t, { x: MARGEM, y: height - 24, size: b.tam, font: f, color: rgb(0.35, 0.35, 0.35) });
}

/** Aumenta a página para cima na altura da tarja, mantendo o conteúdo original intacto */
function abrirEspacoTarja(p: PDFPage) {
  const m = p.getMediaBox();
  p.setMediaBox(m.x, m.y, m.width, m.height + TARJA);
  const c = p.getCropBox();
  p.setCropBox(c.x, c.y, c.width, c.height + TARJA);
}

/**
 * Acrescenta ao PDF as páginas dos anexos de cada recibo. Arquivo que não abre vira página de aviso,
 * sem derrubar o documento.
 */
export async function anexarAoPdf(pdf: Buffer, grupos: GrupoAnexos[]): Promise<Buffer> {
  if (!grupos.some(g => g.arquivos.length)) return pdf;
  const doc = await PDFDocument.load(pdf);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const g of grupos) {
    let n = 0;
    for (const a of g.arquivos) {
      n++;
      const l1 = `Recibo de Adiantamento n.º ${g.recibo} · Anexo ${n} — ${rotuloAnexo(a)}`;
      const l2 = `Parte integrante do recibo e do Contrato de Gestão n.º ${g.contrato} · arquivo: ${a.nome}`;
      try {
        if (a.mime === 'application/pdf') {
          const src = await PDFDocument.load(a.buf, { ignoreEncryption: true });
          const paginas = await doc.copyPages(src, src.getPageIndices());
          paginas.forEach((pg, i) => { doc.addPage(pg); abrirEspacoTarja(pg); tarja(pg, f, fb, l1 + (paginas.length > 1 ? ` (pág. ${i + 1}/${paginas.length})` : ''), l2); });
        } else {
          const img = a.mime === 'image/png' ? await doc.embedPng(a.buf) : await doc.embedJpg(a.buf);
          const pg = doc.addPage(A4);
          const larg = A4[0] - 2 * MARGEM, alt = A4[1] - TARJA - 2 * MARGEM;
          const k = Math.min(larg / img.width, alt / img.height, 2.5);
          const w = img.width * k, h = img.height * k;
          pg.drawImage(img, { x: (A4[0] - w) / 2, y: MARGEM + (alt - h) / 2, width: w, height: h });
          pg.drawRectangle({ x: (A4[0] - w) / 2, y: MARGEM + (alt - h) / 2, width: w, height: h, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
          tarja(pg, f, fb, l1, l2);
        }
      } catch (e: any) {
        console.warn(`[Gestão] anexo "${a.nome}" não abriu:`, e?.message);
        const pg = doc.addPage(A4);
        tarja(pg, f, fb, l1, l2);
        pg.drawText(winAnsi(`Arquivo ilegível (${a.nome}): reenvie o anexo pelo CRM.`), { x: MARGEM, y: A4[1] / 2, size: 11, font: fb, color: rgb(0.6, 0.1, 0.1) });
      }
    }
  }
  return Buffer.from(await doc.save());
}
