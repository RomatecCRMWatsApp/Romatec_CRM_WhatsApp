/**
 * Memorial descritivo de um lote em JPEG (página inteira, largura fixa de 1240 px — nada corta,
 * mesmo gerado no celular): aviso de rascunho em destaque, empreendimento, mapa com o lote destacado,
 * dados do imóvel, descrição, tabela completa dos vértices, data e linha do responsável técnico.
 */
import { SANS, svgParaImagem, quebrar, renderizarJpeg, retanguloArredondado } from "./canvasDoc";
import { AVISO_RASCUNHO_MEMORIAL as AVISO_RASCUNHO } from "@shared/lotes";

const LARGURA = 1240, M = 56;
const TEXTO = "#111111", CINZA = "#555555", VERMELHO = "#A33333", LINHA = "#DDDDDD";

export interface DadosMemorial {
  empreendimento: string;
  subtitulo: string;                 // "Açailândia/MA · Lote C18 · emitido em 20/10/2026"
  matricula: string;                 // "Matrícula do empreendimento: …"
  svg?: SVGSVGElement | null;        // mapa (com o lote destacado)
  titulo: string;                    // "Lote 18 da Quadra C — Condomínio …"
  cabecalho: string[];
  descricao: string;
  vertices: { nome: string; n: string; e: string; azimute: string; distancia: string; confronta: string }[];
  localData: string;                 // "Açailândia/MA, 20/10/2026."
  responsavel: string;
}

function compor(ctx: CanvasRenderingContext2D, d: DadosMemorial, mapa: { img: HTMLImageElement; altura: number } | null, desenhar: boolean): number {
  const util = LARGURA - 2 * M;
  const texto = (t: string, x: number, y: number) => { if (desenhar) ctx.fillText(t, x, y); };
  const linhaH = (y: number, cor = LINHA, esp = 1.5) => { if (desenhar) { ctx.fillStyle = cor; ctx.fillRect(M, y, util, esp); } };
  ctx.textBaseline = "alphabetic";
  let y = M;

  // Aviso de rascunho em destaque (faixa vermelha clara)
  ctx.font = `800 26px ${SANS}`;
  const aviso = quebrar(ctx, AVISO_RASCUNHO.toUpperCase(), util - 48);
  const alturaAviso = 28 + aviso.length * 36 + 34 + 22;
  if (desenhar) {
    retanguloArredondado(ctx, M, y, util, alturaAviso, 14, "#FDECEC");
    ctx.strokeStyle = VERMELHO; ctx.lineWidth = 3;
    ctx.beginPath(); if ((ctx as any).roundRect) (ctx as any).roundRect(M, y, util, alturaAviso, 14); else ctx.rect(M, y, util, alturaAviso); ctx.stroke();
  }
  let ya = y + 28;
  ctx.fillStyle = VERMELHO;
  for (const l of aviso) { ya += 32; ctx.font = `800 26px ${SANS}`; texto(l, M + 24, ya); ya += 4; }
  ya += 30; ctx.font = `500 21px ${SANS}`; texto("Uso somente para averiguação de dados, coordenadas e localização.", M + 24, ya);
  y += alturaAviso + 50;

  // Empreendimento
  ctx.fillStyle = TEXTO; ctx.font = `800 36px ${SANS}`; texto(d.empreendimento, M, y);
  y += 36; ctx.font = `400 23px ${SANS}`; texto(d.subtitulo, M, y);
  y += 30; ctx.fillStyle = CINZA; ctx.font = `400 20px ${SANS}`; texto(d.matricula, M, y);

  // Mapa com o lote destacado
  if (mapa) {
    y += 24;
    if (desenhar) { ctx.drawImage(mapa.img, M, y, util, mapa.altura); ctx.strokeStyle = "#CCCCCC"; ctx.lineWidth = 2; ctx.strokeRect(M, y, util, mapa.altura); }
    y += mapa.altura;
  }

  // Título e dados do imóvel
  y += 56; ctx.fillStyle = TEXTO; ctx.font = `800 30px ${SANS}`;
  for (const l of quebrar(ctx, `Memorial descritivo — ${d.titulo}`, util)) { texto(l, M, y); y += 38; }
  ctx.font = `400 22px ${SANS}`;
  for (const c of d.cabecalho) for (const l of quebrar(ctx, c, util)) { y += 32; texto(l, M, y); }

  // Descrição
  y += 22; ctx.font = `400 22px ${SANS}`;
  for (const l of quebrar(ctx, d.descricao, util)) { y += 33; texto(l, M, y); }

  // Tabela dos vértices (Confrontação quebra em linhas; nada corta)
  const cols = [
    { t: "Vértice", w: 0.09 }, { t: "N (m)", w: 0.17 }, { t: "E (m)", w: 0.15 },
    { t: "Azimute", w: 0.15 }, { t: "Distância (m)", w: 0.14 }, { t: "Confrontação", w: 0.30 },
  ].map(c => ({ ...c, w: c.w * util }));
  const xs = cols.reduce<number[]>((acc, c, i) => [...acc, i ? acc[i - 1] + cols[i - 1].w : M], []);
  y += 46; ctx.fillStyle = TEXTO; ctx.font = `700 21px ${SANS}`;
  cols.forEach((c, i) => texto(c.t, xs[i] + 6, y));
  linhaH(y + 12, "#999999", 2);
  y += 12;
  for (const v of d.vertices) {
    ctx.font = `400 21px ${SANS}`;
    const conf = quebrar(ctx, v.confronta, cols[5].w - 12);
    const alt = Math.max(1, conf.length) * 28 + 14;
    const base = y + 34;
    ctx.fillStyle = TEXTO;
    [v.nome, v.n, v.e, v.azimute, v.distancia].forEach((t, i) => texto(t, xs[i] + 6, base));
    conf.forEach((l, k) => texto(l, xs[5] + 6, base + k * 28));
    y += alt + 10;
    linhaH(y);
  }

  // Data, assinatura e aviso repetido
  y += 60; ctx.fillStyle = TEXTO; ctx.font = `400 22px ${SANS}`; texto(d.localData, M, y);
  y += 110; linhaH(y, "#999999", 2);
  y += 32; ctx.font = `400 22px ${SANS}`; texto(d.responsavel, M, y);
  y += 56; ctx.fillStyle = VERMELHO; ctx.font = `700 19px ${SANS}`;
  for (const l of quebrar(ctx, AVISO_RASCUNHO.toUpperCase(), util)) { texto(l, M, y); y += 26; }
  const altura = Math.ceil(y + 30);

  // Marca d'água "RASCUNHO" na diagonal, por cima de tudo
  if (desenhar) {
    ctx.save();
    ctx.globalAlpha = 0.07; ctx.fillStyle = VERMELHO; ctx.font = `900 190px ${SANS}`;
    for (let yy = 600; yy < altura; yy += 1100) {
      ctx.save(); ctx.translate(LARGURA / 2, yy); ctx.rotate(-Math.PI / 6);
      const w = ctx.measureText("RASCUNHO").width; ctx.fillText("RASCUNHO", -w / 2, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  return altura;
}

/** Monta o memorial (página inteira) e devolve o JPEG em data URL */
export async function gerarImagemMemorial(d: DadosMemorial): Promise<string> {
  const mapa = d.svg ? await svgParaImagem(d.svg, LARGURA - 2 * M).catch(() => null) : null;
  return renderizarJpeg(LARGURA, (ctx, desenhar) => compor(ctx, d, mapa, desenhar));
}
