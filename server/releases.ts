/**
 * Notas de versão (v1.7.0): importa o RELEASE_NOTES.md ao subir, versão no ar para o banner
 * "Nova versão disponível", novidades não lidas por pessoa, histórico do sino e publicação pelo admin.
 * Regras puras (leitura do arquivo, semver) em shared/releases.ts.
 */
import crypto from "crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { leadQualifications, systemRelease, systemReleaseLeitura, users } from "../drizzle/schema";
import { infoVersao } from "./_core/systemRouter";
import { perfilDe } from "../shared/equipe";
import { compararVersao, lerReleaseNotes, problemaRelease, releaseParaPerfil, type ItensRelease, type Release } from "../shared/releases";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

const DIA = 86_400_000;
/** Usuário novo não recebe o histórico inteiro: só o que saiu até 30 dias antes do cadastro */
const JANELA_NOVO_USUARIO = 30 * DIA;

export interface ReleaseTela {
  id: number; versao: string; tipo: string; titulo: string; itens: ItensRelease; obrigatoria: boolean;
  publico: string; publicadoEm: string; ativo: boolean; lida?: boolean;
}

function itensDe(v: unknown): ItensRelease {
  const o: any = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v ?? {};
  const l = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
  return { novo: l(o.novo), melhorias: l(o.melhorias), correcoes: l(o.correcoes), avisos: l(o.avisos) };
}

function paraTela(r: any): ReleaseTela {
  return {
    id: r.id, versao: r.versao, tipo: r.tipo, titulo: r.titulo, itens: itensDe(r.itens), obrigatoria: !!r.obrigatoria,
    publico: r.publico, publicadoEm: new Date(r.publicadoEm).toISOString(), ativo: !!r.ativo,
  };
}

const hashDe = (r: Release) => crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex");

/** Data da release: hoje = agora; data passada = meio-dia de Fortaleza daquele dia */
function dataPublicacao(data: string, agora = new Date()): Date {
  const hoje = new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  return data >= hoje ? agora : new Date(`${data}T12:00:00-03:00`);
}

/**
 * Ao subir: grava as versões do RELEASE_NOTES.md (só as que mudaram desde a última importação —
 * uma correção feita pelo admin na tela continua valendo até o texto do arquivo mudar).
 */
export async function importarReleaseNotes(arquivo = join(process.cwd(), "RELEASE_NOTES.md")) {
  let md: string;
  try {
    md = await readFile(arquivo, "utf8");
  } catch {
    return 0; // sem arquivo: nada a importar
  }
  const releases = lerReleaseNotes(md);
  const db = await dbOrThrow();
  let gravadas = 0;
  for (const r of releases) {
    const hash = hashDe(r);
    const [ja]: any[] = await db.select({ id: systemRelease.id, hashArquivo: systemRelease.hashArquivo }).from(systemRelease).where(eq(systemRelease.versao, r.versao)).limit(1);
    const dados = { tipo: r.tipo, titulo: r.titulo, itens: r.itens, obrigatoria: r.obrigatoria, publico: r.publico, hashArquivo: hash };
    if (!ja) {
      await db.insert(systemRelease).values({ versao: r.versao, ...dados, publicadoEm: dataPublicacao(r.data), publicadoPor: null, ativo: true } as any);
      gravadas++;
    } else if (ja.hashArquivo !== hash) {
      await db.update(systemRelease).set(dados as any).where(eq(systemRelease.id, ja.id));
      gravadas++;
    }
  }
  if (gravadas) console.log(`[Releases] ${gravadas} versão(ões) do RELEASE_NOTES.md gravada(s); no ar: v${infoVersao().versao}`);
  return gravadas;
}

/**
 * Versão no ar para o banner: é a do build deste servidor (package.json) — um aviso publicado pelo admin
 * não muda o código, então não pede "atualizar". "obrigatoria" vem da release dessa versão.
 */
export async function versaoNoAr() {
  const info = infoVersao();
  const db = await getDb();
  const [r]: any[] = db ? await (db as any).select({ obrigatoria: systemRelease.obrigatoria, publicadoEm: systemRelease.publicadoEm })
    .from(systemRelease).where(and(eq(systemRelease.versao, info.versao), eq(systemRelease.ativo, true))).limit(1).catch(() => []) : [];
  return { versao: info.versao, obrigatoria: !!r?.obrigatoria, publicadoEm: r?.publicadoEm ? new Date(r.publicadoEm).toISOString() : null, commit: info.commit };
}

type Usuario = { id: number; role?: string | null; perfil?: string | null; createdAt?: Date | string | null };

/** Releases ativas que a pessoa vê, com "lida" (antigas para quem chegou depois contam como lidas) */
async function releasesDo(u: Usuario) {
  const db = await dbOrThrow();
  const perfil = perfilDe(u as any);
  const todas: any[] = await db.select().from(systemRelease).where(eq(systemRelease.ativo, true)).orderBy(desc(systemRelease.publicadoEm), desc(systemRelease.id));
  const visiveis = todas.filter(r => releaseParaPerfil(r.publico, perfil));
  const lidas: any[] = visiveis.length
    ? await db.select({ releaseId: systemReleaseLeitura.releaseId }).from(systemReleaseLeitura)
      .where(and(eq(systemReleaseLeitura.usuarioId, u.id), inArray(systemReleaseLeitura.releaseId, visiveis.map(r => r.id))))
    : [];
  const L = new Set(lidas.map(l => l.releaseId));
  const corte = u.createdAt ? new Date(u.createdAt).getTime() - JANELA_NOVO_USUARIO : 0;
  return visiveis.map(r => ({ ...paraTela(r), lida: L.has(r.id) || new Date(r.publicadoEm).getTime() < corte }));
}

/** Histórico do sino (mais nova primeiro) */
export async function listarReleases(u: Usuario, limite = 20) {
  return (await releasesDo(u)).slice(0, limite);
}

/** "Novidades da versão": não lidas, da mais antiga para a mais nova (até 10) */
export async function releasesNaoLidas(u: Usuario) {
  return (await releasesDo(u)).filter(r => !r.lida).reverse().slice(0, 10);
}

async function gravarLeitura(db: any, releaseId: number, usuarioId: number) {
  const [ja]: any[] = await db.select({ releaseId: systemReleaseLeitura.releaseId }).from(systemReleaseLeitura)
    .where(and(eq(systemReleaseLeitura.releaseId, releaseId), eq(systemReleaseLeitura.usuarioId, usuarioId))).limit(1);
  if (ja) return;
  try {
    await db.insert(systemReleaseLeitura).values({ releaseId, usuarioId } as any);
  } catch (e: any) {
    if (!/Duplicate|UNIQUE/i.test(e?.message ?? "")) throw e; // dois aparelhos ao mesmo tempo
  }
}

export async function marcarLida(u: Usuario, releaseIds: number[]) {
  const db = await dbOrThrow();
  const permitidas = new Set((await releasesDo(u)).map(r => r.id));
  for (const id of releaseIds) if (permitidas.has(id)) await gravarLeitura(db, id, u.id);
  return { ok: true };
}

export async function marcarTodasLidas(u: Usuario) {
  const db = await dbOrThrow();
  for (const r of await releasesDo(u)) if (!r.lida) await gravarLeitura(db, r.id, u.id);
  return { ok: true };
}

// ─── Admin: publicar / editar / desativar pela tela ─────────────────────────
export interface DadosRelease {
  versao: string; tipo: string; titulo: string; itens: ItensRelease; obrigatoria: boolean; publico: string;
}

/** Maior versão já publicada (a nova precisa passar dela) */
export async function ultimaVersao(): Promise<string> {
  const db = await dbOrThrow();
  const rows: any[] = await db.select({ versao: systemRelease.versao }).from(systemRelease);
  return rows.map(r => r.versao).reduce((m: string, v: string) => (compararVersao(v, m) > 0 ? v : m), infoVersao().versao);
}

export async function publicarRelease(d: DadosRelease, autorId: number) {
  const erro = problemaRelease(d, await ultimaVersao());
  if (erro) throw new Error(erro);
  const db = await dbOrThrow();
  await db.insert(systemRelease).values({ ...d, publicadoPor: autorId, publicadoEm: new Date(), ativo: true } as any);
  return { ok: true };
}

export async function editarRelease(id: number, d: Omit<DadosRelease, "versao">) {
  const erro = problemaRelease({ versao: "0.0.0", ...d });
  if (erro) throw new Error(erro);
  const db = await dbOrThrow();
  await db.update(systemRelease).set(d as any).where(eq(systemRelease.id, id));
  return { ok: true };
}

export async function definirAtivo(id: number, ativo: boolean) {
  const db = await dbOrThrow();
  await db.update(systemRelease).set({ ativo } as any).where(eq(systemRelease.id, id));
  return { ok: true };
}

/** Todas (inclusive desativadas) para a tela do admin */
export async function todasReleases() {
  const db = await dbOrThrow();
  const rows: any[] = await db.select().from(systemRelease).orderBy(desc(systemRelease.publicadoEm), desc(systemRelease.id));
  return rows.map(paraTela);
}

// ─── Tela de descanso ───────────────────────────────────────────────────────
/** Leads novos desde `desde` (corretor: só os dele; admin e secretário: todos) */
export async function novosLeadsDesde(u: Usuario, desde: Date): Promise<number> {
  const db = await dbOrThrow();
  const filtros = [gt(leadQualifications.createdAt, desde)];
  if (perfilDe(u as any) === "corretor") filtros.push(eq((leadQualifications as any).responsavelId, u.id));
  const rows: any[] = await db.select({ id: leadQualifications.id }).from(leadQualifications).where(and(...filtros)).limit(100);
  return rows.length;
}

/** Tempo da tela de descanso escolhido pela pessoa */
export async function definirDescanso(usuarioId: number, minutos: number) {
  const db = await dbOrThrow();
  await db.update(users).set({ descansoMinutos: minutos } as any).where(eq(users.id, usuarioId));
  return { ok: true, minutos };
}
