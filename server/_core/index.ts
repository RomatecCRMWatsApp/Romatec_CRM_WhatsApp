import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Webhook Z-API - recebe respostas do WhatsApp
  app.post('/api/webhook/zapi', async (req, res) => {
    try {
      const { parseWebhookPayload } = await import('../zapi-integration');
      const { getDb } = await import('../db');
      const payload = parseWebhookPayload(req.body);

      if (!payload) {
        return res.json({ received: true, processed: false });
      }

      console.log(`[Webhook] ${payload.phone} - "${payload.message.substring(0, 50)}"`);

      const db = await getDb();
      if (db) {
        const { contacts, messages: messagesTable } = await import('../../drizzle/schema');
        const allContacts = await db.select().from(contacts);
        const contact = allContacts.find((c: any) => {
          const cleanDb = c.phone.replace(/\D/g, '');
          return cleanDb === payload.phone || cleanDb.endsWith(payload.phone.slice(-8));
        });

        if (contact) {
          await db.insert(messagesTable).values({
            campaignId: null as any,
            contactId: contact.id,
            propertyId: null as any,
            messageText: payload.message,
            status: 'delivered',
            sentAt: new Date(),
          });
          console.log(`[Webhook] Resposta de ${contact.name} salva`);
        }
      }

      res.json({ received: true, processed: true });
    } catch (error) {
      console.error('[Webhook] Erro:', error);
      res.json({ received: true, processed: false, error: String(error) });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
