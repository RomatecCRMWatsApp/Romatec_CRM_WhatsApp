/**
 * Aviso direto no WhatsApp do José (NOTIFY_PHONES, padrão o celular dele) quando o robô percebe que o cliente quer:
 * qualificação completa (finalidade, prazo e pagamento), pedido de visita ou de fechamento. Um aviso por motivo por
 * lead a cada 24 h (o evento fica no histórico do lead); nunca derruba o atendimento.
 */
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEventos } from '../../drizzle/schema';
import { formatarTelefone } from '../../shared/cartaoVendas';

export type MotivoAviso = 'qualificado' | 'visita' | 'fechar';
const TITULO: Record<MotivoAviso, string> = {
  qualificado: '✅ *Lead qualificado pelo robô*',
  visita: '🚗 *Cliente pediu visita*',
  fechar: '🔥 *Cliente quer fechar*',
};

/** Texto do aviso (regra pura) */
export function textoAviso(p: {
  motivo: MotivoAviso; nome?: string | null; telefone: string; empreendimento: string; resumo?: string | null;
  quente?: boolean; detalhe?: string | null; leadId: number; base: string; responsavel?: string | null;
}): string {
  const fone = String(p.telefone).replace(/\D/g, '');
  return [
    `${TITULO[p.motivo]} · ${p.empreendimento}`,
    '',
    `👤 ${p.nome || 'Cliente'} · ${formatarTelefone(fone) ?? `+${fone}`}`,
    p.resumo ? `📋 ${p.resumo}` : null,
    p.quente ? '🔥 Quer fechar em até 3 meses' : p.motivo === 'qualificado' ? '🌱 Sem pressa: o robô segue mandando novidades' : null,
    p.detalhe ? `💬 ${p.detalhe}` : null,
    p.responsavel ? `🧑‍💼 Responsável: ${p.responsavel}` : null,
    '',
    `Falar com o cliente: https://wa.me/${fone}`,
    `Ver no CRM: ${p.base}/leads/lead/${p.leadId}`,
  ].filter(l => l !== null).join('\n');
}

export async function avisarNoWhatsapp(p: Omit<Parameters<typeof textoAviso>[0], 'base'>, agora = Date.now()): Promise<boolean> {
  try {
    const d: any = await getDb();
    const tipo = `aviso_whatsapp_${p.motivo}`;
    if (d) {
      const [ja]: any[] = await d.select({ id: leadEventos.id }).from(leadEventos)
        .where(and(eq(leadEventos.leadId, p.leadId), eq(leadEventos.tipo, tipo), gte(leadEventos.createdAt, new Date(agora - 24 * 3_600_000)))).limit(1);
      if (ja) return false;
    }
    const { telefonesNotificacao, appUrl } = await import('../leads/config');
    const { enviarTexto } = await import('../leads/zapiClient');
    const texto = textoAviso({ ...p, base: appUrl() });
    for (const f of telefonesNotificacao()) await enviarTexto(f, texto);
    if (d) await d.insert(leadEventos).values({ leadId: p.leadId, tipo, dados: { motivo: p.motivo }, createdAt: new Date(agora) } as any).catch(() => {});
    return true;
  } catch (e: any) {
    console.warn('[Auto-resposta] aviso no WhatsApp do José:', e?.message);
    return false;
  }
}
