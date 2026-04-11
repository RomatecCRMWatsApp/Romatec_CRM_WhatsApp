import { router, protectedProcedure } from "../_core/trpc";
import { campaignScheduler } from "./campaignScheduler";
import { getDb } from "../db";
import { campaigns, messages, contacts } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const schedulerRouter = router({
  /**
   * Inicia o scheduler
   */
  start: protectedProcedure.mutation(async () => {
    await campaignScheduler.start();
    return { success: true, message: "Scheduler iniciado" };
  }),

  /**
   * Para o scheduler
   */
  stop: protectedProcedure.mutation(async () => {
    campaignScheduler.stop();
    return { success: true, message: "Scheduler parado" };
  }),

  /**
   * Obtém estado atual do scheduler
   */
  getState: protectedProcedure.query(async () => {
    const state = campaignScheduler.getState();
    const stats = campaignScheduler.getStats();

    const db = await getDb();
    if (!db) {
      return { state, stats, campaigns: [], messages: [] };
    }

    // Obter campanhas ativas
    const activeCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

    // Obter mensagens de hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.status, "sent"));

    return {
      state,
      stats,
      campaigns: activeCampaigns,
      messages: todayMessages.filter((m) => m.sentAt && m.sentAt >= today),
    };
  }),

  /**
   * Obtém estatísticas do scheduler
   */
  getStats: protectedProcedure.query(async () => {
    return campaignScheduler.getStats();
  }),

  /**
   * Obtém próximas campanhas a serem enviadas
   */
  getUpcomingCampaigns: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const activeCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));

    return activeCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      propertyId: campaign.propertyId,
      totalContacts: campaign.totalContacts || 2,
      sentCount: campaign.sentCount || 0,
      failedCount: campaign.failedCount || 0,
    }));
  }),

  /**
   * Obtém contatos bloqueados
   */
  getBlockedContacts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const now = new Date();
    const blockedContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.status, "blocked"));

    return blockedContacts.filter((c) => c.blockedUntil && c.blockedUntil > now);
  }),

  /**
   * Obtém mensagens enviadas hoje
   */
  getTodayMessages: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMessages = await db.select().from(messages).where(eq(messages.status, "sent"));

    return todayMessages.filter((m) => m.sentAt && m.sentAt >= today);
  }),

  /**
   * Obtém contatos de uma campanha
   */
  getCampaignContacts: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const campaign = await db.select().from(campaigns).where(eq(campaigns.id, input.campaignId)).limit(1);

      if (campaign.length === 0) return [];

      // TODO: Retornar contatos da campanha com status
      return [];
    }),
});
