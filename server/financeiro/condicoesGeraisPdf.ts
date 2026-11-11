/**
 * "Todas as condições" em PDF (Simulador › corretor): todas as formas de comprar a chácara padrão do empreendimento
 * (área-base das condições, ex.: 3.025 m²) — à vista, entrada de 30% à vista ou parcelada com cada prazo, e os
 * Planos A, B e C — para o corretor mandar ao cliente antes da proposta exclusiva da chácara escolhida.
 * Mesmo cálculo do simulador (shared/simulador.ts e shared/condicoesLancamento.ts).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { condicoesPagamento, empreendimentos, users } from '../../drizzle/schema';
import { desenharMarca, embutirMarca } from '../contratos/anexos';
import { ESCRITORIO, LINHA_PUBLICIDADE } from '../../shared/escritorio';
import { brl, condicoesDaLinha, precoLote, simular, type CondicoesPagamento } from '../../shared/simulador';
import { ENTRADA_LANCAMENTO, ROTULO_CONDICAO, planosDaCondicao, type CondicaoPagamento } from '../../shared/condicoesLancamento';
import { numeroCreciPF } from '../../shared/cartaoVendas';
import { ALTURA_CARTAO, corretorParaPdf, desenharCartaoCorretor, type CorretorPdf } from '../pdf/cartaoCorretor';

const VERDE = rgb(0.047, 0.2, 0.125);
const CINZA = rgb(0.35, 0.35, 0.35);
const BORDA = rgb(0.75, 0.75, 0.72);
const FAIXA = rgb(0.95, 0.94, 0.9);
const BRANCO = rgb(1, 1, 1);
const PRETO = rgb(0.1, 0.1, 0.1);
const W = 595.28, H = 841.89, X0 = 48, X1 = W - 48;

export class CondicoesErro extends Error { constructor(m: string, public status: number) { super(m); } }

const segredo = () => process.env.FINANCEIRO_LINK_SECRET || process.env.JWT_SECRET || 'romatec-condicoes';
/** Link público do PDF para o cliente: empreendimento + corretor que enviou (assinado, sem validade) */
export function tokenCondicoes(slug: string, corretorId: number): string {
  const sig = createHmac('sha256', segredo()).update(`condicoes|${slug}|${corretorId}`).digest('base64url').slice(0, 22);
  return `${corretorId}.${sig}`;
}
export function corretorDoToken(slug: string, token: string): number | null {
  const m = /^(\d{1,10})\.([A-Za-z0-9_-]{22})$/.exec(String(token ?? ''));
  if (!m) return null;
  const a = Buffer.from(tokenCondicoes(slug, Number(m[1])).split('.')[1]);
  const b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? Number(m[1]) : null;
}

const pct = (x: number) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const m2 = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10).split('-').reverse().join('/');
const anos = (meses: number) => (meses % 12 === 0 ? `${meses / 12} ano${meses === 12 ? '' : 's'}` : `${meses} meses`);

function quebrar(s: string, font: PDFFont, size: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of s.split(/\s+/)) {
    const t = atual ? `${atual} ${p}` : p;
    if (atual && font.widthOfTextAtSize(t, size) > largura) { linhas.push(atual); atual = p; } else atual = t;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export interface DadosCondicoes {
  empreendimento: { nome: string; slug: string; municipio: string | null; uf: string | null };
  c: CondicoesPagamento;
  marca: string;
  /** Cartão do corretor que enviou (carimbo + foto) */
  corretor: CorretorPdf | null;
}

export async function dadosCondicoes(slug: string, corretorId: number | null): Promise<DadosCondicoes> {
  const d: any = await getDb();
  if (!d) throw new CondicoesErro('Banco indisponível', 503);
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new CondicoesErro('Empreendimento não encontrado', 404);
  const [cond]: any[] = await d.select().from(condicoesPagamento)
    .where(and(eq(condicoesPagamento.empreendimentoId, emp.id), eq(condicoesPagamento.ativo, true)))
    .orderBy(desc(condicoesPagamento.vigenteDesde), desc(condicoesPagamento.id)).limit(1);
  if (!cond) throw new CondicoesErro('Condições de pagamento não cadastradas para este empreendimento', 412);
  let marca = 'bomjardims';
  try { const { juridicoDe } = await import('../contratos/servico'); marca = String((await juridicoDe(Number(emp.id)) as any)?.marcaSlug ?? marca); } catch { /* marca padrão */ }
  let corretor: DadosCondicoes['corretor'] = null;
  if (corretorId) {
    const [u]: any[] = await d.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(users.id, corretorId)).limit(1);
    if (u) corretor = await corretorParaPdf(Number(u.id));
  }
  return { empreendimento: { nome: String(emp.nome), slug, municipio: emp.municipio ?? null, uf: emp.uf ?? null }, c: condicoesDaLinha(cond), marca, corretor };
}

export async function pdfCondicoesGerais(dd: DadosCondicoes): Promise<Buffer> {
  const { c } = dd;
  const area = c.areaBaseM2;
  const preco = precoLote(area, c);
  const sim = simular(area, 1, c, null);
  const doc = await PDFDocument.create();
  doc.setTitle(`Condições de pagamento — ${dd.empreendimento.nome}`);
  const marca = await embutirMarca(doc, dd.marca);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const paginas: PDFPage[] = [];
  let p!: PDFPage, y = 0, base = 0;
  const nova = () => { p = doc.addPage([W, H]); paginas.push(p); const r = desenharMarca(p, marca); y = r.topo; base = r.base + 14; };
  const texto = (s: string, o: { size?: number; font?: PDFFont; cor?: ReturnType<typeof rgb>; x?: number; centro?: boolean } = {}) => {
    const size = o.size ?? 8.6, font = o.font ?? f;
    for (const l of quebrar(s, font, size, X1 - X0)) {
      if (y - size - 2 < base) nova();
      const x = o.centro ? (W - font.widthOfTextAtSize(l, size)) / 2 : o.x ?? X0;
      p.drawText(l, { x, y: y - size, size, font, color: o.cor ?? PRETO });
      y -= size + 3.6;
    }
  };
  const titulo = (s: string, sub?: string) => {
    if (y - 70 < base) nova();
    y -= 8;
    p.drawRectangle({ x: X0, y: y - 18, width: X1 - X0, height: 18, color: VERDE });
    p.drawText(s, { x: X0 + 6, y: y - 12.6, size: 9.6, font: fb, color: BRANCO });
    y -= 22;
    if (sub) texto(sub, { size: 8, cor: CINZA });
    y -= 2;
  };
  const tabela = (cols: { t: string; w: number; dir?: boolean }[], linhas: string[][]) => {
    const xs = cols.map((_, i) => X0 + cols.slice(0, i).reduce((s, k) => s + k.w, 0));
    const ALT = 14, T = 8;
    const cab = () => {
      p.drawRectangle({ x: X0, y: y - ALT, width: X1 - X0, height: ALT, color: FAIXA, borderColor: BORDA, borderWidth: 0.5 });
      cols.forEach((k, i) => { const w = fb.widthOfTextAtSize(k.t, 7.6); p.drawText(k.t, { x: k.dir ? xs[i] + k.w - 4 - w : xs[i] + 4, y: y - 10, size: 7.6, font: fb, color: VERDE }); });
      y -= ALT;
    };
    if (y - ALT * 3 < base) nova();
    cab();
    linhas.forEach(l => {
      if (y - ALT < base) { nova(); cab(); }
      p.drawRectangle({ x: X0, y: y - ALT, width: X1 - X0, height: ALT, borderColor: BORDA, borderWidth: 0.5 });
      l.forEach((v, i) => { const font = i === 0 ? fb : f; const w = font.widthOfTextAtSize(v, T); p.drawText(v, { x: cols[i].dir ? xs[i] + cols[i].w - 4 - w : xs[i] + 4, y: y - 10, size: T, font, color: PRETO }); });
      y -= ALT;
    });
    y -= 6;
  };

  // Capa
  nova();
  texto('CONDIÇÕES DE PAGAMENTO', { size: 14, font: fb, cor: VERDE, centro: true });
  texto(`${dd.empreendimento.nome}${dd.empreendimento.municipio ? ` · ${dd.empreendimento.municipio}/${dd.empreendimento.uf ?? ''}` : ''}`, { size: 9, cor: CINZA, centro: true });
  y -= 6;
  p.drawRectangle({ x: X0, y: y - 46, width: X1 - X0, height: 46, color: FAIXA, borderColor: BORDA, borderWidth: 0.6 });
  p.drawText(`Chácara padrão de ${m2(area)}`, { x: X0 + 10, y: y - 17, size: 11, font: fb, color: VERDE });
  p.drawText(`Preço de tabela ${brl(preco)}  ·  à vista ${brl(sim.avistaTotal.valor)}`, { x: X0 + 10, y: y - 33, size: 9.5, font: f, color: PRETO });
  y -= 56;
  texto(`Todas as formas de comprar, para você comparar com calma. Chácaras maiores seguem o mesmo cálculo, proporcional à área. Juros de ${pct(c.jurosAaEfetivo)} ao ano (Tabela Price, parcelas fixas). Escolhida a chácara, o corretor envia a proposta exclusiva dela.`, { size: 8.6 });

  // 1. À vista
  titulo('1. À VISTA', `Pagamento único, com desconto de ${brl(sim.avistaTotal.desconto)} sobre o preço de tabela.`);
  tabela([{ t: 'Forma', w: 300 }, { t: 'Desconto', w: 100, dir: true }, { t: 'Valor', w: X1 - X0 - 400, dir: true }],
    [['À vista (valor total)', brl(sim.avistaTotal.desconto), brl(sim.avistaTotal.valor)]]);

  // 2. Entrada de 30%
  titulo(`2. ENTRADA DE ${pct(c.entradaPct)} + SALDO EM PARCELAS FIXAS`,
    `Entrada de ${brl(sim.entrada30)}: à vista com ${pct(c.descontoAvistaPct)} de desconto (${brl(sim.entradaAvista)}) ou em até ${c.entradaMaxParcelas}× sem juros. Saldo de ${brl(sim.saldo)} em parcelas fixas; durante a entrada parcelada, o saldo ainda não começa.`);
  tabela([{ t: 'Entrada', w: 200 }, { t: 'Valor de cada parcela', w: 150, dir: true }, { t: 'Total da entrada', w: X1 - X0 - 350, dir: true }],
    Array.from({ length: c.entradaMaxParcelas }, (_, k) => {
      const s = simular(area, k + 1, c, null);
      return [k === 0 ? 'À vista (com desconto)' : `${k + 1}× sem juros`, brl(s.parcelasEntrada[0]), brl(s.entradaEfetiva)];
    }));
  tabela([{ t: 'Prazo do saldo', w: 150 }, { t: 'Parcela mensal', w: 120, dir: true }, { t: 'Total do saldo', w: 120, dir: true }, { t: 'Total da compra', w: X1 - X0 - 390, dir: true }],
    sim.planos.map(pl => [`${pl.prazo}× (${anos(pl.prazo)})`, brl(pl.parcela), brl(pl.totalSaldo), brl(pl.totalPago)]));
  texto('Total da compra com a entrada à vista; com a entrada parcelada, some a diferença do desconto.', { size: 7.6, cor: CINZA });

  // 3. Planos de lançamento
  const planos: CondicaoPagamento[] = ['A', 'B', 'C'];
  planos.forEach((cond, k) => {
    const lista = planosDaCondicao(preco, cond, c);
    if (!lista.length) return;
    titulo(`${3 + k}. ${ROTULO_CONDICAO[cond].titulo.toUpperCase()} — ENTRADA DE ${brl(ENTRADA_LANCAMENTO)}`, ROTULO_CONDICAO[cond].resumo);
    if (cond === 'A') tabela([{ t: 'Prazo', w: 130 }, { t: 'Parcela mensal', w: 105, dir: true }, { t: 'Reforço anual', w: 120, dir: true }, { t: 'Total da compra', w: X1 - X0 - 355, dir: true }],
      lista.map(pl => [`${pl.prazo}× (${anos(pl.prazo)})`, brl(pl.parcela), pl.reforco ? `${pl.reforco.qtd}× ${brl(pl.reforco.valor)}` : '—', brl(pl.totalPago)]));
    else if (cond === 'C') tabela([{ t: 'Prazo', w: 110 }, { t: 'Parcela', w: 90, dir: true }, { t: 'Resto da entrada', w: 120, dir: true }, { t: 'Nos primeiros meses', w: 90, dir: true }, { t: 'Total', w: X1 - X0 - 410, dir: true }],
      lista.map(pl => [`${pl.prazo}× (${anos(pl.prazo)})`, brl(pl.parcela), pl.complemento ? `${pl.complemento.qtd}× ${brl(pl.complemento.parcela)}` : '—', brl(pl.mensalInicial), brl(pl.totalPago)]));
    else tabela([{ t: 'Prazo', w: 160 }, { t: 'Parcela mensal', w: 130, dir: true }, { t: 'Total da compra', w: X1 - X0 - 290, dir: true }],
      lista.map(pl => [`${pl.prazo}× (${anos(pl.prazo)})`, brl(pl.parcela), brl(pl.totalPago)]));
  });

  // Corretor e observações
  y -= 4;
  if (dd.corretor?.nome) {
    if (y - ALTURA_CARTAO - 10 < base) nova();
    y -= (await desenharCartaoCorretor(doc, p, X0, y, X1 - X0, dd.corretor, { normal: f, negrito: fb })) + 10;
  }
  texto(`Valores de referência em ${hoje()}, sujeitos a alteração e à disponibilidade das chácaras. Não é proposta: a proposta exclusiva, com a chácara escolhida, as datas e o contrato, é enviada pelo corretor. ${LINHA_PUBLICIDADE} · CNPJ ${ESCRITORIO.cnpj}.`, { size: 7.4, cor: CINZA });

  paginas.forEach((pg, k) => {
    const s = `${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ} · página ${k + 1} de ${paginas.length}`;
    pg.drawText(s, { x: X1 - f.widthOfTextAtSize(s, 7), y: 40, size: 7, font: f, color: CINZA });
  });
  return Buffer.from(await doc.save());
}

