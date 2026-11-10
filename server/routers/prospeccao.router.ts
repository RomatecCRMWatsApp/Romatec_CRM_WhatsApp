/** Vendas › Prospecção B2B (server/prospeccao/servico.ts): administrador e secretária; só o administrador aprova envio e exclui */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { CATEGORIAS_PROSPECTO, OBJETIVOS_PROSPECTO, STATUS_PROSPECTO, TIPOS_BUSCA_MAPS, lerCsv } from "../../shared/prospeccao";

const S = () => import("../prospeccao/servico");
const G = () => import("../prospeccao/googlePlaces");
const lugarZ = z.object({
  placeId: z.string().min(3).max(200), nome: z.string().min(1).max(200), categoria: z.enum(CATEGORIAS_PROSPECTO), tipoGoogle: z.string().max(120).nullable(),
  endereco: z.string().max(300).nullable(), telefone: z.string().max(15).nullable(), site: z.string().max(300).nullable(), nota: z.number().nullable(),
  avaliacoes: z.number().int().min(0), mapsUrl: z.string().max(500).nullable(), termo: z.string().max(80),
});
const tiposZ = z.array(z.enum(Object.keys(TIPOS_BUSCA_MAPS) as [keyof typeof TIPOS_BUSCA_MAPS, ...(keyof typeof TIPOS_BUSCA_MAPS)[]])).min(1).max(7);

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
  objetivo: z.enum(OBJETIVOS_PROSPECTO).optional(),
});

export const prospeccaoRouter = router({
  lista: protectedProcedure
    .input(z.object({ status: z.enum(STATUS_PROSPECTO).optional(), categoria: z.enum(CATEGORIAS_PROSPECTO).optional(), cidade: z.string().max(80).optional(), objetivo: z.enum(OBJETIVOS_PROSPECTO).optional() }).optional())
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
  // ── Google Maps (Places API oficial)
  mapsConfig: protectedProcedure.query(async ({ ctx }) => {
    exigir(ctx);
    const env = String(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim();
    const { lerConfig } = await import("../configSistema");
    const salva = String((await lerConfig((await G()).CHAVE_CONFIG_PLACES).catch(() => null)) ?? "").trim();
    const chave = env || salva;
    return { configurada: !!chave, origem: env ? "servidor" as const : salva ? "configuracoes" as const : null, final: chave ? chave.slice(-4) : null };
  }),
  salvarChaveMaps: protectedProcedure.input(z.object({ chave: z.string().trim().max(200) })).mutation(async ({ ctx, input }) => {
    exigir(ctx, true);
    if (input.chave && !/^[A-Za-z0-9_\-]{30,120}$/.test(input.chave)) throw new TRPCError({ code: "BAD_REQUEST", message: "Chave com formato inválido (a chave do Google começa com AIza…)." });
    const { gravarConfig } = await import("../configSistema");
    await gravarConfig((await G()).CHAVE_CONFIG_PLACES, input.chave, ctx.user.id);
    return { ok: true as const };
  }),
  buscarMaps: protectedProcedure.input(z.object({ cidade: z.string().trim().min(2).max(80), uf: z.string().trim().length(2), tipos: tiposZ }))
    .mutation(async ({ ctx, input }) => {
      exigir(ctx);
      return rodar(async () => {
        const { lugares, buscas } = await (await G()).buscarNoMaps(input);
        return { buscas, lugares: await (await S()).marcarCadastrados(lugares, input.cidade) };
      });
    }),
  importarMaps: protectedProcedure.input(z.object({
    cidade: z.string().trim().min(2).max(80), uf: z.string().trim().length(2), objetivo: z.enum(OBJETIVOS_PROSPECTO), lugares: z.array(lugarZ).min(1).max(300),
  })).mutation(async ({ ctx, input }) => {
    exigir(ctx);
    return rodar(async () => (await S()).importarDoMaps(input.lugares, { cidade: input.cidade, uf: input.uf.toUpperCase(), objetivo: input.objetivo }, ctx.user.id));
  }),
  virarParceira: protectedProcedure.input(idZ.extend({ comissaoPct: z.number().min(0).max(0.1).optional() })).mutation(async ({ ctx, input }) => {
    exigir(ctx, true);
    return rodar(async () => (await S()).virarParceira(input.id, ctx.user.id, input.comissaoPct ?? 0.02));
  }),
  excluir: protectedProcedure.input(idZ).mutation(async ({ ctx, input }) => { exigir(ctx, true); return rodar(async () => (await S()).excluir(input.id)); }),
});
