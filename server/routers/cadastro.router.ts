/**
 * Cadastro do usuário — usado pela tela Equipe › Cadastro (admin, qualquer pessoa) e por "Meu cadastro"
 * (o próprio usuário, todos os perfis). Arquivos (documentos, credenciais e foto) sobem pelas rotas REST
 * em server/_core/index.ts; aqui ficam os dados, os metadados dos documentos e a qualificação.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, usuarioDocumentos, usuarioFoto } from "../../drizzle/schema";
import { pendenciasCredenciais, podeGerirCadastroDe } from "../../shared/cadastro";
import { perfilDe } from "../../shared/equipe";
import { carregarCadastro, pessoaPorCpf, qualificacaoDoUsuario, salvarCadastro } from "../cadastroUsuario";
import { ErroArquivo, atualizarDocumento, configuracao, documentoDe, listarDocumentos, removerDocumento } from "../credenciais";

/** Sem id = o próprio usuário; com id = só o admin (ou o próprio) */
const alvo = z.object({ id: z.number().int().positive().optional() });

function alvoDe(ctx: { user: any }, id?: number): number {
  const alvoId = id ?? ctx.user.id;
  if (!podeGerirCadastroDe(ctx.user, alvoId)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para este cadastro" });
  return alvoId;
}

/** Erro de arquivo (status HTTP) → erro tRPC */
async function comErroDeArquivo<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof ErroArquivo) throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

/** Documento de alguém que o usuário pode gerir */
async function documentoPermitido(ctx: { user: any }, documentoId: number) {
  const doc = await documentoDe(documentoId);
  if (!doc || !podeGerirCadastroDe(ctx.user, doc.usuarioId)) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
  return doc;
}

const metaDocumento = z.object({
  numero: z.string().trim().max(30).nullable().optional(),
  validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  linkVerificacao: z.string().trim().max(500).nullable().optional(),
  linkEmissao: z.string().trim().max(500).nullable().optional(),
  anexarDocumentos: z.boolean().optional(),
  exibirPerfil: z.boolean().optional(),
});

export const cadastroRouter = router({
  dados: protectedProcedure.input(alvo).query(async ({ input, ctx }) => carregarCadastro(alvoDe(ctx, input.id))),

  salvar: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), dados: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ input, ctx }) => salvarCadastro(alvoDe(ctx, input.id), input.dados, ctx.user as any)),

  qualificacao: protectedProcedure.input(alvo).query(async ({ input, ctx }) => ({ texto: await qualificacaoDoUsuario(alvoDe(ctx, input.id)) })),

  /** Preenche o cônjuge a partir de um CPF já cadastrado (só o admin: evita consulta de dados de terceiros) */
  pessoaPorCpf: adminProcedure.input(z.object({ cpf: z.string().max(20), exceto: z.number().int().optional() }))
    .query(async ({ input }) => pessoaPorCpf(input.cpf, input.exceto)),

  documentos: protectedProcedure.input(alvo).query(async ({ input, ctx }) => listarDocumentos(alvoDe(ctx, input.id))),

  atualizarDocumento: protectedProcedure.input(metaDocumento.extend({ documentoId: z.number().int() })).mutation(async ({ input, ctx }) => {
    const { documentoId, ...meta } = input;
    await documentoPermitido(ctx, documentoId);
    return comErroDeArquivo(() => atualizarDocumento(documentoId, meta));
  }),

  removerDocumento: protectedProcedure.input(z.object({ documentoId: z.number().int() })).mutation(async ({ input, ctx }) => {
    await documentoPermitido(ctx, input.documentoId);
    return removerDocumento(input.documentoId);
  }),

  removerFoto: protectedProcedure.input(alvo).mutation(async ({ input, ctx }) => {
    const id = alvoDe(ctx, input.id);
    const db = (await getDb()) as any;
    if (!db) throw new Error("Banco indisponível");
    await db.delete(usuarioFoto).where(eq(usuarioFoto.usuarioId, id));
    await db.update(users).set({ fotoUrl: null } as any).where(eq(users.id, id));
    return { ok: true };
  }),

  /** Pendências do próprio usuário (bolinha vermelha no menu "Meu cadastro") */
  minhasPendencias: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb()) as any;
    if (!db) return [];
    const docs: any[] = await db.select({ tipo: usuarioDocumentos.tipo, titular: usuarioDocumentos.titular, validade: usuarioDocumentos.validade })
      .from(usuarioDocumentos).where(eq(usuarioDocumentos.usuarioId, ctx.user.id)).catch(() => []);
    return pendenciasCredenciais(perfilDe(ctx.user as any), docs, await configuracao());
  }),
});
