/**
 * PDF "Associados com parcelas em aberto": lista simples, uma linha por associado (nome, chácara, parcelas em aberto e saldo devedor).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { desenharMarca, embutirMarca } from '../contratos/anexos';
import { ESCRITORIO } from '../../shared/escritorio';
import { brl } from '../../shared/simulador';
import type { parcelasEmAberto } from './relatorios';

type Dados = Awaited<ReturnType<typeof parcelasEmAberto>>;

const VERDE = rgb(0.047, 0.2, 0.125);
const CINZA = rgb(0.35, 0.35, 0.35);
const VERMELHO = rgb(0.7, 0.12, 0.1);
const BORDA = rgb(0.75, 0.75, 0.72);
const FAIXA = rgb(0.95, 0.94, 0.9);
const BRANCO = rgb(1, 1, 1);
const TINTA = rgb(0.1, 0.1, 0.1);
const W = 595.28, H = 841.89, X0 = 48, X1 = W - 48;

const br = (iso: string) => iso.split('-').reverse().join('/');

/** Uma linha por associado: parcelas em aberto (quantas e quantas vencidas) e o saldo devedor */
export function linhaDoAssociado(a: Dados['associados'][number]) {
  const vencidas = a.parcelas.filter(p => p.vencida).length;
  const saldo = a.emAberto;
  return {
    nome: a.comprador, chacara: a.loteCodigo,
    parcelas: `${a.parcelas.length}${vencidas ? ` (${vencidas} vencida${vencidas > 1 ? 's' : ''})` : ''}`,
    saldo: brl(saldo), saldoNumero: saldo, temVencida: vencidas > 0,
  };
}

export async function pdfParcelasEmAberto(d: Dados, marcaSlug = 'bomjardims'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Associados com parcelas em aberto — ${br(d.hoje)}`);
  const marca = await embutirMarca(doc, marcaSlug);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let p!: PDFPage, y = 0, base = 0, pagBase = 60;
  const novaPagina = () => { p = doc.addPage([W, H]); const r = desenharMarca(p, marca); y = r.topo; base = r.base + 14; pagBase = r.base + 6; };
  const centro = (s: string, size: number, font: PDFFont, cor = TINTA) => p.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y: y - size, size, font, color: cor });

  const COLS = [{ t: 'Nº', w: 28 }, { t: 'Associado', w: 205 }, { t: 'Chácara', w: 60 }, { t: 'Parcelas em aberto', w: 100 }, { t: 'Saldo devedor', w: X1 - X0 - 393, dir: true }];
  const xs = COLS.map((_, i) => X0 + COLS.slice(0, i).reduce((s, c) => s + c.w, 0));
  const RH = 16;
  const cab = () => {
    p.drawRectangle({ x: X0, y: y - RH, width: X1 - X0, height: RH, color: VERDE });
    COLS.forEach((c, i) => { const w = fb.widthOfTextAtSize(c.t, 8); p.drawText(c.t, { x: c.dir ? xs[i] + c.w - 5 - w : xs[i] + 5, y: y - 11, size: 8, font: fb, color: BRANCO }); });
    y -= RH;
  };
  const celula = (txt: string, i: number, font: PDFFont, cor = TINTA) => {
    let t = txt; const max = COLS[i].w - 10;
    while (t.length > 3 && font.widthOfTextAtSize(t, 8.6) > max) t = t.slice(0, -2);
    if (t !== txt) t = t.slice(0, -1) + '…';
    p.drawText(t, { x: COLS[i].dir ? xs[i] + COLS[i].w - 5 - font.widthOfTextAtSize(t, 8.6) : xs[i] + 5, y: y - 11.5, size: 8.6, font, color: cor });
  };

  novaPagina();
  centro('ASSOCIADOS COM PARCELAS EM ABERTO', 13, fb, VERDE); y -= 20;
  centro(`Posição em ${br(d.hoje)} · ${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ}`, 8.6, f, CINZA); y -= 22;

  const linhas = d.associados.map(a => linhaDoAssociado(a));
  if (!linhas.length) { centro('Nenhum associado com parcelas em aberto nesta data.', 10, f, CINZA); }
  else {
    cab();
    linhas.forEach((l, k) => {
      if (y - RH < base) { novaPagina(); cab(); }
      p.drawRectangle({ x: X0, y: y - RH, width: X1 - X0, height: RH, borderColor: BORDA, borderWidth: 0.5, color: k % 2 ? FAIXA : undefined });
      celula(String(k + 1), 0, f, CINZA);
      celula(l.nome, 1, f);
      celula(l.chacara, 2, f);
      celula(l.parcelas, 3, l.temVencida ? fb : f, l.temVencida ? VERMELHO : TINTA);
      celula(l.saldo, 4, fb);
      y -= RH;
    });
    // Total
    if (y - RH < base) { novaPagina(); cab(); }
    const total = Math.round(linhas.reduce((s, l) => s + l.saldoNumero, 0) * 100) / 100;
    p.drawRectangle({ x: X0, y: y - RH, width: X1 - X0, height: RH, color: VERDE });
    p.drawText(`TOTAL · ${linhas.length} associado(s) · ${d.totais.parcelas} parcela(s) em aberto`, { x: X0 + 5, y: y - 11.5, size: 8.6, font: fb, color: BRANCO });
    const tt = brl(total); p.drawText(tt, { x: X1 - 5 - fb.widthOfTextAtSize(tt, 8.6), y: y - 11.5, size: 8.6, font: fb, color: BRANCO });
    y -= RH + 12;
    const nota = 'Saldo devedor = soma das parcelas em aberto. Parcelas vencidas em vermelho.';
    if (y - 12 < base) novaPagina();
    p.drawText(nota, { x: X0, y: y - 8, size: 7.6, font: f, color: CINZA });
  }

  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    const t = `Página ${i + 1} de ${paginas.length} · gerado em ${br(d.hoje)}`;
    pg.drawText(t, { x: X1 - f.widthOfTextAtSize(t, 7), y: pagBase - 10, size: 7, font: f, color: CINZA });
  });
  return Buffer.from(await doc.save());
}
