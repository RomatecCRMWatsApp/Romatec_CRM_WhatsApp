import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock de contexto autenticado
function createMockContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Routers", () => {
  describe("contacts", () => {
    it("should list all contacts", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.contacts.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should get contact by id", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.contacts.getById({ id: 1 });
      // Pode ser undefined se não existir
      expect(result === undefined || typeof result === "object").toBe(true);
    });

    it("should create a contact", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.contacts.create({
        name: "João Silva",
        phone: "(99) 99999-9999",
        email: "joao@example.com",
      });
      
      expect(result).toBeDefined();
    });
  });

  describe("properties", () => {
    it("should list all properties", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.properties.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should get property by id", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.properties.getById({ id: 1 });
      expect(result === undefined || typeof result === "object").toBe(true);
    });

    it("should create a property", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.properties.create({
        denomination: "Imóvel Teste",
        address: "Rua Teste, 123",
        price: "100000.00",
        description: "Descrição teste",
      });
      
      expect(result).toBeDefined();
    });
  });

  describe("campaigns", () => {
    it("should list all campaigns", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.campaigns.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should create a campaign", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.campaigns.create({
        propertyId: 1,
        name: "Campanha Teste",
        messageVariations: ["Olá! Conheça nosso imóvel!"],
      });
      
      expect(result).toBeDefined();
    });
  });

  describe("companyConfig", () => {
    it("should get company config", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.companyConfig.get();
      expect(result === undefined || typeof result === "object").toBe(true);
    });

    it("should update company config", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.companyConfig.update({
        companyName: "Romatec Atualizada",
        phone: "(99) 999169-0178",
      });
      
      expect(result).toBeDefined();
    });
  });

  describe("auth", () => {
    it("should get current user", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.auth.me();
      expect(result).toBeDefined();
      expect(result?.name).toBe("Test User");
    });

    it("should logout", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.auth.logout();
      expect(result.success).toBe(true);
    });
  });
});
