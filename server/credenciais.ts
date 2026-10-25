/**
 * Credenciais profissionais e documentos pessoais (MD "Credenciais Profissionais — CRECI / CNAI").
 * Tudo no banco (o disco do Railway se apaga a cada deploy): arquivo original, páginas PNG (1600 px;
 * PDF → até 2 páginas, frente e verso, com pdftoppm) e miniatura WEBP 400 px.
 * Anexação no contrato (pdf-lib) e alerta de vencimento pelo WhatsApp (08:00, a cada 2 dias).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, transacao } from "./db";
import { configCredenciais, users, usuarioDocumentoPaginas, usuarioDocumentos } from "../drizzle/schema";
import {
  CREDENCIAIS, LINK_CERTIDAO_PADRAO, PRAZOS_PADRAO, ROTULO_DOCUMENTO, detectarMime, linkCrecUf, maisDias, problemaArquivo, statusValidade, tipoUnico,
  type StatusValidade,
} from "../shared/cadastro";

const run = promisify(execFile);

export class ErroArquivo extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface Convertido { paginas: Buffer[]; thumb: Buffer }
export type Conversor = (buf: Buffer, mime: string) => Promise<Convertido>;

/** Conversão real: sharp para imagem, pdftoppm (poppler-utils, no Dockerfile) para PDF */
const conversorPadrao: Conversor = async (buf, mime) => {
  const sharp = (await import("sharp")).default;
  const paginas: Buffer[] = [];
  if (mime === "application/pdf") {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "credencial-"));
    try {
      const entrada = path.join(dir, "doc.pdf");
      await fs.writeFile(entrada, buf);
      await run("pdftoppm", ["-png", "-r", "150", "-f", "1", "-l", "2", "-scale-to-x", "1600", "-scale-to-y", "-1", entrada, path.join(dir, "p")], { timeout: 30_000 });
      const arquivos = (await fs.readdir(dir)).filter(f => f.startsWith("p") && f.endsWith(".png")).sort();
      if (!arquivos.length) throw new Error("Não foi possível converter o PDF");
      for (const f of arquivos) paginas.push(await fs.readFile(path.join(dir, f)));
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } else {
    paginas.push(await sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).png().toBuffer());
  }
  const thumb = await sharp(paginas[0]).resize({ width: 400 }).webp({ quality: 80 }).toBuffer();
  return { paginas, thumb };
};

let conversor: Conversor = conversorPadrao;
/** Testes trocam o conversor (sem sharp/poppler na máquina) */
export const definirConversor = (c: Conversor | null) => { conversor = c ?? conversorPadrao; };

export async function converter(buf: Buffer): Promise<Convertido & { mime: string }> {
  const mime = detectarMime(buf);
  if (!mime) throw new ErroArquivo(415, "Formato não suportado (use PNG, JPG, WEBP ou PDF)");
  try {
    return { ...(await conversor(buf, mime)), mime };
  } catch (e: any) {
    throw new ErroArquivo(422, e?.message || "Falha ao processar o arquivo");
  }
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

/** Prazos e links (configCredenciais; sem linha = padrão do MD) */
export async function configuracao() {
  const db = await dbOrThrow();
  const rows: any[] = await db.select().from(configCredenciais).catch(() => []);
  const v = new Map(rows.map(r => [r.chave, r.valor]));
  const n = (k: string, p: number) => (Number(v.get(k)) > 0 ? Number(v.get(k)) : p);
  return {
    certidaoValidadeDias: n("certidao_validade_dias", PRAZOS_PADRAO.certidaoValidadeDias),
    certidaoAlertaDias: n("certidao_alerta_dias", PRAZOS_PADRAO.certidaoAlertaDias),
    cartaoAlertaDias: n("cartao_alerta_dias", PRAZOS_PADRAO.cartaoAlertaDias),
    linkCertidao: (uf: string | null | undefined) => v.get(`link_certidao_${String(uf || "MA").toUpperCase()}`) || (String(uf || "MA").toUpperCase() === "MA" ? LINK_CERTIDAO_PADRAO : linkCrecUf(uf)),
  };
}

/** Status com o prazo de alerta do tipo (certidão: 5 dias; cartão: 30; demais: só vencida) */
export function statusDoDocumento(tipo: string, validade: string | null, prazos = PRAZOS_PADRAO, hoje = new Date()): { status: StatusValidade; dias: number | null } {
  const alerta = tipo === "certidao_creci" ? prazos.certidaoAlertaDias : tipo === "cartao_creci" ? prazos.cartaoAlertaDias : 0;
  return statusValidade(validade, alerta, hoje);
}

export interface MetaDocumento {
  titular?: "usuario" | "conjuge";
  numero?: string | null;
  validade?: string | null;
  linkVerificacao?: string | null;
  linkEmissao?: string | null;
  anexarDocumentos?: boolean;
  exibirPerfil?: boolean;
}

/** Problema nos metadados (links https, validade ISO, nº CNAI só dígitos 4–10) */
export function problemaMeta(tipo: string, m: MetaDocumento): string | null {
  for (const l of [m.linkVerificacao, m.linkEmissao]) {
    if (l && (!/^https:\/\//i.test(l) || l.length > 500)) return "Link precisa começar com https:// (até 500 caracteres)";
  }
  if (m.validade && !/^\d{4}-\d{2}-\d{2}$/.test(m.validade)) return "Validade inválida (AAAA-MM-DD)";
  if (tipo === "certificado_cnai" && m.numero && !/^\d{4,10}$/.test(m.numero)) return "Nº CNAI: só dígitos (4 a 10)";
  return null;
}

async function gravarPaginas(tx: any, documentoId: number, paginas: Buffer[]) {
  await tx.delete(usuarioDocumentoPaginas).where(eq(usuarioDocumentoPaginas.documentoId, documentoId));
  for (let i = 0; i < paginas.length; i++) {
    await tx.insert(usuarioDocumentoPaginas).values({ documentoId, n: i + 1, pngBase64: paginas[i].toString("base64") } as any);
  }
}

/**
 * Novo documento. Cartão/certidão/CNAI do titular usuário: substitui o anterior (um só por usuário).
 * Certidão sem validade: hoje + 30 dias (configCredenciais). Retorna o id.
 */
export async function enviarDocumento(usuarioId: number, tipo: string, buf: Buffer, nome: string, meta: MetaDocumento, autorId: number): Promise<number> {
  const p = problemaArquivo(tipo, buf);
  if (p) throw new ErroArquivo(p.status, p.erro);
  const titular = meta.titular === "conjuge" && !tipoUnico(tipo) ? "conjuge" : "usuario";
  const erroMeta = problemaMeta(tipo, meta);
  if (erroMeta) throw new ErroArquivo(400, erroMeta);
  const arq = await converter(buf);
  const db = await dbOrThrow();
  const cfg = await configuracao();
  const validade = meta.validade || (tipo === "certidao_creci" ? maisDias(cfg.certidaoValidadeDias) : null);
  let id = 0;
  await transacao(db, async (tx: any) => {
    if (tipoUnico(tipo)) {
      await tx.delete(usuarioDocumentos).where(and(eq(usuarioDocumentos.usuarioId, usuarioId), eq(usuarioDocumentos.tipo, tipo), eq(usuarioDocumentos.titular, "usuario")));
    }
    const r: any = await tx.insert(usuarioDocumentos).values({
      usuarioId, tipo, titular, nome: nome.slice(0, 200), mime: arq.mime, tamanhoBytes: buf.length, conteudoBase64: buf.toString("base64"),
      validade, numero: meta.numero ?? null, linkVerificacao: meta.linkVerificacao ?? null, linkEmissao: meta.linkEmissao ?? null,
      anexarDocumentos: meta.anexarDocumentos ?? tipo !== "certificado_cnai", exibirPerfil: meta.exibirPerfil ?? tipo === "certificado_cnai",
      thumbBase64: arq.thumb.toString("base64"), paginasQtd: arq.paginas.length, enviadoPor: autorId,
    } as any);
    id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
    await gravarPaginas(tx, id, arq.paginas);
  });
  if (tipo === "certidao_creci") await db.update(users).set({ certidaoCreciValidade: validade } as any).where(eq(users.id, usuarioId));
  return id;
}

/** Troca o arquivo e mantém os metadados (certidão sem validade: hoje + 30) */
export async function trocarArquivo(documentoId: number, buf: Buffer, nome: string): Promise<void> {
  const db = await dbOrThrow();
  const [doc]: any[] = await db.select().from(usuarioDocumentos).where(eq(usuarioDocumentos.id, documentoId)).limit(1);
  if (!doc) throw new ErroArquivo(404, "Documento não encontrado");
  const p = problemaArquivo(doc.tipo, buf);
  if (p) throw new ErroArquivo(p.status, p.erro);
  const arq = await converter(buf);
  await transacao(db, async (tx: any) => {
    await tx.update(usuarioDocumentos).set({
      nome: nome.slice(0, 200), mime: arq.mime, tamanhoBytes: buf.length, conteudoBase64: buf.toString("base64"),
      thumbBase64: arq.thumb.toString("base64"), paginasQtd: arq.paginas.length, alertaEnviadoEm: null,
    } as any).where(eq(usuarioDocumentos.id, documentoId));
    await gravarPaginas(tx, documentoId, arq.paginas);
  });
}

/** Documento com permissão: o admin ou o dono */
export async function documentoDe(documentoId: number) {
  const db = await dbOrThrow();
  const [doc]: any[] = await db.select().from(usuarioDocumentos).where(eq(usuarioDocumentos.id, documentoId)).limit(1);
  return doc ?? null;
}

/** Página PNG (documentos antigos, sem páginas: converte na hora e guarda) */
export async function paginaDoDocumento(documentoId: number, n: number): Promise<Buffer | null> {
  const db = await dbOrThrow();
  const [pg]: any[] = await db.select().from(usuarioDocumentoPaginas).where(and(eq(usuarioDocumentoPaginas.documentoId, documentoId), eq(usuarioDocumentoPaginas.n, n))).limit(1);
  if (pg) return Buffer.from(pg.pngBase64, "base64");
  const [doc]: any[] = await db.select().from(usuarioDocumentos).where(eq(usuarioDocumentos.id, documentoId)).limit(1);
  if (!doc || doc.paginasQtd) return null;
  const arq = await converter(Buffer.from(doc.conteudoBase64, "base64"));
  await transacao(db, async (tx: any) => {
    await gravarPaginas(tx, documentoId, arq.paginas);
    await tx.update(usuarioDocumentos).set({ thumbBase64: arq.thumb.toString("base64"), paginasQtd: arq.paginas.length } as any).where(eq(usuarioDocumentos.id, documentoId));
  });
  return arq.paginas[n - 1] ?? null;
}

/** Lista para a tela (sem o conteúdo), com status de validade e link da certidão da UF */
export async function listarDocumentos(usuarioId: number) {
  const db = await dbOrThrow();
  const cfg = await configuracao();
  const [u]: any[] = await db.select({ creciUf: users.creciUf }).from(users).where(eq(users.id, usuarioId)).limit(1);
  const rows: any[] = await db.select({
    id: usuarioDocumentos.id, tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, nome: usuarioDocumentos.nome, mime: usuarioDocumentos.mime,
    tamanhoBytes: usuarioDocumentos.tamanhoBytes, validade: usuarioDocumentos.validade, numero: usuarioDocumentos.numero,
    linkVerificacao: usuarioDocumentos.linkVerificacao, linkEmissao: usuarioDocumentos.linkEmissao, anexarDocumentos: usuarioDocumentos.anexarDocumentos,
    exibirPerfil: usuarioDocumentos.exibirPerfil, paginasQtd: usuarioDocumentos.paginasQtd, criadoEm: usuarioDocumentos.createdAt,
  }).from(usuarioDocumentos).where(eq(usuarioDocumentos.usuarioId, usuarioId)).orderBy(asc(usuarioDocumentos.id));
  return {
    linkCertidaoPadrao: cfg.linkCertidao(u?.creciUf),
    validadeSugeridaCertidao: maisDias(cfg.certidaoValidadeDias),
    documentos: rows.map(r => ({
      ...r, anexarDocumentos: !!r.anexarDocumentos, exibirPerfil: !!r.exibirPerfil, rotulo: ROTULO_DOCUMENTO[r.tipo as keyof typeof ROTULO_DOCUMENTO] ?? r.tipo,
      ...statusDoDocumento(r.tipo, r.validade, cfg),
    })),
  };
}

export async function atualizarDocumento(documentoId: number, m: MetaDocumento) {
  const db = await dbOrThrow();
  const [doc]: any[] = await db.select().from(usuarioDocumentos).where(eq(usuarioDocumentos.id, documentoId)).limit(1);
  if (!doc) throw new ErroArquivo(404, "Documento não encontrado");
  const erro = problemaMeta(doc.tipo, m);
  if (erro) throw new ErroArquivo(400, erro);
  if (doc.tipo === "certidao_creci" && m.validade === null) throw new ErroArquivo(400, "A certidão precisa de validade");
  const set: Record<string, unknown> = {};
  for (const k of ["numero", "validade", "linkVerificacao", "linkEmissao", "anexarDocumentos", "exibirPerfil"] as const) if (m[k] !== undefined) set[k] = m[k] === "" ? null : m[k];
  if (m.validade !== undefined) set.alertaEnviadoEm = null; // nova validade: o alerta pode sair de novo
  if (Object.keys(set).length) await db.update(usuarioDocumentos).set(set as any).where(eq(usuarioDocumentos.id, documentoId));
  if (doc.tipo === "certidao_creci" && m.validade !== undefined) await db.update(users).set({ certidaoCreciValidade: m.validade } as any).where(eq(users.id, doc.usuarioId));
  return { ok: true };
}

/** Remove o registro, as páginas e a miniatura (tudo no banco) */
export async function removerDocumento(documentoId: number) {
  const db = await dbOrThrow();
  const [doc]: any[] = await db.select({ usuarioId: usuarioDocumentos.usuarioId, tipo: usuarioDocumentos.tipo }).from(usuarioDocumentos).where(eq(usuarioDocumentos.id, documentoId)).limit(1);
  await transacao(db, async (tx: any) => {
    await tx.delete(usuarioDocumentoPaginas).where(eq(usuarioDocumentoPaginas.documentoId, documentoId));
    await tx.delete(usuarioDocumentos).where(eq(usuarioDocumentos.id, documentoId));
  });
  if (doc?.tipo === "certidao_creci") await db.update(users).set({ certidaoCreciValidade: null } as any).where(eq(users.id, doc.usuarioId));
  return { ok: true };
}

// ─── Anexação no contrato ────────────────────────────────────────────────────

/** Quais credenciais vão anexadas (ordem: cartão, certidão, CNAI) e os avisos — certidão vencida não vai */
export function credenciaisParaAnexar<T extends { tipo: string; validade?: string | null; anexarDocumentos?: boolean | number; titular?: string | null }>(docs: T[], hoje = new Date()) {
  const avisos: string[] = [];
  const ordem = CREDENCIAIS as readonly string[];
  const anexar = docs
    .filter(d => (d.titular ?? "usuario") === "usuario" && ordem.includes(d.tipo) && (d.anexarDocumentos === true || d.anexarDocumentos === 1))
    .sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo))
    .filter(d => {
      if (d.tipo === "certidao_creci" && statusValidade(d.validade, 0, hoje).status === "vencida") { avisos.push("Certidão CRECI vencida — não anexada"); return false; }
      return true;
    });
  return { anexar, avisos };
}

/**
 * Acrescenta ao PDF do contrato/procuração as páginas das credenciais do intermediador (A4, centralizadas).
 * Os avisos voltam para o gerador mostrar (toast âmbar). Ponto de entrada para o módulo de contrato.
 */
export async function anexarCredenciais(usuarioId: number, pdfBytes: Uint8Array): Promise<{ pdf: Uint8Array; avisos: string[] }> {
  const db = await dbOrThrow();
  const docs: any[] = await db.select({ id: usuarioDocumentos.id, tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, validade: usuarioDocumentos.validade, anexarDocumentos: usuarioDocumentos.anexarDocumentos })
    .from(usuarioDocumentos).where(and(eq(usuarioDocumentos.usuarioId, usuarioId), inArray(usuarioDocumentos.tipo, [...CREDENCIAIS])));
  const { anexar, avisos } = credenciaisParaAnexar(docs);
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdfBytes);
  for (const d of anexar) {
    const paginas: any[] = await db.select().from(usuarioDocumentoPaginas).where(eq(usuarioDocumentoPaginas.documentoId, d.id)).orderBy(asc(usuarioDocumentoPaginas.n));
    for (const p of paginas) {
      try {
        const img = await doc.embedPng(Buffer.from(p.pngBase64, "base64"));
        const page = doc.addPage([595.28, 841.89]);
        const m = 40, maxW = 595.28 - 2 * m, maxH = 841.89 - 2 * m;
        const s = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * s, h = img.height * s;
        page.drawImage(img, { x: (595.28 - w) / 2, y: 841.89 - m - h, width: w, height: h });
      } catch {
        avisos.push(`Falha ao anexar ${ROTULO_DOCUMENTO[d.tipo as keyof typeof ROTULO_DOCUMENTO] ?? d.tipo}`);
      }
    }
  }
  return { pdf: await doc.save(), avisos };
}

// ─── Alertas de vencimento (WhatsApp) ────────────────────────────────────────

/** Documento que pede alerta hoje: certidão ≤ N dias, cartão ≤ 30 dias; um alerta a cada 2 dias */
export function precisaAlerta(d: { tipo: string; validade: string | null; alertaEnviadoEm?: string | null }, prazos = PRAZOS_PADRAO, hoje = new Date()): boolean {
  if (d.tipo !== "certidao_creci" && d.tipo !== "cartao_creci") return false;
  const { status } = statusDoDocumento(d.tipo, d.validade, prazos, hoje);
  if (status !== "vencida" && status !== "a_vencer") return false;
  if (!d.alertaEnviadoEm) return true;
  return statusValidade(d.alertaEnviadoEm, 0, hoje).dias! <= -2; // último alerta há 2 dias ou mais
}

export function mensagemAlerta(nome: string, tipo: string, validade: string, link: string, hoje = new Date()): string {
  const venc = validade.split("-").reverse().join("/");
  const vencida = statusValidade(validade, 0, hoje).status === "vencida";
  const doc = tipo === "certidao_creci" ? "Certidão de Regularidade CRECI" : "Cartão de Regularidade CRECI";
  return `Olá, ${String(nome || "").split(" ")[0] || "corretor"}! Sua ${doc} ${vencida ? "venceu" : "vence"} em ${venc}. ` +
    `Emita a nova em ${link} e atualize no CRM Romatec (Meu cadastro › Credenciais).`;
}

/** Roda uma vez por dia a partir das 08:00 (Fortaleza): manda os alertas pendentes */
export async function rodarAlertasCredenciais(enviar: (tel: string, msg: string) => Promise<unknown>, hoje = new Date()) {
  const db = await dbOrThrow();
  const cfg = await configuracao();
  const docs: any[] = await db.select({
    id: usuarioDocumentos.id, tipo: usuarioDocumentos.tipo, validade: usuarioDocumentos.validade, linkEmissao: usuarioDocumentos.linkEmissao,
    alertaEnviadoEm: usuarioDocumentos.alertaEnviadoEm, titular: usuarioDocumentos.titular, usuarioId: usuarioDocumentos.usuarioId,
  }).from(usuarioDocumentos).where(inArray(usuarioDocumentos.tipo, ["certidao_creci", "cartao_creci"]));
  const alvo = docs.filter(d => d.titular === "usuario" && d.validade && precisaAlerta(d, cfg, hoje));
  if (!alvo.length) return 0;
  const pessoas: any[] = await db.select({ id: users.id, name: users.name, telefone: users.telefone, creciUf: users.creciUf, ativo: users.ativo }).from(users)
    .where(inArray(users.id, Array.from(new Set(alvo.map(d => d.usuarioId)))));
  const P = new Map(pessoas.map(p => [p.id, p]));
  const hojeIso = new Date(hoje.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  let enviados = 0;
  for (const d of alvo) {
    const u = P.get(d.usuarioId);
    if (!u || u.ativo === false || u.ativo === 0 || !u.telefone) continue;
    try {
      await enviar(u.telefone, mensagemAlerta(u.name, d.tipo, d.validade, d.linkEmissao || cfg.linkCertidao(u.creciUf), hoje));
      await db.update(usuarioDocumentos).set({ alertaEnviadoEm: hojeIso } as any).where(eq(usuarioDocumentos.id, d.id));
      enviados++;
    } catch (e: any) {
      console.error("[Credenciais] Alerta não enviado", d.id, e?.message);
    }
  }
  return enviados;
}

let ultimoDia = "";
/** Job: confere a cada 30 min; dispara uma vez por dia depois das 08:00 de Fortaleza */
export function iniciarJobCredenciais() {
  const tick = async () => {
    const agora = new Date(Date.now() - 3 * 3600_000); // Fortaleza (UTC-3, sem horário de verão)
    const dia = agora.toISOString().slice(0, 10);
    if (agora.getUTCHours() < 8 || dia === ultimoDia) return;
    ultimoDia = dia;
    try {
      const { enviarTexto } = await import("./leads/zapiClient");
      const n = await rodarAlertasCredenciais((tel, msg) => enviarTexto(tel, msg));
      if (n) console.log(`[Credenciais] ${n} alerta(s) de vencimento enviados`);
    } catch (e: any) {
      console.error("[Credenciais] Job falhou:", e?.message);
    }
  };
  setInterval(tick, 30 * 60_000).unref?.();
  setTimeout(tick, 60_000).unref?.();
}

/** Nome de arquivo seguro (cabeçalho X-File-Name) */
export const nomeSeguro = (n: string) => decodeURIComponent(n || "documento").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200) || `doc-${crypto.randomUUID().slice(0, 8)}`;
