/**
 * Lead encaminhado (secretária ou administrador trocou o responsável para um corretor): quem recebeu é avisado no
 * sininho/push e no WhatsApp, com o link "Atender no WhatsApp" (que também conta como atendimento).
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos, leadQualifications, users } from '../../drizzle/schema';
import { appUrl } from './config';
import { linkWhatsAppAtendido } from './sla';
import { formatarTelefone } from './notificacao';

export function textoEncaminhamento(o: { leadId: number; cliente: string; telefone: string; porNome: string; empreendimento?: string | null }): string {
  return [
    `📨 *Lead encaminhado para você* por ${o.porNome}`,
    `👤 ${o.cliente || 'Sem nome'} · ${formatarTelefone(o.telefone)}`,
    o.empreendimento ? `🏡 ${o.empreendimento}` : null,
    `💬 Atender no WhatsApp: ${linkWhatsAppAtendido(o.leadId)}`,
    `🔗 Ficha no CRM: ${appUrl()}/leads/lead/${o.leadId}`,
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
  await enviarTexto(fone.startsWith('55') ? fone : `55${fone}`, textoEncaminhamento({
    leadId: o.leadId, cliente: String(l.nome ?? ''), telefone: String(l.phone ?? ''), porNome: o.porNome, empreendimento: emp?.nome ?? null,
  })).catch(e => console.warn('[Encaminhamento] WhatsApp:', e?.message));
}
