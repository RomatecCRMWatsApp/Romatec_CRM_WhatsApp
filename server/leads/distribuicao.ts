/**
 * Distribuição de leads (Leads › Distribuição): a secretária ou o administrador encaminha um ou vários leads
 * para um corretor, e todo encaminhamento fica registrado (leadEncaminhamentos) para o relatório — o manual
 * (tela de distribuição e troca de responsável no lead) e o automático (roleta: server/leads/sla.ts).
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEncaminhamentos, leadQualifications, users } from '../../drizzle/schema';

export class DistribuicaoErro extends Error { constructor(msg: string) { super(msg); this.name = 'DistribuicaoErro'; } }
export type OrigemEncaminhamento = 'manual' | 'automatico';
export type FiltroLeads = 'sem_responsavel' | 'aguardando' | 'recentes';

const DIA = 86_400_000;
/** Data → ISO; valor inválido (ex.: banco local) → null em vez de derrubar a lista */
const iso = (v: unknown): string | null => { if (v == null) return null; const t = new Date(v as any).getTime(); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new DistribuicaoErro('Banco indisponível');
  return d;
}

/** Grava o encaminhamento (nunca derruba quem chamou: o relatório é complementar) */
export async function registrarEncaminhamento(e: { leadId: number; deId?: number | null; paraId: number; porId?: number | null; origem: OrigemEncaminhamento; observacao?: string | null; quando?: Date }): Promise<void> {
  try {
    const d: any = await getDb();
    if (!d || !e.leadId || !e.paraId) return;
    await d.insert(leadEncaminhamentos).values({
      leadId: e.leadId, deId: e.deId ?? null, paraId: e.paraId, porId: e.porId ?? null, origem: e.origem,
      observacao: e.observacao?.trim().slice(0, 300) || null, criadoEm: e.quando ?? new Date(),
    } as any);
  } catch (err: any) { console.warn('[Distribuição] registro do encaminhamento:', err?.message); }
}

/** Equipe que pode receber lead (ativos, menos empreendedor) */
export async function equipe(): Promise<{ id: number; nome: string; recebeLeads: boolean }[]> {
  const d = await banco();
  const rows: any[] = await d.select({ id: users.id, name: users.name, perfil: (users as any).perfil, ativo: users.ativo, recebeLeads: (users as any).recebeLeads }).from(users);
  return rows.filter(u => u.ativo !== false && u.ativo !== 0 && u.perfil !== 'empreendedor')
    .map(u => ({ id: Number(u.id), nome: u.name || 'Sem nome', recebeLeads: u.recebeLeads === true || u.recebeLeads === 1 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Leads para a secretária distribuir */
export async function leadsParaDistribuir(filtro: FiltroLeads, busca = '', agora = Date.now()) {
  const d = await banco();
  const cond = filtro === 'sem_responsavel' ? isNull(leadQualifications.responsavelId)
    : filtro === 'aguardando' ? and(isNotNull(leadQualifications.aguardandoCorretorDesde), isNull(leadQualifications.atendidoAt))
    : gte(leadQualifications.createdAt, new Date(agora - 30 * DIA));
  const b = busca.trim();
  const digitos = b.replace(/\D/g, '');
  const filtroBusca = b ? or(sql`lower(${leadQualifications.nome}) like ${`%${b.toLowerCase()}%`}`, ...(digitos.length >= 4 ? [sql`${leadQualifications.phone} like ${`%${digitos}%`}`] : [])) : undefined;
  const rows: any[] = await d.select({
    id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, origem: leadQualifications.origem, origemCanal: leadQualifications.origemCanal,
    empreendimentoSlug: leadQualifications.empreendimentoSlug, loteCodigo: leadQualifications.loteCodigo, score: leadQualifications.score, etapa: leadQualifications.etapa,
    responsavelId: leadQualifications.responsavelId, aguardandoDesde: leadQualifications.aguardandoCorretorDesde, createdAt: leadQualifications.createdAt,
  }).from(leadQualifications).where(filtroBusca ? and(cond, filtroBusca) : cond).orderBy(desc(leadQualifications.createdAt)).limit(300);
  const nomes = new Map((await equipe()).map(u => [u.id, u.nome]));
  return rows.map(l => ({
    id: Number(l.id), nome: l.nome || 'Sem nome', telefone: `+${String(l.phone).replace(/\D/g, '')}`,
    origem: l.origemCanal || l.origem || null, empreendimento: l.empreendimentoSlug ?? null, lote: l.loteCodigo ?? null, score: l.score ?? null, etapa: l.etapa ?? null,
    responsavelId: l.responsavelId ? Number(l.responsavelId) : null, responsavel: l.responsavelId ? nomes.get(Number(l.responsavelId)) ?? 'Usuário removido' : null,
    aguardandoDesde: iso(l.aguardandoDesde), criadoEm: iso(l.createdAt),
  }));
}

/**
 * Encaminha os leads para o corretor: troca o responsável, registra no histórico e no relatório e avisa quem
 * recebeu (sininho, push e WhatsApp com o link de atender). Lead que já é dele não conta de novo.
 */
export async function encaminharManual(leadIds: number[], paraId: number, por: { id: number; nome: string }, observacao?: string | null) {
  const ids = Array.from(new Set(leadIds.filter(n => Number.isInteger(n) && n > 0)));
  if (!ids.length) throw new DistribuicaoErro('Escolha pelo menos um lead');
  if (ids.length > 200) throw new DistribuicaoErro('Até 200 leads por vez');
  const destino = (await equipe()).find(u => u.id === paraId);
  if (!destino) throw new DistribuicaoErro('Corretor não encontrado ou inativo');
  const d = await banco();
  const leads: any[] = await d.select({ id: leadQualifications.id, responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(inArray(leadQualifications.id, ids));
  if (!leads.length) throw new DistribuicaoErro('Leads não encontrados');
  const { registrarAtendimento } = await import('./sla');
  const { avisarEncaminhamento } = await import('./encaminhamento');
  let encaminhados = 0, jaEram = 0;
  for (const l of leads) {
    const de = l.responsavelId ? Number(l.responsavelId) : null;
    if (de === paraId) { jaEram++; continue; }
    await d.update(leadQualifications).set({ responsavelId: paraId, updatedAt: new Date() } as any).where(eq(leadQualifications.id, l.id));
    await registrarEncaminhamento({ leadId: Number(l.id), deId: de, paraId, porId: por.id, origem: 'manual', observacao });
    if (paraId !== por.id) {
      await registrarAtendimento(Number(l.id), { como: 'encaminhado', usuarioId: por.id, paraId }).catch(() => null);
      avisarEncaminhamento({ leadId: Number(l.id), paraId, porNome: por.nome }).catch(e => console.warn('[Distribuição] aviso:', e?.message));
    }
    encaminhados++;
  }
  return { encaminhados, jaEram, naoEncontrados: ids.length - leads.length, para: destino.nome };
}

/** "2026-11-04" no fuso de Açailândia (UTC−3) → instante */
export const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`);

export interface FiltroRelatorio { de: string; ate: string; paraId?: number | null; porId?: number | null; origem?: OrigemEncaminhamento | null }

export async function relatorioEncaminhamentos(f: FiltroRelatorio) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.de) || !/^\d{4}-\d{2}-\d{2}$/.test(f.ate)) throw new DistribuicaoErro('Período inválido');
  const ini = inicioDoDia(f.de), fim = new Date(inicioDoDia(f.ate).getTime() + DIA);
  if (fim <= ini) throw new DistribuicaoErro('A data final precisa ser depois da inicial');
  const d = await banco();
  const conds = [gte(leadEncaminhamentos.criadoEm, ini), lt(leadEncaminhamentos.criadoEm, fim)];
  if (f.paraId) conds.push(eq(leadEncaminhamentos.paraId, f.paraId));
  if (f.porId) conds.push(eq(leadEncaminhamentos.porId, f.porId));
  if (f.origem) conds.push(eq(leadEncaminhamentos.origem, f.origem));
  const rows: any[] = await d.select().from(leadEncaminhamentos).where(and(...conds)).orderBy(desc(leadEncaminhamentos.criadoEm), desc(leadEncaminhamentos.id)).limit(5000);
  const leadIds = Array.from(new Set(rows.map(r => Number(r.leadId))));
  const leads: any[] = leadIds.length ? await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, responsavelId: leadQualifications.responsavelId, etapa: leadQualifications.etapa, empreendimentoSlug: leadQualifications.empreendimentoSlug })
    .from(leadQualifications).where(inArray(leadQualifications.id, leadIds)) : [];
  const L = new Map(leads.map(l => [Number(l.id), l]));
  const todos: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const nome = (id: unknown) => (id ? todos.find(u => Number(u.id) === Number(id))?.name ?? 'Usuário removido' : null);
  const itens = rows.map(r => {
    const l = L.get(Number(r.leadId));
    return {
      id: Number(r.id), quando: iso(r.criadoEm) ?? new Date(0).toISOString(), origem: r.origem as OrigemEncaminhamento, leadId: Number(r.leadId),
      lead: l?.nome || 'Sem nome', telefone: l ? `+${String(l.phone).replace(/\D/g, '')}` : null, empreendimento: l?.empreendimentoSlug ?? null, etapa: l?.etapa ?? null,
      de: nome(r.deId), para: nome(r.paraId) ?? '—', paraId: Number(r.paraId), por: r.origem === 'automatico' ? 'Automático (roleta)' : nome(r.porId),
      continuaCom: l ? (Number(l.responsavelId) === Number(r.paraId) ? 'sim' : 'não') : '—', observacao: r.observacao ?? null,
    };
  });
  const porCorretor = new Map<string, { corretor: string; total: number; manual: number; automatico: number }>();
  for (const i of itens) {
    const c = porCorretor.get(i.para) ?? { corretor: i.para, total: 0, manual: 0, automatico: 0 };
    c.total++; c[i.origem]++;
    porCorretor.set(i.para, c);
  }
  return {
    itens,
    resumo: { total: itens.length, manual: itens.filter(i => i.origem === 'manual').length, automatico: itens.filter(i => i.origem === 'automatico').length },
    porCorretor: Array.from(porCorretor.values()).sort((a, b) => b.total - a.total),
  };
}

/** CSV (separador ;, para abrir direto no Excel em português) */
export function csvRelatorio(itens: Awaited<ReturnType<typeof relatorioEncaminhamentos>>['itens']): string {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const dataBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
  const cab = ['Data e hora', 'Tipo', 'Lead', 'Telefone', 'Empreendimento', 'De', 'Para', 'Encaminhado por', 'Continua com ele', 'Observação'];
  const linhas = itens.map(i => [dataBr(i.quando), i.origem === 'manual' ? 'Manual' : 'Automático', i.lead, i.telefone, i.empreendimento, i.de ?? 'Sem responsável', i.para, i.por, i.continuaCom, i.observacao].map(esc).join(';'));
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n');
}
