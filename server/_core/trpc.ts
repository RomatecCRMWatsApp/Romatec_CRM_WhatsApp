import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { perfilDe, podeChamar } from "../../shared/equipe";
import { moduloLiberado } from "../../shared/permissoes";
import { caminhoLivre, precisaLicenca } from "../../shared/saas";
import { carregarPermissoes, type PermissoesUsuario } from "../permissoes";
import { MENSAGEM_SO_LEITURA } from "./verComo";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Erros de validação por campo (cadastro): { campo: mensagem } em error.data.campos
  errorFormatter({ shape, error }) {
    const campos = (error.cause as { campos?: Record<string, string> } | undefined)?.campos;
    return campos ? { ...shape, data: { ...shape.data, campos } } : shape;
  },
});

export const router = t.router;

/** "Ver como" do administrador (server/_core/verComo.ts): só leitura — nenhuma ação é gravada em nome da pessoa */
const somenteLeituraNoVerComo = t.middleware(({ ctx, type, next }) => {
  if (ctx.verComo && type !== "query") throw new TRPCError({ code: "FORBIDDEN", message: MENSAGEM_SO_LEITURA });
  return next();
});
const base = t.procedure.use(somenteLeituraNoVerComo);

export const publicProcedure = base;

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  // Acesso desativado na tela Equipe: a sessão deixa de valer na hora
  if (!ctx.user || (ctx.user as any).ativo === false || (ctx.user as any).ativo === 0) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  // Perfil (shared/equipe.ts): empreendedor só vê o painel dele; equipe não mexe em configurações/equipe/ZAYRA
  if (!podeChamar(perfilDe(ctx.user as any), path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu acesso não inclui esta área do CRM." });
  }
  // Portal de permissões (shared/permissoes.ts): corretor só usa os módulos liberados para ele
  const permissoes = await carregarPermissoes(ctx.user as any);
  if (!moduloLiberado(permissoes.perfil, permissoes.modulos, path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este módulo não está liberado para você. Peça ao administrador." });
  }
  // Camada SaaS (shared/saas.ts): corretor/empreendedor sem licença → 402 e o app abre /assinatura.
  // Só com o licenciamento ligado; fail-closed: erro ao conferir nunca libera.
  // Sem banco conectado nenhum procedimento devolve dados (e os testes de permissão rodam sem banco): não há o que licenciar
  const { getDb } = await import("../db");
  if (precisaLicenca(permissoes.perfil) && !caminhoLivre(path) && (await getDb())) {
    let liberado = false;
    try {
      const { resumoLicenca } = await import("../saas/servico");
      liberado = (await resumoLicenca(ctx.user as any)).liberado;
    } catch (e: any) {
      console.error("[licenca]", e?.message);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível conferir a sua assinatura agora. Tente de novo." });
    }
    if (!liberado) throw new TRPCError({ code: "PAYMENT_REQUIRED", message: "ASSINATURA_NECESSARIA" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      permissoes,
    },
  });
});

export const protectedProcedure = base.use(requireUser);

export const adminProcedure = base.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin' || (ctx.user as any).ativo === false || (ctx.user as any).ativo === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        permissoes: { perfil: "admin" as const, modulos: null, acessos: [] } as PermissoesUsuario,
      },
    });
  }),
);
