/** Vendas › Prospecção B2B (server/prospeccao/servico.ts): administrador e secretária; só o administrador aprova envio e exclui */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { CATEGORIAS_PROSPECTO, STATUS_PROSPECTO, lerCsv } from "../../shared/prospeccao";

const S = () => import("../prospeccao/servico");

function exigir(ctx: any, admin = false) {
  const p = String(perfilDe(ctx.user as any) ?? "");
  if (admin ? p !== "admin" : !["admin", "secretario"].includes(p)) {
    throw new TRPCError({ code: "FORBIDDEN", message: admin ? "Só o administrador aprova envios e exclui prospectos." : "Área do escritório." });
  }
}

/** Erro do serviço → resposta tRPC com a mensagem dele */
async function rodar<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name !== "ProspeccaoErro") throw e;
    const code = e.status === 404 ? "NOT_FOUND" : e.status === 429 ? "TOO_MANY_REQUESTS" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
    throw new TRPCError({ code, message: e.message });
  }
}

const idZ = z.object({ id: z.number().int().positive() });
const linhaZ = z.object({
  nome: z.string().max(200), categoria: z.string().max(40).optional(), cidade: z.string().max(80).optional(), uf: z.string().max(2).optional(),
  endereco: z.string().max(255).optional(), telefone: z.string().max(30).optional(), email: z.string().max(160).optional(),
  site: z.string().max(300).optional(), instagram: z.string().max(200).optional(), fonte: z.string().max(20).optional(), fonteId: z.string().max(80).optional(),
});

export const prospeccaoRouter = router({
  lista: protectedProcedure
    .input(z.object({ status: z.enum(STATUS_PROSPECTO).optional(), categoria: z.enum(CATEGORIAS_PROSPECTO).optional(), cidade: z.string().max(80).optional() }).optional())
    .query(async ({ ctx, input }) => { exigir(ctx); return (await S()).listar(input ?? {}); }),
  resumo: protectedProcedure.query(async ({ ctx }) => { exigir(ctx); return (await S()).resumo(); }),
  importarCsv: protectedProcedure.input(z.object({ csv: z.string().min(5).max(3_000_000) })).mutation(async ({ ctx, input }) => {
    exigir(ctx);
    const linhas = lerCsv(input.csv).map(l => ({ ...l, nome: l.nome ?? l.empresa ?? l.razao ?? "" }));
    const validas = linhas.map(l => linhaZ.safeParse(l)).filter(r => r.success).map(r => (r as any).data);
    if (!validas.length) throw new TRPCError({ code: "BAD_REQUEST", message: 'Nenhuma linha válida. O CSV precisa de cabeçalho com pelo menos a coluna "nome".' });
    return rodar(async () => (await S()).importar(validas, ctx.user.id));
  }),
  criar: protectedProcedure.input(linhaZ.extend({ nome: z.string().trim().min(2).max(200) })).mutation(async ({ ctx, input }) => {
    exigir(ctx);
    return rodar(async () => (await S()).importar([{ ...input, fonte: "manual" }], ctx.user.id));
  }),
  atualizar: protectedProcedure.input(idZ.extend({
    dados: z.object({
      nome: z.string().max(200).optional(), categoria: z.enum(CATEGORIAS_PROSPECTO).optional(), cidade: z.string().max(80).nullable().optional(),
      telefone: z.string().max(30).nullable().optional(), email: z.string().max(160).nullable().optional(), site: z.string().max(300).nullable().optional(),
      fato: z.string().max(300).nullable().optional(), mensagem: z.string().max(1500).nullable().optional(), observacoes: z.string().max(2000).nullable().optional(),
    }),
  })).mutation(async ({ ctx, input }) => { exigir(ctx); return rodar(async () => (await S()).atualizar(input.id, input.dados)); }),
  enriquecer: protectedProcedure.input(idZ).mutation(async ({ ctx, input }) => { exigir(ctx); return rodar(async () => (await S()).enriquecer(input.id)); }),
  gerarMensagem: protectedProcedure.input(idZ).mutation(async ({ ctx, input }) => {
    exigir(ctx);
    const nome = String((ctx.user as any)?.name ?? "").trim().split(/\s+/).slice(0, 2).join(" ") || "José Romário";
    return rodar(async () => (await S()).gerarMensagem(input.id, nome));
  }),
  aprovarEEnviar: protectedProcedure.input(idZ).mutation(async ({ ctx, input }) => { exigir(ctx, true); return rodar(async () => (await S()).aprovarEEnviar(input.id, ctx.user.id)); }),
  marcar: protectedProcedure.input(idZ.extend({ status: z.enum(["novo", "respondeu", "interessado", "sem_interesse", "optout"]) }))
    .mutation(async ({ ctx, input }) => { exigir(ctx); return rodar(async () => (await S()).marcar(input.id, input.status)); }),
  excluir: protectedProcedure.input(idZ).mutation(async ({ ctx, input }) => { exigir(ctx, true); return rodar(async () => (await S()).excluir(input.id)); }),
});
