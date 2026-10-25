/**
 * Cadastro do usuário (tela Equipe › Cadastro e "Meu cadastro"): validação (zod, erro por campo),
 * gravação do usuário + cônjuge na mesma transação, regras de perfil e "Recebe leads",
 * busca de pessoa por CPF e qualificação para contrato. Regras puras em shared/cadastro.ts.
 */
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { getDb, transacao } from "./db";
import { users, usuarioConjuge, usuarioDocumentos } from "../drizzle/schema";
import { cleanRG, isValidCPF, onlyDigits } from "../shared/masks";
import { ESTADOS_CIVIS, MSG_SEM_CARTAO, REGIMES_BENS, UFS, normalizarProfissao, temConjuge } from "../shared/cadastro";
import { PERFIS, normalizarCreci, perfilDe, type Perfil } from "../shared/equipe";
import { normalizarInstagram } from "../shared/cartaoVendas";
import { qualificacao, type ConjugeQualif, type CredenciaisQualif } from "../shared/qualificacao";

const opc = (max: number) => z.string().trim().max(max).optional().nullable().transform(v => (v ? v : null));
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").optional().nullable().or(z.literal("")).transform(v => v || null);
const cpf = z.string().transform(onlyDigits).refine(isValidCPF, "CPF inválido");
const rg = z.string().optional().nullable().transform(v => cleanRG(v ?? "") || null)
  .refine(v => !v || (v.length >= 5 && v.length <= 14), "RG inválido");
const uf = z.string().trim().toUpperCase().refine(v => (UFS as readonly string[]).includes(v), "UF inválida");
const ufOpc = z.string().trim().toUpperCase().optional().nullable().transform(v => v || null)
  .refine(v => !v || (UFS as readonly string[]).includes(v), "UF inválida");

const pessoaBase = {
  nome: z.string().trim().min(5, "Nome completo").max(150),
  sexo: z.enum(["M", "F"], { message: "Informe o sexo" }),
  cpf,
  rg,
  rgOrgao: opc(20),
  nacionalidade: z.enum(["brasileira", "estrangeira"]),
  paisOrigem: opc(60),
  docEstrangeiroTipo: z.enum(["RNM", "PASSAPORTE"]).optional().nullable(),
  docEstrangeiroNumero: opc(30),
  profissao: z.string().trim().min(2, "Informe a profissão").max(80).transform(normalizarProfissao),
};

type Issue = { path: (string | number)[]; message: string };
function regrasPessoa(p: any, base: (string | number)[], add: (i: Issue) => void) {
  if (p.nacionalidade === "estrangeira") {
    if (!p.paisOrigem) add({ path: [...base, "paisOrigem"], message: "Informe o país de origem" });
    if (!p.docEstrangeiroNumero) add({ path: [...base, "docEstrangeiroNumero"], message: "Informe RNM ou passaporte" });
  } else if (p.rg && !p.rgOrgao) {
    add({ path: [...base, "rgOrgao"], message: "Informe o órgão emissor" });
  }
}

export const conjugeSchema = z.object({
  ...pessoaBase,
  profissao: z.string().trim().max(80).optional().nullable().transform(v => (v ? normalizarProfissao(v) : null)),
  dataNascimento: data,
  telefone: z.string().optional().nullable().transform(v => onlyDigits(v ?? "") || null),
  email: z.string().trim().email("E-mail inválido").optional().nullable().or(z.literal("")).transform(v => v || null),
  regimeBens: z.enum(REGIMES_BENS).optional().nullable(),
  dataCasamento: data,
  uniaoDataInicio: data,
  uniaoRegistrada: z.boolean().default(false),
  mesmoEndereco: z.boolean().default(true),
  cep: z.string().optional().nullable().transform(v => onlyDigits(v ?? "") || null),
  logradouro: opc(150), numero: opc(10), complemento: opc(80), bairro: opc(80), cidade: opc(80), uf: ufOpc,
});

export const cadastroSchema = z.object({
  ...pessoaBase,
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(160),
  telefone: z.string().transform(onlyDigits).refine(v => v.length === 10 || v.length === 11, "Telefone inválido"),
  /** Só o admin muda (o servidor ignora vindo de outro perfil) */
  perfil: z.enum(PERFIS).optional(),
  recebeLeads: z.boolean().optional(),
  creci: z.string().optional().nullable().transform(v => normalizarCreci(v) ?? null),
  creciUf: ufOpc,
  /** Opcional: "@fulano" ou o link do perfil; guardado só o usuário */
  instagram: z.string().optional().nullable().refine(v => !String(v ?? "").trim() || !!normalizarInstagram(v), "Instagram inválido (ex.: @avalieimob)")
    .transform(v => normalizarInstagram(v)),
  estadoCivil: z.enum(ESTADOS_CIVIS, { message: "Informe o estado civil" }),
  enderecoCep: z.string().transform(onlyDigits).refine(v => v.length === 8, "CEP inválido"),
  enderecoLogradouro: z.string().trim().min(2, "Informe o logradouro").max(160),
  enderecoNumero: z.string().trim().min(1, "Informe o número").max(20),
  enderecoComplemento: opc(80),
  enderecoBairro: z.string().trim().min(2, "Informe o bairro").max(80),
  enderecoCidade: z.string().trim().min(2, "Informe a cidade").max(80),
  enderecoUf: uf,
  empreendimentoSlug: opc(80),
  conjuge: conjugeSchema.nullable().optional(),
  /** Estado civil sem cônjuge: true apaga os dados do cônjuge; false mantém inativos */
  apagarConjuge: z.boolean().optional(),
}).superRefine((u, ctx) => {
  const add = (i: Issue) => ctx.addIssue({ code: "custom", ...i });
  regrasPessoa(u, [], add);
  if (u.perfil === "corretor" && !u.creci) add({ path: ["creci"], message: "CRECI obrigatório para corretor" });
  if (u.perfil === "empreendedor" && !u.empreendimentoSlug) add({ path: ["empreendimentoSlug"], message: "Escolha o empreendimento do empreendedor" });
  if (temConjuge(u.estadoCivil)) {
    if (!u.conjuge) add({ path: ["conjuge"], message: "Informe os dados do cônjuge/companheiro(a)" });
    else {
      regrasPessoa(u.conjuge, ["conjuge"], add);
      if (u.estadoCivil === "casado" && !u.conjuge.regimeBens) add({ path: ["conjuge", "regimeBens"], message: "Informe o regime de bens" });
      if (u.conjuge.cpf === u.cpf) add({ path: ["conjuge", "cpf"], message: "CPF do cônjuge igual ao do titular" });
      if (!u.conjuge.mesmoEndereco && (!u.conjuge.cep || !u.conjuge.logradouro || !u.conjuge.cidade)) add({ path: ["conjuge", "cep"], message: "Informe o endereço do cônjuge" });
    }
  }
});
export type CadastroInput = z.input<typeof cadastroSchema>;

/** Erros do zod no formato { campo: mensagem } (o front marca cada input em vermelho) */
export function errosPorCampo(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) { const k = i.path.join("."); if (!out[k]) out[k] = i.message; }
  return out;
}

/** Erro com { campo: mensagem } — vai para o navegador em error.data.campos (errorFormatter do tRPC) */
export class ErroCadastro extends TRPCError {
  constructor(code: "UNPROCESSABLE_CONTENT" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND", message: string, campos?: Record<string, string>) {
    super({ code, message, cause: campos ? Object.assign(new Error(message), { campos }) : undefined });
  }
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

/** Tem o Cartão de Regularidade CRECI enviado (exigido para "Recebe leads" do corretor) */
export async function temCartaoCreci(db: any, usuarioId: number): Promise<boolean> {
  const [d] = await db.select({ id: usuarioDocumentos.id }).from(usuarioDocumentos)
    .where(and(eq(usuarioDocumentos.usuarioId, usuarioId), eq(usuarioDocumentos.tipo, "cartao_creci"), eq(usuarioDocumentos.titular, "usuario"))).limit(1);
  return !!d;
}

/**
 * Salva o cadastro de `alvoId` por `autor` (admin ou o próprio). Perfil só o admin muda; o último admin
 * não se rebaixa (409); trocar o perfil encerra a sessão do afetado; CPF/CRECI/e-mail duplicados = 409.
 */
export async function salvarCadastro(alvoId: number, entrada: unknown, autor: { id: number; role?: string | null }) {
  const r = cadastroSchema.safeParse(entrada);
  if (!r.success) {
    const campos = errosPorCampo(r.error);
    throw new ErroCadastro("UNPROCESSABLE_CONTENT", `Confira o cadastro: ${Object.values(campos)[0]}`, campos);
  }
  const d = r.data;
  const db = await dbOrThrow();
  const [atual]: any[] = await db.select().from(users).where(eq(users.id, alvoId)).limit(1);
  if (!atual) throw new ErroCadastro("NOT_FOUND", "Usuário não encontrado");
  const admin = autor.role === "admin";
  const perfilAtual = perfilDe(atual) as Perfil;
  let perfil: Perfil = perfilAtual;
  if (d.perfil && d.perfil !== perfilAtual) {
    if (!admin) console.warn(`[Cadastro] Usuário ${autor.id} tentou mudar o perfil de ${alvoId} para ${d.perfil} (ignorado)`);
    else perfil = d.perfil;
  }
  if (perfilAtual === "admin" && perfil !== "admin") {
    const outros: any[] = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), ne(users.id, alvoId), eq(users.ativo, true))).limit(1);
    if (!outros.length) throw new ErroCadastro("CONFLICT", "Você é o último administrador ativo: não pode deixar de ser administrador");
  }
  if (perfil === "corretor" && !d.creci) throw new ErroCadastro("UNPROCESSABLE_CONTENT", "CRECI obrigatório para corretor", { creci: "CRECI obrigatório para corretor" });
  // Duplicados
  const dup = async (col: any, v: string | null, msg: string, campo: string) => {
    if (!v) return;
    const [o]: any[] = await db.select({ id: users.id }).from(users).where(and(eq(col, v), ne(users.id, alvoId))).limit(1);
    if (o) throw new ErroCadastro("CONFLICT", msg, { [campo]: msg });
  };
  await dup(users.cpf, d.cpf, "CPF já cadastrado para outro usuário", "cpf");
  await dup(users.email, d.email, "E-mail já cadastrado para outro usuário", "email");
  await dup(users.creci, d.creci, `O CRECI ${d.creci} já está cadastrado`, "creci");
  // "Recebe leads" do corretor exige o Cartão CRECI
  const recebeLeads = admin && d.recebeLeads !== undefined ? d.recebeLeads : !!atual.recebeLeads;
  if (recebeLeads && perfil === "corretor" && !(await temCartaoCreci(db, alvoId))) {
    throw new ErroCadastro("UNPROCESSABLE_CONTENT", MSG_SEM_CARTAO, { recebeLeads: MSG_SEM_CARTAO });
  }

  const mudouPerfil = perfil !== perfilAtual;
  const dadosUser: Record<string, unknown> = {
    name: d.nome, email: d.email, telefone: d.telefone, sexo: d.sexo, cpf: d.cpf, rg: d.rg, rgOrgao: d.rgOrgao,
    nacionalidade: d.nacionalidade, paisOrigem: d.nacionalidade === "estrangeira" ? d.paisOrigem : null,
    docEstrangeiroTipo: d.nacionalidade === "estrangeira" ? d.docEstrangeiroTipo ?? "RNM" : null,
    docEstrangeiroNumero: d.nacionalidade === "estrangeira" ? d.docEstrangeiroNumero : null,
    profissao: d.profissao, creci: d.creci, creciUf: d.creciUf, instagram: d.instagram, estadoCivil: d.estadoCivil,
    enderecoCep: d.enderecoCep, enderecoLogradouro: d.enderecoLogradouro, enderecoNumero: d.enderecoNumero,
    enderecoComplemento: d.enderecoComplemento, enderecoBairro: d.enderecoBairro, enderecoCidade: d.enderecoCidade, enderecoUf: d.enderecoUf,
    updatedAt: new Date(),
    ...(admin ? { recebeLeads } : {}),
    ...(mudouPerfil ? {
      role: perfil === "admin" ? "admin" : "user", perfil: perfil === "admin" ? null : perfil,
      sessaoVersao: (Number(atual.sessaoVersao) || 0) + 1,
      empreendimentoSlug: perfil === "empreendedor" ? d.empreendimentoSlug : null,
    } : perfil === "empreendedor" && admin ? { empreendimentoSlug: d.empreendimentoSlug } : {}),
  };

  await transacao(db, async (tx: any) => {
    await tx.update(users).set(dadosUser as any).where(eq(users.id, alvoId));
    const [ja]: any[] = await tx.select({ id: usuarioConjuge.id }).from(usuarioConjuge).where(eq(usuarioConjuge.usuarioId, alvoId)).limit(1);
    if (temConjuge(d.estadoCivil) && d.conjuge) {
      const c = d.conjuge;
      const linha = {
        usuarioId: alvoId, nome: c.nome, sexo: c.sexo, cpf: c.cpf, rg: c.rg, rgOrgao: c.rgOrgao, nacionalidade: c.nacionalidade,
        paisOrigem: c.paisOrigem, docEstrangeiroTipo: c.docEstrangeiroTipo ?? null, docEstrangeiroNumero: c.docEstrangeiroNumero,
        profissao: c.profissao, dataNascimento: c.dataNascimento, telefone: c.telefone, email: c.email,
        regimeBens: d.estadoCivil === "casado" ? c.regimeBens ?? null : null,
        dataCasamento: d.estadoCivil === "casado" ? c.dataCasamento : null,
        uniaoDataInicio: d.estadoCivil === "uniao_estavel" ? c.uniaoDataInicio : null,
        uniaoRegistrada: d.estadoCivil === "uniao_estavel" ? c.uniaoRegistrada : false,
        mesmoEndereco: c.mesmoEndereco,
        cep: c.mesmoEndereco ? null : c.cep, logradouro: c.mesmoEndereco ? null : c.logradouro, numero: c.mesmoEndereco ? null : c.numero,
        complemento: c.mesmoEndereco ? null : c.complemento, bairro: c.mesmoEndereco ? null : c.bairro, cidade: c.mesmoEndereco ? null : c.cidade,
        uf: c.mesmoEndereco ? null : c.uf, ativo: true,
      };
      if (ja) await tx.update(usuarioConjuge).set(linha as any).where(eq(usuarioConjuge.id, ja.id));
      else await tx.insert(usuarioConjuge).values(linha as any);
    } else if (ja) {
      if (d.apagarConjuge) await tx.delete(usuarioConjuge).where(eq(usuarioConjuge.id, ja.id));
      else await tx.update(usuarioConjuge).set({ ativo: false } as any).where(eq(usuarioConjuge.id, ja.id));
    }
  });
  if (mudouPerfil) console.log(`[Cadastro] Perfil de ${alvoId}: ${perfilAtual} → ${perfil} (por ${autor.id}); sessões antigas encerradas`);
  return { ok: true, perfil, sessaoEncerrada: mudouPerfil };
}

/**
 * Novo acesso com o cadastro completo (Equipe → Novo e aprovação do Recrutamento): mesma validação do "Salvar
 * cadastro". Secretário/Corretor: só os módulos, empreendimentos e imóveis marcados (não herda o pacote base).
 */
export async function criarUsuarioComCadastro(
  dados: Record<string, unknown>,
  acesso: { modulos: string[]; empreendimentosIds: number[]; imoveisIds: number[] },
  autor: { id: number; role?: string | null },
  extra: Record<string, unknown> = {},
): Promise<{ id: number; perfil: Perfil }> {
  const r = cadastroSchema.safeParse(dados);
  if (!r.success) {
    const campos = errosPorCampo(r.error);
    throw new ErroCadastro("UNPROCESSABLE_CONTENT", `Confira o cadastro: ${Object.values(campos)[0]}`, campos);
  }
  const perfil = (r.data.perfil ?? "corretor") as Perfil;
  const db = await dbOrThrow();
  const marca = crypto.randomUUID();
  const res: any = await db.insert(users).values({
    openId: `equipe:${marca}`, name: r.data.nome, email: `pendente-${marca}@cadastro.local`, loginMethod: "senha",
    role: "user", perfil: perfil === "admin" ? "corretor" : perfil, ativo: 1, recebeLeads: 0,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...extra,
  } as any);
  let id = Number(res?.[0]?.insertId ?? res?.insertId ?? res?.lastInsertRowid ?? 0);
  if (!id) [{ id }] = await db.select({ id: users.id }).from(users).where(eq(users.openId, `equipe:${marca}`)).limit(1);
  try {
    // Grava tudo pela mesma regra do cadastro (duplicados, perfil, cônjuge); "Recebe leads" fica para depois do cartão
    await salvarCadastro(id, { ...dados, recebeLeads: false }, autor);
  } catch (e) {
    await db.delete(users).where(eq(users.id, id));
    throw e;
  }
  if (perfil === "secretario" || perfil === "corretor") {
    const { ajustesNovoCorretor } = await import("../shared/permissoes");
    const { permissoesUsuario, acessosCorretor } = await import("../drizzle/schema");
    await db.insert(permissoesUsuario).values(ajustesNovoCorretor(acesso.modulos).map(a => ({ usuarioId: id, ...a, atualizadoPor: autor.id })) as any);
    const acessos = perfil === "corretor" ? [
      ...acesso.empreendimentosIds.map(refId => ({ usuarioId: id, tipo: "empreendimento", refId, habilitadoPor: autor.id })),
      ...acesso.imoveisIds.map(refId => ({ usuarioId: id, tipo: "imovel", refId, habilitadoPor: autor.id })),
    ] : [];
    if (acessos.length) await db.insert(acessosCorretor).values(acessos as any);
  }
  return { id, perfil };
}

/** Cadastro completo para a tela (sem hashes, sem conteúdo dos arquivos) */
export async function carregarCadastro(usuarioId: number) {
  const db = await dbOrThrow();
  const [u]: any[] = await db.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) throw new ErroCadastro("NOT_FOUND", "Usuário não encontrado");
  const [c]: any[] = await db.select().from(usuarioConjuge).where(eq(usuarioConjuge.usuarioId, usuarioId)).limit(1);
  return {
    id: u.id, perfil: perfilDe(u), nome: u.name ?? "", email: u.email ?? "", telefone: u.telefone ?? "", sexo: u.sexo ?? null,
    cpf: u.cpf ?? "", rg: u.rg ?? "", rgOrgao: u.rgOrgao ?? "", nacionalidade: u.nacionalidade === "estrangeira" ? "estrangeira" : "brasileira",
    paisOrigem: u.paisOrigem ?? "", docEstrangeiroTipo: u.docEstrangeiroTipo ?? "RNM", docEstrangeiroNumero: u.docEstrangeiroNumero ?? "",
    profissao: u.profissao ?? "", creci: u.creci ?? "", creciUf: u.creciUf ?? "", instagram: u.instagram ?? "", estadoCivil: u.estadoCivil ?? null,
    enderecoCep: u.enderecoCep ?? "", enderecoLogradouro: u.enderecoLogradouro ?? "", enderecoNumero: u.enderecoNumero ?? "",
    enderecoComplemento: u.enderecoComplemento ?? "", enderecoBairro: u.enderecoBairro ?? "", enderecoCidade: u.enderecoCidade ?? "", enderecoUf: u.enderecoUf ?? "",
    empreendimentoSlug: u.empreendimentoSlug ?? null, recebeLeads: !!u.recebeLeads, fotoUrl: u.fotoUrl ?? null,
    conjuge: c ? { ...c, ativo: !!c.ativo, mesmoEndereco: c.mesmoEndereco !== false && c.mesmoEndereco !== 0, uniaoRegistrada: !!c.uniaoRegistrada } : null,
  };
}

/** Pessoa já cadastrada com esse CPF (usuários e cônjuges) — preenche o bloco do cônjuge */
export async function pessoaPorCpf(cpfBusca: string, exceto?: number) {
  const d = onlyDigits(cpfBusca);
  if (!isValidCPF(d)) return null;
  const db = await dbOrThrow();
  const [u]: any[] = await db.select().from(users).where(eq(users.cpf, d)).limit(1);
  if (u && u.id !== exceto) {
    return { origem: "usuário", nome: u.name ?? "", sexo: u.sexo ?? null, cpf: d, rg: u.rg ?? "", rgOrgao: u.rgOrgao ?? "", nacionalidade: u.nacionalidade === "estrangeira" ? "estrangeira" : "brasileira", paisOrigem: u.paisOrigem ?? "", profissao: u.profissao ?? "", telefone: u.telefone ?? "", email: u.email ?? "" };
  }
  const [c]: any[] = await db.select().from(usuarioConjuge).where(eq(usuarioConjuge.cpf, d)).limit(1);
  if (c && c.usuarioId !== exceto) {
    return { origem: "cônjuge cadastrado", nome: c.nome, sexo: c.sexo ?? null, cpf: d, rg: c.rg ?? "", rgOrgao: c.rgOrgao ?? "", nacionalidade: c.nacionalidade ?? "brasileira", paisOrigem: c.paisOrigem ?? "", profissao: c.profissao ?? "", telefone: c.telefone ?? "", email: c.email ?? "" };
  }
  return null;
}

/** Monta a qualificação a partir das linhas do banco (pura, testável) */
export function qualificacaoDasLinhas(u: any, c: any | null, cred: CredenciaisQualif = {}): string {
  const pessoa = (x: any) => ({
    nome: x.name ?? x.nome ?? "", sexo: x.sexo ?? null, nacionalidade: x.nacionalidade === "estrangeira" ? "estrangeira" as const : "brasileira" as const,
    paisOrigem: x.paisOrigem, docEstrangeiroTipo: x.docEstrangeiroTipo, docEstrangeiroNumero: x.docEstrangeiroNumero,
    profissao: x.profissao ?? null, cpf: x.cpf ?? null, rg: x.rg, rgOrgao: x.rgOrgao,
  });
  const end = { logradouro: u.enderecoLogradouro, numero: u.enderecoNumero, complemento: u.enderecoComplemento, bairro: u.enderecoBairro, cidade: u.enderecoCidade, uf: u.enderecoUf, cep: u.enderecoCep };
  const conj: ConjugeQualif | null = c && c.ativo !== false && c.ativo !== 0 ? {
    ...pessoa(c), regimeBens: c.regimeBens, mesmoEndereco: c.mesmoEndereco !== false && c.mesmoEndereco !== 0,
    endereco: c.mesmoEndereco === false || c.mesmoEndereco === 0 ? { logradouro: c.logradouro, numero: c.numero, complemento: c.complemento, bairro: c.bairro, cidade: c.cidade, uf: c.uf, cep: c.cep } : null,
  } : null;
  return qualificacao({ ...pessoa(u), creci: u.creci, creciUf: u.creciUf, estadoCivil: u.estadoCivil ?? null }, end, conj, cred);
}

/** Qualificação do usuário com o selo do Cartão CRECI e o CNAI (quando "exibir no perfil") */
export async function qualificacaoDoUsuario(usuarioId: number): Promise<string> {
  const db = await dbOrThrow();
  const [u]: any[] = await db.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  if (!u) throw new ErroCadastro("NOT_FOUND", "Usuário não encontrado");
  const [c]: any[] = await db.select().from(usuarioConjuge).where(eq(usuarioConjuge.usuarioId, usuarioId)).limit(1);
  const docs: any[] = await db.select({ tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, numero: usuarioDocumentos.numero, linkVerificacao: usuarioDocumentos.linkVerificacao, exibirPerfil: usuarioDocumentos.exibirPerfil })
    .from(usuarioDocumentos).where(eq(usuarioDocumentos.usuarioId, usuarioId));
  const cartao = docs.find(x => x.tipo === "cartao_creci" && x.titular === "usuario");
  const cnai = docs.find(x => x.tipo === "certificado_cnai" && x.titular === "usuario" && (x.exibirPerfil === true || x.exibirPerfil === 1) && x.numero);
  return qualificacaoDasLinhas(u, c ?? null, { linkVerificacaoCreci: cartao?.linkVerificacao ?? null, cnai: cnai?.numero ?? null });
}
