/**
 * PDF das tabelas de comissão (corretor 2% e escritório 5%) com a marca do empreendimento: como e quando a comissão é
 * paga em cada forma de pagamento (com os valores de uma chácara de exemplo) e a comissão de cada chácara à venda.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { desenharMarca, embutirMarca } from '../contratos/anexos';
import { ESCRITORIO, GESTOR_EMPREENDIMENTO } from '../../shared/escritorio';
import { brl } from '../../shared/simulador';
import { TITULO_TABELA_COMISSAO } from '../../shared/tabelaComissao';
import type { dadosTabelaComissao } from './tabelaComissao';

type Dados = Awaited<ReturnType<typeof dadosTabelaComissao>>;

const VERDE = rgb(0.047, 0.2, 0.125);
const CINZA = rgb(0.35, 0.35, 0.35);
const BORDA = rgb(0.75, 0.75, 0.72);
const LINHA_PAR = rgb(0.95, 0.94, 0.9);
const BRANCO = rgb(1, 1, 1);
const W = 595.28, H = 841.89, X0 = 48, X1 = W - 48;

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const m2 = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10).split('-').reverse().join('/');

function quebrar(s: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of s.split(/\s+/)) {
    const t = atual ? `${atual} ${palavra}` : palavra;
    if (atual && font.widthOfTextAtSize(t, size) > largura) { linhas.push(atual); atual = palavra; } else atual = t;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

async function marcaDoEmpreendimento(slug: string): Promise<string> {
  try {
    const { getDb } = await import('../db');
    const { empreendimentos } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const d: any = await getDb();
    const [emp]: any[] = d ? await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1) : [];
    if (!emp) return 'bomjardims';
    const { juridicoDe } = await import('../contratos/servico');
    const j: any = await juridicoDe(Number(emp.id));
    return String(j?.marcaSlug ?? 'bomjardims');
  } catch { return 'bomjardims'; }
}

export async function pdfTabelaComissao(d: Dados): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${TITULO_TABELA_COMISSAO[d.tipo]} — ${d.empreendimento.nome}`);
  const marca = await embutirMarca(doc, await marcaDoEmpreendimento(d.empreendimento.slug));
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let p!: PDFPage, y = 0, base = 0;
  const novaPagina = () => { p = doc.addPage([W, H]); paginas.push(p); const r = desenharMarca(p, marca); y = r.topo; base = r.base + 14; };
  const texto = (s: string, o: { x?: number; size?: number; font?: PDFFont; cor?: ReturnType<typeof rgb>; largura?: number; entre?: number } = {}) => {
    const size = o.size ?? 8.5, font = o.font ?? f;
    for (const l of quebrar(s, font, size, o.largura ?? X1 - X0)) {
      if (y - size - 2 < base) novaPagina();
      p.drawText(l, { x: o.x ?? X0, y: y - size, size, font, color: o.cor ?? rgb(0.1, 0.1, 0.1) });
      y -= size + (o.entre ?? 3.5);
    }
  };
  /** Tabela simples: colunas com largura e alinhamento; repete o cabeçalho ao virar a página */
  const tabela = (cols: { t: string; w: number; dir?: boolean }[], linhas: { c: string[]; negrito?: boolean; faixa?: boolean }[]) => {
    const xs = cols.map((_, i) => X0 + cols.slice(0, i).reduce((s, c) => s + c.w, 0));
    const T = 7.6, LH = 9.4;
    const cab = () => {
      p.drawRectangle({ x: X0, y: y - 15, width: X1 - X0, height: 15, color: VERDE });
      cols.forEach((c, i) => {
        const w = fb.widthOfTextAtSize(c.t, 7.4);
        p.drawText(c.t, { x: c.dir ? xs[i] + c.w - 4 - w : xs[i] + 4, y: y - 10.5, size: 7.4, font: fb, color: BRANCO });
      });
      y -= 15;
    };
    if (y - 40 < base) novaPagina();
    cab();
    linhas.forEach((l, k) => {
      const partes = l.c.map((v, i) => quebrar(v, l.negrito ? fb : f, T, cols[i].w - 8));
      const alt = Math.max(...partes.map(x => x.length)) * LH + 5;
      if (y - alt < base) { novaPagina(); cab(); }
      p.drawRectangle({ x: X0, y: y - alt, width: X1 - X0, height: alt, borderColor: BORDA, borderWidth: 0.5, color: l.faixa ? LINHA_PAR : k % 2 ? rgb(0.985, 0.98, 0.965) : undefined });
      partes.forEach((ls, i) => ls.forEach((t, j) => {
        const font = l.negrito ? fb : f;
        const x = cols[i].dir ? xs[i] + cols[i].w - 4 - font.widthOfTextAtSize(t, T) : xs[i] + 4;
        p.drawText(t, { x, y: y - 3 - (j + 1) * LH + 2, size: T, font, color: rgb(0.1, 0.1, 0.1) });
      }));
      y -= alt;
    });
  };

  novaPagina();
  const titulo = `TABELA DE COMISSÃO DE ${d.tipo === 'corretor' ? 'VENDA' : 'GESTÃO'} (${pct(d.pct)})`;
  p.drawText(titulo, { x: (W - fb.widthOfTextAtSize(titulo, 12.5)) / 2, y: y - 13, size: 12.5, font: fb, color: VERDE });
  y -= 19;
  const sub = `${TITULO_TABELA_COMISSAO[d.tipo]} · ${d.empreendimento.nome}`;
  p.drawText(sub, { x: (W - f.widthOfTextAtSize(sub, 8.6)) / 2, y: y - 9, size: 8.6, font: f, color: CINZA });
  y -= 18;
  // Gestora e responsável técnico (em todas as tabelas)
  const caixa = 34;
  p.drawRectangle({ x: X0, y: y - caixa, width: X1 - X0, height: caixa, color: LINHA_PAR, borderColor: BORDA, borderWidth: 0.6 });
  p.drawText(GESTOR_EMPREENDIMENTO.titulo.toUpperCase(), { x: X0 + 8, y: y - 10, size: 7, font: fb, color: VERDE });
  p.drawText(GESTOR_EMPREENDIMENTO.gestora, { x: X0 + 8, y: y - 20, size: 8, font: fb, color: rgb(0.1, 0.1, 0.1) });
  p.drawText(GESTOR_EMPREENDIMENTO.responsavel, { x: X0 + 8, y: y - 30, size: 7.8, font: f, color: rgb(0.1, 0.1, 0.1) });
  y -= caixa + 10;
  texto(d.tipo === 'corretor'
    ? `Comissão de venda: o(a) corretor(a) intermediador(a) recebe ${pct(d.pct)} do valor da venda, repassados pela gestora (${ESCRITORIO.fantasia}) no ritmo dos pagamentos do comprador, conforme a forma de pagamento escolhida no contrato.`
    : `Comissão de gestão: o empreendimento paga à gestora geral (${ESCRITORIO.fantasia}) ${pct(d.pct)} do valor da venda, já incluídos no preço e já incluída a comissão de venda do(a) corretor(a) intermediador(a), no ritmo dos pagamentos do comprador, conforme a forma de pagamento escolhida no contrato.`, { size: 8.6 });
  y -= 6;

  // 1. Como e quando é paga
  texto('1. COMO E QUANDO A COMISSÃO É PAGA', { font: fb, size: 9.5, cor: VERDE });
  if (d.exemplo) texto(`Valores de exemplo: chácara ${d.exemplo.codigo} (${m2(d.exemplo.areaM2)}) — preço de tabela ${brl(d.exemplo.preco)}, à vista ${brl(d.exemplo.avista)}.`, { size: 8, cor: CINZA });
  y -= 3;
  const linhas1: { c: string[]; negrito?: boolean; faixa?: boolean }[] = [];
  for (const l of d.linhas) {
    linhas1.push({ c: [l.forma, `${pct(d.pct)} sobre o ${l.baseRotulo}`, '', brl(l.valor)], negrito: true, faixa: true });
    for (const pg of l.pagamentos) linhas1.push({ c: [`   ${pg.quando}`, '', pct(pg.pct), brl(pg.valor)] });
  }
  tabela([{ t: 'Forma de pagamento / quando recebe', w: 205 }, { t: 'Base de cálculo', w: 140 }, { t: 'Parte', w: 50, dir: true }, { t: 'Valor (exemplo)', w: X1 - X0 - 395, dir: true }], linhas1);
  y -= 12;

  // 2. Comissão por chácara
  texto('2. COMISSÃO POR CHÁCARA À VENDA', { font: fb, size: 9.5, cor: VERDE });
  texto('Entrada de 30% (à vista ou parcelada) e Planos A, B e C: comissão sobre o preço de tabela. À vista total: sobre o valor à vista.', { size: 8, cor: CINZA });
  y -= 3;
  tabela(
    [{ t: 'Chácara', w: 60 }, { t: 'Área', w: 75, dir: true }, { t: 'Preço de tabela', w: 92, dir: true }, { t: `Comissão (${pct(d.pct)})`, w: 85, dir: true }, { t: 'À vista', w: 92, dir: true }, { t: 'Comissão à vista', w: X1 - X0 - 404, dir: true }],
    d.chacaras.map(c => ({ c: [c.codigo, m2(c.areaM2), brl(c.preco), brl(Math.round(c.preco * d.pct * 100) / 100), brl(c.avista), brl(Math.round(c.avista * d.pct * 100) / 100)] })),
  );
  if (!d.chacaras.length) texto('Nenhuma chácara à venda no momento.', { size: 8.5, cor: CINZA });
  y -= 10;

  texto('3. OBSERVAÇÕES', { font: fb, size: 9.5, cor: VERDE });
  const obs = d.tipo === 'corretor'
    ? [`A comissão é retida pela plataforma de pagamentos quando cada pagamento indicado é compensado e repassada ao(à) corretor(a) em até ${d.repasseDiasUteis} dias úteis.`,
      'Vale a forma de pagamento escolhida no contrato; os valores acima são de referência para as chácaras à venda nesta data.']
    : [`A comissão é retida na própria plataforma de pagamentos (split para a conta do escritório) na compensação de cada pagamento indicado, sem cobrança à parte ao empreendimento. O escritório repassa a parte do(a) corretor(a) em até ${d.repasseDiasUteis} dias úteis.`,
      'Venda direta do escritório, sem corretor: a comissão integral fica com o escritório.',
      'Vale a forma de pagamento escolhida no contrato; os valores acima são de referência para as chácaras à venda nesta data.'];
  for (const o of obs) texto(`• ${o}`, { size: 8.2 });

  paginas.forEach((pg, k) => {
    const s = `${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · gerada em ${hoje()} · página ${k + 1} de ${paginas.length}`;
    pg.drawText(s, { x: X1 - f.widthOfTextAtSize(s, 7), y: 40, size: 7, font: f, color: CINZA });
  });
  return Buffer.from(await doc.save());
}
