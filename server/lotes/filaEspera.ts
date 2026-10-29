/**
 * Fila de espera por chácara: o corretor (ou o escritório) põe o cliente na fila de uma chácara reservada ou vendida
 * em andamento. Quando ela volta a ficar disponível (reserva vencida e liberada, contrato cancelado, mudança manual),
 * o 1º da fila é avisado: o cliente recebe a mensagem no WhatsApp do sistema e o corretor dele recebe o sininho, o
 * push e o WhatsApp. Se esse desistir, o próximo é avisado (enquanto a chácara continuar livre).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { empreendimentos, leadQualifications, loteFilaEspera, lotes, users } from '../../drizzle/schema';

export class FilaEsperaErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'FilaEsperaErro'; } }

export const ATIVOS_FILA = ['aguardando', 'avisado'];
export type StatusFila = 'aguardando' | 'avisado' | 'convertido' | 'desistiu';

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new FilaEsperaErro('Banco indisponível', 503);
  return d;
}

const primeiroNome = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

/** Mensagem ao cliente quando a vez dele chega */
export function msgClienteVez(nome: string, codigo: string, empreendimento: string, corretor: string | null): string {
  return `Olá, ${primeiroNome(nome)}! 🎉 A chácara *${codigo}* do *${empreendimento}* acabou de ficar disponível e você é o(a) primeiro(a) da fila de espera.\n\n` +
    `${corretor ? `O corretor *${corretor}*` : 'Nossa equipe'} vai falar com você em instantes para garantir a reserva. Se preferir, responda esta mensagem.`;
}

/** Mensagem ao corretor */
export function msgCorretorVez(nome: string, telefone: string | null, codigo: string, empreendimento: string): string {
  return `🔔 *Fila de espera — chácara ${codigo}* (${empreendimento})\n\nA chácara ficou disponível e o seu cliente *${nome}*${telefone ? ` (${telefone})` : ''} é o 1º da fila. ` +
    `Ele já foi avisado no WhatsApp — fale com ele agora e faça a reserva antes de liberar para outro.`;
}

/** Posição (1, 2, 3…) de cada entrada ativa da fila da chácara, por ordem de chegada */
export function posicoes<T extends { id: number; status: string; criadoEm: Date | string }>(fila: T[]): Map<number, number> {
  const ativos = fila.filter(f => ATIVOS_FILA.includes(f.status)).sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime() || a.id - b.id);
  return new Map(ativos.map((f, i) => [f.id, i + 1]));
}

const telefoneDe = (v: unknown) => {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
};

/** Chácaras do empreendimento do lead e a fila do lead (tela do lead) */
export async function filaDoLead(leadId: number) {
  const d = await banco();
  const [lead]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!lead) throw new FilaEsperaErro('Lead não encontrado', 404);
  const slug = lead.empreendimentoSlug || 'bom-jardims';
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) return { lead, empreendimento: null, ocupadas: [], minhas: [] };
  const todos: any[] = await d.select({ id: lotes.id, codigo: lotes.codigo, situacao: lotes.situacao, comercializavel: lotes.comercializavel })
    .from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const fila: any[] = await d.select().from(loteFilaEspera).where(eq(loteFilaEspera.empreendimentoId, emp.id));
  const porLote = new Map<number, any[]>();
  for (const f of fila) porLote.set(Number(f.loteId), [...(porLote.get(Number(f.loteId)) ?? []), f]);
  const ocupadas = todos.filter(l => l.situacao && !['disponivel', 'bloqueado'].includes(l.situacao) && l.comercializavel !== false && l.comercializavel !== 0)
    .map(l => ({ id: Number(l.id), codigo: String(l.codigo), situacao: String(l.situacao), naFila: (porLote.get(Number(l.id)) ?? []).filter(f => ATIVOS_FILA.includes(f.status)).length }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  const minhas = fila.filter(f => Number(f.leadId) === leadId && ATIVOS_FILA.includes(f.status)).map(f => ({
    id: Number(f.id), loteCodigo: String(f.loteCodigo), status: String(f.status) as StatusFila,
    posicao: posicoes(porLote.get(Number(f.loteId)) ?? []).get(Number(f.id)) ?? null,
    criadoEm: new Date(f.criadoEm).toISOString(), avisadoEm: f.avisadoEm ? new Date(f.avisadoEm).toISOString() : null,
  }));
  return { lead, empreendimento: { id: Number(emp.id), nome: String(emp.nome), slug }, ocupadas, minhas };
}

/** Põe o lead na fila da chácara (só chácara ocupada; o mesmo lead não entra duas vezes) */
export async function entrarNaFila(leadId: number, loteId: number, autorId: number) {
  const d = await banco();
  const [lead]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!lead) throw new FilaEsperaErro('Lead não encontrado', 404);
  const [l]: any[] = await d.select().from(lotes).where(eq(lotes.id, loteId)).limit(1);
  if (!l) throw new FilaEsperaErro('Chácara não encontrada', 404);
  if (!l.situacao || l.situacao === 'disponivel') throw new FilaEsperaErro(`A chácara ${l.codigo} está disponível — faça a reserva direto.`, 409);
  if (l.situacao === 'bloqueado') throw new FilaEsperaErro(`A chácara ${l.codigo} está bloqueada para venda.`, 409);
  if (Number(l.leadId) === leadId) throw new FilaEsperaErro(`A chácara ${l.codigo} já está reservada para este cliente.`, 409);
  const ja: any[] = await d.select({ id: loteFilaEspera.id }).from(loteFilaEspera)
    .where(and(eq(loteFilaEspera.loteId, loteId), eq(loteFilaEspera.leadId, leadId), inArray(loteFilaEspera.status, ATIVOS_FILA)));
  if (ja.length) throw new FilaEsperaErro(`Este cliente já está na fila da chácara ${l.codigo}.`, 409);
  await d.insert(loteFilaEspera).values({
    empreendimentoId: l.empreendimentoId, loteId, loteCodigo: l.codigo, leadId, nome: String(lead.nome || 'Cliente').slice(0, 160),
    telefone: telefoneDe(lead.phone), corretorId: lead.responsavelId ?? autorId, status: 'aguardando', criadoPor: autorId, criadoEm: new Date(),
  } as any);
  const fila: any[] = await d.select().from(loteFilaEspera).where(eq(loteFilaEspera.loteId, loteId));
  const minha = fila.filter(f => Number(f.leadId) === leadId && ATIVOS_FILA.includes(f.status)).sort((a, b) => b.id - a.id)[0];
  return { ok: true as const, posicao: minha ? posicoes(fila).get(Number(minha.id)) ?? null : null, codigo: String(l.codigo) };
}

/** Sai da fila (desistiu) ou fechou (convertido); se era o avisado e a chácara segue livre, avisa o próximo */
export async function encerrarNaFila(id: number, status: 'convertido' | 'desistiu', leadId?: number | null) {
  const d = await banco();
  const [f]: any[] = await d.select().from(loteFilaEspera).where(eq(loteFilaEspera.id, id)).limit(1);
  if (!f || (leadId != null && Number(f.leadId) !== leadId)) throw new FilaEsperaErro('Entrada da fila não encontrada', 404);
  if (!ATIVOS_FILA.includes(f.status)) return { ok: true as const, proximo: null };
  await d.update(loteFilaEspera).set({ status } as any).where(eq(loteFilaEspera.id, id));
  let proximo = null;
  if (f.status === 'avisado' && status === 'desistiu') proximo = await avisarProximoDaFila(Number(f.loteId));
  return { ok: true as const, proximo };
}

export type Enviador = (telefone: string, texto: string) => Promise<unknown>;
const enviadorPadrao: Enviador = async (tel, txt) => { const { enviarTexto } = await import('../leads/zapiClient'); return enviarTexto(tel, txt); };

/**
 * A chácara ficou livre: avisa o 1º "aguardando" (cliente no WhatsApp; corretor no sininho, push e WhatsApp).
 * Não faz nada se a chácara não estiver disponível ou se já houver alguém avisado esperando.
 */
export async function avisarProximoDaFila(loteId: number, enviar: Enviador = enviadorPadrao) {
  const d = await banco();
  const [l]: any[] = await d.select().from(lotes).where(eq(lotes.id, loteId)).limit(1);
  if (!l || l.situacao !== 'disponivel') return null;
  const fila: any[] = await d.select().from(loteFilaEspera).where(eq(loteFilaEspera.loteId, loteId)).orderBy(asc(loteFilaEspera.criadoEm), asc(loteFilaEspera.id));
  if (fila.some(f => f.status === 'avisado')) return null;
  const prox = fila.find(f => f.status === 'aguardando');
  if (!prox) return null;
  await d.update(loteFilaEspera).set({ status: 'avisado', avisadoEm: new Date() } as any).where(eq(loteFilaEspera.id, prox.id));
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, l.empreendimentoId)).limit(1);
  const nomeEmp = String(emp?.nome ?? 'empreendimento');
  const [cor]: any[] = prox.corretorId ? await d.select({ id: users.id, name: users.name, telefone: users.telefone }).from(users).where(eq(users.id, prox.corretorId)).limit(1) : [];
  const avisos: string[] = [];
  if (prox.telefone) {
    await enviar(prox.telefone, msgClienteVez(prox.nome, l.codigo, nomeEmp, cor?.name ?? null)).then(() => avisos.push('cliente'))
      .catch((e: any) => console.warn('[FilaEspera] WhatsApp do cliente:', e?.message ?? e));
  }
  const telCor = telefoneDe(cor?.telefone);
  if (telCor) {
    await enviar(telCor, msgCorretorVez(prox.nome, prox.telefone, l.codigo, nomeEmp)).then(() => avisos.push('corretor'))
      .catch((e: any) => console.warn('[FilaEspera] WhatsApp do corretor:', e?.message ?? e));
  }
  const { notificarFilaEspera } = await import('../notificacoes');
  await notificarFilaEspera({ loteId, codigo: String(l.codigo), empreendimentoId: Number(l.empreendimentoId), empreendimentoSlug: String(emp?.slug ?? ''), empreendimentoNome: nomeEmp,
    cliente: String(prox.nome), corretorId: prox.corretorId ? Number(prox.corretorId) : null, leadId: prox.leadId ? Number(prox.leadId) : null })
    .catch((e: any) => console.warn('[FilaEspera] sininho:', e?.message ?? e));
  return { id: Number(prox.id), nome: String(prox.nome), codigo: String(l.codigo), avisos };
}

/** Fila inteira (escritório): chácaras com gente esperando */
export async function listarFilas() {
  const d = await banco();
  const fila: any[] = await d.select().from(loteFilaEspera).where(inArray(loteFilaEspera.status, ATIVOS_FILA)).orderBy(asc(loteFilaEspera.criadoEm));
  if (!fila.length) return [];
  const ids = Array.from(new Set(fila.map(f => Number(f.loteId))));
  const ls: any[] = await d.select({ id: lotes.id, situacao: lotes.situacao, empreendimentoId: lotes.empreendimentoId }).from(lotes).where(inArray(lotes.id, ids));
  const corIds = Array.from(new Set(fila.map(f => Number(f.corretorId)).filter(Boolean)));
  const cors: any[] = corIds.length ? await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, corIds)) : [];
  const nomeCor = new Map(cors.map(c => [Number(c.id), String(c.name ?? '—')]));
  const sit = new Map(ls.map(l => [Number(l.id), String(l.situacao)]));
  return ids.map(loteId => {
    const doLote = fila.filter(f => Number(f.loteId) === loteId);
    const pos = posicoes(doLote);
    return {
      loteId, codigo: String(doLote[0].loteCodigo), situacao: sit.get(loteId) ?? '—',
      pessoas: doLote.map(f => ({ id: Number(f.id), posicao: pos.get(Number(f.id)) ?? null, nome: String(f.nome), telefone: f.telefone ?? null, leadId: f.leadId ? Number(f.leadId) : null,
        corretor: f.corretorId ? nomeCor.get(Number(f.corretorId)) ?? '—' : 'Escritório', status: String(f.status) as StatusFila,
        criadoEm: new Date(f.criadoEm).toISOString(), avisadoEm: f.avisadoEm ? new Date(f.avisadoEm).toISOString() : null })),
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}
