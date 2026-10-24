/**
 * Anexos do CPCV: II (tabela de pagamento, gerada aqui), III (Estatuto, merge do modelo), IV (Diretrizes de Uso, PDF fixo).
 * I (dossiê do lote), V (mapa de vendas) e VI (licença + certidão do registro) entram quando os arquivos estiverem no CRM.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import type { Ctx } from './contexto';
import { brl, dataBR, pct } from './formato';
import type { PlanoContrato } from './plano';
import { docxParaPdf, mergeDocx, pastaTemplates } from './render';

const VERDE = rgb(0.047, 0.2, 0.125); // #0C3320
const CINZA = rgb(0.35, 0.35, 0.35);
const LINHA_PAR = rgb(0.95, 0.94, 0.9);

export interface MarcaPdf { cabecalho: PDFImage; rodape: PDFImage; marcaDagua: PDFImage }

export async function embutirMarca(doc: PDFDocument, slug: string): Promise<MarcaPdf> {
  const dir = path.join(pastaTemplates(), 'marca', slug);
  const [cabecalho, rodape, marcaDagua] = await Promise.all(['cabecalho.png', 'rodape.png', 'marca_dagua.png']
    .map(async f => doc.embedPng(await readFile(path.join(dir, f)))));
  return { cabecalho, rodape, marcaDagua };
}

/** Cabeçalho, marca d'água e rodapé do empreendimento numa página (16,5 cm / 14,5 cm, como nos modelos DOCX) */
export function desenharMarca(p: PDFPage, m: MarcaPdf): { topo: number; base: number } {
  const { width, height } = p.getSize();
  const cm = 72 / 2.54;
  const wa = 14.5 * cm, ha = (wa * m.marcaDagua.height) / m.marcaDagua.width;
  p.drawImage(m.marcaDagua, { x: (width - wa) / 2, y: (height - ha) / 2, width: wa, height: ha });
  const wc = 16.5 * cm, hc = (wc * m.cabecalho.height) / m.cabecalho.width;
  p.drawImage(m.cabecalho, { x: (width - wc) / 2, y: height - 0.8 * cm - hc, width: wc, height: hc });
  const hr = (wc * m.rodape.height) / m.rodape.width;
  p.drawImage(m.rodape, { x: (width - wc) / 2, y: 0.6 * cm, width: wc, height: hr });
  return { topo: height - 0.8 * cm - hc - 10, base: 0.6 * cm + hr + 10 };
}

const ROTULO_TIPO = { entrada: 'Entrada', saldo: 'Saldo', avista: 'À vista' } as const;

/** Anexo II — tabela de pagamento do plano (A4 paisagem, com a marca do empreendimento) */
export async function anexoTabelaPagamento(plano: PlanoContrato, ctx: Ctx, marcaSlug: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Anexo II — Tabela de pagamento — ${ctx.ctr_numero}`);
  const marca = await embutirMarca(doc, marcaSlug);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, X0 = 60, X1 = W - 60;
  const cols: { t: string; w: number; dir?: boolean }[] = [
    { t: 'Nº', w: 40 }, { t: 'Parcela', w: 90 }, { t: 'Vencimento', w: 90 }, { t: 'Valor (R$)', w: 110, dir: true },
    { t: 'Juros (R$)', w: 110, dir: true }, { t: 'Amortização (R$)', w: 140, dir: true }, { t: 'Saldo devedor (R$)', w: X1 - X0 - 580, dir: true },
  ];
  const texto = (p: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont = f, color = rgb(0, 0, 0)) => p.drawText(s, { x, y, size, font, color });
  const celula = (p: PDFPage, valores: string[], y: number, font: PDFFont, size: number) => {
    let x = X0;
    cols.forEach((c, i) => {
      const s = valores[i];
      const tx = c.dir ? x + c.w - 6 - font.widthOfTextAtSize(s, size) : x + 6;
      texto(p, s, tx, y, size, font);
      x += c.w;
    });
  };

  const linhas = plano.parcelas.map((l, i) => [String(i + 1), `${ROTULO_TIPO[l.tipo]} ${l.numero}/${l.total}`, dataBR(l.vencimento),
    brl(l.valor), brl(l.juros), brl(l.amortizacao), brl(l.saldoDevedor)]);
  const ALT = 13;
  let i = 0, pagina = 0;
  const paginas: PDFPage[] = [];
  while (i < linhas.length || pagina === 0) {
    const p = doc.addPage([W, H]);
    paginas.push(p);
    const { topo, base } = desenharMarca(p, marca);
    let y = topo - 4;
    texto(p, 'ANEXO II — TABELA DE PAGAMENTO DO PLANO ESCOLHIDO', X0, y, 12, fb, VERDE);
    y -= 15;
    texto(p, `Contrato n.º ${ctx.ctr_numero} · ${ctx.emp_nome} · Chácara ${ctx.lote_codigo} · ${ctx.comp_nome}`, X0, y, 8.5, f, CINZA);
    y -= 18;
    p.drawRectangle({ x: X0, y: y - 4, width: X1 - X0, height: ALT + 2, color: VERDE });
    let x = X0;
    cols.forEach(c => {
      const tx = c.dir ? x + c.w - 6 - fb.widthOfTextAtSize(c.t, 8) : x + 6;
      p.drawText(c.t, { x: tx, y, size: 8, font: fb, color: rgb(1, 1, 1) });
      x += c.w;
    });
    y -= ALT + 2;
    const reservaFim = 46; // espaço do resumo na última página
    while (i < linhas.length && y - ALT > base + (i === linhas.length - 1 ? reservaFim : 0)) {
      if (i % 2 === 1) p.drawRectangle({ x: X0, y: y - 3.5, width: X1 - X0, height: ALT, color: LINHA_PAR, opacity: 0.85 });
      celula(p, linhas[i], y, f, 8);
      y -= ALT;
      i++;
    }
    if (i >= linhas.length) {
      y -= 8;
      p.drawLine({ start: { x: X0, y: y + 8 }, end: { x: X1, y: y + 8 }, thickness: 0.6, color: VERDE });
      const resumo = plano.modalidade === 'avista'
        ? `Pagamento integral à vista: R$ ${brl(plano.total_pagar)} (preço de tabela R$ ${brl(plano.preco_tabela)} menos desconto de R$ ${brl(plano.desconto_avista_total)}).`
        : `Juros de ${pct(plano.taxa_aa)} ao ano, efetivos (${pct(plano.taxa_am, 4)} ao mês), Tabela Price · Total pago: R$ ${brl(plano.total_pagar)} · Total de juros: R$ ${brl(plano.total_juros)}`;
      texto(p, resumo, X0, y - 2, 8.5, fb);
      texto(p, 'Parcelas fixas; correção apenas sobre valores em atraso (Cláusula 7ª). Havendo divergência, prevalece o cálculo pela fórmula da Tabela Price à taxa contratada.', X0, y - 15, 7.5, f, CINZA);
    }
    pagina++;
  }
  paginas.forEach((p, k) => {
    const s = `Anexo II · página ${k + 1} de ${paginas.length}`;
    p.drawText(s, { x: X1 - f.widthOfTextAtSize(s, 7), y: 40, size: 7, font: f, color: CINZA });
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** Tags do Estatuto (Anexo III) a partir do contexto do contrato */
export function contextoEstatuto(ctx: Ctx): Ctx {
  return {
    ...ctx,
    est_versao: String(ctx.est_versao ?? 'v1.0 (out/2026)'),
    est_data_extenso: String(ctx.ctr_data_extenso ?? ''),
    inst_nome: String(ctx.vend_pj ? ctx.vend_razao_social ?? '' : ctx.vend_nome ?? ''),
    inst_documento: ctx.vend_pj ? `CNPJ ${ctx.vend_cnpj ?? ''}` : `CPF ${ctx.vend_cpf ?? ''}`,
  };
}

/** Anexo III — Estatuto da associação (merge do modelo, mesma marca) */
export async function anexoEstatuto(ctx: Ctx, opcoes: { minuta: boolean; marca: string }): Promise<Buffer> {
  return docxParaPdf(await mergeDocx('MODELO-ESTATUTO-ASSOCIACAO-BOM-JARDIMS-v1.docx', contextoEstatuto(ctx), opcoes));
}

/** Anexo IV — Diretrizes de Uso (PDF pronto do empreendimento) */
export async function anexoDiretrizes(): Promise<Buffer> {
  return readFile(path.join(pastaTemplates(), 'CHECKLIST-Diretrizes-Uso-Bom-Jardims.pdf'));
}
