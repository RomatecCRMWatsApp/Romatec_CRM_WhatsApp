import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getAllContacts, getContactById, createContact, getAllProperties, getPropertyById, createProperty, getAllCampaigns, getCampaignById, createCampaign, getCompanyConfig, updateCompanyConfig, getDb } from "./db";
import { campaigns, contacts, campaignContacts, messages, properties, contactCampaignHistory } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
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
        const db = await getDb();
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

    /**
     * AUTO CONFIGURAR CAMPANHAS
     * Cria 4 campanhas (1 por imóvel) com 12 contatos cada = 48 contatos
     * Seleciona contatos aleatórios do banco
     */
    autoSetup: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Buscar todos os imóveis disponíveis
      const allProperties = await db.select().from(properties).where(eq(properties.status, "available"));
      if (allProperties.length === 0) throw new Error("Nenhum imóvel disponível");

      // 2. Buscar contatos ativos (não bloqueados)
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      if (allContacts.length < 48) {
        console.warn(`⚠️ Apenas ${allContacts.length} contatos disponíveis. Usando todos.`);
      }

      // 3. Embaralhar contatos
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);

      // 4. Limpar campanhas existentes
      await db.delete(campaignContacts);
      await db.delete(campaigns);

      // 5. Criar 1 campanha por imóvel com variações de mensagem
      const createdCampaigns = [];
      for (let i = 0; i < allProperties.length; i++) {
        const prop = allProperties[i];

        // Variações de mensagem para cada campanha
        const variations = [
          `Olá! Temos uma excelente oportunidade para você: ${prop.denomination} em ${prop.address}. Imóvel com ótimas condições. Quer saber mais?`,
          `Boa tarde! O imóvel ${prop.denomination} está disponível por R$ ${Number(prop.price).toLocaleString("pt-BR")}. Localizado em ${prop.address}. Posso enviar mais detalhes?`,
          `Ei! Você conhece o ${prop.denomination}? É um imóvel incrível em ${prop.address}. Valor: R$ ${Number(prop.price).toLocaleString("pt-BR")}. Vamos conversar?`,
          `Oportunidade única! ${prop.denomination} - ${prop.address}. Condições especiais de pagamento. Quer agendar uma visita?`,
        ];

        const result = await db.insert(campaigns).values({
          propertyId: prop.id,
          name: prop.denomination,
          messageVariations: variations,
          totalContacts: 12,
          sentCount: 0,
          failedCount: 0,
          status: "running",
          startDate: new Date(),
        });

        const campaignId = Number(result[0].insertId);
        createdCampaigns.push({ id: campaignId, name: prop.denomination });

        // 6. Designar 12 contatos para esta campanha
        const startIdx = i * 12;
        const campaignContactsList = shuffled.slice(startIdx, startIdx + 12);

        for (const contact of campaignContactsList) {
          await db.insert(campaignContacts).values({
            campaignId: campaignId,
            contactId: contact.id,
            messagesSent: 0,
            status: "pending",
          });
        }
      }

      return {
        success: true,
        campaigns: createdCampaigns,
        totalContacts: Math.min(allProperties.length * 12, shuffled.length),
        message: `${createdCampaigns.length} campanhas criadas com ${Math.min(allProperties.length * 12, shuffled.length)} contatos`,
      };
    }),

    /**
     * Obter contatos de uma campanha com status
     */
    getContacts: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const cc = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId));

        const result = [];
        for (const item of cc) {
          const contactResult = await db.select().from(contacts).where(eq(contacts.id, item.contactId)).limit(1);
          const contact = contactResult[0];
          if (!contact) continue;

          // Buscar última mensagem enviada para este contato nesta campanha
          const lastMsg = await db.select().from(messages)
            .where(and(
              eq(messages.contactId, contact.id),
              eq(messages.campaignId, input.campaignId),
              eq(messages.status, "sent")
            ))
            .limit(1);

          result.push({
            id: item.id,
            contactId: contact.id,
            name: contact.name,
            phone: contact.phone,
            status: item.status,
            messagesSent: item.messagesSent || 0,
            lastMessageSent: lastMsg[0]?.sentAt || null,
            blockedUntil: contact.blockedUntil,
          });
        }

        return result;
      }),
  }),

  // Scheduler Router
  scheduler: router({
    /**
     * Iniciar scheduler (loop infinito 24/7)
     */
    start: protectedProcedure.mutation(async () => {
      await campaignScheduler.start();
      return { success: true, message: "Scheduler iniciado - 2 mensagens por hora, loop infinito" };
    }),

    /**
     * Parar scheduler
     */
    stop: protectedProcedure.mutation(async () => {
      campaignScheduler.stop();
      return { success: true, message: "Scheduler parado" };
    }),

    /**
     * Estado atual do scheduler
     */
    getState: publicProcedure.query(async () => {
      const state = campaignScheduler.getState();
      const stats = campaignScheduler.getStats();

      const db = await getDb();
      if (!db) return { state, stats, activeCampaigns: [], todayMessages: [] };

      // Campanhas ativas
      const activeCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

      // Mensagens de hoje
      const todayMessages = await db.select().from(messages).where(eq(messages.status, "sent"));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const filteredMessages = todayMessages.filter(m => m.sentAt && m.sentAt >= today);

      return {
        state,
        stats,
        activeCampaigns,
        todayMessages: filteredMessages,
      };
    }),

    /**
     * Estatísticas do scheduler
     */
    getStats: publicProcedure.query(async () => {
      return campaignScheduler.getStats();
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
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstanceId}/status`, {
          headers: { "Client-Token": config.zApiToken },
        });
        if (response.ok) {
          await updateCompanyConfig({ zApiConnected: true, zApiLastChecked: new Date() });
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
      .input(z.object({ phone: z.string(), message: z.string() }))
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
