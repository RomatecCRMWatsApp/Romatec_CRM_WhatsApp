/**
 * Prazo de confirmação do lead encaminhado (manual ou roleta): o corretor tem 6 h para tocar em "Confirmar que recebi".
 * Sem confirmação, o sistema fecha o encaminhamento como "sem_confirmacao", tira o corretor de responsável (o lead volta
 * para Distribuição › Não encaminhados), anula os links do aviso dele, manda a ele uma mensagem de "perdeu o lead" e
 * avisa o escritório. Roda junto com o SLA (a cada 5 min).
 */
import { and, eq, isNull, lt } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEncaminhamentos, leadQualifications, users } from '../../drizzle/schema';
import { PRAZO_CONFIRMACAO_HORAS } from '../../shared/distribuicaoLeads';
import { LINHA_PUBLICIDADE } from '../../shared/escritorio';
import { appUrl } from './config';

const HORA = 3600_000;
const primeiroNome = (n: unknown) => { const p = String(n ?? '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; };

/** Mensagem ao corretor que perdeu o lead por não confirmar o recebimento */
export function textoLeadPerdido(o: { corretor: string; cliente: string; horas?: number }): string {
  const h = o.horas ?? PRAZO_CONFIRMACAO_HORAS;
  const nome = primeiroNome(o.corretor);
  return [
    `⏰ *Ih${nome ? `, ${nome}` : ''}… o tempo acabou!*`,
    '',
    `O lead *${o.cliente || 'sem nome'}* ficou ${h} horas esperando você confirmar o recebimento — e a confirmação não chegou. 😕`,
    '',
    '🏃💨 *Que pena, esse lead escapou por tempo de recebimento!*',
    'Ele já voltou para o CRM e vai ser encaminhado para outro corretor.',
    '',
    '💡 *Dica de ouro:* chegou lead, toque em "✅ Confirmar que recebi" — leva 1 segundinho e garante o cliente com você.',
    '',
    'Bora que o próximo é seu! 💪🏡',
    LINHA_PUBLICIDADE,
  ].join('\n');
}

/** Aviso ao escritório: o lead voltou e espera um novo corretor */
export function textoLeadDevolvido(o: { corretor: string; cliente: string; telefone: string; horas?: number }): string {
  return [
    '🔁 *Lead voltou para o CRM*',
    `👤 ${o.cliente || 'Sem nome'} · +${String(o.telefone).replace(/\D/g, '')}`,
    `${o.corretor || 'O corretor'} não confirmou o recebimento em ${o.horas ?? PRAZO_CONFIRMACAO_HORAS} h — os links do aviso dele foram cancelados.`,
    'O lead está em Distribuição › Não encaminhados, pronto para um novo corretor.',
    `🔗 ${appUrl()}/leads/distribuicao`,
  ].join('\n');
}

export async function expirarEncaminhamentos(agora = Date.now(), horas = PRAZO_CONFIRMACAO_HORAS): Promise<number> {
  const d: any = await getDb();
  if (!d) return 0;
  const limite = new Date(agora - horas * HORA);
  const vencidos: any[] = await d.select().from(leadEncaminhamentos)
    .where(and(isNull(leadEncaminhamentos.recebidoEm), isNull(leadEncaminhamentos.desfecho), lt(leadEncaminhamentos.criadoEm, limite))).limit(100);
  if (!vencidos.length) return 0;
  const pessoas: any[] = await d.select({ id: users.id, name: users.name, telefone: users.telefone, role: users.role, perfil: (users as any).perfil, ativo: users.ativo }).from(users);
  const P = new Map(pessoas.map(u => [Number(u.id), u]));
  const escritorio = (u: any) => !!u && (u.role === 'admin' || u.perfil === 'admin' || u.perfil === 'secretario');
  const { enviarTexto } = await import('./zapiClient');
  const whats = async (tel: unknown, texto: string) => {
    const f = String(tel ?? '').replace(/\D/g, '');
    if (f.length < 10) return;
    await enviarTexto(f.startsWith('55') ? f : `55${f}`, texto).catch((e: any) => console.warn('[Prazo de confirmação] WhatsApp:', e?.message));
  };
  let n = 0;
  for (const e of vencidos) {
    const corretor = P.get(Number(e.paraId));
    // Encaminhado ao próprio escritório não vence (é a fila da secretária)
    if (escritorio(corretor)) continue;
    // Reserva: com dois servidores no ar, só um fecha e avisa
    const r: any = await d.update(leadEncaminhamentos).set({ desfecho: 'sem_confirmacao', desfechoEm: new Date(agora), desfechoMotivo: `Sem confirmação em ${horas} h` } as any)
      .where(and(eq(leadEncaminhamentos.id, e.id), isNull(leadEncaminhamentos.desfecho), isNull(leadEncaminhamentos.recebidoEm)));
    const afetadas = Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? 1);
    if (!afetadas) continue;
    const [lead]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.id, e.leadId)).limit(1);
    if (!lead) continue;
    // Só tira o corretor se o lead ainda estiver com ele (não desfaz uma troca feita depois)
    if (Number(lead.responsavelId) === Number(e.paraId)) {
      await d.update(leadQualifications).set({ responsavelId: null, aguardandoCorretorDesde: null, alertaSlaNivel: 0, updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, lead.id));
    }
    n++;
    const cliente = String(lead.nome || '');
    console.log(`[Prazo de confirmação] Lead ${lead.id} voltou ao escritório: ${corretor?.name ?? e.paraId} não confirmou em ${horas} h`);
    if (corretor) await whats(corretor.telefone, textoLeadPerdido({ corretor: String(corretor.name ?? ''), cliente, horas }));
    const aviso = textoLeadDevolvido({ corretor: String(corretor?.name ?? ''), cliente, telefone: String(lead.phone ?? ''), horas });
    for (const u of pessoas.filter(x => (x.role === 'admin' || x.perfil === 'admin') && x.ativo !== false && x.ativo !== 0)) await whats(u.telefone, aviso);
    const { notificarLeadDevolvido } = await import('../notificacoes');
    await notificarLeadDevolvido({ leadId: Number(lead.id), cliente, corretor: String(corretor?.name ?? ''), horas }).catch(() => undefined);
  }
  return n;
}
