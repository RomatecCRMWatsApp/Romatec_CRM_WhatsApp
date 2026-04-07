import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("performance.getStats", () => {
  it("should return stats for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    const result = await caller.performance.getStats();

    // Verificar estrutura do resultado
    expect(result).toHaveProperty("totals");
    expect(result).toHaveProperty("byCampaign");
    expect(result).toHaveProperty("byDay");
    expect(result).toHaveProperty("byHour");

    // Verificar totais
    expect(result.totals).toHaveProperty("sent");
    expect(result.totals).toHaveProperty("failed");
    expect(result.totals).toHaveProperty("pending");
    expect(result.totals).toHaveProperty("blocked");
    expect(result.totals).toHaveProperty("successRate");
    expect(result.totals).toHaveProperty("avgPerDay");
    expect(result.totals).toHaveProperty("activeCampaigns");

    // Verificar tipos numéricos
    expect(typeof result.totals.sent).toBe("number");
    expect(typeof result.totals.failed).toBe("number");
    expect(typeof result.totals.successRate).toBe("number");
    expect(typeof result.totals.avgPerDay).toBe("number");

    // Verificar byDay tem 30 entradas
    expect(result.byDay).toHaveLength(30);
    result.byDay.forEach(day => {
      expect(day).toHaveProperty("date");
      expect(day).toHaveProperty("sent");
      expect(day).toHaveProperty("failed");
      expect(typeof day.sent).toBe("number");
      expect(typeof day.failed).toBe("number");
    });

    // Verificar byHour tem 24 entradas (0-23h)
    expect(result.byHour).toHaveLength(24);
    result.byHour.forEach((h, idx) => {
      expect(h.hour).toBe(idx);
      expect(typeof h.count).toBe("number");
    });

    // Verificar byCampaign é array
    expect(Array.isArray(result.byCampaign)).toBe(true);
    result.byCampaign.forEach(camp => {
      expect(camp).toHaveProperty("id");
      expect(camp).toHaveProperty("name");
      expect(camp).toHaveProperty("status");
      expect(camp).toHaveProperty("sent");
      expect(camp).toHaveProperty("failed");
      expect(camp).toHaveProperty("pending");
      expect(camp).toHaveProperty("successRate");
      expect(camp).toHaveProperty("messagesPerHour");
    });
  });

  it("should reject unauthenticated access", async () => {
    const caller = appRouter.createCaller(createPublicContext().ctx);
    await expect(caller.performance.getStats()).rejects.toThrow();
  });

  it("should have successRate between 0 and 100", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    const result = await caller.performance.getStats();

    expect(result.totals.successRate).toBeGreaterThanOrEqual(0);
    expect(result.totals.successRate).toBeLessThanOrEqual(100);

    result.byCampaign.forEach(camp => {
      expect(camp.successRate).toBeGreaterThanOrEqual(0);
      expect(camp.successRate).toBeLessThanOrEqual(100);
    });
  });
});
