/**
 * Equipe do CRM (só o administrador): cadastra colaboradores e empreendedores,
 * gera o link de primeiro acesso e desativa acessos. O próprio colaborador cria
 * a senha no primeiro acesso (confirmando o e-mail) e depois entra com CRECI + senha.
 */
import crypto from "crypto";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, empreendimentos } from "../../drizzle/schema";
import { PERFIS, DIAS_CONVITE, normalizarCreci, conviteValido, mascararEmail, perfilDe } from "../../shared/equipe";
import { appUrl } from "../leads/config";
import { createRateLimiter } from "../lead-intake";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Novo convite: o token só vai no link; no banco fica o sha256 */
function novoConvite() {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), expira: new Date(Date.now() + DIAS_CONVITE * 24 * 3600_000) };
}

const linkConvite = (token: string) => `${appUrl()}/primeiro-acesso?convite=${token}`;

const allowConvite = createRateLimiter(10, 15 * 60 * 1000);

const dados = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  creci: z.string().trim().max(30).optional().nullable(),
  telefone: z.string().trim().max(25).optional().nullable(),
  perfil: z.enum(PERFIS),
  empreendimentoSlug: z.string().trim().max(80).optional().nullable(),
});

async function validar(db: any, d: { email: string; creci?: string | null; perfil: string; empreendimentoSlug?: string | null }, idAtual?: number) {
  const creci = d.creci ? normalizarCreci(d.creci) : null;
  if (d.creci && !creci) throw new Error("CRECI inválido: use só o número (ex.: 4705)");
  if (d.perfil !== "empreendedor" && !creci) throw new Error("Informe o CRECI: é o login do colaborador");
  if (d.perfil === "empreendedor" && !d.empreendimentoSlug) throw new Error("Escolha o empreendimento do empreendedor");
  const outro = idAtual ? ne(users.id, idAtual) : undefined;
  const [mesmoEmail] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, d.email), ...(outro ? [outro] : []))).limit(1);
  if (mesmoEmail) throw new Error("Já existe alguém com este e-mail");
  if (creci) {
    const [mesmoCreci] = await db.select({ id: users.id }).from(users).where(and(eq(users.creci, creci), ...(outro ? [outro] : []))).limit(1);
    if (mesmoCreci) throw new Error(`O CRECI ${creci} já está cadastrado`);
  }
  return creci;
}

export const equipeRouter = router({
  list: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows: any[] = await db.select().from(users);
    const emps: any[] = await db.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos);
    return {
      empreendimentos: emps,
      pessoas: rows.map(u => ({
        id: u.id, nome: u.name, email: u.email, creci: u.creci, telefone: u.telefone,
        perfil: perfilDe(u), role: u.role, empreendimentoSlug: u.empreendimentoSlug,
        ativo: u.ativo !== false && u.ativo !== 0,
        temSenha: !!(u.passwordScrypt || u.passwordHash),
        convitePendente: !!u.conviteHash && conviteValido(u.conviteExpira),
        ultimoAcesso: u.lastSignedIn,
      })).sort((a, b) => Number(b.perfil === "admin") - Number(a.perfil === "admin") || String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    };
  }),

  create: adminProcedure.input(dados).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const creci = await validar(db, input);
    const c = novoConvite();
    await db.insert(users).values({
      openId: `equipe:${crypto.randomUUID()}`,
      name: input.nome, email: input.email, loginMethod: "senha",
      // O administrador continua sendo só o José: quem é cadastrado aqui entra como colaborador
      role: "user", perfil: input.perfil === "admin" ? "equipe" : input.perfil,
      creci, telefone: input.telefone || null,
      empreendimentoSlug: input.perfil === "empreendedor" ? input.empreendimentoSlug : null,
      ativo: true, conviteHash: c.hash, conviteExpira: c.expira,
    } as any);
    return { link: linkConvite(c.token), expira: c.expira };
  }),

  update: adminProcedure.input(dados.partial().extend({ id: z.number().int(), ativo: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [atual]: any[] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
    if (!atual) throw new Error("Pessoa não encontrada");
    if (atual.id === ctx.user.id && input.ativo === false) throw new Error("Você não pode desativar o seu próprio acesso");
    const perfil = input.perfil ?? perfilDe(atual) ?? "equipe";
    const merged = { email: input.email ?? atual.email, creci: input.creci !== undefined ? input.creci : atual.creci, perfil, empreendimentoSlug: input.empreendimentoSlug !== undefined ? input.empreendimentoSlug : atual.empreendimentoSlug };
    const creci = atual.role === "admin" && !merged.creci ? null : await validar(db, merged as any, atual.id);
    await db.update(users).set({
      ...(input.nome ? { name: input.nome } : {}),
      email: merged.email, creci,
      ...(input.telefone !== undefined ? { telefone: input.telefone || null } : {}),
      ...(atual.role !== "admin" ? { perfil: perfil === "admin" ? "equipe" : perfil } : {}),
      empreendimentoSlug: perfil === "empreendedor" ? merged.empreendimentoSlug : null,
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      updatedAt: new Date(),
    } as any).where(eq(users.id, input.id));
    return { ok: true };
  }),

  /** Novo link de primeiro acesso (também serve para "esqueci a senha": a senha antiga deixa de valer) */
  novoConvite: adminProcedure.input(z.object({ id: z.number().int(), zerarSenha: z.boolean().default(false) })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [u]: any[] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
    if (!u) throw new Error("Pessoa não encontrada");
    if (u.role === "admin") throw new Error("O acesso do administrador não usa convite");
    const c = novoConvite();
    await db.update(users).set({
      conviteHash: c.hash, conviteExpira: c.expira,
      ...(input.zerarSenha ? { passwordScrypt: null, passwordHash: null } : {}),
    } as any).where(eq(users.id, u.id));
    return { link: linkConvite(c.token), expira: c.expira };
  }),

  // ─── Primeiro acesso (público, pelo link) ──────────────────────────────────
  convite: publicProcedure.input(z.object({ token: z.string().min(20).max(100) })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const [u]: any[] = await db.select().from(users).where(eq(users.conviteHash, hashToken(input.token))).limit(1);
    if (!u || !conviteValido(u.conviteExpira) || u.ativo === false || u.ativo === 0) return { valido: false as const };
    return { valido: true as const, nome: String(u.name || "").split(" ")[0], emailDica: mascararEmail(u.email), login: u.creci ? "creci" as const : "email" as const, creci: u.creci };
  }),

  aceitarConvite: publicProcedure
    .input(z.object({ token: z.string().min(20).max(100), email: z.string().trim().toLowerCase().email(), senha: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const fwd = String(ctx.req.headers["x-forwarded-for"] ?? "").split(",").map(s => s.trim()).filter(Boolean);
      if (!allowConvite(fwd[fwd.length - 1] || ctx.req.socket?.remoteAddress || "x")) throw new Error("Muitas tentativas. Aguarde 15 minutos.");
      const db = await dbOrThrow();
      const [u]: any[] = await db.select().from(users).where(eq(users.conviteHash, hashToken(input.token))).limit(1);
      if (!u || !conviteValido(u.conviteExpira) || u.ativo === false || u.ativo === 0) throw new Error("Link de primeiro acesso inválido ou vencido. Peça um novo ao administrador.");
      if (String(u.email || "").toLowerCase() !== input.email) throw new Error("O e-mail não confere com o cadastro. Confira e tente de novo.");
      const { hashPassword, passwordProblem } = await import("../auth-security");
      const problema = passwordProblem(input.senha);
      if (problema) throw new Error(problema);
      await db.update(users).set({ passwordScrypt: await hashPassword(input.senha), passwordHash: null, conviteHash: null, conviteExpira: null } as any).where(eq(users.id, u.id));
      return { ok: true, login: u.creci ? `CRECI ${u.creci}` : u.email };
    }),
});
