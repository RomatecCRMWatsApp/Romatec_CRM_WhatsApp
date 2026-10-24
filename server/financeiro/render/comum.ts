/**
 * Peças comuns dos documentos financeiros do Bom Jardims (pdf-lib, A4): cabeçalho/rodapé da marca, marca d'água,
 * faixa de modelo, cartões, QR e a lâmina (recibo do pagador + ficha de compensação FEBRABAN com código ITF).
 * Layout: templates/financeiro/MODELO-*.pdf. Linha digitável, código de barras e nosso número vêm do Asaas.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { pastaTemplates } from '../../contratos/render';

export const A4: [number, number] = [595.28, 841.89];
export const MM = 72 / 25.4;
export const COR = {
  verde: rgb(0.047, 0.2, 0.125),
  dourado: rgb(0.788, 0.651, 0.275),
  creme: rgb(0.953, 0.933, 0.886),
  cinza: rgb(0.4, 0.4, 0.4),
  cinzaClaro: rgb(0.62, 0.62, 0.62),
  linha: rgb(0.55, 0.55, 0.55),
  preto: rgb(0, 0, 0),
  branco: rgb(1, 1, 1),
  vermelho: rgb(0.75, 0.15, 0.12),
};

export interface Kit {
  doc: PDFDocument;
  f: PDFFont; fb: PDFFont; fi: PDFFont; times: PDFFont; mono: PDFFont;
  cabecalho: PDFImage; rodape: PDFImage; marcaDagua: PDFImage; logo: PDFImage;
  /** Faixa "MODELO — SEM VALOR" (fora de produção / exemplos) */
  modelo: boolean;
}

export async function novoKit(opcoes: { marca?: string; modelo?: boolean; titulo: string }): Promise<Kit> {
  const doc = await PDFDocument.create();
  doc.setTitle(opcoes.titulo);
  doc.setProducer('Romatec CRM');
  const dir = path.join(pastaTemplates(), 'marca', opcoes.marca ?? 'bomjardims');
  const png = async (f: string) => doc.embedPng(await readFile(path.join(dir, f)));
  const [cabecalho, rodape, marcaDagua, logo] = await Promise.all(['cabecalho.png', 'rodape.png', 'marca_dagua.png', 'logo.png'].map(png));
  return {
    doc, cabecalho, rodape, marcaDagua, logo,
    f: await doc.embedFont(StandardFonts.Helvetica), fb: await doc.embedFont(StandardFonts.HelveticaBold),
    fi: await doc.embedFont(StandardFonts.HelveticaOblique), times: await doc.embedFont(StandardFonts.TimesRomanBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    modelo: opcoes.modelo ?? process.env.NODE_ENV !== 'production',
  };
}

/** Texto que cabe na largura (corta com reticências) */
export function caber(font: PDFFont, s: string, size: number, largura: number): string {
  if (font.widthOfTextAtSize(s, size) <= largura) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > largura) t = t.slice(0, -1);
  return `${t}…`;
}

export function texto(p: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = COR.preto, maxW?: number) {
  p.drawText(maxW ? caber(font, s, size, maxW) : s, { x, y, size, font, color });
}
export function textoDir(p: PDFPage, s: string, xDir: number, y: number, size: number, font: PDFFont, color: RGB = COR.preto) {
  p.drawText(s, { x: xDir - font.widthOfTextAtSize(s, size), y, size, font, color });
}
export function textoCentro(p: PDFPage, s: string, xc: number, y: number, size: number, font: PDFFont, color: RGB = COR.preto) {
  p.drawText(s, { x: xc - font.widthOfTextAtSize(s, size) / 2, y, size, font, color });
}

/** Quebra em linhas pela largura */
export function quebrar(font: PDFFont, s: string, size: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of s.split(/\s+/)) {
    const t = atual ? `${atual} ${palavra}` : palavra;
    if (font.widthOfTextAtSize(t, size) > largura && atual) { linhas.push(atual); atual = palavra; } else atual = t;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Retângulo de cantos arredondados (path SVG) */
export function retArredondado(p: PDFPage, x: number, y: number, w: number, h: number, r: number, o: { cor?: RGB; borda?: RGB; espessura?: number }) {
  const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  // drawSvgPath usa y para baixo a partir do ponto (x, y): ancoramos no topo
  p.drawSvgPath(d, { x, y: y + h, color: o.cor, borderColor: o.borda, borderWidth: o.borda ? (o.espessura ?? 1) : 0 });
}

/** Página A4 com marca d'água, cabeçalho e rodapé da marca; devolve a faixa útil (topo, base) */
export function paginaComMarca(k: Kit): { p: PDFPage; topo: number; base: number } {
  const p = k.doc.addPage(A4);
  const [W, H] = A4;
  const wa = 150 * MM, ha = (wa * k.marcaDagua.height) / k.marcaDagua.width;
  p.drawImage(k.marcaDagua, { x: (W - wa) / 2, y: H * 0.42 - ha / 2, width: wa, height: ha });
  const hc = (W * k.cabecalho.height) / k.cabecalho.width;
  p.drawImage(k.cabecalho, { x: 0, y: H - hc, width: W, height: hc });
  const hr = (W * k.rodape.height) / k.rodape.width;
  p.drawImage(k.rodape, { x: 0, y: 0, width: W, height: hr });
  return { p, topo: H - hc - 14, base: hr + 4 };
}

/** Faixa diagonal "MODELO — SEM VALOR" (só fora de produção / nos exemplos) */
export function faixaModelo(k: Kit, p: PDFPage, textoFaixa = 'MODELO — SEM VALOR') {
  if (!k.modelo) return;
  const [W, H] = A4;
  const size = 46;
  const w = k.fb.widthOfTextAtSize(textoFaixa, size);
  const ang = Math.atan2(H * 0.5, W);
  p.drawText(textoFaixa, { x: W / 2 - (w / 2) * Math.cos(ang), y: H * 0.42 - (w / 2) * Math.sin(ang), size, font: k.fb,
    color: COR.vermelho, opacity: 0.16, rotate: degrees((ang * 180) / Math.PI) });
}

/** Título de seção da página (ex.: "BOLETO DE PAGAMENTO") + subtítulo cinza; devolve o y seguinte */
export function tituloPagina(k: Kit, p: PDFPage, y: number, titulo: string, sub: string): number {
  texto(p, titulo, 42, y - 16, 16.5, k.fb, COR.verde);
  texto(p, sub, 42, y - 33, 8.5, k.f, COR.cinza, 510);
  return y - 46;
}

/** Cartão creme com borda dourada e barra verde de título; devolve a área interna */
export function cartao(k: Kit, p: PDFPage, x: number, yTopo: number, w: number, h: number, titulo: string) {
  retArredondado(p, x, yTopo - h, w, h, 7, { cor: COR.creme, borda: COR.dourado, espessura: 0.9 });
  p.drawRectangle({ x: x + 0.5, y: yTopo - 20, width: w - 1, height: 19.5, color: COR.verde });
  texto(p, titulo, x + 9, yTopo - 14, 8.5, k.fb, COR.branco);
  return { x: x + 12, yTopo: yTopo - 20 };
}

/** Rótulo pequeno cinza + valor em destaque */
export function campo(k: Kit, p: PDFPage, x: number, y: number, rotulo: string, valor: string, o: { size?: number; cor?: RGB; maxW?: number } = {}) {
  texto(p, rotulo.toUpperCase(), x, y, 6.3, k.f, COR.cinza);
  texto(p, valor, x, y - (o.size ?? 10) - 2.5, o.size ?? 10, k.fb, o.cor ?? COR.verde, o.maxW);
}

export async function qrPng(k: Kit, conteudo: string): Promise<PDFImage> {
  const url = await QRCode.toDataURL(conteudo, { margin: 0, errorCorrectionLevel: 'M', width: 600 });
  return k.doc.embedPng(Buffer.from(url.split(',')[1], 'base64'));
}

// ─── Lâmina: recibo do pagador + ficha de compensação ─────────────────────

export interface DadosLamina {
  contratoNumero: string;
  loteCodigo: string;
  /** "Saldo 2/120" */
  parcela: string;
  /** AAAA-MM-DD */
  vencimento: string;
  valor: number;
  /** Do Asaas */
  nossoNumero: string;
  /** Do Asaas (47 dígitos; formatado só para exibir) */
  linhaDigitavel: string;
  /** Do Asaas (44 dígitos) */
  codigoBarras: string;
  /** PIX copia e cola do Asaas */
  pixPayload: string | null;
  /** QR do PIX gerado pelo Asaas (PNG base64), quando veio */
  pixQrBase64?: string | null;
  beneficiario: string;
  agenciaCodigo: string;
  numeroDocumento: string;
  /** AAAA-MM-DD */
  dataDocumento: string;
  pagadorNome: string;
  pagadorDoc: string;
  pagadorEndereco: string;
  instrucoes: string[];
}

export const LAMINA_ALTURA = 262;
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function formatarLinhaDigitavel(linha: string): string {
  const d = String(linha || '').replace(/\D/g, '');
  if (d.length !== 47) return linha;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}

/** Banco com DV (FEBRABAN, módulo 11) — só para o rótulo "461-7" do topo da ficha */
export function bancoComDv(linha: string): string {
  const b = String(linha).replace(/\D/g, '').slice(0, 3);
  if (b.length !== 3) return '';
  let s = 0;
  for (let i = 0; i < 3; i++) s += Number(b[2 - i]) * (i + 2);
  const r = 11 - (s % 11);
  return `${b}-${r >= 10 ? 0 : r}`;
}

const ITF: Record<string, string> = {
  '0': 'nnwwn', '1': 'wnnnw', '2': 'nwnnw', '3': 'wwnnn', '4': 'nnwnw', '5': 'wnwnn', '6': 'nwwnn', '7': 'nnnww', '8': 'wnnwn', '9': 'nwnwn',
};

/** Desenha o ITF (Interleaved 2 of 5) do código de 44 dígitos do Asaas: ~103 × 10 mm, barra larga = 3× a estreita */
export function desenharItf(p: PDFPage, cod44: string, x: number, y: number, largura = 103 * MM, altura = 10 * MM) {
  if (!/^\d{44}$/.test(cod44)) throw new Error('Código de barras do Asaas deve ter 44 dígitos');
  const seq: { barra: boolean; larga: boolean }[] = [];
  for (const b of [true, false, true, false]) seq.push({ barra: b, larga: false });
  for (let i = 0; i < 44; i += 2) {
    const pb = ITF[cod44[i]], ps = ITF[cod44[i + 1]];
    for (let j = 0; j < 5; j++) { seq.push({ barra: true, larga: pb[j] === 'w' }); seq.push({ barra: false, larga: ps[j] === 'w' }); }
  }
  seq.push({ barra: true, larga: true }, { barra: false, larga: false }, { barra: true, larga: false });
  const unidades = seq.reduce((s, e) => s + (e.larga ? 3 : 1), 0);
  const estreita = largura / unidades;
  let cx = x;
  for (const e of seq) {
    const w = (e.larga ? 3 : 1) * estreita;
    if (e.barra) p.drawRectangle({ x: cx, y, width: w, height: altura, color: COR.preto });
    cx += w;
  }
}

/** Caixa da ficha: rótulo em cima, valor embaixo (alinhado à direita se dir) */
function caixa(k: Kit, p: PDFPage, x: number, yTopo: number, w: number, h: number, rotulo: string, valor = '', o: { dir?: boolean; bold?: boolean; size?: number } = {}) {
  p.drawRectangle({ x, y: yTopo - h, width: w, height: h, borderColor: COR.linha, borderWidth: 0.5 });
  texto(p, rotulo, x + 2.5, yTopo - 6.5, 5.2, k.f, COR.preto, w - 4);
  if (!valor) return;
  const size = o.size ?? 7.6;
  const font = o.bold ? k.fb : k.f;
  if (o.dir) textoDir(p, caber(font, valor, size, w - 6), x + w - 3, yTopo - h + 3.5, size, font);
  else texto(p, valor, x + 2.5, yTopo - h + 3.5, size, font, COR.preto, w - 5);
}

/** Lâmina completa a partir do topo yTopo (altura LAMINA_ALTURA). Os dados de pagamento são os do Asaas, sem alteração. */
export async function desenharLamina(k: Kit, p: PDFPage, yTopo: number, d: DadosLamina) {
  const X0 = 28, X1 = A4[0] - 28;
  // Faixa verde com logo, empreendimento, contrato/parcela e vencimento · valor
  p.drawRectangle({ x: X0, y: yTopo - 25, width: X1 - X0, height: 25, color: COR.verde });
  p.drawRectangle({ x: X0, y: yTopo - 27, width: X1 - X0, height: 2, color: COR.dourado });
  const lw = 24, lh = (lw * k.logo.height) / k.logo.width;
  p.drawImage(k.logo, { x: X0 + 3, y: yTopo - 12.5 - lh / 2, width: lw, height: lh });
  texto(p, 'CONDOMÍNIO DE CHÁCARAS BOM JARDIMS', X0 + 30, yTopo - 11, 8.3, k.fb, COR.branco);
  texto(p, `Contrato ${d.contratoNumero} · Chácara ${d.loteCodigo} · ${d.parcela}`, X0 + 30, yTopo - 20.5, 6.4, k.f, COR.dourado);
  textoDir(p, `Vencimento ${dataBR(d.vencimento)}  ·  ${brl(d.valor)}`, X1 - 6, yTopo - 16, 8.8, k.fb, COR.branco);

  // Recibo do pagador (canhoto à esquerda)
  const SX = X0, SW = 136, linhaCanhoto = 26;
  let y = yTopo - 31;
  const itens: [string, string, boolean][] = [
    ['Parcela', d.parcela, false], ['Vencimento', dataBR(d.vencimento), true], ['Valor do documento', brl(d.valor), true],
    ['Nosso número', d.nossoNumero, false], ['Pagador', d.pagadorNome, false], ['(+) Mora/Multa', '', false], ['(=) Valor cobrado', '', false], ['Autenticação', '', false],
  ];
  p.drawRectangle({ x: SX, y: y - linhaCanhoto * itens.length - 8, width: SW, height: linhaCanhoto * itens.length + 8, color: COR.creme });
  for (const [rot, val, negrito] of itens) {
    p.drawRectangle({ x: SX, y: y - linhaCanhoto, width: SW, height: linhaCanhoto, borderColor: COR.linha, borderWidth: 0.5 });
    texto(p, rot, SX + 3, y - 7, 5.3, k.f);
    if (val) texto(p, val, SX + 3, y - 20, 7.4, negrito ? k.fb : k.f, COR.preto, SW - 6);
    y -= linhaCanhoto;
  }
  texto(p, 'Recibo do pagador — destaque aqui', SX + 3, yTopo - LAMINA_ALTURA + 2, 5.2, k.fi, COR.cinza);
  // Linha de destaque vertical
  for (let yy = yTopo - 30; yy > yTopo - LAMINA_ALTURA + 4; yy -= 5) p.drawLine({ start: { x: SX + SW + 5, y: yy }, end: { x: SX + SW + 5, y: yy - 2.5 }, thickness: 0.4, color: COR.cinzaClaro });

  // Ficha de compensação
  const FX = SX + SW + 11, FW = X1 - FX, colDir = 102, wEsq = FW - colDir;
  let fy = yTopo - 31;
  texto(p, 'asaas', FX, fy - 13, 12, k.fb);
  const xb = FX + 40;
  p.drawLine({ start: { x: xb, y: fy - 1 }, end: { x: xb, y: fy - 17 }, thickness: 1, color: COR.cinzaClaro });
  texto(p, bancoComDv(d.linhaDigitavel), xb + 6, fy - 13, 12, k.fb);
  p.drawLine({ start: { x: xb + 44, y: fy - 1 }, end: { x: xb + 44, y: fy - 17 }, thickness: 1, color: COR.cinzaClaro });
  textoDir(p, caber(k.fb, formatarLinhaDigitavel(d.linhaDigitavel), 9.2, FW - 92), X1, fy - 13, 9.2, k.fb);
  fy -= 20;
  const h = 18.5;
  caixa(k, p, FX, fy, wEsq, h, 'Local de pagamento', 'Pagável em qualquer banco, lotérica ou app — ou via PIX');
  caixa(k, p, FX + wEsq, fy, colDir, h, 'Vencimento', dataBR(d.vencimento), { dir: true, bold: true });
  fy -= h;
  caixa(k, p, FX, fy, wEsq, h, 'Beneficiário', d.beneficiario);
  caixa(k, p, FX + wEsq, fy, colDir, h, 'Agência / Código do beneficiário', d.agenciaCodigo, { dir: true });
  fy -= h;
  const c3 = [0.2, 0.2, 0.2, 0.2, 0.2].map(f => f * wEsq);
  const r3: [string, string][] = [['Data do documento', dataBR(d.dataDocumento)], ['Nº do documento', d.numeroDocumento], ['Espécie doc.', 'DM'], ['Aceite', 'N'], ['Data processamento', dataBR(d.dataDocumento)]];
  let cx = FX;
  r3.forEach(([r, v], i) => { caixa(k, p, cx, fy, c3[i], h, r, v); cx += c3[i]; });
  caixa(k, p, FX + wEsq, fy, colDir, h, 'Nosso número', d.nossoNumero, { dir: true });
  fy -= h;
  const r4: [string, string][] = [['Uso do banco', ''], ['Carteira', '1'], ['Espécie', 'R$'], ['Quantidade', ''], ['Valor', '']];
  cx = FX;
  r4.forEach(([r, v], i) => { caixa(k, p, cx, fy, c3[i], h, r, v); cx += c3[i]; });
  caixa(k, p, FX + wEsq, fy, colDir, h, '(=) Valor do documento', brl(d.valor), { dir: true, bold: true });
  fy -= h;
  // Instruções + QR PIX; à direita, descontos/acréscimos
  const hi = 4 * 18.5;
  p.drawRectangle({ x: FX, y: fy - hi, width: wEsq, height: hi, borderColor: COR.linha, borderWidth: 0.5 });
  texto(p, 'Instruções (texto de responsabilidade do beneficiário)', FX + 2.5, fy - 6.5, 5.2, k.f);
  d.instrucoes.slice(0, 6).forEach((l, i) => texto(p, l, FX + 4, fy - 16 - i * 8.6, 6.3, k.f, COR.preto, wEsq - 80));
  if (d.pixPayload || d.pixQrBase64) {
    const qr = d.pixQrBase64 ? await k.doc.embedPng(Buffer.from(d.pixQrBase64, 'base64')) : await qrPng(k, d.pixPayload!);
    const q = 46;
    textoCentro(p, 'PAGUE COM PIX', FX + wEsq - 38, fy - 15, 5.6, k.fb);
    p.drawImage(qr, { x: FX + wEsq - 38 - q / 2, y: fy - 19 - q, width: q, height: q });
  }
  ['(-) Desconto/Abatimento', '(+) Mora/Multa', '(+) Outros acréscimos', '(=) Valor cobrado'].forEach((r, i) => caixa(k, p, FX + wEsq, fy - i * 18.5, colDir, 18.5, r));
  fy -= hi;
  const hp = 24;
  p.drawRectangle({ x: FX, y: fy - hp, width: FW, height: hp, borderColor: COR.linha, borderWidth: 0.5 });
  texto(p, 'Pagador', FX + 2.5, fy - 6, 5.2, k.f);
  texto(p, `${d.pagadorNome} — ${d.pagadorDoc}`, FX + 4, fy - 13.5, 7.2, k.f, COR.preto, FW - 8);
  texto(p, d.pagadorEndereco, FX + 4, fy - 21.5, 7.2, k.f, COR.preto, FW - 8);
  fy -= hp;
  desenharItf(p, d.codigoBarras, FX + 1, fy - 2 - 10 * MM);
  textoDir(p, 'Autenticação mecânica — Ficha de Compensação', X1, yTopo - LAMINA_ALTURA + 2, 5.4, k.f);
}

/** Linha tracejada de corte horizontal */
export function linhaCorte(p: PDFPage, y: number, k?: Kit, legenda?: string) {
  for (let x = 14; x < A4[0] - 14; x += 6) p.drawLine({ start: { x, y }, end: { x: x + 3, y }, thickness: 0.5, color: COR.cinzaClaro });
  if (k && legenda) texto(p, legenda, 28, y + 4, 5.8, k.fi, COR.cinza);
}

export { brl, dataBR };
