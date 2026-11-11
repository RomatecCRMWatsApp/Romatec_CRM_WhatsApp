/**
 * Via assinada do contrato para o(a) comprador(a): liberada só depois de paga a entrada (ou o pagamento à vista).
 * Antes de assinar, ele(a) lê o contrato normalmente (é preciso ler para assinar); depois de assinar, a via assinada —
 * pelo link de assinatura e pelo Portal do comprador — só abre com a entrada paga. Paga a entrada e com todos assinados,
 * o sistema manda a via pelo WhatsApp (uma vez). Concessão e contrato sem cobrança: liberado.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { assinaturaEventos, assinaturaSignatarios, cobrancas, contratos } from '../../drizzle/schema';

const ehPrimeiro = (l: { tipo: string; numero: number | string }) => l.tipo === 'avista' || (l.tipo === 'entrada' && Number(l.numero) === 1);
const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };

export interface SituacaoVia { liberada: boolean; motivo: string | null }

export async function situacaoDaVia(contratoId: number): Promise<SituacaoVia> {
  const d: any = await getDb();
  if (!d) return { liberada: true, motivo: null };
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) return { liberada: false, motivo: 'Contrato não encontrado' };
  if (json(c.simulacaoJson)?.concessao) return { liberada: true, motivo: null };
  if (c.entradaPagaNoAto === true || c.entradaPagaNoAto === 1) return { liberada: true, motivo: null };
  const cobs: any[] = await d.select({ tipo: cobrancas.tipo, numero: cobrancas.numero, status: cobrancas.status }).from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const primeira = cobs.find(ehPrimeiro);
  if (!primeira) return { liberada: false, motivo: 'A via assinada do contrato é liberada depois do pagamento da entrada.' };
  return primeira.status === 'paga' ? { liberada: true, motivo: null } : { liberada: false, motivo: 'A via assinada do contrato é liberada depois da compensação do pagamento da entrada.' };
}

/** Comprador(a)/cônjuge que já assinou e a via ainda não foi liberada? (os demais signatários veem sempre) */
export async function bloquearViaParaSignatario(contratoId: number, s: { papel: string; status: string }): Promise<string | null> {
  if (!['comprador', 'conjuge'].includes(s.papel) || s.status !== 'assinado') return null;
  const v = await situacaoDaVia(contratoId);
  return v.liberada ? null : v.motivo;
}

/** Entrada paga + todas as assinaturas: manda a via assinada ao(à) comprador(a) pelo WhatsApp (uma vez) */
export async function enviarViaAssinadaSeLiberada(contratoId: number): Promise<{ enviado: boolean; motivo?: string }> {
  const d: any = await getDb();
  if (!d) return { enviado: false, motivo: 'sem banco' };
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c || !c.manifestoArquivo) return { enviado: false, motivo: 'assinaturas incompletas' };
  if (!(await situacaoDaVia(contratoId)).liberada) return { enviado: false, motivo: 'entrada não paga' };
  const ja: any[] = await d.select({ id: assinaturaEventos.id }).from(assinaturaEventos).where(and(eq(assinaturaEventos.contratoId, contratoId), eq(assinaturaEventos.evento, 'via_assinada_enviada'))).limit(1);
  if (ja.length) return { enviado: false, motivo: 'já enviada' };
  const [s]: any[] = await d.select().from(assinaturaSignatarios).where(and(eq(assinaturaSignatarios.contratoId, contratoId), eq(assinaturaSignatarios.papel, 'comprador'))).limit(1);
  if (!s?.whatsapp) return { enviado: false, motivo: 'comprador sem WhatsApp' };
  const A = await import('../assinatura/servico');
  const link = `${A.urlPublica()}/c/${c.codigoVerificacao}`;
  try {
    await A.enviarMensagem(s.whatsapp, `Olá, ${String(s.nome).split(' ')[0]}! Pagamento da entrada confirmado. ✅\n\nA via assinada do contrato ${c.numero} (Chácara ${c.loteCodigo}) já está liberada para você, com o manifesto das assinaturas e o seu carnê: ${link}\n\nDúvidas: (99) 9 9101-1970.`);
    await A.evento(contratoId, s.id, 'via_assinada_enviada', { detalhe: { canal: 'whatsapp' } });
    return { enviado: true };
  } catch (e: any) {
    await A.evento(contratoId, s.id, 'erro', { detalhe: { etapa: 'via_assinada', msg: String(e?.message ?? e).slice(0, 200) } });
    return { enviado: false, motivo: String(e?.message ?? e).slice(0, 120) };
  }
}
