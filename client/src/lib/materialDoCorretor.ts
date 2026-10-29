/**
 * Material de divulgação com os dados de quem divulga (corretor logado): banner com rodapé carimbado
 * (nome, CRECI, WhatsApp, Instagram e QR do link dele), vídeo com a faixa do corretor (Cloudinary, gerada
 * no servidor de mídia) e PDF com rodapé em todas as páginas. O texto que acompanha leva o link com o ?c=
 * e a assinatura (shared/cartaoVendas.ts). Se o carimbo falhar, o arquivo original segue com o texto.
 */
import QRCode from "qrcode";
import { assinaturaWhatsApp, linhasRodape, type CartaoVendas } from "@shared/cartaoVendas";
import { comRef } from "@/lib/cartaoVendas";

const VERDE = "#0C3320";
const DOURADO = "#C9A84C";

/** Página pública do material (onde o QR e o link levam), já com o código do corretor */
export function linkDoMaterial(grupo: { empreendimentoSlug?: string | null; propertyId?: number | null; nome?: string }, ref: string | null): string {
  const base = window.location.origin;
  let caminho = "/imoveis";
  if (grupo.empreendimentoSlug) caminho = grupo.empreendimentoSlug === "bom-jardims" ? "/bom-jardims" : `/agendar/${grupo.empreendimentoSlug}`;
  else if (grupo.propertyId) {
    const codigo = /IMV-\d{4}/i.exec(grupo.nome ?? "")?.[0];
    if (codigo) caminho = `/i/${codigo.toUpperCase()}`;
  }
  return comRef(`${base}${caminho}?utm_source=whatsapp&utm_medium=material`, ref);
}

/** Legenda do envio: título, link do corretor e assinatura */
export function legendaDoMaterial(titulo: string, link: string, c: CartaoVendas): string {
  return `${titulo}\n\n👉 Saiba mais: ${link}\n\n${assinaturaWhatsApp(c)}`;
}

async function blobDe(url: string): Promise<Blob> {
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.blob();
}

async function imagemDe(url: string): Promise<ImageBitmap | null> {
  try { return await createImageBitmap(await blobDe(url)); } catch { return null; }
}

function ajustarFonte(ctx: CanvasRenderingContext2D, texto: string, peso: string, tamanho: number, largura: number) {
  let t = tamanho;
  do { ctx.font = `${peso} ${t}px Lato, "Segoe UI", Arial, sans-serif`; t -= 1; } while (ctx.measureText(texto).width > largura && t > 10);
}

/** Banner + faixa do corretor embaixo (a arte não é coberta) */
export async function bannerDoCorretor(url: string, c: CartaoVendas, link: string): Promise<Blob> {
  const img = await createImageBitmap(await blobDe(url));
  const w = img.width;
  const faixa = Math.round(Math.max(130, Math.min(w * 0.17, 320)));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = img.height + faixa;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const y0 = img.height;
  ctx.fillStyle = VERDE; ctx.fillRect(0, y0, w, faixa);
  ctx.fillStyle = DOURADO; ctx.fillRect(0, y0, w, Math.max(3, Math.round(faixa * 0.03)));

  const pad = Math.round(faixa * 0.12);
  const qrLado = faixa - pad * 2;
  // QR do link do corretor (fundo branco para ler bem)
  const qr = await createImageBitmap(await (await fetch(await QRCode.toDataURL(link, { margin: 1, width: qrLado }))).blob());
  ctx.fillStyle = "#fff"; ctx.fillRect(w - pad - qrLado, y0 + pad, qrLado, qrLado);
  ctx.drawImage(qr, w - pad - qrLado, y0 + pad, qrLado, qrLado);

  // Foto redonda (se o cadastro tiver e o servidor de imagem deixar)
  let x = pad;
  const foto = c.fotoUrl ? await imagemDe(c.fotoUrl) : null;
  if (foto) {
    const d = qrLado;
    ctx.save(); ctx.beginPath(); ctx.arc(x + d / 2, y0 + pad + d / 2, d / 2, 0, Math.PI * 2); ctx.clip();
    const s = Math.max(d / foto.width, d / foto.height);
    ctx.drawImage(foto, x + (d - foto.width * s) / 2, y0 + pad + (d - foto.height * s) / 2, foto.width * s, foto.height * s);
    ctx.restore();
    ctx.strokeStyle = DOURADO; ctx.lineWidth = Math.max(2, d * 0.04); ctx.beginPath(); ctx.arc(x + d / 2, y0 + pad + d / 2, d / 2, 0, Math.PI * 2); ctx.stroke();
    x += d + pad;
  }
  const larguraTexto = w - x - qrLado - pad * 2;
  const { nome, detalhe } = linhasRodape(c);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DOURADO;
  ajustarFonte(ctx, "FALE COM O SEU CORRETOR", "700", Math.round(faixa * 0.13), larguraTexto);
  ctx.fillText("FALE COM O SEU CORRETOR", x, y0 + pad + faixa * 0.14);
  ctx.fillStyle = "#fff";
  ajustarFonte(ctx, nome, "700", Math.round(faixa * 0.22), larguraTexto);
  ctx.fillText(nome, x, y0 + pad + faixa * 0.42);
  ctx.fillStyle = "#F3EEDF";
  ajustarFonte(ctx, detalhe, "400", Math.round(faixa * 0.17), larguraTexto);
  ctx.fillText(detalhe, x, y0 + pad + faixa * 0.66);

  return new Promise((ok, erro) => cv.toBlob(b => (b ? ok(b) : erro(new Error("canvas"))), "image/jpeg", 0.92));
}

/** PDF (folder, apresentação) com rodapé do corretor em todas as páginas */
export async function pdfDoCorretor(url: string, c: CartaoVendas, link: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await (await blobDe(url)).arrayBuffer(), { ignoreEncryption: true });
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const { nome, detalhe } = linhasRodape(c);
  // Fontes padrão do PDF (WinAnsi): troca o que não existe nelas
  const seguro = (t: string) => t.replace(/[^\x20-\x7E -ÿ]/g, "");
  for (const p of pdf.getPages()) {
    const { width } = p.getSize();
    const h = 30;
    p.drawRectangle({ x: 0, y: 0, width, height: h, color: rgb(0.047, 0.2, 0.125) });
    p.drawRectangle({ x: 0, y: h, width, height: 1.5, color: rgb(0.79, 0.66, 0.3) });
    p.drawText(seguro(nome), { x: 12, y: 17, size: 9.5, font: negrito, color: rgb(1, 1, 1) });
    p.drawText(seguro(`${detalhe}${detalhe ? "  ·  " : ""}${link}`), { x: 12, y: 6, size: 7, font: normal, color: rgb(0.95, 0.93, 0.87), maxWidth: width - 24 });
  }
  return new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
}

/** Vídeo do Cloudinary com a faixa do corretor embaixo (transformação no servidor de mídia); null se não der */
export function urlVideoDoCorretor(url: string, c: CartaoVendas, larguraVideo = 720): string | null {
  if (!/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url)) return null;
  const { nome, detalhe } = linhasRodape(c);
  // Texto do Cloudinary: vírgula e barra com escape duplo; sem emoji
  const enc = (t: string) => encodeURIComponent(t.replace(/[^\x20-\x7E -ÿ]/g, "")).replace(/%2C/g, "%252C").replace(/%2F/g, "%252F");
  const tam = Math.max(20, Math.round(larguraVideo * 0.036));
  const camada = `l_text:Arial_${tam}_bold_center:${enc(nome)}%0A${enc(detalhe)},co_rgb:FFFFFF,b_rgb:0C3320,bo_${Math.round(tam / 2)}px_solid_rgb:0C3320/fl_layer_apply,g_south,y_${Math.round(tam * 1.6)}`;
  return url.replace("/video/upload/", `/video/upload/${camada}/`);
}

/** Largura real do vídeo (para o tamanho da letra da faixa) */
function larguraDoVideo(url: string): Promise<number> {
  return new Promise(ok => {
    const v = document.createElement("video");
    const fim = (n: number) => { v.removeAttribute("src"); ok(n); };
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => fim(v.videoWidth || 720);
    v.onerror = () => fim(720);
    setTimeout(() => fim(720), 8000);
    v.src = url;
  });
}

/** Baixa o vídeo com a faixa; o Cloudinary responde 423 enquanto gera a primeira vez — espera até ~2 min */
export async function videoDoCorretor(url: string, c: CartaoVendas, aoEsperar?: (s: number) => void): Promise<{ blob: Blob; url: string } | null> {
  const alvo = urlVideoDoCorretor(url, c, await larguraDoVideo(url));
  if (!alvo) return null;
  const inicio = Date.now();
  while (Date.now() - inicio < 120_000) {
    try {
      const r = await fetch(alvo, { mode: "cors" });
      if (r.ok) return { blob: await r.blob(), url: alvo };
      if (r.status !== 423) return null;
    } catch { return null; }
    aoEsperar?.(Math.round((Date.now() - inicio) / 1000));
    await new Promise(r => setTimeout(r, 5000));
  }
  return null;
}
