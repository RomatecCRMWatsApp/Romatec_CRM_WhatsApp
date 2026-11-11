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
  // CSRF: escrita com a sessão vinda de outro site é recusada (server/_core/origem.ts)
  app.use((await import('./origem')).bloquearOrigemCruzada);
  // Proteções gerais (server/_core/protecoes.ts): cabeçalhos de segurança, limite por IP e tamanho do corpo
  const protecoes = await import('./protecoes');
  app.disable('x-powered-by');
  app.use(protecoes.cabecalhosSeguranca);
  // PDFs: ?baixar=1 baixa o arquivo em vez de abrir (_core/linkPdf.ts)
  { const { forcarDownloadPdf } = await import('./linkPdf'); app.use(forcarDownloadPdf as any); }
  // Compressão das respostas (Brotli quando o navegador aceita, senão gzip): HTML, JS, CSS, SVG e JSON da API.
  // Imagens, vídeos e PDFs já vêm comprimidos e passam direto (filtro padrão por tipo de conteúdo).
  const compression = (await import('compression')).default;
  app.use(compression({ threshold: 1024 }));
  app.use(protecoes.criarLimiteGlobal());
  // JSON: 50 MB só para o CRM logado (fotos/documentos em base64); 1 MB nas rotas públicas e webhooks.
  // Webhooks da Meta (X-Hub-Signature-256) e da Spedy (Standard Webhooks) assinam o corpo cru: guarda só nessas rotas
  app.use(...protecoes.jsonComLimite((req, _res, buf) => {
    if (req.url?.startsWith('/api/webhook/meta') || req.url?.startsWith('/api/webhook/spedy')) (req as any).rawBody = Buffer.from(buf);
  }));
  // "Ver como" do administrador: só leitura também nas rotas REST (server/_core/verComo.ts)
  const { bloquearEscritaRest } = await import('./verComo');
  app.use(bloquearEscritaRest);
  registerOAuthRoutes(app);
  // Camada SaaS: licença nas rotas REST (antes das demais /api) + talonários — só age com o licenciamento ligado
  const { registrarRotasSaas } = await import('../saas/rotas');
  registrarRotasSaas(app);

  app.post('/api/webhook/zapi', async (req, res) => {
    try {
      // Só aceita avisos da instância do CRM com ?k=ZAPI_WEBHOOK_TOKEN (obrigatório em produção)
      const { recusarWebhook } = await import('../zapiWebhookGuard');
      const recusa = await recusarWebhook(req.body, req.query?.k);
      if (recusa) {
        console.warn(`[Webhook] Recusado (${recusa}) — instanceId=${String(req.body?.instanceId ?? '').slice(0, 8)}…`);
        if (recusa === 'token_nao_configurado') return res.status(503).json({ error: 'webhook_not_configured' });
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
        // Mensagem nossa (do celular da Romatec ou eco do sistema): entra no histórico da Caixa de entrada
        try {
          const { mensagemNossaDoWebhook } = await import('../zapi-integration');
          const nossa = mensagemNossaDoWebhook(req.body);
          if (nossa) {
            const { registrarMensagemPorTelefone } = await import('../leads/qualificacaoService');
            await registrarMensagemPorTelefone(nossa.phone, 'out', 'corretor', nossa.texto);
          }
        } catch (e: any) { console.warn('[Webhook] Histórico da mensagem enviada:', e?.message); }
        return res.json({ received: true, processed: false });
      }

      // Reenvio da Z-API (a resposta demorou) ou outra cópia do servidor: não responde de novo
      const { mensagemNova } = await import('../leads/inbound');
      if (!(await mensagemNova(payload.messageId))) {
        console.log(`[Webhook] ↩️ Mensagem ${payload.messageId} já recebida — ignorada`);
        return res.json({ received: true, processed: false, reason: 'duplicate' });
      }

      const msgText = String(payload.message || '').trim();

      // Agente de Cadastro de Imóveis (mesmo WhatsApp): corretor/secretária/admin vinculados e autorizados no CRM.
      // Vem antes dos leads e da ZAYRA; o que não é do agente segue o fluxo normal (cliente nunca cai aqui).
      try {
        const ceoDigitos = String(process.env.CEO_WHATSAPP_PHONE || '').replace(/\D/g, '');
        const deDigitos = payload.phone.replace(/\D/g, '');
        const ceo = !!ceoDigitos && (deDigitos === ceoDigitos || deDigitos.endsWith(ceoDigitos.slice(-10)));
        const { tratarMensagemAgente } = await import('../imoveis/agenteCadastro');
        if (await tratarMensagemAgente({ phone: payload.phone, texto: msgText, messageId: payload.messageId, audioUrl: payload.audioUrl, imageUrl: payload.imageUrl, legenda: payload.legenda }, { ceo })) {
          return res.json({ received: true, processed: true, reason: 'agente_imovel' });
        }
      } catch (e: any) { console.warn('[Webhook] Agente de imóveis:', e?.message); }

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

      // Número da equipe (corretor, secretária, admin, empreendedor, corretor externo, a própria empresa):
      // conversa interna — nunca vira lead e o bot de captação não responde
      const { ehNumeroDaEquipe } = await import('../leads/numerosDaEquipe');
      if (await ehNumeroDaEquipe(payload.phone).catch(() => false)) {
        console.log(`[Webhook] 👥 ${payload.phone} é da equipe — não vira lead`);
        return res.json({ received: true, processed: false, reason: 'equipe' });
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
              const { pediuOptout } = await import('../leads/iaQualificacao');
              if (!req.body?.fromMe && pediuOptout(msgText)) {
                // Pediu para sair: fora das campanhas de vez (não volta para a fila)
                await db.update(campaignContacts).set({ status: "blocked" }).where(eq(campaignContacts.contactId, contact.id));
                await db.update(contacts).set({ status: "blocked" }).where(eq(contacts.id, contact.id));
                console.log(`[Webhook] 🚫 ${senderName} pediu para sair — fora das campanhas`);
              } else {
                await db.update(campaignContacts)
                  .set({ messagesSent: 0, status: "pending" })
                  .where(eq(campaignContacts.contactId, contact.id));
                console.log(`[Webhook] ✅ Tentativas resetadas para ${senderName} (respondeu)`);
              }
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

      // Prospecção B2B (AvalieImob): resposta de empresa já contatada fica no prospecto; o robô de compradores não responde
      if (!req.body?.fromMe) {
        try {
          const { registrarRespostaWhatsApp } = await import('../prospeccao/servico');
          if (await registrarRespostaWhatsApp(payload.phone, msgText)) return res.json({ received: true, processed: true, prospecto: true });
        } catch (e: any) {
          console.warn('[Prospecção] Falha ao registrar resposta (seguindo no fluxo):', e?.message);
        }
      }

      // Contato novo sem código: depois da 1ª resposta do bot vira lead "WhatsApp direto" (+ aviso)
      let contatoNovo = false;
      let respostaBot: string | null = null;

      // Captação v1: IMV-xxxx / #CAMPANHA / "quero vender meu..." → lead com atribuição + abertura
      if (!req.body?.fromMe) {
        try {
          const { processarEntradaWhatsApp } = await import('../leads/inbound');
          const entrada = await processarEntradaWhatsApp({ phone: payload.phone, texto: msgText, nome: senderName, messageId: payload.messageId });
          if (entrada.acao === 'abertura' && entrada.empreendimento) {
            // Robô de respostas automáticas ligado: ele responde o primeiro contato (sem a régua antiga de follow-up)
            const { roboAtivo, processarMensagem } = await import('../autoresposta/motor');
            if (await roboAtivo(entrada.empreendimento)) {
              const { registrarMensagemPorTelefone } = await import('../leads/qualificacaoService');
              await registrarMensagemPorTelefone(payload.phone, 'in', 'lead', msgText).catch(() => {});
              await processarMensagem({ phone: payload.phone, texto: msgText, nome: senderName, primeira: true })
                .catch((e: any) => console.error(`[Entrada] ❌ Resposta automática para ${payload.phone}: ${e?.message}`));
              return res.json({ received: true, processed: true, lead: 'novo' });
            }
          }
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

      // Caixa de entrada: toda mensagem do cliente fica no histórico do lead (antes só a do caminho da IA ficava)
      if (!req.body?.fromMe && msgText) {
        const { registrarMensagemPorTelefone } = await import('../leads/qualificacaoService');
        await registrarMensagemPorTelefone(payload.phone, 'in', 'lead', msgText).catch(() => {});
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
              const { registrarMensagemPorTelefone } = await import('../leads/qualificacaoService');
              await registrarMensagemPorTelefone(payload.phone, 'out', 'bot', botResponse.text).catch(() => {});
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

  // ─── Página de oferta (/o/:slug?l=<token>) e folder da chácara gerado na hora ───
  app.get('/api/public/oferta/:slug/chacara/:arquivo', async (req, res) => {
    try {
      const codigo = String(req.params.arquivo).replace(/\.png$/i, '');
      const { folderDaChacara } = await import('../autoresposta/folderChacara');
      const png = await folderDaChacara(String(req.params.slug).slice(0, 80), codigo);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(png);
    } catch (e: any) {
      if (e?.name === 'FolderErro') return res.status(e.status).json({ ok: false, error: e.message });
      console.error('[Oferta] folder:', e);
      res.status(500).json({ ok: false, error: 'Falha ao gerar o folder' });
    }
  });
  app.get('/api/public/oferta/:slug/disponiveis', async (req, res) => {
    try {
      const { disponiveisAgora } = await import('../autoresposta/oferta');
      res.json({ ok: true, ...(await disponiveisAgora(String(req.params.slug).slice(0, 80))) });
    } catch (e: any) {
      if (e?.name === 'OfertaErro') return res.status(e.status).json({ ok: false, error: e.message });
      res.status(500).json({ ok: false, error: 'Falha ao carregar' });
    }
  });
  app.get('/api/public/oferta/:slug', async (req, res) => {
    try {
      const { dadosDaOferta } = await import('../autoresposta/oferta');
      const token = typeof req.query.l === 'string' ? req.query.l.slice(0, 24) : null;
      const ref = typeof req.query.c === 'string' ? req.query.c.slice(0, 20) : null;
      res.json({ ok: true, ...(await dadosDaOferta(String(req.params.slug).slice(0, 80), token, Date.now(), ref)) });
    } catch (e: any) {
      if (e?.name === 'OfertaErro') return res.status(e.status).json({ ok: false, error: e.message });
      console.error('[Oferta] página:', e);
      res.status(500).json({ ok: false, error: 'Falha ao carregar' });
    }
  });

  // ─── Campanha Mapa 3D (/bom-jardims/3d): vídeos liberados da galeria do empreendimento + os fixos do site ───
  app.get('/api/public/bom-jardims/videos', async (_req, res) => {
    try {
      const { videosDaGaleria } = await import('../../shared/mapa3dBomJardims');
      const { materiais } = await import('../../drizzle/schema');
      const { and, asc, desc, eq } = await import('drizzle-orm');
      const { getDb } = await import('../db');
      const db = await getDb();
      const rows: any[] = db ? await db.select({ titulo: materiais.titulo, tipo: materiais.tipo, mime: materiais.mime, url: materiais.url, liberado: materiais.liberado })
        .from(materiais).where(and(eq(materiais.empreendimentoSlug, 'bom-jardims'), eq(materiais.liberado, true)))
        .orderBy(asc(materiais.ordem), desc(materiais.createdAt)) : [];
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ ok: true, videos: videosDaGaleria(rows) });
    } catch (e: any) {
      console.error('[Mapa3D] vídeos:', e?.message || e);
      const { VIDEOS_FIXOS } = await import('../../shared/mapa3dBomJardims');
      res.json({ ok: true, videos: VIDEOS_FIXOS });
    }
  });

  // ─── Link de agendamento por empreendimento (/agendar/:slug?c=<ref>) ───
  const allowAgendamento = createRateLimiter(5, 10 * 60 * 1000);
  app.get('/api/public/agendamento/:slug', async (req, res) => {
    try {
      const { dadosDaPagina } = await import('../agendamento');
      const ref = typeof req.query.c === 'string' ? req.query.c.slice(0, 20) : null;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...(await dadosDaPagina(String(req.params.slug).slice(0, 80), ref)) });
    } catch (e: any) {
      if (e?.name === 'AgendamentoErro') return res.status(e.status).json({ ok: false, error: e.message });
      console.error('[Agendamento] página:', e);
      res.status(500).json({ ok: false, error: 'Falha ao carregar' });
    }
  });
  app.post('/api/public/agendamento/:slug', async (req, res) => {
    try {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const ip = fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
      if (!allowAgendamento(ip)) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      const { agendamentoSchema } = await import('../../shared/agendamento');
      const parsed = agendamentoSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' });
      if (parsed.data.website) return res.json({ ok: true }); // honeypot
      const { registrarAgendamento } = await import('../agendamento');
      const r = await registrarAgendamento(String(req.params.slug).slice(0, 80), parsed.data, ip);
      // Tela de obrigado: a confirmação (enviada ou não pelo WhatsApp do sistema)
      res.json({ ok: true, confirmacao: (r as any).confirmacao ?? null, confirmacaoEnviada: !!(r as any).confirmacaoEnviada });
    } catch (e: any) {
      if (e?.name === 'AgendamentoErro') return res.status(e.status).json({ ok: false, error: e.message });
      console.error('[Agendamento] envio:', e);
      res.status(500).json({ ok: false, error: 'Não foi possível enviar agora. Fale pelo WhatsApp.' });
    }
  });
  // ─── Convite de reunião: confirmação de presença (/reuniao/:token — server/convites.ts) ───
  const allowReuniao = createRateLimiter(20, 10 * 60 * 1000);
  const erroConvite = (res: express.Response, e: any, onde: string) => {
    if (e?.name === 'ConviteErro') return res.status(e.status).json({ ok: false, error: e.message });
    console.error(`[Convites] ${onde}:`, e);
    res.status(500).json({ ok: false, error: 'Falha ao carregar o convite' });
  };
  app.get('/api/public/reuniao/:token', async (req, res) => {
    try {
      const { paginaPublica } = await import('../convites');
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...(await paginaPublica(String(req.params.token))) });
    } catch (e) { erroConvite(res, e, 'página'); }
  });
  app.post('/api/public/reuniao/:token', async (req, res) => {
    try {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const ip = fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
      if (!allowReuniao(ip)) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      const { respostaSchema } = await import('../../shared/convites');
      const parsed = respostaSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || 'Dados inválidos' });
      if (parsed.data.website) return res.json({ ok: true, status: parsed.data.resposta }); // honeypot
      const { responder } = await import('../convites');
      res.json({ ok: true, ...(await responder(String(req.params.token), parsed.data.resposta, parsed.data)) });
    } catch (e) { erroConvite(res, e, 'resposta'); }
  });
  app.get('/api/public/reuniao/:token/folder', async (req, res) => {
    try {
      const { folderPorToken } = await import('../convites');
      const f = await folderPorToken(String(req.params.token));
      res.setHeader('Content-Type', f.mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.nome || 'folder')}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(f.conteudo);
    } catch (e: any) { res.status(e?.status ?? 500).send(e?.name === 'ConviteErro' ? e.message : 'Falha ao abrir o folder'); }
  });
  // Folder/material da reunião (imagem ou PDF): só administrador e secretária
  app.post('/api/convites/:id/folder', express.raw({ type: '*/*', limit: '11mb' }), async (req, res) => {
    try {
      const { sdk } = await import('./sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).json({ ok: false, error: 'Faça login' });
      const { perfilDe } = await import('../../shared/equipe');
      if (!['admin', 'secretario'].includes(perfilDe(user) ?? '')) return res.status(403).json({ ok: false, error: 'Só o administrador e a secretária' });
      const { detectarMime } = await import('../../shared/cadastro');
      const { MAX_FOLDER_BYTES } = await import('../../shared/convites');
      const buffer = req.body as Buffer;
      const mime = buffer?.length ? detectarMime(buffer) : null;
      if (!mime) return res.status(415).json({ ok: false, error: 'Envie uma imagem (JPG, PNG, WEBP) ou um PDF' });
      if (buffer.length > MAX_FOLDER_BYTES) return res.status(413).json({ ok: false, error: 'Arquivo acima de 10 MB' });
      const { salvarFolder } = await import('../convites');
      const nome = String(req.query.nome ?? 'folder').replace(/[^\w .()-]/g, '_').slice(0, 160);
      await salvarFolder(Number(req.params.id) || 0, { mime, nome, conteudo: buffer });
      res.json({ ok: true });
    } catch (e) { erroConvite(res, e, 'folder'); }
  });
  app.post('/api/public/lead', async (req, res) => {
    try {
      // Atrás do proxy do Railway: o último IP do x-forwarded-for é o que o proxy viu
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
      const ip = fwd[fwd.length - 1] || req.socket.remoteAddress || 'unknown';
      if (!allowPublicLead(ip)) {
        return res.status(429).json({ ok: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      }

      const { publicLeadSchema, ingestLead, origemFromUtm } = await import('../lead-intake');
      const { CONSENTIMENTO_IMOVEL } = await import('../../shared/consentimentos');
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
        // O schema exige consent:true; registra o que a pessoa leu (mesmo texto do formulário), quando e de onde
        consentimento: { at: new Date().toISOString(), texto: CONSENTIMENTO_IMOVEL, origem: `landing /i (imóvel ${data.propertyId ?? '—'})`, ip },
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
  // Campanha das obras (/obras-bom-jardim): lead e cliques com corretor do rodízio
  const { registrarRotasObras } = await import('../obrasBomJardim');
  registrarRotasObras(app, allowPublicLead);
  // Portais (ZAP, VivaReal, OLX): feed VRSync e leads do Canal Pro
  const { registrarRotasPortais } = await import('../portais');
  registrarRotasPortais(app);
  // API para parceiros (/api/v1) com chave Bearer
  const { registrarApiParceiros } = await import('../apiParceiros');
  registrarApiParceiros(app);
  // Portal das imobiliárias parceiras (/parceiro/:token)
  const { registrarRotasParceiros } = await import('../parceiros');
  registrarRotasParceiros(app, allowPublicLead);
  // Kit do Parceiro (PDF personalizado: parceira, prospecto, corretor)
  const { registrarRotaKit } = await import('../kitParceiro');
  registrarRotaKit(app);
  // Contrato de Gestão (EMPREENDEDORA × GESTORA): PDF, Word e recibos — só o administrador
  const { registrarRotasGestao } = await import('../gestao/rotas');
  registrarRotasGestao(app);
  // Tour 360° das chácaras
  const { registrarRotasTour360 } = await import('../tour360');
  registrarRotasTour360(app);
  // Kit de registro em cartório (ZIP)
  const { registrarRotasCartorio } = await import('../cartorio');
  registrarRotasCartorio(app);
  // Documentos para o cliente (/documentos/:emp/:doc): páginas como imagem, só leitura
  const { registrarRotasDocumentosCliente } = await import('../documentosCliente');
  registrarRotasDocumentosCliente(app);
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

  // Versão no ar (público, sem cache): os navegadores abertos comparam com a deles e mostram "Nova versão disponível"
  app.get('/api/system/version', async (_req, res) => {
    try {
      const { versaoNoAr } = await import('../releases');
      res.set('Cache-Control', 'no-store').json(await versaoNoAr());
    } catch (e: any) {
      console.error('[system/version]', e?.message);
      res.status(500).json({ error: 'Falha ao consultar versão' });
    }
  });

  // Link de aviso de um lead que já passou para outro corretor: não vale mais (não marca nada, não abre o cliente)
  const paginaLinkAnulado = (res: express.Response) => res.status(410).set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').type('html').send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>Romatec CRM</title><body style="font-family:system-ui,sans-serif;background:#1b1e22;color:#e8ece9;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">` +
    `<div style="max-width:360px;text-align:center"><p style="font-size:48px;margin:0">🔁</p>` +
    `<h1 style="font-size:20px">Este lead não está mais com você</h1>` +
    `<p style="color:#9aa5a0">Ele foi passado para outro corretor ou voltou para o escritório porque o recebimento não foi confirmado no prazo. O link deste aviso não vale mais.</p>` +
    `<p><a style="color:#5fd3b4" href="/leads/recebidos">Ver meus leads</a></p></div></body>`,
  );
  const destinatarioDoLink = (req: express.Request) => { const u = Number(req.query.u); return Number.isInteger(u) && u > 0 ? u : null; };

  // "✅ Já atendi" do aviso: para o alerta de 5 minutos (link assinado, sem login)
  app.get('/a/:id/:token', async (req, res) => {
    const id = Number(req.params.id);
    const { tokenAtendidoValido, marcarAtendido, linkAtendidoAindaVale } = await import('../leads/sla');
    const para = destinatarioDoLink(req);
    const valido = Number.isInteger(id) && id > 0 && tokenAtendidoValido(id, String(req.params.token || ''), para);
    if (valido && !(await linkAtendidoAindaVale(id, para).catch(() => true))) return paginaLinkAnulado(res);
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

  // "✅ Confirmar que recebi" do aviso de encaminhamento: 1 toque, sem login (robô de pré-visualização não confirma)
  app.get('/c/:id/:token', async (req, res) => {
    const id = Number(req.params.id);
    const { tokenRecebidoValido, ehRoboDePrevia } = await import('../leads/sla');
    const valido = Number.isInteger(id) && id > 0 && tokenRecebidoValido(id, String(req.params.token || ''));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    let leadId: number | null = null, ok = false;
    if (valido) {
      try {
        const { getDb } = await import('../db');
        const { leadEncaminhamentos } = await import('../../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const d: any = await getDb();
        const [e]: any[] = d ? await d.select().from(leadEncaminhamentos).where(eq(leadEncaminhamentos.id, id)).limit(1) : [];
        leadId = e ? Number(e.leadId) : null;
        // Encaminhamento já fechado (lead passado para outro corretor): o link não confirma mais
        if (e && (e.desfecho === 'repassado' || e.desfecho === 'sem_confirmacao')) return paginaLinkAnulado(res);
        if (e && !e.desfecho && !ehRoboDePrevia(req.get('user-agent'))) {
          if (!e.recebidoEm) await d.update(leadEncaminhamentos).set({ recebidoEm: new Date() } as any).where(eq(leadEncaminhamentos.id, id));
          ok = true;
        }
      } catch (err: any) { console.warn('[Encaminhamento] confirmar pelo link:', err?.message); }
    }
    res.status(valido ? 200 : 400).type('html').send(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
      `<title>Romatec CRM</title><body style="font-family:system-ui,sans-serif;background:#1b1e22;color:#e8ece9;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px">` +
      `<div style="max-width:360px;text-align:center"><p style="font-size:48px;margin:0">${ok ? '✅' : '⚠️'}</p>` +
      `<h1 style="font-size:20px">${ok ? 'Recebimento confirmado' : valido ? 'Não foi possível confirmar agora' : 'Link inválido'}</h1>` +
      `<p style="color:#9aa5a0">${ok ? 'O escritório já vê que você recebeu este lead. Bom atendimento!' : 'Abra Leads recebidos no CRM e toque em Confirmar.'}</p>` +
      `<p><a style="color:#5fd3b4" href="${leadId ? `/leads/lead/${leadId}` : '/leads/recebidos'}">Abrir no CRM</a></p></div></body>`,
    );
  });

  // "💬 Atender no WhatsApp" do aviso: marca o lead como atendido e abre a conversa (robô de pré-visualização não conta)
  app.get('/w/:id/:token', async (req, res) => {
    const id = Number(req.params.id);
    const { tokenAtendidoValido, registrarAtendimento, ehRoboDePrevia, linkAtendidoAindaVale } = await import('../leads/sla');
    const para = destinatarioDoLink(req);
    if (!Number.isInteger(id) || id <= 0 || !tokenAtendidoValido(id, String(req.params.token || ''), para)) return res.status(400).type('text/plain').send('Link inválido. Abra o lead no CRM.');
    if (!(await linkAtendidoAindaVale(id, para).catch(() => true))) return paginaLinkAnulado(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    let phone: string | null = null;
    if (ehRoboDePrevia(req.get('user-agent'))) {
      const { getDb } = await import('../db');
      const { leadQualifications } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const d: any = await getDb();
      const [l]: any[] = d ? await d.select({ phone: leadQualifications.phone }).from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1) : [];
      phone = l?.phone ?? null;
    } else {
      phone = (await registrarAtendimento(id, { como: 'whatsapp_aviso' }).catch(() => null))?.phone ?? null;
    }
    const fone = String(phone ?? '').replace(/\D/g, '');
    if (!fone) return res.redirect(302, `/leads/lead/${id}`);
    res.redirect(302, `https://wa.me/${fone}`);
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

      // Instagram Direct (object: "instagram"): mensagens para a caixa de entrada
      if (req.body?.object === 'instagram') {
        const { receberInstagram } = await import('../caixaEntrada');
        await receberInstagram(req.body);
        // Comentário com palavra-chave (CHÁCARA, ROTA…) → simulação no Direct
        const { responderComentarios } = await import('../instagramComentarios');
        await responderComentarios(req.body);
        return res.sendStatus(200);
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
  // Upload direto do navegador para o Cloudinary (em partes): o servidor só valida e assina — o arquivo não passa aqui
  app.post('/api/materiais/assinatura', async (req, res) => {
    try {
      const { sdk } = await import('./sdk');
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user as any).ativo === false) return res.status(401).json({ success: false, error: 'Faça login para enviar materiais' });
      const { perfilDe } = await import('../../shared/equipe');
      if (perfilDe(user as any) === 'empreendedor') return res.status(403).json({ success: false, error: 'Seu acesso não envia materiais' });
      const { assinaturaUpload } = await import('../materiaisUpload');
      const b = req.body ?? {};
      const a = await assinaturaUpload(String(b.nome ?? 'material').slice(0, 200), String(b.mime ?? ''), Number(b.tamanho) || 0);
      console.log(`[Materiais] Assinatura para ${b.nome} (${b.mime}, ${((Number(b.tamanho) || 0) / 1048576).toFixed(1)} MB) — usuário ${(user as any).id}`);
      res.json({ success: true, ...a });
    } catch (e: any) {
      if (e?.name === 'ErroUpload') return res.status(e.status).json({ success: false, error: e.message });
      if (e?.name === 'CredencialCloudinaryErro') {
        return res.status(503).json({ success: false, error: 'O armazenamento de arquivos está com a credencial do Cloudinary inválida no servidor. Avise o administrador (ele confere em romateccrm.com/api/materiais/diagnostico).' });
      }
      console.error('[Materiais] Assinatura falhou:', e?.message);
      res.status(500).json({ success: false, error: 'Não foi possível preparar o envio. Tente de novo.' });
    }
  });
  // Material no formato escolhido (feed, stories, quadrado, WhatsApp), sem o contato do escritório e com o do corretor
  app.get('/api/materiais/:id/arquivo', async (req, res) => {
    try {
      const { sdk } = await import('./sdk');
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user as any).ativo === false) return res.status(401).json({ success: false, error: 'Faça login para baixar materiais' });
      const { arquivoFormatado, formatoValido } = await import('../materiaisDownload');
      const r = await arquivoFormatado(user as any, Number(req.params.id), formatoValido(req.query.formato));
      if (r.tipo === 'gerando') return res.status(202).json({ success: true, gerando: true, segundos: r.segundos });
      const disp = (n: string) => `attachment; filename="${n}"; filename*=UTF-8''${encodeURIComponent(n)}`;
      res.setHeader('Content-Disposition', disp(r.nome));
      if (r.tipo === 'imagem') { res.type('image/jpeg'); return res.send(r.corpo); }
      res.type('video/mp4');
      return res.sendFile(r.arquivo);
    } catch (e: any) {
      const status = e?.name === 'FormatoErro' ? e.status : 500;
      if (status >= 500) console.warn('[Materiais] arquivo no formato:', e?.message);
      res.status(status).json({ success: false, error: e?.name === 'FormatoErro' ? e.message : 'Não foi possível preparar o arquivo' });
    }
  });
  // Diagnóstico das credenciais do Cloudinary (só administrador; nunca mostra o segredo)
  app.get('/api/materiais/diagnostico', async (req, res) => {
    const { sdk } = await import('./sdk');
    const user = await sdk.authenticateRequest(req).catch(() => null);
    const { perfilDe } = await import('../../shared/equipe');
    if (!user || perfilDe(user as any) !== 'admin') return res.status(404).json({ success: false });
    const { diagnostico, limparCacheCredenciais } = await import('../cloudinaryConfig');
    limparCacheCredenciais();
    const d = await diagnostico();
    // Em que cloud estão os arquivos já enviados (para saber qual é a conta certa)
    let cloudsDosMateriais: Record<string, number> = {};
    try {
      const { getDb } = await import('../db');
      const { materiais } = await import('../../drizzle/schema');
      const db: any = await getDb();
      const rows: any[] = db ? await db.select({ url: materiais.url }).from(materiais) : [];
      for (const r of rows) { const c = /res\.cloudinary\.com\/([^/]+)\//.exec(String(r.url))?.[1] ?? 'outro'; cloudsDosMateriais[c] = (cloudsDosMateriais[c] ?? 0) + 1; }
    } catch { cloudsDosMateriais = {}; }
    res.json({ success: true, ...d, cloudsDosMateriais });
  });

  app.get('/api/materiais/limites', async (req, res) => {
    const { sdk } = await import('./sdk');
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) return res.status(401).json({ success: false });
    const { limitesDoPlano } = await import('../materiaisUpload');
    const l = await limitesDoPlano();
    const mb = (x: number) => Math.floor(x / 1048576);
    res.json({ success: true, imagemMB: mb(l.imagem), videoMB: mb(l.video), pdfMB: mb(l.raw), plano: l.plano, fonte: l.fonte });
  });

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

  // Documentos e credenciais do usuário (cartão/certidão CRECI, CNAI, RG…) e foto de perfil: tudo no banco,
  // só com login, só o admin ou o próprio usuário (server/credenciais.ts, shared/cadastro.ts)
  const usuarioLogado = async (req: express.Request) => {
    const { sdk } = await import('./sdk');
    const user: any = await sdk.authenticateRequest(req).catch(() => null);
    return user && user.ativo !== false && user.ativo !== 0 ? user : null;
  };
  const alvoDoCadastro = (req: express.Request, user: any) => (req.params.id === 'me' ? user.id : Number(req.params.id) || 0);
  /** Login + permissão (admin ou o dono); responde e devolve null quando não pode */
  const autorizarCadastro = async (req: express.Request, res: express.Response) => {
    const user = await usuarioLogado(req);
    if (!user) { res.status(401).json({ success: false, error: 'Faça login' }); return null; }
    const { podeGerirCadastroDe } = await import('../../shared/cadastro');
    const alvo = alvoDoCadastro(req, user);
    if (!podeGerirCadastroDe(user, alvo)) { res.status(403).json({ success: false, error: 'Sem permissão para este cadastro' }); return null; }
    return { user, alvo };
  };
  const cabecalho = (req: express.Request, nome: string) => { const v = req.headers[nome]; return v == null || v === '' ? undefined : decodeURIComponent(String(v)); };
  const bool = (v: string | undefined) => (v === undefined ? undefined : v === '1' || v === 'true');
  const responderErro = (res: express.Response, e: any, contexto: string) => {
    const status = Number(e?.status) || 500;
    if (status >= 500) console.error(`[Credenciais] ${contexto}:`, e?.message);
    res.status(status).json({ success: false, error: status >= 500 ? 'Falha ao processar o arquivo' : e?.message });
  };
  // Documento do usuário da URL (o dono confere com a rota; o admin vê todos)
  const documentoDaRota = async (req: express.Request, res: express.Response) => {
    const ok = await autorizarCadastro(req, res);
    if (!ok) return null;
    const { documentoDe } = await import('../credenciais');
    const doc = await documentoDe(Number(req.params.docId) || 0);
    if (!doc || doc.usuarioId !== ok.alvo) { res.status(404).json({ success: false, error: 'Documento não encontrado' }); return null; }
    return { ...ok, doc };
  };

  app.post('/api/usuarios/:id/documentos', express.raw({ type: '*/*', limit: '12mb' }), async (req, res) => {
    try {
      const ok = await autorizarCadastro(req, res);
      if (!ok) return;
      const { enviarDocumento, nomeSeguro } = await import('../credenciais');
      const id = await enviarDocumento(ok.alvo, String(req.headers['x-tipo'] || 'outros'), req.body as Buffer, nomeSeguro(String(req.headers['x-file-name'] || 'documento')), {
        titular: cabecalho(req, 'x-titular') === 'conjuge' ? 'conjuge' : 'usuario',
        validade: cabecalho(req, 'x-validade') ?? null, numero: cabecalho(req, 'x-numero') ?? null,
        linkVerificacao: cabecalho(req, 'x-link-verificacao') ?? null, linkEmissao: cabecalho(req, 'x-link-emissao') ?? null,
        anexarDocumentos: bool(cabecalho(req, 'x-anexar')), exibirPerfil: bool(cabecalho(req, 'x-exibir')),
      }, ok.user.id);
      res.json({ success: true, id });
    } catch (e: any) { responderErro(res, e, 'Upload'); }
  });
  app.put('/api/usuarios/:id/documentos/:docId/arquivo', express.raw({ type: '*/*', limit: '12mb' }), async (req, res) => {
    try {
      const ok = await documentoDaRota(req, res);
      if (!ok) return;
      const { trocarArquivo, nomeSeguro } = await import('../credenciais');
      await trocarArquivo(ok.doc.id, req.body as Buffer, nomeSeguro(String(req.headers['x-file-name'] || ok.doc.nome)));
      res.json({ success: true });
    } catch (e: any) { responderErro(res, e, 'Troca de arquivo'); }
  });
  app.get('/api/usuarios/:id/documentos/:docId/pagina/:n', async (req, res) => {
    try {
      const ok = await documentoDaRota(req, res);
      if (!ok) return;
      const { paginaDoDocumento } = await import('../credenciais');
      const png = await paginaDoDocumento(ok.doc.id, Number(req.params.n) || 1);
      if (!png) return res.status(404).send('Página não encontrada');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(png);
    } catch (e: any) { responderErro(res, e, 'Página'); }
  });
  app.get('/api/usuarios/:id/documentos/:docId/thumb', async (req, res) => {
    try {
      const ok = await documentoDaRota(req, res);
      if (!ok) return;
      const { paginaDoDocumento, documentoDe } = await import('../credenciais');
      let comMiniatura = await documentoDe(ok.doc.id, { miniatura: true });
      if (!comMiniatura?.thumbBase64) {
        await paginaDoDocumento(ok.doc.id, 1).catch(() => null); // documento antigo: converte e gera a miniatura
        comMiniatura = await documentoDe(ok.doc.id, { miniatura: true });
      }
      if (!comMiniatura?.thumbBase64) return res.status(404).send('Sem miniatura');
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(comMiniatura.thumbBase64, 'base64'));
    } catch (e: any) { responderErro(res, e, 'Miniatura'); }
  });
  // Arquivo original ("Baixar original")
  app.get('/api/usuarios/documentos/:docId', async (req, res) => {
    try {
      const user = await usuarioLogado(req);
      if (!user) return res.status(401).send('Faça login para abrir o documento');
      const { documentoDe } = await import('../credenciais');
      const meta = await documentoDe(Number(req.params.docId) || 0);
      const { podeGerirCadastroDe } = await import('../../shared/cadastro');
      if (!meta || !podeGerirCadastroDe(user, meta.usuarioId)) return res.status(404).send('Documento não encontrado');
      const doc = await documentoDe(meta.id, { conteudo: true }); // o arquivo só depois de conferir a permissão
      if (!doc || !podeGerirCadastroDe(user, doc.usuarioId)) return res.status(404).send('Documento não encontrado');
      const inline = /^(application\/pdf|image\/)/.test(doc.mime || '') && req.query.baixar !== '1';
      res.setHeader('Content-Type', doc.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.nome)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      const { arquivoDoDocumento } = await import('../credenciais');
      res.send(await arquivoDoDocumento(doc));
    } catch (error: any) {
      console.error('[Usuários] Download de documento falhou:', error?.message);
      res.status(500).send('Falha ao abrir o documento');
    }
  });

  // Foto de perfil (todos os perfis): WEBP 512×512 recortado no navegador, guardado no banco
  app.post('/api/usuarios/:id/foto', express.raw({ type: '*/*', limit: '6mb' }), async (req, res) => {
    try {
      const ok = await autorizarCadastro(req, res);
      if (!ok) return;
      const { detectarMime, MAX_FOTO_BYTES } = await import('../../shared/cadastro');
      const buffer = req.body as Buffer;
      const mime = buffer?.length ? detectarMime(buffer) : null;
      if (!mime || mime === 'application/pdf') return res.status(415).json({ success: false, error: 'Envie uma foto JPG, PNG ou WEBP' });
      if (buffer.length > MAX_FOTO_BYTES) return res.status(413).json({ success: false, error: 'Foto acima de 5 MB' });
      const { getDb } = await import('../db');
      const { users, usuarioFoto } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db: any = await getDb();
      const [ja] = await db.select({ usuarioId: usuarioFoto.usuarioId }).from(usuarioFoto).where(eq(usuarioFoto.usuarioId, ok.alvo)).limit(1);
      const dados = { mime, conteudoBase64: buffer.toString('base64') };
      if (ja) await db.update(usuarioFoto).set(dados).where(eq(usuarioFoto.usuarioId, ok.alvo));
      else await db.insert(usuarioFoto).values({ usuarioId: ok.alvo, ...dados });
      const url = `/api/usuarios/${ok.alvo}/foto?v=${Date.now()}`;
      await db.update(users).set({ fotoUrl: url }).where(eq(users.id, ok.alvo));
      res.json({ success: true, url });
    } catch (error: any) {
      console.error('[Usuários] Upload de foto falhou:', error?.message);
      res.status(500).json({ success: false, error: 'Falha no upload da foto' });
    }
  });
  // Ficha de credenciamento do corretor no empreendimento (PDF com as comprovações): o próprio usuário ou o administrador
  app.get('/api/usuarios/:id/credenciamento.pdf', async (req, res) => {
    try {
      const { sdk } = await import('./sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || user.ativo === false || user.ativo === 0) return res.status(401).json({ error: 'Faça login' });
      const { podeGerirCadastroDe } = await import('../../shared/cadastro');
      const alvo = Number(req.params.id) || 0;
      if (!podeGerirCadastroDe(user, alvo)) return res.status(403).json({ error: 'Sem permissão para este cadastro' });
      const slug = typeof req.query.emp === 'string' && /^[a-z0-9-]{1,80}$/.test(req.query.emp) ? req.query.emp : 'bom-jardims';
      const { fichaCredenciamentoPdf } = await import('../credenciamento');
      const { pdf, nome } = await fichaCredenciamentoPdf(alvo, slug);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
    } catch (e: any) {
      if (e?.name === 'CredenciamentoErro') return res.status(e.status).json({ error: e.message, pendencias: e.pendencias });
      console.error('[Credenciamento] PDF:', e);
      res.status(500).json({ error: 'Falha ao gerar a ficha de credenciamento' });
    }
  });
  // QR da ficha: situação atual do credenciamento (pública, sem CPF nem documentos)
  app.get('/api/public/credenciamento/:slug/:ref', async (req, res) => {
    const { verificacaoPublica } = await import('../credenciamento');
    const r = await verificacaoPublica(String(req.params.slug).slice(0, 80), String(req.params.ref).slice(0, 40));
    res.status(r.status).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(r.html);
  });

  app.get('/api/usuarios/:id/foto', async (req, res) => {
    try {
      if (!(await usuarioLogado(req))) return res.status(401).send('Faça login');
      const { getDb } = await import('../db');
      const { usuarioFoto } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db: any = await getDb();
      const [f] = await db.select().from(usuarioFoto).where(eq(usuarioFoto.usuarioId, Number(req.params.id) || 0)).limit(1);
      if (!f) return res.status(404).send('Sem foto');
      res.setHeader('Content-Type', f.mime);
      res.setHeader('Cache-Control', 'private, max-age=86400'); // a URL muda (?v=) a cada foto nova
      res.send(Buffer.from(f.conteudoBase64, 'base64'));
    } catch {
      res.status(500).send('Falha ao abrir a foto');
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
      const { CATEGORIAS_ARQUIVO_EMPREENDIMENTO } = await import('../../shared/contratos');
      const categoria = Object.hasOwn(CATEGORIAS_ARQUIVO_EMPREENDIMENTO, String(req.headers['x-categoria'])) ? String(req.headers['x-categoria']) : 'outro';
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
    // Mesma credencial conferida dos uploads (cloudinaryConfig); sem ela, só o cloud_name das variáveis
    const { credenciais } = await import('../cloudinaryConfig');
    const cred = await credenciais().catch(() => null);
    const url = urlPdfPermitida(req.query.url, cred?.cloud ?? process.env.CLOUDINARY_CLOUD_NAME?.trim());
    if (!url) {
      return res.status(400).json({ error: "URL inválida" });
    }
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; RomatecCRM/1.0)',
        'Accept': 'application/pdf,*/*',
      };
      if (cred) {
        headers['Authorization'] = `Basic ${Buffer.from(`${cred.key}:${cred.secret}`).toString('base64')}`;
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

      const prop = await db.select({ plantaBaixaUrl: properties.plantaBaixaUrl, plantaRef: properties.plantaRef }).from(properties).where(eq(properties.id, Number(id))).limit(1);
      if (!prop[0] || !prop[0].plantaBaixaUrl) {
        return res.status(404).json({ error: "Planta baixa não encontrada" });
      }

      // Planta no armazém (server/arquivos/planta.ts)
      if (prop[0].plantaRef) {
        const { lerConteudo } = await import('../arquivos/armazem');
        const buffer = await lerConteudo(null, prop[0].plantaRef);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="planta.pdf"');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
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

  // Bloco Financeiro: boletos, carnê, 2ª via, recibos, declaração, verificação pública (/r/:numero) e webhook do Asaas
  const { registrarRotasFinanceiro } = await import('../financeiro/rotas');
  registrarRotasFinanceiro(app);
  const { registrarRotasReunioes } = await import('../reunioes/rotas');
  registrarRotasReunioes(app);
  const { registrarRotaEspaco } = await import('../sistema/espaco');
  registrarRotaEspaco(app);
  const { registrarRotasRecrutamento } = await import('../recrutamento/rotas');
  registrarRotasRecrutamento(app);

  // Enviar arquivo pelo WhatsApp do CRM (Configurações) — só o administrador; corpo = arquivo
  app.post('/api/whatsapp/enviar-arquivo', express.raw({ type: '*/*', limit: '16mb' }), async (req, res) => {
    try {
      const { sdk } = await import('./sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      const { perfilDe } = await import('../../shared/equipe');
      if (!user || perfilDe(user) !== 'admin') return res.status(403).json({ ok: false, error: 'Só o administrador envia arquivos pelo WhatsApp do sistema.' });
      const h = (k: string) => (typeof req.headers[k] === 'string' ? decodeURIComponent(String(req.headers[k])) : '');
      const { enviarArquivoWhatsapp } = await import('../whatsapp/enviarArquivo');
      const r = await enviarArquivoWhatsapp({
        telefone: h('x-telefone'), nome: h('x-nome-arquivo'), legenda: h('x-legenda'),
        buf: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), autorId: user.id,
      });
      res.json(r);
    } catch (e: any) {
      if (e?.name === 'EnvioArquivoErro') return res.status(e.status).json({ ok: false, error: e.message });
      if (e?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Arquivo acima de 15 MB' });
      console.error('[WhatsApp] envio de arquivo:', e?.message);
      res.status(500).json({ ok: false, error: 'Não foi possível enviar agora.' });
    }
  });
  const { registrarRotasContratos } = await import('../contratos/rotas');
  registrarRotasContratos(app);
  // Cartão de vendas público dos links de divulgação (?c=<ref>): contato de quem compartilhou
  app.get('/api/cartao/:ref', async (req, res) => {
    try {
      const { cartaoDaRef } = await import('../cartaoVendas');
      const c = await cartaoDaRef(String(req.params.ref));
      if (!c) return res.status(404).json({ erro: 'não encontrado' });
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(c);
    } catch { res.status(500).json({ erro: 'falha' }); }
  });
  // Assinatura eletrônica (links individuais, sem login) e verificação pública do contrato (/c/v/:codigo)
  const { registrarRotasAssinatura } = await import('../assinatura/rotas');
  registrarRotasAssinatura(app);

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
    // Projeto V2 do Bom Jardims (portal/administração na entrada, A02 desmembrado): aplicado uma vez
    const { aplicarProjetoV2BomJardims, ajustarJuridicoV2BomJardims } = await import('./migrations/bomJardimsProjetoV2');
    await aplicarProjetoV2BomJardims().catch((e: any) => console.error('[Bom Jardims V2] não aplicado:', e?.message));
    await ajustarJuridicoV2BomJardims().catch((e: any) => console.error('[Bom Jardims V2] configuração jurídica:', e?.message));
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
    const { addMaterialUso } = await import('./migrations/addMaterialUso');
    await addMaterialUso();
    const { addSolicitacaoAcesso } = await import('./migrations/addSolicitacaoAcesso');
    await addSolicitacaoAcesso();
    const { addCobrancaAvisos } = await import('./migrations/addCobrancaAvisos');
    await addCobrancaAvisos();
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
    const { addMensagensAgendamento } = await import('./migrations/addMensagensAgendamento');
    await addMensagensAgendamento();
    const { addReunioes } = await import('./migrations/addReunioes');
    await addReunioes();
    const { addRecrutamento } = await import('./migrations/addRecrutamento');
    await addRecrutamento();
    const { addSaas } = await import('./migrations/addSaas');
    await addSaas();
    const { addAutoResposta } = await import('./migrations/addAutoResposta');
    await addAutoResposta();
    const { addCheckinEvento } = await import('./migrations/addCheckinEvento');
    await addCheckinEvento();
    const { addEmissaoAuto } = await import('./migrations/addEmissaoAuto');
    await addEmissaoAuto();
    // Mesma pessoa em dois leads (celular com e sem o 9): junta no mais antigo
    const { mesclarLeadsDuplicados } = await import('../leads/mesclarDuplicados');
    await mesclarLeadsDuplicados().then(r => r.apagados && console.log(`[Leads] ${r.apagados} lead(s) duplicado(s) juntado(s)`)).catch((e: any) => console.warn('[Leads] junção de duplicados:', e?.message));
    const { addDesfechoEncaminhamento } = await import('./migrations/addDesfechoEncaminhamento');
    await addDesfechoEncaminhamento().catch((e: any) => console.warn('[Migration] addDesfechoEncaminhamento:', e?.message));
    const { addMateriaisDivulgacaoBJ } = await import('./migrations/addMateriaisDivulgacaoBJ');
    await addMateriaisDivulgacaoBJ().catch((e: any) => console.warn('[Migration] addMateriaisDivulgacaoBJ:', e?.message));
    const { addDespesas } = await import('./migrations/addDespesas');
    await addDespesas();
    const { reajustePrecos20261027 } = await import('./migrations/reajustePrecos20261027');
    await reajustePrecos20261027();
    const { addControleLotes } = await import('./migrations/addControleLotes');
    await addControleLotes();
    // Fotos do drone de 28/10/2026 no Andamento da obra (uma vez só)
    const { obraBomJardims20261028 } = await import('./migrations/obraBomJardims20261028');
    await obraBomJardims20261028().catch((e: any) => console.warn('[Migration] obra 28/10:', e?.message));
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

  try {
    const { addCadastroUsuarios } = await import('./migrations/addCadastroUsuarios');
    await addCadastroUsuarios();
  } catch (e) {
    console.error('❌ Erro na migration addCadastroUsuarios:', e);
  }

  try {
    const { addCadastroV2 } = await import('./migrations/addCadastroV2');
    await addCadastroV2();
  } catch (e) {
    console.error('❌ Erro na migration addCadastroV2:', e);
  }

  try {
    const { addReleases } = await import('./migrations/addReleases');
    await addReleases();
    // Notas de versão: grava no banco a versão do RELEASE_NOTES.md (todos recebem o "Novidades da versão")
    const { importarReleaseNotes } = await import('../releases');
    await importarReleaseNotes();
  } catch (e) {
    console.error('❌ Erro na migration addReleases / notas de versão:', e);
  }

  try {
    const { addNotificacoes } = await import('./migrations/addNotificacoes');
    await addNotificacoes();
    // Versão nova no ar: "Sistema atualizado para vX.Y.Z" no sininho (e push) de todos — uma vez por versão
    const { notificarAtualizacaoSistema } = await import('../notificacoes');
    const { infoVersao } = await import('./systemRouter');
    await notificarAtualizacaoSistema(infoVersao().versao);
    // Novidade do empreendimento: plano de pagamento mudou desde a última subida → corretores e empreendedor
    await (await import('../avisosEmpreendimento')).avisarMudancaDeCondicoes().catch((err: any) => console.warn('[Avisos] condições:', err?.message));
    // Aviso único da novidade "play nos vídeos de Materiais" (chave por empreendimento: não repete)
    await (await import('../avisosEmpreendimento')).avisarPlayerDeVideos().catch((err: any) => console.warn('[Avisos] player:', err?.message));
    await (await import('../avisosEmpreendimento')).avisarCarrosselDeFotos().catch((err: any) => console.warn('[Avisos] carrossel:', err?.message));
  } catch (e) {
    console.error('❌ Erro na migration addNotificacoes / aviso de versão:', e);
  }

  try {
    const { addContratos } = await import('./migrations/addContratos');
    await addContratos();
    const { addFinanceiro } = await import('./migrations/addFinanceiro');
    await addFinanceiro();
    const { addPagamentosManuais } = await import('./migrations/addPagamentosManuais');
    await addPagamentosManuais();
    const { addAssinatura } = await import('./migrations/addAssinatura');
    await addAssinatura();
    const { addObjetivoProspecto } = await import('./migrations/addObjetivoProspecto');
    await addObjetivoProspecto();
    const { addGestao } = await import('./migrations/addGestao');
    await addGestao();
    const { ajustarAgrimensura850 } = await import('../gestao/servico');
    await ajustarAgrimensura850().catch((e: any) => console.warn('[Gestão] ajuste da agrimensura:', e?.message));
    const { ajustarConcessoesAvista } = await import('../lotes/concessao');
    await ajustarConcessoesAvista().catch((e: any) => console.warn('[Concessão] ajuste à vista:', e?.message));
    const { limparAvisosPrivativos } = await import('../notificacoes');
    await limparAvisosPrivativos().catch((e: any) => console.warn('[Notificações] limpeza de avisos privativos:', e?.message));
    const { addCancelamento } = await import('./migrations/addCancelamento');
    await addCancelamento();
  } catch (e) {
    console.error('❌ Erro na migration addContratos/addFinanceiro:', e);
  }
  // Parcelas pagas sem recibo (tabela "recibos" era da ZAYRA até a v1.30.5): emite os que faltam, sem enviar
  import('../financeiro/servico').then(m => m.emitirRecibosPendentes())
    .then(r => { if (r.emitidos.length || r.falhas) console.log(`[Financeiro] recibos pendentes: ${r.emitidos.length} emitido(s) ${r.emitidos.join(', ')} · ${r.falhas} falha(s)`); })
    .catch(e => console.warn('[Financeiro] recibos pendentes:', e?.message));

  // Leads parados há 48 h perdem pontos no score (§8)
  import('../leads/scoreService').then(m => m.iniciarJobInatividade()).catch(e => console.warn('[Score] Job não iniciado:', e));
  // IPCA mensal (dia 15) e declaração anual de quitação (2º dia útil de maio)
  import('../financeiro/jobs').then(m => m.iniciarJobsFinanceiro()).catch(e => console.warn('[Financeiro] Jobs não iniciados:', e));
  // Resumo da semana no WhatsApp do administrador (segunda, a partir das 8h)
  import('../resumoSemanal').then(m => m.iniciarResumoSemanal()).catch(e => console.warn('[Resumo semanal] não iniciado:', e));
  // Régua de cobrança das parcelas no WhatsApp do comprador (só roda se estiver ligada em Financeiro)
  import('../financeiro/reguaCobranca').then(m => m.iniciarReguaCobranca()).catch(e => console.warn('[Régua de cobrança] não iniciada:', e));
  // Emissão automática no Asaas: próximo carnê 45 dias antes (só roda se estiver ligada em Financeiro)
  import('../financeiro/emissaoAuto').then(m => m.iniciarEmissaoAuto()).catch(e => console.warn('[Emissão automática] não iniciada:', e));
  // Confirmação de pagamento no WhatsApp: reenvia o que não foi entregue (WhatsApp fora do ar), por até 3 dias
  import('../arquivos/migrarArmazem').then(m => m.iniciarArmazem()).catch(e => console.warn('[Armazém] não iniciado:', e));
  import('../financeiro/painel').then(m => m.iniciarFotoDaPosicao()).catch(e => console.warn('[Painel financeiro] foto da posição não iniciada:', e));
  import('../financeiro/confirmacaoPagamento').then(m => m.iniciarVigiaConfirmacoes()).catch(e => console.warn('[Confirmação de pagamento] vigia não iniciado:', e));
  // Camada SaaS: expirações, inadimplência e lembretes (só age com o licenciamento ligado)
  import('../saas/servico').then(m => m.iniciarJobsSaas()).catch(e => console.warn('[SaaS] Jobs não iniciados:', e));
  // Mercado Pago: retry dos eventos do webhook e faturas Pix/boleto do próximo ciclo
  import('../saas/cobranca').then(m => m.iniciarJobsCobranca()).catch(e => console.warn('[MP] Jobs não iniciados:', e));
  // Follow-up persistente (1/3/7/14/30 dias) e prazo de atendimento — não dependem das campanhas
  import('../leads/followup').then(m => m.iniciarJobFollowUp()).catch(e => console.warn('[FollowUp] Job não iniciado:', e));
  // Régua do robô de respostas automáticas (24 h, 72 h, 7 dias) — só age em leads de empreendimento com o robô ligado
  import('../autoresposta/motor').then(m => m.iniciarJobRegua()).catch(e => console.warn('[Auto-resposta] Régua não iniciada:', e));
  import('../leads/sla').then(m => m.iniciarJobSla()).catch(e => console.warn('[SLA] Job não iniciado:', e));
  // Agenda de visitas: lembrete ao cliente, aviso ao corretor e pedido de resultado
  import('../leads/visitas').then(m => m.iniciarJobVisitas()).catch(e => console.warn('[Visitas] Job não iniciado:', e));
  // Credenciais CRECI: alerta de vencimento pelo WhatsApp (08:00, a cada 2 dias até regularizar)
  import('../credenciais').then(m => m.iniciarJobCredenciais()).catch(e => console.warn('[Credenciais] Job não iniciado:', e));
  // Vigia: avisa no Telegram se o follow-up ou o alerta de atendimento pararem
  import('../leads/rotinas').then(m => m.iniciarVigiaRotinas()).catch(e => console.warn('[Rotinas] Vigia não iniciado:', e));

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Encerramento controlado: o deploy do Railway manda SIGTERM; para de aceitar requisições, espera as em curso e fecha o pool
  let encerrando = false;
  const encerrar = (sinal: string) => {
    if (encerrando) return; encerrando = true;
    console.log(`[Servidor] ${sinal} recebido: encerrando`);
    const limite = setTimeout(() => process.exit(0), 10_000); limite.unref();
    server.close(async () => {
      const { fecharDb } = await import('../db');
      await fecharDb();
      process.exit(0);
    });
  };
  process.once('SIGTERM', () => encerrar('SIGTERM'));
  process.once('SIGINT', () => encerrar('SIGINT'));

  // Vigia do pool: registra no log quando requisições precisaram esperar conexão (sinal de saturação ou consulta lenta)
  setInterval(async () => {
    const { situacaoPool } = await import('../db');
    const p = situacaoPool();
    if (p.esperas || p.fila) console.warn(`[Database] pool cheio: ${p.esperas ?? 0} requisição(ões) esperaram conexão nos últimos 30 s; agora ${p.emUso}/${p.limite} em uso, ${p.fila} na fila`);
  }, 30_000).unref();

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
