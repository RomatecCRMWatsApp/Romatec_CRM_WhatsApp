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
  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 BUILD_ID: 2974da2-fresh-rebuild-20260412-1957');
  console.log('📦 v1.1.1 | Scheduler v9.0 | 10h cycle | Auto-fix 12→13');
  console.log('═══════════════════════════════════════════════════\n');

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ─── Webhook Z-API ─── recebe respostas do WhatsApp
  // Handler compartilhado (alias /webhook/zapi e /api/webhook/zapi)
  async function handleZapiWebhook(req: any, res: any) {
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
          const instanceId = process.env.ZAPI_INSTANCE_ID;
          const token = process.env.ZAPI_TOKEN;
          const clientToken = process.env.ZAPI_CLIENT_TOKEN;

          if (instanceId && token) {
            const { sendButtonsViaZAPI } = await import('../zapi-integration');
            let sendResult;

            // Usar botoes interativos se o bot retornar opcoes
            if (botResponse.buttons && botResponse.buttons.length > 0) {
              sendResult = await sendButtonsViaZAPI({
                instanceId,
                token,
                clientToken: clientToken || undefined,
                phone: payload.phone,
                message: botResponse.text,
                buttons: botResponse.buttons,
                footer: 'Romatec Imoveis',
              });
            } else {
              sendResult = await sendMessageViaZAPI({
                instanceId,
                token,
                clientToken: clientToken || undefined,
                phone: payload.phone,
                message: botResponse.text,
              });
            }

            if (sendResult.success) {
              registerBotMessage(payload.phone, senderName);
              console.log(`[Bot] Resposta enviada para ${senderName} (${payload.phone}) — ${sendResult.attempts} tentativa(s)`);
            } else {
              console.error(`[Bot] Falha ao enviar para ${senderName}: ${sendResult.error}`);
            }
          } else {
            console.error('[Bot] Credenciais Z-API nao encontradas no env');
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
  }

  // Registrar webhook nos dois paths (Railway pode redirecionar qualquer um)
  app.post('/webhook/zapi', handleZapiWebhook);
  app.post('/api/webhook/zapi', handleZapiWebhook);

  // ─── GET /api/zapi/status ─── verifica conexao Z-API
  app.get('/api/zapi/status', async (_req, res) => {
    try {
      const instanceId = process.env.ZAPI_INSTANCE_ID;
      const token = process.env.ZAPI_TOKEN;
      const clientToken = process.env.ZAPI_CLIENT_TOKEN;

      if (!instanceId || !token) {
        return res.json({ connected: false, error: 'Credenciais Z-API nao configuradas' });
      }

      const { getZAPIStatus } = await import('../zapi-integration');
      const status = await getZAPIStatus(instanceId, token, clientToken || undefined);
      res.json({
        connected: status.connected,
        phone: status.phone,
        webhookUrl: 'https://romateccrmwhatsapp-production.up.railway.app/webhook/zapi',
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.json({ connected: false, error: String(err) });
    }
  });

  // Upload de arquivos (fotos, vídeos, plantas) - usa Cloudinary
  app.post('/api/upload', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
    try {
      const fileName = (req.headers['x-file-name'] as string) || 'upload';
      const fileType = (req.headers['x-file-type'] as string) || 'application/octet-stream';
      
      // Validar tipo de arquivo
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg', 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf'];
      const isAllowed = allowedTypes.some(t => fileType === t) || 
                        fileType.startsWith('image/') || 
                        fileType.startsWith('video/');
      if (!isAllowed) {
        return res.status(400).json({ success: false, error: 'Tipo de arquivo não permitido. Use: JPG, PNG, WEBP, MP4, PDF' });
      }
      
      // Validar tamanho (100MB)
      const buffer = req.body as Buffer;
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Arquivo vazio' });
      }
      if (buffer.length > 100 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: 'Arquivo excede 100MB' });
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

    // MIGRATION: Atualizar nomes das campanhas principais
    try {
      const { updateCampaignNames } = await import('./migrations/updateCampaignNames');
      await updateCampaignNames();
    } catch (error) {
      console.error('❌ Erro na migration de nomes de campanhas:', error);
    }

    // PROTECAO: garantir exatamente 2 contatos por campanha no banco
    try {
      const { getDb } = await import('../db');
      const { campaigns: campaignsTable, campaignContacts: ccTable, contacts: contactsTable } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (db) {
        const allCamps = await db.select().from(campaignsTable);
        for (const camp of allCamps) {
          // Forcar totalContacts=2
          if ((camp.totalContacts || 0) !== 2) {
            await db.update(campaignsTable).set({ totalContacts: 2, messagesPerHour: 1 }).where(eq(campaignsTable.id, camp.id));
          }
          // Remover contatos excedentes (manter max 2)
          const ccList = await db.select().from(ccTable).where(eq(ccTable.campaignId, camp.id));
          if (ccList.length > 2) {
            const toRemove = ccList.slice(2);
            for (const cc of toRemove) {
              await db.delete(ccTable).where(eq(ccTable.id, cc.id));
            }
            console.log(`[PROTECAO] Campanha ${camp.id}: removidos ${toRemove.length} contatos excedentes`);
          }
          // Adicionar contatos se menos de 2
          if (ccList.length < 2) {
            const usedIds = new Set(ccList.map(cc => cc.contactId));
            const allCcs = await db.select().from(ccTable);
            const globalUsed = new Set(allCcs.map(cc => cc.contactId));
            const activeContacts = await db.select().from(contactsTable).where(eq(contactsTable.status, 'active'));
            const available = activeContacts.filter(c => !globalUsed.has(c.id) && !usedIds.has(c.id));
            const needed = 2 - ccList.length;
            const toAdd = available.sort(() => Math.random() - 0.5).slice(0, needed);
            for (const c of toAdd) {
              await db.insert(ccTable).values({ campaignId: camp.id, contactId: c.id, messagesSent: 0, status: 'pending' });
            }
          }
        }
        console.log('[PROTECAO] Verificacao de contatos concluida: max 2 por campanha');
      }
    } catch (error) {
      console.error('Erro na protecao de contatos:', error);
    }

    // PROTECAO: garantir messageVariations preenchidas em todas as campanhas
    try {
      const { getDb: getDb3 } = await import('../db');
      const { campaigns: campaignsTable } = await import('../../drizzle/schema');
      const { eq, or, isNull } = await import('drizzle-orm');
      const db3 = await getDb3();
      if (db3) {
        const emptyCamps = await db3.select().from(campaignsTable).where(
          or(isNull(campaignsTable.messageVariations), eq(campaignsTable.messageVariations, '[]'))
        );
        for (const camp of emptyCamps) {
          const defaultMessages = [
            `Olá! Temos uma ótima oportunidade em ${camp.name}. Gostaria de conhecer mais? 🏠`,
            `Vimos que você pode estar interessado em ${camp.name}. Vamos conversar? 📞`,
            `Oportunidade especial em ${camp.name}. Clique para saber mais! ✨`
          ];
          await db3.update(campaignsTable).set({ messageVariations: JSON.stringify(defaultMessages) }).where(eq(campaignsTable.id, camp.id));
          console.log(`[PROTECAO] Preenchidas messageVariations para campanha ${camp.id}: ${camp.name}`);
        }
        if (emptyCamps.length === 0) console.log('[PROTECAO] Todas as campanhas têm messageVariations preenchidas');
      }
    } catch (error) {
      console.error('Erro na protecao de messageVariations:', error);
    }

    // AUTO-RESTART: Verificar se o scheduler estava rodando antes do deploy
    try {
      const { campaignScheduler } = await import('../scheduler/campaignScheduler');
      const { getDb: getDb2 } = await import('../db');
      const { schedulerState: stateTable } = await import('../../drizzle/schema');
      const db2 = await getDb2();
      if (db2) {
        const rows = await db2.select().from(stateTable).limit(1);
        if (rows[0]?.status === 'running') {
          console.log('\n🔄 Scheduler estava rodando — restaurando...');
          const nightMode = (rows[0].stateJson as any)?.nightMode || false;
          await campaignScheduler.start(nightMode);
        } else {
          console.log('\n⏸️  Scheduler estava parado — nao iniciando automaticamente');
        }
      }
    } catch (error) {
      console.error('Erro no auto-restart do scheduler:', error);
    }

    // MONITORAMENTO Z-API: verificar conexao a cada 5 minutos
    const ZAPI_CHECK_INTERVAL = 5 * 60 * 1000;
    setInterval(async () => {
      const instanceId = process.env.ZAPI_INSTANCE_ID;
      const token = process.env.ZAPI_TOKEN;
      const clientToken = process.env.ZAPI_CLIENT_TOKEN;
      if (!instanceId || !token) return;
      try {
        const { getZAPIStatus } = await import('../zapi-integration');
        const status = await getZAPIStatus(instanceId, token, clientToken || undefined);
        if (!status.connected) {
          console.warn('[Z-API] ⚠️  WhatsApp DESCONECTADO — reconecte no painel Z-API');
        } else {
          console.log(`[Z-API] ✅ Conectado (${status.phone || 'ok'})`);
        }
      } catch (err) {
        console.warn('[Z-API] Erro ao verificar status:', err);
      }
    }, ZAPI_CHECK_INTERVAL);

    // SALVAR WEBHOOK URL no banco (para referencia)
    try {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (db) {
        const { companyConfig } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const configs = await db.select().from(companyConfig).limit(1);
        if (configs[0]) {
          await db.update(companyConfig)
            .set({ updatedAt: new Date() } as any)
            .where(eq(companyConfig.id, configs[0].id));
        }
        console.log('[Z-API] Webhook URL: https://romateccrmwhatsapp-production.up.railway.app/webhook/zapi');
      }
    } catch (_e) { /* nao critico */ }
  });
}

startServer().catch(console.error);

// build 202604121700 - v1.1.0 - Dockerfile Railway, phone 12->13 auto-fix, scheduler v9.0