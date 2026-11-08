/**
 * Painel financeiro: lê as mesmas fontes do Fluxo de caixa (cobranças dos contratos e despesas) e aplica as regras de
 * shared/painelFinanceiro.ts. Administrador e secretária (conferido no roteador); o filtro de empreendimento só reduz.
 * - Recebido: parcelas pagas (data do pagamento, valor pago), inclusive de contratos cancelados depois (o caixa histórico
 *   não some). Parcelas estornadas não entram: o sistema não guarda a data do estorno (limitação informada).
 * - A receber: parcelas em aberto (prevista, emitida, vencida) de contratos não cancelados. Não há pagamento parcial
 *   de parcela neste modelo: o saldo de cada parcela é o valor dela.
 * - Pago / a pagar: despesas pagas (data e valor pagos) / em aberto; canceladas fora.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratoPessoas, contratos, empreendimentos, financeiroDespesas, pessoas } from '../../drizzle/schema';
import { ROTULO_CATEGORIA } from '../../shared/despesas';
import { calcularPainel, type Pagamento, type Recebimento, type TituloPagar, type TituloReceber } from '../../shared/painelFinanceiro';
import { FinanceiroErro } from './servico';

const ABERTAS = ['prevista', 'emitida', 'vencida'];
const ENCERRADOS = ['cancelado', 'distratado'];
const ROTULO: Record<string, string> = { entrada: 'Entrada', saldo: 'Parcela', avista: 'À vista', reforco: 'Reforço', complemento: 'Compl. entrada' };
const hojeBrasil = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const dia = (v: unknown) => String(v ?? '').slice(0, 10);

export async function painelFinanceiro(f: { de: string; ate: string; empreendimentoId?: number | null }, agora = Date.now(), semLimite = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.de) || !/^\d{4}-\d{2}-\d{2}$/.test(f.ate) || f.de > f.ate) throw new FinanceiroErro('PERIODO', 'Período inválido', 400);
  const d: any = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  const corte = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
  const emp = f.empreendimentoId ?? null; // null = todos; 0 = só o escritório (despesas sem empreendimento)
  const [emps, cs, despesas]: any[][] = await Promise.all([
    d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos),
    d.select().from(contratos),
    d.select().from(financeiroDespesas),
  ]);
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
  const validas = cobs.filter(x => x.tipo !== 'antecipacao');

  const recebimentos: Recebimento[] = validas.filter(x => x.status === 'paga' && x.pagoEm).map(x => ({
    id: Number(x.id), data: dia(x.pagoEm), valor: Number(x.valorPago ?? x.valor), contratoId: Number(x.contratoId), cliente: cliente(Number(x.contratoId)),
    descricao: desc(x), tipo: String(x.tipo), forma: String(x.formaPagamento ?? 'Boleto'), empreendimentoId: Number(C.get(Number(x.contratoId))?.empreendimentoId ?? 0) || null,
  }));
  const aReceber: TituloReceber[] = validas
    .filter(x => ABERTAS.includes(x.status) && !ENCERRADOS.includes(String(C.get(Number(x.contratoId))?.status)))
    .map(x => ({ id: Number(x.id), contratoId: Number(x.contratoId), cliente: cliente(Number(x.contratoId)), descricao: desc(x), vencimento: dia(x.vencimento), valor: Number(x.valor), status: String(x.status), empreendimentoId: Number(C.get(Number(x.contratoId))?.empreendimentoId ?? 0) || null }));
  const despDoFiltro = despesas.filter(x => x.status !== 'cancelada' && (emp == null || (emp === 0 ? x.empreendimentoId == null : Number(x.empreendimentoId) === emp)));
  const cat = (k: string) => ROTULO_CATEGORIA[k as keyof typeof ROTULO_CATEGORIA] ?? k ?? 'Sem categoria';
  const pagamentos: Pagamento[] = despDoFiltro.filter(x => x.status === 'paga' && x.pagoEm).map(x => ({
    id: Number(x.id), data: dia(x.pagoEm), valor: Number(x.valorPago ?? x.valor), fornecedor: String(x.fornecedor || '—'), descricao: String(x.descricao), categoria: cat(String(x.categoria)), empreendimentoId: x.empreendimentoId ?? null,
  }));
  const aPagar: TituloPagar[] = despDoFiltro.filter(x => x.status === 'aberta').map(x => ({
    id: Number(x.id), fornecedor: String(x.fornecedor || '—'), descricao: String(x.descricao), categoria: cat(String(x.categoria)), vencimento: dia(x.vencimento), valor: Number(x.valor), empreendimentoId: x.empreendimentoId ?? null,
  }));
  const estornadas = validas.filter(x => x.status === 'estornada').length;

  const p = calcularPainel({ de: f.de, ate: f.ate, corte, recebimentos, pagamentos, aReceber, aPagar });
  const limitacoes = [
    'Posição em aberto: sempre a posição atual (o sistema não guarda saldos passados para reconstruir uma posição histórica).',
    'Parcelas são recebidas inteiras: não há pagamento parcial de parcela neste modelo.',
    ...(estornadas ? [`${estornadas} parcela(s) estornada(s) no Asaas não entram no recebido (a data do estorno não é registrada).`] : []),
    ...(emp === 0 ? ['Filtro "Só o escritório": mostra as despesas sem empreendimento; não há recebimentos de parcelas.'] : []),
  ];
  return {
    ...p,
    movimentacoes: semLimite ? p.movimentacoes : p.movimentacoes.slice(0, 500), totalMovimentacoes: p.movimentacoes.length,
    aReceberLista: aReceber.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 300), totalAReceber: aReceber.length,
    aPagarLista: aPagar.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 300), totalAPagar: aPagar.length,
    empreendimentos: emps.map(e => ({ id: Number(e.id), nome: String(e.nome) })),
    filtros: { empreendimentoId: emp }, moeda: 'BRL', atualizadoEm: new Date(agora).toISOString(), limitacoes,
  };
}

/** Planilha das movimentações do período (CSV com ; e proteção contra fórmulas) */
export async function csvMovimentacoes(f: { de: string; ate: string; empreendimentoId?: number | null }) {
  // A planilha leva todas as movimentações do período (não só as 500 da tela)
  const p = await painelFinanceiro(f, Date.now(), true);
  const seguro = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const br = (x: string) => x.split('-').reverse().join('/');
  const linhas = [
    [`Movimentações de caixa de ${br(p.periodo.de)} a ${br(p.periodo.ate)} (regime de caixa) · gerado em ${br(hojeBrasil())}`],
    ['Data', 'Natureza', 'Cliente/fornecedor', 'Descrição', 'Classificação', 'Valor (R$)'],
    ...p.movimentacoes.map(m => [br(m.data), m.natureza === 'entrada' ? 'Recebimento' : 'Pagamento', m.pessoa, m.descricao, m.classificacao, (m.natureza === 'entrada' ? m.valor : -m.valor).toFixed(2).replace('.', ',')]),
  ];
  return { nome: `movimentacoes-${p.periodo.de}-a-${p.periodo.ate}.csv`, conteudo: '﻿' + linhas.map(l => l.map(seguro).join(';')).join('\r\n'), linhas: p.totalMovimentacoes };
}
