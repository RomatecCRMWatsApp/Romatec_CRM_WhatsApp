/**
 * Campanhas de captação com código (#IG-OUT26-CHAC) e gerador de link wa.me
 * por imóvel × campanha. Painel → Leads › Campanhas.
 */
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { leadCampanhas, leadQualifications, properties, empreendimentos } from "../../drizzle/schema";
import { normalizarCodigoCampanha, mensagemPreenchida, linkWhatsApp } from "../leads/atribuicao";
import { numeroWhatsAppLeads, appUrl } from "../leads/config";
import { CANAIS_CAMPANHA } from "../leads/inbound";

const funilSchema = z.enum(["comprador", "proprietario"]);
const campos = {
  nome: z.string().trim().min(2).max(160),
  canal: z.string().refine(c => CANAIS_CAMPANHA.includes(c), "Canal inválido"),
  funil: funilSchema.default("comprador"),
  propertyId: z.number().int().positive().nullable().optional(),
  empreendimentoSlug: z.string().trim().max(80).nullable().optional(),
  metaFormId: z.string().trim().max(40).nullable().optional(),
  googleFormId: z.string().trim().max(40).nullable().optional(),
  utmSource: z.string().trim().max(60).nullable().optional(),
  utmCampaign: z.string().trim().max(120).nullable().optional(),
  gastoTotal: z.coerce.number().min(0).optional(),
  ativa: z.boolean().optional(),
};

async function qrSvg(texto: string): Promise<string> {
  const QR = await import("qrcode");
  return QR.toString(texto, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db;
}

export const leadCampanhasRouter = router({
  canais: protectedProcedure.query(() => CANAIS_CAMPANHA),

  /** Empreendimentos (ex.: Bom Jardims): lead de campanha ligada a um deles vai para o atendimento próprio, sem bot genérico */
  empreendimentos: protectedProcedure.query(async () => {
    const db = await dbOrThrow();
    return db.select({ slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos);
  }),

  list: protectedProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db.select().from(leadCampanhas).orderBy(desc(leadCampanhas.createdAt));
    const leads = await db.select({ origem: leadQualifications.origemCampanhaId, ultima: leadQualifications.ultimaCampanhaId }).from(leadQualifications);
    return rows.map((c: any) => ({
      ...c,
      gastoTotal: Number(c.gastoTotal) || 0,
      leadsPrimeiroToque: leads.filter((l: any) => l.origem === c.id).length,
      leadsUltimoToque: leads.filter((l: any) => l.ultima === c.id).length,
    }));
  }),

  create: protectedProcedure
    .input(z.object({ codigo: z.string(), ...campos }))
    .mutation(async ({ input }) => {
      const codigo = normalizarCodigoCampanha(input.codigo);
      if (!codigo) throw new Error("Código inválido: use 3 a 20 letras, números ou hífen (ex.: IG-OUT26-CHAC)");
      const db = await dbOrThrow();
      const [existe] = await db.select({ id: leadCampanhas.id }).from(leadCampanhas).where(eq(leadCampanhas.codigo, codigo)).limit(1);
      if (existe) throw new Error(`Já existe uma campanha com o código ${codigo}`);
      const { gastoTotal, ...rest } = input;
      const res: any = await db.insert(leadCampanhas).values({ ...rest, codigo, gastoTotal: String(gastoTotal ?? 0) } as any);
      return { id: Number(res?.[0]?.insertId ?? res?.lastInsertRowid), codigo };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int() }).merge(z.object(campos).partial()))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const { id, ...data } = input;
      const set: any = {};
      for (const [k, v] of Object.entries(data)) if (v !== undefined) set[k] = k === "gastoTotal" ? String(v) : v;
      await db.update(leadCampanhas).set(set).where(eq(leadCampanhas.id, id));
      return { success: true };
    }),

  // Excluir só admin (a campanha some da atribuição dos leads já existentes)
  delete: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    await db.delete(leadCampanhas).where(eq(leadCampanhas.id, input.id));
    return { success: true };
  }),

  /** Mensagem pré-preenchida + link wa.me para imóvel × campanha (§5.1) */
  linkWhatsApp: protectedProcedure
    .input(z.object({ propertyId: z.number().int().optional(), campanhaId: z.number().int().optional(), funil: funilSchema.optional() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const [campanha] = input.campanhaId ? await db.select().from(leadCampanhas).where(eq(leadCampanhas.id, input.campanhaId)).limit(1) : [];
      const propertyId = input.propertyId ?? campanha?.propertyId ?? undefined;
      const [imovel] = propertyId ? await db.select({ codigo: properties.codigo }).from(properties).where(eq(properties.id, propertyId)).limit(1) : [];
      const funil = input.funil ?? (campanha?.funil as "comprador" | "proprietario") ?? "comprador";
      const mensagem = mensagemPreenchida({ funil, imovelCodigo: imovel?.codigo, campanhaCodigo: campanha?.codigo });
      const url = linkWhatsApp(numeroWhatsAppLeads(), mensagem);
      // Landing do imóvel com a campanha na URL (rastreio + botão de WhatsApp com o #código)
      const landing = imovel?.codigo
        ? `${appUrl()}/i/${imovel.codigo}${campanha ? `?utm_campaign=${encodeURIComponent(campanha.codigo)}` : ""}`
        : null;
      return { mensagem, url, landing, qrSvg: await qrSvg(url) };
    }),

  /** QR da placa: aponta para /q/IMV-xxxx (registra o scan e abre o WhatsApp) */
  qrPlaca: protectedProcedure
    .input(z.object({ propertyId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const [imovel] = await db.select({ codigo: properties.codigo }).from(properties).where(eq(properties.id, input.propertyId)).limit(1);
      if (!imovel?.codigo) throw new Error("Imóvel sem código IMV");
      const url = `${appUrl()}/q/${imovel.codigo}`;
      const QR = await import("qrcode");
      return {
        url,
        landing: `${appUrl()}/i/${imovel.codigo}`,
        qrSvg: await qrSvg(url),
        qrPng: await QR.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
      };
    }),
});
