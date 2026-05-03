import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";

const ZAIRA_OFFLINE_MESSAGE =
  "ZAIRA temporariamente indisponivel. Configure ANTHROPIC_API_KEY no Railway e implemente o backend deste router.";

export const zairaRouter = router({
  chat: protectedProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async () => ({
      response: ZAIRA_OFFLINE_MESSAGE,
      toolsUsed: [] as string[],
    })),

  clearHistory: protectedProcedure.mutation(async () => ({ success: true })),

  startAgent: adminProcedure.mutation(async () => ({ success: false, message: ZAIRA_OFFLINE_MESSAGE })),

  stopAgent: adminProcedure.mutation(async () => ({ success: true })),

  getSystemStatus: protectedProcedure.query(async () => ({
    agentRunning: false,
    database: null,
    railway: null,
    github: null,
  })),

  getOperationHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async () => [] as Array<{
      id: string;
      timestamp: string;
      action: string;
      details: string;
    }>),

  getKnowledgeBase: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async () => [] as Array<{ id: string; title: string; content: string }>),
});
