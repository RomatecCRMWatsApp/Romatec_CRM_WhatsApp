/**
 * Números que nunca viram lead: usuários do sistema (corretor, secretária, admin, empreendedor),
 * corretores externos, o número da empresa e o do próprio WhatsApp do CRM.
 */
import { normalizePhoneBR } from '../../shared/telefone';
import { numeroWhatsAppLeads, telefonesNotificacao } from './config';

/** Mesma chave para "(99) 9 9181-1246", "5599991811246" e o número antigo sem o 9; fixo: DDD + número */
export function chaveTelefone(raw?: string | null): string {
  const d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length < 8) return '';
  return normalizePhoneBR(d) ?? d.replace(/^55(?=\d{10}$)/, '');
}

/** chave do telefone → de quem é (para a lista de limpeza) */
export async function telefonesDaEquipe(): Promise<Map<string, string>> {
  const { getDb } = await import('../db');
  const { users, corretoresExternos, companyConfig } = await import('../../drizzle/schema');
  const db: any = await getDb();
  const lista: { t?: string | null; quem: string }[] = [
    { t: process.env.CEO_WHATSAPP_PHONE, quem: 'CEO' },
    { t: numeroWhatsAppLeads(), quem: 'WhatsApp do CRM' },
    ...telefonesNotificacao().map(t => ({ t, quem: 'Avisos de lead (José)' })),
  ];
  if (db) {
    const [us, ext, emp] = await Promise.all([
      db.select({ t: users.telefone, nome: users.name }).from(users),
      db.select({ t: corretoresExternos.telefone, nome: corretoresExternos.nome }).from(corretoresExternos).catch(() => []),
      db.select({ t: companyConfig.phone }).from(companyConfig).catch(() => []),
    ]);
    for (const r of us) lista.push({ t: r.t, quem: `Usuário: ${r.nome || 'sem nome'}` });
    for (const r of ext) lista.push({ t: r.t, quem: `Corretor externo: ${r.nome}` });
    for (const r of emp) lista.push({ t: r.t, quem: 'Telefone da empresa' });
  }
  const m = new Map<string, string>();
  for (const { t, quem } of lista) {
    const k = chaveTelefone(t);
    if (k && !m.has(k)) m.set(k, quem);
  }
  return m;
}

export async function ehNumeroDaEquipe(phone: string): Promise<boolean> {
  const k = chaveTelefone(phone);
  return !!k && (await telefonesDaEquipe()).has(k);
}

/** Leads já criados a partir de número da equipe (só leitura: a limpeza é decisão do José) */
export async function leadsDaEquipe() {
  const { getDb } = await import('../db');
  const { leadQualifications } = await import('../../drizzle/schema');
  const db: any = await getDb();
  if (!db) return [];
  const equipe = await telefonesDaEquipe();
  const leads: any[] = await db.select({
    id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone,
    stage: leadQualifications.stage, createdAt: leadQualifications.createdAt,
  }).from(leadQualifications);
  return leads
    .filter(l => equipe.has(chaveTelefone(l.phone)))
    .map(l => ({ ...l, quem: equipe.get(chaveTelefone(l.phone))! }));
}
