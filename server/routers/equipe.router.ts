/**
 * Equipe do CRM (só o administrador): lista e cadastra colaboradores (Secretário/Corretor) e empreendedores,
 * gera o link de primeiro acesso, liga/desliga acesso e "Recebe leads" e mostra as credenciais pendentes.
 * O cadastro completo (dados, cônjuge, foto, documentos, credenciais) fica no router "cadastro",
 * que o próprio usuário também usa. O colaborador cria a senha no primeiro acesso e entra com CRECI, CPF ou e-mail.
 */
import crypto from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, empreendimentos, properties, usuarioDocumentos, permissoesUsuario, acessosCorretor } from "../../drizzle/schema";
import { DIAS_CONVITE, conviteValido, mascararEmail, perfilDe } from "../../shared/equipe";
import { MSG_SEM_CARTAO, pendenciasCredenciais } from "../../shared/cadastro";
import { MODULOS, ajustesNovoCorretor } from "../../shared/permissoes";
import { appUrl } from "../leads/config";
import { createRateLimiter } from "../lead-intake";
import { criarUsuarioComCadastro, temCartaoCreci } from "../cadastroUsuario";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Novo convite: o token só vai no link; no banco fica o sha256 */
function novoConvite() {
  const token = crypto.randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), expira: new Date(Date.now() + DIAS_CONVITE * 24 * 3600_000) };
}

const linkConvite = (token: string) => `${appUrl()}/primeiro-acesso?convite=${token}`;

const allowConvite = createRateLimiter(10, 15 * 60 * 1000);

export const equipeRouter = router({
  list: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows: any[] = await db.select().from(users);
    const emps: any[] = await db.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos);
    const imoveis: any[] = await db.select({ id: properties.id, codigo: properties.codigo, nome: properties.denomination }).from(properties);
    const docs: any[] = await db.select({ usuarioId: usuarioDocumentos.usuarioId, tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, validade: usuarioDocumentos.validade })
      .from(usuarioDocumentos).catch(() => []);
    return {
      empreendimentos: emps,
      /** Para o novo cadastro: o admin escolhe módulos, empreendimentos e imóveis (nada vem marcado) */
      modulos: MODULOS.map(m => ({ chave: m.chave, rotulo: m.rotulo })),
      imoveis: imoveis.map(p => ({ id: p.id, nome: p.codigo ? `${p.codigo} — ${p.nome}` : p.nome })),
      pessoas: rows.map(u => {
        const perfil = perfilDe(u);
        return {
          id: u.id, nome: u.name, email: u.email, creci: u.creci, telefone: u.telefone, perfil, role: u.role, empreendimentoSlug: u.empreendimentoSlug,
          ativo: u.ativo !== false && u.ativo !== 0,
          temSenha: !!(u.passwordScrypt || u.passwordHash),
          convitePendente: !!u.conviteHash && conviteValido(u.conviteExpira),
          recebeLeads: u.recebeLeads === true || u.recebeLeads === 1,
          ultimoAcesso: u.lastSignedIn,
          fotoUrl: u.fotoUrl ?? null,
          pendencias: pendenciasCredenciais(perfil, docs.filter(d => d.usuarioId === u.id)),
        };
      }).sort((a, b) => Number(b.perfil === "admin") - Number(a.perfil === "admin") || String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    };
  }),

  /**
   * Novo acesso com o cadastro completo (mesma validação do "Salvar cadastro"). Secretário/Corretor: o admin
   * escolhe módulos, empreendimentos e imóveis — o que não for marcado fica bloqueado (não herda o pacote base).
   * Documentos e credenciais vão em seguida (precisam do id). "Recebe leads" liga depois do Cartão CRECI.
   */
  create: adminProcedure.input(z.object({
    dados: z.record(z.string(), z.unknown()),
    modulos: z.array(z.string().max(40)).max(50).default([]),
    empreendimentosIds: z.array(z.number().int()).max(500).default([]),
    imoveisIds: z.array(z.number().int()).max(5000).default([]),
  })).mutation(async ({ input, ctx }) => {
    const c = novoConvite();
    const { id } = await criarUsuarioComCadastro(input.dados, input, ctx.user as any, { conviteHash: c.hash, conviteExpira: c.expira });
    return { id, link: linkConvite(c.token), expira: c.expira };
  }),

  /** Liga/desliga o acesso e "Recebe leads" (corretor só com o Cartão de Regularidade CRECI) */
  update: adminProcedure.input(z.object({ id: z.number().int(), ativo: z.boolean().optional(), recebeLeads: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [atual]: any[] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
    if (!atual) throw new Error("Pessoa não encontrada");
    if (atual.id === ctx.user.id && input.ativo === false) throw new Error("Você não pode desativar o seu próprio acesso");
    if (input.recebeLeads && perfilDe(atual) === "corretor" && !(await temCartaoCreci(db, atual.id))) throw new Error(MSG_SEM_CARTAO);
    await db.update(users).set({
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      ...(input.recebeLeads !== undefined ? { recebeLeads: input.recebeLeads } : {}),
      updatedAt: new Date(),
    } as any).where(eq(users.id, input.id));
    return { ok: true };
  }),

  /** Prévia do corretor como intermediador do contrato (qualificação + pendências) */
  intermediador: adminProcedure.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const { intermediadorParaContrato } = await import("../contratoIntermediador");
    const r = await intermediadorParaContrato(input.id);
    if (!r) throw new Error("Pessoa não encontrada");
    return r;
  }),

  /** Card "Credenciais pendentes" do painel: corretores com certidão vencida/a vencer, cartão vencido ou ausente */
  credenciaisPendentes: adminProcedure.query(async () => {
    const db = await dbOrThrow();
    const pessoas: any[] = await db.select({ id: users.id, name: users.name, role: users.role, perfil: users.perfil, ativo: users.ativo }).from(users);
    const docs: any[] = await db.select({ usuarioId: usuarioDocumentos.usuarioId, tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, validade: usuarioDocumentos.validade }).from(usuarioDocumentos);
    const { configuracao } = await import("../credenciais");
    const cfg = await configuracao();
    return pessoas
      .filter(p => p.ativo !== false && p.ativo !== 0)
      .map(p => ({ id: p.id, nome: p.name || "Sem nome", pendencias: pendenciasCredenciais(perfilDe(p), docs.filter(d => d.usuarioId === p.id), cfg) }))
      .filter(p => p.pendencias.length);
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
      return { ok: true, login: u.creci ? `CRECI ${u.creci}` : u.cpf ? "o seu CPF" : u.email };
    }),
});
