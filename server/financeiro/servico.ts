/**
 * Serviços do Bloco Financeiro: contexto dos documentos, recibo automático (idempotente), webhook do Asaas,
 * 2ª via atualizada e auditoria. Asaas DORMENTE sem chave: nada é emitido, cobrado nem enviado ao cliente.
 */
import { createHash, randomBytes } from 'node:crypto';
import { telefoneWhatsApp } from '../../shared/contratos';
import { and, eq, like, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  asaasWebhookLog, cobrancas, contratoPessoas, contratos, empJuridico, empreendimentos, financeiroAuditoria, indicesIpca, lotes, pessoas, recibos,
} from '../../drizzle/schema';
import type { PlanoContrato } from '../contratos/plano';
import { salvarArquivo, lerArquivo } from '../contratos/arquivos';
import { enderecoCompleto } from '../contratos/contexto';
import { atualizarCobranca, beneficiarioDaConta, configAsaas, dadosDePagamento, payloadSegundaVia, statusLocal, type AsaasConfig, type FetchFn } from './asaas';
import { calcularEncargos, diasEntre, DIAS_MAX_SEGUNDA_VIA, somarDiasUteis } from './encargos';
import { docMascarado, rotuloParcela, type CobrancaDoc, type ContextoDocs, type SnapshotAsaas, dadosParcela } from './dados';
import { renderBoletoA4, renderRecibo } from './render/documentos';

export class FinanceiroErro extends Error {
  constructor(public codigo: string, mensagem: string, public status = 400) { super(mensagem); }
}

const db = async () => {
  const d = (await getDb()) as any;
  if (!d) throw new FinanceiroErro('BANCO', 'Banco indisponível', 503);
  return d;
};
const num = (v: unknown) => (v == null ? null : Number(v));
const json = <T>(v: unknown): T | null => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as T));
const iso = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const hojeBrasil = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
export const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');

/** XXXX-XXXX-XXXX (sem 0/O/1/I) */
export function codigoVerificacao(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(12);
  const s = Array.from(b, x => A[x % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export async function auditar(acao: string, o: { contratoId?: number | null; cobrancaId?: number | null; usuarioId?: number | null; origem: string; ip?: string | null; detalhe?: Record<string, unknown> }) {
  try {
    await (await db()).insert(financeiroAuditoria).values({ acao, contratoId: o.contratoId ?? null, cobrancaId: o.cobrancaId ?? null, usuarioId: o.usuarioId ?? null,
      origem: o.origem, ip: o.ip ?? null, detalhe: o.detalhe ?? null, criadoEm: new Date() });
  } catch (e: any) { console.warn('[Financeiro] auditoria:', e?.message); }
}

// ─── Leitura ──────────────────────────────────────────────────────────────

export function linhaParaCobranca(r: any): CobrancaDoc & { status: string; contratoId: number; asaasPaymentId: string | null; valorOriginal: number | null; vencimentoOriginal: string | null; pagoEm: string; valorPago: number | null; formaPagamento: string | null; bankSlipUrl: string | null } {
  return {
    id: r.id, contratoId: r.contratoId, tipo: r.tipo, numero: Number(r.numero), total: Number(r.total), vencimento: iso(r.vencimento), valor: Number(r.valor),
    juros: Number(r.jurosParcela ?? 0), amortizacao: Number(r.amortizacao ?? 0), saldoDevedor: num(r.saldoDevedor),
    asaas: json<SnapshotAsaas>(r.asaasSnapshot), dataDocumento: iso(r.segundaViaEm) || iso(r.criadoEm) || hojeBrasil(),
    status: r.status, asaasPaymentId: r.asaasPaymentId ?? null, valorOriginal: num(r.valorOriginal), vencimentoOriginal: r.vencimentoOriginal ? iso(r.vencimentoOriginal) : null,
    pagoEm: iso(r.pagoEm), valorPago: num(r.valorPago), formaPagamento: r.formaPagamento ?? null, bankSlipUrl: r.bankSlipUrl ?? null,
  };
}

export async function cobrancaPorId(id: number) {
  const [r] = await (await db()).select().from(cobrancas).where(eq(cobrancas.id, id)).limit(1);
  if (!r) throw new FinanceiroErro('NAO_ENCONTRADA', 'Cobrança não encontrada', 404);
  return linhaParaCobranca(r);
}

export async function cobrancasDoContrato(contratoId: number): Promise<ReturnType<typeof linhaParaCobranca>[]> {
  const rs = await (await db()).select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const ordem = { entrada: 0, avista: 0, saldo: 1, renegociacao: 2, antecipacao: 3 } as Record<string, number>;
  return rs.map(linhaParaCobranca).sort((a: any, b: any) => ordem[a.tipo] - ordem[b.tipo] || a.numero - b.numero);
}

/** Comprador/cônjuge do contrato (tabela pessoas) */
export async function pessoasDoContrato(contratoId: number) {
  const d = await db();
  const rs = await d.select({ papel: contratoPessoas.papel, p: pessoas }).from(contratoPessoas)
    .innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId)).where(eq(contratoPessoas.contratoId, contratoId));
  const de = (papel: string) => rs.find((r: any) => r.papel === papel)?.p ?? null;
  return { comprador: de('comprador'), conjuge: de('conjuge') };
}

export async function contextoDocs(contratoId: number): Promise<ContextoDocs> {
  const d = await db();
  const [c] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new FinanceiroErro('NAO_ENCONTRADO', 'Contrato não encontrado', 404);
  const [j] = await d.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, c.empreendimentoId)).limit(1);
  const [l] = await d.select().from(lotes).where(and(eq(lotes.empreendimentoId, c.empreendimentoId), eq(lotes.codigo, c.loteCodigo))).limit(1);
  const { comprador } = await pessoasDoContrato(contratoId);
  const [emp] = await d.select({ slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, c.empreendimentoId)).limit(1);
  const benef = await beneficiarioDoEmpreendimento(c.empreendimentoId, emp?.slug ?? 'bom-jardims');
  const plano = json<PlanoContrato>(c.simulacaoJson)!;
  return {
    contrato: { id: c.id, numero: c.numero, modeloVersao: j?.modeloVersao ?? 'CPCV-BJ v2.0', codigoVerificacao: c.codigoVerificacao },
    lote: { codigo: c.loteCodigo, quadra: l?.quadra ?? null, areaM2: Number(l?.areaM2 ?? plano?.area_m2 ?? 0) },
    comprador: comprador
      ? { nome: String(comprador.nome).toUpperCase(), cpfCnpj: comprador.cpfCnpj, endereco: enderecoCompleto(comprador as any) || '—' }
      : { nome: '—', cpfCnpj: '', endereco: '—' },
    beneficiario: benef.texto,
    agenciaCodigo: benef.agenciaConta || '—',
    urlPublica: urlPublica(),
    plano,
  };
}

/** Slug do empreendimento do contrato (escolhe a chave Asaas: ASAAS_API_KEY_<SLUG>) */
export async function slugDoContrato(contratoId: number): Promise<string> {
  const d = await db();
  const [r] = await d.select({ slug: empreendimentos.slug }).from(contratos).innerJoin(empreendimentos, eq(empreendimentos.id, contratos.empreendimentoId))
    .where(eq(contratos.id, contratoId)).limit(1);
  return r?.slug ?? 'bom-jardims';
}

export const BENEFICIARIO_PENDENTE = 'Beneficiário: conta Asaas do empreendimento não configurada';
const UM_DIA = 86_400_000;

/**
 * Beneficiário dos boletos/carnê/recibo = titular da conta Asaas da chave configurada para o empreendimento
 * (ASAAS_API_KEY_<SLUG>), lido de /myAccount e guardado em empJuridico.asaasBeneficiario. Nunca é constante no código:
 * trocou a chave (outra conta, ex.: uma SPE), a impressão digital da chave muda e o beneficiário é relido.
 */
export async function beneficiarioDoEmpreendimento(empreendimentoId: number, slug: string, o: { fetchFn?: FetchFn; env?: NodeJS.ProcessEnv } = {}):
  Promise<{ texto: string; nome: string; cpfCnpj: string; agenciaConta: string; configurado: boolean }> {
  const d = await db();
  const [j] = await d.select({ b: empJuridico.asaasBeneficiario }).from(empJuridico).where(eq(empJuridico.empreendimentoId, empreendimentoId)).limit(1);
  const salvo = json<{ nome: string; cpfCnpj: string; agenciaConta: string; atualizadoEm: string; chave: string }>(j?.b);
  const cfg = configAsaas(o.env ?? process.env, slug);
  const formatar = (b: { nome: string; cpfCnpj: string; agenciaConta: string }, configurado: boolean) => ({
    ...b, configurado, texto: b.cpfCnpj ? `${b.nome} — ${docMascarado(b.cpfCnpj)}` : b.nome,
  });
  if (!cfg) return { texto: BENEFICIARIO_PENDENTE, nome: '', cpfCnpj: '', agenciaConta: '', configurado: false };
  const chave = createHash('sha256').update(cfg.apiKey).digest('hex').slice(0, 16);
  if (salvo && salvo.chave === chave && Date.now() - Date.parse(salvo.atualizadoEm) < UM_DIA) return formatar(salvo, true);
  try {
    const b = await beneficiarioDaConta(cfg, o.fetchFn);
    if (j) await d.update(empJuridico).set({ asaasBeneficiario: { ...b, chave } as any }).where(eq(empJuridico.empreendimentoId, empreendimentoId));
    return formatar(b, true);
  } catch (e: any) {
    // Asaas fora do ar: vale o último lido DESTA chave; de outra chave, nunca
    if (salvo && salvo.chave === chave) return formatar(salvo, true);
    throw new FinanceiroErro('SEM_BENEFICIARIO', `Não foi possível ler o titular da conta Asaas (${e?.message ?? e})`, 502);
  }
}

export async function indicesIpcaMap(): Promise<Map<string, number>> {
  const rs = await (await db()).select().from(indicesIpca);
  return new Map(rs.map((r: any) => [String(r.competencia), Number(r.variacao)]));
}

// ─── Recibo automático ────────────────────────────────────────────────────

/**
 * Parcelas pagas sem recibo (até a v1.30.5 o recibo não gravava: a tabela "recibos" do banco é da ZAYRA).
 * Emite os que faltam — só emite, não envia ao cliente (o envio segue manual pelo botão do recibo).
 */
export async function emitirRecibosPendentes(): Promise<{ emitidos: string[]; falhas: number }> {
  const d = await db();
  const pagas: any[] = await d.select({ id: cobrancas.id, contratoId: cobrancas.contratoId }).from(cobrancas).where(eq(cobrancas.status, 'paga'));
  if (!pagas.length) return { emitidos: [], falhas: 0 };
  const comRecibo = new Set((await d.select({ c: recibos.cobrancaId }).from(recibos)).map((r: any) => r.c));
  const emitidos: string[] = [];
  let falhas = 0;
  for (const p of pagas.filter(x => !comRecibo.has(x.id))) {
    try {
      const rec = await emitirRecibo(p.id);
      emitidos.push(rec.numero);
      await auditar('recibo_emitido_pendente', { contratoId: p.contratoId, cobrancaId: p.id, origem: 'sistema', detalhe: { recibo: rec.numero, motivo: 'parcela paga sem recibo (tabela recibos da ZAYRA até a v1.30.5)' } });
    } catch (e: any) {
      falhas++;
      console.warn(`[Financeiro] recibo pendente da cobrança ${p.id}:`, e?.message);
    }
  }
  return { emitidos, falhas };
}

export interface ReciboEmitido { id: number; numero: string; codigoVerif: string; novo: boolean }

/**
 * Emite o recibo da cobrança paga. Idempotente: o índice único em recibos.cobrancaId garante 1 recibo
 * mesmo com webhook repetido ou simultâneo (quem perde a corrida devolve o que já existe).
 */
export async function emitirRecibo(cobrancaId: number, hoje = hojeBrasil()): Promise<ReciboEmitido> {
  const d = await db();
  const existente = async () => {
    const [r] = await d.select().from(recibos).where(eq(recibos.cobrancaId, cobrancaId)).limit(1);
    return r ? { id: r.id, numero: r.numero, codigoVerif: r.codigoVerif, novo: false } : null;
  };
  const ja = await existente();
  if (ja) return ja;
  const c = await cobrancaPorId(cobrancaId);
  if (c.status !== 'paga') throw new FinanceiroErro('NAO_PAGA', 'Recibo só para cobrança paga', 409);
  const ano = (c.pagoEm || hoje).slice(0, 4);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const doAno = await d.select({ numero: recibos.numero }).from(recibos).where(like(recibos.numero, `REC-BJ-${ano}-%`));
    const proximo = doAno.reduce((m: number, r: any) => Math.max(m, Number(String(r.numero).slice(-6)) || 0), 0) + 1 + tentativa;
    const numero = `REC-BJ-${ano}-${String(proximo).padStart(6, '0')}`;
    const codigoVerif = codigoVerificacao();
    try {
      await d.insert(recibos).values({ numero, cobrancaId, contratoId: c.contratoId, codigoVerif, valorPago: String(c.valorPago ?? c.valor),
        pagoEm: c.pagoEm || hoje, criadoEm: new Date() });
      const [r] = await d.select().from(recibos).where(eq(recibos.cobrancaId, cobrancaId)).limit(1);
      return { id: r.id, numero: r.numero, codigoVerif: r.codigoVerif, novo: r.numero === numero };
    } catch (e: any) {
      const outro = await existente();
      if (outro) return outro; // webhook repetido: já existe recibo dessa cobrança
      if (!/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ''))) throw e;
      // número tomado por outra cobrança ao mesmo tempo: tenta o próximo
    }
  }
  throw new FinanceiroErro('RECIBO_NUMERO', 'Não foi possível numerar o recibo', 500);
}

/** Dados do recibo para o PDF (publico = sem CPF) */
export async function dadosRecibo(reciboId: number, publico = false) {
  const d = await db();
  const [r] = await d.select().from(recibos).where(eq(recibos.id, reciboId)).limit(1);
  if (!r) throw new FinanceiroErro('NAO_ENCONTRADO', 'Recibo não encontrado', 404);
  const c = await cobrancaPorId(r.cobrancaId);
  const ctx = await contextoDocs(r.contratoId);
  const restantes = c.tipo === 'saldo' ? `${c.total - c.numero} do saldo` : c.tipo === 'entrada' ? `${c.total - c.numero} da entrada + ${ctx.plano.saldo_qtd} do saldo` : '—';
  return {
    recibo: r, cobranca: c, ctx,
    dados: {
      numero: r.numero, codigoVerif: r.codigoVerif, urlVerificacao: `${urlPublica()}/r/${r.numero}`,
      pagadorNome: ctx.comprador.nome, pagadorDoc: publico ? '' : docMascarado(ctx.comprador.cpfCnpj), contratoNumero: ctx.contrato.numero,
      referente: `${rotuloParcela(c)} · Chácara ${ctx.lote.codigo}`, vencimento: c.vencimentoOriginal ?? c.vencimento,
      valorPago: Number(r.valorPago), pagoEm: iso(r.pagoEm), forma: c.formaPagamento === 'PIX' ? 'PIX' : 'Boleto',
      saldoRemanescente: c.tipo === 'saldo' ? c.saldoDevedor : ctx.plano.saldo_valor || null, parcelasAVencer: restantes,
      beneficiario: ctx.beneficiario, asaasId: c.asaasPaymentId ?? '—',
    },
  };
}

/** PDF do recibo (gerado uma vez e guardado; a versão pública não traz CPF) */
export async function pdfRecibo(reciboId: number, publico = false): Promise<Buffer> {
  const { recibo, dados } = await dadosRecibo(reciboId, publico);
  if (!publico && recibo.pdfArquivo) {
    const a = await lerArquivo(recibo.pdfArquivo);
    if (a) return a.buf;
  }
  const pdf = await renderRecibo(dados);
  if (!publico) {
    const chave = `recibos/${recibo.numero}.pdf`;
    await salvarArquivo(chave, pdf);
    await (await db()).update(recibos).set({ pdfArquivo: chave }).where(eq(recibos.id, reciboId));
  }
  return pdf;
}

/** Envio do recibo (WhatsApp do comprador e do cônjuge). Falha de envio não reemite: fica registrada para reenviar. */
export async function enviarRecibo(reciboId: number, origem = 'webhook'): Promise<{ enviado: boolean; erro?: string }> {
  const [rec] = await (await db()).select({ contratoId: recibos.contratoId }).from(recibos).where(eq(recibos.id, reciboId)).limit(1);
  if (!rec) throw new FinanceiroErro('NAO_ENCONTRADO', 'Recibo não encontrado', 404);
  if (!configAsaas(process.env, await slugDoContrato(rec.contratoId))) return { enviado: false, erro: 'Cobrança desligada (Asaas sem chave): nada é enviado ao cliente' };
  const { recibo } = await dadosRecibo(reciboId);
  const pdf = await pdfRecibo(reciboId);
  const { comprador, conjuge } = await pessoasDoContrato(recibo.contratoId);
  const telefones = [comprador?.telefone1, conjuge?.telefone1].map(telefoneWhatsApp).filter(Boolean) as string[];
  const d = await db();
  try {
    if (!telefones.length) throw new Error('Comprador sem telefone cadastrado');
    const { enviarDocumento } = await import('../leads/zapiClient');
    for (const t of telefones) {
      await enviarDocumento(t, { base64: pdf.toString('base64'), extensao: 'pdf', mime: 'application/pdf', nomeArquivo: `${recibo.numero}.pdf`,
        legenda: `Recibo ${recibo.numero} — pagamento confirmado. Obrigado! Condomínio de Chácaras Bom Jardims` });
    }
    await d.update(recibos).set({ enviadoEm: new Date(), envioErro: null }).where(eq(recibos.id, reciboId));
    await auditar('recibo_enviado', { contratoId: recibo.contratoId, cobrancaId: recibo.cobrancaId, origem, detalhe: { numero: recibo.numero, destinos: telefones.length } });
    return { enviado: true };
  } catch (e: any) {
    const erro = String(e?.message ?? e).slice(0, 250);
    await d.update(recibos).set({ envioErro: erro }).where(eq(recibos.id, reciboId));
    return { enviado: false, erro };
  }
}

// ─── Webhook do Asaas ─────────────────────────────────────────────────────

export interface EventoAsaas {
  id?: string;
  event?: string;
  payment?: { id?: string; value?: number; billingType?: string; status?: string; dueDate?: string; bankSlipUrl?: string | null;
    paymentDate?: string | null; clientPaymentDate?: string | null; confirmedDate?: string | null };
}

const PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH']);

/**
 * Processa um evento. Idempotente: o eventId vai para asaasWebhookLog (chave primária) e evento já processado é ignorado;
 * o recibo tem índice único por cobrança. Render/envio do recibo acontece fora (enviarDepois).
 */
export async function processarEventoAsaas(ev: EventoAsaas, opcoes: { enviarDepois?: (reciboId: number) => void } = {}): Promise<{ acao: string; reciboId?: number }> {
  const d = await db();
  const evento = String(ev.event ?? '');
  const pay = ev.payment;
  const eventId = String(ev.id || `${evento}:${pay?.id ?? ''}:${pay?.status ?? ''}`).slice(0, 60);
  const [log] = await d.select().from(asaasWebhookLog).where(eq(asaasWebhookLog.eventId, eventId)).limit(1);
  if (log?.processado) return { acao: 'duplicado' };
  if (!log) {
    try {
      await d.insert(asaasWebhookLog).values({ eventId, evento: evento || '-', paymentId: pay?.id ?? null, payload: ev as any, processado: sql`FALSE` as any, recebidoEm: new Date() });
    } catch { /* corrida com outro envio do mesmo evento: segue, o recibo é idempotente */ }
  }
  const marcar = () => d.update(asaasWebhookLog).set({ processado: sql`TRUE` as any }).where(eq(asaasWebhookLog.eventId, eventId));
  if (!pay?.id) { await marcar(); return { acao: 'ignorado:sem_payment' }; }
  const [r] = await d.select().from(cobrancas).where(eq(cobrancas.asaasPaymentId, pay.id)).limit(1);
  if (!r) { await marcar(); return { acao: 'ignorado:nao_e_do_crm' }; }

  if (PAGO.has(evento)) {
    const pagoEm = (pay.clientPaymentDate || pay.paymentDate || pay.confirmedDate || hojeBrasil()).slice(0, 10);
    if (r.status !== 'paga') {
      await d.update(cobrancas).set({ status: 'paga', pagoEm, valorPago: String(pay.value ?? r.valor), formaPagamento: pay.billingType === 'PIX' ? 'PIX' : 'BOLETO' })
        .where(eq(cobrancas.id, r.id));
    }
    const rec = await emitirRecibo(r.id, pagoEm);
    await marcar();
    await auditar('pagamento_confirmado', { contratoId: r.contratoId, cobrancaId: r.id, origem: 'webhook', detalhe: { evento, recibo: rec.numero } });
    if (rec.novo) (opcoes.enviarDepois ?? (id => setImmediate(() => enviarRecibo(id).catch(e => console.warn('[Financeiro] envio do recibo:', e?.message)))))(rec.id);
    return { acao: rec.novo ? 'pago:recibo_emitido' : 'pago:recibo_ja_existia', reciboId: rec.id };
  }
  const novo = evento === 'PAYMENT_OVERDUE' ? 'vencida' : evento === 'PAYMENT_DELETED' ? 'cancelada'
    : evento === 'PAYMENT_REFUNDED' || evento === 'PAYMENT_CHARGEBACK_REQUESTED' ? 'estornada' : evento === 'PAYMENT_RESTORED' ? statusLocal(pay.status) : null;
  if (novo && (r.status !== 'paga' || novo === 'estornada')) await d.update(cobrancas).set({ status: novo }).where(eq(cobrancas.id, r.id));
  if (novo === 'estornada' && r.status === 'paga') {
    await auditar('estorno_conferir', { contratoId: r.contratoId, cobrancaId: r.id, origem: 'webhook', detalhe: { aviso: 'estorno de parcela já paga — conferir o recibo' } });
  }
  await marcar();
  return { acao: novo ? `status:${novo}` : `ignorado:${evento || 'sem_evento'}` };
}

// ─── 2ª via atualizada ────────────────────────────────────────────────────

export interface ResultadoSegundaVia { pdf: Buffer; valorOriginal: number; encargos: number; total: number; dias: number; novoVencimento: string }

/**
 * 2ª via (CPCV, Cláusula 7ª): só de parcela vencida até 59 dias; acima disso, negociação (409 negociacao_necessaria).
 * Atualiza a cobrança NO ASAAS (PUT, valor com encargos e multa/juros nativos zerados) e rebusca linha digitável e PIX.
 */
export async function segundaVia(cobrancaId: number, o: { hoje?: string; cfg?: AsaasConfig | null; fetchFn?: FetchFn; modelo?: boolean } = {}): Promise<ResultadoSegundaVia> {
  const hoje = o.hoje ?? hojeBrasil();
  const c = await cobrancaPorId(cobrancaId);
  const vencOriginal = c.vencimentoOriginal ?? c.vencimento;
  const valorOriginal = c.valorOriginal ?? c.valor;
  if (c.status === 'paga') throw new FinanceiroErro('JA_PAGA', 'Esta parcela já está paga', 409);
  if (!['vencida', 'emitida'].includes(c.status) || c.vencimento >= hoje) throw new FinanceiroErro('NAO_VENCIDA', 'A 2ª via atualizada é só para parcela vencida', 409);
  const atraso = diasEntre(vencOriginal, hoje);
  if (atraso > DIAS_MAX_SEGUNDA_VIA) throw new FinanceiroErro('negociacao_necessaria', `Parcela vencida há ${atraso} dias: procure a administração para negociar`, 409);
  const cfg = o.cfg === undefined ? configAsaas(process.env, await slugDoContrato(c.contratoId)) : o.cfg;
  if (!cfg) throw new FinanceiroErro('ASAAS_NAO_CONFIGURADO', 'Cobrança desligada: defina ASAAS_API_KEY_BOMJARDIMS no Railway', 503);
  if (!c.asaasPaymentId) throw new FinanceiroErro('SEM_ASAAS', 'Parcela ainda não emitida no Asaas', 409);

  const novoVencimento = somarDiasUteis(hoje, 2);
  const enc = calcularEncargos(valorOriginal, vencOriginal, novoVencimento, await indicesIpcaMap());
  await atualizarCobranca(cfg, c.asaasPaymentId, payloadSegundaVia(enc.total, novoVencimento), o.fetchFn);
  const snap = await dadosDePagamento(cfg, c.asaasPaymentId, o.fetchFn);
  const d = await db();
  await d.update(cobrancas).set({
    valor: String(enc.total), vencimento: novoVencimento, status: 'emitida', segundaViaEm: new Date(),
    linhaDigitavel: snap.identificationField, codigoBarras: snap.barCode, nossoNumero: snap.nossoNumero, pixPayload: snap.pixPayload, asaasSnapshot: snap as any,
    ...(c.valorOriginal == null ? { valorOriginal: String(valorOriginal), vencimentoOriginal: vencOriginal } : {}),
  }).where(eq(cobrancas.id, cobrancaId));
  const ctx = await contextoDocs(c.contratoId);
  const atual = await cobrancaPorId(cobrancaId);
  const pdf = await renderBoletoA4(dadosParcela(ctx, atual, []), {
    modelo: o.modelo, segundaVia: { valorOriginal, encargos: enc.encargos, dias: enc.dias, valorAtualizado: enc.total, novoVencimento },
  });
  await auditar('segunda_via', { contratoId: c.contratoId, cobrancaId, origem: 'sistema', detalhe: { valorOriginal, total: enc.total, dias: enc.dias, novoVencimento } });
  return { pdf, valorOriginal, encargos: enc.encargos, total: enc.total, dias: enc.dias, novoVencimento };
}
