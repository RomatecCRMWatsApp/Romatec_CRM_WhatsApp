/**
 * Pagamento lançado à mão (PIX direto, transferência, dinheiro), com o comprovante — portado do "Lançar pagamento" do ZAYRA.
 *
 * - Um pagamento pode quitar parcelas de um ou mais contratos (rateio). Cada parcela é quitada INTEIRA (o recibo é por parcela).
 * - PIX exige o ID da transação (E2E); o mesmo ID não dá baixa duas vezes.
 * - CPF parcial do comprovante (***.189.983-**) é conferido com o comprador e o cônjuge; não bateu → vínculo do pagador obrigatório.
 * - Parcela com boleto no Asaas: o Asaas é avisado ("recebido em dinheiro") antes da baixa — o boleto deixa de poder ser pago em dobro.
 * - Depois: recibo emitido e enviado como na baixa automática, e tudo na auditoria.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, pagamentoRateio, pagamentosManuais } from '../../drizzle/schema';
import { auditar, cobrancaPorId, emitirRecibo, enviarRecibo, FinanceiroErro, pessoasDoContrato, slugDoContrato } from './servico';
import { configAsaas, obterCobranca, receberEmDinheiro } from './asaas';
import { rotuloParcela } from './dados';

export const FORMAS_PAGAMENTO_MANUAL = ['PIX', 'TRANSFERENCIA', 'DINHEIRO', 'CARTAO', 'OUTRO'] as const;
export type FormaManual = typeof FORMAS_PAGAMENTO_MANUAL[number];
const ABERTAS = ['prevista', 'emitida', 'vencida'];
const PAGO_ASAAS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const centavos = (v: number) => Math.round(v * 100) / 100;

export interface LancamentoManual {
  forma: FormaManual; valor: number;
  /** AAAA-MM-DDTHH:mm (horário de Brasília) */
  pagoEm: string;
  idTransacao?: string | null; pagadorNome?: string | null; pagadorCpfParcial?: string | null; pagadorInstituicao?: string | null;
  vinculoPagador?: string | null; urlRecibo?: string | null; observacao?: string | null;
  rateio: { cobrancaId: number; valor: number }[];
}

/** CPF parcial do comprovante ("***.189.983-**" ou completo) confere com algum dos CPFs? */
export function cpfParcialConfere(parcial: string | null | undefined, cpfs: (string | null | undefined)[]): boolean {
  const p = String(parcial ?? '').replace(/\D/g, '');
  if (!p) return true;
  return cpfs.some(c => {
    const d = String(c ?? '').replace(/\D/g, '');
    if (d.length !== 11) return false;
    return p.length === 11 ? p === d : p.length === 6 ? d.slice(3, 9) === p : d.includes(p);
  });
}

const db = async () => {
  const d: any = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  return d;
};

/** Parcelas em aberto de um contrato (para escolher no rateio) */
export async function parcelasEmAberto(contratoId: number) {
  const d = await db();
  const rs: any[] = await d.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const ordem: Record<string, number> = { entrada: 0, avista: 0, saldo: 1, antecipacao: 2 };
  return rs.filter(r => ABERTAS.includes(r.status))
    .sort((a, b) => (ordem[a.tipo] ?? 3) - (ordem[b.tipo] ?? 3) || Number(a.numero) - Number(b.numero))
    .map(r => ({
      cobrancaId: r.id, contratoId: r.contratoId, parcela: rotuloParcela({ tipo: r.tipo, numero: Number(r.numero), total: Number(r.total) }),
      vencimento: String(r.vencimento).slice(0, 10), valor: Number(r.valor), status: r.status, temBoleto: !!r.asaasPaymentId,
    }));
}

export async function lancarPagamento(l: LancamentoManual, autorId: number, ip?: string | null) {
  // ─── Validação (nada é gravado se algo estiver errado) ───
  if (!FORMAS_PAGAMENTO_MANUAL.includes(l.forma)) throw new FinanceiroErro('FORMA', 'Forma de pagamento inválida', 400);
  const valor = centavos(Number(l.valor));
  if (!(valor > 0)) throw new FinanceiroErro('VALOR', 'Informe o valor pago', 400);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(l.pagoEm)) throw new FinanceiroErro('DATA', 'Informe a data e a hora do pagamento', 400);
  const pagoEm = new Date(`${l.pagoEm.slice(0, 16)}:00-03:00`);
  if (isNaN(+pagoEm) || +pagoEm > Date.now() + 5 * 60_000) throw new FinanceiroErro('DATA', 'Data do pagamento inválida (no futuro?)', 400);
  const dia = l.pagoEm.slice(0, 10);
  const idTx = String(l.idTransacao ?? '').replace(/\s+/g, '') || null;
  if (l.forma === 'PIX' && !idTx) throw new FinanceiroErro('SEM_ID', 'PIX exige o ID da transação (E2E) do comprovante', 400);
  if (!l.rateio?.length) throw new FinanceiroErro('SEM_PARCELA', 'Escolha a(s) parcela(s) que este pagamento quita', 400);
  if (new Set(l.rateio.map(r => r.cobrancaId)).size !== l.rateio.length) throw new FinanceiroErro('REPETIDA', 'Parcela repetida no rateio', 400);
  const soma = centavos(l.rateio.reduce((s, r) => s + Number(r.valor), 0));
  if (soma > valor + 0.009) throw new FinanceiroErro('RATEIO', `O rateio (R$ ${soma.toFixed(2)}) passa do valor pago (R$ ${valor.toFixed(2)})`, 400);

  const d = await db();
  if (idTx) {
    const [ja] = await d.select({ id: pagamentosManuais.id }).from(pagamentosManuais).where(eq(pagamentosManuais.idTransacao, idTx)).limit(1);
    if (ja) throw new FinanceiroErro('TRANSACAO_DUPLICADA', 'Este comprovante (ID da transação) já foi lançado', 409);
  }
  const parcelas = [];
  for (const r of l.rateio) {
    const c = await cobrancaPorId(r.cobrancaId);
    if (!ABERTAS.includes(c.status)) throw new FinanceiroErro('JA_QUITADA', `${rotuloParcela(c)} não está em aberto (${c.status})`, 409);
    const [ctr] = await d.select({ status: contratos.status, numero: contratos.numero }).from(contratos).where(eq(contratos.id, c.contratoId)).limit(1);
    if (!ctr || ['cancelado', 'distratado'].includes(ctr.status)) throw new FinanceiroErro('CONTRATO', 'Contrato cancelado não recebe pagamento', 409);
    if (Math.abs(centavos(Number(r.valor)) - centavos(c.valor)) > 0.009) {
      throw new FinanceiroErro('VALOR_PARCELA', `${rotuloParcela(c)} (${ctr.numero}) vale R$ ${c.valor.toFixed(2)} — a parcela é quitada inteira`, 400);
    }
    parcelas.push({ c, contratoNumero: ctr.numero });
  }
  // CPF do comprovante × comprador/cônjuge de cada contrato envolvido
  if (l.pagadorCpfParcial) {
    for (const contratoId of Array.from(new Set(parcelas.map(p => p.c.contratoId)))) {
      const { comprador, conjuge } = await pessoasDoContrato(contratoId);
      if (!cpfParcialConfere(l.pagadorCpfParcial, [comprador?.cpfCnpj, conjuge?.cpfCnpj]) && !String(l.vinculoPagador ?? '').trim()) {
        throw new FinanceiroErro('VINCULO_OBRIGATORIO', 'O CPF do comprovante não é do comprador nem do cônjuge: informe o vínculo de quem pagou', 400);
      }
    }
  }
  // Boleto já pago no Asaas: não dá baixa manual (a automática cuida)
  for (const p of parcelas) {
    if (!p.c.asaasPaymentId) continue;
    const cfg = configAsaas(process.env, await slugDoContrato(p.c.contratoId));
    if (!cfg) throw new FinanceiroErro('ASAAS_NAO_CONFIGURADO', 'Parcela com boleto no Asaas, mas o Asaas não está configurado', 503);
    const remoto = await obterCobranca(cfg, p.c.asaasPaymentId);
    if (PAGO_ASAAS.includes(String(remoto?.status))) throw new FinanceiroErro('JA_PAGO_ASAAS', `${rotuloParcela(p.c)} já foi paga no Asaas — a baixa automática registra; não lance de novo`, 409);
  }

  // ─── Gravação ───
  const linha = {
    forma: l.forma, valor: valor.toFixed(2), pagoEm, idTransacao: idTx, pagadorNome: l.pagadorNome?.trim() || null,
    pagadorCpfParcial: l.pagadorCpfParcial?.trim() || null, pagadorInstituicao: l.pagadorInstituicao?.trim() || null,
    vinculoPagador: l.vinculoPagador?.trim() || null, urlRecibo: l.urlRecibo?.trim() || null,
    observacao: [l.observacao?.trim(), soma < valor - 0.009 ? `Sobra de R$ ${(valor - soma).toFixed(2)} sem parcela` : ''].filter(Boolean).join(' · ') || null,
    lancadoPor: autorId, criadoEm: new Date(),
  };
  try { await d.insert(pagamentosManuais).values(linha as any); }
  catch (e: any) {
    if (/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ''))) throw new FinanceiroErro('TRANSACAO_DUPLICADA', 'Este comprovante (ID da transação) já foi lançado', 409);
    throw e;
  }
  const [pag] = await d.select({ id: pagamentosManuais.id }).from(pagamentosManuais).orderBy(desc(pagamentosManuais.id)).limit(1);

  const baixadas: { parcela: string; contrato: string; recibo: string }[] = [];
  for (const p of parcelas) {
    if (p.c.asaasPaymentId) {
      const cfg = configAsaas(process.env, await slugDoContrato(p.c.contratoId))!;
      await receberEmDinheiro(cfg, p.c.asaasPaymentId, { data: dia, valor: p.c.valor });
    }
    await d.update(cobrancas).set({ status: 'paga', pagoEm: dia, valorPago: p.c.valor.toFixed(2), formaPagamento: l.forma === 'PIX' ? 'PIX' : l.forma } as any)
      .where(and(eq(cobrancas.id, p.c.id), inArray(cobrancas.status, ABERTAS)));
    const rec = await emitirRecibo(p.c.id, dia);
    await d.insert(pagamentoRateio).values({ pagamentoId: pag.id, cobrancaId: p.c.id, contratoId: p.c.contratoId, valor: p.c.valor.toFixed(2), reciboId: rec.id } as any);
    await auditar('pagamento_manual', { contratoId: p.c.contratoId, cobrancaId: p.c.id, usuarioId: autorId, origem: 'perfil', ip, detalhe: { pagamentoId: pag.id, forma: l.forma, idTransacao: idTx, recibo: rec.numero } });
    if (rec.novo) setImmediate(() => enviarRecibo(rec.id, 'pagamento_manual').catch(e => console.warn('[Financeiro] envio do recibo:', e?.message)));
    baixadas.push({ parcela: rotuloParcela(p.c), contrato: p.contratoNumero, recibo: rec.numero });
  }
  return { pagamentoId: pag.id, baixadas, sobra: centavos(valor - soma) };
}

/** Últimos pagamentos lançados à mão (com as parcelas) */
export async function pagamentosRecentes(limite = 20) {
  const d = await db();
  const ps: any[] = await d.select().from(pagamentosManuais).orderBy(desc(pagamentosManuais.id)).limit(limite);
  if (!ps.length) return [];
  const rs: any[] = await d.select().from(pagamentoRateio).where(inArray(pagamentoRateio.pagamentoId, ps.map(p => p.id)));
  return ps.map(p => ({
    id: p.id, forma: p.forma, valor: Number(p.valor), pagoEm: p.pagoEm, pagadorNome: p.pagadorNome, idTransacao: p.idTransacao, urlRecibo: p.urlRecibo, observacao: p.observacao,
    parcelas: rs.filter(r => r.pagamentoId === p.id).map(r => ({ cobrancaId: r.cobrancaId, contratoId: r.contratoId, valor: Number(r.valor) })),
  }));
}
