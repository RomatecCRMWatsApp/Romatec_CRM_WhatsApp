/**
 * Comentário com palavra-chave → resposta automática no Direct (Instagram).
 * Quem comenta CHÁCARA (ou QUERO, SIMULAÇÃO, ROTA…) num post do @avalieimob recebe a simulação no Direct
 * (resposta privada ao comentário, API de mensagens da Meta) e uma resposta pública curta embaixo do comentário.
 * A conversa entra na Caixa de entrada como Instagram; quando o cliente responde, o webhook de mensagens já
 * registra e avisa quem atende. Uma vez por pessoa por post (mid "cmt:<post>:<igsid>" é único em igMensagens).
 *
 * Na Meta: o app precisa da permissão instagram_manage_comments e do campo "comments" assinado no webhook
 * do objeto instagram (mesma URL /api/webhook/meta). Desligar: IG_COMENTARIO_AUTO=off no Railway.
 */
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { igConversas, igMensagens } from '../drizzle/schema';

export interface ComentarioIg { id: string; texto: string; igsid: string; username: string | null; mediaId: string; contaId: string }
export interface RegraComentario { nome: string; palavras: string[]; dm: (c: ComentarioIg) => string; publica: string[] }

const BASE = 'https://romateccrm.com/bom-jardims';
const ASSINATURA = 'José Romário · Corretor CRECI/MA 4.705 · (99) 9 9181-1246';
const SAIR = 'Se não quiser receber mensagens, responda SAIR.';

export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Regras na ordem de prioridade: a primeira que casar responde */
export const REGRAS_COMENTARIO: RegraComentario[] = [
  {
    nome: 'rota',
    palavras: ['ROTA', 'LOCALIZACAO', 'ONDE FICA'],
    dm: () => `Oi! Aqui é o José Romário 🌳 Segue o caminho até o Condomínio de Chácaras Bom Jardims (17 km do centro de Açailândia, pela Estrada do Piquiá dos Baianos, altura do km 15 da BR-222):\n${BASE}?utm_source=instagram&utm_medium=comentario&utm_campaign=BJ-ROTA\n\nQuer agendar uma visita? Me passa seu WhatsApp que eu marco com você.\n\n${ASSINATURA}\n${SAIR}`,
    publica: ['Te mandei a rota no direct! 📍', 'Enviei a localização no seu direct 📩'],
  },
  {
    nome: 'simulacao',
    palavras: ['CHACARA', 'QUERO', 'SIMULA', 'VALOR', 'PRECO', 'INFO'],
    dm: () => `Oi! Aqui é o José Romário 🌳 Segue a simulação das chácaras do Bom Jardims, com todas as formas de pagamento (entrada de 30%, planos A, B e C e à vista) e as condições completas:\n${BASE}/formas-de-pagamento?utm_source=instagram&utm_medium=comentario&utm_campaign=BJ-COMENTARIO\n\nMe passa seu WhatsApp que eu te mando a simulação da chácara que você escolher.\n\n${ASSINATURA}\n${SAIR}`,
    publica: ['Te mandei a simulação no direct! 📩', 'Enviei no seu direct, confere lá 📩', 'Já te chamei no direct! 🌳'],
  },
];

/** A palavra-chave tem que começar uma palavra do comentário (CHÁCARA casa com "chácaras"; ROTA não casa com "derrota") */
export function regraPara(texto: string, regras = REGRAS_COMENTARIO): RegraComentario | null {
  const t = ` ${normalizar(texto).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (t.trim().length === 0 || t.trim().length > 140) return null; // comentário longo é conversa, não palavra-chave
  return regras.find(r => r.palavras.some(p => t.includes(` ${p}`))) ?? null;
}

/** Comentários novos do corpo do webhook (object "instagram", field "comments"), sem os da própria conta */
export function comentariosDoWebhook(body: any): ComentarioIg[] {
  if (body?.object !== 'instagram' || !Array.isArray(body.entry)) return [];
  const out: ComentarioIg[] = [];
  for (const e of body.entry) {
    for (const ch of Array.isArray(e?.changes) ? e.changes : []) {
      const v = ch?.value;
      if (ch?.field !== 'comments' || !v?.id || !v?.from?.id || typeof v.text !== 'string') continue;
      if (String(v.from.id) === String(e.id)) continue; // a própria conta respondendo
      if (v.parent_id) continue; // resposta dentro de uma conversa de comentários
      out.push({ id: String(v.id), texto: v.text, igsid: String(v.from.id), username: v.from.username ?? null, mediaId: String(v.media?.id ?? ''), contaId: String(e.id) });
    }
  }
  return out;
}

export interface EnvioComentario {
  privada: (commentId: string, texto: string) => Promise<string | null>;
  publica: (commentId: string, texto: string) => Promise<void>;
}

const graph = async (caminho: string, corpo: Record<string, unknown>) => {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('falta META_PAGE_ACCESS_TOKEN');
  const v = process.env.META_GRAPH_VERSION || 'v26.0';
  const r = await fetch(`https://graph.facebook.com/${v}/${caminho}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
  return j;
};

const envioPadrao: EnvioComentario = {
  privada: async (commentId, texto) => (await graph('me/messages', { recipient: { comment_id: commentId }, message: { text: texto } }))?.message_id ?? null,
  publica: async (commentId, texto) => { await graph(`${encodeURIComponent(commentId)}/replies`, { message: texto }); },
};

export const autoComentarioLigado = () => !/^(off|0|false|nao|não)$/i.test(String(process.env.IG_COMENTARIO_AUTO ?? '').trim());

/** Responde os comentários com palavra-chave. Devolve quantos receberam o Direct. Nunca lança (webhook tem que responder 200). */
export async function responderComentarios(body: any, o: { envio?: EnvioComentario; agora?: number; sortear?: (n: number) => number } = {}): Promise<number> {
  if (!autoComentarioLigado()) return 0;
  const comentarios = comentariosDoWebhook(body);
  if (!comentarios.length) return 0;
  const d: any = await getDb();
  if (!d) return 0;
  const envio = o.envio ?? envioPadrao;
  const sortear = o.sortear ?? ((n: number) => Math.floor(Math.random() * n));
  let n = 0;
  for (const c of comentarios) {
    const regra = regraPara(c.texto);
    if (!regra) continue;
    const quando = new Date(o.agora ?? Date.now());
    try {
      let [conv]: any[] = await d.select().from(igConversas).where(eq(igConversas.igsid, c.igsid)).limit(1);
      if (!conv) {
        await d.insert(igConversas).values({ igsid: c.igsid, nome: null, username: c.username, ultimaEm: quando, criadoEm: quando } as any);
        [conv] = await d.select().from(igConversas).where(eq(igConversas.igsid, c.igsid)).limit(1);
      }
      const texto = regra.dm(c);
      const mid = `cmt:${c.mediaId}:${c.igsid}`.slice(0, 160);
      try {
        // Reserva antes de enviar: o mesmo comentário reenviado pela Meta (ou a mesma pessoa no mesmo post) não recebe de novo
        await d.insert(igMensagens).values({ conversaId: conv.id, direcao: 'out', texto: `[Resposta automática ao comentário "${c.texto.slice(0, 80)}"]\n${texto}`, mid, criadoEm: quando } as any);
      } catch (e: any) {
        if (/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ''))) continue;
        throw e;
      }
      try {
        await envio.privada(c.id, texto);
      } catch (e: any) {
        await d.delete(igMensagens).where(eq(igMensagens.mid, mid)); // deixa tentar de novo num próximo comentário
        console.warn(`[IG comentário] Direct não enviado (${regra.nome}):`, e?.message ?? e);
        continue;
      }
      await d.update(igConversas).set({ ultimaEm: quando } as any).where(eq(igConversas.id, conv.id));
      n++;
      await envio.publica(c.id, regra.publica[sortear(regra.publica.length)] ?? regra.publica[0])
        .catch((e: any) => console.warn('[IG comentário] resposta pública não enviada:', e?.message ?? e));
      const { notificarMensagemInstagram } = await import('./notificacoes');
      notificarMensagemInstagram({ conversaId: Number(conv.id), nome: c.username ? `@${c.username}` : 'Cliente do Instagram', texto: `Comentou "${c.texto.slice(0, 80)}": simulação enviada no Direct`, responsavelId: conv.responsavelId ? Number(conv.responsavelId) : null })
        .catch((e: any) => console.warn('[IG comentário] aviso:', e?.message));
    } catch (e: any) {
      console.warn('[IG comentário] erro:', e?.message ?? e);
    }
  }
  return n;
}
