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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);

  app.post('/api/webhook/zapi', async (req, res) => {
    try {
      const { parseWebhookPayload } = await import('../zapi-integration');
      const { processBotMessage, registerBotMessage } = await import('../bot-ai');
      const { sendMessageViaZAPI } = await import('../zapi-integration');
      const payload = parseWebhookPayload(req.body);

      if (!payload) {
        return res.json({ received: true, processed: false });
      }

      const msgText = String(payload.message || '').trim();
      if (!msgText && !payload.audioUrl) {
        console.log(`[Webhook] Ignorado: mensagem vazia de ${payload.phone}`);
        return res.json({ received: true, processed: false, reason: 'empty' });
      }

      console.log(`[Webhook] ${payload.phone} - "${msgText.substring(0, 50)}"`);

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

      try {
        const botResponse = await processBotMessage({
          phone: payload.phone,
          message: msgText,
          audioUrl: payload.audioUrl,
          senderName,
        });

        if (botResponse.text) {
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

      if (fileType === 'application/pdf') {
        if (buffer.length > 10 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: 'PDF muito grande (máximo 10MB)' });
        }
        const base64 = buffer.toString('base64');
        const url = `data:application/pdf;base64,${base64}`;
        console.log(`[Upload] ✅ PDF base64 (${(buffer.length / 1024).toFixed(1)}KB)`);
        return res.json({ success: true, url });
      }

      let finalBuffer = buffer;
      const originalSizeKB = buffer.length / 1024;

      // Compressão automática de imagens acima de 8MB
      if ((fileType.startsWith('image/') && fileType !== 'image/webp') || fileType === 'image/webp') {
        if (buffer.length > 8 * 1024 * 1024) {
          try {
            const sharp = (await import('sharp')).default;
            let compressed = await sharp(buffer)
              .resize({ width: 2400, withoutEnlargement: true })
              .jpeg({ quality: 82 })
              .toBuffer();

            // Se ainda acima de 9.5MB, comprimir mais agressivamente
            if (compressed.length > 9.5 * 1024 * 1024) {
              compressed = await sharp(buffer)
                .resize({ width: 1920, withoutEnlargement: true })
                .jpeg({ quality: 65 })
                .toBuffer();
            }

            const compressedSizeKB = compressed.length / 1024;
            console.log(`[Upload] 📉 Imagem comprimida: ${originalSizeKB.toFixed(1)}KB → ${compressedSizeKB.toFixed(1)}KB`);
            finalBuffer = compressed;
          } catch (err) {
            console.warn('[Upload] ⚠️ Compressão falhou, tentando upload do original:', err);
          }
        }
      }

      if (finalBuffer.length > 10 * 1024 * 1024) {
        return res.status(413).json({ success: false, error: 'Arquivo muito grande para upload (máximo 10MB após compressão)' });
      }

      const finalSizeKB = finalBuffer.length / 1024;
      console.log(`[Upload] Enviando para Cloudinary: ${fileName} (${fileType}, ${finalSizeKB.toFixed(1)}KB)`);
      const { uploadToCloudinary } = await import('../cloudinary');
      const { url } = await uploadToCloudinary(finalBuffer, fileType, fileName);
      console.log(`[Upload] ✅ Cloudinary: ${url}`);
      res.json({ success: true, url });
    } catch (error) {
      console.error('[Upload] Erro:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  app.get("/api/pdf-proxy", async (req, res) => {
    const url = req.query.url as string;
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: "URL inválida" });
    }
    try {
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

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  try {
    const { addApiKeysToCompanyConfig } = await import('./migrations/addApiKeysToCompanyConfig');
    await addApiKeysToCompanyConfig();
  } catch (e) {
    console.error('❌ Erro na migration addApiKeysToCompanyConfig:', e);
  }

  try {
    const { enlargePlantaBaixaUrl } = await import('./migrations/enlargePlantaBaixaUrl');
    await enlargePlantaBaixaUrl();
  } catch (e) {
    console.error('❌ Erro na migration enlargePlantaBaixaUrl:', e);
  }

  try {
    const { addFinalidadeToProperties } = await import('./migrations/addFinalidadeToProperties');
    await addFinalidadeToProperties();
  } catch (e) {
    console.error('❌ Erro na migration addFinalidadeToProperties:', e);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);

    try {
      const { restoreModVaz02 } = await import('./migrations/restoreModVaz02');
      await restoreModVaz02();
    } catch (e) {
      console.error('❌ Erro no restore Mod_Vaz-02:', e);
    }

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

    // DAILY SCHEDULER: Resets diários (08h standby / 18h prep / 20h full restart)
    try {
      const { dailyScheduler } = await import('../scheduler/dailyScheduler');
      dailyScheduler.start();
    } catch (error) {
      console.error('❌ Erro ao iniciar dailyScheduler:', error);
    }
  });
}

startServer().catch(console.error);
