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
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        status: z.enum(["active", "inactive", "blocked"]).optional(),
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
        // Remover contato de campanhas primeiro
        await db.delete(campaignContacts).where(eq(campaignContacts.contactId, input.id));
        await db.delete(contacts).where(eq(contacts.id, input.id));
        return { success: true };
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
    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const result = await db.select().from(properties).where(eq(properties.publicSlug, input.slug)).limit(1);
        return result[0] || null;
      }),
    create: protectedProcedure
      .input(z.object({
        denomination: z.string(),
        address: z.string(),
        city: z.string().optional(),
        state: z.string().optional(),
        cep: z.string().optional(),
        price: z.string(),
        offerPrice: z.string().optional(),
        description: z.string().optional(),
        images: z.array(z.string()).optional(),
        videoUrl: z.string().optional(),
        plantaBaixaUrl: z.string().optional(),
        areaConstruida: z.string().optional(),
        areaCasa: z.string().optional(),
        areaTerreno: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        garageSpaces: z.number().optional(),
        propertyType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const slug = input.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const result = await db.insert(properties).values({
          denomination: input.denomination,
          address: input.address,
          city: input.city,
          state: input.state,
          cep: input.cep,
          price: input.price as any,
          offerPrice: input.offerPrice as any || null,
          description: input.description,
          images: input.images || [],
          videoUrl: input.videoUrl,
          plantaBaixaUrl: input.plantaBaixaUrl,
          areaConstruida: input.areaConstruida as any || null,
          areaCasa: input.areaCasa as any || null,
          areaTerreno: input.areaTerreno as any || null,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          garageSpaces: input.garageSpaces,
          propertyType: input.propertyType,
          publicSlug: slug,
          status: "available",
        });
        return { id: Number(result[0].insertId), slug };
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
        description: z.string().optional(),
        images: z.array(z.string()).optional(),
        videoUrl: z.string().optional(),
        plantaBaixaUrl: z.string().optional(),
        areaConstruida: z.string().optional(),
        areaCasa: z.string().optional(),
        areaTerreno: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        garageSpaces: z.number().optional(),
        propertyType: z.string().optional(),
        status: z.enum(["available", "sold", "inactive"]).optional(),
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
        // Remover todas as dependências em cascata
        const relatedCampaigns = await db.select().from(campaigns).where(eq(campaigns.propertyId, input.id));
        for (const camp of relatedCampaigns) {
          // Remover messages da campanha
          await db.delete(messages).where(eq(messages.campaignId, camp.id));
          // Remover contactCampaignHistory
          await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, camp.id));
          // Remover campaignContacts
          await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
        }
        // Remover messages diretas do imóvel
        await db.delete(messages).where(eq(messages.propertyId, input.id));
        // Remover campanhas
        await db.delete(campaigns).where(eq(campaigns.propertyId, input.id));
        // Remover o imóvel
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
        areaConstruida: z.string().optional(),
        areaCasa: z.string().optional(),
        areaTerreno: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        garageSpaces: z.number().optional(),
        propertyType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const prompt = `Você é um corretor de imóveis especialista em marketing imobiliário. Gere uma descrição ATRATIVA e PROFISSIONAL para o seguinte imóvel:

- Nome: ${input.denomination}
- Endereço: ${input.address}${input.city ? `, ${input.city}` : ''}
- Tipo: ${input.propertyType || 'Imóvel'}
- Preço: R$ ${Number(input.price).toLocaleString('pt-BR')}${input.offerPrice ? ` (Oferta: R$ ${Number(input.offerPrice).toLocaleString('pt-BR')})` : ''}
- Área Construída: ${input.areaConstruida || 'N/I'} m²
- Área da Casa: ${input.areaCasa || 'N/I'} m²
- Área do Terreno: ${input.areaTerreno || 'N/I'} m²
- Quartos: ${input.bedrooms || 'N/I'}
- Banheiros: ${input.bathrooms || 'N/I'}
- Vagas: ${input.garageSpaces || 'N/I'}

REGRAS:
1. Use gatilhos de ESCASSEZ ("oportunidade única", "últimas unidades", "não vai durar")
2. Use gatilhos de OFERTA ("condições especiais", "valor abaixo do mercado")
3. Destaque os pontos fortes do imóvel
4. Máximo 3 parágrafos
5. Tom profissional mas persuasivo
6. NÃO use emojis excessivos (máximo 2-3)
7. Escreva em português brasileiro`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em marketing imobiliário brasileiro. Gere descrições atrativas com gatilhos de venda." },
            { role: "user", content: prompt },
          ],
        });

        const descContent = response.choices[0]?.message?.content;
        const descText = typeof descContent === 'string' ? descContent : 'Descrição não gerada';
        return { description: descText };
      }),
    generateWhatsAppMessage: protectedProcedure
      .input(z.object({ propertyId: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const prop = await db.select().from(properties).where(eq(properties.id, input.propertyId)).limit(1);
        if (!prop[0]) throw new Error("Imóvel não encontrado");
        const p = prop[0];

        const { invokeLLM } = await import("./_core/llm");
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Você gera mensagens curtas para WhatsApp de imóveis. Máximo 3 linhas. Sem emojis excessivos (máx 2). Inclua o link no final. Tom profissional e persuasivo." },
            { role: "user", content: `Gere 4 variações de mensagem curta para WhatsApp sobre o imóvel:
- ${p.denomination} em ${p.address}
- Preço: R$ ${Number(p.price).toLocaleString('pt-BR')}
- ${p.bedrooms || '?'} quartos, ${p.areaConstruida || '?'}m²
- Link: {{LINK}}

Retorne as 4 variações separadas por |||` },
          ],
        });

        const rawContent = response.choices[0]?.message?.content || "";
        const text = typeof rawContent === 'string' ? rawContent : '';
        const variations = text.split('|||').map((v: string) => v.trim()).filter(Boolean);
        return { variations: variations.length > 0 ? variations : [text] };
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

    /**
     * Resetar campanhas - limpa tudo e recria com novos contatos
     */
    reset: protectedProcedure.mutation(async () => {
      // Parar scheduler se estiver rodando
      campaignScheduler.stop();

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Limpar contatos de campanhas e mensagens
      await db.delete(campaignContacts);
      await db.delete(messages);
      await db.delete(contactCampaignHistory);

      // Resetar contadores das campanhas
      const allCampaigns = await db.select().from(campaigns);
      for (const camp of allCampaigns) {
        await db.update(campaigns).set({
          sentCount: 0,
          failedCount: 0,
          status: "running",
        }).where(eq(campaigns.id, camp.id));
      }

      // Redesignar 12 contatos aleatórios para cada campanha
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);

      for (let i = 0; i < allCampaigns.length; i++) {
        const startIdx = i * 12;
        const campaignContactsList = shuffled.slice(startIdx, startIdx + 12);
        for (const contact of campaignContactsList) {
          await db.insert(campaignContacts).values({
            campaignId: allCampaigns[i].id,
            contactId: contact.id,
            messagesSent: 0,
            status: "pending",
          });
        }
      }

      // Desbloquear todos os contatos
      await db.update(contacts).set({ blockedUntil: null });

      return { success: true, message: `Campanhas resetadas com novos contatos` };
    }),

    /**
     * Toggle campanha ativa/pausada no loop
     */
    toggleCampaign: protectedProcedure
      .input(z.object({ campaignId: z.number(), active: z.boolean() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.update(campaigns)
          .set({ status: input.active ? "running" : "paused" })
          .where(eq(campaigns.id, input.campaignId));

        return { success: true, message: `Campanha ${input.active ? "ativada" : "pausada"}` };
      }),

    /**
     * Detalhes completos de cada campanha com contatos e status
     */
    getCampaignDetails: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];

      const allCampaigns = await db.select().from(campaigns);
      const result = [];

      for (const camp of allCampaigns) {
        // Buscar imóvel vinculado
        const prop = await db.select().from(properties).where(eq(properties.id, camp.propertyId)).limit(1);

        // Buscar contatos desta campanha
        const ccList = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));

        const contactDetails = [];
        let sentCount = 0;
        let pendingCount = 0;
        let failedCount = 0;

        for (const cc of ccList) {
          const contactResult = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
          const contact = contactResult[0];
          if (!contact) continue;

          // Buscar última mensagem enviada
          const lastMsg = await db.select().from(messages)
            .where(and(
              eq(messages.contactId, contact.id),
              eq(messages.campaignId, camp.id)
            ))
            .limit(1);

          if (cc.status === "sent") sentCount++;
          else if (cc.status === "failed") failedCount++;
          else pendingCount++;

          contactDetails.push({
            id: cc.id,
            contactId: contact.id,
            name: contact.name,
            phone: contact.phone,
            status: cc.status,
            sentAt: lastMsg[0]?.sentAt || null,
            blockedUntil: contact.blockedUntil,
          });
        }

        result.push({
          id: camp.id,
          name: camp.name,
          propertyId: camp.propertyId,
          propertyName: prop[0]?.denomination || "Desconhecido",
          status: camp.status,
          totalContacts: ccList.length,
          sentCount,
          pendingCount,
          failedCount,
          startDate: camp.startDate,
          contacts: contactDetails,
        });
      }

      return result;
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
        zApiClientToken: z.string().optional(),
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
        const headers: Record<string, string> = {};
        if (config.zApiClientToken) {
          headers["Client-Token"] = config.zApiClientToken;
        }
        const response = await fetch(
          `https://api.z-api.io/instances/${config.zApiInstanceId}/token/${config.zApiToken}/status`,
          { headers }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.connected) {
            await updateCompanyConfig({ zApiConnected: true, zApiLastChecked: new Date() });
            return { success: true, message: "WhatsApp conectado com sucesso!" };
          }
          return { success: false, message: "WhatsApp n\u00e3o est\u00e1 conectado. Verifique o QR Code na Z-API." };
        } else {
          return { success: false, message: "Falha na conex\u00e3o com Z-API. Verifique as credenciais." };
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
          clientToken: config.zApiClientToken || undefined,
          phone: input.phone,
          message: input.message,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
