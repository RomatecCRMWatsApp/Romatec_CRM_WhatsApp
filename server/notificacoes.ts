/**
 * Notificações (v1.8.0): grava no sininho de cada destinatário e manda o Web Push para os aparelhos
 * inscritos (app fechado). Regras puras em shared/notificacoes.ts.
 *
 * Web Push: chaves VAPID nas variáveis VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (gerar com
 * `npx web-push generate-vapid-keys`). Sem as chaves, o sininho funciona e o push fica desligado.
 * O acesso ao banco passa por um "repositório" para os testes rodarem sem MySQL.
 */
import crypto from "crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { acessosCorretor, empreendimentos, notificacoes, pushInscricoes, users } from "../drizzle/schema";
import { perfilDe } from "../shared/equipe";
import {
  destinatarios, eventoDaMudanca, inscricaoExpirada, textoNotificacao, urlDaNotificacao,
  type PayloadPush, type TipoNotificacao, type UsuarioDestino,
} from "../shared/notificacoes";
import type { SituacaoLote } from "../shared/lotes";

export interface NovaNotificacao {
  usuarioId: number; tipo: TipoNotificacao; titulo: string; mensagem: string; url: string;
  empreendimentoId?: number | null; loteId?: number | null; chave?: string | null;
}
export interface InscricaoPush { usuarioId: number; endpoint: string; p256dh: string; auth: string }

export interface RepoNotificacoes {
  usuarios(): Promise<UsuarioDestino[]>;
  acessos(): Promise<{ usuarioId: number; tipo: "empreendimento" | "imovel"; refId: number }[]>;
  /** Grava e devolve os ids, na mesma ordem */
  inserir(linhas: NovaNotificacao[]): Promise<number[]>;
  jaEmitida(tipo: TipoNotificacao, chave: string): Promise<boolean>;
  inscricoesDe(usuarioIds: number[]): Promise<InscricaoPush[]>;
  salvarInscricao(i: InscricaoPush, userAgent: string | null): Promise<void>;
  removerInscricao(endpoint: string, usuarioId?: number): Promise<void>;
}

/** Envia um push (lança erro com statusCode quando o serviço recusa) */
export type EnviadorPush = (i: InscricaoPush, payload: PayloadPush) => Promise<void>;

const hashEndpoint = (endpoint: string) => crypto.createHash("sha256").update(endpoint).digest("hex");

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

export function repoBanco(): RepoNotificacoes {
  return {
    async usuarios() {
      const db = await dbOrThrow();
      return db.select({ id: users.id, role: users.role, perfil: (users as any).perfil, ativo: users.ativo, empreendimentoSlug: users.empreendimentoSlug }).from(users);
    },
    async acessos() {
      const db = await dbOrThrow();
      return db.select({ usuarioId: acessosCorretor.usuarioId, tipo: acessosCorretor.tipo, refId: acessosCorretor.refId }).from(acessosCorretor);
    },
    async inserir(linhas) {
      const db = await dbOrThrow();
      const ids: number[] = [];
      // Uma por vez para ter o id de cada (vai no push e marca a leitura no toque)
      for (const l of linhas) {
        const r: any = await db.insert(notificacoes).values({ ...l, criadoEm: new Date() } as any);
        ids.push(Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0));
      }
      return ids;
    },
    async jaEmitida(tipo, chave) {
      const db = await dbOrThrow();
      const [r]: any[] = await db.select({ id: notificacoes.id }).from(notificacoes).where(and(eq(notificacoes.tipo, tipo), eq(notificacoes.chave, chave))).limit(1);
      return !!r;
    },
    async inscricoesDe(ids) {
      if (!ids.length) return [];
      const db = await dbOrThrow();
      return db.select({ usuarioId: pushInscricoes.usuarioId, endpoint: pushInscricoes.endpoint, p256dh: pushInscricoes.p256dh, auth: pushInscricoes.auth })
        .from(pushInscricoes).where(inArray(pushInscricoes.usuarioId, ids));
    },
    async salvarInscricao(i, userAgent) {
      const db = await dbOrThrow();
      const endpointHash = hashEndpoint(i.endpoint);
      const [ja]: any[] = await db.select({ id: pushInscricoes.id }).from(pushInscricoes).where(eq(pushInscricoes.endpointHash, endpointHash)).limit(1);
      const dados = { usuarioId: i.usuarioId, endpoint: i.endpoint, p256dh: i.p256dh, auth: i.auth, userAgent, atualizadoEm: new Date() };
      // Mesmo aparelho: atualiza (inclusive se outra pessoa entrou nele)
      if (ja) await db.update(pushInscricoes).set(dados as any).where(eq(pushInscricoes.id, ja.id));
      else await db.insert(pushInscricoes).values({ ...dados, endpointHash, criadoEm: dados.atualizadoEm } as any);
    },
    async removerInscricao(endpoint, usuarioId) {
      const db = await dbOrThrow();
      const filtros = [eq(pushInscricoes.endpointHash, hashEndpoint(endpoint))];
      if (usuarioId != null) filtros.push(eq(pushInscricoes.usuarioId, usuarioId));
      await db.delete(pushInscricoes).where(and(...filtros));
    },
  };
}

// ─── Web Push (lib web-push) ──────────────────────────────────────────────────

export const chavePublicaVapid = () => process.env.VAPID_PUBLIC_KEY?.trim() || null;
export const pushConfigurado = () => !!(chavePublicaVapid() && process.env.VAPID_PRIVATE_KEY?.trim());

let enviadorPadrao: EnviadorPush | null = null;
async function enviadorWebPush(): Promise<EnviadorPush | null> {
  if (!pushConfigurado()) return null;
  if (enviadorPadrao) return enviadorPadrao;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "https://romateccrm.com", chavePublicaVapid()!, process.env.VAPID_PRIVATE_KEY!.trim());
  enviadorPadrao = async (i, payload) => {
    await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(payload), { TTL: 12 * 3600, urgency: "high" });
  };
  return enviadorPadrao;
}

/** Push para os aparelhos dos destinatários; inscrição morta (404/410) é apagada */
export async function enviarPushes(repo: RepoNotificacoes, enviar: EnviadorPush | null, payloads: Map<number, PayloadPush>) {
  if (!enviar || !payloads.size) return { enviados: 0, removidos: 0 };
  let enviados = 0, removidos = 0;
  for (const i of await repo.inscricoesDe(Array.from(payloads.keys()))) {
    const p = payloads.get(i.usuarioId);
    if (!p) continue;
    try {
      await enviar(i, p);
      enviados++;
    } catch (e: any) {
      if (inscricaoExpirada(e?.statusCode)) { await repo.removerInscricao(i.endpoint); removidos++; }
      else console.warn(`[Push] falhou para o usuário ${i.usuarioId}:`, e?.statusCode ?? "", e?.message ?? e);
    }
  }
  return { enviados, removidos };
}

/** Grava a notificação para cada destinatário (endereço conforme o perfil) e dispara o push */
async function emitir(
  repo: RepoNotificacoes, enviar: EnviadorPush | null, usuarios: UsuarioDestino[], ids: number[],
  base: Omit<NovaNotificacao, "usuarioId" | "url">, alvo: { empreendimentoSlug?: string | null; lote?: string | null },
) {
  if (!ids.length) return { destinatarios: [] as number[], enviados: 0, removidos: 0 };
  const P = new Map(usuarios.map(u => [u.id, perfilDe(u as any)]));
  const linhas = ids.map(usuarioId => ({ ...base, usuarioId, url: urlDaNotificacao(base.tipo, alvo, P.get(usuarioId)) }));
  const criados = await repo.inserir(linhas);
  const payloads = new Map(linhas.map((l, k) => [l.usuarioId, { id: criados[k], tipo: l.tipo, titulo: l.titulo, mensagem: l.mensagem, url: l.url } as PayloadPush]));
  const r = await enviarPushes(repo, enviar, payloads);
  return { destinatarios: ids, ...r };
}

export interface MudancaLote {
  loteId: number; codigo: string; empreendimentoId: number; empreendimentoSlug: string; empreendimentoNome?: string | null;
  de: string | null | undefined; para: SituacaoLote; autorId?: number | null; autorNome?: string | null;
}

/** Reserva / venda / liberação de lote → sininho e push (escopo do corretor respeitado) */
export async function notificarMudancaLote(m: MudancaLote, repo: RepoNotificacoes = repoBanco(), enviar?: EnviadorPush | null) {
  const tipo = eventoDaMudanca(m.de, m.para);
  if (!tipo) return null;
  const usuarios = await repo.usuarios();
  const ids = destinatarios(tipo, usuarios, await repo.acessos(), perfilDe as any,
    { empreendimentoId: m.empreendimentoId, empreendimentoSlug: m.empreendimentoSlug, autorId: m.autorId });
  const { titulo, mensagem } = textoNotificacao(tipo, { lote: m.codigo, empreendimento: m.empreendimentoNome ?? undefined, autor: m.autorNome });
  return { tipo, ...(await emitir(repo, enviar === undefined ? await enviadorWebPush() : enviar, usuarios, ids,
    { tipo, titulo, mensagem, empreendimentoId: m.empreendimentoId, loteId: m.loteId, chave: null },
    { empreendimentoSlug: m.empreendimentoSlug, lote: m.codigo })) };
}

/** Ao subir uma versão nova: "Sistema atualizado para vX.Y.Z" para todos (uma vez por versão) */
export async function notificarAtualizacaoSistema(versao: string, repo: RepoNotificacoes = repoBanco(), enviar?: EnviadorPush | null) {
  const chave = `v${versao}`;
  if (await repo.jaEmitida("atualizacao_sistema", chave)) return null;
  const usuarios = await repo.usuarios();
  const ids = destinatarios("atualizacao_sistema", usuarios, [], perfilDe as any);
  const { titulo, mensagem } = textoNotificacao("atualizacao_sistema", { versao });
  const r = await emitir(repo, enviar === undefined ? await enviadorWebPush() : enviar, usuarios, ids,
    { tipo: "atualizacao_sistema", titulo, mensagem, chave }, {});
  console.log(`[Notificações] Sistema atualizado para v${versao}: ${r.destinatarios.length} pessoa(s), ${r.enviados} push(es)`);
  return r;
}

// ─── Sininho (leitura) ───────────────────────────────────────────────────────

export async function listarDoUsuario(usuarioId: number, limite = 30) {
  const db = await dbOrThrow();
  const itens: any[] = await db.select().from(notificacoes).where(eq(notificacoes.usuarioId, usuarioId)).orderBy(desc(notificacoes.id)).limit(limite);
  const [c]: any[] = await db.select({ n: sql<number>`count(*)` }).from(notificacoes).where(and(eq(notificacoes.usuarioId, usuarioId), isNull(notificacoes.lidaEm)));
  return {
    naoLidas: Number(c?.n ?? 0),
    itens: itens.map(n => ({
      id: n.id, tipo: n.tipo as TipoNotificacao, titulo: n.titulo, mensagem: n.mensagem, url: n.url,
      lida: !!n.lidaEm, criadoEm: new Date(typeof n.criadoEm === "number" ? n.criadoEm * 1000 : n.criadoEm).toISOString(),
    })),
  };
}

/** Marca como lidas (só as da própria pessoa); sem ids = todas */
export async function marcarLidas(usuarioId: number, ids?: number[]) {
  const db = await dbOrThrow();
  const filtros = [eq(notificacoes.usuarioId, usuarioId), isNull(notificacoes.lidaEm)];
  if (ids) {
    if (!ids.length) return { ok: true };
    filtros.push(inArray(notificacoes.id, ids));
  }
  await db.update(notificacoes).set({ lidaEm: new Date() } as any).where(and(...filtros));
  return { ok: true };
}

/** Nome e slug do empreendimento do lote (para o texto e o escopo) */
export async function dadosDoEmpreendimento(empreendimentoId: number) {
  const db = await dbOrThrow();
  const [e]: any[] = await db.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, empreendimentoId)).limit(1);
  return e ?? null;
}
