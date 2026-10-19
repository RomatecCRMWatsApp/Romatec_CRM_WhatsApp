import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { perfilDe, podeChamar } from "../../shared/equipe";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

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

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin' || (ctx.user as any).ativo === false || (ctx.user as any).ativo === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
