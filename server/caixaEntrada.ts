/**
 * Caixa de entrada única (Leads › Caixa de entrada): as conversas do WhatsApp (leadMensagens) e do Instagram Direct
 * (igConversas/igMensagens, recebidas pelo webhook da Meta) numa lista só, com resposta pela própria tela.
 * WhatsApp sai pela Z-API; Instagram pela API de mensagens da Meta (META_PAGE_ACCESS_TOKEN), só até 24 h depois da
 * última mensagem do cliente (regra da Meta). Responder pela caixa assume a conversa (o robô para).
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { igConversas, igMensagens, leadMensagens, leadQualifications, users } from '../drizzle/schema';

export class CaixaErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'CaixaErro'; } }
const H = 3_600_000;
async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new CaixaErro('Banco indisponível', 503);
  return d;
}

export type Canal = 'whatsapp' | 'instagram';
export interface Conversa { canal: Canal; id: number; nome: string; contato: string; ultima: string; ultimaEm: string; aguardando: boolean; leadId: number | null; responsavel: string | null; humano: boolean; janelaAberta: boolean }

// ─── Instagram: webhook ──────────────────────────────────────────────────────

export interface EventoIg { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[] } }

/** Eventos de mensagem do corpo do webhook (object: "instagram") */
export function mensagensDoWebhook(body: any): EventoIg[] {
  if (body?.object !== 'instagram' || !Array.isArray(body.entry)) return [];
  return body.entry.flatMap((e: any) => (Array.isArray(e.messaging) ? e.messaging : [])).filter((m: EventoIg) => m?.message && (m.message.text || m.message.attachments?.length));
}

type Perfil = (igsid: string) => Promise<{ nome: string | null; username: string | null }>;
const perfilPadrao: Perfil = async igsid => {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { nome: null, username: null };
  const v = process.env.META_GRAPH_VERSION || 'v26.0';
  const r = await fetch(`https://graph.facebook.com/${v}/${encodeURIComponent(igsid)}?fields=name,username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { nome: null, username: null };
  const j: any = await r.json();
  return { nome: j?.name ?? null, username: j?.username ?? null };
};

/** Grava as mensagens do Instagram (sem duplicar pelo mid) e avisa quem atende */
export async function receberInstagram(body: any, o: { perfil?: Perfil; agora?: number } = {}): Promise<number> {
  const eventos = mensagensDoWebhook(body);
  if (!eventos.length) return 0;
  const d = await banco();
  let n = 0;
  for (const ev of eventos) {
    const eco = !!ev.message?.is_echo;
    const igsid = String(eco ? ev.recipient?.id : ev.sender?.id ?? '');
    if (!igsid) continue;
    const texto = ev.message?.text?.trim() || `[${ev.message?.attachments?.[0]?.type ?? 'anexo'}]`;
    const quando = new Date(ev.timestamp && ev.timestamp > 1e12 ? ev.timestamp : o.agora ?? Date.now());
    let [c]: any[] = await d.select().from(igConversas).where(eq(igConversas.igsid, igsid)).limit(1);
    if (!c) {
      const p = await (o.perfil ?? perfilPadrao)(igsid).catch(() => ({ nome: null, username: null }));
      await d.insert(igConversas).values({ igsid, nome: p.nome, username: p.username, ultimaEm: quando, ultimaDoClienteEm: eco ? null : quando, criadoEm: quando } as any);
      [c] = await d.select().from(igConversas).where(eq(igConversas.igsid, igsid)).limit(1);
    }
    try {
      await d.insert(igMensagens).values({ conversaId: c.id, direcao: eco ? 'out' : 'in', texto: texto.slice(0, 4000), mid: ev.message?.mid ?? null, criadoEm: quando } as any);
    } catch (e: any) {
      if (/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ''))) continue; // reenvio da Meta
      throw e;
    }
    await d.update(igConversas).set({ ultimaEm: quando, ...(eco ? {} : { ultimaDoClienteEm: quando }) } as any).where(eq(igConversas.id, c.id));
    n++;
    if (!eco) {
      const { notificarMensagemInstagram } = await import('./notificacoes');
      notificarMensagemInstagram({ conversaId: Number(c.id), nome: c.nome || (c.username ? `@${c.username}` : 'Cliente do Instagram'), texto, responsavelId: c.responsavelId ? Number(c.responsavelId) : null })
        .catch((e: any) => console.warn('[Caixa] aviso do Instagram:', e?.message));
    }
  }
  return n;
}

// ─── Lista e conversa ────────────────────────────────────────────────────────

const visivelIg = (perfil: string, usuarioId: number, c: any) => perfil === 'admin' || perfil === 'secretario' || Number(c.responsavelId) === usuarioId;

export async function listarConversas(perfil: string, usuarioId: number, leadsVisiveis: <T extends { responsavelId?: number | null }>(l: T[]) => T[], agora = Date.now()): Promise<Conversa[]> {
  const d = await banco();
  const desde = new Date(agora - 30 * 24 * H);
  const msgs: any[] = await d.select({ leadId: leadMensagens.leadId, direcao: leadMensagens.direcao, texto: leadMensagens.texto, em: leadMensagens.createdAt })
    .from(leadMensagens).where(gte(leadMensagens.createdAt, desde)).orderBy(desc(leadMensagens.createdAt)).limit(5000);
  const ultima = new Map<number, any>();
  for (const m of msgs) if (!ultima.has(Number(m.leadId))) ultima.set(Number(m.leadId), m);
  const ids = Array.from(ultima.keys());
  const leads: any[] = ids.length ? leadsVisiveis(await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, responsavelId: leadQualifications.responsavelId, humano: leadQualifications.humano }).from(leadQualifications).where(inArray(leadQualifications.id, ids))) : [];
  const us: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const nomeU = (id: unknown) => us.find(u => Number(u.id) === Number(id))?.name ?? null;
  const out: Conversa[] = leads.map(l => {
    const m = ultima.get(Number(l.id));
    return { canal: 'whatsapp', id: Number(l.id), nome: l.nome || 'Sem nome', contato: `+${String(l.phone).replace(/\D/g, '')}`, ultima: String(m.texto).slice(0, 140), ultimaEm: new Date(m.em).toISOString(),
      aguardando: m.direcao === 'in', leadId: Number(l.id), responsavel: nomeU(l.responsavelId), humano: l.humano === true || l.humano === 1, janelaAberta: true };
  });
  const igs: any[] = await d.select().from(igConversas).where(gte(igConversas.ultimaEm, desde)).orderBy(desc(igConversas.ultimaEm)).limit(500);
  const visiveis = igs.filter(c => visivelIg(perfil, usuarioId, c));
  if (visiveis.length) {
    const ims: any[] = await d.select({ id: igMensagens.id, conversaId: igMensagens.conversaId, direcao: igMensagens.direcao, texto: igMensagens.texto, em: igMensagens.criadoEm })
      .from(igMensagens).where(inArray(igMensagens.conversaId, visiveis.map(c => c.id))).orderBy(desc(igMensagens.criadoEm), desc(igMensagens.id));
    const ult = new Map<number, any>();
    for (const m of ims) if (!ult.has(Number(m.conversaId))) ult.set(Number(m.conversaId), m);
    for (const c of visiveis) {
      const m = ult.get(Number(c.id));
      if (!m) continue;
      out.push({ canal: 'instagram', id: Number(c.id), nome: c.nome || (c.username ? `@${c.username}` : 'Cliente do Instagram'), contato: c.username ? `@${c.username}` : 'Instagram Direct',
        ultima: String(m.texto).slice(0, 140), ultimaEm: new Date(m.em).toISOString(), aguardando: m.direcao === 'in', leadId: c.leadId ? Number(c.leadId) : null,
        responsavel: nomeU(c.responsavelId), humano: true, janelaAberta: !!c.ultimaDoClienteEm && agora - new Date(c.ultimaDoClienteEm).getTime() < 24 * H });
    }
  }
  return out.sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm));
}

export async function mensagensDa(canal: Canal, id: number, perfil: string, usuarioId: number, podeVerLead: (l: { responsavelId?: number | null }) => boolean) {
  const d = await banco();
  if (canal === 'whatsapp') {
    const [l]: any[] = await d.select({ responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1);
    if (!l || !podeVerLead(l)) throw new CaixaErro('Conversa não encontrada', 404);
    const ms: any[] = await d.select().from(leadMensagens).where(eq(leadMensagens.leadId, id)).orderBy(desc(leadMensagens.createdAt), desc(leadMensagens.id)).limit(200);
    return ms.reverse().map(m => ({ id: Number(m.id), direcao: String(m.direcao), autor: String(m.autor), texto: String(m.texto), em: new Date(m.createdAt).toISOString() }));
  }
  const [c]: any[] = await d.select().from(igConversas).where(eq(igConversas.id, id)).limit(1);
  if (!c || !visivelIg(perfil, usuarioId, c)) throw new CaixaErro('Conversa não encontrada', 404);
  const ms: any[] = await d.select().from(igMensagens).where(eq(igMensagens.conversaId, id)).orderBy(desc(igMensagens.criadoEm), desc(igMensagens.id)).limit(200);
  return ms.reverse().map(m => ({ id: Number(m.id), direcao: String(m.direcao), autor: m.direcao === 'in' ? 'lead' : 'corretor', texto: String(m.texto), em: new Date(m.criadoEm).toISOString() }));
}

// ─── Responder ───────────────────────────────────────────────────────────────

export type EnvioIg = (igsid: string, texto: string) => Promise<string | null>;
const envioIgPadrao: EnvioIg = async (igsid, texto) => {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new CaixaErro('Instagram não configurado: falta META_PAGE_ACCESS_TOKEN no Railway', 412);
  const v = process.env.META_GRAPH_VERSION || 'v26.0';
  const r = await fetch(`https://graph.facebook.com/${v}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ recipient: { id: igsid }, message: { text: texto } }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new CaixaErro(`O Instagram recusou a mensagem: ${j?.error?.message ?? r.status}`, 502);
  return j?.message_id ?? null;
};
let envioIg: EnvioIg = envioIgPadrao;
export const definirEnvioIg = (f: EnvioIg | null) => { envioIg = f ?? envioIgPadrao; };

export async function responder(canal: Canal, id: number, texto: string, autor: { id: number; perfil: string }, podeVerLead: (l: { responsavelId?: number | null }) => boolean, agora = Date.now()) {
  const t = texto.trim().slice(0, 4000);
  if (!t) throw new CaixaErro('Escreva a mensagem');
  const d = await banco();
  if (canal === 'whatsapp') {
    const [l]: any[] = await d.select().from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1);
    if (!l || !podeVerLead(l)) throw new CaixaErro('Conversa não encontrada', 404);
    const { enviarTexto } = await import('./leads/zapiClient');
    await enviarTexto(String(l.phone), t).catch((e: any) => { throw new CaixaErro(`WhatsApp não enviou: ${e?.message ?? e}`, 502); });
    const { registrarMensagem } = await import('./leads/qualificacaoService');
    await registrarMensagem(id, 'out', 'corretor', t);
    // Quem responde pela caixa assume a conversa: o robô para e conta como atendimento
    await d.update(leadQualifications).set({ humano: true, updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, id));
    await import('./leads/sla').then(m => m.registrarAtendimento(id, { como: 'whatsapp_crm', usuarioId: autor.id })).catch(() => {});
    await import('./leads/followup').then(m => m.cancelarFollowUp(String(l.phone))).catch(() => {});
    return { ok: true as const };
  }
  const [c]: any[] = await d.select().from(igConversas).where(eq(igConversas.id, id)).limit(1);
  if (!c || !visivelIg(autor.perfil, autor.id, c)) throw new CaixaErro('Conversa não encontrada', 404);
  if (!c.ultimaDoClienteEm || agora - new Date(c.ultimaDoClienteEm).getTime() > 24 * H) {
    throw new CaixaErro('A Meta só permite responder no Direct até 24 h depois da última mensagem do cliente. Peça o WhatsApp dele quando ele voltar a escrever.', 409);
  }
  const mid = await envioIg(String(c.igsid), t);
  await d.insert(igMensagens).values({ conversaId: c.id, direcao: 'out', texto: t, mid, autorId: autor.id, criadoEm: new Date(agora) } as any);
  await d.update(igConversas).set({ ultimaEm: new Date(agora), ...(c.responsavelId ? {} : { responsavelId: autor.id }) } as any).where(eq(igConversas.id, c.id));
  return { ok: true as const };
}

/** Liga a conversa do Instagram a um lead pelo WhatsApp que o cliente passou (cria o lead se não existir) */
export async function vincularInstagram(conversaId: number, telefone: string, autor: { id: number; perfil: string }) {
  const d = await banco();
  const [c]: any[] = await d.select().from(igConversas).where(eq(igConversas.id, conversaId)).limit(1);
  if (!c || !visivelIg(autor.perfil, autor.id, c)) throw new CaixaErro('Conversa não encontrada', 404);
  const { ingestLead, normalizePhoneBR } = await import('./lead-intake');
  const fone = normalizePhoneBR(telefone);
  if (!fone) throw new CaixaErro('WhatsApp inválido (com DDD)');
  const r: any = await ingestLead({ nome: c.nome || c.username || 'Cliente do Instagram', phone: fone, origem: 'instagram_dm', instagramUserId: String(c.igsid), responsavelId: c.responsavelId ?? autor.id, semBoasVindas: true } as any);
  if (!r?.ok) throw new CaixaErro('Não foi possível criar o lead');
  const [l]: any[] = await d.select({ id: leadQualifications.id }).from(leadQualifications).where(eq(leadQualifications.phone, r.phone)).limit(1);
  await d.update(igConversas).set({ leadId: l?.id ?? null, responsavelId: c.responsavelId ?? autor.id } as any).where(eq(igConversas.id, conversaId));
  return { ok: true as const, leadId: l ? Number(l.id) : null };
}

export async function assumirInstagram(conversaId: number, usuarioId: number) {
  const d = await banco();
  await d.update(igConversas).set({ responsavelId: usuarioId } as any).where(and(eq(igConversas.id, conversaId)));
  return { ok: true as const };
}
