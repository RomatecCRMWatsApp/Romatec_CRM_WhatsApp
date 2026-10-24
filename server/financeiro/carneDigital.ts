/**
 * Carnê digital (/c/:codigo): página pública do comprador, aberta pelo QR da contracapa do carnê.
 * O código de verificação do contrato (12 caracteres) é a chave de acesso; a página mostra só o necessário
 * (primeiro nome, parcelas, situação) e os documentos saem por links assinados de 7 dias (HMAC) — boleto A4,
 * 2ª via atualizada (até 59 dias de atraso), recibos e o carnê de cada ano.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { contratos, empreendimentos, recibos } from '../../drizzle/schema';
import { acoesDaParcela } from '../../shared/contratos';
import { assinarLink } from './links';
import { blocoDoCarne, rotuloParcela, totalDeBlocos } from './dados';
import { auditar, cobrancasDoContrato, contextoDocs, FinanceiroErro, hojeBrasil, pessoasDoContrato } from './servico';

/** Limite simples por IP (força bruta no código): 40 consultas a cada 10 minutos */
const janelas = new Map<string, { n: number; desde: number }>();
export function dentroDoLimite(ip: string, agora = Date.now(), max = 40, janelaMs = 10 * 60_000): boolean {
  const j = janelas.get(ip);
  if (!j || agora - j.desde > janelaMs) { janelas.set(ip, { n: 1, desde: agora }); return true; }
  j.n++;
  return j.n <= max;
}

export async function carneDigital(codigo: string, o: { ip?: string; hoje?: string } = {}) {
  if (!/^[A-Z0-9]{12}$/.test(codigo)) throw new FinanceiroErro('CODIGO', 'Código inválido', 404);
  const d = (await getDb()) as any;
  const [c] = await d.select().from(contratos).where(eq(contratos.codigoVerificacao, codigo)).limit(1);
  if (!c) throw new FinanceiroErro('CODIGO', 'Carnê não encontrado — confira o código impresso no carnê', 404);
  const [emp] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const { comprador } = await pessoasDoContrato(c.id);
  const base = {
    contrato: { numero: c.numero, empreendimento: emp?.nome ?? '', lote: c.loteCodigo, status: c.status },
    comprador: String(comprador?.nome ?? '').trim().split(/\s+/)[0] || 'Cliente',
  };
  if (!['ativo', 'quitado'].includes(c.status)) return { ...base, disponivel: false as const };

  const hoje = o.hoje ?? hojeBrasil();
  const cobs = await cobrancasDoContrato(c.id);
  const recs: any[] = cobs.length ? await d.select().from(recibos).where(inArray(recibos.cobrancaId, cobs.map(x => x.id))) : [];
  const ctx = await contextoDocs(c.id);
  const link = (caminho: string) => assinarLink(caminho);
  const parcelas = cobs.filter(x => x.status !== 'cancelada').map(x => {
    const rec = recs.find(r => r.cobrancaId === x.id);
    const a = acoesDaParcela({ status: x.status, vencimento: x.vencimento, vencimentoOriginal: x.vencimentoOriginal, asaas: !!x.asaasPaymentId && !!x.asaas, recibo: !!rec }, hoje);
    return {
      id: x.id, rotulo: rotuloParcela(x), vencimento: x.vencimento, valor: x.valor, status: x.status, pagoEm: x.pagoEm || null, valorPago: x.valorPago,
      atraso: a.atraso, negociacao: a.negociacao,
      boleto: a.boleto ? link(`/api/financeiro/cobrancas/${x.id}/boleto-a4.pdf`) : null,
      segundaVia: a.segundaVia ? link(`/api/financeiro/cobrancas/${x.id}/segunda-via`) : null,
      recibo: a.recibo && rec ? link(`/api/financeiro/recibos/${rec.id}.pdf`) : null,
    };
  });
  const pagas = cobs.filter(x => x.status === 'paga');
  const ultimaPaga = [...pagas].reverse().find(x => x.tipo === 'saldo');
  const proxima = parcelas.find(x => x.status !== 'paga');
  // Carnê de cada ano: só quando todas as parcelas do bloco já foram emitidas no Asaas (sem isso, não há linha digitável)
  const blocos = Array.from({ length: totalDeBlocos(ctx.plano) }, (_, i) => i + 1)
    .map(n => ({ n, cobs: blocoDoCarne(cobs, n) }))
    .filter(b => b.cobs.length && b.cobs.every(x => x.asaas?.identificationField))
    .map(b => ({ n: b.n, rotulo: `${rotuloParcela(b.cobs[0])} a ${rotuloParcela(b.cobs.at(-1)!)}`, url: link(`/api/financeiro/contratos/${c.id}/carne-v2.pdf?bloco=${b.n}`) }));

  await auditar('carne_digital', { contratoId: c.id, origem: 'publico', ip: o.ip ?? null });
  return {
    ...base, disponivel: true as const,
    beneficiario: ctx.beneficiario,
    resumo: {
      pagas: pagas.length, total: parcelas.length, totalPago: Math.round(pagas.reduce((s, x) => s + (x.valorPago ?? x.valor), 0) * 100) / 100,
      saldoDevedor: ultimaPaga?.saldoDevedor ?? ctx.plano.saldo_valor ?? null,
      vencidas: parcelas.filter(x => x.atraso > 0 && x.status !== 'paga').length,
      proxima: proxima ? { rotulo: proxima.rotulo, vencimento: proxima.vencimento, valor: proxima.valor } : null,
    },
    parcelas, carnes: blocos,
    contato: '(99) 9 9101-1970',
  };
}
