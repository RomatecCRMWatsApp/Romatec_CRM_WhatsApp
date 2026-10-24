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
import { blocoDoCarne, rotuloParcela } from './dados';
import { r2 } from '../../shared/simulador';

/** Split da comissão (Romatec): 50% no 1º e 50% no 2º pagamento da entrada; entrada à vista ou à vista total = 100% no 1º */
export function splitDaComissao(plano: PlanoContrato): Map<string, number> {
  const m = new Map<string, number>();
  const total = plano.comissao_total;
  if (!total) return m;
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
export async function emitirCarneNoAsaas(contratoId: number, bloco: number, o: { usuarioId?: number; fetchFn?: FetchFn } = {}) {
  const cfg = exigirConfigAsaas(process.env, await slugDoContrato(contratoId));
  const db = (await getDb()) as any;
  const [c] = await db.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new FinanceiroErro('NAO_ENCONTRADO', 'Contrato não encontrado', 404);
  if (c.status !== 'ativo') throw new FinanceiroErro('CONTRATO_NAO_ATIVO', 'Cobranças só são emitidas com o contrato ativo (assinado por todos)', 409);
  const ctx = await contextoDocs(contratoId);
  const { comprador } = await pessoasDoContrato(contratoId);
  if (!comprador) throw new FinanceiroErro('SEM_COMPRADOR', 'Contrato sem comprador cadastrado', 409);
  const customerId = c.asaasCustomerId || await buscarOuCriarCliente(cfg, payloadCliente({ ...comprador, telefone: comprador.telefone1, contratoId }), o.fetchFn);
  if (!c.asaasCustomerId) await db.update(contratos).set({ asaasCustomerId: customerId }).where(eq(contratos.id, contratoId));
  const linhas = await db.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const doBloco = blocoDoCarne<any>(linhas.map((l: any) => ({ ...l, numero: Number(l.numero) })), bloco).filter((l: any) => l.status === 'prevista');
  const hoje = hojeBrasil();
  let emitidas = 0;
  for (const l of doBloco) {
    const venc = String(l.vencimento).slice(0, 10) >= hoje ? String(l.vencimento).slice(0, 10) : hoje;
    const pay = await criarCobranca(cfg, payloadCobranca({
      customerId, cobrancaId: l.id, valor: Number(l.valor), vencimento: venc,
      descricao: `${ctx.contrato.numero} · Chácara ${ctx.lote.codigo} · ${rotuloParcela(l)} — Condomínio de Chácaras Bom Jardims`,
      splitValor: Number(l.splitValor ?? 0), walletComissao: cfg.walletComissao,
    }), o.fetchFn);
    const snap = await dadosDePagamento(cfg, pay.id, o.fetchFn);
    await db.update(cobrancas).set({
      asaasPaymentId: pay.id, status: 'emitida', bankSlipUrl: pay.bankSlipUrl ?? null, linhaDigitavel: snap.identificationField,
      codigoBarras: snap.barCode, nossoNumero: snap.nossoNumero, pixPayload: snap.pixPayload, asaasSnapshot: snap as any,
    }).where(and(eq(cobrancas.id, l.id), eq(cobrancas.status, 'prevista')));
    emitidas++;
  }
  await auditar('carne_emitido_asaas', { contratoId, usuarioId: o.usuarioId ?? null, origem: 'perfil', detalhe: { bloco, emitidas } });
  return { emitidas };
}
