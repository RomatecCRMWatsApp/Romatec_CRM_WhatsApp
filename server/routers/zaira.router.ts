import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { chatWithZaira, clearConversation } from "../zaira-agent";
import { getAllKnowledge, searchKnowledge } from "../zaira-knowledge";
import {
  getOperationHistory,
  isAgentRunning,
  startAutonomousLoop,
  stopAutonomousLoop,
} from "../zaira-autonomous";
import { getSystemStats } from "../zaira-db-access";
import { getRepoStatus } from "../zaira-github";
import { getEnvironmentInfo, getRailwayStatus } from "../zaira-railway";

export const zairaRouter = router({
  chat: protectedProcedure
    .input(z.object({ message: z.string().min(1).max(4000), sessionId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const sessionId = input.sessionId ?? ctx.user?.openId ?? "default";
      const result = await chatWithZaira(input.message, sessionId);
      return result;
    }),

  clearHistory: protectedProcedure
    .input(z.object({ sessionId: z.string().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const sessionId = input?.sessionId ?? ctx.user?.openId ?? "default";
      clearConversation(sessionId);
      return { success: true };
    }),

  startAgent: adminProcedure.mutation(async () => {
    startAutonomousLoop();
    return { success: true, running: isAgentRunning() };
  }),

  stopAgent: adminProcedure.mutation(async () => {
    stopAutonomousLoop();
    return { success: true, running: isAgentRunning() };
  }),

  getSystemStatus: protectedProcedure.query(async () => {
    const [stats, railway, repo] = await Promise.all([
      getSystemStats().catch(() => null),
      getRailwayStatus().catch(() => null),
      getRepoStatus().catch(() => ({ ok: false, error: "GitHub indisponivel" })),
    ]);
    return {
      agentRunning: isAgentRunning(),
      database: stats,
      railway,
      github: repo.ok ? repo.data : { error: repo.error },
      environment: getEnvironmentInfo(),
    };
  }),

  getOperationHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).optional() }).optional())
    .query(async ({ input }) => {
      return getOperationHistory(input?.limit ?? 100);
    }),

  getKnowledgeBase: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return input?.search ? searchKnowledge(input.search) : getAllKnowledge();
    }),
});
