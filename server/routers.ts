import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getAllContacts, getContactById, createContact, getAllProperties, getPropertyById, createProperty, getAllCampaigns, getCampaignById, createCampaign, getCompanyConfig, updateCompanyConfig, getDb } from "./db";
import { campaigns, contacts, campaignContacts, messages, properties, contactCampaignHistory, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { campaignScheduler } from "./scheduler/campaignScheduler";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          let userList = await db.select().from(users).where(eq(users.email, input.username)).limit(1);
          if (!userList[0]) {
            userList = await db.select().from(users).where(eq(users.openId, input.username)).limit(1);
          }
          const user = userList[0];
          if (!user) throw new Error("Usuário não encontrado");
          const { sdk } = await import("./_core/sdk");
          const { ONE_YEAR_MS } = await import("@shared/const");
          const cookieOptions = getSessionCookieOptions(ctx.req);
          const token = await sdk.createSessionToken(user.openId, { name: user.name || "" });
          ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
          return { success: true };
        } catch (error) {
          console.error("[Login] Erro:", error);
          throw error;
        }
      }),
  }),

  contacts: router({
    list: publicProcedure.query(async () => getAllContacts()),
    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getContactById(input.id)),
    create: protectedProcedure.input(z.object({ name: z.string(), phone: z.string(), email: z.string().optional() })).mutation(async ({ input }) => createContact({ name: input.name, phone: input.phone, email: input.email, status: "active" })),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), status: z.enum(["active", "inactive", "blocked"]).optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, ...data } = input;
      const updateData: any = {};
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
      await db.update(contacts).set(updateData).where(eq(contacts.id, id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(campaignContacts).where(eq(campaignContacts.contactId, input.id));
      await db.delete(contacts).where(eq(contacts.id, input.id));
      return { success: true };
    }),
    importBatch: protectedProcedure.input(z.array(z.object({ name: z.string(), phone: z.string(), email: z.string().optional() }))).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const results = [];
      for (const contact of input) {
        try {
          await createContact({ name: contact.name, phone: contact.phone, email: contact.email, status: "active" });
          results.push({ success: true, ...contact });
        } catch (error) {
          results.push({ success: false, ...contact, error: String(error) });
        }
      }
      return results;
    }),
  }),

  properties: router({
    list: publicProcedure.query(async () => getAllProperties()),
    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getPropertyById(input.id)),
    getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(properties).where(eq(properties.publicSlug, input.slug)).limit(1);
      return result[0] || null;
    }),
    create: protectedProcedure.input(z.object({ denomination: z.string(), address: z.string(), city: z.string().optional(), state: z.string().optional(), cep: z.string().optional(), price: z.string(), offerPrice: z.string().optional(), description: z.string().optional(), images: z.array(z.string()).optional(), videoUrl: z.string().optional(), plantaBaixaUrl: z.string().optional(), areaConstruida: z.string().optional(), areaCasa: z.string().optional(), areaTerreno: z.string().optional(), bedrooms: z.number().optional(), bathrooms: z.number().optional(), garageSpaces: z.number().optional(), propertyType: z.string().optional() })).mutation(async ({ input }) => {
      const slug = input.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const result = await db.insert(properties).values({ ...input, price: input.price as any, offerPrice: input.offerPrice as any || null, areaConstruida: input.areaConstruida as any || null, areaCasa: input.areaCasa as any || null, areaTerreno: input.areaTerreno as any || null, images: input.images || [], publicSlug: slug, status: "available" });
      return { id: Number((result as any)[0].insertId), slug };
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), denomination: z.string().optional(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), cep: z.string().optional(), price: z.string().optional(), offerPrice: z.string().optional(), description: z.string().optional(), images: z.array(z.string()).optional(), videoUrl: z.string().optional(), plantaBaixaUrl: z.string().optional(), areaConstruida: z.string().optional(), areaCasa: z.string().optional(), areaTerreno: z.string().optional(), bedrooms: z.number().optional(), bathrooms: z.number().optional(), garageSpaces: z.number().optional(), propertyType: z.string().optional(), status: z.enum(["available", "sold", "inactive"]).optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, ...data } = input;
      const updateData: any = {};
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
      await db.update(properties).set(updateData).where(eq(properties.id, id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const relatedCampaigns = await db.select().from(campaigns).where(eq(campaigns.propertyId, input.id));
      for (const camp of relatedCampaigns) {
        await db.delete(messages).where(eq(messages.campaignId, camp.id));
        await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, camp.id));
        await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
      }
      await db.delete(messages).where(eq(messages.propertyId, input.id));
      await db.delete(campaigns).where(eq(campaigns.propertyId, input.id));
      await db.delete(properties).where(eq(properties.id, input.id));
      return { success: true };
    }),
    generateDescription: protectedProcedure.input(z.object({ denomination: z.string(), address: z.string(), city: z.string().optional(), price: z.string(), offerPrice: z.string().optional(), areaConstruida: z.string().optional(), areaCasa: z.string().optional(), areaTerreno: z.string().
