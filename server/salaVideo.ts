/**
 * Sala de vídeo (Jitsi) — regras em shared/salaVideo.ts.
 *
 * Quem tem login cria a sala e entra como moderador; o convidado entra pelo link público /sala/<codigo>
 * informando só o nome. Com JaaS configurado (JAAS_APP_ID, JAAS_KID, JAAS_PRIVATE_KEY), a chamada roda
 * embutida no CRM com token RS256 assinado aqui; sem JaaS, abre no meet.jit.si numa aba.
 */
import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { SignJWT, importPKCS8 } from 'jose';
import { getDb } from './db';
import { appUrl } from './leads/config';
import { salasVideo, users } from '../drizzle/schema';
import type { Perfil } from '../shared/equipe';
import {
  MAX_TITULO_SALA, codigoValido, gerarCodigoSala, nomeParticipanteValido, nomeSalaJitsi, urlJitsiPublico, type ModoSala,
} from '../shared/salaVideo';

export class SalaErro extends Error {
  name = 'SalaErro';
  constructor(message: string, public status = 400) { super(message); }
}

export interface Quem { id: number; nome: string; email?: string | null; perfil: Perfil | null }

const idInserido = (r: any) => Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
const duplicado = (e: any) => /Duplicate entry|ER_DUP_ENTRY|UNIQUE constraint|SQLITE_CONSTRAINT/.test(String(e?.message ?? e?.cause?.message ?? ''));

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new SalaErro('Banco indisponível', 503);
  return d;
}

export const linkPublicoSala = (codigo: string) => `${appUrl()}/sala/${codigo}`;

// ─── JaaS (Jitsi como serviço, 8x8) ─────────────────────────────────────────────────────────────

interface ConfigJaas { appId: string; kid: string; chave: string }

export function configJaas(env: NodeJS.ProcessEnv = process.env): ConfigJaas | null {
  const appId = env.JAAS_APP_ID?.trim();
  const kid = env.JAAS_KID?.trim();
  // a chave privada costuma ser colada com "\n" literais nas variáveis de ambiente
  const chave = env.JAAS_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  return appId && kid && chave ? { appId, kid, chave } : null;
}

export const modoSala = (): ModoSala => (configJaas() ? 'embutido' : 'aba');

/** Token de entrada na sala JaaS (válido por 3 h). Moderador: quem criou a sala no CRM. */
export async function tokenJaas(
  cfg: ConfigJaas, codigo: string, p: { id: string; nome: string; email?: string | null; moderador: boolean },
): Promise<string> {
  const chave = await importPKCS8(cfg.chave, 'RS256');
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({
    aud: 'jitsi', iss: 'chat', sub: cfg.appId, room: nomeSalaJitsi(codigo),
    context: {
      user: { id: p.id, name: p.nome, email: p.email ?? '', moderator: p.moderador ? 'true' : 'false', avatar: '' },
      features: { livestreaming: 'false', recording: 'false', transcription: 'false', 'outbound-call': 'false', 'sip-outbound-call': 'false' },
      room: { regex: false },
    },
  })
    .setProtectedHeader({ alg: 'RS256', kid: cfg.kid, typ: 'JWT' })
    .setIssuedAt(agora)
    .setNotBefore(agora - 10)
    .setExpirationTime(agora + 3 * 3600)
    .sign(chave);
}

export interface Entrada {
  modo: ModoSala;
  /** modo embutido: domínio, sala e token para o IFrame API */
  dominio?: string;
  sala?: string;
  jwt?: string;
  script?: string;
  /** modo aba: link do Jitsi público */
  url?: string;
  nome: string;
}

async function entrada(codigo: string, p: { id: string; nome: string; email?: string | null; moderador: boolean }): Promise<Entrada> {
  const cfg = configJaas();
  if (!cfg) return { modo: 'aba', url: urlJitsiPublico(codigo, p.nome), nome: p.nome };
  return {
    modo: 'embutido',
    dominio: '8x8.vc',
    sala: `${cfg.appId}/${nomeSalaJitsi(codigo)}`,
    script: `https://8x8.vc/${cfg.appId}/external_api.js`,
    jwt: await tokenJaas(cfg, codigo, p),
    nome: p.nome,
  };
}

// ─── Salas ──────────────────────────────────────────────────────────────────────────────────────

const ehEscritorio = (q: Quem) => q.perfil === 'admin' || q.perfil === 'secretario';

export interface SalaVisao { id: number; codigo: string; titulo: string; criadoPor: number; criadaEm: string | null; encerrada: boolean; link: string }

function visao(r: any): SalaVisao {
  return {
    id: Number(r.id), codigo: String(r.codigo), titulo: String(r.titulo), criadoPor: Number(r.criadoPor),
    criadaEm: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    encerrada: !!r.encerradaEm, link: linkPublicoSala(String(r.codigo)),
  };
}

export async function criarSala(dados: { titulo: string; leadId?: number | null }, q: Quem) {
  const titulo = dados.titulo.trim().replace(/\s+/g, ' ').slice(0, MAX_TITULO_SALA);
  if (titulo.length < 2) throw new SalaErro('Dê um nome à reunião');
  const db = await banco();
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoSala(() => crypto.randomInt(0, 1_000_000) / 1_000_000);
    try {
      const r = await db.insert(salasVideo).values({ codigo, titulo, criadoPor: q.id, leadId: dados.leadId ?? null });
      return visao({ id: idInserido(r), codigo, titulo, criadoPor: q.id, createdAt: new Date() });
    } catch (e) {
      if (!duplicado(e)) throw e;
    }
  }
  throw new SalaErro('Não consegui criar a sala, tente de novo', 500);
}

/** Salas de quem pediu (o escritório vê todas), mais recentes primeiro. */
export async function listarSalas(q: Quem): Promise<SalaVisao[]> {
  const db = await banco();
  const base = db.select().from(salasVideo);
  const rows = await (ehEscritorio(q) ? base : base.where(eq(salasVideo.criadoPor, q.id))).orderBy(desc(salasVideo.createdAt)).limit(100);
  return rows.map(visao);
}

async function salaPorCodigo(codigo: string) {
  if (!codigoValido(codigo)) throw new SalaErro('Sala não encontrada', 404);
  const db = await banco();
  const [r] = await db.select().from(salasVideo).where(eq(salasVideo.codigo, codigo)).limit(1);
  if (!r) throw new SalaErro('Sala não encontrada', 404);
  return r;
}

/** Quem tem login entra como moderador se criou a sala (ou é do escritório). */
export async function entrarComoUsuario(codigo: string, q: Quem): Promise<Entrada & { titulo: string; link: string }> {
  const r = await salaPorCodigo(codigo);
  if (r.encerradaEm) throw new SalaErro('Esta sala foi encerrada', 410);
  const moderador = Number(r.criadoPor) === q.id || ehEscritorio(q);
  const e = await entrada(codigo, { id: `u${q.id}`, nome: q.nome, email: q.email, moderador });
  return { ...e, titulo: String(r.titulo), link: linkPublicoSala(codigo) };
}

/** Página pública: só o título e quem convida (sem dados internos). */
export async function salaPublica(codigo: string) {
  const r = await salaPorCodigo(codigo);
  const db = await banco();
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, Number(r.criadoPor))).limit(1);
  return { titulo: String(r.titulo), anfitriao: u?.name ? String(u.name) : null, encerrada: !!r.encerradaEm, modo: modoSala() };
}

export async function entrarComoConvidado(codigo: string, nome: string): Promise<Entrada & { titulo: string }> {
  const n = nomeParticipanteValido(nome);
  if (!n) throw new SalaErro('Digite o seu nome para entrar');
  const r = await salaPorCodigo(codigo);
  if (r.encerradaEm) throw new SalaErro('Esta reunião já foi encerrada', 410);
  const e = await entrada(codigo, { id: `c${crypto.randomBytes(6).toString('hex')}`, nome: n, moderador: false });
  return { ...e, titulo: String(r.titulo) };
}

export async function encerrarSala(codigo: string, q: Quem) {
  const r = await salaPorCodigo(codigo);
  if (Number(r.criadoPor) !== q.id && !ehEscritorio(q)) throw new SalaErro('Só quem criou a sala pode encerrar', 403);
  const db = await banco();
  await db.update(salasVideo).set({ encerradaEm: new Date() }).where(eq(salasVideo.id, r.id));
  return { ok: true };
}
