/** Resumo semanal no WhatsApp do administrador (server/resumoSemanal.ts): só o administrador vê e mexe */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";

const R = () => import("../resumoSemanal");

export const resumoSemanalRouter = router({
  estado: adminProcedure.query(async () => ({ ligado: await (await R()).resumoLigado() })),
  previa: adminProcedure.query(async () => (await R()).previaResumo()),
  definirLigado: adminProcedure.input(z.object({ ligado: z.boolean() }))
    .mutation(async ({ input, ctx }) => { await (await R()).definirResumoLigado(input.ligado, ctx.user.id); return { ok: true }; }),
  enviarAgora: adminProcedure.mutation(async () => (await R()).enviarResumo()),
});
