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
          totalContacts: input.totalContacts || 24,
          status: "draft",
        });
      }),

    /**
     * AUTO CONFIGURAR CAMPANHAS
     * Cria campanhas (1 por imóvel) com messagesPerHour×12 contatos cada
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
          totalContacts: 24, // padrão: 2 msgs/hora × 12 = 24
          sentCount: 0,
          failedCount: 0,
          status: "running",
          startDate: new Date(),
        });

        const campaignId = Number(result[0].insertId);
        createdCampaigns.push({ id: campaignId, name: prop.denomination });

        // 6. Designar contatos para esta campanha (mph × 12)
        const mph = 2; // padrão
        const contactsNeeded = mph * 12; // = 24
        const startIdx = i * contactsNeeded;
        const campaignContactsList = shuffled.slice(startIdx, startIdx + contactsNeeded);

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
        totalContacts: Math.min(allProperties.length * 24, shuffled.length),
        message: `${createdCampaigns.length} campanhas criadas com ${Math.min(allProperties.length * 24, shuffled.length)} contatos (2 msgs/hora × 12 = 24 por campanha)`,
      };
    }),

    /**
     * Deletar campanha e suas dependências
     */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(messages).where(eq(messages.campaignId, input.id));
        await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, input.id));
        await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.id));
        await db.delete(campaigns).where(eq(campaigns.id, input.id));
        return { success: true };
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
     * SEGURANÇA: Para qualquer instância anterior antes de iniciar
     */
    start: protectedProcedure.mutation(async () => {
      // SEGURANÇA: Parar qualquer instância anterior para evitar timers duplicados
      campaignScheduler.stop();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Garantir que campanhas estão como "running" e atualizar startDate
      const db = await getDb();
      if (db) {
        const allCampaigns = await db.select().from(campaigns);
        const now = new Date();
        for (const camp of allCampaigns) {
          // Ativar campanhas pausadas E atualizar startDate para AGORA
          await db.update(campaigns).set({ 
            status: "running",
            startDate: now,
          }).where(eq(campaigns.id, camp.id));
        }
      }

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
     * Resetar campanhas - LIMPA TUDO e começa do ZERO com 24 NOVOS contatos
     * 
     * Fluxo completo:
     * 1. PARAR scheduler (cancelar TODOS os timers)
     * 2. Aguardar 2s para garantir que nenhum envio está em andamento
     * 3. LIMPAR: campaignContacts, messages, contactCampaignHistory
     * 4. DESBLOQUEAR todos os contatos
     * 5. REGENERAR variações de mensagem (com novos textos profissionais)
     * 6. REDESIGNAR contatos (messagesPerHour × 12) para cada campanha
     * 7. Status = "paused" (usuário precisa clicar Iniciar)
     */
    reset: protectedProcedure.mutation(async () => {
      console.log("\n\n⚠️ ===== RESET COMPLETO INICIADO =====");

      // PASSO 1: PARAR scheduler completamente
      campaignScheduler.stop();
      console.log("✅ Scheduler parado");

      // PASSO 2: Aguardar para garantir que nenhum envio está em andamento
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("✅ Aguardou 2s - nenhum envio em andamento");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // PASSO 3: LIMPAR TUDO - eliminar o que foi feito
      await db.delete(campaignContacts);
      await db.delete(messages);
      await db.delete(contactCampaignHistory);
      console.log("✅ Contatos, mensagens e histórico DELETADOS");

      // PASSO 4: DESBLOQUEAR todos os contatos ANTES de redesignar
      await db.update(contacts).set({ blockedUntil: null });
      console.log("✅ Todos os contatos desbloqueados");

      // PASSO 5: Buscar campanhas e imóveis para REGENERAR variações
      const allCampaigns = await db.select().from(campaigns);
      const allProperties = await db.select().from(properties);

      for (const camp of allCampaigns) {
        // Buscar imóvel vinculado para regenerar variações
        const prop = allProperties.find(p => p.id === camp.propertyId);
        let newVariations: string[] = [];

        if (prop) {
          // Importar gerador de variações do scheduler (mantém consistência)
          const { campaignScheduler } = await import("./scheduler/campaignScheduler");
          // Usar método interno via acesso direto ao generateMessageVariations
          const priceFormatted = Number(prop.price).toLocaleString("pt-BR");
          const slug = prop.publicSlug || prop.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const siteUrl = `https://romatecwa-2uygcczr.manus.space/imovel/${slug}`;
          const denom = prop.denomination || '';
          const isChacara = denom.toLowerCase().includes('chacara') || denom.toLowerCase().includes('chácar') || denom.toLowerCase().includes('giuliano');

          if (isChacara) {
            newVariations = [
              `🌿 {{NOME}}, *${denom}* - Chácaras exclusivas em Açailândia!\n\n🏡 Cada chácara: *~1.000m²* por apenas *R$ ${priceFormatted}*\n⚠️ *Restam apenas 3 unidades!* São 6 no total e estão saindo rápido.\n\n📸 Veja fotos e localização: ${siteUrl}\n\nGaranta a sua antes que acabe!`,
              `{{NOME}}, já conhece o *${denom}*? 🌳\n\nSão chácaras de *~1.000m²* cada, perfeitas pra quem busca tranquilidade e espaço.\n\n💰 *R$ ${priceFormatted}* por unidade\n🚨 *Apenas 3 disponíveis* (de 6 no total)\n\n👉 Confira: ${siteUrl}\n\nNão perca essa oportunidade única!`,
              `🔥 {{NOME}}, *OPORTUNIDADE RARA*\n\n*${denom}* - Açailândia/MA\n🏡 Chácaras de ~1.000m²\n💰 *R$ ${priceFormatted}* cada\n\n⚠️ *Das 6 unidades, restam apenas 3!*\n✅ Ideal pra lazer, moradia ou investimento\n\n📲 Veja agora: ${siteUrl}\n\nResponde "SIM" que te passo todos os detalhes!`,
              `⏰ {{NOME}}, *ÚLTIMAS UNIDADES*!\n\n*${denom}*: chácaras de ~1.000m² em Açailândia.\n\n💰 *R$ ${priceFormatted}* por chácara\n🚨 Apenas *3 de 6* ainda disponíveis\n\nO condomínio está vendendo rápido.\n\n📸 Detalhes: ${siteUrl}\n\nMe chama agora!`,
              `🏡 {{NOME}}, imagine ter sua própria chácara...\n\n*${denom}* - ~1.000m² de puro sossego em Açailândia.\nValor: *R$ ${priceFormatted}*\n\n⚠️ *Restam só 3 unidades!*\n\n🔗 Conheça: ${siteUrl}\n\nVamos conversar sobre como garantir a sua?`,
              `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${denom}* - Chácaras em condomínio fechado\n📍 Açailândia/MA\n📐 ~1.000m² cada\n💰 *R$ ${priceFormatted}*\n\n🚨 *Apenas 3 restantes* de 6 unidades!\n\n📲 Detalhes: ${siteUrl}\n\nTem interesse? Me responde!`,
              `✨ {{NOME}}, procurando chácara com ótimo custo-benefício?\n\n*${denom}*: ~1.000m² por *R$ ${priceFormatted}*\n📍 Condomínio em Açailândia/MA\n\n⚠️ *Só restam 3 de 6 unidades*\n✅ Documentação regularizada\n\n👉 Veja: ${siteUrl}\n\nPosso te passar mais detalhes!`,
              `🤔 {{NOME}}, já pensou em investir em chácara?\n\n*${denom}* - Açailândia/MA\n~1.000m² por apenas *R$ ${priceFormatted}*\n\n📊 Das 6 unidades, *3 já foram vendidas*!\n\n📸 Veja tudo: ${siteUrl}\n\nMe conta se tem interesse!`,
              `📌 {{NOME}}, comparou preços de chácaras na região?\n\n*${denom}*: ~1.000m² por *R$ ${priceFormatted}*\nIsso está *abaixo da média* do mercado!\n\n🚨 *Restam apenas 3 unidades* de 6\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,
              `🚨 {{NOME}}, *ATENÇÃO*\n\n*${denom}* está gerando muito interesse!\n\n🏡 Chácaras de ~1.000m² - *R$ ${priceFormatted}* cada\n⚠️ *Apenas 3 de 6 unidades disponíveis*\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta a sua agora!`,
              `💎 {{NOME}}, oportunidade *ÚNICA* em Açailândia!\n\n*${denom}*\n📐 ~1.000m² por chácara\n💰 *R$ ${priceFormatted}*\n🏡 Condomínio com apenas 6 unidades\n\n🔴 *3 já vendidas!* Restam 3.\n\n👉 Veja: ${siteUrl}\n\nNão deixe pra depois!`,
              `🌿 {{NOME}}, sua chácara dos sonhos está aqui!\n\n*${denom}* - Condomínio exclusivo\n📍 Açailândia/MA\n📐 ~1.000m² cada unidade\n💰 *R$ ${priceFormatted}*\n\n⚠️ *Últimas 3 unidades!*\n\n📸 Fotos e mapa: ${siteUrl}\n\nMe chama que te explico tudo!`,
            ];
          } else {
            newVariations = [
              `🏠 {{NOME}}, *${denom}* - Restam poucas unidades!\n\nValor: *R$ ${priceFormatted}*\nLocal: ${prop.address}\n\n📸 Veja fotos, planta e localização:\n${siteUrl}\n\n⚡ Condições especiais para os primeiros interessados. Posso te passar mais detalhes?`,
              `{{NOME}}, você já conhece o *${denom}*? 🔑\n\nUm dos imóveis mais procurados da região de ${prop.address}.\n\n💰 A partir de *R$ ${priceFormatted}*\n\n👉 Confira tudo aqui: ${siteUrl}\n\nPosso reservar uma visita exclusiva pra você?`,
              `📊 {{NOME}}, o *${denom}* já recebeu mais de 50 consultas este mês!\n\nMotivo? Localização privilegiada em ${prop.address} + preço competitivo.\n\n🏷️ *R$ ${priceFormatted}*\n\n🔗 Veja todos os detalhes: ${siteUrl}\n\nNão perca essa oportunidade. Me chama!`,
              `💡 {{NOME}}, sabia que imóveis nessa região valorizaram mais de 30% nos últimos anos?\n\n*${denom}* - ${prop.address}\nValor atual: *R$ ${priceFormatted}*\n\n📲 Fotos e detalhes completos: ${siteUrl}\n\nQuero te mostrar por que esse é o melhor momento pra investir. Posso te ligar?`,
              `🔥 {{NOME}}, *OPORTUNIDADE REAL*\n\n*${denom}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\n✅ Financiamento facilitado\n✅ Documentação em dia\n✅ Pronto pra morar/construir\n\n👉 Veja agora: ${siteUrl}\n\nResponde "SIM" que te envio todas as condições!`,
              `⏰ {{NOME}}, última chance!\n\n*${denom}* em ${prop.address} está com condições especiais que vencem em breve.\n\n🏷️ *R$ ${priceFormatted}* (parcelas que cabem no bolso)\n\n📸 Veja fotos e planta: ${siteUrl}\n\nJá temos interessados. Garanta o seu antes que acabe!`,
              `🏡 {{NOME}}, imagine sua família no lugar perfeito...\n\n*${denom}* - ${prop.address}\nValor: *R$ ${priceFormatted}*\n\nLocalização estratégica, segurança e qualidade de vida.\n\n🔗 Conheça cada detalhe: ${siteUrl}\n\nVamos conversar sobre como realizar esse sonho?`,
              `🆕 {{NOME}}, *LANÇAMENTO EXCLUSIVO*\n\n*${denom}*\n📍 ${prop.address}\n💰 *R$ ${priceFormatted}*\n\nPoucos sabem dessa oportunidade. Estou compartilhando com um grupo seleto de clientes.\n\n📲 Detalhes completos: ${siteUrl}\n\nTem interesse? Me responde que te explico tudo!`,
              `✨ {{NOME}}, procurando imóvel com ótimo custo-benefício?\n\n*${denom}* em ${prop.address}\n\n🏷️ *R$ ${priceFormatted}*\n📋 Documentação 100% regularizada\n🏦 Aceita financiamento\n\n👉 Veja fotos e localização: ${siteUrl}\n\nPosso simular as parcelas pra você. É só me chamar!`,
              `🤔 {{NOME}}, você está buscando imóvel na região de ${prop.address}?\n\nTenho uma opção que pode ser exatamente o que procura:\n\n*${denom}* - *R$ ${priceFormatted}*\n\n📸 Veja tudo aqui: ${siteUrl}\n\nMe conta o que você precisa que te ajudo a encontrar o imóvel ideal!`,
              `📌 {{NOME}}, comparou preços na região?\n\n*${denom}* está abaixo da média do mercado:\n💰 *R$ ${priceFormatted}*\n📍 ${prop.address}\n\nE o melhor: condições facilitadas de pagamento.\n\n🔗 Confira: ${siteUrl}\n\nEssa é a hora certa. Vamos conversar?`,
              `🚨 {{NOME}}, *ATENÇÃO*\n\n*${denom}* - ${prop.address}\n\nEste imóvel está gerando muito interesse e pode sair do mercado a qualquer momento.\n\n🏷️ *R$ ${priceFormatted}*\n\n📲 Veja antes que acabe: ${siteUrl}\n\nGaranta sua visita. Me chama agora!`,
            ];
          }
        }

        await db.update(campaigns).set({
          sentCount: 0,
          failedCount: 0,
          messagesPerHour: 1, // RESTRITIVO: sempre 1 msg/hora
          totalContacts: 12, // 1 msg/hora × 12 horas = 12
          status: "paused", // PAUSADO - usuário precisa clicar Iniciar
          startDate: null, // LIMPAR horário antigo - será setado quando clicar Iniciar
          ...(newVariations.length > 0 ? { messageVariations: newVariations } : {}),
        }).where(eq(campaigns.id, camp.id));
      }
      console.log(`✅ ${allCampaigns.length} campanhas resetadas (status=paused, variações regeneradas)`);

      // PASSO 6: REDESIGNAR contatos (mph × 12) para cada campanha
      // Pegar TODOS os contatos ativos (já desbloqueados no passo 4)
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);

      // Cada campanha recebe messagesPerHour × 12 contatos DIFERENTES
      const usedContactIds = new Set<number>();
      for (let i = 0; i < allCampaigns.length; i++) {
        const mph = allCampaigns[i].messagesPerHour || 2;
        const contactsNeeded = mph * 12;

        // Atualizar totalContacts no banco
        await db.update(campaigns)
          .set({ totalContacts: contactsNeeded })
          .where(eq(campaigns.id, allCampaigns[i].id));

        // Pegar contatos ainda não usados
        const available = shuffled.filter(c => !usedContactIds.has(c.id));
        const selected = available.slice(0, contactsNeeded);

        // Se não tem o suficiente, pegar do início (fallback)
        if (selected.length < contactsNeeded) {
          const remaining = contactsNeeded - selected.length;
          const fallback = shuffled.filter(c => !selected.find(s => s.id === c.id)).slice(0, remaining);
          selected.push(...fallback);
        }

        for (const contact of selected) {
          usedContactIds.add(contact.id);
          await db.insert(campaignContacts).values({
            campaignId: allCampaigns[i].id,
            contactId: contact.id,
            messagesSent: 0,
            status: "pending",
          });
        }
        console.log(`📱 Campanha ${allCampaigns[i].name}: ${selected.length} NOVOS contatos designados`);
      }

      console.log("✅ ===== RESET COMPLETO FINALIZADO =====");
      console.log(`📊 ${allCampaigns.length} campanhas | ${usedContactIds.size} contatos únicos designados`);
      console.log("⚠️ Status: PAUSADO - Clique em Iniciar para começar");

      return { success: true, message: `Campanhas resetadas! ${allCampaigns.length} campanhas com novos contatos. Clique em Iniciar.` };
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
     * Atualizar msgs/hora de uma campanha (1-10)
     */
    updateMessagesPerHour: protectedProcedure
      .input(z.object({ campaignId: z.number(), messagesPerHour: z.number().min(1).max(10) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const newMph = input.messagesPerHour;
        const newTotalContacts = newMph * 12; // Múltiplos de 12 pelo ciclo de 12h

        // Atualizar msgs/hora e totalContacts
        await db.update(campaigns)
          .set({ messagesPerHour: newMph, totalContacts: newTotalContacts })
          .where(eq(campaigns.id, input.campaignId));

        // Redesignar contatos: limpar antigos e atribuir novos
        await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId));

        // Pegar contatos ativos e não bloqueados
        const now = new Date();
        const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
        const unblockedContacts = allContacts.filter(c => !c.blockedUntil || c.blockedUntil <= now);
        const shuffled = [...unblockedContacts].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, newTotalContacts);

        for (const contact of selected) {
          await db.insert(campaignContacts).values({
            campaignId: input.campaignId,
            contactId: contact.id,
            messagesSent: 0,
            status: "pending",
          });
        }

        console.log(`📊 Campanha ${input.campaignId}: ${newMph} msgs/hora × 12 = ${newTotalContacts} contatos (${selected.length} designados)`);

        return { 
          success: true, 
          message: `${newMph} msgs/hora × 12 = ${newTotalContacts} contatos redesignados`,
          totalContacts: newTotalContacts,
          assignedContacts: selected.length,
        };
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
          messagesPerHour: camp.messagesPerHour || 2,
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

  // Performance Router
  performance: router({
    /**
     * Estatísticas gerais de performance
     * Retorna: totais, por campanha, por dia (últimos 30 dias)
     */
    getStats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totals: { sent: 0, failed: 0, pending: 0, blocked: 0, successRate: 0, avgPerDay: 0, activeCampaigns: 0 }, byCampaign: [], byDay: [], byHour: [] };

      // Totais gerais de mensagens
      const allMessages = await db.select().from(messages);
      const totalSent = allMessages.filter(m => m.status === 'sent' || m.status === 'delivered').length;
      const totalFailed = allMessages.filter(m => m.status === 'failed').length;
      const totalBlocked = allMessages.filter(m => m.status === 'blocked').length;
      const totalPending = allMessages.filter(m => m.status === 'pending').length;
      const successRate = allMessages.length > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0;

      // Campanhas ativas
      const allCampaigns = await db.select().from(campaigns);
      const activeCampaigns = allCampaigns.filter(c => c.status === 'running').length;

      // Por campanha
      const byCampaign = allCampaigns.map(camp => {
        const campMsgs = allMessages.filter(m => m.campaignId === camp.id);
        const sent = campMsgs.filter(m => m.status === 'sent' || m.status === 'delivered').length;
        const failed = campMsgs.filter(m => m.status === 'failed').length;
        return {
          id: camp.id,
          name: camp.name,
          status: camp.status,
          sent,
          failed,
          total: camp.totalContacts || 24,
          pending: (camp.totalContacts || 24) - sent - failed,
          successRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0,
          messagesPerHour: camp.messagesPerHour || 2,
        };
      });

      // Por dia (últimos 30 dias)
      const now = new Date();
      const byDay: { date: string; sent: number; failed: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayStart = new Date(dateStr + 'T00:00:00Z');
        const dayEnd = new Date(dateStr + 'T23:59:59Z');
        const daySent = allMessages.filter(m => (m.status === 'sent' || m.status === 'delivered') && m.sentAt && m.sentAt >= dayStart && m.sentAt <= dayEnd).length;
        const dayFailed = allMessages.filter(m => m.status === 'failed' && m.sentAt && m.sentAt >= dayStart && m.sentAt <= dayEnd).length;
        byDay.push({ date: dateStr, sent: daySent, failed: dayFailed });
      }

      // Média por dia (últimos 7 dias com envios)
      const last7 = byDay.slice(-7);
      const daysWithActivity = last7.filter(d => d.sent > 0).length;
      const avgPerDay = daysWithActivity > 0 ? Math.round(last7.reduce((sum, d) => sum + d.sent, 0) / daysWithActivity) : 0;

      // Por hora do dia (distribuição)
      const byHour: { hour: number; count: number }[] = [];
      for (let h = 0; h < 24; h++) {
        const count = allMessages.filter(m => (m.status === 'sent' || m.status === 'delivered') && m.sentAt && m.sentAt.getHours() === h).length;
        byHour.push({ hour: h, count });
      }

      return {
        totals: {
          sent: totalSent,
          failed: totalFailed,
          pending: totalPending,
          blocked: totalBlocked,
          successRate,
          avgPerDay,
          activeCampaigns,
        },
        byCampaign,
        byDay,
        byHour,
      };
    }),
  }),

  // Bot AI Router
  bot: router({
    /**
     * Processar mensagem de cliente e retornar resposta do bot
     * Usado pelo webhook quando cliente manda mensagem
     */
    processMessage: publicProcedure
      .input(z.object({
        phone: z.string(),
        message: z.string().optional(),
        audioUrl: z.string().optional(),
        senderName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { processBotMessage } = await import('./bot-ai');
        try {
          const response = await processBotMessage({
            phone: input.phone,
            message: input.message,
            audioUrl: input.audioUrl,
            senderName: input.senderName,
          });
          return { success: true, ...response };
        } catch (error) {
          console.error('[Bot] Erro ao processar mensagem:', error);
          return {
            success: false,
            text: 'Desculpe, ocorreu um erro. Tente novamente.',
          };
        }
      }),

    /**
     * Simular financiamento com taxas reais
     */
    simulateFinancing: publicProcedure
      .input(z.object({
        propertyValue: z.number(),
        entryPercent: z.number().optional().default(20),
      }))
      .query(async ({ input }) => {
        const { simulateFinancing } = await import('./bot-ai');
        return simulateFinancing(input.propertyValue, input.entryPercent);
      }),

    /**
     * Recomendar imóveis por orçamento
     */
    recommendProperties: publicProcedure
      .input(z.object({ budget: z.number() }))
      .query(async ({ input }) => {
        const { recommendProperties } = await import('./bot-ai');
        return recommendProperties(input.budget);
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
