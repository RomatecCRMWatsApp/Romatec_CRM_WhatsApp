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
      const { processBotMessage, registerBotMessage } = await import('../bot-ai');
      const { sendMessageViaZAPI } = await import('../zapi-integration');
      const payload = parseWebhookPayload(req.body);

      if (!payload) {
        return res.json({ received: true, processed: false });
      }

      // Ignorar mensagens vazias
      const msgText = String(payload.message || '').trim();
      if (!msgText && !payload.audioUrl) {
        console.log(`[Webhook] Ignorado: mensagem vazia de ${payload.phone}`);
        return res.json({ received: true, processed: false, reason: 'empty' });
      }

      console.log(`[Webhook] ${payload.phone} - "${msgText.substring(0, 50)}"`);

      // Buscar nome do contato (opcional, não bloqueia o bot)
      let senderName = payload.senderName || 'Cliente';
      try {
        const { getDb } = await import('../db');
        const db = await getDb();
        if (db) {
          const { contacts } = await import('../../drizzle/schema');
          const allContacts = await db.select().from(contacts);
          const contact = allContacts.find((c: any) => {
            const cleanDb = c.phone.replace(/\D/g, '');
            return cleanDb === payload.phone || cleanDb.endsWith(payload.phone.slice(-8));
          });
          if (contact) {
            senderName = contact.name || senderName;
            console.log(`[Webhook] Contato encontrado: ${senderName}`);
            // Lead respondeu → resetar tentativas para permitir reengajamento futuro
            try {
              const { campaignContacts } = await import('../../drizzle/schema');
              const { eq } = await import('drizzle-orm');
              await db.update(campaignContacts)
                .set({ messagesSent: 0, status: "pending" })
                .where(eq(campaignContacts.contactId, contact.id));
              console.log(`[Webhook] ✅ Tentativas resetadas para ${senderName} (respondeu)`);
            } catch (resetErr) {
              console.warn('[Webhook] Erro ao resetar tentativas (não crítico):', resetErr);
            }
          } else {
            console.log(`[Webhook] Contato não encontrado no banco, usando pushName: ${senderName}`);
          }
        }
      } catch (dbErr) {
        console.warn('[Webhook] Erro ao buscar contato (não crítico):', dbErr);
      }

      // Processar com bot IA e responder automaticamente
      try {
        const botResponse = await processBotMessage({
          phone: payload.phone,
          message: msgText,
          audioUrl: payload.audioUrl,
          senderName,
        });

        if (botResponse.text) {
          // Buscar credenciais Z-API do env (mais confiável que banco)
          const instanceId = process.env.ZAPI_INSTANCE_ID;
          const token = process.env.ZAPI_TOKEN;
          const clientToken = process.env.ZAPI_CLIENT_TOKEN;

          if (instanceId && token) {
            const sendResult = await sendMessageViaZAPI({
              instanceId,
              token,
              clientToken: clientToken || undefined,
              phone: payload.phone,
              message: botResponse.text,
            });

            if (sendResult.success) {
              // Registrar para follow-up automático
              registerBotMessage(payload.phone, senderName);
              console.log(`[Bot] ✅ Resposta enviada para ${senderName} (${payload.phone})`);
            } else {
              console.error(`[Bot] ❌ Falha ao enviar para ${senderName}: ${sendResult.error}`);
            }
          } else {
            console.error('[Bot] Credenciais Z-API não encontradas no env');
          }
        }
      } catch (botError) {
        console.error('[Bot] Erro ao processar:', botError);
      }

      res.json({ received: true, processed: true });
    } catch (error) {
      console.error('[Webhook] Erro:', error);
      res.json({ received: true, processed: false, error: String(error) });
    }
  });

  // Upload de arquivos — imagens/vídeos/PDFs via Cloudinary
  app.post('/api/upload', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
    try {
      const fileName = (req.headers['x-file-name'] as string) || 'upload';
      const fileType = (req.headers['x-file-type'] as string) || 'application/octet-stream';

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf'];
      const isAllowed = allowedTypes.some(t => fileType === t) || fileType.startsWith('image/') || fileType.startsWith('video/');
      if (!isAllowed) {
        return res.status(400).json({ success: false, error: 'Tipo de arquivo não permitido. Use: JPG, PNG, WEBP, MP4, PDF' });
      }

      const buffer = req.body as Buffer;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Arquivo vazio' });
      }
      if (buffer.length > 100 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Arquivo excede 100MB' });
      }

      // PDFs: converter para base64 data URL — sem Cloudinary, sem 401, funciona sempre
      if (fileType === 'application/pdf') {
        const base64 = buffer.toString('base64');
        const url = `data:application/pdf;base64,${base64}`;
        console.log(`[Upload] ✅ PDF base64 (${(buffer.length / 1024).toFixed(1)}KB)`);
        return res.json({ success: true, url });
      }

      console.log(`[Upload] Enviando para Cloudinary: ${fileName} (${fileType}, ${(buffer.length / 1024).toFixed(1)}KB)`);
      const { uploadToCloudinary } = await import('../cloudinary');
      const { url } = await uploadToCloudinary(buffer, fileType, fileName);
      console.log(`[Upload] ✅ Cloudinary: ${url}`);
      res.json({ success: true, url });
    } catch (error) {
      console.error('[Upload] Erro:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // PDF Proxy — busca PDF via Cloudinary com autenticação quando necessário
  app.get("/api/pdf-proxy", async (req, res) => {
    const url = req.query.url as string;
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: "URL inválida" });
    }
    try {
      // Para URLs Cloudinary: usar autenticação Basic com api_key:api_secret
      const isCloudinary = url.includes('res.cloudinary.com');
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; RomatecCRM/1.0)',
        'Accept': 'application/pdf,*/*',
      };
      if (isCloudinary) {
        const CLOUD_API_KEY = process.env.CLOUDINARY_API_KEY || '454146681184898';
        const CLOUD_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'soDNjdzXi2Hhd9NLvLuZmxrBi4g';
        const credentials = Buffer.from(`${CLOUD_API_KEY}:${CLOUD_API_SECRET}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
      const response = await fetch(url, { headers, redirect: 'follow' });
      console.log(`[PDF Proxy] ${response.status} — ${url.substring(0, 80)}`);
      if (!response.ok) {
        return res.status(502).json({ error: `Falha ao buscar PDF (${response.status})` });
      }
      const contentType = response.headers.get("content-type") || "application/pdf";
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(Buffer.from(buffer));
    } catch (e) {
      res.status(500).json({ error: String(e) });
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

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);

    // MIGRATION: Garantir colunas de API keys no companyConfig
    try {
      const { addApiKeysToCompanyConfig } = await import('./migrations/addApiKeysToCompanyConfig');
      await addApiKeysToCompanyConfig();
    } catch (e) {
      console.error('❌ Erro na migration addApiKeysToCompanyConfig:', e);
    }

    // RESTORE: Mod_Vaz-02 deletado acidentalmente
    try {
      const { restoreModVaz02 } = await import('./migrations/restoreModVaz02');
      await restoreModVaz02();
    } catch (e) {
      console.error('❌ Erro no restore Mod_Vaz-02:', e);
    }

    // STARTUP: Carregar credenciais salvas no DB para process.env (fallback do .env)
    try {
      const { getCompanyConfig } = await import('../db');
      const cfg = await getCompanyConfig();
      if (cfg) {
        if (!process.env.TELEGRAM_BOT_TOKEN && cfg.telegramBotToken) {
          process.env.TELEGRAM_BOT_TOKEN = cfg.telegramBotToken;
          console.log('🔑 TELEGRAM_BOT_TOKEN carregado do banco');
        }
        if (!process.env.TELEGRAM_CHAT_ID && cfg.telegramChatId) {
          process.env.TELEGRAM_CHAT_ID = cfg.telegramChatId;
          console.log('🔑 TELEGRAM_CHAT_ID carregado do banco');
        }
        if (!process.env.OPENAI_API_KEY && cfg.openAiApiKey) {
          process.env.OPENAI_API_KEY = cfg.openAiApiKey;
          console.log('🔑 OPENAI_API_KEY carregado do banco');
        }
      }
    } catch (e) {
      console.error('❌ Erro ao carregar credenciais do banco:', e);
    }

    // AUTO-RESTART: Verificar se o scheduler estava rodando antes do deploy
    try {
      const { campaignScheduler } = await import('../scheduler/campaignScheduler');
      console.log('\n🔍 Verificando estado do scheduler no banco...');
      await campaignScheduler.restoreAndResume();
    } catch (error) {
      console.error('❌ Erro no auto-restart do scheduler:', error);
    }
  });
}

startServer().catch(console.error);
