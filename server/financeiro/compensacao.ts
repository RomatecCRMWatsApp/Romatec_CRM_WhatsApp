/**
 * Compensação de pagamento em outra parcela (padrão da Gestão de PA do ZAYRA): o comprador pagou, ou recebeu por
 * engano, o boleto de outro mês. O pagamento passa para a parcela certa e a outra volta a ficar em aberto.
 *
 * 1. A parcela de destino fica PAGA com os dados do pagamento (data, valor, forma, boleto do Asaas que foi pago).
 * 2. A de origem volta a "prevista" (sem boleto), para ser emitida de novo.
 * 3. O recibo passa para a parcela certa (o PDF é refeito).
 * 4. Opcional: cancela no Asaas o boleto em aberto da parcela que ficou paga (evita pagar em dobro).
 * 5. Opcional: emite boleto novo da parcela que reabriu, com o vencimento dela.
 * 6. Opcional: reenvia a confirmação no WhatsApp, com a parcela correta.
 * Falha no Asaas ou no WhatsApp (passos 4 a 6) não desfaz a compensação: volta como aviso, e o passo pode ser repetido.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, recibos } from '../../drizzle/schema';
import { cancelarCobranca, configAsaas, type FetchFn } from './asaas';
import { blocoDoCarne, rotuloParcela } from './dados';
import { auditar, FinanceiroErro, slugDoContrato } from './servico';

const ABERTAS = ['prevista', 'emitida', 'vencida'];
const rotulo = (c: any) => rotuloParcela({ tipo: c.tipo, numero: Number(c.numero), total: Number(c.total) } as any);

export interface PedidoCompensacao { deId: number; paraId: number; cancelarBoleto?: boolean; emitirBoleto?: boolean; avisar?: boolean }

export async function compensarPagamento(p: PedidoCompensacao, autorId: number, o: { fetchFn?: FetchFn } = {}) {
  const d: any = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  if (p.deId === p.paraId) throw new FinanceiroErro('MESMA_PARCELA', 'A parcela de origem e a de destino são a mesma', 400);
  const [de]: any[] = await d.select().from(cobrancas).where(eq(cobrancas.id, p.deId)).limit(1);
  const [para]: any[] = await d.select().from(cobrancas).where(eq(cobrancas.id, p.paraId)).limit(1);
  if (!de || !para) throw new FinanceiroErro('NAO_ENCONTRADO', 'Parcela não encontrada', 404);
  if (Number(de.contratoId) !== Number(para.contratoId)) throw new FinanceiroErro('OUTRO_CONTRATO', 'As parcelas são de contratos diferentes', 400);
  if (de.status !== 'paga') throw new FinanceiroErro('SEM_PAGAMENTO', 'A parcela de origem não tem pagamento para compensar', 409);
  if (!ABERTAS.includes(para.status)) throw new FinanceiroErro('DESTINO', para.status === 'paga' ? 'A parcela de destino já está quitada' : 'A parcela de destino está cancelada', 409);
  const contratoId = Number(de.contratoId);
  const [ct]: any[] = await d.select({ numero: contratos.numero, status: contratos.status }).from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  const boletoAntigo: string | null = para.asaasPaymentId ?? null;
  const pagamento = {
    status: 'paga', pagoEm: de.pagoEm, valorPago: de.valorPago, formaPagamento: de.formaPagamento,
    asaasPaymentId: de.asaasPaymentId, bankSlipUrl: de.bankSlipUrl, linhaDigitavel: de.linhaDigitavel, codigoBarras: de.codigoBarras,
    nossoNumero: de.nossoNumero, pixPayload: de.pixPayload, asaasSnapshot: de.asaasSnapshot,
  };
  const reaberta = {
    status: 'prevista', pagoEm: null, valorPago: null, formaPagamento: null, asaasPaymentId: null, bankSlipUrl: null, linhaDigitavel: null,
    codigoBarras: null, nossoNumero: null, pixPayload: null, asaasSnapshot: null,
  };
  // Ordem: libera o id do Asaas da origem antes de gravar no destino (índice único)
  await d.update(cobrancas).set(reaberta as any).where(eq(cobrancas.id, de.id));
  await d.update(cobrancas).set(pagamento as any).where(eq(cobrancas.id, para.id));
  const [rec]: any[] = await d.select().from(recibos).where(eq(recibos.cobrancaId, de.id)).limit(1);
  if (rec) await d.update(recibos).set({ cobrancaId: para.id, pdfArquivo: null } as any).where(eq(recibos.id, rec.id));

  const avisos: string[] = [];
  const slug = await slugDoContrato(contratoId).catch(() => 'bom-jardims');
  const cfg = configAsaas(process.env, slug);
  // 4. O boleto em aberto da parcela que ficou paga não pode continuar cobrável
  if (p.cancelarBoleto !== false && boletoAntigo) {
    if (!cfg) avisos.push('Asaas não configurado: cancele o boleto antigo da parcela paga no painel do Asaas');
    else {
      try { await cancelarCobranca(cfg, boletoAntigo, o.fetchFn); }
      catch (e: any) { avisos.push(`Não cancelou no Asaas o boleto antigo da ${rotulo(para)}: ${String(e?.message ?? e).slice(0, 140)}`); }
    }
  }
  // 5. Boleto novo da parcela que reabriu
  let emitidas = 0;
  if (p.emitirBoleto !== false) {
    if (!cfg) avisos.push(`Asaas não configurado: a ${rotulo(de)} ficou prevista, sem boleto`);
    else if (ct?.status !== 'ativo') avisos.push(`Contrato não ativo: a ${rotulo(de)} ficou prevista, sem boleto`);
    else {
      try {
        const linhas: any[] = await d.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
        const ordem = blocoDoCarne(linhas.map(l => ({ ...l, numero: Number(l.numero) })), 'completo');
        const bloco = Math.floor(ordem.findIndex(l => Number(l.id) === Number(de.id)) / 12) + 1;
        const { emitirCarneNoAsaas } = await import('./emissao');
        emitidas = (await emitirCarneNoAsaas(contratoId, bloco > 0 ? bloco : 1, { usuarioId: autorId, fetchFn: o.fetchFn, filtro: l => Number(l.id) === Number(de.id), origem: 'compensacao' })).emitidas;
      } catch (e: any) { avisos.push(`Não emitiu o boleto novo da ${rotulo(de)}: ${String(e?.message ?? e).slice(0, 140)}`); }
    }
  }
  await auditar('pagamento_compensado', {
    contratoId, cobrancaId: para.id, usuarioId: autorId, origem: 'perfil',
    detalhe: { de: { id: de.id, parcela: rotulo(de) }, para: { id: para.id, parcela: rotulo(para) }, valor: de.valorPago, boletoCancelado: p.cancelarBoleto !== false ? boletoAntigo : null, emitidas, avisos },
  });
  // 6. Confirmação de novo, com a parcela certa
  if (p.avisar && rec) {
    const { enviarConfirmacao } = await import('./confirmacaoPagamento');
    const r = await enviarConfirmacao(Number(rec.id), 'compensacao', { forcar: true }).catch((e: any) => ({ enviado: false, erro: e?.message }));
    if (!r.enviado) avisos.push(`Confirmação no WhatsApp não enviada: ${r.erro ?? 'falha'}`);
  }
  return { ok: true as const, de: rotulo(de), para: rotulo(para), emitidas, avisos };
}
