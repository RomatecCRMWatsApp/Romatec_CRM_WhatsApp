/**
 * Painel financeiro: lê as mesmas fontes do Fluxo de caixa e das Comissões e aplica as regras de
 * shared/painelFinanceiro.ts. Administrador e secretária (conferido no roteador); os filtros só reduzem.
 * Fontes (regime de caixa, pela data do pagamento):
 * - Recebido: parcelas pagas (inclusive de contrato cancelado depois) e comissões de gestão recebidas das concessões.
 * - Pago: despesas pagas e repasses de comissão pagos aos corretores.
 * - A receber: parcelas em aberto de contratos ativos e comissões de concessão a receber.
 * - A pagar: despesas em aberto e repasses de comissão já liberados (o comprador pagou a parcela), ainda não pagos.
 * Não há pagamento parcial de parcela neste modelo; parcelas estornadas não entram (sem data do estorno).
 * Posição histórica: guardada uma vez por dia em financeiroPosicoes (guardarPosicaoDoDia) para a comparação.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratoPessoas, contratos, empreendimentos, financeiroDespesas, financeiroPosicoes, pessoas } from '../../drizzle/schema';
import { ROTULO_CATEGORIA } from '../../shared/despesas';
import {
  CAT_COMISSAO_CORRETOR, CAT_COMISSAO_GESTAO, ROTULO_TIPO_PARCELA, calcularPainel, filtrar, metaDoPeriodo, periodoAnterior, variacao,
  type Pagamento, type Recebimento, type TituloPagar, type TituloReceber,
} from '../../shared/painelFinanceiro';
import type { PermissoesUsuario } from '../permissoes';
import { FinanceiroErro } from './servico';

const ABERTAS = ['prevista', 'emitida', 'vencida'];
const ENCERRADOS = ['cancelado', 'distratado'];
const ROTULO: Record<string, string> = { entrada: 'Entrada', saldo: 'Parcela', avista: 'À vista', reforco: 'Reforço', complemento: 'Compl. entrada' };
const hojeBrasil = (agora = Date.now()) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
const dia = (v: unknown) => String(v ?? '').slice(0, 10);
const ESCRITORIO_ADMIN: PermissoesUsuario = { perfil: 'admin', modulos: null, acessos: [] };

export interface FiltroPainel { de: string; ate: string; empreendimentoId?: number | null; categoria?: string | null; pessoa?: string | null }
export interface MetasFinanceiras { padrao?: number | null; meses?: Record<string, number> }

export async function lerMetas(): Promise<MetasFinanceiras> {
  const { lerConfig } = await import('../configSistema');
  try { return JSON.parse((await lerConfig('financeiro_metas')) || '{}') || {}; } catch { return {}; }
}
export async function salvarMeta(mes: string | null, valor: number | null, usuarioId: number) {
  const { gravarConfig, limparCacheConfig } = await import('../configSistema');
  const m = await lerMetas();
  const meses = { ...(m.meses ?? {}) };
  if (mes) { if (valor && valor > 0) meses[mes] = Math.round(valor * 100) / 100; else delete meses[mes]; }
  const novo: MetasFinanceiras = { padrao: mes ? m.padrao ?? null : valor && valor > 0 ? Math.round(valor * 100) / 100 : null, meses };
  await gravarConfig('financeiro_metas', JSON.stringify(novo), usuarioId);
  limparCacheConfig();
  return novo;
}

/** Todas as linhas (sem filtro de categoria/cliente) de um escopo de empreendimento */
async function fontes(emp: number | null, perm: PermissoesUsuario, usuarioId: number) {
  const d: any = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  const [emps, cs, despesas]: any[][] = await Promise.all([
    d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos),
    d.select().from(contratos),
    d.select().from(financeiroDespesas),
  ]);
  const idDoNome = (nome: string) => Number(emps.find(e => String(e.nome) === nome)?.id ?? 0) || null;
  // Escopo: null = tudo; 0 = escritório (despesas sem empreendimento e as comissões da gestora); id = o empreendimento
  const noEscopo = (empId: number | null, daGestora = false) => emp == null || (emp === 0 ? (empId == null || daGestora) : empId === emp);
  const contratosDoFiltro = cs.filter(c => emp == null || (emp !== 0 && Number(c.empreendimentoId) === emp));
  const ids = contratosDoFiltro.map(c => Number(c.id));
  const [cobs, comps]: any[][] = ids.length ? await Promise.all([
    d.select().from(cobrancas).where(inArray(cobrancas.contratoId, ids)),
    d.select({ contratoId: contratoPessoas.contratoId, nome: pessoas.nome }).from(contratoPessoas).innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId))
      .where(and(inArray(contratoPessoas.contratoId, ids), eq(contratoPessoas.papel, 'comprador'))),
  ]) : [[], []];
  const C = new Map(contratosDoFiltro.map(c => [Number(c.id), c]));
  const cliente = (id: number) => String(comps.find(x => Number(x.contratoId) === id)?.nome ?? '—');
  const desc = (x: any) => `${C.get(Number(x.contratoId))?.numero ?? ''} · ${ROTULO[x.tipo] ?? x.tipo} ${x.numero}/${x.total} · chácara ${C.get(Number(x.contratoId))?.loteCodigo ?? ''}`;
  const empDe = (contratoId: number) => Number(C.get(contratoId)?.empreendimentoId ?? 0) || null;
  const validas = cobs.filter(x => x.tipo !== 'antecipacao');

  const recebimentos: Recebimento[] = validas.filter(x => x.status === 'paga' && x.pagoEm).map(x => ({
    id: `c${x.id}`, data: dia(x.pagoEm), valor: Number(x.valorPago ?? x.valor), contratoId: Number(x.contratoId), cliente: cliente(Number(x.contratoId)),
    descricao: desc(x), tipo: String(x.tipo), categoria: ROTULO_TIPO_PARCELA[x.tipo] ?? 'Sem categoria', forma: String(x.formaPagamento ?? 'Boleto'), empreendimentoId: empDe(Number(x.contratoId)),
  }));
  const aReceber: TituloReceber[] = validas
    .filter(x => ABERTAS.includes(x.status) && !ENCERRADOS.includes(String(C.get(Number(x.contratoId))?.status)))
    .map(x => ({ id: `c${x.id}`, contratoId: Number(x.contratoId), cliente: cliente(Number(x.contratoId)), descricao: desc(x), categoria: ROTULO_TIPO_PARCELA[x.tipo] ?? 'Sem categoria', vencimento: dia(x.vencimento), valor: Number(x.valor), status: String(x.status), empreendimentoId: empDe(Number(x.contratoId)) }));
  const cat = (k: string) => ROTULO_CATEGORIA[k as keyof typeof ROTULO_CATEGORIA] ?? (k || 'Sem categoria');
  const despDoFiltro = despesas.filter(x => x.status !== 'cancelada' && noEscopo(x.empreendimentoId == null ? null : Number(x.empreendimentoId)));
  const pagamentos: Pagamento[] = despDoFiltro.filter(x => x.status === 'paga' && x.pagoEm).map(x => ({
    id: `d${x.id}`, data: dia(x.pagoEm), valor: Number(x.valorPago ?? x.valor), fornecedor: String(x.fornecedor || '—'), descricao: String(x.descricao), categoria: cat(String(x.categoria)), empreendimentoId: x.empreendimentoId ?? null,
  }));
  const aPagar: TituloPagar[] = despDoFiltro.filter(x => x.status === 'aberta').map(x => ({
    id: `d${x.id}`, fornecedor: String(x.fornecedor || '—'), descricao: String(x.descricao), categoria: cat(String(x.categoria)), vencimento: dia(x.vencimento), valor: Number(x.valor), empreendimentoId: x.empreendimentoId ?? null,
  }));

  // Comissões no mesmo fluxo: repasses aos corretores (saídas) e comissão de gestão das concessões (entradas)
  const cobertura: string[] = [];
  try {
    const { comissoesDeVenda } = await import('./comissoesRepasse');
    const v = await comissoesDeVenda(perm, usuarioId);
    for (const venda of v.vendas) {
      const empId = idDoNome(venda.empreendimento);
      if (!noEscopo(empId, true)) continue;
      for (const parte of venda.partes) {
        const base = { fornecedor: venda.corretor, descricao: `${venda.numero} · ${parte.quando} · chácara ${venda.lote}`, categoria: CAT_COMISSAO_CORRETOR, empreendimentoId: empId, contratoId: venda.contratoId };
        if (parte.situacao === 'paga' && parte.pagoEm) pagamentos.push({ ...base, id: `k${venda.contratoId}-${parte.chave}`, data: parte.pagoEm, valor: parte.valor });
        else if ((parte.situacao === 'a_pagar' || parte.situacao === 'atrasada') && parte.dataRepasse) aPagar.push({ ...base, id: `k${venda.contratoId}-${parte.chave}`, vencimento: parte.dataRepasse, valor: parte.valor });
      }
    }
  } catch (e: any) { cobertura.push(`Repasses de comissão indisponíveis agora (${String(e?.message ?? e).slice(0, 80)}).`); }
  try {
    const { receitasConcessao } = await import('./comissoesConcessao');
    const r = await receitasConcessao(perm);
    for (const i of r.itens) {
      const empId = idDoNome(i.empreendimento);
      if (!noEscopo(empId, true)) continue;
      const base = { cliente: `Proprietária · concessão ${i.lote} (${i.beneficiario})`, descricao: `${i.numero} · comissão de gestão da concessão`, categoria: CAT_COMISSAO_GESTAO, empreendimentoId: empId, contratoId: i.contratoId };
      if (i.situacao === 'recebida' && i.recebidoEm) recebimentos.push({ ...base, id: `g${i.contratoId}`, data: i.recebidoEm, valor: i.valor, tipo: 'comissao_gestao', forma: i.forma ?? 'Pix' });
      else aReceber.push({ ...base, id: `g${i.contratoId}`, vencimento: i.vencimento, valor: i.valor, status: i.situacao });
    }
  } catch (e: any) { cobertura.push(`Comissões das concessões indisponíveis agora (${String(e?.message ?? e).slice(0, 80)}).`); }

  return { d, emps, recebimentos, pagamentos, aReceber, aPagar, estornadas: validas.filter(x => x.status === 'estornada').length, cobertura };
}

const escopoDe = (emp: number | null) => (emp == null ? 'todos' : emp === 0 ? 'escritorio' : `emp:${emp}`);

export async function painelFinanceiro(f: FiltroPainel, perm: PermissoesUsuario, usuarioId: number, agora = Date.now(), semLimite = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.de) || !/^\d{4}-\d{2}-\d{2}$/.test(f.ate) || f.de > f.ate) throw new FinanceiroErro('PERIODO', 'Período inválido', 400);
  const corte = hojeBrasil(agora);
  const emp = f.empreendimentoId ?? null;
  const src = await fontes(emp, perm, usuarioId);
  const recorte = { categoria: f.categoria || null, pessoa: f.pessoa || null };
  const recortado = !!(recorte.categoria || recorte.pessoa);
  const p = calcularPainel({
    de: f.de, ate: f.ate, corte,
    recebimentos: filtrar(src.recebimentos, recorte, x => x.cliente), pagamentos: filtrar(src.pagamentos, recorte, x => x.fornecedor),
    aReceber: filtrar(src.aReceber, recorte, x => x.cliente), aPagar: filtrar(src.aPagar, recorte, x => x.fornecedor),
  });

  // Posição histórica (guardada por dia): só sem filtro de categoria/cliente (as fotos são do escopo inteiro)
  let historico: any = { disponivel: false, motivo: recortado ? 'A comparação histórica da posição vale sem filtro de categoria ou cliente.' : null };
  if (!recortado) {
    const escopo = escopoDe(emp);
    const fotos: any[] = await src.d.select().from(financeiroPosicoes).where(eq(financeiroPosicoes.escopo, escopo)).catch(() => []);
    const ultimaAte = (de: string, ate: string) => fotos.filter(x => x.data >= de && x.data <= ate).sort((a, b) => b.data.localeCompare(a.data))[0] ?? null;
    const desde = fotos.map(x => String(x.data)).sort()[0] ?? null;
    const ant = periodoAnterior(f.de, f.ate);
    const noFim = f.ate < corte ? ultimaAte(f.de, f.ate) : null;
    const anterior = ultimaAte(ant.de, ant.ate);
    const num = (x: any, k: string) => Number(x?.[k] ?? 0);
    const base = noFim ? { data: String(noFim.data), aReceber: num(noFim, 'aReceber'), aPagar: num(noFim, 'aPagar'), vencidos: num(noFim, 'vencidos'), qtdVencidos: Number(noFim.qtdVencidos) } : null;
    const atual = base ?? { data: corte, aReceber: p.posicao.aReceber, aPagar: p.posicao.aPagar, vencidos: p.posicao.vencidos, qtdVencidos: p.posicao.qtdVencidos };
    historico = {
      disponivel: !!anterior || !!base, desde,
      // Período passado com foto guardada: a posição daquele dia (senão, a atual — e a tela avisa)
      noFim: base,
      comparacao: anterior ? {
        data: String(anterior.data),
        aReceber: variacao(atual.aReceber, num(anterior, 'aReceber')), aPagar: variacao(atual.aPagar, num(anterior, 'aPagar')), vencidos: variacao(atual.vencidos, num(anterior, 'vencidos')),
      } : null,
      motivo: !anterior ? (desde ? `Sem posição guardada no período anterior (o histórico começa em ${desde.split('-').reverse().join('/')}).` : 'O histórico da posição em aberto começa a ser guardado hoje, uma vez por dia; a comparação aparece quando houver o período anterior.') : null,
    };
  }

  const metas = await lerMetas();
  const m = metaDoPeriodo(f.de, f.ate, metas);
  const categorias = Array.from(new Set([...src.recebimentos, ...src.aReceber].map(x => x.categoria))).sort();
  const categoriasSaida = Array.from(new Set([...src.pagamentos, ...src.aPagar].map(x => x.categoria))).sort();
  const aRec = filtrar(src.aReceber, recorte, x => x.cliente).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const aPag = filtrar(src.aPagar, recorte, x => x.fornecedor).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const limitacoes = [
    ...(temHistoricoNoFim(historico) ? [] : ['Posição em aberto: a de hoje, salvo quando há posição guardada do período consultado.']),
    'Parcelas são recebidas inteiras: não há pagamento parcial de parcela neste modelo.',
    'Repasses de comissão entram em "a pagar" quando o comprador paga a parcela que os libera; antes disso são previsões (Financeiro › Comissões a pagar).',
    ...(src.estornadas ? [`${src.estornadas} parcela(s) estornada(s) no Asaas não entram no recebido (a data do estorno não é registrada).`] : []),
    ...(emp === 0 ? ['Filtro "Só o escritório": despesas sem empreendimento e as comissões da gestora; sem parcelas dos compradores.'] : []),
    ...src.cobertura,
  ];
  return {
    ...p,
    movimentacoes: semLimite ? p.movimentacoes : p.movimentacoes.slice(0, 500), totalMovimentacoes: p.movimentacoes.length,
    aReceberLista: aRec.slice(0, 300), totalAReceber: aRec.length,
    aPagarLista: aPag.slice(0, 300), totalAPagar: aPag.length,
    empreendimentos: src.emps.map(e => ({ id: Number(e.id), nome: String(e.nome) })),
    categorias: { entradas: categorias, saidas: categoriasSaida },
    meta: m ? { mes: m.mes, valor: m.valor, recebido: p.caixa.recebido, pct: Math.round((p.caixa.recebido / m.valor) * 1000) / 10, origem: metas.meses?.[m.mes] ? 'mes' : 'padrao' } : null,
    metas,
    historico,
    filtros: { empreendimentoId: emp, categoria: recorte.categoria, pessoa: recorte.pessoa }, moeda: 'BRL', atualizadoEm: new Date(agora).toISOString(), limitacoes,
  };
}
const temHistoricoNoFim = (h: any) => !!h?.noFim;

/** Foto da posição em aberto do dia (todos, escritório e cada empreendimento) — idempotente por dia */
export async function guardarPosicaoDoDia(agora = Date.now()): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const hoje = hojeBrasil(agora);
  const emps: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos);
  const escopos: (number | null)[] = [null, 0, ...emps.map(e => Number(e.id))];
  let n = 0;
  for (const emp of escopos) {
    const src = await fontes(emp, ESCRITORIO_ADMIN, 0);
    const p = calcularPainel({ de: hoje, ate: hoje, corte: hoje, recebimentos: [], pagamentos: [], aReceber: src.aReceber, aPagar: src.aPagar });
    const escopo = escopoDe(emp);
    await d.delete(financeiroPosicoes).where(and(eq(financeiroPosicoes.data, hoje), eq(financeiroPosicoes.escopo, escopo)));
    await d.insert(financeiroPosicoes).values({ data: hoje, escopo, aReceber: p.posicao.aReceber.toFixed(2), aPagar: p.posicao.aPagar.toFixed(2), vencidos: p.posicao.vencidos.toFixed(2), qtdVencidos: p.posicao.qtdVencidos } as any);
    n++;
  }
  return n;
}

let timer: NodeJS.Timeout | null = null;
/** Guarda a posição ao subir e a cada 6 h (a do dia é sobrescrita: fica a última do dia) */
export function iniciarFotoDaPosicao() {
  if (timer) return;
  const rodar = () => guardarPosicaoDoDia().then(n => n && console.log(`[Painel financeiro] Posição do dia guardada (${n} escopo(s))`)).catch(e => console.warn('[Painel financeiro] posição do dia:', e?.message));
  setTimeout(rodar, 60_000);
  timer = setInterval(rodar, 6 * 3600_000);
}

/** Planilha das movimentações do período (CSV com ; e proteção contra fórmulas) — todas, não só as da tela */
export async function csvMovimentacoes(f: FiltroPainel, perm: PermissoesUsuario, usuarioId: number) {
  const p = await painelFinanceiro(f, perm, usuarioId, Date.now(), true);
  const seguro = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const br = (x: string) => x.split('-').reverse().join('/');
  const recorte = [f.categoria && `categoria ${f.categoria}`, f.pessoa && `cliente/fornecedor contém "${f.pessoa}"`].filter(Boolean).join(' · ');
  const linhas = [
    [`Movimentações de caixa de ${br(p.periodo.de)} a ${br(p.periodo.ate)} (regime de caixa)${recorte ? ` · ${recorte}` : ''} · gerado em ${br(hojeBrasil())}`],
    ['Data', 'Natureza', 'Cliente/fornecedor', 'Descrição', 'Classificação', 'Valor (R$)'],
    ...p.movimentacoes.map(m => [br(m.data), m.natureza === 'entrada' ? 'Recebimento' : 'Pagamento', m.pessoa, m.descricao, m.classificacao, (m.natureza === 'entrada' ? m.valor : -m.valor).toFixed(2).replace('.', ',')]),
  ];
  return { nome: `movimentacoes-${p.periodo.de}-a-${p.periodo.ate}.csv`, conteudo: '﻿' + linhas.map(l => l.map(seguro).join(';')).join('\r\n'), linhas: p.totalMovimentacoes };
}

