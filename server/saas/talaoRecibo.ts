/**
 * Talonário de recibos (modo arcaico, mesmo padrão do talão de contrato): uma folha A4 por número, com duas vias
 * separadas por linha de corte — 1ª via para quem pagou, 2ª via para o escritório (prestação de contas do corretor).
 * Campos em branco para preencher à mão: quem pagou, valor (numeral e por extenso), a que se refere, contrato/talão,
 * chácara, forma de pagamento, data, assinatura de quem recebeu. Sai com a marca do empreendimento, o recebedor
 * oficial (promitente vendedora) e Romatec Consultoria Total · CRECI J-1234.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos } from '../../drizzle/schema';
import { desenharMarca, embutirMarca } from '../contratos/anexos';
import { ESCRITORIO, LINHA_PUBLICIDADE } from '../../shared/escritorio';
import { A4, CINZA, DOURADO, VERDE, X0, X1 } from './talaoContrato';

const PRETO = rgb(0.1, 0.1, 0.1);
const pad6 = (n: number | null) => (n != null ? String(n).padStart(6, '0') : '______');

async function dadosDoEmpreendimento(slug: string) {
  const d: any = await getDb();
  const [emp]: any[] = d ? await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1) : [];
  if (!emp) return { nome: 'Empreendimento', marca: 'bomjardims', vendedora: '', vendedoraDoc: '' };
  const { juridicoDe } = await import('../contratos/servico');
  const j: any = await juridicoDe(Number(emp.id)).catch(() => null);
  const v = (j?.vendedora ?? {}) as Record<string, unknown>;
  const pj = j?.vendedoraTipo === 'PJ';
  const s = (x: unknown) => String(x ?? '').trim();
  return {
    nome: s(emp.nome), marca: String(j?.marcaSlug ?? 'bomjardims'),
    vendedora: s(pj ? v.vend_razao_social : v.vend_nome), vendedoraDoc: pj ? (s(v.vend_cnpj) ? `CNPJ ${s(v.vend_cnpj)}` : '') : (s(v.vend_cpf) ? `CPF ${s(v.vend_cpf)}` : ''),
  };
}

/** Uma via do recibo, desenhada de `topo` para baixo; devolve o y final */
function via(p: PDFPage, f: PDFFont, fb: PDFFont, topo: number, numero: number | null, rotuloVia: string, emp: Awaited<ReturnType<typeof dadosDoEmpreendimento>>, compacto: boolean): number {
  let y = topo;
  const L = X1 - X0;
  // Cabeçalho da via
  if (compacto) {
    p.drawText(emp.nome.toUpperCase(), { x: X0, y, size: 9.5, font: fb, color: VERDE });
    p.drawText(LINHA_PUBLICIDADE, { x: X0, y: y - 11, size: 7.5, font: f, color: CINZA });
    y -= 26;
  }
  p.drawText(`RECIBO Nº ${pad6(numero)}`, { x: X0, y, size: 15, font: fb, color: VERDE });
  const tv = fb.widthOfTextAtSize(rotuloVia, 8);
  p.drawRectangle({ x: X0 + 190, y: y - 3, width: tv + 12, height: 15, color: rgb(0.96, 0.94, 0.88) });
  p.drawText(rotuloVia, { x: X0 + 196, y: y + 1, size: 8, font: fb, color: VERDE });
  // Caixa do valor
  p.drawRectangle({ x: X1 - 150, y: y - 8, width: 150, height: 26, borderColor: DOURADO, borderWidth: 1.2 });
  p.drawText('R$', { x: X1 - 144, y: y - 1, size: 12, font: fb, color: VERDE });
  y -= 30;

  const linha = (rot: string, larg = L, x = X0) => {
    p.drawText(rot, { x, y, size: 9, font: f, color: PRETO });
    const w = f.widthOfTextAtSize(rot, 9) + 4;
    p.drawLine({ start: { x: x + w, y: y - 2 }, end: { x: x + larg, y: y - 2 }, thickness: 0.6, color: CINZA });
  };
  const caixasQuebra = (opcoes: string[], tam = 8.6) => {
    let x = X0;
    for (const o of opcoes) {
      const w = 13 + f.widthOfTextAtSize(o, tam) + 16;
      if (x + w > X1) { x = X0; y -= 15; }
      p.drawRectangle({ x, y: y - 2, width: 8.5, height: 8.5, borderColor: VERDE, borderWidth: 0.8 });
      p.drawText(o, { x: x + 12, y, size: tam, font: f, color: PRETO });
      x += w;
    }
    y -= 19;
  };

  linha('Recebi(emos) de'); y -= 19;
  linha('CPF/CNPJ', L * 0.45); linha('WhatsApp', L * 0.5, X0 + L * 0.5); y -= 19;
  linha('a importância de (por extenso)'); y -= 17;
  linha(''); y -= 19;
  p.drawText('Referente a:', { x: X0, y, size: 9, font: fb, color: VERDE }); y -= 14;
  caixasQuebra(['Sinal / entrada', 'Parcela nº ______ do contrato', 'Intermediação', 'Taxa de cessão', 'Outros: ________________']);
  linha('Contrato / talão nº', L * 0.38); linha('Chácara', L * 0.24, X0 + L * 0.4); linha('Quadra', L * 0.32, X0 + L * 0.68); y -= 19;
  p.drawText('Forma de pagamento:', { x: X0, y, size: 9, font: fb, color: VERDE }); y -= 14;
  caixasQuebra(['Dinheiro', 'Pix', 'Transferência', 'Cartão', 'Cheque nº __________ banco ______']);
  linha('Local e data:  Açailândia/MA,', L * 0.62); y -= 30;
  // Assinatura de quem recebeu
  p.drawLine({ start: { x: X0, y }, end: { x: X0 + L * 0.55, y }, thickness: 0.6, color: CINZA });
  p.drawText('Assinatura de quem recebeu', { x: X0, y: y - 10, size: 7.5, font: f, color: CINZA });
  p.drawText('Nome / CPF / CRECI:', { x: X0 + L * 0.6, y: y + 6, size: 7.5, font: fb, color: VERDE });
  p.drawLine({ start: { x: X0 + L * 0.6, y }, end: { x: X1, y }, thickness: 0.6, color: CINZA });
  y -= 22;
  const nota = `Recebido em nome de ${emp.vendedora || 'PROMITENTE VENDEDORA'}${emp.vendedoraDoc ? ` (${emp.vendedoraDoc})` : ''}, promitente vendedora do ${emp.nome}. Recibo provisório de campo: vale com a baixa do pagamento no sistema, quando o escritório emite o recibo oficial. Prefira Pix ou boleto da plataforma de pagamentos.`;
  // quebra simples da nota
  const palavras = nota.split(' ');
  let atual = '';
  for (const w of palavras) {
    const t = atual ? `${atual} ${w}` : w;
    if (f.widthOfTextAtSize(t, 7) > L) { p.drawText(atual, { x: X0, y, size: 7, font: f, color: CINZA }); y -= 9; atual = w; } else atual = t;
  }
  if (atual) { p.drawText(atual, { x: X0, y, size: 7, font: f, color: CINZA }); y -= 9; }
  return y;
}

/** Uma folha do talão de recibos: 1ª via (comprador) + linha de corte + 2ª via (escritório) */
export async function folhaDoRecibo(slug: string, numero: number | null): Promise<Buffer> {
  const emp = await dadosDoEmpreendimento(slug);
  const doc = await PDFDocument.create();
  doc.setTitle(`Talão de recibo ${pad6(numero)}`);
  const m = await embutirMarca(doc, emp.marca);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.addPage(A4);
  const r = desenharMarca(p, m);
  const meio = (r.topo + r.base) / 2 + 8;
  via(p, f, fb, r.topo - 14, numero, '1ª VIA — QUEM PAGOU', emp, false);
  // Linha de corte
  p.drawLine({ start: { x: 24, y: meio }, end: { x: A4[0] - 24, y: meio }, thickness: 0.8, color: CINZA, dashArray: [5, 4] });
  p.drawText('- - recorte aqui · a 2ª via volta ao escritório na prestação de contas do talão', { x: 26, y: meio + 4, size: 7, font: f, color: CINZA });
  via(p, f, fb, meio - 18, numero, '2ª VIA — ESCRITÓRIO', emp, true);
  // Número no topo (como no talão de contrato) e rodapé
  p.drawRectangle({ x: A4[0] - 150, y: A4[1] - 26, width: 132, height: 16, color: rgb(1, 1, 1), borderColor: DOURADO, borderWidth: 0.8 });
  p.drawText(`RECIBO Nº ${pad6(numero)}`, { x: A4[0] - 144, y: A4[1] - 21, size: 9, font: fb, color: VERDE });
  p.drawText(`${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · CNPJ ${ESCRITORIO.cnpj}`, { x: 20, y: 6, size: 6.5, font: f, color: CINZA });
  return Buffer.from(await doc.save());
}
