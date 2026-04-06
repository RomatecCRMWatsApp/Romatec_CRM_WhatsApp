import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { contacts, properties, campaigns, campaignContacts, messages, contactCampaignHistory } from "../drizzle/schema";
import { like, or, eq } from "drizzle-orm";

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

// Cleanup direto no banco: remove TUDO que tenha padrão de teste
afterAll(async () => {
  const db = await getDb();
  if (!db) return;

  // 1. Buscar e limpar campanhas de teste
  const testCamps = await db.select().from(campaigns).where(
    or(like(campaigns.name, "%Teste%"), like(campaigns.name, "%TESTE%"))
  );
  for (const camp of testCamps) {
    await db.delete(messages).where(eq(messages.campaignId, camp.id));
    await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, camp.id));
    await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
    await db.delete(campaigns).where(eq(campaigns.id, camp.id));
  }

  // 2. Buscar e limpar imóveis de teste
  const testProps = await db.select().from(properties).where(
    or(like(properties.denomination, "%Teste%"), like(properties.denomination, "%TESTE%"))
  );
  for (const prop of testProps) {
    const relCamps = await db.select().from(campaigns).where(eq(campaigns.propertyId, prop.id));
    for (const c of relCamps) {
      await db.delete(messages).where(eq(messages.campaignId, c.id));
      await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, c.id));
      await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, c.id));
      await db.delete(campaigns).where(eq(campaigns.id, c.id));
    }
    await db.delete(messages).where(eq(messages.propertyId, prop.id));
    await db.delete(properties).where(eq(properties.id, prop.id));
  }

  // 3. Buscar e limpar contatos de teste
  const testContacts = await db.select().from(contacts).where(
    or(like(contacts.name, "%Teste%"), like(contacts.name, "%TESTE%"))
  );
  for (const c of testContacts) {
    await db.delete(campaignContacts).where(eq(campaignContacts.contactId, c.id));
    await db.delete(messages).where(eq(messages.contactId, c.id));
    await db.delete(contacts).where(eq(contacts.id, c.id));
  }
});

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
      expect(result === undefined || typeof result === "object").toBe(true);
    });

    it("should create a contact (auto-cleaned)", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const uniquePhone = `(99) ${Math.floor(10000 + Math.random() * 89999)}-${Math.floor(1000 + Math.random() * 8999)}`;
      const result = await caller.contacts.create({
        name: "João Silva Teste",
        phone: uniquePhone,
        email: `joao_${Date.now()}@example.com`,
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

    it("should create a property (auto-cleaned)", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.properties.create({
        denomination: "TESTE_AUTO_" + Date.now(),
        address: "Rua Teste, 123",
        price: "100000.00",
        description: "Descrição teste - será excluído automaticamente",
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

    it("should create a campaign (auto-cleaned)", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.campaigns.create({
        propertyId: 1,
        name: "CAMPANHA_TESTE_AUTO_" + Date.now(),
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
