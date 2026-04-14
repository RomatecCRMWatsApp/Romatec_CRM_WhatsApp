import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getAllContacts, getContactById, createContact, getAllProperties, getPropertyById, createProperty, getAllCampaigns, getCampaignById, createCampaign, getCompanyConfig, updateCompanyConfig, getDb } from "./db";
import { campaigns, contacts, campaignContacts, messages, properties, contactCampaignHistory, users, leadQualifications } from "../drizzle/schema";
import { eq, and, desc, gte, or, like, isNotNull } from "drizzle-orm";
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
          if (!user) throw new Error("Usuario nao encontrado");
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
    list: protectedProcedure.query(async () => getAllContacts()),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getContactById(input.id)),
    create: protectedProcedure
      .input(z.object({ 
        name: z.string().min(1), 
        phone: z.string().min(2), 
        email: z.string().email().optional() 
      }))
      .mutation(async ({ input }) => createContact({ 
        name: input.name, 
        phone: input.phone, 
        email: input.email, 
        status: "active" 
      })),
    update: protectedProcedure
      .input(z.object({ 
        id: z.number(), 
        name: z.string().optional(), 
        phone: z.string().optional(), 
        email: z.string().email().optional(), 
        status: z.enum(["active", "inactive", "blocked"]).optional() 
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...data } = input;
        const updateData: any = {};
        Object.entries(data).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(contacts).set(updateData).where(eq(contacts.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(messages).where(eq(messages.contactId, input.id));
        await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.contactId, input.id));
        await db.delete(campaignContacts).where(eq(campaignContacts.contactId, input.id));
        await db.delete(contacts).where(eq(contacts.id, input.id));
        return { success: true };
      }),
    importBatch: protectedProcedure
      .input(z.array(z.object({ 
        name: z.string().min(1), 
        phone: z.string().min(2), 
        email: z.string().email().optional() 
      })))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const results = [];
        for (const contact of input) {
          try {
            await createContact({ 
              name: contact.name, 
              phone: contact.phone, 
              email: contact.email, 
              status: "active" 
            });
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
    create: protectedProcedure
      .input(z.object({
        denomination: z.string().min(1),
        address: z.string().min(1),
        city: z.string().optional(),
        state: z.string().optional(),
        cep: z.string().optional(),
        price: z.string().min(1),
        offerPrice: z.string().optional(),
        areaConstruida: z.coerce.number().optional(),
        areaTotal: z.coerce.number().optional(),
        bedrooms: z.coerce.number().optional(),
        bathrooms: z.coerce.number().optional(),
        description: z.string().optional(),
        status: z.enum(["available", "unavailable"]).default("available")
      }))
      .mutation(async ({ input }) => {
        const slug = input.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const result = await db.insert(properties).values({ 
          ...input, 
          price: input.price as any, 
          offerPrice: input.offerPrice as any || null, 
          areaConstruida: input.areaConstruida as any || null, 
          areaTotal: input.areaTotal as any || null,
          publicSlug: slug 
        });
        return { id: Number((result as any)[0].insertId), slug };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        denomination: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        cep: z.string().optional(),
        price: z.string().optional(),
        offerPrice: z.string().optional(),
        areaConstruida: z.coerce.number().optional(),
        areaTotal: z.coerce.number().optional(),
        bedrooms: z.coerce.number().optional(),
        bathrooms: z.coerce.number().optional(),
        description: z.string().optional(),
        status: z.enum(["available", "unavailable"]).optional()
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...data } = input;
        const updateData: any = {};
        Object.entries(data).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(properties).set(updateData).where(eq(properties.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
    generateDescription: protectedProcedure
      .input(z.object({ 
        denomination: z.string(), 
        address: z.string(), 
        city: z.string().optional(), 
        price: z.string(), 
        offerPrice: z.string().optional(), 
        areaConstruida: z.coerce.number().optional(),
        bedrooms: z.coerce.number().optional(),
        bathrooms: z.coerce.number().optional()
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const prompt = `Gere uma descricao atrativa para o imovel: ${input.denomination} em ${input.address}, R$ ${Number(input.price).toLocaleString('pt-BR')}. Use gatilhos de escassez e urgÔö£┬¼ncia.`;
        const response = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
        const descContent = response.choices[0]?.message?.content;
        return { description: typeof descContent === 'string' ? descContent : 'Descricao nao gerada' };
      }),
    generateWhatsAppMessage: protectedProcedure
      .input(z.object({ propertyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const prop = await db.select().from(properties).where(eq(properties.id, input.propertyId)).limit(1);
        if (!prop[0]) throw new Error("Imovel nao encontrado");
        const p = prop[0];
        const { invokeLLM } = await import("./_core/llm");
        const response = await invokeLLM({ 
          messages: [{ 
            role: "user", 
            content: `Gere 4 variacoes de mensagem WhatsApp para: ${p.denomination} em ${p.address}, R$ ${Number(p.price).toLocaleString('pt-BR')}. Separe com |||` 
          }] 
        });
        const text = typeof response.choices[0]?.message?.content === 'string' ? response.choices[0].message.content : '';
        const variations = text.split('|||').map((v: string) => v.trim()).filter(Boolean);
        return { variations: variations.length > 0 ? variations : [text] };
      }),
  }),
  campaigns: router({
    list: protectedProcedure.query(async () => getAllCampaigns()),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getCampaignById(input.id)),
    create: protectedProcedure
      .input(z.object({ 
        propertyId: z.number(), 
        name: z.string().min(1), 
        messageVariations: z.array(z.string()).optional(), 
        totalContacts: z.number().min(1).optional().default(2) 
      }))
      .mutation(async ({ input }) => createCampaign(input)),
    autoSetup: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const allProperties = await db.select().from(properties).where(eq(properties.status, "available"));
      if (allProperties.length === 0) throw new Error("Nenhum imovel disponivel");
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);
      // NEVER delete existing campaigns — preserves IDs and avoids drift
      // Instead: update existing campaigns, create only for new properties
      const existingCampaigns = await db.select().from(campaigns);
      const existingByPropId = new Map(existingCampaigns.map(c => [c.propertyId, c]));
      const result = [];
      const usedContactIds = new Set<number>();
      for (const prop of allProperties) {
        let campaignId: number;
        const existing = existingByPropId.get(prop.id);
        if (existing) {
          // Update existing campaign — keep same ID
          await db.update(campaigns).set({ totalContacts: 2, messagesPerHour: 1, sentCount: 0, failedCount: 0, status: "paused" }).where(eq(campaigns.id, existing.id));
          campaignId = existing.id;
          // Remove existing contacts to reassign
          await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
        } else {
          // Create campaign only if it doesn't exist for this property
          const defaultMessages = [
            `Olá! Temos uma ótima oportunidade em ${prop.denomination}. Gostaria de conhecer mais? 🏠`,
            `Vimos que você pode estar interessado em ${prop.denomination}. Vamos conversar? 📞`,
            `Oportunidade especial em ${prop.denomination}. Clique para saber mais! ✨`
          ];
          const ins = await db.insert(campaigns).values({ propertyId: prop.id, name: prop.denomination, messageVariations: JSON.stringify(defaultMessages), totalContacts: 2, sentCount: 0, failedCount: 0, status: "paused", messagesPerHour: 1 });
          campaignId = Number((ins as any)[0].insertId);
        }
        result.push({ id: campaignId, name: prop.denomination });
        // Assign 2 unique contacts to this campaign
        const available = shuffled.filter(c => !usedContactIds.has(c.id));
        const selected = available.slice(0, 2);
        for (const contact of selected) {
          usedContactIds.add(contact.id);
          await db.insert(campaignContacts).values({ campaignId, contactId: contact.id, messagesSent: 0, status: "pending" });
        }
      }
      return { success: true, campaigns: result, totalContacts: 2, message: result.length + " campanhas configuradas" };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(messages).where(eq(messages.campaignId, input.id));
      await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, input.id));
      await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.id));
      await db.delete(campaigns).where(eq(campaigns.id, input.id));
      return { success: true };
    }),
    getContacts: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const cc = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId));
      const result = [];
      for (const item of cc) {
        const contactResult = await db.select().from(contacts).where(eq(contacts.id, item.contactId)).limit(1);
        const contact = contactResult[0];
        if (!contact) continue;
        const lastMsg = await db.select().from(messages).where(and(eq(messages.contactId, contact.id), eq(messages.campaignId, input.campaignId), eq(messages.status, "sent"))).limit(1);
        result.push({ id: item.id, contactId: contact.id, name: contact.name, phone: contact.phone, status: item.status, messagesSent: item.messagesSent || 0, lastMessageSent: lastMsg[0]?.sentAt || null });
      }
      return result;
    }),
    getCycleStatus: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { campaigns: [], dayCount: 0, nightCount: 0 };
      const allCampaigns = await db.select().from(campaigns);
      const dayActive = allCampaigns.filter(c => c.activeDay).length;
      const nightActive = allCampaigns.filter(c => c.activeNight).length;
      return {
        campaigns: allCampaigns.map(c => ({
          id: c.id,
          name: c.name,
          activeDay: c.activeDay || false,
          activeNight: c.activeNight || false,
        })),
        dayCount: dayActive,
        nightCount: nightActive,
        maxPerCycle: 5,
      };
    }),
    toggleCycleActivation: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        period: z.enum(["day", "night"]),
        active: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        if (input.active) {
          const allCampaigns = await db.select().from(campaigns);
          const activeCount = input.period === "day"
            ? allCampaigns.filter(c => c.activeDay).length
            : allCampaigns.filter(c => c.activeNight).length;
          if (activeCount >= 5) {
            throw new Error(`Máximo de 5 campanhas ativadas no ciclo ${input.period === 'day' ? 'DIA' : 'NOITE'} já foi atingido.`);
          }
        }
        const updateData: any = {};
        if (input.period === "day") {
          updateData.activeDay = input.active;
        } else {
          updateData.activeNight = input.active;
        }
        updateData.cycleActivationUpdatedAt = new Date();
        await db.update(campaigns).set(updateData).where(eq(campaigns.id, input.campaignId));
        const allCampaigns = await db.select().from(campaigns);
        const dayActive = allCampaigns.filter(c => c.activeDay).length;
        const nightActive = allCampaigns.filter(c => c.activeNight).length;
        return {
          success: true,
          message: `Campanha ${input.active ? 'ativada' : 'desativada'} no ciclo ${input.period === 'day' ? 'DIA ☀️' : 'NOITE 🌙'}`,
          campaigns: allCampaigns.map(c => ({
            id: c.id,
            name: c.name,
            activeDay: c.activeDay || false,
            activeNight: c.activeNight || false,
          })),
          dayCount: dayActive,
          nightCount: nightActive,
        };
      }),
  }),
  scheduler: router({
    start: protectedProcedure.input(z.object({ nightMode: z.boolean().optional() })).mutation(async ({ input }) => {
      campaignScheduler.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
      const db = await getDb();
      if (db) {
        const allCampaigns = await db.select().from(campaigns);
        const now = new Date();
        for (const camp of allCampaigns) {
          await db.update(campaigns).set({ status: "running", startDate: now }).where(eq(campaigns.id, camp.id));
        }
      }
      // Passa nightMode explícito se o usuário escolheu pelo toggle; senão auto-detecta pelo horário
      await campaignScheduler.start(input.nightMode);
      return { success: true, message: "Scheduler iniciado" };
    }),
    stop: protectedProcedure.mutation(async () => {
      campaignScheduler.stop();
      return { success: true, message: "Scheduler parado" };
    }),
    getState: publicProcedure.query(async () => {
      const state = campaignScheduler.getState();
      const stats = campaignScheduler.getStats();
      const db = await getDb();
      if (!db) return { state, stats, activeCampaigns: [], todayMessages: [] };
      const activeCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));
      const todayMessages = await db.select().from(messages).where(eq(messages.status, "sent"));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { state, stats, activeCampaigns, todayMessages: todayMessages.filter(m => m.sentAt && m.sentAt >= today) };
    }),
    getStats: publicProcedure.query(async () => campaignScheduler.getStats()),
    reset: protectedProcedure.mutation(async () => {
      campaignScheduler.stop();
      await new Promise(resolve => setTimeout(resolve, 2000));
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(campaignContacts);
      await db.delete(messages);
      await db.delete(contactCampaignHistory);
      await db.update(contacts).set({ blockedUntil: null });
      const allCampaigns = await db.select().from(campaigns);
      for (const camp of allCampaigns) {
        await db.update(campaigns).set({ sentCount: 0, failedCount: 0, messagesPerHour: 1, totalContacts: 2, status: "paused", startDate: null }).where(eq(campaigns.id, camp.id));
      }
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);
      const usedIds = new Set<number>();
      for (let i = 0; i < allCampaigns.length; i++) {
        const available = shuffled.filter(c => !usedIds.has(c.id));
        const selected = available.slice(0, 2);
        for (const contact of selected) {
          usedIds.add(contact.id);
          await db.insert(campaignContacts).values({ campaignId: allCampaigns[i].id, contactId: contact.id, messagesSent: 0, status: "pending" });
        }
        await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, allCampaigns[i].id));
      }
      return { success: true, message: "Campanhas resetadas! Clique em Iniciar." };
    }),
    toggleCampaign: protectedProcedure.input(z.object({ campaignId: z.number(), active: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(campaigns).set({ status: input.active ? "running" : "paused" }).where(eq(campaigns.id, input.campaignId));
      return { success: true, message: input.active ? "Campanha ativada!" : "Campanha pausada!" };
    }),
    updateMessagesPerHour: protectedProcedure.input(z.object({ campaignId: z.number(), messagesPerHour: z.number().min(1).max(2) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(campaigns).set({ messagesPerHour: input.messagesPerHour, totalContacts: 2 }).where(eq(campaigns.id, input.campaignId));
      await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId));
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      // Bloqueio é controlado por campaignContacts.status = 'blocked' (v9.0) — não mais pelo campo blockedUntil
      const selected = [...allContacts].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const contact of selected) {
        await db.insert(campaignContacts).values({ campaignId: input.campaignId, contactId: contact.id, messagesSent: 0, status: "pending" });
      }
      return { success: true, message: input.messagesPerHour + " msgs/hora", totalContacts: 2 };
    }),
    getCampaignDetails: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const allCampaigns = await db.select().from(campaigns);
      const result = [];
      for (const camp of allCampaigns) {
        const prop = await db.select().from(properties).where(eq(properties.id, camp.propertyId)).limit(1);
        const ccList = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
        let sentCount = 0, pendingCount = 0, failedCount = 0;
        const contactDetails = [];
        for (const cc of ccList) {
          const contactResult = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
          const contact = contactResult[0];
          if (!contact) continue;
          const lastMsg = await db.select().from(messages).where(and(eq(messages.contactId, contact.id), eq(messages.campaignId, camp.id))).limit(1);
          if (lastMsg[0]) sentCount++;
          else if (cc.status === "failed") failedCount++;
          else pendingCount++;
          contactDetails.push({ id: cc.id, contactId: contact.id, name: contact.name, phone: contact.phone, status: lastMsg[0] ? "sent" : cc.status, sentAt: lastMsg[0]?.sentAt || null, blockedUntil: contact.blockedUntil });
        }
        result.push({ id: camp.id, name: camp.name, propertyId: camp.propertyId, propertyName: prop[0]?.denomination || "Desconhecido", status: camp.status, messagesPerHour: camp.messagesPerHour || 1, activeDay: camp.activeDay || false, activeNight: camp.activeNight || false, sentCount, pendingCount, failedCount, totalContacts: ccList.length > 0 ? ccList.length : (camp.totalContacts || 0), contactDetails });
      }
      return result;
    }),
  }),
  companyConfig: router({
    get: publicProcedure.query(async () => getCompanyConfig()),
    update: protectedProcedure.input(z.object({
      companyName: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      zApiInstanceId: z.string().optional(),
      zApiToken: z.string().optional(),
      zApiClientToken: z.string().optional(),
      telegramBotToken: z.string().optional(),
      telegramChatId: z.string().optional(),
      openAiApiKey: z.string().optional(),
    })).mutation(async ({ input }) => {
      await updateCompanyConfig(input);
      // Sincronizar process.env imediatamente para uso em runtime sem reiniciar
      if (input.telegramBotToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = input.telegramBotToken;
      if (input.telegramChatId !== undefined)   process.env.TELEGRAM_CHAT_ID   = input.telegramChatId;
      if (input.openAiApiKey !== undefined)      process.env.OPENAI_API_KEY     = input.openAiApiKey;
      return { success: true };
    }),
    testZApiConnection: protectedProcedure.mutation(async () => {
      const config = await getCompanyConfig();
      if (!config || !config.zApiInstanceId || !config.zApiToken) return { success: false, message: "Z-API credentials not configured" };
      try {
        const headers: Record<string, string> = {};
        if (config.zApiClientToken) headers["Client-Token"] = config.zApiClientToken;
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstanceId}/token/${config.zApiToken}/status`, { headers });
        if (response.ok) {
          const data = await response.json();
          if (data.connected) {
            await updateCompanyConfig({ zApiConnected: true, zApiLastChecked: new Date() });
            return { success: true, message: "WhatsApp conectado com sucesso!" };
          }
          return { success: false, message: "WhatsApp nao esta conectado." };
        }
        return { success: false, message: "Falha na conexao com Z-API." };
      } catch (error) {
        console.error("[testZApiConnection] Erro:", error);
        return { success: false, message: String(error) };
      }
    }),
  }),
  performance: router({
    getStats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totals: { sent: 0, failed: 0, pending: 0, blocked: 0, successRate: 0, avgPerDay: 0, activeCampaigns: 0 }, byCampaign: [], byDay: [], byHour: [] };
      const allMessages = await db.select().from(messages);
      const allCampaigns = await db.select().from(campaigns);
      const totalSent = allMessages.filter(m => m.status === 'sent' || m.status === 'delivered').length;
      const totalFailed = allMessages.filter(m => m.status === 'failed').length;
      const totalBlocked = allMessages.filter(m => m.status === 'blocked').length;
      const totalPending = allMessages.filter(m => m.status === 'pending').length;
      const successRate = totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0;
      const activeCampaigns = allCampaigns.filter(c => c.status === 'running').length;
      const byCampaign = allCampaigns.map(camp => {
        const campMsgs = allMessages.filter(m => m.campaignId === camp.id);
        const sent = campMsgs.filter(m => m.status === 'sent' || m.status === 'delivered').length;
        const failed = campMsgs.filter(m => m.status === 'failed').length;
        return { id: camp.id, name: camp.name, status: camp.status, sent, failed, total: camp.totalContacts || 2, pending: (camp.totalContacts || 2) - sent - failed, successRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0 };
      });
      const now = new Date();
      const byDay: { date: string; sent: number; failed: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayStart = new Date(dateStr + 'T00:00:00Z');
        const dayEnd = new Date(dateStr + 'T23:59:59Z');
        byDay.push({ date: dateStr, sent: allMessages.filter(m => (m.status === 'sent' || m.status === 'delivered') && m.sentAt && m.sentAt >= dayStart && m.sentAt <= dayEnd).length, failed: allMessages.filter(m => m.status === 'failed' && m.sentAt && m.sentAt >= dayStart && m.sentAt <= dayEnd).length });
      }
      const last7 = byDay.slice(-7);
      const daysWithActivity = last7.filter(d => d.sent > 0).length;
      const avgPerDay = daysWithActivity > 0 ? Math.round(last7.reduce((sum, d) => sum + d.sent, 0) / daysWithActivity) : 0;
      const byHour: { hour: number; count: number }[] = [];
      for (let h = 0; h < 24; h++) {
        byHour.push({ hour: h, count: allMessages.filter(m => (m.status === 'sent' || m.status === 'delivered') && m.sentAt && m.sentAt.getHours() === h).length });
      }
      return { totals: { sent: totalSent, failed: totalFailed, pending: totalPending, blocked: totalBlocked, successRate, avgPerDay, activeCampaigns }, byCampaign, byDay, byHour };
    }),
  }),
  bot: router({
    processMessage: publicProcedure.input(z.object({ phone: z.string(), message: z.string().optional(), audioUrl: z.string().optional(), senderName: z.string().optional() })).mutation(async ({ input }) => {
      const { processBotMessage } = await import('./bot-ai');
      try {
        const response = await processBotMessage({ phone: input.phone, message: input.message, audioUrl: input.audioUrl, senderName: input.senderName });
        return { success: true, ...response };
      } catch (error) {
        console.error("[processMessage] Erro:", error);
        return { success: false, text: 'Desculpe, ocorreu um erro.' };
      }
    }),
    simulateFinancing: publicProcedure.input(z.object({ propertyValue: z.number().positive(), entryPercent: z.number().optional().default(20) })).query(async ({ input }) => {
      const { simulateFinancing } = await import('./bot-ai');
      return simulateFinancing(input.propertyValue, input.entryPercent);
    }),
    recommendProperties: publicProcedure.input(z.object({ budget: z.number().positive() })).query(async ({ input }) => {
      const { recommendProperties } = await import('./bot-ai');
      return recommendProperties(input.budget);
    }),
  }),
  zapi: router({
    sendMessage: protectedProcedure.input(z.object({ phone: z.string().min(2), message: z.string().min(1) })).mutation(async ({ input }) => {
      const config = await getCompanyConfig();
      if (!config?.zApiInstanceId || !config?.zApiToken) return { success: false, error: 'Z-API nao configurado' };
      const { sendMessageViaZAPI } = await import('./zapi-integration');
      return sendMessageViaZAPI({ instanceId: config.zApiInstanceId, token: config.zApiToken, clientToken: config.zApiClientToken || undefined, phone: input.phone, message: input.message });
    }),
  }),

  // Teste de notificação Telegram
  testTelegram: protectedProcedure.mutation(async () => {
    // Diagnóstico direto — lê process.env para dar erro preciso
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token) return { success: false, error: 'TELEGRAM_BOT_TOKEN não está definido no Railway.' };
    if (!chatId) return { success: false, error: 'TELEGRAM_CHAT_ID não está definido no Railway.' };

    try {
      const TelegramBot = await import('node-telegram-bot-api').then(m => m.default);
      const bot = new TelegramBot(token, { polling: false });
      await bot.sendMessage(chatId, '🔥 <b>LEAD QUENTE QUALIFICADO! (Teste)</b>\n👤 João Teste Silva\n📱 5599999999999\n💰 R$ 6.000 / entrada R$ 30.000\n🚀 Contate AGORA!', { parse_mode: 'HTML', disable_web_page_preview: true });
      return { success: true, message: 'Notificação enviada! Verifique o Telegram.' };
    } catch (e: any) {
      const detail = e?.response?.body ? JSON.stringify(e.response.body) : String(e?.message || e);
      return { success: false, error: `Telegram API erro: ${detail}` };
    }
  }),

  // ══════════════════════════════════════════════════════════════════════
  // LEADS — Gestão completa de leads qualificados pelo bot
  // ══════════════════════════════════════════════════════════════════════
  leads: router({

    // Lista todos os leads com filtros e paginação
    list: protectedProcedure
      .input(z.object({
        score: z.enum(['quente', 'morno', 'frio', 'all']).optional().default('all'),
        stage: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { leads: [], total: 0, stats: { quente: 0, morno: 0, frio: 0, total: 0, descartado: 0 } };

        let rows = await db.select().from(leadQualifications).orderBy(desc(leadQualifications.updatedAt));

        // Filtro por score
        if (input.score !== 'all') {
          rows = rows.filter((r: any) => r.score === input.score);
        }

        // Filtro por stage
        if (input.stage) {
          rows = rows.filter((r: any) => r.stage === input.stage);
        }

        // Filtro por busca (nome ou telefone)
        if (input.search && input.search.trim()) {
          const q = input.search.toLowerCase();
          rows = rows.filter((r: any) => {
            const nome = String(r.nome || (r.answers as any)?.nome || '').toLowerCase();
            const phone = String(r.phone || '').toLowerCase();
            return nome.includes(q) || phone.includes(q);
          });
        }

        // Stats gerais
        const allRows = await db.select().from(leadQualifications);
        const stats = {
          total: allRows.length,
          quente: allRows.filter((r: any) => r.score === 'quente').length,
          morno: allRows.filter((r: any) => r.score === 'morno').length,
          frio: allRows.filter((r: any) => r.score === 'frio').length,
          descartado: allRows.filter((r: any) => r.stage === 'descartado' || r.stage === 'sem_interesse').length,
          qualificado: allRows.filter((r: any) => r.stage === 'qualificado').length,
          emAndamento: allRows.filter((r: any) => String(r.stage || '').startsWith('qual_etapa')).length,
        };

        const total = rows.length;
        const paginated = rows.slice(input.offset, input.offset + input.limit);

        // Enriquecer com nome do contato do banco se disponível
        const enriched = await Promise.all(paginated.map(async (lead: any) => {
          let contactName = lead.nome || (lead.answers as any)?.nome || null;
          let campaignName = null;
          try {
            if (lead.contactId) {
              const ct = await db.select().from(contacts).where(eq(contacts.id, lead.contactId)).limit(1);
              if (ct[0]) contactName = ct[0].name || contactName;
            }
            if (lead.campaignId) {
              const cp = await db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).limit(1);
              if (cp[0]) campaignName = cp[0].name;
            }
          } catch {}
          return { ...lead, contactName, campaignName };
        }));

        return { leads: enriched, total, stats };
      }),

    // Detalhes completos de um lead
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(leadQualifications).where(eq(leadQualifications.id, input.id)).limit(1);
        return rows[0] || null;
      }),

    // Atualizar score manualmente
    updateScore: protectedProcedure
      .input(z.object({
        id: z.number(),
        score: z.enum(['quente', 'morno', 'frio']),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(leadQualifications).set({ score: input.score, updatedAt: new Date() }).where(eq(leadQualifications.id, input.id));
        return { success: true };
      }),

    // Descartar lead
    discard: protectedProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().optional().default('Descartado manualmente'),
        blockDays: z.number().optional().default(30),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        const blockedUntil = new Date(Date.now() + input.blockDays * 24 * 60 * 60 * 1000);
        await db.update(leadQualifications).set({
          stage: 'descartado',
          discardReason: input.reason,
          blockedUntil,
          updatedAt: new Date(),
        }).where(eq(leadQualifications.id, input.id));
        return { success: true };
      }),

    // Reativar lead bloqueado
    reactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(leadQualifications).set({
          stage: 'nao_iniciado',
          score: 'frio',
          blockedUntil: null,
          discardReason: null,
          updatedAt: new Date(),
        }).where(eq(leadQualifications.id, input.id));
        return { success: true };
      }),

    // Enviar mensagem manual via WhatsApp
    sendWhatsApp: protectedProcedure
      .input(z.object({ phone: z.string(), message: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const config = await getCompanyConfig();
        if (!config?.zApiInstanceId || !config?.zApiToken) return { success: false, error: 'Z-API nao configurado' };
        const { sendMessageViaZAPI } = await import('./zapi-integration');
        return sendMessageViaZAPI({ instanceId: config.zApiInstanceId, token: config.zApiToken, clientToken: config.zApiClientToken || undefined, phone: input.phone, message: input.message });
      }),
  }),
});
export type AppRouter = typeof appRouter;
export type { AppRouter };
