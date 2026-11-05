/**
 * Imóveis › Cadastro pelo WhatsApp: vínculo e autorização do WhatsApp, rascunhos, revisão e confirmação.
 * Política central (canUsePropertyIntake): administrador, secretária e corretor; empreendedor bloqueado aqui também.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { podeUsarAgenteImovel } from "../../shared/cadastroImovelAgente";

const A = () => import("../imoveis/agenteCadastro");
const erro = (e: any): never => {
  if (e?.name === "AgenteErro") throw new TRPCError({ code: e.status === 403 ? "FORBIDDEN" : e.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", message: e.message });
  throw e;
};
/** Mesma regra da tela, valendo para toda chamada (inclusive direta) */
function exigir(ctx: any) {
  if ((ctx.req as any)?.verComo) throw new TRPCError({ code: "FORBIDDEN", message: "Indisponível no modo Ver como" });
  if (!podeUsarAgenteImovel(ctx.permissoes?.perfil)) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não usa o cadastro de imóveis pelo WhatsApp." });
  return { id: ctx.user.id as number, perfil: String(ctx.permissoes.perfil) };
}
const campoValor = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

export const agenteImovelRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => { const u = exigir(ctx); return (await A()).statusVinculo(u.id).catch(erro); }),
  gerarCodigo: protectedProcedure.mutation(async ({ ctx }) => { const u = exigir(ctx); return (await A()).gerarCodigoVinculo(u.id).catch(erro); }),
  autorizar: protectedProcedure.mutation(async ({ ctx }) => { const u = exigir(ctx); return (await A()).autorizarCanal(u.id).catch(erro); }),
  revogar: protectedProcedure.mutation(async ({ ctx }) => { const u = exigir(ctx); await (await A()).revogarCanal(u.id, "pelo usuário"); return { ok: true as const }; }),

  rascunhos: protectedProcedure.query(async ({ ctx }) => { const u = exigir(ctx); return (await A()).listarRascunhos(u.id, u.perfil).catch(erro); }),
  rascunho: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ input, ctx }) => { const u = exigir(ctx); return (await A()).detalheRascunho(input.id, u.id, u.perfil).catch(erro); }),
  salvar: protectedProcedure
    .input(z.object({ id: z.number().int(), dados: z.record(z.string(), campoValor).optional(), titulo: z.string().max(160).nullable().optional(), descricao: z.string().max(4000).nullable().optional(), responsavelId: z.number().int().nullable().optional() }))
    .mutation(async ({ input, ctx }) => { const u = exigir(ctx); return (await A()).salvarCampos(input.id, u.id, u.perfil, input as any).catch(erro); }),
  foto: protectedProcedure.input(z.object({ id: z.number().int(), fotoId: z.number().int(), acao: z.enum(["capa", "remover"]) }))
    .mutation(async ({ input, ctx }) => { const u = exigir(ctx); return (await A()).mexerFoto(input.id, input.fotoId, input.acao, u.id, u.perfil).catch(erro); }),
  revisar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    const u = exigir(ctx); const m = await A(); await m.detalheRascunho(input.id, u.id, u.perfil).catch(erro);
    return { mensagem: await m.prepararRevisao(input.id) };
  }),
  confirmar: protectedProcedure.input(z.object({ id: z.number().int(), versao: z.number().int() })).mutation(async ({ input, ctx }) => {
    const u = exigir(ctx); const m = await A(); await m.detalheRascunho(input.id, u.id, u.perfil).catch(erro);
    return m.confirmarRascunho(input.id, { id: u.id, canal: "crm", versao: input.versao });
  }),
  excluir: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => { const u = exigir(ctx); return (await A()).excluirRascunho(input.id, u.id, u.perfil).catch(erro); }),
  cancelar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => { const u = exigir(ctx); return (await A()).cancelarRascunho(input.id, u.id, u.perfil).catch(erro); }),
  equipe: protectedProcedure.query(async ({ ctx }) => {
    const u = exigir(ctx);
    if (!["admin", "secretario"].includes(u.perfil)) return [];
    const { getDb } = await import("../db"); const { users } = await import("../../drizzle/schema"); const { perfilDe } = await import("../../shared/equipe");
    const d: any = await getDb();
    const rows: any[] = d ? await d.select({ id: users.id, name: users.name, perfil: (users as any).perfil, role: users.role, ativo: users.ativo }).from(users) : [];
    return rows.filter(x => x.ativo !== false && x.ativo !== 0 && podeUsarAgenteImovel(perfilDe(x))).map(x => ({ id: Number(x.id), nome: x.name || "Sem nome" }));
  }),

  /** Administrador: motor, vínculos, fila e erros; revogar o vínculo de alguém */
  painel: protectedProcedure.query(async ({ ctx }) => {
    const u = exigir(ctx);
    if (u.perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador" });
    return (await A()).painelAdmin();
  }),
  revogarDe: protectedProcedure.input(z.object({ usuarioId: z.number().int() })).mutation(async ({ input, ctx }) => {
    const u = exigir(ctx);
    if (u.perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador" });
    await (await A()).revogarCanal(input.usuarioId, `pelo administrador ${u.id}`);
    return { ok: true as const };
  }),
});
