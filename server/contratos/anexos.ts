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

/**
 * Estatuto (Anexo III): para mudar o texto, edite o DOCX em templates/ e suba a versão aqui — os contratos
 * gerados depois saem com o texto novo; os já gerados guardam o PDF da época (contratoVersoes).
 */
export const ESTATUTO = { arquivo: 'MODELO-ESTATUTO-ASSOCIACAO-BOM-JARDIMS-v2.docx', versao: 'v1.2 (out/2026)' };

/** Tags do Estatuto (Anexo III) a partir do contexto do contrato */
export function contextoEstatuto(ctx: Ctx): Ctx {
  return {
    ...ctx,
    est_versao: String(ctx.est_versao ?? ESTATUTO.versao),
    est_data_extenso: String(ctx.ctr_data_extenso ?? ''),
    inst_nome: String(ctx.vend_pj ? ctx.vend_razao_social ?? '' : ctx.vend_nome ?? ''),
    inst_documento: ctx.vend_pj ? `CNPJ ${ctx.vend_cnpj ?? ''}` : `CPF ${ctx.vend_cpf ?? ''}`,
  };
}

/** Anexo III — Estatuto da associação (merge do modelo, mesma marca) */
export async function anexoEstatuto(ctx: Ctx, opcoes: { minuta: boolean; marca: string }): Promise<Buffer> {
  return docxParaPdf(await mergeDocx(ESTATUTO.arquivo, contextoEstatuto(ctx), opcoes));
}

type Opcao = 'P' | 'CC' | 'PR';
interface Diretrizes {
  versao: string; titulo: string; subtitulo: string; intro: string;
  secoes: { titulo: string; itens: [number, string, Opcao, string][] }[];
  parametros: [string, string][];
}

/** Quebra o texto em linhas que cabem na largura */
function quebrar(s: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of s.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (atual && font.widthOfTextAtSize(tentativa, size) > largura) { linhas.push(atual); atual = palavra; } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Anexo IV — Diretrizes de Uso: checklist digital com as escolhas da proprietária (templates/diretrizes-uso-bom-jardims.json —
 * para mudar uma regra, edite o JSON e suba a versão), A4 retrato com a marca do empreendimento
 */
export async function anexoDiretrizes(ctx: Ctx, marcaSlug: string): Promise<Buffer> {
  const d: Diretrizes = JSON.parse(await readFile(path.join(pastaTemplates(), 'diretrizes-uso-bom-jardims.json'), 'utf8'));
  const tag = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx[k] ?? '').trim() || '—');
  const doc = await PDFDocument.create();
  doc.setTitle(`Diretrizes de Uso — ${ctx.emp_nome ?? ''}`);
  const marca = await embutirMarca(doc, marcaSlug);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, X0 = 48, X1 = W - 48;
  const cols = [{ t: 'Nº', w: 22 }, { t: 'Atividade / item', w: 150 }, { t: 'Permitido', w: 50 }, { t: 'Com condições', w: 56 }, { t: 'Proibido', w: 48 }, { t: 'Regra', w: X1 - X0 - 326 }];
  const xCol = (i: number) => X0 + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const OPCOES: Opcao[] = ['P', 'CC', 'PR'];
  const COR_OPCAO = { P: rgb(0.13, 0.48, 0.24), CC: rgb(0.72, 0.5, 0.07), PR: rgb(0.7, 0.13, 0.13) };
  const BORDA = rgb(0.75, 0.75, 0.72);
  const T = 7.8, LH = 9.6;

  const paginas: PDFPage[] = [];
  let p!: PDFPage, y = 0, base = 0;
  const cabecalhoTabela = () => {
    const alt = 22;
    p.drawRectangle({ x: X0, y: y - alt, width: X1 - X0, height: alt, color: VERDE });
    cols.forEach((c, i) => {
      const ls = quebrar(c.t, fb, 7.5, c.w - 6);
      ls.forEach((l, k) => {
        const centro = i >= 2 && i <= 4;
        const x = centro ? xCol(i) + (c.w - fb.widthOfTextAtSize(l, 7.5)) / 2 : xCol(i) + 4;
        p.drawText(l, { x, y: y - 9 - k * 8.5 + (ls.length === 1 ? -3 : 0), size: 7.5, font: fb, color: rgb(1, 1, 1) });
      });
    });
    y -= alt;
  };
  const novaPagina = (comTabela: boolean) => {
    p = doc.addPage([W, H]);
    paginas.push(p);
    const m = desenharMarca(p, marca);
    y = m.topo; base = m.base + 14;
    if (comTabela) cabecalhoTabela();
  };

  novaPagina(false);
  for (const l of quebrar(d.titulo, fb, 11.5, X1 - X0)) {
    p.drawText(l, { x: (W - fb.widthOfTextAtSize(l, 11.5)) / 2, y: y - 12, size: 11.5, font: fb, color: VERDE });
    y -= 14.5;
  }
  p.drawText(d.subtitulo, { x: (W - f.widthOfTextAtSize(d.subtitulo, 8.5)) / 2, y: y - 9, size: 8.5, font: f, color: CINZA });
  y -= 20;
  for (const l of quebrar(d.intro, f, 8.2, X1 - X0)) { p.drawText(l, { x: X0, y: y - 8, size: 8.2, font: f }); y -= 10.5; }
  y -= 8;
  cabecalhoTabela();

  for (const s of d.secoes) {
    if (y - 16 - 2 * LH - 6 < base) novaPagina(true);
    p.drawRectangle({ x: X0, y: y - 15, width: X1 - X0, height: 15, color: LINHA_PAR, borderColor: BORDA, borderWidth: 0.5 });
    p.drawText(s.titulo, { x: X0 + 4, y: y - 10.5, size: 8, font: fb, color: VERDE });
    y -= 15;
    for (const [n, atividade, opcao, regra] of s.itens) {
      const la = quebrar(atividade, f, T, cols[1].w - 8);
      const lr = quebrar(regra, opcao === 'CC' ? fb : f, T, cols[5].w - 8);
      const alt = Math.max(la.length, lr.length, 1) * LH + 7;
      if (y - alt < base) novaPagina(true);
      p.drawRectangle({ x: X0, y: y - alt, width: X1 - X0, height: alt, borderColor: BORDA, borderWidth: 0.5 });
      for (let i = 1; i < cols.length; i++) p.drawLine({ start: { x: xCol(i), y }, end: { x: xCol(i), y: y - alt }, thickness: 0.5, color: BORDA });
      p.drawText(String(n), { x: xCol(0) + (cols[0].w - f.widthOfTextAtSize(String(n), T)) / 2, y: y - 4 - LH + 1.5, size: T, font: f });
      la.forEach((l, k) => p.drawText(l, { x: xCol(1) + 4, y: y - 4 - (k + 1) * LH + 1.5, size: T, font: f }));
      lr.forEach((l, k) => p.drawText(l, { x: xCol(5) + 4, y: y - 4 - (k + 1) * LH + 1.5, size: T, font: opcao === 'CC' ? fb : f, color: opcao === 'CC' ? rgb(0.2, 0.2, 0.2) : CINZA }));
      // Caixinha em cada opção; a escolhida vai preenchida com o visto
      OPCOES.forEach((o, k) => {
        const lado = 9, cx = xCol(k + 2) + cols[k + 2].w / 2, cy = y - alt / 2;
        const marcada = o === opcao;
        p.drawRectangle({ x: cx - lado / 2, y: cy - lado / 2, width: lado, height: lado, borderColor: marcada ? COR_OPCAO[o] : BORDA, borderWidth: 0.9, color: marcada ? COR_OPCAO[o] : undefined });
        if (marcada) p.drawSvgPath('M -2.6 0 L -0.8 2 L 2.8 -2.2', { x: cx, y: cy, borderColor: rgb(1, 1, 1), borderWidth: 1.4 });
      });
      y -= alt;
    }
  }

  // Parâmetros definidos pela proprietária
  const ALTP = 13;
  if (y - 26 - (d.parametros.length + 1) * ALTP - 18 < base) novaPagina(false);
  y -= 12;
  p.drawText('PARÂMETROS DEFINIDOS', { x: X0, y: y - 10, size: 9.5, font: fb, color: VERDE });
  y -= 14;
  const xv = X0 + 235;
  p.drawRectangle({ x: X0, y: y - ALTP, width: X1 - X0, height: ALTP, color: VERDE });
  p.drawText('Parâmetro', { x: X0 + 4, y: y - 9.3, size: 7.8, font: fb, color: rgb(1, 1, 1) });
  p.drawText('Valor definido', { x: xv + 4, y: y - 9.3, size: 7.8, font: fb, color: rgb(1, 1, 1) });
  y -= ALTP;
  d.parametros.forEach(([rotulo, valor], k) => {
    p.drawRectangle({ x: X0, y: y - ALTP, width: X1 - X0, height: ALTP, borderColor: BORDA, borderWidth: 0.5, color: k % 2 ? LINHA_PAR : undefined });
    p.drawLine({ start: { x: xv, y }, end: { x: xv, y: y - ALTP }, thickness: 0.5, color: BORDA });
    p.drawText(rotulo, { x: X0 + 4, y: y - 9.3, size: T, font: f });
    p.drawText(tag(valor), { x: xv + 4, y: y - 9.3, size: T, font: fb });
    y -= ALTP;
  });
  y -= 14;
  const instituidora = String(ctx.vend_pj ? ctx.vend_razao_social ?? '' : ctx.vend_nome ?? '').trim();
  if (instituidora) p.drawText(`Definidas pela proprietária/instituidora: ${instituidora}.`, { x: X0, y: y - 8, size: 8, font: f, color: CINZA });

  paginas.forEach((pg, k) => {
    const s = `Diretrizes de Uso ${d.versao} · página ${k + 1} de ${paginas.length}`;
    pg.drawText(s, { x: X1 - f.widthOfTextAtSize(s, 7), y: 40, size: 7, font: f, color: CINZA });
  });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/**
 * Anexo VIII — Tabela Tarifária de Água (média CAEMA × SAAE de Açailândia, com as tabelas de origem): PDF fixo do
 * empreendimento em templates/anexos/<marca>/ANEXO-VIII-TARIFA-AGUA.pdf. Reajustou a CAEMA ou o SAAE: troca-se o arquivo.
 * Sem o arquivo (outro empreendimento), o contrato sai sem este anexo.
 */
export async function anexoTarifaAgua(marcaSlug: string): Promise<Buffer | null> {
  if (!/^[a-z0-9-]+$/.test(marcaSlug)) return null;
  return readFile(path.join(pastaTemplates(), 'anexos', marcaSlug, 'ANEXO-VIII-TARIFA-AGUA.pdf')).catch(() => null);
}
