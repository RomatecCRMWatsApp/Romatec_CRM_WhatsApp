/**
 * Meu certificado digital (ICP-Brasil A1): administrador, secretária, advogados (jurídico) e empreendedor guardam o
 * .pfx (cifrado; a senha nunca é guardada) para assinar documentos com o certificado — o comprador assina pelo WhatsApp.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";

const PODE = ["admin", "secretario", "juridico", "empreendedor"];

function exigir(ctx: any) {
  if (!PODE.includes(String(perfilDe(ctx.user)))) throw new TRPCError({ code: "FORBIDDEN", message: "Assinatura com certificado digital: administrador, secretária, advogados e empreendedor." });
}
async function comErro<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "CertificadoErro") throw new TRPCError({ code: e.status === 403 ? "FORBIDDEN" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST", message: e.message });
    throw e;
  }
}

export const certificadoRouter = router({
  meu: protectedProcedure.query(async ({ ctx }) => {
    exigir(ctx);
    const { meuCertificado } = await import("../certificado/servico");
    return meuCertificado(ctx.user.id);
  }),
  guardar: protectedProcedure.input(z.object({ pfxBase64: z.string().min(10).max(280_000), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      exigir(ctx);
      const { guardarCertificado } = await import("../certificado/servico");
      return comErro(() => guardarCertificado(ctx.user.id, Buffer.from(input.pfxBase64, "base64"), input.senha));
    }),
  remover: protectedProcedure.mutation(async ({ ctx }) => {
    exigir(ctx);
    const { removerCertificado } = await import("../certificado/servico");
    return removerCertificado(ctx.user.id);
  }),
});
