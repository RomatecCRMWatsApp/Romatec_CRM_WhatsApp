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
  app.use(express.json({
    limit: "50mb",
    // Webhook da Meta assina o corpo cru (X-Hub-Signature-256): guarda só nessa rota
    verify: (req, _res, buf) => {
      if (req.url?.startsWith('/api/webhook/meta')) (req as any).rawBody = Buffer.from(buf);
    },
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);

  app.post('/api/webhook/zapi', async (req, res) => {
    try {
      // Só aceita avisos da instância do CRM (e, se configurado, com ?k=ZAPI_WEBHOOK_TOKEN)
      const { recusarWebhook } = await import('../zapiWebhookGuard');
      const recusa = await recusarWebhook(req.body, req.query?.k);
      if (recusa) {
        console.warn(`[Webhook] Recusado (${recusa}) — instanceId=${String(req.body?.instanceId ?? '').slice(0, 8)}…`);
        return res.status(403).json({ error: 'forbidden' });
      }

      // Verificação HMAC opcional. Se ZAPI_WEBHOOK_SECRET estiver definida,
      // exige header x-zapi-signature válido. Bloqueia atacantes injetando
      // mensagens fake no webhook público (que aciona o bot e gasta créditos).
      const webhookSecret = process.env.ZAPI_WEBHOOK_SECRET;
      if (webhookSecret) {
        const crypto = await import('crypto');
        const received = String(req.headers['x-zapi-signature'] ?? '');
        const rawBody  = JSON.stringify(req.body ?? {});
        const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
        try {
          const ok = received.length === expected.length &&
                     crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
          if (!ok) {
            console.warn('[Webhook] Assinatura HMAC inválida — request rejeitado');
            return res.status(401).json({ error: 'invalid signature' });
          }
        } catch {
          return res.status(401).json({ error: 'invalid signature' });
        }
      }

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

      // ───────────────────────────────────────────────────────────────────
      // Fan-out pra ZAYRA: se a mensagem é do CEO, repassa pra ela responder
      // como assistente pessoal — bot do CRM NÃO responde nesse caso pra
      // evitar dupla resposta. Ativado via ZAYRA_WEBHOOK_URL + CEO_WHATSAPP_PHONE.
      // Falha silenciosa: se ZAYRA estiver fora, CRM continua o fluxo normal.
      // ───────────────────────────────────────────────────────────────────
      const ceoPhoneRaw = process.env.CEO_WHATSAPP_PHONE;
      const zayraUrl    = process.env.ZAYRA_WEBHOOK_URL;
      if (ceoPhoneRaw && zayraUrl) {
        const ceoPhone   = ceoPhoneRaw.replace(/\D/g, '');
        const fromPhone  = payload.phone.replace(/\D/g, '');
        // match exato ou últimos 10 dígitos (cobre variações DDI 55 vs sem)
        const isFromCeo  = fromPhone === ceoPhone || fromPhone.endsWith(ceoPhone.slice(-10));
        if (isFromCeo) {
          console.log(`[Webhook] 🎯 Mensagem do CEO — repassando pra ZAYRA (fan-out), CRM bot NÃO responde`);
          // Fire-and-forget — não bloqueia o ack do webhook
          fetch(zayraUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(req.body),
          }).catch((err: unknown) => console.warn('[Webhook] ZAYRA fan-out falhou (não crítico):', err));
          return res.json({ received: true, processed: true, forwarded_to: 'zayra' });
        }
      }

      // Resposta automática de outra empresa ("mensagem automática", "fora do horário"…):
      // não responde (dois robôs conversando viram um loop) e não conta como resposta do lead
      const { ehRespostaAutomatica, podeResponder } = await import('../leads/antiLoop');
      if (!req.body?.fromMe && ehRespostaAutomatica(msgText)) {
        console.log(`[Webhook] 🤖 Resposta automática de ${payload.phone} — ignorada`);
        return res.json({ received: true, processed: false, reason: 'auto_reply' });
      }

      // O lead respondeu: cancela o follow-up automático pendente (server/leads/followup.ts)
      if (!req.body?.fromMe) {
        await import('../leads/followup').then(m => m.cancelarFollowUp(payload.phone)).catch(e => console.warn('[FollowUp] Cancelar falhou:', e?.message));
      }

      // "Sim" ao lembrete de visita: confirma a visita e responde (o bot não entra)
      if (!req.body?.fromMe) {
        try {
          const { confirmarPorResposta } = await import('../leads/visitas');
          const confirmacao = await confirmarPorResposta(payload.phone, msgText);
          if (confirmacao) {
            const { enviarTexto } = await import('../leads/zapiClient');
            await enviarTexto(payload.phone, confirmacao);
            return res.json({ received: true, processed: true, visita: 'confirmada' });
          }
        } catch (e: any) {
          console.warn('[Visitas] Confirmação pela resposta falhou (bot segue):', e?.message);
        }
      }

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

      // Contato novo sem código: depois da 1ª resposta do bot vira lead "WhatsApp direto" (+ aviso)
      let contatoNovo = false;
      let respostaBot: string | null = null;

      // Captação v1: IMV-xxxx / #CAMPANHA / "quero vender meu..." → lead com atribuição + abertura
      if (!req.body?.fromMe) {
        try {
          const { processarEntradaWhatsApp } = await import('../leads/inbound');
          const entrada = await processarEntradaWhatsApp({ phone: payload.phone, texto: msgText, nome: senderName, messageId: payload.messageId });
          if (entrada.acao === 'abertura') {
            const { enviarTexto } = await import('../leads/zapiClient');
            try {
              await enviarTexto(payload.phone, entrada.mensagem);
              // Contexto da conversa para a qualificação por IA
              const { registrarMensagemPorTelefone } = await import('../leads/qualificacaoService');
              await registrarMensagemPorTelefone(payload.phone, 'in', 'lead', msgText);
              await registrarMensagemPorTelefone(payload.phone, 'out', 'sistema', entrada.mensagem);
              // Comprador: o bot de qualificação continua a partir da resposta à abertura
              // Empreendimento (Bom Jardims): humano, sem follow-ups do bot genérico
              if (entrada.funil === 'comprador' && !entrada.empreendimento) registerBotMessage(payload.phone, senderName);
              // Se não responder, o follow-up sai em 1, 3, 7, 14 e 30 dias
              await import('../leads/followup').then(m => m.agendarFollowUp(payload.phone)).catch(() => {});
            } catch (e: any) {
              console.error(`[Entrada] ❌ Abertura não enviada para ${payload.phone}: ${e?.message}`);
            }
            return res.json({ received: true, processed: true, lead: 'novo' });
          }
          if (entrada.acao === 'nenhuma') {
            const { ehContatoNovo } = await import('../leads/inbound');
            contatoNovo = await ehContatoNovo(payload.phone);
          }
        } catch (e) {
          console.warn('[Entrada] Erro na atribuição (bot segue normal):', e);
        }
      }

      // Contato novo sem código: vira lead "WhatsApp direto" ANTES de responder, já no modo IA —
      // a IA pergunta o tipo de imóvel e segue o roteiro certo (chácara/lote sem renda/FGTS).
      // Sem IA configurada, segue como antes: o bot de perguntas responde e o lead é criado depois.
      if (contatoNovo) {
        try {
          const { qualificacaoIaLigada } = await import('../leads/qualificacaoService');
          if (qualificacaoIaLigada()) {
            const { registrarWhatsappDireto } = await import('../leads/inbound');
            await registrarWhatsappDireto({ phone: payload.phone, nome: senderName, texto: msgText, modo: 'ia' });
            contatoNovo = false;
          }
        } catch (e: any) {
          console.warn('[Entrada] WhatsApp direto (IA) não registrado, segue no bot:', e?.message);
        }
      }

      // Limite de respostas seguidas ao mesmo número (proteção contra loop com outro robô)
      if (!req.body?.fromMe && !podeResponder(payload.phone)) {
        console.warn(`[Webhook] ⛔ ${payload.phone}: limite de respostas em 10 min atingido — bot não responde`);
        return res.json({ received: true, processed: false, reason: 'rate_limited' });
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
              respostaBot = botResponse.text;
              registerBotMessage(payload.phone, senderName);
              await import('../leads/followup').then(m => m.agendarFollowUp(payload.phone)).catch(() => {});
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

      if (contatoNovo) {
        try {
          const { registrarWhatsappDireto } = await import('../leads/inbound');
          await registrarWhatsappDireto({ phone: payload.phone, nome: senderName, texto: msgText, resposta: respostaBot });
        } catch (e: any) {
          console.warn('[Entrada] WhatsApp direto não registrado (não crítico):', e?.message);
        }
      }

      res.json({ received: true, processed: true });
    } catch (error) {
      console.error('[Webhook] Erro:', error);
      res.json({ received: true, processed: false, error: String(error) });
    }
  });

  // ─── Formulário público de captação (página do lote / link da bio do Instagram) ───
  const { createRateLimiter } = await import('../lead-intake');
  const allowPublicLead = createRateLimiter(5, 10 * 60 * 1000); // 5 envios / 10 min por IP
  app.post('/api/public/lead', async (req, res) => {
    try {
      // Atrás do proxy do Railway: o último IP do x-forwarded-for é o que o proxy viu
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const ip = fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
      if (!allowPublicLead(ip)) {
        return res.status(429).json({ ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      }

      const { publicLeadSchema, ingestLead, origemFromUtm } = await import('../lead-intake');
      const parsed = publicLeadSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return res.status(400).json({ ok: false, error: first?.message || 'Dados inválidos' });
      }
      const data = parsed.data;
      if (data.website) {
        // Honeypot preenchido: finge sucesso pro robô e descarta
        return res.json({ ok: true });
      }

      const result = await ingestLead({
        nome: data.nome,
        phone: data.phone,
        origem: origemFromUtm(data.utm),
        propertyId: data.propertyId,
        utm: data.utm,
        origemVisita: data.origemVisita,
        visitanteId: data.vid,
      });

      if (!result.ok) {
        if (result.reason === 'invalid_phone') {
          return res.status(400).json({ ok: false, error: 'Informe um celular válido com DDD' });
        }
        if (result.reason === 'db_unavailable') {
          return res.status(503).json({ ok: false, error: 'Sistema indisponível no momento. Fale pelo WhatsApp.' });
        }
        // blocked / duplicate: não revela pro público
        return res.json({ ok: true });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('[PublicLead] Erro:', error);
      res.status(500).json({ ok: false, error: 'Erro ao enviar. Fale pelo WhatsApp.' });
    }
  });

  const { registerBomJardimsRoutes, registrarKmlBomJardims } = await import('../bom-jardims');
  registerBomJardimsRoutes(app, allowPublicLead);
  // KML público (Google Earth): empreendimento e chácara — antes dos arquivos estáticos e da SPA
  const { appUrl } = await import('../leads/config');
  registrarKmlBomJardims(app, appUrl);

  // ─── Rastreio da landing /i/:codigo (beacon) e QR de placa /q/:codigo ───
  const ipDe = (req: express.Request) => {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(v => v.trim()).filter(Boolean);
    return fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
  };
  const allowBeacon = createRateLimiter(60, 60 * 1000); // 60 eventos/min por IP
  app.post('/t', async (req, res) => {
    try {
      if (!allowBeacon(ipDe(req))) return res.status(429).end();
      // sendBeacon pode mandar text/plain: aceita JSON em string também
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
      const { eventoSchema, registrarEvento } = await import('../leads/rastreio');
      const ev = eventoSchema.safeParse(body ?? {});
      if (!ev.success) return res.status(400).end();
      await registrarEvento(ev.data);
      res.status(204).end();
    } catch (e) {
      console.warn('[Rastreio] Evento descartado:', (e as any)?.message);
      res.status(204).end();
    }
  });

  // Saúde das rotinas automáticas para monitor externo (503 = alguma rotina com problema; sem dados de lead)
  app.get('/api/saude', async (_req, res) => {
    const { estadoRotinas } = await import('../leads/rotinas');
    const e = estadoRotinas();
    res.status(e.ok ? 200 : 503).set('Cache-Control', 'no-store').json(e);
  });

  // "✅ Já atendi" do aviso: para o alerta de 5 minutos (link assinado, sem login)
  app.get('/a/:id/:token', async (req, res) => {
    const id = Number(req.params.id);
    const { tokenAtendidoValido, marcarAtendido } = await import('../leads/sla');
    const valido = Number.isInteger(id) && id > 0 && tokenAtendidoValido(id, String(req.params.token || ''));
    if (valido) await marcarAtendido(id).catch(() => {});
    res.status(valido ? 200 : 400).type('html').send(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
      `<title>Romatec CRM</title><body style="font-family:system-ui,sans-serif;background:#1b1e22;color:#e8ece9;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">` +
      `<div style="max-width:360px;text-align:center"><p style="font-size:48px;margin:0">${valido ? '✅' : '⚠️'}</p>` +
      `<h1 style="font-size:20px">${valido ? 'Lead marcado como atendido' : 'Link inválido'}</h1>` +
      `<p style="color:#9aa5a0">${valido ? 'O alerta de 5 minutos foi encerrado para este lead.' : 'Abra o lead no CRM para marcar o atendimento.'}</p>` +
      `<p><a style="color:#5fd3b4" href="/leads/lead/${valido ? id : ''}">Abrir no CRM</a></p></div></body>`,
    );
  });

  app.get('/q/:codigo', async (req, res) => {
    try {
      const codigo = String(req.params.codigo || '').toUpperCase();
      if (!/^IMV-\d{4}$/.test(codigo)) return res.redirect(302, '/');
      const vid = /(?:^|;\s*)rmt_vid=([0-9a-f-]{36})/i.exec(String(req.headers.cookie || ''))?.[1] ?? null;
      const { registrarScanQr } = await import('../leads/rastreio');
      const scan = await registrarScanQr(codigo, vid);
      if (!scan) return res.redirect(302, '/imoveis');
      const { mensagemPreenchida, linkWhatsApp } = await import('../leads/atribuicao');
      const { numeroWhatsAppLeads } = await import('../leads/config');
      const msg = mensagemPreenchida({ funil: 'comprador', imovelCodigo: scan.imovelCodigo, campanhaCodigo: scan.campanhaCodigo });
      res.redirect(302, linkWhatsApp(numeroWhatsAppLeads(), msg));
    } catch (e) {
      console.warn('[QR] Erro:', (e as any)?.message);
      res.redirect(302, '/');
    }
  });

  // ─── Webhook Meta (Instagram / Facebook Lead Ads) ───
  app.get('/api/webhook/meta', async (req, res) => {
    const { verifyMetaWebhook } = await import('../meta-integration');
    const { ENV } = await import('./env');
    const challenge = verifyMetaWebhook(req.query as Record<string, unknown>, ENV.metaVerifyToken);
    if (challenge === null) {
      console.warn('[Meta] Verificação do webhook recusada (verify_token não confere ou não configurado)');
      return res.sendStatus(403);
    }
    res.status(200).type('text/plain').send(challenge);
  });

  app.post('/api/webhook/meta', async (req, res) => {
    try {
      const { verifyMetaSignature, processMetaWebhook } = await import('../meta-integration');
      const { ENV } = await import('./env');
      if (!ENV.metaAppSecret) {
        console.error('[Meta] META_APP_SECRET não configurado — webhook recusado');
        return res.sendStatus(503);
      }
      if (!verifyMetaSignature((req as any).rawBody, req.headers['x-hub-signature-256'], ENV.metaAppSecret)) {
        console.warn('[Meta] Assinatura X-Hub-Signature-256 inválida — request rejeitado');
        return res.sendStatus(401);
      }

      const { ingestLead } = await import('../lead-intake');
      const outcomes = await processMetaWebhook(req.body, {
        accessToken: ENV.metaPageAccessToken,
        graphVersion: ENV.metaGraphVersion,
        ingest: ingestLead,
      });
      // Graph API ou banco fora: devolve erro pra Meta reenviar (o dedupe por metaLeadId segura a repetição)
      const retry = outcomes.some(o => o.status === 'fetch_error' ||
        (o.status === 'ingested' && !o.result.ok && o.result.reason === 'db_unavailable'));
      if (retry) return res.sendStatus(500);
      res.sendStatus(200);
    } catch (error) {
      console.error('[Meta] Erro no webhook:', error);
      res.sendStatus(500);
    }
  });

  app.post('/api/upload', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
    try {
      // Só com login (colaborador ou administrador): sem isso qualquer um subia arquivos no Cloudinary da Romatec
      const { sdk } = await import('./sdk');
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user as any).ativo === false) return res.status(401).json({ success: false, error: 'Faça login para enviar arquivos' });
      const { perfilDe } = await import('../../shared/equipe');
      if (perfilDe(user as any) === 'empreendedor') return res.status(403).json({ success: false, error: 'Seu acesso não envia arquivos' });

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

  // Materiais de divulgação: só com login; vai para o Cloudinary (romatec_materiais), PDF como raw
  app.post('/api/materiais/upload', express.raw({ type: '*/*', limit: '110mb' }), async (req, res) => {
    try {
      const { sdk } = await import('./sdk');
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user as any).ativo === false) return res.status(401).json({ success: false, error: 'Faça login para enviar materiais' });
      const { perfilDe } = await import('../../shared/equipe');
      if (perfilDe(user as any) === 'empreendedor') return res.status(403).json({ success: false, error: 'Seu acesso não envia materiais' });
      const { problemaArquivo, resourceTypeDe } = await import('../../shared/materiais');
      const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'material'));
      const fileType = String(req.headers['x-file-type'] || '');
      const buffer = req.body as Buffer;
      const erro = problemaArquivo(fileType, buffer?.length || 0);
      if (erro) return res.status(400).json({ success: false, error: erro });
      const { uploadToCloudinary } = await import('../cloudinary');
      const { url } = await uploadToCloudinary(buffer, fileType, fileName, { folder: 'romatec_materiais', resourceType: resourceTypeDe(fileType) });
      res.json({ success: true, url, mime: fileType, tamanhoBytes: buffer.length });
    } catch (error: any) {
      console.error('[Materiais] Upload falhou:', error?.message);
      res.status(500).json({ success: false, error: 'Falha no upload do material' });
    }
  });

  // Arquivos do empreendimento (licenças, projeto, escrituras): ficam no banco; envio e download só com login
  const usuarioDaEquipe = async (req: express.Request) => {
    const { sdk } = await import('./sdk');
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user || (user as any).ativo === false) return null;
    const { perfilDe } = await import('../../shared/equipe');
    return perfilDe(user as any) === 'empreendedor' ? null : user;
  };
  /** Corretor só mexe nos arquivos dos empreendimentos habilitados para ele (shared/permissoes.ts) */
  const habilitadoNoEmpreendimento = async (user: any, empreendimentoId: number) => {
    const { carregarPermissoes } = await import('../permissoes');
    const { temAcesso } = await import('../../shared/permissoes');
    const p = await carregarPermissoes(user);
    return temAcesso(p.perfil, p.acessos, 'empreendimento', empreendimentoId) && (p.perfil === 'admin' || !!p.modulos?.empreendimentos);
  };
  app.post('/api/empreendimentos/:slug/arquivos', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
    try {
      const user = await usuarioDaEquipe(req);
      if (!user) return res.status(401).json({ success: false, error: 'Faça login para enviar arquivos' });
      const buffer = req.body as Buffer;
      if (!buffer?.length) return res.status(400).json({ success: false, error: 'Arquivo vazio' });
      if (buffer.length > 20 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Arquivo acima de 20 MB' });
      const nome = decodeURIComponent(String(req.headers['x-file-name'] || 'arquivo')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 200);
      const categorias = ['licenca', 'projeto', 'escritura', 'memorial', 'mapa', 'contrato', 'outro'];
      const categoria = categorias.includes(String(req.headers['x-categoria'])) ? String(req.headers['x-categoria']) : 'outro';
      const { getDb } = await import('../db');
      const { empreendimentos, empreendimentoArquivos } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db: any = await getDb();
      const [emp] = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, req.params.slug)).limit(1);
      if (!emp) return res.status(404).json({ success: false, error: 'Empreendimento não encontrado' });
      if (!(await habilitadoNoEmpreendimento(user, emp.id))) return res.status(403).json({ success: false, error: 'Você não está habilitado para este empreendimento' });
      await db.insert(empreendimentoArquivos).values({
        empreendimentoId: emp.id, nome, categoria, mime: String(req.headers['x-file-type'] || 'application/octet-stream').slice(0, 100),
        tamanhoBytes: buffer.length, conteudoBase64: buffer.toString('base64'), enviadoPor: (user as any).id,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Empreendimentos] Upload falhou:', error?.message);
      res.status(500).json({ success: false, error: 'Falha ao salvar o arquivo' });
    }
  });
  app.get('/api/empreendimentos/arquivos/:id', async (req, res) => {
    try {
      const user = await usuarioDaEquipe(req);
      if (!user) return res.status(401).send('Faça login para baixar arquivos');
      const { getDb } = await import('../db');
      const { empreendimentoArquivos } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db: any = await getDb();
      const [arq] = await db.select().from(empreendimentoArquivos).where(eq(empreendimentoArquivos.id, Number(req.params.id) || 0)).limit(1);
      if (!arq) return res.status(404).send('Arquivo não encontrado');
      if (!(await habilitadoNoEmpreendimento(user, arq.empreendimentoId))) return res.status(403).send('Você não está habilitado para este empreendimento');
      const inline = /^(application\/pdf|image\/)/.test(arq.mime || '') && req.query.baixar !== '1';
      res.setHeader('Content-Type', arq.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(arq.nome)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(arq.conteudoBase64, 'base64'));
    } catch (error: any) {
      console.error('[Empreendimentos] Download falhou:', error?.message);
      res.status(500).send('Falha ao abrir o arquivo');
    }
  });

  app.get("/api/pdf-proxy", async (req, res) => {
    // Só PDFs do Cloudinary da própria Romatec (antes buscava qualquer endereço e
    // mandava a senha do Cloudinary para qualquer URL que contivesse "res.cloudinary.com")
    const { urlPdfPermitida } = await import('../pdfProxyGuard');
    const url = urlPdfPermitida(req.query.url, process.env.CLOUDINARY_CLOUD_NAME);
    if (!url) {
      return res.status(400).json({ error: "URL inválida" });
    }
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; RomatecCRM/1.0)',
        'Accept': 'application/pdf,*/*',
      };
      const CLOUD_API_KEY = process.env.CLOUDINARY_API_KEY;
      const CLOUD_API_SECRET = process.env.CLOUDINARY_API_SECRET;
      if (CLOUD_API_KEY && CLOUD_API_SECRET) {
        headers['Authorization'] = `Basic ${Buffer.from(`${CLOUD_API_KEY}:${CLOUD_API_SECRET}`).toString('base64')}`;
      }
      // Sem seguir redirecionamento: a credencial não pode escapar para outro endereço
      const response = await fetch(url, { headers, redirect: 'manual' });
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

  // Planta Baixa (PDF) — serve base64 armazenado como arquivo PDF
  app.get("/api/imoveis/:id/planta", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: "ID de imóvel inválido" });
      }

      const { getDb } = await import('../db');
      const { properties } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Banco de dados indisponível" });
      }

      const prop = await db.select().from(properties).where(eq(properties.id, Number(id))).limit(1);
      if (!prop[0] || !prop[0].plantaBaixaUrl) {
        return res.status(404).json({ error: "Planta baixa não encontrada" });
      }

      const plantaUrl = prop[0].plantaBaixaUrl as string;

      // Se for base64 (data: URI)
      if (plantaUrl.startsWith('data:application/pdf;base64,')) {
        const base64Data = plantaUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="planta.pdf"');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }

      // Se for URL remota (Cloudinary, etc)
      if (plantaUrl.startsWith('http')) {
        const response = await fetch(plantaUrl);
        if (!response.ok) {
          return res.status(502).json({ error: `Falha ao buscar planta (${response.status})` });
        }
        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="planta.pdf"');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(buffer));
      }

      res.status(400).json({ error: "Formato de planta baixa não suportado" });
    } catch (e) {
      console.error('[Planta] Erro:', e);
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
  
  // robots.txt e sitemap.xml antes do site (senão caem no index.html da SPA)
  const { registrarRotasSeo } = await import('../seoRotas');
  registrarRotasSeo(app);

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

  try {
    const { addPendingStatusToSendLog } = await import('./migrations/addPendingStatusToSendLog');
    await addPendingStatusToSendLog();
  } catch (e) {
    console.error('❌ Erro na migration addPendingStatusToSendLog:', e);
  }

  try {
    const { cleanupOldCycleHourFormat } = await import('./migrations/cleanupOldCycleHourFormat');
    await cleanupOldCycleHourFormat();
  } catch (e) {
    console.error('❌ Erro na migration cleanupOldCycleHourFormat:', e);
  }

  try {
    const { addUniqueCampaignCycleHour } = await import('./migrations/addUniqueCampaignCycleHour');
    await addUniqueCampaignCycleHour();
  } catch (e) {
    console.error('❌ Erro na migration addUniqueCampaignCycleHour:', e);
  }

  try {
    const { addLeadOriginColumns } = await import('./migrations/addLeadOriginColumns');
    await addLeadOriginColumns();
  } catch (e) {
    console.error('❌ Erro na migration addLeadOriginColumns:', e);
  }

  try {
    const { addEmpreendimentos } = await import('./migrations/addEmpreendimentos');
    await addEmpreendimentos();
  } catch (e) {
    console.error('❌ Erro na migration addEmpreendimentos:', e);
  }

  try {
    const { addUserPasswordColumns } = await import('./migrations/addUserPasswordColumns');
    await addUserPasswordColumns();
  } catch (e) {
    console.error('❌ Erro na migration addUserPasswordColumns:', e);
  }

  try {
    const { addLeadsV1 } = await import('./migrations/addLeadsV1');
    await addLeadsV1();
  } catch (e) {
    console.error('❌ Erro na migration addLeadsV1:', e);
  }

  try {
    const { addMateriais } = await import('./migrations/addMateriais');
    await addMateriais();
  } catch (e) {
    console.error('❌ Erro na migration addMateriais:', e);
  }

  try {
    const { addEquipe } = await import('./migrations/addEquipe');
    await addEquipe();
  } catch (e) {
    console.error('❌ Erro na migration addEquipe:', e);
  }

  try {
    const { addFase1Captacao } = await import('./migrations/addFase1Captacao');
    await addFase1Captacao();
  } catch (e) {
    console.error('❌ Erro na migration addFase1Captacao:', e);
  }

  try {
    const { addVisitas } = await import('./migrations/addVisitas');
    await addVisitas();
    const { addControleLotes } = await import('./migrations/addControleLotes');
    await addControleLotes();
  } catch (e) {
    console.error('❌ Erro na migration addVisitas:', e);
  }

  try {
    const { addSimulador } = await import('./migrations/addSimulador');
    await addSimulador();
  } catch (e) {
    console.error('❌ Erro na migration addSimulador:', e);
  }

  try {
    const { addPermissoes } = await import('./migrations/addPermissoes');
    await addPermissoes();
  } catch (e) {
    console.error('❌ Erro na migration addPermissoes:', e);
  }

  // Leads parados há 48 h perdem pontos no score (§8)
  import('../leads/scoreService').then(m => m.iniciarJobInatividade()).catch(e => console.warn('[Score] Job não iniciado:', e));
  // Follow-up persistente (1/3/7/14/30 dias) e prazo de atendimento — não dependem das campanhas
  import('../leads/followup').then(m => m.iniciarJobFollowUp()).catch(e => console.warn('[FollowUp] Job não iniciado:', e));
  import('../leads/sla').then(m => m.iniciarJobSla()).catch(e => console.warn('[SLA] Job não iniciado:', e));
  // Agenda de visitas: lembrete ao cliente, aviso ao corretor e pedido de resultado
  import('../leads/visitas').then(m => m.iniciarJobVisitas()).catch(e => console.warn('[Visitas] Job não iniciado:', e));
  // Vigia: avisa no Telegram se o follow-up ou o alerta de atendimento pararem
  import('../leads/rotinas').then(m => m.iniciarVigiaRotinas()).catch(e => console.warn('[Rotinas] Vigia não iniciado:', e));

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

    // CAMPAIGNS_ENABLED: flag pra desativar envio em massa enquanto WhatsApp
    // está instável (aguardando migração pra Meta Cloud API oficial).
    // Setar CAMPAIGNS_ENABLED=false no Railway pra pausar tudo sem perder dados.
    // Webhook continua recebendo mensagens, leads continuam sendo cadastrados,
    // bot AI continua qualificando — só o envio em massa fica desligado.
    const campaignsEnabled = process.env.CAMPAIGNS_ENABLED !== 'false';

    if (campaignsEnabled) {
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
    } else {
      console.log('\n⏸️  Envio em massa de campanhas DESATIVADO (CAMPAIGNS_ENABLED=false)');
      console.log('   • Scheduler de campanhas: PARADO');
      console.log('   • Daily scheduler: PARADO');
      console.log('   • Webhook + bot AI + recebimento de leads: CONTINUAM funcionando');
      console.log('   • Pra reativar: setar CAMPAIGNS_ENABLED=true no Railway\n');
    }

    // ZAIRA: Inicializar knowledge base e loop autônomo
    try {
      const { initKnowledge } = await import('../zaira-knowledge');
      initKnowledge();
      if (process.env.ZAIRA_ENABLED !== 'false') {
        const { startAutonomousLoop } = await import('../zaira-autonomous');
        startAutonomousLoop();
        console.log('🤖 Zaira Agent iniciado — acesse /zaira no frontend');
      } else {
        console.log('🤖 Zaira Agent desabilitado (ZAIRA_ENABLED=false)');
      }
    } catch (e) {
      console.warn('⚠️ Zaira Agent não pôde ser iniciado (não crítico):', e);
    }
  });
}

startServer().catch(console.error);
