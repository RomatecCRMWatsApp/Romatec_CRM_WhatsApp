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
import { infoVersao } from "./_core/systemRouter";
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
  base: Omit<NovaNotificacao, "usuarioId" | "url">, alvo: { empreendimentoSlug?: string | null; lote?: string | null; contratoId?: number | null; leadId?: number | null },
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

/** Pedido de cancelamento de contrato (corretor/secretária) → sininho e push só para o administrador */
export async function notificarSolicitacaoCancelamento(
  p: { contratoId: number; contrato: string; lote: string; empreendimentoId: number; empreendimentoNome?: string | null; comprador?: string | null; motivo: string; autorId: number; autorNome?: string | null },
  repo: RepoNotificacoes = repoBanco(), enviar?: EnviadorPush | null,
) {
  const usuarios = await repo.usuarios();
  const ids = destinatarios("solicitacao_cancelamento", usuarios, [], perfilDe as any, { empreendimentoId: p.empreendimentoId, empreendimentoSlug: "", autorId: p.autorId });
  const { titulo, mensagem } = textoNotificacao("solicitacao_cancelamento", {
    contrato: p.contrato, lote: p.lote, empreendimento: p.empreendimentoNome ?? undefined, comprador: p.comprador ?? undefined, motivo: p.motivo, autor: p.autorNome,
  });
  return emitir(repo, enviar === undefined ? await enviadorWebPush() : enviar, usuarios, ids,
    { tipo: "solicitacao_cancelamento", titulo, mensagem, empreendimentoId: p.empreendimentoId, chave: `solicitacao:${p.contratoId}` },
    { contratoId: p.contratoId });
}

/**
 * Novo lead captado (formulário, link de agendamento, WhatsApp/bot da Zayra, Meta…): sininho, aviso na tela e push.
 * Uma vez por lead (chave novo_lead:<id>). Destinatários em shared/notificacoes.ts (destinatarios).
 */
export async function notificarNovoLead(leadId: number, repo: RepoNotificacoes = repoBanco(), enviar?: EnviadorPush | null) {
  if (!leadId) return null;
  const chave = `novo_lead:${leadId}`;
  if (await repo.jaEmitida("novo_lead", chave)) return null;
  const db = await dbOrThrow();
  const { leadQualifications } = await import("../drizzle/schema");
  const [l]: any[] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!l) return null;
  let emp: any = null;
  if (l.empreendimentoSlug) {
    [emp] = await db.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.slug, l.empreendimentoSlug)).limit(1);
  }
  const ans = (typeof l.answers === "string" ? JSON.parse(l.answers) : l.answers) ?? {};
  const unidade = l.loteCodigo || ans["unidade de interesse"] || null;
  const detalhe = [ans.cidade ? `de ${ans.cidade}` : null, unidade ? `interesse: ${unidade}` : null].filter(Boolean).join(" · ") || undefined;
  const usuarios = await repo.usuarios();
  const ids = destinatarios("novo_lead", usuarios, await repo.acessos(), perfilDe as any,
    { empreendimentoId: emp?.id ?? 0, empreendimentoSlug: emp?.slug ?? "", responsavelId: l.responsavelId ?? null });
  const { titulo, mensagem } = textoNotificacao("novo_lead", { comprador: l.nome || "sem nome", empreendimento: emp?.nome ?? undefined, motivo: detalhe });
  return emitir(repo, enviar === undefined ? await enviadorWebPush() : enviar, usuarios, ids,
    { tipo: "novo_lead", titulo, mensagem, empreendimentoId: emp?.id ?? null, chave }, { leadId, empreendimentoSlug: emp?.slug ?? null });
}

/** Mesmo aviso a partir do telefone (pontos que gravam o lead sem devolver o id) */
export async function notificarNovoLeadPorTelefone(phone: string) {
  const db = await dbOrThrow();
  const { leadQualifications } = await import("../drizzle/schema");
  const [l]: any[] = await db.select({ id: leadQualifications.id }).from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
  return l ? notificarNovoLead(l.id) : null;
}

/** Dispara sem travar quem captou o lead (falha no aviso nunca derruba a captação) */
export function avisarNovoLead(ref: { leadId?: number | null; phone?: string | null }) {
  const p = ref.leadId ? notificarNovoLead(ref.leadId) : ref.phone ? notificarNovoLeadPorTelefone(ref.phone) : Promise.resolve(null);
  p.catch(e => console.warn("[Notificações] novo lead:", e?.message ?? e));
}

/** Pedido de agendamento pelo link público → sininho e push de quem recebeu o lead */
export async function notificarAgendamento(
  p: { responsavelId: number; leadId: number; cliente: string; empreendimentoId?: number | null; empreendimentoNome?: string | null; quando: string; detalhe?: string },
  repo: RepoNotificacoes = repoBanco(), enviar?: EnviadorPush | null,
) {
  const usuarios = await repo.usuarios();
  const dono = usuarios.find(u => u.id === p.responsavelId && u.ativo !== false && u.ativo !== 0);
  if (!dono) return null;
  const { titulo, mensagem } = textoNotificacao("agendamento", { comprador: p.cliente, empreendimento: p.empreendimentoNome ?? undefined, quando: p.quando, motivo: p.detalhe });
  return emitir(repo, enviar === undefined ? await enviadorWebPush() : enviar, usuarios, [dono.id],
    { tipo: "agendamento", titulo, mensagem, empreendimentoId: p.empreendimentoId ?? null, chave: `agendamento:${p.leadId}` },
    { leadId: p.leadId });
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

/**
 * Notificação de teste (Configurações, só admin): vai só para quem pediu — sininho, som do tipo e push
 * nos aparelhos dele —, sem mexer em lote nenhum. chave "teste" separa dos eventos reais.
 */
export async function notificarTeste(
  usuario: { id: number; role?: string | null; perfil?: string | null }, tipo: TipoNotificacao,
  repo: RepoNotificacoes = repoBanco(), enviar?: EnviadorPush | null,
) {
  const t = textoNotificacao(tipo, { lote: "A01", empreendimento: "Bom Jardims", versao: infoVersao().versao });
  const r = await emitir(repo, enviar === undefined ? await enviadorWebPush() : enviar, [usuario as UsuarioDestino], [usuario.id],
    { tipo, titulo: `[Teste] ${t.titulo}`, mensagem: `${t.mensagem} (notificação de teste — nenhum lote foi alterado)`, chave: "teste" },
    { empreendimentoSlug: "bom-jardims", lote: "A01" });
  return { enviados: r.enviados, aparelhos: r.enviados + r.removidos, pushConfigurado: pushConfigurado() };
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
