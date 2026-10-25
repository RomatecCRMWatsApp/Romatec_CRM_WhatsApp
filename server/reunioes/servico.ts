/**
 * Reuniões com clientes (shared/reunioes.ts): cria, recebe as partes da gravação (transcreve cada uma ao
 * chegar), finaliza (junta o texto e gera o resumo) e controla quem vê. Admin e secretária veem todas;
 * corretor vê as que gravou e as dos leads dele; empreendedor não usa.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { leadQualifications, reuniaoPartes, reunioes, users } from '../../drizzle/schema';
import { leadVisivel } from '../../shared/permissoes';
import type { PermissoesUsuario } from '../permissoes';
import { rotuloTipoReuniao, type ResumoReuniao, type TipoReuniao } from '../../shared/reunioes';
import { resumirTranscricao, transcreverAudio } from './ia';

export class ReuniaoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ReuniaoErro'; } }

const banco = async () => {
  const d = await getDb();
  if (!d) throw new ReuniaoErro('Banco indisponível', 503);
  return d as any;
};

export type Quem = { id: number; permissoes: PermissoesUsuario };

/** Dependências trocáveis nos testes */
export const ia = { transcrever: transcreverAudio, resumir: resumirTranscricao };

async function leadDe(d: any, leadId: number | null | undefined) {
  if (!leadId) return null;
  const [l]: any[] = await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, responsavelId: leadQualifications.responsavelId })
    .from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  return l ?? null;
}

function exigirEquipe(q: Quem) {
  if (!q.permissoes.perfil || q.permissoes.perfil === 'empreendedor') throw new ReuniaoErro('Sem acesso às reuniões.', 403);
}

async function exigirLeadDoUsuario(d: any, leadId: number | null | undefined, q: Quem) {
  if (!leadId) return null;
  const l = await leadDe(d, leadId);
  if (!l) throw new ReuniaoErro('Lead não encontrado', 404);
  if (!leadVisivel(q.permissoes.perfil, q.id, l)) throw new ReuniaoErro('Este lead está com outro responsável.', 403);
  return l;
}

/** Reunião que o usuário pode ver/mexer */
export async function reuniaoDoUsuario(id: number, q: Quem) {
  exigirEquipe(q);
  const d = await banco();
  const [r]: any[] = await d.select().from(reunioes).where(eq(reunioes.id, id)).limit(1);
  if (!r) throw new ReuniaoErro('Reunião não encontrada', 404);
  const p = q.permissoes.perfil;
  if (p === 'admin' || p === 'secretario' || r.criadoPor === q.id) return r;
  const l = await leadDe(d, r.leadId);
  if (l && leadVisivel(p, q.id, l)) return r;
  throw new ReuniaoErro('Esta reunião é de outro corretor.', 403);
}

export async function criarReuniao(dados: { leadId?: number | null; titulo: string; tipo: TipoReuniao; consentimento: boolean }, q: Quem, agora = Date.now()) {
  exigirEquipe(q);
  if (!dados.consentimento) throw new ReuniaoErro('Confirme que o cliente foi avisado da gravação.');
  const d = await banco();
  await exigirLeadDoUsuario(d, dados.leadId, q);
  const r: any = await d.insert(reunioes).values({
    leadId: dados.leadId ?? null, titulo: dados.titulo.trim().slice(0, 160), tipo: dados.tipo, status: 'gravando', criadoPor: q.id,
    consentimento: 1, duracaoSeg: 0, createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
  return { id };
}

/**
 * Uma parte da gravação: transcreve e guarda o texto (reenvio da mesma parte substitui). Se a transcrição falhar
 * (ex.: OpenAI sem crédito), o áudio fica guardado na parte até "Tentar de novo" — e é apagado ao transcrever.
 */
export async function receberParte(id: number, ordem: number, audio: Buffer, mime: string, duracaoSeg: number, q: Quem) {
  const r = await reuniaoDoUsuario(id, q);
  if (r.status !== 'gravando' && r.status !== 'erro') throw new ReuniaoErro('Esta reunião já foi finalizada.', 409);
  if (!audio?.length) throw new ReuniaoErro('Parte vazia');
  const d = await banco();
  let texto: string | null = null, erro: string | null = null;
  try { texto = await ia.transcrever(audio, mime); } catch (e: any) { erro = String(e?.message || 'falha na transcrição').slice(0, 300); }
  await d.delete(reuniaoPartes).where(and(eq(reuniaoPartes.reuniaoId, id), eq(reuniaoPartes.ordem, ordem)));
  await d.insert(reuniaoPartes).values({
    reuniaoId: id, ordem, duracaoSeg: Math.max(0, Math.round(duracaoSeg || 0)), texto, erro,
    audioBase64: erro ? audio.toString('base64') : null, mime: erro ? String(mime).slice(0, 60) : null, createdAt: new Date(),
  } as any);
  // A gravação segue: a parte guardada é transcrita de novo ao finalizar
  return { ordem, caracteres: texto?.length ?? 0, pendente: !!erro, aviso: erro };
}

/** Partes que ficaram com o áudio guardado: tenta transcrever de novo e apaga o áudio das que saírem */
async function retranscrever(d: any, partes: any[]) {
  for (const p of partes) {
    if (!p.erro || !p.audioBase64) continue;
    try {
      const texto = await ia.transcrever(Buffer.from(String(p.audioBase64), 'base64'), p.mime || 'audio/webm');
      await d.update(reuniaoPartes).set({ texto, erro: null, audioBase64: null, mime: null } as any).where(eq(reuniaoPartes.id, p.id));
      Object.assign(p, { texto, erro: null, audioBase64: null });
    } catch (e: any) {
      const erro = String(e?.message || 'falha na transcrição').slice(0, 300);
      await d.update(reuniaoPartes).set({ erro } as any).where(eq(reuniaoPartes.id, p.id));
      p.erro = erro;
    }
  }
}

/** Junta as partes e gera o resumo (em segundo plano na produção; os testes aguardam) */
export async function finalizarReuniao(id: number, q: Quem, emSegundoPlano = true) {
  const r = await reuniaoDoUsuario(id, q);
  if (r.status === 'processando') return { status: 'processando' as const };
  const d = await banco();
  await d.update(reunioes).set({ status: 'processando', erro: null, updatedAt: new Date() } as any).where(eq(reunioes.id, id));
  const tarefa = processarReuniao(id).catch(e => console.error('[Reuniões] processamento:', e?.message));
  if (!emSegundoPlano) await tarefa;
  return { status: 'processando' as const };
}

export async function processarReuniao(id: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(reunioes).where(eq(reunioes.id, id)).limit(1);
  if (!r) return;
  const partes: any[] = (await d.select().from(reuniaoPartes).where(eq(reuniaoPartes.reuniaoId, id))).sort((a: any, b: any) => a.ordem - b.ordem);
  await retranscrever(d, partes);
  const transcricao = partes.map(p => String(p.texto ?? '').trim()).filter(Boolean).join('\n\n');
  const duracaoSeg = partes.reduce((s, p) => s + (Number(p.duracaoSeg) || 0), 0);
  const falhas = partes.filter(p => p.erro).length;
  const falhar = (erro: string) => d.update(reunioes).set({ status: 'erro', erro: erro.slice(0, 300), transcricao: transcricao || null, duracaoSeg, updatedAt: new Date() } as any).where(eq(reunioes.id, id));
  if (!transcricao) return falhar(falhas ? `Nenhuma parte foi transcrita (${partes.find(p => p.erro)?.erro})` : 'Nenhum áudio recebido.');
  const lead = await leadDe(d, r.leadId);
  try {
    const resumo = await ia.resumir(transcricao, { titulo: r.titulo, tipo: rotuloTipoReuniao(r.tipo), cliente: lead?.nome ?? null });
    await d.update(reunioes).set({
      status: 'pronta', transcricao, duracaoSeg, resumoJson: JSON.stringify(resumo),
      erro: falhas ? `${falhas} trecho(s) ainda sem transcrição: ${partes.find(p => p.erro)?.erro}` : null, updatedAt: new Date(),
    } as any).where(eq(reunioes.id, id));
  } catch (e: any) {
    await falhar(`Transcrição pronta, mas o resumo falhou: ${e?.message || 'erro'}`);
  }
}

const resumoDe = (r: any): ResumoReuniao | null => {
  if (!r.resumoJson) return null;
  try { return typeof r.resumoJson === 'string' ? JSON.parse(r.resumoJson) : r.resumoJson; } catch { return null; }
};

/** Lista: todas (admin/secretária) ou as do corretor; filtro por lead */
export async function listarReunioes(q: Quem, filtro: { leadId?: number | null } = {}) {
  exigirEquipe(q);
  const d = await banco();
  let rows: any[] = filtro.leadId ? await d.select().from(reunioes).where(eq(reunioes.leadId, filtro.leadId)) : await d.select().from(reunioes).orderBy(desc(reunioes.createdAt)).limit(300);
  const leadIds = Array.from(new Set(rows.map(r => r.leadId).filter(Boolean))) as number[];
  const leads: any[] = leadIds.length ? await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(inArray(leadQualifications.id, leadIds)) : [];
  const L = new Map(leads.map(l => [l.id, l]));
  const p = q.permissoes.perfil;
  if (p !== 'admin' && p !== 'secretario') rows = rows.filter(r => r.criadoPor === q.id || (r.leadId && L.get(r.leadId) && leadVisivel(p, q.id, L.get(r.leadId))));
  const autores: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const U = new Map(autores.map(u => [u.id, u.name]));
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(r => ({
    id: r.id as number, titulo: r.titulo as string, tipo: r.tipo as string, status: r.status as string, duracaoSeg: Number(r.duracaoSeg) || 0,
    leadId: r.leadId as number | null, cliente: r.leadId ? L.get(r.leadId)?.nome ?? null : null, autor: U.get(r.criadoPor) ?? null,
    resumo: resumoDe(r)?.resumo ?? null, erro: r.erro ?? null, createdAt: r.createdAt,
  }));
}

/** Escolher o cliente da reunião: leads que o usuário vê, por nome ou telefone */
export async function buscarLeads(q: Quem, busca: string) {
  exigirEquipe(q);
  const d = await banco();
  const t = busca.trim().toLowerCase(), dig = busca.replace(/\D/g, '');
  const todos: any[] = await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, responsavelId: leadQualifications.responsavelId })
    .from(leadQualifications).orderBy(desc(leadQualifications.updatedAt)).limit(2000);
  return todos
    .filter(l => leadVisivel(q.permissoes.perfil, q.id, l))
    .filter(l => !t || String(l.nome ?? '').toLowerCase().includes(t) || (dig.length >= 4 && String(l.phone ?? '').includes(dig)))
    .slice(0, 15).map(l => ({ id: l.id as number, nome: (l.nome || 'Sem nome') as string, telefone: String(l.phone ?? '') }));
}

export async function obterReuniao(id: number, q: Quem) {
  const r = await reuniaoDoUsuario(id, q);
  const d = await banco();
  const partes: any[] = await d.select({ ordem: reuniaoPartes.ordem, duracaoSeg: reuniaoPartes.duracaoSeg, erro: reuniaoPartes.erro }).from(reuniaoPartes).where(eq(reuniaoPartes.reuniaoId, id));
  const lead = await leadDe(d, r.leadId);
  const [autor]: any[] = await d.select({ name: users.name }).from(users).where(eq(users.id, r.criadoPor)).limit(1);
  return {
    id: r.id as number, titulo: r.titulo as string, tipo: r.tipo as string, status: r.status as string, duracaoSeg: Number(r.duracaoSeg) || 0,
    leadId: r.leadId as number | null, cliente: lead?.nome ?? null, autor: autor?.name ?? null, transcricao: (r.transcricao ?? null) as string | null,
    resumo: resumoDe(r), erro: r.erro ?? null, createdAt: r.createdAt, podeExcluir: q.permissoes.perfil === 'admin' || r.criadoPor === q.id,
    partes: partes.sort((a, b) => a.ordem - b.ordem).map(p => ({ ordem: p.ordem as number, duracaoSeg: Number(p.duracaoSeg) || 0, erro: p.erro ?? null })),
  };
}

export async function atualizarReuniao(id: number, dados: { titulo?: string; leadId?: number | null }, q: Quem) {
  await reuniaoDoUsuario(id, q);
  const d = await banco();
  if (dados.leadId !== undefined) await exigirLeadDoUsuario(d, dados.leadId, q);
  await d.update(reunioes).set({
    ...(dados.titulo ? { titulo: dados.titulo.trim().slice(0, 160) } : {}), ...(dados.leadId !== undefined ? { leadId: dados.leadId } : {}), updatedAt: new Date(),
  } as any).where(eq(reunioes.id, id));
  return { ok: true as const };
}

export async function excluirReuniao(id: number, q: Quem) {
  const r = await reuniaoDoUsuario(id, q);
  if (q.permissoes.perfil !== 'admin' && r.criadoPor !== q.id) throw new ReuniaoErro('Só quem gravou ou o administrador exclui.', 403);
  const d = await banco();
  await d.delete(reuniaoPartes).where(eq(reuniaoPartes.reuniaoId, id));
  await d.delete(reunioes).where(eq(reunioes.id, id));
  return { ok: true as const };
}
