/**
 * Página pública do Pix de uma cobrança (/pix/<token>, botão "copiar o Pix" do boleto e do carnê).
 * Mostra só o primeiro nome, a chácara, a parcela, o valor, o vencimento e o Pix — sem CPF nem endereço.
 * O Pix é relido do Asaas a cada abertura (pode mudar depois do vencimento) e gravado na cobrança.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, empreendimentos } from '../../drizzle/schema';
import { cobrancaDoTokenPix } from './links';
import { configAsaas, dadosDePagamento, type FetchFn } from './asaas';
import { rotuloParcela } from './dados';

export async function paginaPix(token: string, o: { fetchFn?: FetchFn } = {}) {
  const id = cobrancaDoTokenPix(token);
  if (!id) return null;
  const d: any = await getDb();
  const [c]: any[] = await d.select().from(cobrancas).where(eq(cobrancas.id, id)).limit(1);
  if (!c) return null;
  const [ct]: any[] = await d.select({ numero: contratos.numero, lote: contratos.loteCodigo, empreendimentoId: contratos.empreendimentoId }).from(contratos).where(eq(contratos.id, c.contratoId)).limit(1);
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, ct?.empreendimentoId ?? 0)).limit(1);
  const { pessoasDoContrato } = await import('./servico');
  const { comprador } = await pessoasDoContrato(Number(c.contratoId)).catch(() => ({ comprador: null as any }));
  const base = {
    nome: String(comprador?.nome ?? '').trim().split(/\s+/)[0] || 'Cliente', empreendimento: String(emp?.nome ?? ''), lote: String(ct?.lote ?? ''),
    parcela: rotuloParcela({ tipo: c.tipo, numero: Number(c.numero), total: Number(c.total) } as any), valor: Number(c.valor), vencimento: String(c.vencimento).slice(0, 10),
    boletoUrl: c.bankSlipUrl ?? null,
  };
  if (c.status === 'paga') return { ...base, situacao: 'paga' as const, pagoEm: c.pagoEm ? String(c.pagoEm).slice(0, 10) : null, pix: null, qrBase64: null };
  if (['cancelada', 'estornada'].includes(c.status)) return { ...base, situacao: 'cancelada' as const, pix: null, qrBase64: null };
  let pix: string | null = c.pixPayload ?? null, qrBase64: string | null = null;
  const cfg = configAsaas(process.env, String(emp?.slug ?? 'bom-jardims'));
  if (cfg && c.asaasPaymentId) {
    try {
      const novo = await dadosDePagamento(cfg, c.asaasPaymentId, o.fetchFn);
      if (novo.pixPayload) {
        pix = novo.pixPayload; qrBase64 = novo.pixQrBase64 ?? null;
        if (novo.pixPayload !== c.pixPayload) await d.update(cobrancas).set({ pixPayload: novo.pixPayload } as any).where(eq(cobrancas.id, c.id));
      }
    } catch { /* Asaas fora: vale o Pix guardado */ }
  }
  return { ...base, situacao: pix ? 'aberta' as const : 'sem_pix' as const, pix, qrBase64 };
}
