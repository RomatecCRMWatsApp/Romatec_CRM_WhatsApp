/**
 * Demonstrativo de pagamento de comissão ao corretor (PDF): o pagamento feito, a venda (contrato, chácara, vendedora,
 * comprador e as condições que ficaram para o comprador), a comissão inteira parte a parte com a data prevista de
 * cada repasse (até 5 dias úteis da compensação do pagamento do comprador) e o comprovante anexo.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, comissaoRepasses, contratos, empreendimentos, users } from '../../drizzle/schema';
import { ESCRITORIO } from '../../shared/escritorio';
import { PRAZO_REPASSE_DIAS_UTEIS } from '../../shared/tabelaComissao';
import { partesDaComissao, type ParteComissao, type PlanoParaRepasse } from '../../shared/repasseComissao';
import { anexarAoPdf, type FonteAnexo } from './anexoPdf';

const SITUACAO_CURTA: Record<ParteComissao['situacao'], string> = {
  paga: 'Paga', a_pagar: 'A pagar', atrasada: 'Repasse atrasado', aguardando_cliente: 'Aguarda o cliente', cliente_atrasado: 'Cliente atrasado', cancelada: 'Não devida',
};
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };
/** Data do banco (Date, segundos do SQLite ou texto) em AAAA-MM-DD; inválida = null */
function dataIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : typeof v === 'number' ? new Date(v < 1e11 ? v * 1000 : v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
const pct = (x: number) => `${(Math.round(x * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export interface DadosDemonstrativo {
  contrato: { id: number; numero: string; status: string; data: string | null };
  empreendimento: string; marca: string; lote: string;
  vendedora: string; comprador: string;
  corretor: { id: number; nome: string; creci: string | null; telefone: string };
  valorVenda: number; forma: string; condicoes: string[];
  comissaoTotal: number; partes: ParteComissao[];
}

/** Condições do comprador em frases curtas, a partir do plano do contrato */
export function condicoesDoComprador(p: any): string[] {
  const n = (x: unknown) => Number(x ?? 0);
  if (p.modalidade === 'avista') return [`Pagamento à vista: R$ ${brl(n(p.total_pagar || p.preco_avista))}${p.avista_vencimento ? `, com vencimento em ${br(p.avista_vencimento)}` : ''}.`];
  const out: string[] = [];
  if (n(p.entrada_valor) > 0) {
    out.push(n(p.entrada_qtd) > 1
      ? `Entrada de R$ ${brl(n(p.entrada_valor))} em ${n(p.entrada_qtd)} parcelas de R$ ${brl(n(p.entrada_parcela))}${p.entrada_venc1 ? `, a 1ª em ${br(p.entrada_venc1)}` : ''}.`
      : `Entrada de R$ ${brl(n(p.entrada_valor))} à vista${p.entrada_venc1 ? `, com vencimento em ${br(p.entrada_venc1)}` : ''}.`);
  }
  if (n(p.complemento_valor) > 0) out.push(`Complemento da entrada de R$ ${brl(n(p.complemento_valor))} em ${n(p.complemento_qtd) || 1} parcela(s) de R$ ${brl(n(p.complemento_parcela) || n(p.complemento_valor))}, sem juros.`);
  if (n(p.saldo_qtd) > 0) out.push(`Saldo de R$ ${brl(n(p.saldo_valor))} em ${n(p.saldo_qtd)} parcelas fixas de R$ ${brl(n(p.saldo_parcela))}${p.saldo_venc1 ? `, a 1ª em ${br(p.saldo_venc1)}` : ''}.`);
  if (n(p.reforco_qtd) > 0) out.push(`${n(p.reforco_qtd)} reforço(s) anual(is) de R$ ${brl(n(p.reforco_valor))}${p.reforco_venc1 ? `, o 1º em ${br(p.reforco_venc1)}` : ''}.`);
  if (n(p.total_pagar) > 0) out.push(`Total a pagar pelo comprador: R$ ${brl(n(p.total_pagar))}.`);
  return out;
}

const ROTULO_FORMA: Record<string, string> = { padrao: 'Entrada de 30%', A: 'Plano A', B: 'Plano B', C: 'Plano C' };
function formaDoPlano(p: PlanoParaRepasse): string {
  if (p.modalidade === 'avista') return 'À vista';
  const c = p.condicao && p.condicao !== 'padrao' ? p.condicao : 'padrao';
  if (c === 'padrao') return (p.entrada_qtd ?? 1) <= 1 ? 'Entrada de 30% à vista' : `Entrada de 30% em ${p.entrada_qtd}×`;
  return ROTULO_FORMA[c] ?? c;
}

export async function dadosDemonstrativo(contratoId: number, hoje: string): Promise<DadosDemonstrativo | null> {
  const d: any = await getDb();
  if (!d) return null;
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) return null;
  const plano = json(c.simulacaoJson);
  const dados = json(c.dadosJson);
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, Number(c.empreendimentoId))).limit(1);
  const [u]: any[] = await d.select({ name: users.name, creci: users.creci, telefone: users.telefone }).from(users).where(eq(users.id, Number(c.corretorUserId))).limit(1);
  const cobs: any[] = await d.select({ tipo: cobrancas.tipo, numero: cobrancas.numero, vencimento: cobrancas.vencimento, status: cobrancas.status, pagoEm: cobrancas.pagoEm })
    .from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), inArray(cobrancas.tipo, ['avista', 'entrada', 'saldo'])));
  const reps: any[] = await d.select().from(comissaoRepasses).where(eq(comissaoRepasses.contratoId, contratoId));
  const partes = partesDaComissao({
    plano, statusContrato: String(c.status), hoje, entradaPagaNoAto: !!c.entradaPagaNoAto,
    cobrancas: cobs.map(x => ({ tipo: x.tipo, numero: Number(x.numero), vencimento: String(x.vencimento), status: x.status, pagoEm: x.pagoEm ? String(x.pagoEm) : null })),
    repasses: reps.filter(x => !String(x.chave).startsWith('g:')).map(x => ({ chave: x.chave, valor: Number(x.valor), pagoEm: String(x.pagoEm), forma: x.forma, comprovanteUrl: x.comprovanteUrl ?? null })),
  });
  const vendedora = (dados.vend_pj ? dados.vend_razao_social : dados.vend_nome) || '—';
  return {
    contrato: { id: Number(c.id), numero: String(c.numero), status: String(c.status), data: dataIso(c.criadoEm) },
    empreendimento: String(emp?.nome ?? ''), marca: String(emp?.slug ?? 'bom-jardims').replace(/-/g, ''), lote: String(c.loteCodigo),
    vendedora: String(vendedora), comprador: String(dados.comp_nome ?? '—'),
    corretor: { id: Number(c.corretorUserId), nome: String(u?.name ?? '—'), creci: u?.creci ? String(u.creci) : null, telefone: String(u?.telefone ?? '') },
    valorVenda: r2(Number(plano.modalidade === 'avista' ? plano.preco_avista ?? plano.total_pagar ?? 0 : plano.preco_tabela ?? 0)),
    forma: formaDoPlano(plano), condicoes: condicoesDoComprador(plano),
    comissaoTotal: r2(Number(plano.comissao_corretor ?? 0)), partes,
  };
}

/** Base da comissão de uma parte, para a ciência da proprietária: venda, comissão, divisão e condições do comprador */
export interface BaseComissao { linhas: string[]; tabela: [string, string][]; condicoes: string[] }

export async function baseComissaoDaParte(contratoId: number, chave: string, hoje: string): Promise<BaseComissao | null> {
  const d: any = await getDb();
  if (!d) return null;
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) return null;
  const plano = json(c.simulacaoJson);
  const dados = json(c.dadosJson);
  const venda = r2(Number(plano.modalidade === 'avista' ? plano.preco_avista ?? plano.total_pagar ?? 0 : plano.preco_tabela ?? 0));
  const total = r2(Number(plano.comissao_total ?? 0));
  const escritorio = r2(Number(plano.comissao_romatec ?? total - Number(plano.comissao_corretor ?? 0)));
  const corretorTotal = r2(Number(plano.comissao_corretor ?? 0));
  const [u]: any[] = await d.select({ name: users.name }).from(users).where(eq(users.id, Number(c.corretorUserId))).limit(1);
  const corretor = String(u?.name ?? 'corretor(a)');
  const { comissoesDeGestao } = await import('./saldoProprietaria');
  const parte = (await comissoesDeGestao(Number(c.empreendimentoId), hoje)).find(x => x.contratoId === contratoId && x.chave === chave.replace(/^g:/, ''));
  const perc = venda > 0 && total > 0 ? pct(total / venda) : null;
  const linhas = [
    `Venda: chácara ${c.loteCodigo} · contrato ${c.numero} · comprador(a) ${dados.comp_nome ?? '—'} · valor de venda R$ ${brl(venda)} (${formaDoPlano(plano)})`,
    `Comissão${perc ? ` de ${perc}` : ''} calculada sobre o valor de venda: R$ ${brl(total)} (escritório R$ ${brl(escritorio)} · corretor(a) ${corretor} R$ ${brl(corretorTotal)})`,
    ...(parte ? [`Esta parte (${parte.quando}): R$ ${brl(parte.valor)} = escritório R$ ${brl(parte.valorEscritorio)} + corretor(a) R$ ${brl(parte.valorCorretor)}`] : []),
  ];
  const tabela: [string, string][] = [
    ['Venda', `Chácara ${c.loteCodigo} · contrato ${c.numero} · comprador(a) ${dados.comp_nome ?? '—'}`],
    ['Valor de venda (base da comissão)', `R$ ${brl(venda)} · ${formaDoPlano(plano)}`],
    ['Comissão total', `R$ ${brl(total)}${perc ? ` (${perc} do valor de venda)` : ''}`],
    ['Escritório (gestora) no total', `R$ ${brl(escritorio)}`],
    ['Corretor(a) no total', `R$ ${brl(corretorTotal)} · ${corretor}`],
    ...(parte ? [
      ['Parte paga agora', `${parte.quando}: R$ ${brl(parte.valor)}`],
      ['  ao escritório', `R$ ${brl(parte.valorEscritorio)}`],
      ['  ao corretor(a)', `R$ ${brl(parte.valorCorretor)}`],
    ] as [string, string][] : []),
  ];
  return { linhas, tabela, condicoes: condicoesDoComprador(plano) };
}

/** O PDF. `chave` = a parte que acabou de ser paga (destaque no topo); `comprovante` vai no fim */
export async function pdfDemonstrativo(x: DadosDemonstrativo, chave: string, comprovante: FonteAnexo | null): Promise<Buffer> {
  const { escritor } = await import('../contratos/docsComissao');
  const parte = x.partes.find(p => p.chave === chave);
  if (!parte) throw new Error('Parte da comissão não encontrada no contrato');
  const titulo = `Demonstrativo de comissão — ${x.contrato.numero} · ${parte.quando}`;
  const w0 = await escritor(titulo, x.marca, `${titulo} · ${x.empreendimento}`);
  const w = { ...w0, paragrafo: (t: Parameters<typeof w0.paragrafo>[0], o: Parameters<typeof w0.paragrafo>[1] = {}) => w0.paragrafo(t, { size: 9.2, ...o }) };
  const pagas = x.partes.filter(p => p.situacao === 'paga');
  const recebido = r2(pagas.reduce((t, p) => t + p.valor, 0));
  const aReceber = r2(x.partes.filter(p => p.situacao !== 'paga' && p.situacao !== 'cancelada').reduce((t, p) => t + p.valor, 0));

  w.cabecalho('DEMONSTRATIVO DE PAGAMENTO DE COMISSÃO', `${x.empreendimento} · chácara ${x.lote} · contrato ${x.contrato.numero}`);
  w.paragrafo([{ t: `A ${ESCRITORIO.fantasia} (${ESCRITORIO.creciJ}) informa a ` },
    { t: x.corretor.nome, b: true }, { t: `${x.corretor.creci ? ` (CRECI ${x.corretor.creci})` : ''} o pagamento da comissão da venda que intermediou.` }]);

  w.clausula('1. DO PAGAMENTO');
  w.tabela(['Campo', 'Informação'], [
    ['Valor pago', `R$ ${brl(parte.valor)} · em ${br(parte.pagoEm)}${parte.forma ? ` por ${parte.forma}` : ''}${parte.comprovanteUrl || comprovante ? ' (comprovante anexo ao final)' : ''}`],
    ['Referente a', `${parte.quando} — ${pct(parte.pct)} da sua comissão nesta venda`],
  ], { pesos: [1, 3], size: 8.8 });

  w.clausula('2. DA VENDA');
  w.tabela(['Campo', 'Informação'], [
    ['Contrato', `${x.contrato.numero}${x.contrato.data ? ` · de ${br(x.contrato.data)}` : ''}`],
    ['Unidade', `Chácara ${x.lote} · ${x.empreendimento}`],
    ['Vendedora (proprietária)', x.vendedora],
    ['Comprador(a)', x.comprador],
    ['Valor da venda', `R$ ${brl(x.valorVenda)} · ${x.forma}`],
  ], { pesos: [1, 3], size: 8.8 });
  if (x.condicoes.length) {
    w.paragrafo([{ t: 'Condições assumidas pelo(a) comprador(a):', b: true }], { antes: 4 });
    for (const l of x.condicoes) w.paragrafo(`• ${l}`, { antes: 0, depois: 1 });
  }

  w.clausula('3. DA SUA COMISSÃO, PARTE A PARTE');
  w.paragrafo(`Comissão total do(a) corretor(a) nesta venda: R$ ${brl(x.comissaoTotal)}. Recebido até aqui: R$ ${brl(recebido)}. A receber: R$ ${brl(aReceber)}.`);
  w.tabela(['Parte', '%', 'Valor', 'Pagamento do comprador', 'Repasse', 'Situação'], x.partes.map(p => [
    p.quando, pct(p.pct), `R$ ${brl(p.valor)}`,
    p.clientePagouEm ? `pago em ${br(p.clientePagouEm)}` : `vence em ${br(p.vencimentoCliente)}`,
    p.pagoEm ? `pago em ${br(p.pagoEm)}` : `previsto ${br(p.dataRepasse)}`,
    SITUACAO_CURTA[p.situacao],
  ]), { pesos: [2.2, 0.7, 1.2, 1.8, 1.7, 1.6], size: 7.8 });

  w.clausula('4. DO PRAZO DE REPASSE');
  w.paragrafo(`Cada parte é repassada em até ${PRAZO_REPASSE_DIAS_UTEIS} (cinco) dias úteis da compensação do pagamento do comprador que a gera; as datas "previsto" mudam se ele pagar antes ou depois. Em distrato ou cancelamento, as partes não pagas deixam de ser devidas.`);
  w.assinaturas([{ papel: `GESTORA — ${ESCRITORIO.fantasia}`, nome: ESCRITORIO.responsavel, doc: `${ESCRITORIO.creciResponsavel} · ${ESCRITORIO.creciJ}` }],
    { local: `Açailândia/MA, ${br(parte.pagoEm ?? new Date(Date.now() - 3 * 3600_000).toISOString())}.` });
  const fonte = comprovante ?? (parte.comprovanteUrl ? { url: parte.comprovanteUrl } : null);
  return anexarAoPdf(await w.salvar(), fonte);
}

export const nomeDemonstrativo = (x: DadosDemonstrativo, chave: string) => `Comissao-${x.contrato.numero}-${chave}.pdf`.replace(/[^\w.-]+/g, '-');
