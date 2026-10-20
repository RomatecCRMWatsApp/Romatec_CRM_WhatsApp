/**
 * Folder da chácara inteiro em JPEG, para mandar pelo WhatsApp e ler no celular: capa (foto, cidade,
 * nome, chácara/quadra/área), mapa de localização com o lote destacado, medidas e coordenadas dos
 * vértices, QR Code da página do empreendimento, contato e avisos — numa coluna só.
 * Feito no canvas, sem dependência: o mapa já é um SVG em linha (só padrões internos) e o QR é data URL.
 */

import { SANS, SERIF, carregarImagem, primeiraQueCarrega, svgParaImagem, quebrar, fonteQueCabe, renderizarJpeg } from "./canvasDoc";

const VERDE = "#0C3320", OURO = "#C9A84C", TEXTO = "#16301f", LINHA = "#E6ECDF", CINZA = "#6b7a6f";
const LARGURA = 1080, M = 48, ALTURA_CAPA = 380;

export interface DadosFolder {
  slug: string;
  svg: SVGSVGElement;
  local: string;                       // "Açailândia — MA"
  nome: string;                        // nome do empreendimento
  linha: string;                       // "Chácara B13 · Quadra B · 3.025,11 m²"
  tituloMapa: string;                  // "Localização da chácara"
  medidas?: { rotulo: string; valor: string }[];
  resumoMedidas?: string;              // "Área: … · Perímetro: … · Acesso pela …"
  coordenadas?: { titulo: string; linhas: { v: string; e: string; n: string }[] };
  diferenciais: [string, string][];
  qr: string;                          // data URL do QR Code da página
  textoQr: string;                     // "Aponte a câmera para ver fotos, vídeo e o mapa"
  whatsapp: string;                    // "(99) 9 9181-1246"
  aviso: string;
}

type Recursos = { foto: HTMLImageElement | null; mapa: { img: HTMLImageElement; altura: number }; qr: HTMLImageElement | null };

/** Desenha (ou só mede, com desenhar=false) o folder; devolve a altura total */
function compor(ctx: CanvasRenderingContext2D, d: DadosFolder, r: Recursos, desenhar: boolean): number {
  const util = LARGURA - 2 * M;
  const fill = (cor: string) => { ctx.fillStyle = cor; };
  const texto = (t: string, x: number, y: number) => { if (desenhar) ctx.fillText(t, x, y); };
  const espacado = (t: string, x: number, y: number, esp: number) => { (ctx as any).letterSpacing = `${esp}px`; texto(t, x, y); (ctx as any).letterSpacing = "0px"; };
  const titulo = (t: string, y: number) => { fill(VERDE); ctx.font = `700 22px ${SANS}`; espacado(t.toUpperCase(), M, y, 2); };
  ctx.textBaseline = "alphabetic";

  // ── Capa
  if (desenhar) {
    fill(VERDE); ctx.fillRect(0, 0, LARGURA, ALTURA_CAPA);
    if (r.foto) {
      const esc = Math.max(LARGURA / r.foto.width, ALTURA_CAPA / r.foto.height);
      const w = r.foto.width * esc, h = r.foto.height * esc;
      ctx.drawImage(r.foto, (LARGURA - w) / 2, (ALTURA_CAPA - h) / 2, w, h);
    }
    const g = ctx.createLinearGradient(0, 0, 0, ALTURA_CAPA);
    g.addColorStop(0, "rgba(12,51,32,0.15)");
    g.addColorStop(1, "rgba(12,51,32,0.88)");
    fill(g as any); ctx.fillRect(0, 0, LARGURA, ALTURA_CAPA);
  }
  fill(OURO); ctx.font = `600 18px ${SANS}`; espacado(d.local.toUpperCase(), M, ALTURA_CAPA - 142, 5);
  fill("#FFFFFF"); fonteQueCabe(ctx, d.nome, util, "700", 46, SERIF); texto(d.nome, M, ALTURA_CAPA - 88);
  fonteQueCabe(ctx, d.linha, util, "600", 32, SANS); texto(d.linha, M, ALTURA_CAPA - 38);

  // ── Mapa de localização
  let y = ALTURA_CAPA + 58;
  titulo(d.tituloMapa, y);
  y += 20;
  if (desenhar) {
    ctx.drawImage(r.mapa.img, M, y, util, r.mapa.altura);
    ctx.strokeStyle = "#D7DED3"; ctx.lineWidth = 2; ctx.strokeRect(M, y, util, r.mapa.altura);
  }
  y += r.mapa.altura;

  // ── Medidas e coordenadas (folder da chácara) / diferenciais (folder geral)
  const lista = (linhas: { esq: string; dir?: string }[], fonte: number, alturaLinha: number) => {
    for (const l of linhas) {
      y += alturaLinha;
      fill(TEXTO); ctx.font = `400 ${fonte}px ${SANS}`; texto(l.esq, M, y);
      if (l.dir) { ctx.font = `700 ${fonte}px ${SANS}`; const w = ctx.measureText(l.dir).width; texto(l.dir, LARGURA - M - w, y); }
      if (desenhar) { fill(LINHA); ctx.fillRect(M, y + 10, util, 1.5); }
    }
  };
  if (d.medidas?.length) {
    y += 64; titulo("Medidas", y); y += 6;
    lista(d.medidas.map(m => ({ esq: m.rotulo, dir: m.valor })), 24, 42);
    if (d.resumoMedidas) {
      ctx.font = `600 24px ${SANS}`; fill(TEXTO);
      for (const l of quebrar(ctx, d.resumoMedidas, util)) { y += 38; texto(l, M, y); }
    }
  }
  if (d.coordenadas?.linhas.length) {
    y += 64; titulo("Coordenadas dos vértices", y);
    y += 32; fill(CINZA); ctx.font = `400 20px ${SANS}`; texto(d.coordenadas.titulo, M, y);
    const colE = M + 110, colN = M + 110 + util * 0.45;
    y += 6;
    for (const c of d.coordenadas.linhas) {
      y += 40;
      fill(VERDE); ctx.font = `700 24px ${SANS}`; texto(c.v, M, y);
      fill(TEXTO); ctx.font = `400 24px ${SANS}`; texto(`E ${c.e}`, colE, y); texto(`N ${c.n}`, colN, y);
      if (desenhar) { fill(LINHA); ctx.fillRect(M, y + 10, util, 1.5); }
    }
  }
  if (!d.medidas?.length) {
    y += 64; titulo("O condomínio", y); y += 4;
    for (const [i, t] of d.diferenciais) { y += 44; fill(TEXTO); ctx.font = `400 25px ${SANS}`; texto(`${i}  ${t}`, M, y); }
  }

  // ── Contato com o QR Code (leva à página com fotos, vídeo e mapa)
  y += 48;
  const qrTam = 340, topo = y, pad = 36;
  let yc = topo + pad + 26;
  const centro = (t: string, yy: number) => { const w = ctx.measureText(t).width; texto(t, (LARGURA - w) / 2, yy); };
  // Altura fixa do quadro (título, QR, 2 linhas, WhatsApp, rodapé): o fundo é pintado antes do conteúdo
  const alturaQuadro = pad + 26 + 24 + qrTam + 24 + 2 * 32 + 30 + 64 + 30 + 34 + pad;
  if (desenhar) {
    fill(VERDE); ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(M, topo, util, alturaQuadro, 28); else ctx.rect(M, topo, util, alturaQuadro);
    ctx.fill();
  }
  fill(OURO); ctx.font = `700 28px ${SANS}`; centro("Agende sua visita", yc);
  yc += 24;
  if (desenhar) {
    fill("#FFFFFF"); ctx.beginPath();
    const xq = (LARGURA - qrTam) / 2;
    if ((ctx as any).roundRect) (ctx as any).roundRect(xq - 12, yc, qrTam + 24, qrTam + 24, 18); else ctx.rect(xq - 12, yc, qrTam + 24, qrTam + 24);
    ctx.fill();
    if (r.qr) ctx.drawImage(r.qr, xq, yc + 12, qrTam, qrTam);
  }
  yc += qrTam + 24;
  fill("#DCE8DF"); ctx.font = `400 22px ${SANS}`;
  const linhasQr = quebrar(ctx, d.textoQr, util - 2 * pad).slice(0, 2);
  for (const l of linhasQr) { yc += 32; centro(l, yc); }
  yc += 30 + (2 - linhasQr.length) * 32;
  // "Pílula" do WhatsApp
  ctx.font = `700 28px ${SANS}`;
  const zap = `WhatsApp ${d.whatsapp}`, wz = ctx.measureText(zap).width + 64;
  if (desenhar) {
    fill(OURO); ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect((LARGURA - wz) / 2, yc, wz, 58, 29); else ctx.rect((LARGURA - wz) / 2, yc, wz, 58);
    ctx.fill();
  }
  fill(VERDE); centro(zap, yc + 39);
  yc += 64 + 30;
  fill("#DCE8DF"); ctx.font = `400 20px ${SANS}`; centro("Romatec Consultoria Total · José Romário — CRECI/MA 4.705", yc);
  y = topo + alturaQuadro;

  // ── Diferenciais em linha (folder da chácara) e aviso
  if (d.medidas?.length) {
    y += 60; titulo("O condomínio", y);
    fill(TEXTO); ctx.font = `400 23px ${SANS}`;
    for (const l of quebrar(ctx, d.diferenciais.map(([i, t]) => `${i} ${t}`).join("  ·  "), util)) { y += 36; texto(l, M, y); }
  }
  y += 22;
  fill(CINZA); ctx.font = `400 18px ${SANS}`;
  for (const l of quebrar(ctx, d.aviso, util)) { y += 28; texto(l, M, y); }
  return Math.ceil(y + 40);
}

/** Monta o folder inteiro (largura fixa de 1080 px, igual no celular e no computador) e devolve o JPEG em data URL */
export async function gerarImagemFolder(d: DadosFolder): Promise<string> {
  const [foto, mapa, qr] = await Promise.all([
    primeiraQueCarrega([`/${d.slug}/portal-frontal.webp`, `/${d.slug}/stand-aerea.webp`]),
    svgParaImagem(d.svg, LARGURA - 2 * M),
    d.qr ? carregarImagem(d.qr).catch(() => null) : Promise.resolve(null),
  ]);
  if (!qr) throw new Error("O QR Code ainda não foi gerado. Tente de novo em instantes.");
  return renderizarJpeg(LARGURA, (ctx, desenhar) => compor(ctx, d, { foto, mapa, qr }, desenhar));
}
