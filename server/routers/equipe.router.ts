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
import { users, empreendimentos, properties, usuarioDocumentos, permissoesUsuario, acessosCorretor } from "../../drizzle/schema";
import { PERFIS, DIAS_CONVITE, normalizarCreci, conviteValido, mascararEmail, perfilDe } from "../../shared/equipe";
import { UFS, cpfValido, situacaoCertidao, soDigitos } from "../../shared/cadastro";
import { MODULOS, ajustesNovoCorretor } from "../../shared/permissoes";
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

const opc = (max: number) => z.string().trim().max(max).optional().nullable();
const ufOpc = z.string().trim().toUpperCase().refine(v => !v || (UFS as readonly string[]).includes(v), "UF inválida").optional().nullable();

/** Cadastro completo (o contrato puxa estes dados do corretor) */
const cadastro = z.object({
  creciUf: ufOpc,
  cpf: z.string().trim().max(14).refine(v => !v || cpfValido(v), "CPF inválido").optional().nullable(),
  rg: opc(20), rgOrgao: opc(30), nacionalidade: opc(40), estadoCivil: opc(30),
  enderecoLogradouro: opc(160), enderecoNumero: opc(20), enderecoComplemento: opc(80), enderecoBairro: opc(80), enderecoCidade: opc(80),
  enderecoUf: ufOpc, enderecoCep: z.string().trim().max(9).refine(v => !v || soDigitos(v).length === 8, "CEP inválido").optional().nullable(),
  certidaoCreciValidade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Validade da certidão: AAAA-MM-DD").optional().nullable(),
});

const dados = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  creci: z.string().trim().max(30).optional().nullable(),
  telefone: z.string().trim().max(25).optional().nullable(),
  perfil: z.enum(PERFIS),
  empreendimentoSlug: z.string().trim().max(80).optional().nullable(),
}).merge(cadastro);

/** Campos do cadastro completo prontos para gravar (só os informados; vazio vira null) */
function camposCadastro(d: Partial<z.infer<typeof cadastro>>) {
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(cadastro.shape) as (keyof typeof cadastro.shape)[]) {
    if (d[k] === undefined) continue;
    const v = String(d[k] ?? "").trim();
    out[k] = !v ? null : k === "cpf" || k === "enderecoCep" ? soDigitos(v) : v;
  }
  return out;
}

/** Documentos do usuário (sem o conteúdo) e situação da certidão do CRECI */
function resumoDocumentos(u: any, docs: any[]) {
  const meus = docs.filter(d => d.usuarioId === u.id);
  const certidao = meus.filter(d => d.tipo === "certidao_creci").sort((a, b) => b.id - a.id)[0];
  return {
    documentos: meus.map(d => ({ id: d.id, tipo: d.tipo, nome: d.nome, tamanhoBytes: d.tamanhoBytes, validade: d.validade, criadoEm: d.createdAt })),
    certidao: situacaoCertidao(u.certidaoCreciValidade, !!certidao),
  };
}

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
    const emps: any[] = await db.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos);
    const imoveis: any[] = await db.select({ id: properties.id, codigo: properties.codigo, nome: properties.denomination }).from(properties);
    const docs: any[] = await db.select({
      id: usuarioDocumentos.id, usuarioId: usuarioDocumentos.usuarioId, tipo: usuarioDocumentos.tipo, nome: usuarioDocumentos.nome,
      tamanhoBytes: usuarioDocumentos.tamanhoBytes, validade: usuarioDocumentos.validade, createdAt: usuarioDocumentos.createdAt,
    }).from(usuarioDocumentos).catch(() => []);
    return {
      empreendimentos: emps,
      /** Para o novo cadastro: o admin escolhe módulos, empreendimentos e imóveis (nada vem marcado) */
      modulos: MODULOS.map(m => ({ chave: m.chave, rotulo: m.rotulo })),
      imoveis: imoveis.map(p => ({ id: p.id, nome: p.codigo ? `${p.codigo} — ${p.nome}` : p.nome })),
      pessoas: rows.map(u => ({
        id: u.id, nome: u.name, email: u.email, creci: u.creci, telefone: u.telefone,
        perfil: perfilDe(u), role: u.role, empreendimentoSlug: u.empreendimentoSlug,
        ativo: u.ativo !== false && u.ativo !== 0,
        temSenha: !!(u.passwordScrypt || u.passwordHash),
        convitePendente: !!u.conviteHash && conviteValido(u.conviteExpira),
        recebeLeads: u.recebeLeads === true || u.recebeLeads === 1,
        ultimoAcesso: u.lastSignedIn,
        fotoUrl: u.fotoUrl ?? null,
        cadastro: Object.fromEntries(Object.keys(cadastro.shape).map(k => [k, u[k] ?? null])) as Record<keyof typeof cadastro.shape, string | null>,
        ...resumoDocumentos(u, docs),
      })).sort((a, b) => Number(b.perfil === "admin") - Number(a.perfil === "admin") || String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    };
  }),

  /**
   * Novo acesso. Corretor (equipe): o admin escolhe os módulos, empreendimentos e imóveis — o que não for
   * marcado fica bloqueado (grava o ajuste de todos os módulos; não herda o pacote base ligado).
   * A certidão do CRECI é obrigatória: validade aqui e o arquivo logo em seguida (/api/usuarios/:id/documentos).
   */
  create: adminProcedure.input(dados.extend({
    modulos: z.array(z.string().max(40)).max(50).default([]),
    empreendimentosIds: z.array(z.number().int()).max(500).default([]),
    imoveisIds: z.array(z.number().int()).max(5000).default([]),
  })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const creci = await validar(db, input);
    const corretor = input.perfil !== "empreendedor";
    if (corretor && !input.certidaoCreciValidade) throw new Error("Informe a validade da certidão de quitação do CRECI (obrigatória)");
    const c = novoConvite();
    const r: any = await db.insert(users).values({
      openId: `equipe:${crypto.randomUUID()}`,
      name: input.nome, email: input.email, loginMethod: "senha",
      // O administrador continua sendo só o José: quem é cadastrado aqui entra como colaborador
      role: "user", perfil: input.perfil === "admin" ? "equipe" : input.perfil,
      creci, telefone: input.telefone || null,
      empreendimentoSlug: input.perfil === "empreendedor" ? input.empreendimentoSlug : null,
      ativo: true, conviteHash: c.hash, conviteExpira: c.expira,
      ...camposCadastro(input),
    } as any);
    let id = Number(r?.[0]?.insertId ?? r?.insertId ?? 0);
    if (!id) [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (corretor) {
      await db.insert(permissoesUsuario).values(ajustesNovoCorretor(input.modulos).map(a => ({ usuarioId: id, ...a, atualizadoPor: ctx.user.id })) as any);
      const acessos = [
        ...input.empreendimentosIds.map(refId => ({ usuarioId: id, tipo: "empreendimento", refId, habilitadoPor: ctx.user.id })),
        ...input.imoveisIds.map(refId => ({ usuarioId: id, tipo: "imovel", refId, habilitadoPor: ctx.user.id })),
      ];
      if (acessos.length) await db.insert(acessosCorretor).values(acessos as any);
    }
    return { id, link: linkConvite(c.token), expira: c.expira };
  }),

  update: adminProcedure.input(dados.partial().extend({ id: z.number().int(), ativo: z.boolean().optional(), recebeLeads: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
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
      ...(input.recebeLeads !== undefined ? { recebeLeads: input.recebeLeads } : {}),
      ...camposCadastro(input),
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

  /** Exclui um documento do usuário (o admin; a certidão nova substitui a antiga sem excluir) */
  excluirDocumento: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    await db.delete(usuarioDocumentos).where(eq(usuarioDocumentos.id, input.id));
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
