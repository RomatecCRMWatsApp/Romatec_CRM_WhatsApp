/**
 * Leads qualificados (formulário com filtro da Meta + o mesmo roteiro no robô): grava as respostas, calcula a nota
 * 0–100 e a faixa A/B/C (shared/leadScoreForm.ts) e encaminha:
 *  A → aviso imediato ao escritório (sininho/push e WhatsApp do administrador) para chamar em até 5 minutos;
 *  B → segue no atendimento normal (robô confirma e agenda);
 *  C → etiqueta "nutricao": fora da fila do corretor.
 * Entradas: webhook leadgen (server/meta-integration.ts) e o CSV baixado da Central de Leads (até a aprovação do app).
 */
import { eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '../db';
import { leadQualifications, users } from '../../drizzle/schema';
import { CAMPOS_FORM, ehFormularioQualificado, norm, pontuar, type Faixa } from '../../shared/leadScoreForm';
import { mesmoTelefone } from './mesmoTelefone';
import { etapaDoLead } from './kanban';

export const TAG_FAIXA = (f: Faixa) => `faixa_${f}`;
const TAGS_FAIXA = ['faixa_A', 'faixa_B', 'faixa_C'];
const CLASSE: Record<Faixa, 'quente' | 'morno' | 'frio'> = { A: 'quente', B: 'morno', C: 'frio' };
const RELOGIO = () => new Date();

const banco = async () => { const d: any = await getDb(); if (!d) throw new Error('Banco indisponível'); return d; };
/** Lista de etiquetas (vem como array, texto JSON ou nulo) */
const lista = (v: unknown): string[] => { if (Array.isArray(v)) return v; try { const x = JSON.parse(String(v ?? '')); return Array.isArray(x) ? x : []; } catch { return []; } };
const json = (v: unknown): any => { if (v && typeof v === 'object') return v; try { return JSON.parse(String(v ?? '')); } catch { return {}; } };

/** Só os campos do roteiro (procura, momento, pagamento...), pelos nomes normalizados */
export function respostasDoRoteiro(extras: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(extras)) {
    const nk = norm(k).replace(/ /g, '_');
    if ((CAMPOS_FORM as readonly string[]).includes(nk) && String(v ?? '').trim()) out[nk] = String(v).trim().slice(0, 160);
  }
  return out;
}

export type Aviso = (texto: string) => Promise<void>;
let avisoEscritorio: Aviso = async texto => {
  const d = await banco();
  const admins: any[] = await d.select({ telefone: users.telefone, ativo: users.ativo }).from(users).where(eq(users.role, 'admin'));
  const { enviarTexto } = await import('./zapiClient');
  for (const a of admins.filter(x => x.ativo !== false && x.ativo !== 0 && x.telefone)) {
    const t = String(a.telefone).replace(/\D/g, '');
    await enviarTexto(t.startsWith('55') ? t : `55${t}`, texto).catch(e => console.warn('[Leads A] aviso:', e?.message));
  }
};
/** Testes trocam o aviso */
export const definirAvisoEscritorio = (f: Aviso | null) => { if (f) avisoEscritorio = f; };

/** Recalcula a nota e a faixa do lead pelas respostas gravadas e aplica o encaminhamento da faixa */
export async function aplicarFaixa(leadId: number, o: { avisar?: boolean } = {}) {
  const d = await banco();
  const [l]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!l) return null;
  const answers = json(l.answers);
  if (!ehFormularioQualificado(answers)) return null;
  const p = pontuar(answers);
  const tagsAntes = lista(l.tags);
  const tags = Array.from(new Set([...tagsAntes.filter(t => !TAGS_FAIXA.includes(t) && t !== 'nutricao'), TAG_FAIXA(p.faixa), ...(p.faixa === 'C' ? ['nutricao'] : [])]));
  const mudou = !tagsAntes.includes(TAG_FAIXA(p.faixa));
  await d.update(leadQualifications).set({
    leadScore: p.leadScore, score: CLASSE[p.faixa], tags, answers: { ...answers, faixa: p.faixa },
    scoreDetalhe: { regras: 'formulario_qualificado_v1', detalhes: p.detalhe, at: RELOGIO().toISOString() }, updatedAt: RELOGIO(),
  } as any).where(eq(leadQualifications.id, leadId));
  if (p.faixa === 'A' && mudou && o.avisar !== false) {
    const nome = String(l.nome || answers.nome || 'Lead');
    const tel = String(l.phone || '');
    const texto = [
      `🔥 Lead A (nota ${p.leadScore}) do formulário: ${nome}`,
      `📞 wa.me/${tel.replace(/\D/g, '')}`,
      answers.momento ? `Quando: ${answers.momento}` : null,
      answers.pagamento ? `Pagamento: ${answers.pagamento}` : null,
      answers.prioridade ? `Prioridade: ${answers.prioridade}` : null,
      answers.visita ? `Visita: ${answers.visita}` : null,
      answers.regiao ? `Mora em: ${answers.regiao}` : null,
      'Chame em até 5 minutos e ofereça a visita.',
    ].filter(Boolean).join('\n');
    avisoEscritorio(texto).catch(() => {});
    import('../notificacoes').then(N => N.avisarNovoLead({ leadId })).catch(() => {});
  }
  return { leadId, ...p };
}

export async function aplicarFaixaPorTelefone(phone: string, o: { avisar?: boolean } = {}) {
  const d = await banco();
  const [l]: any[] = await d.select({ id: leadQualifications.id }).from(leadQualifications).where(mesmoTelefone(leadQualifications.phone, phone)).limit(1);
  return l ? aplicarFaixa(Number(l.id), o) : null;
}

// ─── Comportamento depois do formulário: a nota sobe ou cai ───────────────────
/** +10 respondeu no WhatsApp · +15 confirmou/agendou a visita · −15 ficou 24 h sem responder (uma vez cada) */
export type EventoLead = 'respondeu_whatsapp' | 'visita_confirmada' | 'sem_resposta_24h';
const SIM = 'sim';

export async function registrarEvento(leadId: number, evento: EventoLead) {
  const d = await banco();
  const [l]: any[] = await d.select({ answers: leadQualifications.answers }).from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!l) return null;
  const answers = json(l.answers);
  if (!ehFormularioQualificado(answers) || answers[evento] === SIM) return null;
  if (evento === 'sem_resposta_24h' && answers.respondeu_whatsapp === SIM) return null;
  const novo: Record<string, unknown> = { ...answers, [evento]: SIM, [`${evento}_em`]: RELOGIO().toISOString() };
  // Respondeu depois do prazo: tira o desconto de "sem resposta"
  if (evento === 'respondeu_whatsapp') { delete novo.sem_resposta_24h; delete novo.sem_resposta_24h_em; }
  await d.update(leadQualifications).set({ answers: novo } as any).where(eq(leadQualifications.id, leadId));
  return aplicarFaixa(leadId);
}

export async function registrarEventoPorTelefone(phone: string, evento: EventoLead) {
  const d = await banco();
  const [l]: any[] = await d.select({ id: leadQualifications.id }).from(leadQualifications).where(mesmoTelefone(leadQualifications.phone, phone)).limit(1);
  return l ? registrarEvento(Number(l.id), evento) : null;
}

/** Leads do formulário com mais de 24 h (e menos de 30 dias) que não responderam no WhatsApp perdem 15 pontos */
export async function verificarSemResposta(agora = RELOGIO().getTime()): Promise<number> {
  const d = await banco();
  const rows: any[] = await d.select({ id: leadQualifications.id, answers: leadQualifications.answers, createdAt: leadQualifications.createdAt, leadScore: leadQualifications.leadScore })
    .from(leadQualifications).where(isNotNull(leadQualifications.leadScore));
  let n = 0;
  for (const r of rows) {
    const criado = new Date(r.createdAt as any).getTime();
    if (!(criado <= agora - 24 * 3600_000 && criado >= agora - 30 * 86_400_000)) continue;
    const a = json(r.answers);
    if (!ehFormularioQualificado(a) || a.respondeu_whatsapp === SIM || a.sem_resposta_24h === SIM) continue;
    if (await registrarEvento(Number(r.id), 'sem_resposta_24h')) n++;
  }
  return n;
}

let jobIniciado = false;
export function iniciarJobSemResposta() {
  if (jobIniciado) return;
  jobIniciado = true;
  const tick = () => verificarSemResposta().then(n => { if (n) console.log(`[Leads qualificados] ${n} lead(s) sem resposta em 24 h`); }).catch(e => console.warn('[Leads qualificados] sem resposta:', e?.message));
  setInterval(tick, 60 * 60_000).unref?.();
  setTimeout(tick, 5 * 60_000).unref?.();
}

// ─── CSV da Central de Leads (Meta Business Suite) ────────────────────────────
/** Lê CSV com vírgula, ponto e vírgula ou tabulação, com aspas; a 1ª linha é o cabeçalho */
export function lerCsv(texto: string): Record<string, string>[] {
  const limpo = texto.replace(/^\uFEFF/, '').replace(/\u0000/g, '');
  const amostra = limpo.split(/\r?\n/)[0] ?? '';
  const sep = [',', ';', '\t'].map(s => [s, amostra.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const linhas: string[][] = [];
  let cel = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') aspas = false; else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(cel); cel = '';
      if (linha.some(x => x.trim())) linhas.push(linha);
      linha = [];
    } else cel += c;
  }
  linha.push(cel);
  if (linha.some(x => x.trim())) linhas.push(linha);
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  return resto.map(l => Object.fromEntries(cab.map((h, k) => [h.trim(), (l[k] ?? '').trim()])));
}

export interface LinhaImportada { nome: string; telefone: string; leadScore: number | null; faixa: Faixa | null; situacao: 'novo' | 'atualizado' | 'duplicado' | 'invalido' | 'bloqueado' | 'equipe' | 'sem_telefone'; campanha: string | null }

/** Importa o CSV da Central de Leads: cria/atualiza o lead, grava as respostas e aplica a faixa */
export async function importarCsvMeta(csv: string, o: { empreendimentoSlug?: string | null; boasVindas?: boolean } = {}) {
  const linhas = lerCsv(csv);
  if (!linhas.length) throw new Error('Arquivo vazio ou sem cabeçalho');
  const { mapLeadFields } = await import('../meta-integration');
  const { ingestLead } = await import('../lead-intake');
  const res: LinhaImportada[] = [];
  for (const row of linhas.slice(0, 2000)) {
    const campos = mapLeadFields(Object.entries(row).map(([name, v]) => ({ name, values: [v] })));
    const ex = campos.extras;
    const campanha = ex.ad_name || ex.campaign_name || ex.form_name || null;
    const nome = campos.nome || 'Lead Instagram';
    if (!campos.phone) { res.push({ nome, telefone: '', leadScore: null, faixa: null, situacao: 'sem_telefone', campanha }); continue; }
    const roteiro = respostasDoRoteiro(ex);
    const metaId = String(ex.id || ex.lead_id || '').replace(/^l:/, '') || undefined;
    const r = await ingestLead({
      nome, phone: campos.phone, origem: 'instagram_ads', metaLeadId: metaId, campanha: campanha ?? undefined,
      empreendimentoSlug: o.empreendimentoSlug ?? undefined, semBoasVindas: !o.boasVindas,
      answers: { ...roteiro, ...(ex.cidade || ex.city ? { cidade: ex.cidade || ex.city } : {}), ...(campos.email ? { email: campos.email } : {}),
        ...(ex.campaign_name ? { meta_campanha: ex.campaign_name } : {}), ...(ex.adset_name ? { meta_conjunto: ex.adset_name } : {}), ...(ex.ad_name ? { meta_anuncio: ex.ad_name } : {}) },
    });
    if (!r.ok) {
      res.push({ nome, telefone: campos.phone, leadScore: null, faixa: null, situacao: r.reason === 'duplicate' ? 'duplicado' : r.reason === 'invalid_phone' ? 'invalido' : r.reason === 'blocked' ? 'bloqueado' : r.reason === 'equipe' ? 'equipe' : 'invalido', campanha });
      continue;
    }
    const f = ehFormularioQualificado(roteiro) ? await aplicarFaixaPorTelefone(r.phone) : null;
    res.push({ nome, telefone: r.phone, leadScore: f?.leadScore ?? null, faixa: f?.faixa ?? null, situacao: r.created ? 'novo' : 'atualizado', campanha });
  }
  res.sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
  const conta = (f: Faixa) => res.filter(x => x.faixa === f).length;
  return { total: res.length, A: conta('A'), B: conta('B'), C: conta('C'), linhas: res };
}

// ─── Painel: por campanha, % A, visitas e vendas ─────────────────────────────
const ETAPAS_VISITA = ['visita_agendada', 'visitou', 'proposta', 'fechado'];
export async function painelQualificados() {
  const d = await banco();
  const todos: any[] = await d.select({ id: leadQualifications.id, tags: leadQualifications.tags, etapa: leadQualifications.etapa, stage: leadQualifications.stage, funil: leadQualifications.funil,
    campanhaOrigem: leadQualifications.campanhaOrigem, answers: leadQualifications.answers }).from(leadQualifications);
  const qual = todos.map(l => ({ ...l, tags: lista(l.tags), answers: json(l.answers) }))
    .filter(l => l.tags.some((t: string) => TAGS_FAIXA.includes(t)));
  const por = new Map<string, { campanha: string; leads: number; A: number; B: number; C: number; visitas: number; visitasRealizadas: number; propostas: number; vendas: number }>();
  for (const l of qual) {
    const k = String(l.answers?.meta_campanha || l.campanhaOrigem || 'Sem campanha');
    const g = por.get(k) ?? { campanha: k, leads: 0, A: 0, B: 0, C: 0, visitas: 0, visitasRealizadas: 0, propostas: 0, vendas: 0 };
    g.leads++;
    const f = (l.tags.find((t: string) => TAGS_FAIXA.includes(t)) as string).slice(-1) as Faixa;
    g[f]++;
    const etapa = l.etapa || etapaDoLead(l);
    if (ETAPAS_VISITA.includes(etapa)) g.visitas++;
    if (['visitou', 'proposta', 'fechado'].includes(etapa)) g.visitasRealizadas++;
    if (['proposta', 'fechado'].includes(etapa)) g.propostas++;
    if (etapa === 'fechado') g.vendas++;
    por.set(k, g);
  }
  const campanhas = Array.from(por.values()).sort((a, b) => b.leads - a.leads);
  const soma = (k: 'leads' | 'A' | 'B' | 'C' | 'visitas' | 'visitasRealizadas' | 'propostas' | 'vendas') => campanhas.reduce((t, c) => t + c[k], 0);
  const total = { leads: soma('leads'), A: soma('A'), B: soma('B'), C: soma('C'), visitas: soma('visitas'), visitasRealizadas: soma('visitasRealizadas'), propostas: soma('propostas'), vendas: soma('vendas') };
  // Taxas reais para recalcular o funil (só quando há base mínima)
  const taxas = total.leads >= 20 ? {
    qualif: (total.A + total.B) / total.leads,
    visita: total.A + total.B ? total.visitas / (total.A + total.B) : 0,
    fecha: total.visitas ? total.vendas / total.visitas : 0,
  } : null;
  return { campanhas, total, taxas };
}

/** Leads de uma faixa (lista da tela) */
export async function leadsDaFaixa(faixa: Faixa, limite = 200) {
  const d = await banco();
  const todos: any[] = await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, tags: leadQualifications.tags, leadScore: leadQualifications.leadScore,
    answers: leadQualifications.answers, responsavelId: leadQualifications.responsavelId, etapa: leadQualifications.etapa, stage: leadQualifications.stage, funil: leadQualifications.funil, createdAt: leadQualifications.createdAt })
    .from(leadQualifications);
  const doFaixa = todos.map(l => ({ ...l, tags: lista(l.tags), answers: json(l.answers) }))
    .filter(l => l.tags.includes(TAG_FAIXA(faixa)))
    .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limite);
  const ids = Array.from(new Set(doFaixa.map(l => l.responsavelId).filter(Boolean)));
  const us: any[] = ids.length ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  return doFaixa.map(l => ({
    id: Number(l.id), nome: l.nome || 'Sem nome', telefone: String(l.phone ?? ''), nota: l.leadScore ?? null, etapa: l.etapa || etapaDoLead(l),
    responsavel: us.find(u => Number(u.id) === Number(l.responsavelId))?.name ?? null,
    momento: l.answers.momento ?? null, pagamento: l.answers.pagamento ?? null, prioridade: l.answers.prioridade ?? null, regiao: l.answers.regiao ?? null, visita: l.answers.visita ?? null,
    campanha: l.answers.meta_campanha ?? null, criadoEm: new Date(l.createdAt).toISOString(),
  }));
}
