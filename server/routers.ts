import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { getAllContacts, getContactById, createContact, getAllProperties, getPropertyById, createProperty, getAllCampaigns, getCampaignById, createCampaign, getCompanyConfig, updateCompanyConfig, getDb } from "./db";
import { campaigns, contacts, campaignContacts, messages, properties, contactCampaignHistory, users, leadQualifications, schedulerState } from "../drizzle/schema";
import { eq, and, desc, gte, or, like, isNotNull } from "drizzle-orm";
import { campaignScheduler } from "./scheduler/campaignScheduler";
import { zairaRouter } from "./routers/zaira.router";
import { leadCampanhasRouter } from "./routers/leadCampanhas.router";
import { crmRouter } from "./routers/crm.router";
import { materiaisRouter } from "./routers/materiais.router";
import { equipeRouter } from "./routers/equipe.router";
import { empreendedorRouter } from "./routers/empreendedor.router";
import { empreendimentosAdminRouter } from "./routers/empreendimentosAdmin.router";
import { simuladorRouter } from "./routers/simulador.router";
import { financeiroRouter } from "./routers/financeiro.router";
import { reunioesRouter } from "./routers/reunioes.router";
import { recrutamentoRouter } from "./routers/recrutamento.router";
import { saasRouter } from "./routers/saas.router";
import { reservasRouter } from "./routers/reservas.router";
import { convitesRouter } from "./routers/convites.router";
import { exclusaoRouter } from "./routers/exclusao.router";
import { rankingRouter } from "./routers/ranking.router";
import { linksDivulgacaoRouter } from "./routers/linksDivulgacao.router";
import { portalCompradorRouter } from "./routers/portalComprador.router";
import { autoRespostaRouter } from "./routers/autoResposta.router";
import { verComoRouter } from "./routers/verComo.router";
import { contatosNomesRouter } from "./routers/contatosNomes.router";
import { contratosRouter, pessoaZ } from "./routers/contratos.router";
import { permissoesRouter } from "./routers/permissoes.router";
import { cadastroRouter } from "./routers/cadastro.router";
import { novidadesRouter } from "./routers/novidades.router";
import { notificacoesRouter } from "./routers/notificacoes.router";
import { exigirAcesso, exigirLead, leadsVisiveis } from "./permissoes";
import { acessosCorretor } from "../drizzle/schema";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRateLimiter } from "./lead-intake";
import { publicCompanyConfig, stripMaskedFields } from "./auth-security";

const allowLoginAttempt = createRateLimiter(10, 15 * 60 * 1000);

/** Corretor: só os leads em que é o responsável (null = sem filtro: admin e secretário) */
const soDele = (ctx: { user: { id: number }; permissoes: { perfil: string | null } }) => (ctx.permissoes.perfil === "corretor" ? ctx.user.id : null);

/** Lead por id, recusando (403) o lead de outro responsável para o corretor */
async function leadDoUsuario(id: number, ctx: { user: { id: number }; permissoes: any }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1);
  if (!lead) throw new Error("Lead não encontrado");
  exigirLead(ctx.permissoes, ctx.user.id, lead as any);
  return lead;
}

/** Ficha, edição e exclusão de um cliente: admin e secretário; corretor só o cliente de um lead em que é o responsável (pelo telefone) */
async function exigirContato(id: number, ctx: { user: { id: number }; permissoes: { perfil: string | null } }) {
  const perfil = ctx.permissoes.perfil;
  if (perfil === "admin" || perfil === "secretario") return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const final11 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-11);
  const [c] = await db.select({ phone: contacts.phone }).from(contacts).where(eq(contacts.id, id)).limit(1);
  const meus = perfil === "corretor" && c ? await db.select({ phone: leadQualifications.phone }).from(leadQualifications).where(eq(leadQualifications.responsavelId, ctx.user.id)) : [];
  if (!c || !final11(c.phone) || !meus.some((l: { phone: string }) => final11(l.phone) === final11(c.phone))) throw new TRPCError({ code: "FORBIDDEN", message: "Este cliente é de um lead de outro responsável." });
}

/** exibirPreco = false: visitante não recebe preço nem preço de oferta */
function semPrecoSeOculto<T extends Record<string, any>>(p: T, logado: boolean): T {
  if (logado || p.exibirPreco !== false) return p;
  return { ...p, price: null, offerPrice: null };
}

/** Filtro da lista de leads (tabela, PDF e envio pelo WhatsApp) */
const filtroListaLeads = z.object({
  situacao: z.enum(['ativos', 'descartados', 'todos']).optional().default('ativos'),
  origem: z.string().trim().max(200).optional(),
  search: z.string().trim().max(100).optional(),
});

export const appRouter = router({
  zaira: zairaRouter,
  leadCampanhas: leadCampanhasRouter,
  crm: crmRouter,
  materiais: materiaisRouter,
  equipe: equipeRouter,
  empreendedor: empreendedorRouter,
  empreendimentosAdmin: empreendimentosAdminRouter,
  simulador: simuladorRouter,
  financeiro: financeiroRouter,
  reunioes: reunioesRouter,
  recrutamento: recrutamentoRouter,
  saas: saasRouter,
  reservas: reservasRouter,
  convites: convitesRouter,
  exclusao: exclusaoRouter,
  ranking: rankingRouter,
  linksDivulgacao: linksDivulgacaoRouter,
  portalComprador: portalCompradorRouter,
  autoResposta: autoRespostaRouter,
  verComo: verComoRouter,
  contatosNomes: contatosNomesRouter,
  contratos: contratosRouter,
  permissoes: permissoesRouter,
  cadastro: cadastroRouter,
  novidades: novidadesRouter,
  notificacoes: notificacoesRouter,
  system: systemRouter,
  auth: router({
    // Sem os hashes de senha (a linha do usuário inteira ia para o navegador)
    me: publicProcedure.query(async opts => {
      if (!opts.ctx.user) return opts.ctx.user;
      // Acesso desativado na tela Equipe = deslogado
      if ((opts.ctx.user as any).ativo === false || (opts.ctx.user as any).ativo === 0) return null;
      const { passwordScrypt: _s, passwordHash: _h, conviteHash: _c, ...safe } = opts.ctx.user as any;
      // Camada SaaS: situação da licença (banner do teste e redirecionamento para /assinatura)
      const { resumoLicenca } = await import("./saas/servico");
      const licenca = await resumoLicenca(opts.ctx.user).catch(() => null);
      // "Ver como" do administrador: a tela mostra a faixa "vendo como … · só leitura"
      const verComo = opts.ctx.verComo ? { adminNome: opts.ctx.verComo.adminNome } : null;
      return { ...safe, licenca, verComo } as Omit<typeof opts.ctx.user, 'passwordScrypt' | 'passwordHash'> & { licenca: Awaited<ReturnType<typeof resumoLicenca>> | null; verComo: { adminNome: string } | null };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          // 10 tentativas a cada 15 min por IP (atrás do proxy do Railway: último IP do x-forwarded-for)
          const fwd = String(ctx.req.headers['x-forwarded-for'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
          const ip = fwd[fwd.length - 1] || ctx.req.socket?.remoteAddress || 'unknown';
          if (!allowLoginAttempt(ip)) throw new Error("Muitas tentativas. Aguarde 15 minutos e tente de novo.");

          const db = await getDb();
          if (!db) throw new Error("Database not available");
          const username = input.username.trim();
          // Colaboradores entram com o CRECI ou o CPF (secretário/empreendedor não têm CRECI); e-mail continua valendo
          const { normalizarCreci, tipoLogin, perfilDe, telaInicial } = await import("@shared/equipe");
          const { cpfValido, soDigitos } = await import("@shared/cadastro");
          const tipo = tipoLogin(username);
          let userList: any[] = tipo === 'cpf' && cpfValido(username) ? await db.select().from(users).where(eq(users.cpf, soDigitos(username))).limit(1) : [];
          // 11 dígitos também pode ser CRECI longo: se não achou pelo CPF, tenta o CRECI
          const creci = tipo !== 'email' ? normalizarCreci(username) : null;
          if (!userList[0] && creci) userList = await db.select().from(users).where(eq(users.creci, creci)).limit(1);
          if (!userList[0]) userList = await db.select().from(users).where(eq(users.email, username)).limit(1);
          if (!userList[0]) {
            userList = await db.select().from(users).where(eq(users.openId, username)).limit(1);
          }
          const user = userList[0];
          // Mesma mensagem para usuário inexistente, desativado e senha errada (não revela quem existe)
          if (!user || (user as any).ativo === false || (user as any).ativo === 0) throw new Error("Usuário ou senha incorretos.");

          const { checkLogin } = await import("./auth-security");
          // Senha inicial do Railway (CRM_INITIAL_PASSWORD) só serve para o administrador;
          // colaborador sem senha usa o link de primeiro acesso
          const check = await checkLogin(
            input.password,
            { scryptHash: user.passwordScrypt, legacySha256: user.passwordHash },
            user.role === 'admin' ? process.env.CRM_INITIAL_PASSWORD : undefined,
          );
          if (!check.ok) {
            if (check.reason === 'no_password_set') {
              if (user.role !== 'admin') throw new Error("Você ainda não criou sua senha. Use o link de primeiro acesso que recebeu.");
              console.warn(`[Login] Usuário ${user.id} sem senha cadastrada e CRM_INITIAL_PASSWORD ausente`);
              throw new Error("Senha ainda não cadastrada. Defina CRM_INITIAL_PASSWORD no Railway para o primeiro acesso.");
            }
            throw new Error("Usuário ou senha incorretos.");
          }
          // Senha provisória (recrutamento): vence em senhaProvisoriaExpira; no 1º login vai direto para "Criar sua senha"
          const provisoria = !!(user as any).trocarSenha;
          if (provisoria && (user as any).senhaProvisoriaExpira && new Date((user as any).senhaProvisoriaExpira).getTime() < Date.now()) {
            throw new Error("Sua senha provisória venceu. Peça uma nova à Romatec pelo WhatsApp.");
          }
          if (check.setPasswordHash) {
            await db.update(users).set({ passwordScrypt: check.setPasswordHash, passwordHash: null }).where(eq(users.id, user.id));
          }
          const { sdk } = await import("./_core/sdk");
          const { ONE_YEAR_MS } = await import("@shared/const");
          const cookieOptions = getSessionCookieOptions(ctx.req);
          const token = await sdk.createSessionToken(user.openId, { name: user.name || "", sessaoVersao: Number((user as any).sessaoVersao) || 0 });
          ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
          // Camada SaaS: 1º login do corretor com o licenciamento ligado inicia o teste de 7 dias (um por CPF)
          try {
            const S = await import("./saas/servico");
            await S.auditar(user.id, "LOGIN", null, ip);
            await S.iniciarTrialSeNecessario(user, ip);
          } catch (e: any) { console.warn("[SaaS] trial no login:", e?.message); }
          return { success: true, destino: provisoria ? "/trocar-senha" : telaInicial(perfilDe(user as any)) };
        } catch (error) {
          console.error("[Login] Erro:", (error as any)?.message || error);
          throw error;
        }
      }),
    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().max(200) }))
      .mutation(async ({ input, ctx }) => {
        const { checkLogin, hashPassword, passwordProblem } = await import("./auth-security");
        const problem = passwordProblem(input.newPassword);
        if (problem) throw new Error(problem);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const [user] = await db.select().from(users).where(eq(users.openId, ctx.user.openId)).limit(1);
        if (!user) throw new Error("Usuário não encontrado");
        const check = await checkLogin(input.currentPassword, { scryptHash: user.passwordScrypt, legacySha256: user.passwordHash });
        if (!check.ok) throw new Error("Senha atual incorreta.");
        if (input.newPassword === input.currentPassword) throw new Error("A senha nova precisa ser diferente da atual.");
        await db.update(users).set({ passwordScrypt: await hashPassword(input.newPassword), passwordHash: null, trocarSenha: false, senhaProvisoriaExpira: null } as any).where(eq(users.id, user.id));
        const { perfilDe: perfil, telaInicial: inicio } = await import("@shared/equipe");
        return { success: true, destino: inicio(perfil(user as any)) };
      }),
  }),
  contacts: router({
    list: protectedProcedure.query(async () => getAllContacts()),
    /** Ficha completa do cliente (mesma de comprador nos contratos), ligada pelo telefone */
    cadastro: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ input, ctx }) => {
      await exigirContato(input.id, ctx);
      const { cadastroDoContato, CadastroErro } = await import('./contatosCadastro');
      try { return await cadastroDoContato(input.id); } catch (e: any) { if (e instanceof CadastroErro) throw new TRPCError({ code: 'NOT_FOUND', message: e.message }); throw e; }
    }),
    /** Novo/editar contato com o cadastro completo (com CPF, grava a ficha da pessoa) */
    salvarCompleto: protectedProcedure.input(z.object({ id: z.number().int().nullable(), pessoa: pessoaZ })).mutation(async ({ input, ctx }) => {
      if (input.id != null) await exigirContato(input.id, ctx); // criar cliente novo continua aberto ao corretor
      const { salvarContatoCompleto, CadastroErro } = await import('./contatosCadastro');
      try { return await salvarContatoCompleto(input.id, input.pessoa as any); } catch (e: any) { if (e instanceof CadastroErro) throw new TRPCError({ code: 'BAD_REQUEST', message: e.message }); throw e; }
    }),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => { await exigirContato(input.id, ctx); return getContactById(input.id); }),
    create: protectedProcedure
      .input(z.object({ 
        name: z.string().min(1), 
        phone: z.string().min(2), 
        email: z.string().email().optional() 
      }))
      .mutation(async ({ input }) => createContact({ 
        name: input.name, 
        phone: input.phone, 
        email: input.email, 
        status: "active" 
      })),
    update: protectedProcedure
      .input(z.object({ 
        id: z.number(), 
        name: z.string().optional(), 
        phone: z.string().optional(), 
        email: z.string().email().optional(), 
        status: z.enum(["active", "inactive", "blocked"]).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        await exigirContato(input.id, ctx);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...data } = input;
        const updateData: any = {};
        Object.entries(data).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(contacts).set(updateData).where(eq(contacts.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await exigirContato(input.id, ctx);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(messages).where(eq(messages.contactId, input.id));
        await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.contactId, input.id));
        await db.delete(campaignContacts).where(eq(campaignContacts.contactId, input.id));
        await db.delete(contacts).where(eq(contacts.id, input.id));
        return { success: true };
      }),
    importBatch: protectedProcedure
      .input(z.array(z.object({ 
        name: z.string().min(1), 
        phone: z.string().min(2), 
        email: z.string().email().optional()
      })))
      .mutation(async ({ input, ctx }) => {
        if (ctx.permissoes.perfil !== "admin" && ctx.permissoes.perfil !== "secretario") throw new TRPCError({ code: "FORBIDDEN", message: "Importar contatos é do escritório." });
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const results = [];
        for (const contact of input) {
          try {
            await createContact({ 
              name: contact.name, 
              phone: contact.phone, 
              email: contact.email, 
              status: "active" 
            });
            results.push({ success: true, ...contact });
          } catch (error) {
            results.push({ success: false, ...contact, error: String(error) });
          }
        }
        return results;
      }),
  }),
  empreendimentos: router({
    // Público: lotes com status ao vivo. Preço só sai quando precosPublicos = true.
    publicBySlug: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(80) }))
      .query(async ({ input, ctx }) => {
        const { getEmpreendimentoPublico } = await import("./empreendimentos");
        return getEmpreendimentoPublico(input.slug);
      }),
  }),

  properties: router({
    // Público: imóvel com exibirPreco = false sai sem preço ("Valor sob consulta"); logado vê tudo
    list: publicProcedure.query(async ({ ctx }) => (await getAllProperties()).map((p: any) => semPrecoSeOculto(p, !!ctx.user))),
    getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const p = await getPropertyById(input.id);
      return p ? semPrecoSeOculto(p, !!ctx.user) : p;
    }),
    getBySlug: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(properties).where(eq(properties.publicSlug, input.slug)).limit(1);
      return result[0] ? semPrecoSeOculto(result[0], !!ctx.user) : null;
    }),
    // Landing /i/:codigo (pública)
    byCodigo: publicProcedure.input(z.object({ codigo: z.string().regex(/^IMV-\d{4}$/i) })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [p] = await db.select().from(properties).where(eq(properties.codigo, input.codigo.toUpperCase())).limit(1);
      if (!p || p.status === "inactive") return null;
      const { numeroWhatsAppLeads } = await import("./leads/config");
      return { ...semPrecoSeOculto(p, false), whatsappNumero: numeroWhatsAppLeads() };
    }),
    create: protectedProcedure
      .input(z.object({
        denomination: z.string().min(1),
        address: z.string().min(1),
        city: z.string().optional(),
        state: z.string().optional(),
        cep: z.string().optional(),
        price: z.string().min(1),
        offerPrice: z.string().optional(),
        areaConstruida: z.coerce.number().optional(),
        areaTotal: z.coerce.number().optional(),
        bedrooms: z.coerce.number().optional(),
        bathrooms: z.coerce.number().optional(),
        description: z.string().optional(),
        finalidade: z.enum(["venda", "aluguel"]).default("venda"),
        status: z.enum(["available", "unavailable"]).default("available"),
        exibirPreco: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const slug = input.denomination.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const result = await db.insert(properties).values({
          ...input,
          price: input.price as any,
          offerPrice: input.offerPrice as any || null,
          areaConstruida: input.areaConstruida as any || null,
          areaTotal: input.areaTotal as any || null,
          publicSlug: slug
        });
        const propertyId = Number((result as any)[0].insertId);
        // Código de atribuição IMV-xxxx (vai na mensagem pré-preenchida do WhatsApp)
        try {
          const { formatCodigoImovel } = await import("./_core/migrations/addLeadsV1");
          await db.update(properties).set({ codigo: formatCodigoImovel(propertyId) }).where(eq(properties.id, propertyId));
        } catch (e) {
          console.warn("[Properties] Código IMV não gravado:", e);
        }
        // Corretor que cadastrou fica habilitado no imóvel (segue editando o que ele mesmo inseriu)
        if (ctx.permissoes.perfil === "corretor") {
          await db.insert(acessosCorretor).values({ usuarioId: ctx.user.id, tipo: "imovel", refId: propertyId, habilitadoPor: ctx.user.id } as any).catch(() => {});
        }
        // Criar campanha automaticamente para o novo imóvel
        try {
          const defaultMessages = [
            `Olá! Temos uma ótima oportunidade em ${input.denomination}. Gostaria de conhecer mais? 🏠`,
            `Vimos que você pode estar interessado em ${input.denomination}. Vamos conversar? 📞`,
            `Oportunidade especial em ${input.denomination}. Clique para saber mais! ✨`
          ];
          await db.insert(campaigns).values({
            propertyId,
            name: input.denomination,
            messageVariations: JSON.stringify(defaultMessages),
            totalContacts: 2,
            sentCount: 0,
            failedCount: 0,
            status: "paused",
            messagesPerHour: 1
          });
        } catch (campErr) {
          console.warn('[Properties] Aviso: não foi possível criar campanha automática:', campErr);
        }
        return { id: propertyId, slug };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        denomination: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        cep: z.string().optional(),
        price: z.string().optional(),
        offerPrice: z.string().optional(),
        areaConstruida: z.coerce.number().optional(),
        areaCasa: z.coerce.number().optional(),
        areaTerreno: z.coerce.number().optional(),
        areaTotal: z.coerce.number().optional(),
        bedrooms: z.coerce.number().optional(),
        bathrooms: z.coerce.number().optional(),
        garageSpaces: z.coerce.number().optional(),
        propertyType: z.string().optional(),
        description: z.string().optional(),
        images: z.array(z.string()).optional(),
        videoUrl: z.string().optional(),
        plantaBaixaUrl: z.string().optional(),
        finalidade: z.enum(["venda", "aluguel"]).optional(),
        status: z.enum(["available", "unavailable"]).optional(),
        exibirPreco: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        exigirAcesso(ctx.permissoes, "imovel", input.id);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { id, ...data } = input;
        const updateData: any = {};
        Object.entries(data).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(properties).set(updateData).where(eq(properties.id, id));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        exigirAcesso(ctx.permissoes, "imovel", input.id);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const relatedCampaigns = await db.select().from(campaigns).where(eq(campaigns.propertyId, input.id));
        for (const camp of relatedCampaigns) {
          await db.delete(messages).where(eq(messages.campaignId, camp.id));
          await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, camp.id));
          await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
        }
        await db.delete(messages).where(eq(messages.propertyId, input.id));
        await db.delete(campaigns).where(eq(campaigns.propertyId, input.id));
        await db.delete(properties).where(eq(properties.id, input.id));
        return { success: true };
      }),
    generateDescription: protectedProcedure
      .input(z.object({ 
        denomination: z.string(), 
        address: z.string(), 
        city: z.string().optional(), 
        price: z.string(), 
        offerPrice: z.string().optional(), 
        areaConstruida: z.coerce.number().optional(),
        bedrooms: z.coerce.number().optional(),
        bathrooms: z.coerce.number().optional()
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const prompt = `Gere uma descricao atrativa para o imovel: ${input.denomination} em ${input.address}, R$ ${Number(input.price).toLocaleString('pt-BR')}. Use gatilhos de escassez e urgÔö£┬¼ncia.`;
        const response = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
        const descContent = response.choices[0]?.message?.content;
        return { description: typeof descContent === 'string' ? descContent : 'Descricao nao gerada' };
      }),
    generateWhatsAppMessage: protectedProcedure
      .input(z.object({ propertyId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        exigirAcesso(ctx.permissoes, "imovel", input.propertyId);
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const prop = await db.select().from(properties).where(eq(properties.id, input.propertyId)).limit(1);
        if (!prop[0]) throw new Error("Imovel nao encontrado");
        const p = prop[0];
        const { invokeLLM } = await import("./_core/llm");
        const response = await invokeLLM({ 
          messages: [{ 
            role: "user", 
            content: `Gere 4 variacoes de mensagem WhatsApp para: ${p.denomination} em ${p.address}, R$ ${Number(p.price).toLocaleString('pt-BR')}. Separe com |||` 
          }] 
        });
        const text = typeof response.choices[0]?.message?.content === 'string' ? response.choices[0].message.content : '';
        const variations = text.split('|||').map((v: string) => v.trim()).filter(Boolean);
        return { variations: variations.length > 0 ? variations : [text] };
      }),
  }),
  campaigns: router({
    list: protectedProcedure.query(async () => getAllCampaigns()),
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => getCampaignById(input.id)),
    create: protectedProcedure
      .input(z.object({ 
        propertyId: z.number(), 
        name: z.string().min(1), 
        messageVariations: z.array(z.string()).optional(), 
        totalContacts: z.number().min(1).optional().default(2) 
      }))
      .mutation(async ({ input }) => createCampaign(input)),
    autoSetup: protectedProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const allProperties = await db.select().from(properties).where(eq(properties.status, "available"));
      if (allProperties.length === 0) throw new Error("Nenhum imovel disponivel");
      // Limite de 5 imóveis em campanhas
      const propertiesForCampaign = allProperties.slice(0, 5);
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);
      // NEVER delete existing campaigns — preserves IDs and avoids drift
      // Instead: update existing campaigns, create only for new properties
      const existingCampaigns = await db.select().from(campaigns);
      const existingByPropId = new Map(existingCampaigns.map(c => [c.propertyId, c]));
      const result = [];
      const usedContactIds = new Set<number>();
      for (const prop of propertiesForCampaign) {
        let campaignId: number;
        const existing = existingByPropId.get(prop.id);
        if (existing) {
          // Update existing campaign — keep same ID
          await db.update(campaigns).set({ totalContacts: 2, messagesPerHour: 1, sentCount: 0, failedCount: 0, status: "paused" }).where(eq(campaigns.id, existing.id));
          campaignId = existing.id;
          // Remove existing contacts to reassign
          await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, campaignId));
        } else {
          // Create campaign only if it doesn't exist for this property
          const defaultMessages = [
            `Olá! Temos uma ótima oportunidade em ${prop.denomination}. Gostaria de conhecer mais? 🏠`,
            `Vimos que você pode estar interessado em ${prop.denomination}. Vamos conversar? 📞`,
            `Oportunidade especial em ${prop.denomination}. Clique para saber mais! ✨`
          ];
          const ins = await db.insert(campaigns).values({ propertyId: prop.id, name: prop.denomination, messageVariations: JSON.stringify(defaultMessages), totalContacts: 2, sentCount: 0, failedCount: 0, status: "paused", messagesPerHour: 1 });
          campaignId = Number((ins as any)[0].insertId);
        }
        result.push({ id: campaignId, name: prop.denomination });
        // Assign 2 unique contacts to this campaign
        const available = shuffled.filter(c => !usedContactIds.has(c.id));
        const selected = available.slice(0, 2);
        for (const contact of selected) {
          usedContactIds.add(contact.id);
          await db.insert(campaignContacts).values({ campaignId, contactId: contact.id, messagesSent: 0, status: "pending" });
        }
      }
      return { success: true, campaigns: result, totalContacts: 2, message: result.length + " campanhas configuradas" };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(messages).where(eq(messages.campaignId, input.id));
      await db.delete(contactCampaignHistory).where(eq(contactCampaignHistory.campaignId, input.id));
      await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.id));
      await db.delete(campaigns).where(eq(campaigns.id, input.id));
      return { success: true };
    }),
    getContacts: protectedProcedure.input(z.object({ campaignId: z.number() })).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const cc = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId));
      const result = [];
      for (const item of cc) {
        const contactResult = await db.select().from(contacts).where(eq(contacts.id, item.contactId)).limit(1);
        const contact = contactResult[0];
        if (!contact) continue;
        const lastMsg = await db.select().from(messages).where(and(eq(messages.contactId, contact.id), eq(messages.campaignId, input.campaignId), eq(messages.status, "sent"))).limit(1);
        result.push({ id: item.id, contactId: contact.id, name: contact.name, phone: contact.phone, status: item.status, messagesSent: item.messagesSent || 0, lastMessageSent: lastMsg[0]?.sentAt || null });
      }
      return result;
    }),
    getCycleStatus: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { campaigns: [], dayCount: 0, nightCount: 0 };
      const allCampaigns = await db.select().from(campaigns);
      const dayActive = allCampaigns.filter(c => c.activeDay).length;
      const nightActive = allCampaigns.filter(c => c.activeNight).length;
      return {
        campaigns: allCampaigns.map(c => ({
          id: c.id,
          name: c.name,
          activeDay: c.activeDay || false,
          activeNight: c.activeNight || false,
        })),
        dayCount: dayActive,
        nightCount: nightActive,
        maxPerCycle: 5,
      };
    }),
    toggleCycleActivation: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        period: z.enum(["day", "night"]),
        active: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        if (input.active) {
          const allCampaigns = await db.select().from(campaigns);
          const activeCount = input.period === "day"
            ? allCampaigns.filter(c => c.activeDay).length
            : allCampaigns.filter(c => c.activeNight).length;
          if (activeCount >= 5) {
            throw new Error(`Máximo de 5 campanhas ativadas no ciclo ${input.period === 'day' ? 'DIA' : 'NOITE'} já foi atingido.`);
          }
        }
        const updateData: any = {};
        if (input.period === "day") {
          updateData.activeDay = input.active;
        } else {
          updateData.activeNight = input.active;
        }
        updateData.cycleActivationUpdatedAt = new Date();
        await db.update(campaigns).set(updateData).where(eq(campaigns.id, input.campaignId));
        const allCampaigns = await db.select().from(campaigns);
        const dayActive = allCampaigns.filter(c => c.activeDay).length;
        const nightActive = allCampaigns.filter(c => c.activeNight).length;
        return {
          success: true,
          message: `Campanha ${input.active ? 'ativada' : 'desativada'} no ciclo ${input.period === 'day' ? 'DIA ☀️' : 'NOITE 🌙'}`,
          campaigns: allCampaigns.map(c => ({
            id: c.id,
            name: c.name,
            activeDay: c.activeDay || false,
            activeNight: c.activeNight || false,
          })),
          dayCount: dayActive,
          nightCount: nightActive,
        };
      }),
  }),
  scheduler: router({
    start: protectedProcedure.input(z.object({ nightMode: z.boolean().optional() })).mutation(async ({ input }) => {
      campaignScheduler.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
      const db = await getDb();
      if (db) {
        const allCampaigns = await db.select().from(campaigns);
        const now = new Date();
        for (const camp of allCampaigns) {
          await db.update(campaigns).set({ status: "running", startDate: now }).where(eq(campaigns.id, camp.id));
        }
      }
      // Passa nightMode explícito se o usuário escolheu pelo toggle; senão auto-detecta pelo horário
      await campaignScheduler.start(input.nightMode);
      return { success: true, message: "Scheduler iniciado" };
    }),
    stop: protectedProcedure.mutation(async () => {
      campaignScheduler.stop();
      return { success: true, message: "Scheduler parado" };
    }),
    getState: protectedProcedure.query(async () => {
      const state = campaignScheduler.getState();
      const stats = campaignScheduler.getStats();
      const db = await getDb();
      if (!db) return { state, stats, activeCampaigns: [], todayMessages: [] };
      const activeCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, "running"));
      const todayMessages = await db.select().from(messages).where(eq(messages.status, "sent"));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { state, stats, activeCampaigns, todayMessages: todayMessages.filter(m => m.sentAt && m.sentAt >= today) };
    }),
    getStats: protectedProcedure.query(async () => campaignScheduler.getStats()),
    reset: protectedProcedure.mutation(async () => {
      campaignScheduler.stop();
      await new Promise(resolve => setTimeout(resolve, 2000));
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(campaignContacts);
      await db.delete(messages);
      await db.delete(contactCampaignHistory);
      await db.update(contacts).set({ blockedUntil: null });
      const allCampaigns = await db.select().from(campaigns);
      for (const camp of allCampaigns) {
        await db.update(campaigns).set({ sentCount: 0, failedCount: 0, messagesPerHour: 1, totalContacts: 2, status: "paused", startDate: null }).where(eq(campaigns.id, camp.id));
      }
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      const shuffled = [...allContacts].sort(() => Math.random() - 0.5);
      const usedIds = new Set<number>();
      for (let i = 0; i < allCampaigns.length; i++) {
        const available = shuffled.filter(c => !usedIds.has(c.id));
        const selected = available.slice(0, 2);
        for (const contact of selected) {
          usedIds.add(contact.id);
          await db.insert(campaignContacts).values({ campaignId: allCampaigns[i].id, contactId: contact.id, messagesSent: 0, status: "pending" });
        }
        await db.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, allCampaigns[i].id));
      }
      return { success: true, message: "Campanhas resetadas! Clique em Iniciar." };
    }),
    toggleCampaign: protectedProcedure.input(z.object({ campaignId: z.number(), active: z.boolean() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(campaigns).set({ status: input.active ? "running" : "paused" }).where(eq(campaigns.id, input.campaignId));
      return { success: true, message: input.active ? "Campanha ativada!" : "Campanha pausada!" };
    }),
    updateMessagesPerHour: protectedProcedure.input(z.object({ campaignId: z.number(), messagesPerHour: z.number().min(1).max(2) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(campaigns).set({ messagesPerHour: input.messagesPerHour, totalContacts: 2 }).where(eq(campaigns.id, input.campaignId));
      await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId));
      const allContacts = await db.select().from(contacts).where(eq(contacts.status, "active"));
      // Bloqueio é controlado por campaignContacts.status = 'blocked' (v9.0) — não mais pelo campo blockedUntil
      const selected = [...allContacts].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const contact of selected) {
        await db.insert(campaignContacts).values({ campaignId: input.campaignId, contactId: contact.id, messagesSent: 0, status: "pending" });
      }
      return { success: true, message: input.messagesPerHour + " msgs/hora", totalContacts: 2 };
    }),
    getCampaignDetails: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const allCampaigns = await db.select().from(campaigns);
      const result = [];
      for (const camp of allCampaigns) {
        const prop = await db.select().from(properties).where(eq(properties.id, camp.propertyId)).limit(1);
        const ccList = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, camp.id));
        let sentCount = 0, pendingCount = 0, failedCount = 0;
        const contactDetails = [];
        for (const cc of ccList) {
          const contactResult = await db.select().from(contacts).where(eq(contacts.id, cc.contactId)).limit(1);
          const contact = contactResult[0];
          if (!contact) continue;
          const lastMsg = await db.select().from(messages).where(and(eq(messages.contactId, contact.id), eq(messages.campaignId, camp.id))).limit(1);
          if (lastMsg[0]) sentCount++;
          else if (cc.status === "failed") failedCount++;
          else pendingCount++;
          contactDetails.push({ id: cc.id, contactId: contact.id, name: contact.name, phone: contact.phone, status: lastMsg[0] ? "sent" : cc.status, sentAt: lastMsg[0]?.sentAt || null, blockedUntil: contact.blockedUntil });
        }
        result.push({ id: camp.id, name: camp.name, propertyId: camp.propertyId, propertyName: prop[0]?.denomination || "Desconhecido", status: camp.status, messagesPerHour: camp.messagesPerHour || 1, activeDay: camp.activeDay || false, activeNight: camp.activeNight || false, sentCount, pendingCount, failedCount, totalContacts: ccList.length > 0 ? ccList.length : (camp.totalContacts || 0), contactDetails });
      }
      return result;
    }),
  }),
  companyConfig: router({
    // Só para usuário logado, e com tokens mascarados (antes era pública e devolvia tudo em texto)
    get: protectedProcedure.query(async () => publicCompanyConfig(await getCompanyConfig())),
    // Status real do WhatsApp (consulta o Z-API na hora, com motivo e passos) — painel inicial
    whatsappStatus: protectedProcedure
      .input(z.object({ force: z.boolean().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const config = await getCompanyConfig();
        const { checkWhatsAppStatus } = await import('./whatsapp-status');
        const status = await checkWhatsAppStatus({
          instanceId: config?.zApiInstanceId || process.env.ZAPI_INSTANCE_ID,
          token: config?.zApiToken || process.env.ZAPI_TOKEN,
          clientToken: config?.zApiClientToken || process.env.ZAPI_CLIENT_TOKEN,
        }, { force: input?.force });
        // Mantém o campo do banco em dia (ele ficava preso no último valor)
        const connected = status.state === 'connected';
        if (config && status.state !== 'error' && !!config.zApiConnected !== connected) {
          await updateCompanyConfig({ zApiConnected: connected, zApiLastChecked: new Date() }).catch(() => {});
        }
        return status;
      }),
    update: adminProcedure.input(z.object({
      companyName: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      zApiInstanceId: z.string().optional(),
      zApiToken: z.string().optional(),
      zApiClientToken: z.string().optional(),
      telegramBotToken: z.string().optional(),
      telegramChatId: z.string().optional(),
      openAiApiKey: z.string().optional(),
    })).mutation(async ({ input: raw }) => {
      // Campo que voltou mascarado (••••••abcd) = usuário não mexeu: mantém o valor salvo
      const input = stripMaskedFields(raw);
      await updateCompanyConfig(input);
      // Sincronizar process.env imediatamente para uso em runtime sem reiniciar.
      // Limitada a admin via adminProcedure pra evitar que usuário comum
      // sobrescreva tokens da empresa.
      if (input.telegramBotToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = input.telegramBotToken;
      if (input.telegramChatId !== undefined)   process.env.TELEGRAM_CHAT_ID   = input.telegramChatId;
      if (input.openAiApiKey !== undefined)      process.env.OPENAI_API_KEY     = input.openAiApiKey;
      return { success: true };
    }),
    testZApiConnection: protectedProcedure.mutation(async () => {
      const config = await getCompanyConfig();
      if (!config || !config.zApiInstanceId || !config.zApiToken) return { success: false, message: "Z-API credentials not configured" };
      try {
        const headers: Record<string, string> = {};
        if (config.zApiClientToken) headers["Client-Token"] = config.zApiClientToken;
        const response = await fetch(`https://api.z-api.io/instances/${config.zApiInstanceId}/token/${config.zApiToken}/status`, { headers });
        if (response.ok) {
          const data = await response.json();
          if (data.connected) {
            await updateCompanyConfig({ zApiConnected: true, zApiLastChecked: new Date() });

            // Verificar se o scheduler foi pausado automaticamente pelo Z-API down
            const db = await getDb();
            if (db) {
              const rows = await db.select().from(schedulerState).where(eq(schedulerState.id, 1)).limit(1);
              const stateJson = (rows[0]?.stateJson as Record<string, any>) || {};

              if (stateJson.zapiAutopaused === true) {
                // Limpar flag + restaurar status running → restoreAndResume vai reiniciar
                const updated = { ...stateJson, zapiAutopaused: false };
                await db.update(schedulerState).set({ status: 'running', stateJson: updated }).where(eq(schedulerState.id, 1));
                console.log('[Z-API] zapiAutopaused limpo — retomando scheduler');

                await campaignScheduler.restoreAndResume();

                // Notificar Telegram sobre reconexão
                const { notifyZApiUp } = await import('./_core/telegramNotification');
                notifyZApiUp().catch(e => console.warn('[Telegram] notifyZApiUp falhou:', e));

                return { success: true, message: "WhatsApp reconectado! Scheduler retomado automaticamente." };
              }
            }

            return { success: true, message: "WhatsApp conectado com sucesso!" };
          }
          return { success: false, message: "WhatsApp nao esta conectado." };
        }
        return { success: false, message: "Falha na conexao com Z-API." };
      } catch (error) {
        console.error("[testZApiConnection] Erro:", error);
        return { success: false, message: String(error) };
      }
    }),
  }),
  performance: router({
    getStats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totals: { sent: 0, failed: 0, pending: 0, blocked: 0, successRate: 0, avgPerDay: 0, activeCampaigns: 0 }, byCampaign: [], byDay: [], byHour: [] };
      const allMessages = await db.select().from(messages);
      const allCampaigns = await db.select().from(campaigns);
      const totalSent = allMessages.filter(m => m.status === 'sent' || m.status === 'delivered').length;
      const totalFailed = allMessages.filter(m => m.status === 'failed').length;
      const totalBlocked = allMessages.filter(m => m.status === 'blocked').length;
      const totalPending = allMessages.filter(m => m.status === 'pending').length;
      const successRate = totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0;
      const activeCampaigns = allCampaigns.filter(c => c.status === 'running').length;
      const byCampaign = allCampaigns.map(camp => {
        const campMsgs = allMessages.filter(m => m.campaignId === camp.id);
        const sent = campMsgs.filter(m => m.status === 'sent' || m.status === 'delivered').length;
        const failed = campMsgs.filter(m => m.status === 'failed').length;
        return { id: camp.id, name: camp.name, status: camp.status, sent, failed, total: camp.totalContacts || 2, pending: (camp.totalContacts || 2) - sent - failed, successRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0 };
      });
      const now = new Date();
      const byDay: { date: string; sent: number; failed: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayStart = new Date(dateStr + 'T00:00:00Z');
        const dayEnd = new Date(dateStr + 'T23:59:59Z');
        byDay.push({ date: dateStr, sent: allMessages.filter(m => (m.status === 'sent' || m.status === 'delivered') && m.sentAt && m.sentAt >= dayStart && m.sentAt <= dayEnd).length, failed: allMessages.filter(m => m.status === 'failed' && m.sentAt && m.sentAt >= dayStart && m.sentAt <= dayEnd).length });
      }
      const last7 = byDay.slice(-7);
      const daysWithActivity = last7.filter(d => d.sent > 0).length;
      const avgPerDay = daysWithActivity > 0 ? Math.round(last7.reduce((sum, d) => sum + d.sent, 0) / daysWithActivity) : 0;
      const byHour: { hour: number; count: number }[] = [];
      for (let h = 0; h < 24; h++) {
        byHour.push({ hour: h, count: allMessages.filter(m => (m.status === 'sent' || m.status === 'delivered') && m.sentAt && m.sentAt.getHours() === h).length });
      }
      return { totals: { sent: totalSent, failed: totalFailed, pending: totalPending, blocked: totalBlocked, successRate, avgPerDay, activeCampaigns }, byCampaign, byDay, byHour };
    }),
  }),
  bot: router({
    processMessage: protectedProcedure.input(z.object({ phone: z.string(), message: z.string().optional(), audioUrl: z.string().optional(), senderName: z.string().optional() })).mutation(async ({ input }) => {
      const { processBotMessage } = await import('./bot-ai');
      try {
        const response = await processBotMessage({ phone: input.phone, message: input.message, audioUrl: input.audioUrl, senderName: input.senderName });
        return { success: true, ...response };
      } catch (error) {
        console.error("[processMessage] Erro:", error);
        return { success: false, text: 'Desculpe, ocorreu um erro.' };
      }
    }),
    simulateFinancing: publicProcedure.input(z.object({ propertyValue: z.number().positive(), entryPercent: z.number().optional().default(20) })).query(async ({ input }) => {
      const { simulateFinancing } = await import('./bot-ai');
      return simulateFinancing(input.propertyValue, input.entryPercent);
    }),
    recommendProperties: publicProcedure.input(z.object({ budget: z.number().positive() })).query(async ({ input }) => {
      const { recommendProperties } = await import('./bot-ai');
      return recommendProperties(input.budget);
    }),
  }),
  zapi: router({
    sendMessage: protectedProcedure.input(z.object({ phone: z.string().min(2), message: z.string().min(1) })).mutation(async ({ input }) => {
      const config = await getCompanyConfig();
      if (!config?.zApiInstanceId || !config?.zApiToken) return { success: false, error: 'Z-API nao configurado' };
      const { sendMessageViaZAPI } = await import('./zapi-integration');
      return sendMessageViaZAPI({ instanceId: config.zApiInstanceId, token: config.zApiToken, clientToken: config.zApiClientToken || undefined, phone: input.phone, message: input.message });
    }),
  }),

  // Teste de notificação Telegram
  testTelegram: protectedProcedure.mutation(async () => {
    // Diagnóstico direto — lê process.env para dar erro preciso
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token) return { success: false, error: 'TELEGRAM_BOT_TOKEN não está definido no Railway.' };
    if (!chatId) return { success: false, error: 'TELEGRAM_CHAT_ID não está definido no Railway.' };

    try {
      const TelegramBot = await import('node-telegram-bot-api').then(m => m.default);
      const bot = new TelegramBot(token, { polling: false });
      await bot.sendMessage(chatId, '🔥 <b>LEAD QUENTE QUALIFICADO! (Teste)</b>\n👤 João Teste Silva\n📱 5599999999999\n💰 R$ 6.000 / entrada R$ 30.000\n🚀 Contate AGORA!', { parse_mode: 'HTML', disable_web_page_preview: true });
      return { success: true, message: 'Notificação enviada! Verifique o Telegram.' };
    } catch (e: any) {
      const detail = e?.response?.body ? JSON.stringify(e.response.body) : String(e?.message || e);
      return { success: false, error: `Telegram API erro: ${detail}` };
    }
  }),

  // ══════════════════════════════════════════════════════════════════════
  // LEADS — Gestão completa de leads qualificados pelo bot
  // ══════════════════════════════════════════════════════════════════════
  leads: router({

    // Leads criados por engano a partir de número da equipe (corretor, secretária…): só leitura, a limpeza é manual
    daEquipe: adminProcedure.query(async () => {
      const { leadsDaEquipe } = await import('./leads/numerosDaEquipe');
      return leadsDaEquipe();
    }),

    // Lista todos os leads com filtros e paginação
    list: protectedProcedure
      .input(z.object({
        score: z.enum(['quente', 'morno', 'frio', 'all']).optional().default('all'),
        stage: z.string().optional(),
        search: z.string().optional(),
        /** ativos (padrão): some quem foi descartado, não tem interesse ou pediu para sair */
        situacao: z.enum(['ativos', 'descartados', 'todos']).optional().default('ativos'),
        limit: z.number().min(1).max(200).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { leads: [], total: 0, stats: { quente: 0, morno: 0, frio: 0, total: 0, descartado: 0 } };

        // Corretor: só os leads em que é o responsável (lista e contagens)
        let rows = leadsVisiveis(ctx.permissoes, ctx.user.id, await db.select().from(leadQualifications).orderBy(desc(leadQualifications.updatedAt)));

        // Descartados / bloqueados (SAIR) ficam fora da lista, a não ser que se peça para ver
        const { leadInativo } = await import('./leads/inativo');
        if (input.situacao === 'ativos') rows = rows.filter((r: any) => !leadInativo(r));
        else if (input.situacao === 'descartados') rows = rows.filter((r: any) => leadInativo(r));

        // Filtro por score
        if (input.score !== 'all') {
          rows = rows.filter((r: any) => r.score === input.score);
        }

        // Filtro por stage
        if (input.stage) {
          rows = rows.filter((r: any) => r.stage === input.stage);
        }

        // Filtro por busca (nome ou telefone)
        if (input.search && input.search.trim()) {
          const q = input.search.toLowerCase();
          rows = rows.filter((r: any) => {
            const nome = String(r.nome || (r.answers as any)?.nome || '').toLowerCase();
            const phone = String(r.phone || '').toLowerCase();
            return nome.includes(q) || phone.includes(q);
          });
        }

        // Stats gerais
        const allRows = leadsVisiveis(ctx.permissoes, ctx.user.id, await db.select().from(leadQualifications));
        const ativos = allRows.filter((r: any) => !leadInativo(r));
        const stats = {
          total: ativos.length,
          quente: ativos.filter((r: any) => r.score === 'quente').length,
          morno: ativos.filter((r: any) => r.score === 'morno').length,
          frio: ativos.filter((r: any) => r.score === 'frio').length,
          descartado: allRows.length - ativos.length,
          qualificado: ativos.filter((r: any) => r.stage === 'qualificado').length,
          emAndamento: ativos.filter((r: any) => String(r.stage || '').startsWith('qual_etapa')).length,
        };

        const total = rows.length;
        const paginated = rows.slice(input.offset, input.offset + input.limit);

        // Enriquecer com nome do contato do banco se disponível
        const enriched = await Promise.all(paginated.map(async (lead: any) => {
          let contactName = lead.nome || (lead.answers as any)?.nome || null;
          let campaignName = null;
          try {
            if (lead.contactId) {
              const ct = await db.select().from(contacts).where(eq(contacts.id, lead.contactId)).limit(1);
              if (ct[0]) contactName = ct[0].name || contactName;
            }
            if (lead.campaignId) {
              const cp = await db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).limit(1);
              if (cp[0]) campaignName = cp[0].name;
            }
          } catch {}
          return { ...lead, contactName, campaignName };
        }));

        return { leads: enriched, total, stats };
      }),

    // Lista (tabela) de Nome, Telefone, E-mail e Origem — base do PDF e do envio pelo WhatsApp
    lista: protectedProcedure
      .input(filtroListaLeads)
      .query(async ({ input, ctx }) => {
        const { carregarLinhasLeads, telefonePadraoLista } = await import('./leads/listaLeads');
        const { linhas, origens } = await carregarLinhasLeads(input, soDele(ctx));
        return { linhas, origens, total: linhas.length, telefonePadrao: telefonePadraoLista() };
      }),

    // PDF da lista para baixar (base64)
    listaPdf: protectedProcedure
      .input(filtroListaLeads)
      .mutation(async ({ input, ctx }) => {
        const { carregarLinhasLeads, pdfListaLeads, nomeArquivoLista } = await import('./leads/listaLeads');
        const { linhas } = await carregarLinhasLeads(input, soDele(ctx));
        return { base64: pdfListaLeads(linhas, input).toString('base64'), nomeArquivo: nomeArquivoLista(), total: linhas.length };
      }),

    // Envia a lista só para o número digitado no painel (José, colaborador, corretor). Nunca para os leads.
    enviarListaWhatsApp: protectedProcedure
      .input(filtroListaLeads.extend({
        telefone: z.string().trim().min(8).max(25),
        formato: z.enum(['pdf', 'texto']).default('pdf'),
      }))
      .mutation(async ({ input, ctx }) => {
        const { normalizePhoneBR } = await import('../shared/telefone');
        const telefone = normalizePhoneBR(input.telefone);
        if (!telefone) throw new Error('Número inválido: informe um celular com DDD, ex.: (99) 99181-1246');
        const lista = await import('./leads/listaLeads');
        const { linhas } = await lista.carregarLinhasLeads(input, soDele(ctx));
        const { enviarDocumento, enviarTexto, ZApiError } = await import('./leads/zapiClient');
        try {
          if (input.formato === 'pdf') {
            await enviarDocumento(telefone, {
              base64: lista.pdfListaLeads(linhas, input).toString('base64'),
              extensao: 'pdf', mime: 'application/pdf',
              nomeArquivo: lista.nomeArquivoLista(),
              legenda: lista.legendaPdf(linhas, input),
            });
          } else {
            await enviarTexto(telefone, lista.textoListaLeads(linhas, input));
          }
        } catch (e: any) {
          const msg = e instanceof ZApiError ? `${e.codigo}: ${e.message}` : (e?.message || 'falha no envio');
          console.error(`[Leads] Lista não enviada para ${telefone}: ${msg}`);
          throw new Error(`WhatsApp não enviou a lista (${msg})`);
        }
        console.log(`[Leads] Lista de ${linhas.length} leads enviada (${input.formato}) para ${telefone}`);
        return { success: true, telefone, total: linhas.length, formato: input.formato };
      }),

    // Por que o lead tem essa nota: regra → pontos (soma = score) + histórico
    scoreDetalhe: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return null;
        const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, input.id)).limit(1);
        if (!lead) return null;
        exigirLead(ctx.permissoes, ctx.user.id, lead as any);
        const { ROTULO_REGRA } = await import('./leads/score');
        const { historicoScore } = await import('./leads/scoreService');
        const det = (lead as any).scoreDetalhe as { regras: string; detalhes: Record<string, number>; at: string } | null;
        const itens = Object.entries(det?.detalhes || {}).map(([regra, pontos]) => ({ regra, rotulo: ROTULO_REGRA[regra] || regra, pontos }));
        const soma = itens.reduce((a, i) => a + i.pontos, 0);
        return {
          score: lead.leadScore ?? null,
          classe: lead.score,
          regras: det?.regras ?? null,
          calculadoEm: det?.at ?? null,
          itens,
          soma,
          limitado: soma !== (lead.leadScore ?? soma), // soma fora de 0–100 foi limitada
          historico: await historicoScore(input.id),
        };
      }),

    recalcularScore: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await leadDoUsuario(input.id, ctx);
        const { recalcularScoreLead } = await import('./leads/scoreService');
        const r = await recalcularScoreLead(input.id, { motivo: 'manual_painel' });
        if (!r) throw new Error("Lead não encontrado");
        return r;
      }),

    // Detalhes completos de um lead
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(leadQualifications).where(eq(leadQualifications.id, input.id)).limit(1);
        if (rows[0]) exigirLead(ctx.permissoes, ctx.user.id, rows[0] as any);
        return rows[0] || null;
      }),

    // Atualizar score manualmente
    updateScore: protectedProcedure
      .input(z.object({
        id: z.number(),
        score: z.enum(['quente', 'morno', 'frio']),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await leadDoUsuario(input.id, ctx);
        await db.update(leadQualifications).set({ score: input.score, updatedAt: new Date() }).where(eq(leadQualifications.id, input.id));
        return { success: true };
      }),

    // Descartar lead
    discard: protectedProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string().optional().default('Descartado manualmente'),
        blockDays: z.number().optional().default(30),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await leadDoUsuario(input.id, ctx);
        const blockedUntil = new Date(Date.now() + input.blockDays * 24 * 60 * 60 * 1000);
        await db.update(leadQualifications).set({
          stage: 'descartado',
          discardReason: input.reason,
          blockedUntil,
          updatedAt: new Date(),
        }).where(eq(leadQualifications.id, input.id));
        return { success: true };
      }),

    // Reativar lead bloqueado
    reactivate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { success: false };
        await leadDoUsuario(input.id, ctx);
        await db.update(leadQualifications).set({
          stage: 'nao_iniciado',
          score: 'frio',
          blockedUntil: null,
          discardReason: null,
          updatedAt: new Date(),
        }).where(eq(leadQualifications.id, input.id));
        return { success: true };
      }),

    // Enviar mensagem manual via WhatsApp
    sendWhatsApp: protectedProcedure
      .input(z.object({ phone: z.string(), message: z.string().min(1), leadId: z.number().int().optional() }))
      .mutation(async ({ input, ctx }) => {
        const config = await getCompanyConfig();
        if (!config?.zApiInstanceId || !config?.zApiToken) return { success: false, error: 'Z-API nao configurado' };
        const lead = input.leadId ? await leadDoUsuario(input.leadId, ctx) : null;
        const { sendMessageViaZAPI } = await import('./zapi-integration');
        const r: any = await sendMessageViaZAPI({ instanceId: config.zApiInstanceId, token: config.zApiToken, clientToken: config.zApiClientToken || undefined, phone: input.phone, message: input.message });
        // Mensagem enviada ao cliente pelo CRM: conta como atendido
        if (lead && r?.success !== false) await import('./leads/sla').then(m => m.registrarAtendimento(lead.id, { como: 'whatsapp_crm', usuarioId: ctx.user.id })).catch(() => {});
        return r;
      }),
  }),
});
export type AppRouter = typeof appRouter;
export type { AppRouter };
