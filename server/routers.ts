import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getAllContacts, getContactById, createContact, getAllProperties, getPropertyById, createProperty, getAllCampaigns, getCampaignById, createCampaign, getCompanyConfig, updateCompanyConfig } from "./db";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Routers de Contatos
  contacts: router({
    list: publicProcedure.query(async () => {
      return getAllContacts();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getContactById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        phone: z.string(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return createContact({
          name: input.name,
          phone: input.phone,
          email: input.email,
          status: "active",
        });
      }),

    importBatch: protectedProcedure
      .input(z.array(z.object({
        name: z.string(),
        phone: z.string(),
        email: z.string().optional(),
      })))
      .mutation(async ({ input }) => {
        const db = await require("./db").getDb();
        if (!db) throw new Error("Database not available");
        
        const results = [];
        for (const contact of input) {
          try {
            const result = await createContact({
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              status: "active",
            });
            results.push({ success: true, ...contact });
          } catch (error) {
            results.push({ success: false, ...contact, error: String(error) });
          }
        }
        return results;
      }),
  }),

  // Routers de Imóveis
  properties: router({
    list: publicProcedure.query(async () => {
      return getAllProperties();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getPropertyById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        denomination: z.string(),
        address: z.string(),
        price: z.string(),
        description: z.string().optional(),
        images: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        return createProperty({
          denomination: input.denomination,
          address: input.address,
          price: input.price as any,
          description: input.description,
          images: input.images || [],
          status: "available",
        });
      }),
  }),

  // Routers de Campanhas
  campaigns: router({
    list: publicProcedure.query(async () => {
      return getAllCampaigns();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getCampaignById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        propertyId: z.number(),
        name: z.string(),
        messageVariations: z.array(z.string()).optional(),
        totalContacts: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return createCampaign({
          propertyId: input.propertyId,
          name: input.name,
          messageVariations: input.messageVariations || [],
          totalContacts: input.totalContacts || 12,
          status: "draft",
        });
      }),
  }),

  // Routers de Configuração da Empresa
  companyConfig: router({
    get: publicProcedure.query(async () => {
      return getCompanyConfig();
    }),

    update: protectedProcedure
      .input(z.object({
        companyName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        zApiInstanceId: z.string().optional(),
        zApiToken: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return updateCompanyConfig(input);
      }),

    testZApiConnection: protectedProcedure.mutation(async () => {
      const config = await getCompanyConfig();
      if (!config || !config.zApiInstanceId || !config.zApiToken) {
        return { success: false, message: "Z-API credentials not configured" };
      }

      try {
        // Teste simples de conexão com Z-API
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstanceId}/status`, {
          headers: {
            "Client-Token": config.zApiToken,
          },
        });

        if (response.ok) {
          await updateCompanyConfig({
            zApiConnected: true,
            zApiLastChecked: new Date(),
          });
          return { success: true, message: "Z-API connection successful" };
        } else {
          return { success: false, message: "Z-API connection failed" };
        }
      } catch (error) {
        return { success: false, message: String(error) };
      }
    }),
  }),

  // Z-API Router
  zapi: router({
    sendMessage: protectedProcedure
      .input(z.object({
        phone: z.string(),
        message: z.string(),
      }))
      .mutation(async ({ input }) => {
        const config = await getCompanyConfig();
        if (!config?.zApiInstanceId || !config?.zApiToken) {
          return { success: false, error: 'Z-API nao configurado' };
        }
        const { sendMessageViaZAPI } = await import('./zapi-integration');
        return sendMessageViaZAPI({
          instanceId: config.zApiInstanceId,
          token: config.zApiToken,
          phone: input.phone,
          message: input.message,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
