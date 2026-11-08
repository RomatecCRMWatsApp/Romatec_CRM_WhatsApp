/**
 * Lead encaminhado (secretária ou administrador trocou o responsável para um corretor): quem recebeu é avisado no
 * sininho/push e no WhatsApp, com o link "Atender no WhatsApp" (que também conta como atendimento).
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos, leadQualifications, users } from '../../drizzle/schema';
import { appUrl } from './config';
import { linkRecebido, linkWhatsAppAtendido } from './sla';
import { formatarTelefone } from './notificacao';

export function textoEncaminhamento(o: { leadId: number; cliente: string; telefone: string; porNome: string; empreendimento?: string | null; encaminhamentoId?: number | null; paraId?: number | null }): string {
  return [
    `📨 *Lead encaminhado para você* por ${o.porNome}`,
    `👤 ${o.cliente || 'Sem nome'} · ${formatarTelefone(o.telefone)}`,
    o.empreendimento ? `🏡 ${o.empreendimento}` : null,
    `💬 Atender no WhatsApp: ${linkWhatsAppAtendido(o.leadId, o.paraId ?? null)}`,
    `🔗 Ficha no CRM: ${appUrl()}/leads/lead/${o.leadId}`,
    o.encaminhamentoId ? `✅ Confirmar que recebi (1 toque): ${linkRecebido(o.encaminhamentoId)}` : `✅ Confirme que recebeu: ${appUrl()}/leads/recebidos`,
  ].filter(Boolean).join('\n');
}

export async function avisarEncaminhamento(o: { leadId: number; paraId: number; porNome: string }): Promise<void> {
  const d: any = await getDb();
  if (!d) return;
  const [l]: any[] = await d.select({ nome: leadQualifications.nome, phone: leadQualifications.phone, empreendimentoSlug: leadQualifications.empreendimentoSlug })
    .from(leadQualifications).where(eq(leadQualifications.id, o.leadId)).limit(1);
  const [u]: any[] = await d.select({ telefone: users.telefone, name: users.name }).from(users).where(eq(users.id, o.paraId)).limit(1);
  if (!l || !u) return;
  const [emp]: any[] = l.empreendimentoSlug
    ? await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, l.empreendimentoSlug)).limit(1)
    : [];
  const { notificarAtendimento } = await import('../notificacoes');
  await notificarAtendimento({
    leadId: o.leadId, responsavelId: o.paraId, cliente: String(l.nome ?? 'Cliente'), empreendimentoId: emp?.id ?? null,
    empreendimentoSlug: l.empreendimentoSlug ?? null, empreendimentoNome: emp?.nome ?? null, motivo: `Encaminhado para você por ${o.porNome}`,
  }).catch(e => console.warn('[Encaminhamento] push:', e?.message));
  const fone = String(u.telefone ?? '').replace(/\D/g, '');
  if (fone.length < 10) return;
  const { enviarTexto } = await import('./zapiClient');
  const { leadEncaminhamentos } = await import('../../drizzle/schema');
  const { and, desc, isNull } = await import('drizzle-orm');
  const [aberto]: any[] = await d.select({ id: leadEncaminhamentos.id }).from(leadEncaminhamentos)
    .where(and(eq(leadEncaminhamentos.leadId, o.leadId), eq(leadEncaminhamentos.paraId, o.paraId), isNull(leadEncaminhamentos.desfecho))).orderBy(desc(leadEncaminhamentos.id)).limit(1);
  await enviarTexto(fone.startsWith('55') ? fone : `55${fone}`, textoEncaminhamento({
    leadId: o.leadId, cliente: String(l.nome ?? ''), telefone: String(l.phone ?? ''), porNome: o.porNome, empreendimento: emp?.nome ?? null, encaminhamentoId: aberto?.id ?? null, paraId: o.paraId,
  })).catch(e => console.warn('[Encaminhamento] WhatsApp:', e?.message));
}

/** Avisa quem tinha o lead que ele passou para outro corretor (os links do aviso anterior deixam de valer) */
export async function avisarRetirada(o: { leadId: number; deId: number; paraNome: string }): Promise<void> {
  const d: any = await getDb();
  if (!d) return;
  const [l]: any[] = await d.select({ nome: leadQualifications.nome }).from(leadQualifications).where(eq(leadQualifications.id, o.leadId)).limit(1);
  const [u]: any[] = await d.select({ telefone: users.telefone, perfil: (users as any).perfil, role: users.role }).from(users).where(eq(users.id, o.deId)).limit(1);
  if (!l || !u || u.role === 'admin' || u.perfil === 'admin' || u.perfil === 'secretario') return;
  const fone = String(u.telefone ?? '').replace(/\D/g, '');
  if (fone.length < 10) return;
  const { enviarTexto } = await import('./zapiClient');
  await enviarTexto(fone.startsWith('55') ? fone : `55${fone}`,
    `🔁 O lead *${String(l.nome || 'Sem nome')}* foi passado para ${o.paraNome} pelo escritório, porque o recebimento não foi confirmado.\nOs links do aviso anterior não valem mais. Dúvidas, fale com o escritório.`,
  ).catch(e => console.warn('[Encaminhamento] aviso de troca:', e?.message));
}
