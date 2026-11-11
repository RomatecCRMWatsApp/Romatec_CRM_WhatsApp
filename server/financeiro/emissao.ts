/**
 * Cobranças do contrato: o plano vira linhas em `cobrancas` (status prevista, com juros/amortização/saldo após) e,
 * só com o contrato ATIVO e o Asaas configurado, cada uma é emitida no Asaas (boleto + PIX) com o split da comissão.
 * A régua de cobrança e a negativação NÃO estão aqui: são sempre ação manual do Administrador.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos } from '../../drizzle/schema';
import type { PlanoContrato } from '../contratos/plano';
import { buscarOuCriarCliente, criarCobranca, dadosDePagamento, exigirConfigAsaas, payloadCliente, payloadCobranca, type FetchFn } from './asaas';
import { auditar, contextoDocs, FinanceiroErro, hojeBrasil, pessoasDoContrato, slugDoContrato } from './servico';
import { blocoDoCarne, parcelaDoPlano, rotuloParcela } from './dados';
import { rotuloComComplemento } from '../contratos/plano';
import { divisaoComissaoLancamento } from '../../shared/condicoesLancamento';
import { r2 } from '../../shared/simulador';

/**
 * Split da comissão (Romatec): 50% no 1º e 50% no 2º pagamento da entrada; entrada à vista ou à vista total = 100% no 1º.
 * Condições de lançamento (Planos A, B, C): 50% na entrada do ato e o resto em 4 partes nas parcelas 1 a 4 do saldo
 * (no Plano C sequencial, nas parcelas 1 a 4 do complemento da entrada, que são as primeiras depois do ato).
 */
export function splitDaComissao(plano: PlanoContrato): Map<string, number> {
  const m = new Map<string, number>();
  const total = plano.comissao_total;
  if (!total) return m;
  if (plano.modalidade === 'financiado' && plano.condicao && plano.condicao !== 'padrao') {
    const d = divisaoComissaoLancamento(total, plano.comissao_corretor ?? 0);
    m.set('entrada:1', d.ato.total);
    const tipo = plano.complemento_modo === 'sequencial' && plano.complemento_qtd ? 'complemento' : 'saldo';
    d.parcelas.forEach((f, k) => m.set(`${tipo}:${k + 1}`, f.total));
    return m;
  }
  const unico = plano.modalidade === 'avista' || plano.entrada_qtd <= 1;
  const primeira = plano.parcelas[0];
  if (unico) { m.set(`${primeira.tipo}:${primeira.numero}`, r2(Math.min(total, primeira.valor))); return m; }
  const metade = r2(total / 2);
  m.set('entrada:1', metade);
  m.set('entrada:2', r2(total - metade));
  return m;
}

/** Grava as cobranças previstas do plano (idempotente: índice único contrato+tipo+número) */
export async function gerarCobrancasDoPlano(contratoId: number, plano: PlanoContrato): Promise<number> {
  const db = (await getDb()) as any;
  const split = splitDaComissao(plano);
  let novas = 0;
  for (const p of plano.parcelas) {
    try {
      await db.insert(cobrancas).values({
        contratoId, tipo: p.tipo, numero: p.numero, total: p.total, vencimento: p.vencimento, valor: String(p.valor),
        jurosParcela: String(p.juros), amortizacao: String(p.amortizacao), saldoDevedor: String(p.saldoDevedor),
        splitValor: String(split.get(`${p.tipo}:${p.numero}`) ?? 0), status: 'prevista',
      });
      novas++;
    } catch (e: any) {
      if (!/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ''))) throw e;
    }
  }
  return novas;
}

/** Emite no Asaas as cobranças previstas do carnê (bloco de 12) — só contrato ativo e Asaas configurado */
export async function emitirCarneNoAsaas(contratoId: number, bloco: number, o: { usuarioId?: number; fetchFn?: FetchFn; filtro?: (linha: any) => boolean; origem?: string; antesDaAtivacao?: boolean } = {}) {
  const cfg = exigirConfigAsaas(process.env, await slugDoContrato(contratoId));
  const db = (await getDb()) as any;
  const [c] = await db.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new FinanceiroErro('NAO_ENCONTRADO', 'Contrato não encontrado', 404);
  // Exceção: o boleto da entrada sai junto com o link de assinatura (emitirEntradaComAssinatura), antes da ativação
  const podeAntes = o.antesDaAtivacao && ['apto_assinatura', 'em_assinatura'].includes(String(c.status));
  if (c.status !== 'ativo' && !podeAntes) throw new FinanceiroErro('CONTRATO_NAO_ATIVO', 'Cobranças só são emitidas com o contrato ativo (assinado por todos)', 409);
  const ctx = await contextoDocs(contratoId);
  const { comprador } = await pessoasDoContrato(contratoId);
  if (!comprador) throw new FinanceiroErro('SEM_COMPRADOR', 'Contrato sem comprador cadastrado', 409);
  const customerId = c.asaasCustomerId || await buscarOuCriarCliente(cfg, payloadCliente({ ...comprador, telefone: comprador.telefone1, contratoId }), o.fetchFn);
  if (!c.asaasCustomerId) await db.update(contratos).set({ asaasCustomerId: customerId }).where(eq(contratos.id, contratoId));
  const linhas = await db.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const doBloco = blocoDoCarne<any>(linhas.map((l: any) => ({ ...l, numero: Number(l.numero) })), bloco).filter((l: any) => l.status === 'prevista' && (!o.filtro || o.filtro(l)));
  const hoje = hojeBrasil();
  let emitidas = 0;
  for (const l of doBloco) {
    const venc = String(l.vencimento).slice(0, 10) >= hoje ? String(l.vencimento).slice(0, 10) : hoje;
    const pay = await criarCobranca(cfg, payloadCobranca({
      customerId, cobrancaId: l.id, valor: Number(l.valor), vencimento: venc,
      descricao: `${ctx.contrato.numero} · Chácara ${ctx.lote.codigo} · ${rotuloComComplemento(rotuloParcela(l), parcelaDoPlano(ctx.plano, l))} — Condomínio de Chácaras Bom Jardims`,
      splitValor: Number(l.splitValor ?? 0), walletComissao: cfg.walletComissao,
    }), o.fetchFn);
    const snap = await dadosDePagamento(cfg, pay.id, o.fetchFn);
    await db.update(cobrancas).set({
      asaasPaymentId: pay.id, status: 'emitida', bankSlipUrl: pay.bankSlipUrl ?? null, linhaDigitavel: snap.identificationField,
      codigoBarras: snap.barCode, nossoNumero: snap.nossoNumero, pixPayload: snap.pixPayload, asaasSnapshot: snap as any,
    }).where(and(eq(cobrancas.id, l.id), eq(cobrancas.status, 'prevista')));
    emitidas++;
  }
  await auditar('carne_emitido_asaas', { contratoId, usuarioId: o.usuarioId ?? null, origem: o.origem ?? 'perfil', detalhe: { bloco, emitidas } });
  return { emitidas };
}

/** 1º pagamento do plano: a entrada (parcela 1) ou o pagamento à vista */
const ehPrimeiroPagamento = (l: { tipo: string; numero: number | string }) => l.tipo === 'avista' || (l.tipo === 'entrada' && Number(l.numero) === 1);

export interface BoletoEntrada { cobrancaId: number; valor: number; vencimento: string; boletoUrl: string; pixUrl: string | null }

/** Boleto da entrada já emitido (para o convite de assinatura e os reenvios); null se não houver ou já pago */
export async function boletoDaEntrada(contratoId: number, dias = 15): Promise<BoletoEntrada | null> {
  const db = (await getDb()) as any;
  const ls: any[] = await db.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const l = ls.find(x => ehPrimeiroPagamento(x) && x.status === 'emitida');
  if (!l) return null;
  const { assinarLink } = await import('./links');
  const { urlPixDaCobranca } = await import('./dados');
  const base = (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
  return {
    cobrancaId: Number(l.id), valor: Number(l.valor), vencimento: String(l.vencimento).slice(0, 10),
    boletoUrl: `${base}${assinarLink(`/api/financeiro/cobrancas/${l.id}/boleto-a4.pdf`, Date.now(), dias)}`, pixUrl: urlPixDaCobranca(Number(l.id)),
  };
}

/**
 * No envio para assinatura: grava as cobranças do plano (previstas) e emite no Asaas SÓ o boleto da entrada (ou do
 * à vista), para seguir junto com o link de assinatura. O carnê do saldo sai na ativação, como sempre (sem duplicar).
 * Sem Asaas configurado ou em caso de erro, devolve o motivo e o envio da assinatura segue.
 */
export async function emitirEntradaComAssinatura(contratoId: number, plano: PlanoContrato, o: { usuarioId?: number; fetchFn?: FetchFn } = {}): Promise<{ boleto: BoletoEntrada | null; motivo?: string }> {
  if ((plano as any).concessao) return { boleto: null, motivo: 'concessão: sem cobrança' };
  try {
    await gerarCobrancasDoPlano(contratoId, plano);
    const ja = await boletoDaEntrada(contratoId);
    if (ja) return { boleto: ja };
    await emitirCarneNoAsaas(contratoId, 1, { usuarioId: o.usuarioId, fetchFn: o.fetchFn, filtro: ehPrimeiroPagamento, origem: 'assinatura', antesDaAtivacao: true });
    return { boleto: await boletoDaEntrada(contratoId) };
  } catch (e: any) {
    console.warn('[Emissão] boleto da entrada no envio para assinatura:', e?.message);
    return { boleto: null, motivo: String(e?.message ?? e).slice(0, 200) };
  }
}
