/**
 * Boleto da comissão de gestão no padrão Romatec (verde-escuro e dourado).
 * Quem recebe é a Romatec CRM; o empreendimento, o contrato, a chácara e o pagador aparecem só como vínculo,
 * para o comprovante ficar amarrado à venda/concessão que gerou a comissão.
 * Linha digitável, código de barras, nosso número e PIX são os do Asaas, sem alteração.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { degrees, rgb, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import { pastaTemplates } from '../../contratos/render';
import { ESCRITORIO } from '../../../shared/escritorio';
import {
  A4, COR, LAMINA_ALTURA, MM, brl, dataBR, desenharLamina, faixaModelo, linkClicavel, linhaCorte, novoKit, qrPng,
  quebrar, retArredondado, texto, textoCentro, textoDir, type Kit,
} from './comum';
import type { Contato, DadosParcela } from './documentos';

const [W, H] = A4;

/** Paleta Romatec: fundo verde-escuro, superfície verde, dourado e creme */
const R = {
  fundo: rgb(0.024, 0.102, 0.067), // #061A11
  superficie: rgb(0.047, 0.2, 0.125), // #0C3320
  borda: rgb(0.788, 0.659, 0.298), // #C9A84C
  dourado: rgb(0.886, 0.784, 0.467), // #E2C877
  creme: rgb(0.91, 0.941, 0.922), // #E8F0EB
  apagado: rgb(0.62, 0.71, 0.66),
};

const CARIMBO = rgb(0.86, 0.13, 0.13);
const FORMA: Record<string, string> = { BOLETO: 'Boleto', PIX: 'Pix', CREDIT_CARD: 'Cartão de crédito', CARTAO: 'Cartão de crédito', MANUAL: 'Registro manual' };

/** Carimbo diagonal "BOLETO PAGO" com a data e o valor, como os boletos quitados dos conselhos (CREA/CFT) */
function carimboPago(k: Kit, p: PDFPage, pago: NonNullable<DadosParcela['pago']>) {
  const ang = 33, a = (ang * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const cx = W / 2, cy = H * 0.5;
  const linhas: [string, number][] = [['BOLETO PAGO', 72], [`Data do pagamento: ${dataBR(pago.em)}`, 27], [`Valor pago: ${brl(pago.valor)}`, 27], [`Autenticação: ${pago.autenticacao}`, 15]];
  let off = -50;
  for (const [t, size] of linhas) {
    const w = k.fb.widthOfTextAtSize(t, size);
    // desloca cada linha para baixo, perpendicular ao ângulo do carimbo
    const ox = cx + off * sin, oy = cy - off * cos;
    p.drawText(t, { x: ox - (w / 2) * cos, y: oy - (w / 2) * sin, size, font: k.fb, color: CARIMBO, opacity: 0.72, rotate: degrees(ang) });
    off += size * 1.15 + (size > 40 ? 6 : 2);
  }
}

interface MarcaRomatec { wordmark: PDFImage; selo: PDFImage; rosa: PDFImage }

async function marcaRomatec(k: Kit): Promise<MarcaRomatec> {
  const dir = path.join(pastaTemplates(), 'marca', 'romatec');
  const png = async (f: string) => k.doc.embedPng(await readFile(path.join(dir, f)));
  const [wordmark, selo, rosa] = await Promise.all([png('wordmark-dourado.png'), png('selo-crm.png'), png('rosa-dark.png')]);
  return { wordmark, selo, rosa };
}

function cartaoRomatec(k: Kit, p: PDFPage, x: number, yTopo: number, w: number, h: number, titulo: string) {
  retArredondado(p, x, yTopo - h, w, h, 8, { cor: R.superficie, borda: R.borda, espessura: 0.9 });
  texto(p, titulo, x + 12, yTopo - 15, 8.4, k.fb, R.dourado);
  p.drawLine({ start: { x: x + 12, y: yTopo - 21 }, end: { x: x + w - 12, y: yTopo - 21 }, thickness: 0.5, color: R.borda, opacity: 0.5 });
  return { x: x + 12, yTopo: yTopo - 24 };
}

function campoRomatec(k: Kit, p: PDFPage, x: number, y: number, rotulo: string, valor: string, o: { size?: number; cor?: RGB; maxW?: number } = {}) {
  texto(p, rotulo, x, y, 6.6, k.f, R.apagado);
  texto(p, valor, x, y - (o.size ?? 10) - 2.5, o.size ?? 10, k.fb, o.cor ?? R.creme, o.maxW);
}

function botaoPixRomatec(k: Kit, p: PDFPage, x: number, y: number, w: number, h: number, url: string) {
  retArredondado(p, x, y, w, h, h / 2, { cor: R.borda });
  const rotulo = 'Toque aqui para copiar o Pix';
  const size = Math.min(7.6, h * 0.5);
  textoCentro(p, rotulo, x + w / 2, y + (h - size) / 2 + 1, size, k.fb, R.superficie);
  linkClicavel(k, p, x, y, w, h, url);
}

export async function renderBoletoComissaoA4(d: DadosParcela, o: { modelo?: boolean; contato: Contato }): Promise<Buffer> {
  const k = await novoKit({ modelo: o.modelo, titulo: `Comissão ${d.contratoNumero} ${d.parcela}` });
  const m = await marcaRomatec(k);
  const p = k.doc.addPage(A4);
  const emp = d.empreendimento ?? 'Condomínio de Chácaras Bom Jardims · Açailândia/MA';
  const empNome = emp.split(' · ')[0];

  // Fundo verde-escuro, rosa dos ventos discreta e rodapé
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: R.fundo });
  const wr = 360, hr = (wr * m.rosa.height) / m.rosa.width;
  p.drawImage(m.rosa, { x: W - wr * 0.62, y: H - 120 - hr * 0.7, width: wr, height: hr, opacity: 0.05 });
  p.drawRectangle({ x: 0, y: 0, width: W, height: 22, color: R.superficie });
  p.drawRectangle({ x: 0, y: 22, width: W, height: 1.2, color: R.borda });
  textoCentro(p, `${ESCRITORIO.fantasia} · Romatec CRM — CNPJ ${ESCRITORIO.cnpj} — ${ESCRITORIO.endereco}`, W / 2, 8, 6.8, k.f, R.creme);

  // Cabeçalho: logo Romatec + selo CRM
  let y = H - 30;
  const ww = 168, wh = (ww * m.wordmark.height) / m.wordmark.width;
  p.drawImage(m.wordmark, { x: 42, y: y - wh, width: ww, height: wh });
  const s = 50;
  p.drawImage(m.selo, { x: W - 42 - s, y: y - s + 2, width: s, height: s });
  textoDir(p, 'Gestão de vendas de empreendimentos', W - 42 - s - 10, y - 18, 7.6, k.f, R.creme);
  textoDir(p, `Atendimento ${o.contato.atendimento}`, W - 42 - s - 10, y - 30, 7.6, k.f, R.apagado);
  y -= Math.max(wh, s) + 8;
  p.drawRectangle({ x: 42, y, width: W - 84, height: 1, color: R.borda });

  // Título
  y -= 24;
  texto(p, 'Boleto da comissão de gestão', 42, y, 17, k.fb, R.dourado);
  y -= 15;
  texto(p, `Comissão referente ao ${empNome}, recebida pela Romatec CRM.`, 42, y, 8.6, k.f, R.creme, W - 84);
  y -= 14;

  // Vínculo: empreendimento, contrato, chácara e pagador
  const hv = 92;
  const v = cartaoRomatec(k, p, 42, y, W - 84, hv, 'A que se refere esta comissão');
  const cw = (W - 84 - 24) / 3;
  let ly = v.yTopo - 10;
  campoRomatec(k, p, v.x, ly, 'Empreendimento', emp, { maxW: cw * 2 - 8 });
  campoRomatec(k, p, v.x + cw * 2, ly, 'Contrato', d.contratoNumero, { maxW: cw - 8, cor: R.dourado });
  ly -= 30;
  campoRomatec(k, p, v.x, ly, 'Chácara', d.loteResumo, { maxW: cw - 8 });
  campoRomatec(k, p, v.x + cw, ly, 'Pagador(a)', d.pagadorNome, { maxW: cw - 8 });
  campoRomatec(k, p, v.x + cw * 2, ly, 'CPF/CNPJ', d.pagadorDoc, { maxW: cw - 8 });
  y -= hv + 10;

  // Resumo da cobrança + PIX
  const hc = 150, wres = 300;
  const a = cartaoRomatec(k, p, 42, y, wres, hc, 'Esta cobrança');
  const c2 = a.x + 140;
  ly = a.yTopo - 10;
  campoRomatec(k, p, a.x, ly, 'Parcela', d.parcela, { maxW: 130 });
  campoRomatec(k, p, c2, ly, 'Vencimento', dataBR(d.vencimento));
  ly -= 34;
  campoRomatec(k, p, a.x, ly, 'Valor da comissão', brl(d.valor), { size: 15, cor: R.dourado });
  campoRomatec(k, p, c2, ly, 'Restantes', d.parcelasRestantes, { maxW: 130 });
  ly -= 38;
  campoRomatec(k, p, a.x, ly, 'Recebedor', 'Romatec CRM', { maxW: 130 });
  campoRomatec(k, p, c2, ly, 'Nosso número', d.nossoNumero, { maxW: 130 });

  const xp = 42 + wres + 10, wp = W - 42 - xp;
  cartaoRomatec(k, p, xp, y, wp, hc, d.pago ? 'Pagamento confirmado' : 'Pague com Pix');
  if (d.pago) {
    const px = xp + 14;
    let py = y - 40;
    campoRomatec(k, p, px, py, 'Pago em', dataBR(d.pago.em), { cor: R.dourado });
    py -= 32;
    campoRomatec(k, p, px, py, 'Valor pago', brl(d.pago.valor), { size: 13, cor: R.dourado });
    py -= 34;
    campoRomatec(k, p, px, py, 'Forma', FORMA[d.pago.forma ?? ''] ?? 'Boleto ou Pix', { maxW: wp - 28 });
    py -= 30;
    campoRomatec(k, p, px, py, 'Autenticação', d.pago.autenticacao, { size: 8.6, maxW: wp - 28 });
  } else if (d.pixPayload || d.pixQrBase64) {
    const qr = d.pixQrBase64 ? await k.doc.embedPng(Buffer.from(d.pixQrBase64, 'base64')) : await qrPng(k, d.pixPayload!);
    const q = 74, pad = 6;
    const qx = xp + (wp - q) / 2, qy = y - 30 - q;
    retArredondado(p, qx - pad, qy - pad, q + pad * 2, q + pad * 2, 6, { cor: COR.branco });
    p.drawImage(qr, { x: qx, y: qy, width: q, height: q });
    if (d.pixUrl) {
      linkClicavel(k, p, qx, qy, q, q, d.pixUrl);
      botaoPixRomatec(k, p, xp + 14, y - hc + 20, wp - 28, 16, d.pixUrl);
      textoCentro(p, 'ou leia o QR Code no app do banco', xp + wp / 2, y - hc + 9, 6.2, k.f, R.apagado);
    } else {
      textoCentro(p, 'Leia o QR Code no app do banco', xp + wp / 2, y - hc + 14, 6.6, k.f, R.creme);
    }
  } else {
    textoCentro(p, 'Pix indisponível nesta cobrança', xp + wp / 2, y - hc / 2, 7.2, k.f, R.apagado);
  }
  y -= hc + 10;

  // Pix copia e cola
  retArredondado(p, 42, y - 20, W - 84, 20, 5, { borda: R.borda, espessura: 0.6 });
  texto(p, `Pix copia e cola: ${d.pixPayload ?? '—'}`, 50, y - 13, 6.6, k.mono, R.creme, W - 100);
  y -= 34;

  // Como pagar
  const linhas = [
    'Pix (recomendado): toque em "Copiar o Pix" ou leia o QR Code. Compensa na hora; pelo código de barras, até 1 dia útil.',
    `Esta é a comissão de gestão do contrato ${d.contratoNumero}. Não é parcela do contrato e não altera o valor da chácara.`,
    `Após o vencimento: multa de 2% e juros de 1% ao mês. Pague somente por este boleto/Pix; o comprovante sai pelo WhatsApp ${o.contato.atendimento}.`,
  ];
  for (const l of linhas) {
    quebrar(k.f, l, 7.3, W - 96).forEach((t, i) => { texto(p, `${i ? '  ' : '• '}${t}`, 42, y, 7.3, k.f, R.creme); y -= 10.5; });
  }

  // Lâmina (recibo + ficha de compensação) em painel branco, legível para o banco
  const yLam = 23 + 10 * MM + LAMINA_ALTURA - 8;
  const topoPainel = yLam + 18;
  retArredondado(p, 14, 28, W - 28, topoPainel - 28, 8, { cor: COR.branco });
  linhaCorte(p, yLam + 6, k, 'corte aqui — recibo do pagador e ficha de compensação');
  await desenharLamina(k, p, yLam, d.pago ? { ...d, pixUrl: null } : d, { titulo: "ROMATEC CRM · COMISSÃO DE GESTÃO", logo: m.selo });
  if (d.pago) {
    // Recibo do pagador: valor cobrado e autenticação; e o carimbo "BOLETO PAGO" sobre a página
    texto(p, brl(d.pago.valor), 31, yLam - 31 - 26 * 6 - 20, 7.4, k.fb, CARIMBO);
    texto(p, d.pago.autenticacao, 31, yLam - 31 - 26 * 7 - 20, 7.4, k.fb, CARIMBO);
    carimboPago(k, p, d.pago);
  } else faixaModelo(k, p);
  return Buffer.from(await k.doc.save({ useObjectStreams: false }));
}
