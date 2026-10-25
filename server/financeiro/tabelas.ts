/**
 * Tabelas de financiamento (aba Financeiro): condições + evolutivo de um lote, de uma área ou de um valor, e a
 * tabela geral de todos os lotes. O cálculo é o do simulador (shared/simulador.ts: simular, evolucao, vencimento) —
 * nada é recalculado aqui. Só os empreendimentos que o usuário acessa (shared/permissoes.ts).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getDb } from '../db';
import { condicoesPagamento, empJuridico, empreendimentos, lotes } from '../../drizzle/schema';
import {
  AVISO_LEGAL_SIMULACAO, brl, condicoesDaLinha, precoLote, simular, type CondicoesPagamento, type LinhaEvolucao,
} from '../../shared/simulador';
import { temAcesso, type AcessoCorretor } from '../../shared/permissoes';
import type { Perfil } from '../../shared/equipe';
import { desenharMarca, embutirMarca } from '../contratos/anexos';
import { pastaTemplates } from '../contratos/render';
import type { CartaoVendas } from '../../shared/cartaoVendas';
import { TabelaErro, calcularTabela, type LoteTabela } from '../../shared/tabelaFinanciamento';

export { TabelaErro, calcularTabela, dataPadrao, type LoteTabela, type PedidoTabela } from '../../shared/tabelaFinanciamento';

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export interface Escopo { perfil: Perfil | null; acessos: AcessoCorretor[] }

async function db() {
  const d = await getDb();
  if (!d) throw new TabelaErro('Banco indisponível', 503);
  return d as any;
}

/** Empreendimentos que o usuário acessa e que têm condições de pagamento */
export async function empreendimentosComTabela(p: Escopo) {
  const d = await db();
  const emps: any[] = (await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos))
    .filter((e: any) => temAcesso(p.perfil, p.acessos, 'empreendimento', e.id));
  const conds: any[] = await d.select({ empreendimentoId: condicoesPagamento.empreendimentoId, ativo: condicoesPagamento.ativo }).from(condicoesPagamento);
  return emps.filter(e => conds.some(c => c.empreendimentoId === e.id && (c.ativo === true || Number(c.ativo) === 1)))
    .map(e => ({ slug: e.slug as string, nome: e.nome as string }));
}

/** Empreendimento (com escopo), condições vigentes e os lotes comercializáveis */
export async function baseDoEmpreendimento(slug: string, p: Escopo) {
  const d = await db();
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp || !temAcesso(p.perfil, p.acessos, 'empreendimento', emp.id)) throw new TabelaErro('Empreendimento não encontrado', 404);
  const [cond]: any[] = await d.select().from(condicoesPagamento)
    .where(and(eq(condicoesPagamento.empreendimentoId, emp.id), eq(condicoesPagamento.ativo, true)))
    .orderBy(desc(condicoesPagamento.vigenteDesde), desc(condicoesPagamento.id)).limit(1);
  if (!cond) throw new TabelaErro('Condições de pagamento não cadastradas para este empreendimento', 412);
  const c = condicoesDaLinha(cond) as CondicoesPagamento;
  const ls: any[] = await d.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const lista: LoteTabela[] = ls
    .filter(l => (l.comercializavel === true || Number(l.comercializavel) === 1) && num(l.areaM2))
    .map(l => {
      const areaM2 = Number(l.areaM2), precoTabela = num(l.precoTabela);
      return { codigo: l.codigo, quadra: l.quadra ?? null, areaM2, precoTabela, preco: precoTabela && precoTabela > 0 ? precoTabela : precoLote(areaM2, c), situacao: l.situacao || 'disponivel' };
    })
    .sort((a, b) => String(a.quadra).localeCompare(String(b.quadra)) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const [j]: any[] = await d.select({ marcaSlug: empJuridico.marcaSlug }).from(empJuridico).where(eq(empJuridico.empreendimentoId, emp.id)).limit(1);
  return { emp: { id: emp.id as number, slug: emp.slug as string, nome: emp.nome as string, municipio: emp.municipio as string | null, uf: emp.uf as string | null }, c, lotes: lista, marca: (j?.marcaSlug as string | undefined) ?? null };
}

// ─── PDFs ──────────────────────────────────────────────────────────────────────────────────

const VERDE = rgb(0.047, 0.2, 0.125), OURO = rgb(0.788, 0.651, 0.275), CREME = rgb(0.96, 0.94, 0.88), CINZA = rgb(0.36, 0.36, 0.36);
const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number, d = 2) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

/** Página com a marca do empreendimento (templates/marca/<slug>); sem marca, cabeçalho simples com o nome */
async function documento(titulo: string, marcaSlug: string | null, nomeEmp: string, paisagem = false) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const temMarca = !!marcaSlug && existsSync(path.join(pastaTemplates(), 'marca', marcaSlug, 'cabecalho.png'));
  const m = temMarca ? await embutirMarca(doc, marcaSlug!) : null;
  const tam: [number, number] = paisagem ? [841.89, 595.28] : [595.28, 841.89];
  const paginas: PDFPage[] = [];
  const pagina = () => {
    const p = doc.addPage(tam);
    paginas.push(p);
    if (m) return { p, ...desenharMarca(p, m) };
    const [w, h] = tam;
    p.drawText(nomeEmp.toUpperCase(), { x: 40, y: h - 52, size: 15, font: fb, color: VERDE });
    p.drawLine({ start: { x: 40, y: h - 62 }, end: { x: w - 40, y: h - 62 }, thickness: 1.5, color: OURO });
    p.drawText('Romatec Consultoria Total · CNPJ 17.261.987/0001-09 · Açailândia/MA', { x: 40, y: 22, size: 7.5, font: f, color: CINZA });
    return { p, topo: h - 76, base: 40 };
  };
  const numerar = (rotulo: string) => paginas.forEach((p, i) => {
    const t = `${rotulo} · página ${i + 1} de ${paginas.length}`;
    const { width } = p.getSize();
    p.drawText(t, { x: width - 40 - f.widthOfTextAtSize(t, 7), y: m ? 8 : 10, size: 7, font: f, color: CINZA });
  });
  return { doc, f, fb, pagina, numerar, largura: tam[0] };
}

function quebrar(font: PDFFont, s: string, size: number, largura: number): string[] {
  const out: string[] = []; let atual = '';
  for (const p of s.split(/\s+/)) { const t = atual ? `${atual} ${p}` : p; if (font.widthOfTextAtSize(t, size) > largura && atual) { out.push(atual); atual = p; } else atual = t; }
  if (atual) out.push(atual);
  return out;
}

/** Tabela simples com cabeçalho repetido a cada página */
function tabela(ctx: { pagina: () => { p: PDFPage; topo: number; base: number }; f: PDFFont; fb: PDFFont }, estado: { p: PDFPage; y: number; base: number },
  x0: number, cols: { t: string; w: number; dir?: boolean }[], linhas: { v: string[]; destaque?: boolean; tom?: boolean }[], size = 7.6) {
  const largura = cols.reduce((a, c) => a + c.w, 0), alt = size + 5.2;
  const cab = () => {
    estado.p.drawRectangle({ x: x0, y: estado.y - alt, width: largura, height: alt, color: VERDE });
    let x = x0;
    for (const c of cols) {
      const w = ctx.fb.widthOfTextAtSize(c.t, size);
      estado.p.drawText(c.t, { x: c.dir ? x + c.w - 4 - w : x + 4, y: estado.y - alt + 3.6, size, font: ctx.fb, color: rgb(1, 1, 1) });
      x += c.w;
    }
    estado.y -= alt;
  };
  cab();
  linhas.forEach((l, i) => {
    if (estado.y - alt < estado.base) { const n = ctx.pagina(); estado.p = n.p; estado.y = n.topo; estado.base = n.base; cab(); }
    if (l.destaque) estado.p.drawRectangle({ x: x0, y: estado.y - alt, width: largura, height: alt, color: rgb(0.99, 0.95, 0.82) });
    else if (i % 2 === 1 || l.tom) estado.p.drawRectangle({ x: x0, y: estado.y - alt, width: largura, height: alt, color: CREME });
    let x = x0;
    l.v.forEach((s, k) => {
      const c = cols[k], fonte = k === 0 || l.destaque ? ctx.fb : ctx.f, w = fonte.widthOfTextAtSize(s, size);
      estado.p.drawText(s, { x: c.dir ? x + c.w - 4 - w : x + 4, y: estado.y - alt + 3.6, size, font: fonte, color: rgb(0.1, 0.1, 0.1) });
      x += c.w;
    });
    estado.y -= alt;
  });
}

const assinatura = (c: CartaoVendas | null) => (c ? [`${c.papel} ${c.nome}`, c.creci, c.telefones[0], c.email].filter(Boolean).join(' · ') : '');

/** PDF: condições + evolutivo de um lote/área/valor */
export async function pdfTabelaFinanciamento(base: Awaited<ReturnType<typeof baseDoEmpreendimento>>, t: ReturnType<typeof calcularTabela>, cartao: CartaoVendas | null): Promise<Buffer> {
  const { emp, c } = base, s = t.simulacao;
  const nome = t.origem.tipo === 'lote' ? `Chácara ${t.origem.codigo}${t.origem.quadra ? ` · Quadra ${t.origem.quadra}` : ''}` : t.origem.tipo === 'area' ? `Área de ${m2(t.origem.areaM2)} m²` : `Valor de ${brl(t.origem.preco)}`;
  const D = await documento(`Tabela de financiamento — ${emp.nome} — ${nome}`, base.marca, emp.nome);
  const X0 = 50, L = D.largura - 100;
  let { p, topo: y, base: b } = D.pagina();
  y -= 10;
  const texto = (s2: string, o: { size?: number; bold?: boolean; cor?: ReturnType<typeof rgb>; x?: number } = {}) => { p.drawText(s2, { x: o.x ?? X0, y, size: o.size ?? 9, font: o.bold ? D.fb : D.f, color: o.cor ?? rgb(0.1, 0.1, 0.1) }); };
  texto('TABELA DE FINANCIAMENTO', { size: 13, bold: true, cor: VERDE }); y -= 15;
  texto(`${emp.nome} · ${nome}${t.origem.tipo === 'lote' ? ` · ${m2(t.origem.areaM2)} m²` : ''}`, { size: 9.5, cor: CINZA }); y -= 18;

  // Quadro de condições
  const quadro: [string, string][] = [
    ['Preço de tabela', brl(s.preco)],
    ['À vista total', `${brl(s.avistaTotal.valor)} (desconto de ${brl(s.avistaTotal.desconto)})`],
    [`Entrada ${pct(c.entradaPct, 0)} à vista`, `${brl(s.entradaAvista)} (desconto de ${brl(s.descontoAvista)})`],
    [`Entrada parcelada (2 a ${c.entradaMaxParcelas}×)`, t.opcoesEntrada.filter(o => o.parcelas > 1).map(o => `${o.parcelas}× ${brl(o.valorParcela)}`).join(' · ')],
    [`Saldo (${pct(1 - c.entradaPct, 0)})`, brl(s.saldo)],
    ['Juros', `${pct(c.jurosAaEfetivo)} ao ano efetivos (${pct(s.taxaMensal, 4)} ao mês) · Tabela Price · parcelas fixas`],
    ['Plano desta tabela', `Entrada ${t.entrada === 1 ? 'à vista' : `em ${t.entrada}×`} + saldo em ${t.prazo}× de ${brl(t.resumo.parcela)} · 1º pagamento em ${br(t.dataPrimeiro)}`],
    ['Total a pagar', `${brl(t.resumo.totalPago)} (juros de ${brl(t.resumo.juros)})`],
  ];
  const valores = quadro.map(([, v]) => quebrar(D.f, v, 8.4, L - 178));
  const altQ = valores.reduce((a, v) => a + v.length * 11 + 2, 0) + 10;
  p.drawRectangle({ x: X0, y: y - altQ + 8, width: L, height: altQ, borderColor: OURO, borderWidth: 0.8, color: rgb(1, 1, 1), opacity: 0.85 });
  quadro.forEach(([k], i) => {
    texto(k, { bold: true, x: X0 + 8, size: 8.4, cor: VERDE });
    valores[i].forEach((v, j) => { if (j) y -= 11; texto(v, { x: X0 + 170, size: 8.4 }); });
    y -= 13;
  });
  y -= 14;

  // Prazos do saldo
  texto('SALDO — PARCELAS POR PRAZO', { bold: true, size: 9, cor: VERDE }); y -= 6;
  const est = { p, y, base: b };
  const wP = L / 5;
  tabela({ pagina: D.pagina, f: D.f, fb: D.fb }, est, X0, [{ t: 'Prazo', w: wP }, { t: 'Parcela', w: wP, dir: true }, { t: 'Total do saldo', w: wP, dir: true }, { t: 'Juros', w: wP, dir: true }, { t: 'Total a pagar', w: wP, dir: true }],
    s.planos.map(pl => ({ v: [`${pl.prazo}×`, brl(pl.parcela), brl(pl.totalSaldo), brl(pl.juros), brl(pl.totalPago)], destaque: pl.prazo === t.prazo })), 8);
  ({ p, y, base: b } = est); y -= 16;
  if (y < b + 60) { ({ p, topo: y, base: b } = D.pagina()); }

  // Evolutivo
  texto(`EVOLUTIVO — ENTRADA ${t.entrada === 1 ? 'À VISTA' : `EM ${t.entrada}×`} + SALDO EM ${t.prazo}× (TABELA PRICE)`, { bold: true, size: 9, cor: VERDE }); y -= 6;
  const est2 = { p, y, base: b };
  const w = [42, 60, 74, 84, 78, 84, L - 422];
  tabela({ pagina: D.pagina, f: D.f, fb: D.fb }, est2, X0, [
    { t: 'Nº', w: w[0] }, { t: 'Tipo', w: w[1] }, { t: 'Vencimento', w: w[2] }, { t: 'Parcela', w: w[3], dir: true },
    { t: 'Juros', w: w[4], dir: true }, { t: 'Amortização', w: w[5], dir: true }, { t: 'Saldo devedor', w: w[6], dir: true },
  ], t.linhas.map((l: LinhaEvolucao & { vencimento: string }) => ({
    v: [String(l.numero), l.tipo === 'entrada' ? 'Entrada' : 'Saldo', br(l.vencimento), brl(l.parcela), brl(l.juros), brl(l.amortizacao), brl(l.saldoDevedor)],
    tom: l.tipo === 'entrada',
  })));
  ({ p, y, base: b } = est2); y -= 14;

  // Aviso legal e quem gerou
  const avisos = [...quebrar(D.f, AVISO_LEGAL_SIMULACAO, 7.2, L), ...(cartao ? [`Gerado por ${assinatura(cartao)} · Romatec Consultoria Total`] : [])];
  if (y - avisos.length * 9.5 < b) ({ p, topo: y, base: b } = D.pagina());
  for (const a of avisos) { texto(a, { size: 7.2, cor: CINZA }); y -= 9.5; }
  D.numerar(`Tabela de financiamento · ${nome}`);
  return Buffer.from(await D.doc.save({ useObjectStreams: false }));
}

/** PDF: tabela geral com todos os lotes comercializáveis (paisagem) */
export async function pdfTabelaGeral(base: Awaited<ReturnType<typeof baseDoEmpreendimento>>, cartao: CartaoVendas | null): Promise<Buffer> {
  const { emp, c, lotes: ls } = base;
  const D = await documento(`Tabela geral de financiamento — ${emp.nome}`, base.marca, emp.nome, true);
  const X0 = 36, L = D.largura - 72;
  let { p, topo: y, base: b } = D.pagina();
  y -= 10;
  p.drawText('TABELA GERAL DE FINANCIAMENTO', { x: X0, y, size: 12.5, font: D.fb, color: VERDE }); y -= 14;
  p.drawText(`${emp.nome} · ${ls.length} unidades · juros de ${pct(c.jurosAaEfetivo)} a.a. efetivos (${pct(Math.pow(1 + c.jurosAaEfetivo, 1 / 12) - 1, 4)} a.m.) · Tabela Price, parcelas fixas · entrada ${pct(c.entradaPct, 0)}`,
    { x: X0, y, size: 8.2, font: D.f, color: CINZA }); y -= 12;
  const fixas = [{ t: 'Chácara', w: 52 }, { t: 'Área (m²)', w: 58, dir: true }, { t: 'Preço', w: 72, dir: true }, { t: 'À vista total', w: 72, dir: true },
    { t: 'Entrada à vista', w: 72, dir: true }, { t: 'Saldo', w: 72, dir: true }];
  const usado = fixas.reduce((a, x) => a + x.w, 0);
  const colsPrazo = c.prazos.map(pz => ({ t: `${pz}×`, w: (L - usado) / c.prazos.length, dir: true }));
  const est = { p, y, base: b };
  tabela({ pagina: D.pagina, f: D.f, fb: D.fb }, est, X0, [...fixas, ...colsPrazo], ls.map(l => {
    const s = simular(l.areaM2, 1, c, l.precoTabela);
    return { v: [`${l.codigo}${l.situacao !== 'disponivel' ? '*' : ''}`, m2(l.areaM2), brl(s.preco), brl(s.avistaTotal.valor), brl(s.entradaAvista), brl(s.saldo), ...s.planos.map(pl => brl(pl.parcela))] };
  }), 7.2);
  ({ p, y, base: b } = est); y -= 12;
  const notas = [
    `À vista total: preço com desconto de ${brl(c.descontoAvistaTotal ?? 0)}. Entrada à vista com ${pct(c.descontoAvistaPct)} de desconto; parcelada em 2 a ${c.entradaMaxParcelas}× sem juros e sem desconto. Saldo: ${pct(1 - c.entradaPct, 0)} do preço.`,
    '* Unidade não disponível no momento (reservada, em negociação ou vendida).',
    ...quebrar(D.f, AVISO_LEGAL_SIMULACAO, 7, L),
    ...(cartao ? [`Gerado por ${assinatura(cartao)} · Romatec Consultoria Total`] : []),
  ];
  for (const n of notas) { if (y < b + 10) ({ p, topo: y, base: b } = D.pagina()); p.drawText(n, { x: X0, y, size: 7, font: D.f, color: CINZA }); y -= 9.5; }
  D.numerar(`Tabela geral · ${emp.nome}`);
  return Buffer.from(await D.doc.save({ useObjectStreams: false }));
}
