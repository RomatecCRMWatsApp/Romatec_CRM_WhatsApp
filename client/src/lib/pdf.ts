/**
 * pdf.js no navegador: abre o PDF e desenha páginas em canvas (leitura do contrato pelo signatário e tela de
 * posicionar as caixas de assinatura). O worker vem do próprio pacote (sem CDN).
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type DocumentoPdf = pdfjs.PDFDocumentProxy;

export async function abrirPdf(url: string): Promise<DocumentoPdf> {
  return pdfjs.getDocument({ url, withCredentials: true }).promise;
}

/** Desenha a página n (1-based) no canvas com a largura em CSS px; devolve o tamanho desenhado */
export async function desenharPagina(doc: DocumentoPdf, n: number, canvas: HTMLCanvasElement, larguraCss: number) {
  const pagina = await doc.getPage(n);
  const base = pagina.getViewport({ scale: 1 });
  const escala = larguraCss / base.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = pagina.getViewport({ scale: escala * dpr });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${larguraCss}px`;
  canvas.style.height = `${(vp.height / dpr).toFixed(1)}px`;
  await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
  return { largura: larguraCss, altura: vp.height / dpr };
}
