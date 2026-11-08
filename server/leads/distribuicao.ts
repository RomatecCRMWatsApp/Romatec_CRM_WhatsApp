/**
 * Distribuição de leads (Leads › Distribuição): a secretária ou o administrador encaminha um ou vários leads
 * para um corretor, e todo encaminhamento fica registrado (leadEncaminhamentos) para o relatório — o manual
 * (tela de distribuição e troca de responsável no lead) e o automático (roleta: server/leads/sla.ts).
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { leadEncaminhamentos, leadQualifications, users } from '../../drizzle/schema';
import { DESFECHOS_CORRETOR, MOTIVO_PERDA_DO_DESFECHO, ROTULO_DESFECHO, ROTULO_SITUACAO, situacaoEncaminhamento, type Desfecho, type DesfechoCorretor } from '../../shared/distribuicaoLeads';

export class DistribuicaoErro extends Error { constructor(msg: string) { super(msg); this.name = 'DistribuicaoErro'; } }
export type OrigemEncaminhamento = 'manual' | 'automatico';
export type FiltroLeads = 'nao_encaminhados' | 'sem_responsavel' | 'aguardando' | 'recentes' | 'todos';

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
    // O lead mudou de mãos: o encaminhamento anterior em aberto fecha como "repassado"
    await d.update(leadEncaminhamentos).set({ desfecho: 'repassado', desfechoEm: e.quando ?? new Date(), desfechoPor: e.porId ?? null } as any)
      .where(and(eq(leadEncaminhamentos.leadId, e.leadId), isNull(leadEncaminhamentos.desfecho)));
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

/**
 * Leads para a secretária distribuir. "nao_encaminhados" (padrão): todo lead ativo — quente, morno ou frio — que ainda
 * não foi encaminhado a um corretor (sem responsável, ou só com o administrador/escritório como dono), do mais novo
 * para o mais antigo. Descartados, sem interesse, perdidos e bloqueados ficam fora (só "todos" mostra tudo).
 */
export async function leadsParaDistribuir(filtro: FiltroLeads, busca = '', agora = Date.now()) {
  const d = await banco();
  const cond = filtro === 'sem_responsavel' ? isNull(leadQualifications.responsavelId)
    : filtro === 'aguardando' ? and(isNotNull(leadQualifications.aguardandoCorretorDesde), isNull(leadQualifications.atendidoAt))
    : filtro === 'recentes' ? gte(leadQualifications.createdAt, new Date(agora - 30 * DIA))
    : undefined;
  const b = busca.trim();
  const digitos = b.replace(/\D/g, '');
  const filtroBusca = b ? or(sql`lower(${leadQualifications.nome}) like ${`%${b.toLowerCase()}%`}`, ...(digitos.length >= 4 ? [sql`${leadQualifications.phone} like ${`%${digitos}%`}`] : [])) : undefined;
  const onde = cond && filtroBusca ? and(cond, filtroBusca) : cond ?? filtroBusca;
  const q = d.select({
    id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, origem: leadQualifications.origem, origemCanal: leadQualifications.origemCanal,
    empreendimentoSlug: leadQualifications.empreendimentoSlug, loteCodigo: leadQualifications.loteCodigo, score: leadQualifications.score, etapa: leadQualifications.etapa,
    stage: leadQualifications.stage, blockedUntil: leadQualifications.blockedUntil,
    responsavelId: leadQualifications.responsavelId, aguardandoDesde: leadQualifications.aguardandoCorretorDesde, createdAt: leadQualifications.createdAt,
  }).from(leadQualifications);
  let rows: any[] = await (onde ? q.where(onde) : q).orderBy(desc(leadQualifications.createdAt)).limit(1000);
  const { leadInativo } = await import('./inativo');
  if (filtro !== 'todos') rows = rows.filter(l => !leadInativo(l, agora));
  if (filtro === 'nao_encaminhados') {
    const escritorio = await idsDoEscritorio(d);
    const ids = rows.map(l => Number(l.id));
    const enviados = new Set<number>();
    for (let i = 0; i < ids.length; i += 500) {
      const parte: any[] = await d.select({ leadId: leadEncaminhamentos.leadId, paraId: leadEncaminhamentos.paraId }).from(leadEncaminhamentos).where(inArray(leadEncaminhamentos.leadId, ids.slice(i, i + 500)));
      for (const e of parte) if (!escritorio.has(Number(e.paraId))) enviados.add(Number(e.leadId));
    }
    rows = rows.filter(l => !enviados.has(Number(l.id)) && (!l.responsavelId || escritorio.has(Number(l.responsavelId))));
  }
  const nomes = new Map((await equipe()).map(u => [u.id, u.nome]));
  return rows.slice(0, 500).map(l => ({
    id: Number(l.id), nome: l.nome || 'Sem nome', telefone: `+${String(l.phone).replace(/\D/g, '')}`,
    origem: l.origemCanal || l.origem || null, empreendimento: l.empreendimentoSlug ?? null, lote: l.loteCodigo ?? null, score: l.score ?? null, etapa: l.etapa ?? null,
    responsavelId: l.responsavelId ? Number(l.responsavelId) : null, responsavel: l.responsavelId ? nomes.get(Number(l.responsavelId)) ?? 'Usuário removido' : null,
    aguardandoDesde: iso(l.aguardandoDesde), criadoEm: iso(l.createdAt),
  }));
}

/**
 * Tira o escritório (administrador) de dono dos leads ainda não encaminhados: eles ficam "sem responsável",
 * esperando a secretária/escritório encaminhar a um corretor de plantão. Não mexe em lead já de corretor.
 */
export async function liberarDoEscritorio(por: { id: number }) {
  const d = await banco();
  const escritorio = await idsDoEscritorio(d);
  const alvos = (await leadsParaDistribuir('nao_encaminhados')).filter(l => l.responsavelId && escritorio.has(l.responsavelId));
  const ids = alvos.map(l => l.id);
  for (let i = 0; i < ids.length; i += 200) {
    await d.update(leadQualifications).set({ responsavelId: null, updatedAt: new Date() } as any).where(and(inArray(leadQualifications.id, ids.slice(i, i + 200)), inArray(leadQualifications.responsavelId, Array.from(escritorio))));
  }
  console.log(`[Distribuição] ${ids.length} lead(s) sem o escritório como dono (por ${por.id})`);
  return { liberados: ids.length };
}

/**
 * Escritório (administrador e secretária): dono "padrão" quando ninguém foi escolhido — lead só com eles conta como
 * não encaminhado (ex.: conversa do Instagram que a secretária virou lead continua na lista para ir a um corretor)
 */
async function idsDoEscritorio(d: any): Promise<Set<number>> {
  const us: any[] = await d.select({ id: users.id, role: users.role, perfil: (users as any).perfil }).from(users);
  return new Set(us.filter(u => u.role === 'admin' || u.perfil === 'admin' || u.perfil === 'secretario').map(u => Number(u.id)));
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
    if (de === paraId) {
      // Já é dele: só registra (e pede a confirmação) se ainda não há encaminhamento em aberto — ex.: lead de antes do controle
      const [aberto]: any[] = await d.select({ id: leadEncaminhamentos.id }).from(leadEncaminhamentos)
        .where(and(eq(leadEncaminhamentos.leadId, l.id), eq(leadEncaminhamentos.paraId, paraId), isNull(leadEncaminhamentos.desfecho))).limit(1);
      if (aberto) { jaEram++; continue; }
    } else {
      await d.update(leadQualifications).set({ responsavelId: paraId, updatedAt: new Date() } as any).where(eq(leadQualifications.id, l.id));
    }
    await registrarEncaminhamento({ leadId: Number(l.id), deId: de, paraId, porId: por.id, origem: 'manual', observacao });
    // Quem tinha o lead fica sabendo da troca (e que os links do aviso dele não valem mais)
    if (de && de !== paraId && de !== por.id) {
      import('./encaminhamento').then(m => m.avisarRetirada({ leadId: Number(l.id), deId: de, paraNome: destino.nome })).catch(e => console.warn('[Distribuição] aviso de troca:', e?.message));
    }
    if (paraId !== por.id) {
      if (de !== paraId) await registrarAtendimento(Number(l.id), { como: 'encaminhado', usuarioId: por.id, paraId }).catch(() => null);
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
      recebidoEm: iso(r.recebidoEm), situacao: situacaoEncaminhamento(r), desfecho: (r.desfecho ?? null) as Desfecho | null,
      desfechoMotivo: r.desfechoMotivo ?? null, desfechoEm: iso(r.desfechoEm),
    };
  });
  const porCorretor = new Map<string, { corretor: string; total: number; manual: number; automatico: number; aguardando: number; confirmados: number; vendidos: number; perdidos: number }>();
  for (const i of itens) {
    const c = porCorretor.get(i.para) ?? { corretor: i.para, total: 0, manual: 0, automatico: 0, aguardando: 0, confirmados: 0, vendidos: 0, perdidos: 0 };
    c.total++; c[i.origem]++;
    if (i.situacao === 'aguardando_confirmacao') c.aguardando++;
    if (i.recebidoEm) c.confirmados++;
    if (i.desfecho === 'vendido') c.vendidos++;
    else if (i.desfecho && i.desfecho !== 'repassado') c.perdidos++;
    porCorretor.set(i.para, c);
  }
  return {
    itens,
    resumo: {
      total: itens.length, manual: itens.filter(i => i.origem === 'manual').length, automatico: itens.filter(i => i.origem === 'automatico').length,
      aguardando: itens.filter(i => i.situacao === 'aguardando_confirmacao').length, vendidos: itens.filter(i => i.desfecho === 'vendido').length,
    },
    porCorretor: Array.from(porCorretor.values()).sort((a, b) => b.total - a.total),
  };
}

/** CSV (separador ;, para abrir direto no Excel em português) */
export function csvRelatorio(itens: Awaited<ReturnType<typeof relatorioEncaminhamentos>>['itens']): string {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const dataBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
  const cab = ['Data e hora', 'Tipo', 'Lead', 'Telefone', 'Empreendimento', 'De', 'Para', 'Encaminhado por', 'Continua com ele', 'Observação', 'Situação', 'Recebimento confirmado em', 'Desfecho', 'Motivo', 'Finalizado em'];
  const linhas = itens.map(i => [dataBr(i.quando), i.origem === 'manual' ? 'Manual' : 'Automático', i.lead, i.telefone, i.empreendimento, i.de ?? 'Sem responsável', i.para, i.por, i.continuaCom, i.observacao,
    ROTULO_SITUACAO[i.situacao], i.recebidoEm ? dataBr(i.recebidoEm) : '', i.desfecho ? ROTULO_DESFECHO[i.desfecho] : '', i.desfechoMotivo, i.desfechoEm ? dataBr(i.desfechoEm) : ''].map(esc).join(';'));
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n');
}

// ─── Lado do corretor: confirmar recebimento e informar o desfecho ───────────────────────────────────────────

async function encaminhamentoDo(d: any, id: number) {
  const [e]: any[] = await d.select().from(leadEncaminhamentos).where(eq(leadEncaminhamentos.id, id)).limit(1);
  if (!e) throw new DistribuicaoErro('Encaminhamento não encontrado');
  return e;
}

/** Corretor confirma que recebeu o lead (só quem recebeu) */
export async function confirmarRecebimento(id: number, usuarioId: number, agora = new Date()) {
  const d = await banco();
  const e = await encaminhamentoDo(d, id);
  if (Number(e.paraId) !== usuarioId) throw new DistribuicaoErro('Este lead foi encaminhado para outra pessoa');
  if (e.desfecho === 'repassado') throw new DistribuicaoErro('Este lead foi passado para outro corretor');
  if (!e.recebidoEm) await d.update(leadEncaminhamentos).set({ recebidoEm: agora } as any).where(eq(leadEncaminhamentos.id, id));
  return { ok: true as const };
}

/**
 * Corretor (ou o escritório) informa o desfecho: desistiu, sem contato, não qualificado, comprou em outro lugar.
 * Fecha o encaminhamento e leva o lead para "Perdido" no funil com o motivo. Venda o sistema fecha sozinho.
 */
export async function finalizarPeloCorretor(id: number, autor: { id: number; escritorio: boolean }, desfecho: DesfechoCorretor, motivo?: string | null, agora = new Date()) {
  if (!(DESFECHOS_CORRETOR as readonly string[]).includes(desfecho)) throw new DistribuicaoErro('Desfecho inválido');
  const d = await banco();
  const e = await encaminhamentoDo(d, id);
  if (Number(e.paraId) !== autor.id && !autor.escritorio) throw new DistribuicaoErro('Este lead foi encaminhado para outra pessoa');
  if (e.desfecho) throw new DistribuicaoErro(`Já finalizado: ${ROTULO_DESFECHO[e.desfecho as Desfecho] ?? e.desfecho}`);
  const obs = motivo?.trim().slice(0, 200) || null;
  await d.update(leadEncaminhamentos).set({ desfecho, desfechoMotivo: obs, desfechoEm: agora, desfechoPor: autor.id, recebidoEm: e.recebidoEm ?? agora } as any)
    .where(eq(leadEncaminhamentos.id, id));
  const base = MOTIVO_PERDA_DO_DESFECHO[desfecho];
  const motivoPerda = (base.startsWith('outro:') ? base : obs ? `${base}:${obs}` : base).slice(0, 120);
  await d.update(leadQualifications).set({ etapa: 'perdido', motivoPerda, updatedAt: agora } as any).where(eq(leadQualifications.id, e.leadId));
  await import('./sla').then(m => m.marcarAtendido(Number(e.leadId))).catch(() => {});
  return { ok: true as const };
}

/** O sistema finaliza o atendimento do lead em aberto (venda, contrato, funil em Fechado/Perdido) */
export async function finalizarPorEvento(leadId: number, desfecho: 'vendido' | DesfechoCorretor, motivo: string | null, usuarioId: number | null = null, agora = new Date()): Promise<number> {
  try {
    const d: any = await getDb();
    if (!d || !leadId) return 0;
    const abertos: any[] = await d.select().from(leadEncaminhamentos).where(and(eq(leadEncaminhamentos.leadId, leadId), isNull(leadEncaminhamentos.desfecho)));
    for (const e of abertos) {
      await d.update(leadEncaminhamentos).set({ desfecho, desfechoMotivo: motivo?.slice(0, 200) ?? null, desfechoEm: agora, desfechoPor: usuarioId, recebidoEm: e.recebidoEm ?? agora } as any)
        .where(eq(leadEncaminhamentos.id, e.id));
    }
    return abertos.length;
  } catch (err: any) { console.warn('[Distribuição] finalizar por evento:', err?.message); return 0; }
}

/** Leads recebidos de quem está logado: aguardando confirmação, em atendimento e finalizados nos últimos 30 dias */
export async function meusEncaminhamentos(usuarioId: number, agora = Date.now()) {
  const d = await banco();
  const rows: any[] = await d.select().from(leadEncaminhamentos)
    .where(and(eq(leadEncaminhamentos.paraId, usuarioId), or(isNull(leadEncaminhamentos.desfecho), gte(leadEncaminhamentos.criadoEm, new Date(agora - 30 * DIA)))))
    .orderBy(desc(leadEncaminhamentos.criadoEm)).limit(300);
  const ids = Array.from(new Set(rows.map(r => Number(r.leadId))));
  const leads: any[] = ids.length ? await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, empreendimentoSlug: leadQualifications.empreendimentoSlug, loteCodigo: leadQualifications.loteCodigo, etapa: leadQualifications.etapa })
    .from(leadQualifications).where(inArray(leadQualifications.id, ids)) : [];
  const L = new Map(leads.map(l => [Number(l.id), l]));
  const todos: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const nome = (id: unknown) => (id ? todos.find(u => Number(u.id) === Number(id))?.name ?? null : null);
  const ordem = { aguardando_confirmacao: 0, em_atendimento: 1, finalizado: 2 } as const;
  return rows.map(r => {
    const l = L.get(Number(r.leadId));
    return {
      id: Number(r.id), leadId: Number(r.leadId), lead: l?.nome || 'Sem nome', telefone: l ? `+${String(l.phone).replace(/\D/g, '')}` : null,
      interesse: [l?.empreendimentoSlug, l?.loteCodigo].filter(Boolean).join(' · ') || null, etapa: l?.etapa ?? null,
      quando: iso(r.criadoEm), origem: r.origem as OrigemEncaminhamento, por: r.origem === 'automatico' ? 'Automático (roleta)' : nome(r.porId), observacao: r.observacao ?? null,
      situacao: situacaoEncaminhamento(r), recebidoEm: iso(r.recebidoEm), desfecho: (r.desfecho ?? null) as Desfecho | null, desfechoMotivo: r.desfechoMotivo ?? null,
    };
  }).sort((a, b) => ordem[a.situacao] - ordem[b.situacao]);
}

/** Encaminhamento em aberto deste lead para o usuário (aviso "Confirmar recebimento" na ficha do lead) */
export async function encaminhamentoAbertoDoLead(leadId: number, usuarioId: number) {
  const d: any = await getDb();
  if (!d) return null;
  const [e]: any[] = await d.select().from(leadEncaminhamentos)
    .where(and(eq(leadEncaminhamentos.leadId, leadId), eq(leadEncaminhamentos.paraId, usuarioId), isNull(leadEncaminhamentos.desfecho)))
    .orderBy(desc(leadEncaminhamentos.criadoEm)).limit(1);
  if (!e) return null;
  const [p]: any[] = e.porId ? await d.select({ name: users.name }).from(users).where(eq(users.id, e.porId)).limit(1) : [];
  return { id: Number(e.id), quando: iso(e.criadoEm), por: e.origem === 'automatico' ? 'Automático (roleta)' : p?.name ?? null, observacao: e.observacao ?? null, recebidoEm: iso(e.recebidoEm) };
}

/** Reenvia o aviso (sininho, push e WhatsApp com o link de confirmar) dos encaminhamentos ainda sem confirmação */
export async function reenviarAvisos(ids: number[], por: { id: number; nome: string }) {
  const lista = Array.from(new Set(ids.filter(n => Number.isInteger(n) && n > 0))).slice(0, 200);
  if (!lista.length) throw new DistribuicaoErro('Escolha pelo menos um encaminhamento');
  const d = await banco();
  const rows: any[] = await d.select().from(leadEncaminhamentos).where(inArray(leadEncaminhamentos.id, lista));
  const { avisarEncaminhamento } = await import('./encaminhamento');
  let reenviados = 0, ignorados = 0;
  for (const e of rows) {
    if (e.desfecho || e.recebidoEm) { ignorados++; continue; }
    await avisarEncaminhamento({ leadId: Number(e.leadId), paraId: Number(e.paraId), porNome: `${por.nome} (lembrete)` }).catch(err => console.warn('[Distribuição] reenvio:', err?.message));
    reenviados++;
  }
  return { reenviados, ignorados };
}
