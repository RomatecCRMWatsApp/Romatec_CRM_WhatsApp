/**
 * Painel de leads v1: kanban por funil (§12.1) e tela do lead (§12.2).
 */
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { leadQualifications, leadInteresses, leadEventos, leadCampanhas, leadMensagens, properties, users } from "../../drizzle/schema";
import { ETAPAS, ROTULO_ETAPA, MOTIVOS_PERDA, ROTULO_MOTIVO, etapaDoLead, validarMovimento, escolherSimilar, imovelDoProprietario, resumoProprietario } from "../leads/kanban";
import { mesclarSlots, slotsDoFunil, slotsPendentes, tagsDoLead, tipoImovelDe, type SlotsLead } from "../leads/slots";
import { rotuloCanal } from "../leads/inbound";
import { classificarOrigem, linhaOrigem } from "../../shared/origemTrafego";
import { appUrl } from "../leads/config";
import type { Funil } from "../leads/atribuicao";
import { montarRelatorio, relatorioCsv, DATA_ISO } from "../leads/relatorio";
import { serieLeadsPorDia } from "../leads/painelEmpreendedor";

const funilSchema = z.enum(["comprador", "proprietario"]);

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db;
}

async function leadOuErro(db: any, id: number) {
  const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1);
  if (!lead) throw new Error("Lead não encontrado");
  return lead;
}

const funilDo = (l: any): Funil => (l.funil === "proprietario" ? "proprietario" : "comprador");

/** Links do AvalieImob (AVALIEIMOB_URL); sem a variável os botões não aparecem */
function linksAvalieImob(lead: any) {
  const base = (process.env.AVALIEIMOB_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const s = Object.fromEntries(Object.entries((lead.slots || {}) as SlotsLead).map(([k, v]) => [k, v.valor]));
  const q = new URLSearchParams({
    origem: "crm", leadId: String(lead.id), nome: lead.nome || "", telefone: lead.phone || "",
    tipo: s.tipo_imovel || "", localizacao: s.localizacao || "", area: s.area || "", documentacao: s.documentacao || "",
  }).toString();
  // Rotas do AvalieImob (frontend): /ptam e /exclusividade/novo. O preenchimento automático depende de ele ler a querystring.
  return { ptam: `${base}/ptam?${q}`, exclusividade: `${base}/exclusividade/novo?${q}` };
}

export interface CardKanban {
  id: number;
  nome: string;
  phone: string;
  score: number | null;
  classe: string;
  etapa: string;
  imovel: { codigo: string | null; titulo: string; tipo: string | null } | null;
  imovelProprietario: string | null;
  canal: string;
  ultimaAtividade: Date | string | null;
  tags: string[];
  humano: boolean;
  motivoPerda: string | null;
}

export const crmRouter = router({
  etapas: protectedProcedure.query(() => ({ ETAPAS, ROTULO_ETAPA, MOTIVOS_PERDA, ROTULO_MOTIVO })),

  kanban: protectedProcedure.input(z.object({ funil: funilSchema })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const rows = (await db.select().from(leadQualifications).orderBy(desc(leadQualifications.updatedAt)))
      .filter((l: any) => funilDo(l) === input.funil);
    const propIds = Array.from(new Set(rows.map((l: any) => l.propertyId).filter(Boolean))) as number[];
    const props = propIds.length
      ? await db.select({ id: properties.id, codigo: properties.codigo, titulo: properties.denomination, tipo: properties.propertyType }).from(properties).where(inArray(properties.id, propIds))
      : [];
    const porId = new Map<number, any>(props.map((p: any) => [p.id, p]));
    const cards: CardKanban[] = rows.map((l: any): CardKanban => {
      const p = l.propertyId ? porId.get(l.propertyId) : null;
      return {
        id: l.id,
        nome: l.nome || (l.answers as any)?.nome || "Sem nome",
        phone: l.phone,
        score: l.leadScore ?? null,
        classe: l.score ?? "frio",
        etapa: etapaDoLead(l),
        imovel: p ? { codigo: p.codigo, titulo: p.titulo, tipo: p.tipo } : null,
        imovelProprietario: funilDo(l) === "proprietario" ? resumoProprietario(l.slots as SlotsLead) : null,
        canal: rotuloCanal(l.ultimoCanal || l.origemCanal || l.origem || "whatsapp"),
        ultimaAtividade: l.lastActivityAt || l.updatedAt,
        tags: Array.from(new Set([...(Array.isArray(l.tags) ? l.tags : []), ...tagsDoLead(funilDo(l), l.slots as SlotsLead)])),
        humano: !!l.humano || l.stage === "atendimento_humano",
        motivoPerda: l.motivoPerda ?? null,
      };
    });
    return { etapas: ETAPAS[input.funil], rotulos: ROTULO_ETAPA, cards };
  }),

  moverEtapa: protectedProcedure
    .input(z.object({ id: z.number().int(), etapa: z.string(), motivoPerda: z.string().max(120).optional() }))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const lead = await leadOuErro(db, input.id);
      const v = validarMovimento(funilDo(lead), input.etapa, input.motivoPerda);
      if (!v.ok) throw new Error(v.erro);
      await db.update(leadQualifications).set({
        etapa: input.etapa,
        motivoPerda: input.etapa === "perdido" ? input.motivoPerda : null,
        updatedAt: new Date(),
      } as any).where(eq(leadQualifications.id, input.id));
      // Mexer no lead conta como atendimento (para o alerta de 5 minutos)
      await import("../leads/sla").then(m => m.marcarAtendido(input.id)).catch(() => {});
      return { success: true };
    }),

  /** "Já atendi" pela tela do lead (encerra o alerta de 5 minutos) */
  marcarAtendido: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const { marcarAtendido } = await import("../leads/sla");
    await marcarAtendido(input.id);
    return { success: true };
  }),

  /** Responsável pelo lead (rodízio da equipe) — trocar manualmente */
  definirResponsavel: protectedProcedure
    .input(z.object({ id: z.number().int(), responsavelId: z.number().int().nullable() }))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      await leadOuErro(db, input.id);
      await db.update(leadQualifications).set({ responsavelId: input.responsavelId, updatedAt: new Date() } as any).where(eq(leadQualifications.id, input.id));
      return { success: true };
    }),

  /** Quem pode ser responsável (equipe e administrador ativos) */
  responsaveis: protectedProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows: any[] = await db.select({ id: users.id, name: users.name, perfil: users.perfil, role: users.role, ativo: users.ativo, recebeLeads: users.recebeLeads }).from(users);
    return rows.filter(u => u.ativo !== false && u.ativo !== 0 && u.perfil !== "empreendedor").map(u => ({ id: u.id, nome: u.name || "Sem nome", recebeLeads: !!u.recebeLeads }));
  }),

  lead: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const l = await leadOuErro(db, input.id);
    const funil = funilDo(l);
    const interessesRows = await db.select().from(leadInteresses).where(eq(leadInteresses.leadId, l.id));
    const ids = Array.from(new Set([l.propertyId, ...interessesRows.map((i: any) => i.propertyId)].filter(Boolean))) as number[];
    const imoveis = ids.length
      ? await db.select({ id: properties.id, codigo: properties.codigo, titulo: properties.denomination, tipo: properties.propertyType, price: properties.price, exibirPreco: properties.exibirPreco })
        .from(properties).where(inArray(properties.id, ids))
      : [];
    const campIds = [l.origemCampanhaId, l.ultimaCampanhaId].filter(Boolean) as number[];
    const camps = campIds.length ? await db.select({ id: leadCampanhas.id, codigo: leadCampanhas.codigo, nome: leadCampanhas.nome }).from(leadCampanhas).where(inArray(leadCampanhas.id, campIds)) : [];
    const camp = (id?: number | null) => camps.find((c: any) => c.id === id) ?? null;
    const eventos = await db.select().from(leadEventos).where(eq(leadEventos.leadId, l.id)).orderBy(desc(leadEventos.createdAt)).limit(100);
    const mensagens = (await db.select().from(leadMensagens).where(eq(leadMensagens.leadId, l.id)).orderBy(desc(leadMensagens.createdAt)).limit(100)).reverse();
    const tipoImovel = tipoImovelDe(imoveis.find((i: any) => i.id === l.propertyId)?.tipo);
    const slots = (l.slots || {}) as SlotsLead;
    return {
      id: l.id,
      nome: l.nome || "Sem nome",
      phone: l.phone,
      funil,
      etapa: etapaDoLead(l),
      stageBot: l.stage,
      humano: !!l.humano || l.stage === "atendimento_humano",
      motivoPerda: l.motivoPerda,
      score: l.leadScore ?? null,
      classe: l.score,
      origem: { canal: rotuloCanal(l.origemCanal || l.origem || "whatsapp"), campanha: camp(l.origemCampanhaId) },
      ultimo: { canal: rotuloCanal(l.ultimoCanal || l.origemCanal || l.origem || "whatsapp"), campanha: camp(l.ultimaCampanhaId) },
      campanhaTexto: l.campanhaOrigem,
      // De onde veio no site (referrer / página de entrada / UTMs), quando entrou por formulário
      origemWeb: (() => {
        const u = (l.utm || {}) as Record<string, string | undefined>;
        if (!u.referrer && !u.paginaEntrada && !u.source) return null;
        const c = classificarOrigem(u.source ? { source: u.source } : null, { referrer: u.referrer, paginaEntrada: u.paginaEntrada });
        return {
          linha: linhaOrigem(c.rotulo || `Link marcado: ${[u.source, u.medium].filter(Boolean).join(" · ")}`, { paginaEntrada: u.paginaEntrada }),
          referrer: u.referrer ?? null,
          utm: u.source ? [u.source, u.medium, u.campaign].filter(Boolean).join(" / ") : null,
        };
      })(),
      consentimento: l.consentimento,
      criadoEm: l.createdAt,
      ultimaAtividade: l.lastActivityAt,
      answers: l.answers || {},
      slots,
      definicaoSlots: slotsDoFunil(funil).map(d => ({
        nome: d.nome,
        opcoes: "enum" in d.tipo ? [...d.tipo.enum] : null,
        numero: "numero" in d.tipo,
        obrigatorio: d.obrigatorio === true,
      })),
      pendentes: slotsPendentes(funil, slots, { tipoImovel }),
      tags: Array.from(new Set([...(Array.isArray(l.tags) ? l.tags : []), ...tagsDoLead(funil, slots)])),
      imoveis: imoveis.map((i: any) => ({ ...i, price: i.price ? Number(i.price) : null, link: i.codigo ? `${appUrl()}/i/${i.codigo}` : null })),
      eventos,
      mensagens,
      responsavelId: l.responsavelId ?? null,
      // Esperando um corretor (alerta de 5 minutos): desde quando
      aguardandoDesde: l.atendidoAt ? null : l.aguardandoCorretorDesde ?? null,
      cliqueAnuncio: (() => {
        const u = (l.utm || {}) as Record<string, string | undefined>;
        return u.gclid ? "Google Ads" : u.fbclid ? "Meta (Facebook/Instagram)" : null;
      })(),
      modoQualificacao: l.modoQualificacao ?? "ia",
      perguntasIa: l.perguntasIa ?? 0,
      avalieImob: funil === "proprietario" ? linksAvalieImob(l) : null,
      imovelProprietario: funil === "proprietario" ? resumoProprietario(slots) : null,
    };
  }),

  /** Edição manual dos slots (fonte manual); null apaga o slot. Recalcula o score. */
  salvarSlots: protectedProcedure
    .input(z.object({ id: z.number().int(), slots: z.record(z.string().max(40), z.string().max(255).nullable()) }))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const lead = await leadOuErro(db, input.id);
      const funil = funilDo(lead);
      const apagar = Object.entries(input.slots).filter(([, v]) => v === null || v === "").map(([k]) => k);
      const gravar = Object.fromEntries(Object.entries(input.slots).filter(([, v]) => v !== null && v !== ""));
      const base: SlotsLead = { ...((lead.slots || {}) as SlotsLead) };
      for (const k of apagar) delete base[k];
      const { slots, aceitos, recusados } = mesclarSlots(funil, base, gravar, "manual");
      await db.update(leadQualifications).set({ slots, updatedAt: new Date() } as any).where(eq(leadQualifications.id, lead.id));
      const { recalcularScoreLead } = await import("../leads/scoreService");
      const novos = Object.fromEntries(aceitos.map(k => [k, slots[k].valor]));
      const r = await recalcularScoreLead(lead.id, { motivo: "slots_manual", slotsNovos: novos });
      await import("../leads/sla").then(m => m.marcarAtendido(lead.id)).catch(() => {});
      return { aceitos, recusados, score: r?.score ?? null, classe: r?.classe ?? null };
    }),

  /** Assumir conversa: o bot para de responder este lead */
  assumir: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    await leadOuErro(db, input.id);
    await db.update(leadQualifications).set({ humano: true, updatedAt: new Date() } as any).where(eq(leadQualifications.id, input.id));
    await import("../leads/sla").then(m => m.marcarAtendido(input.id)).catch(() => {});
    return { success: true };
  }),

  /** Devolver ao bot (comprador). Proprietário segue com o corretor: não há bot de captação. */
  devolver: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const lead = await leadOuErro(db, input.id);
    if (funilDo(lead) === "proprietario") throw new Error("Lead de proprietário é atendido pelo corretor (não há bot de captação)");
    await db.update(leadQualifications).set({
      humano: false,
      ...(lead.stage === "atendimento_humano" ? { stage: "abordagem_enviada" } : {}),
      updatedAt: new Date(),
    } as any).where(eq(leadQualifications.id, input.id));
    return { success: true };
  }),

  /** Envia pelo WhatsApp um imóvel parecido (mesmo tipo, preço ±20%) */
  enviarSimilar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const lead = await leadOuErro(db, input.id);
    if (!lead.propertyId) throw new Error("O lead não tem imóvel de interesse para comparar");
    const carteira = await db.select().from(properties);
    const base = carteira.find((p: any) => p.id === lead.propertyId);
    if (!base) throw new Error("Imóvel de interesse não encontrado");
    const enviados = (await db.select({ propertyId: leadInteresses.propertyId }).from(leadInteresses).where(eq(leadInteresses.leadId, lead.id))).map((r: any) => r.propertyId);
    const similar = escolherSimilar(base as any, carteira as any, enviados);
    if (!similar) throw new Error("Nenhum imóvel parecido (mesmo tipo e preço ±20%) na carteira");
    const p: any = carteira.find((x: any) => x.id === similar.id);
    const { precoPublico, linkImovel } = await import("../leads/inbound");
    const preco = precoPublico({ preco: Number(p.price) || null, exibirPreco: p.exibirPreco !== false });
    const link = linkImovel({ codigo: p.codigo, publicSlug: p.publicSlug });
    const msg = [
      `Separei mais uma opção parecida para você 🏡`,
      ``,
      `*${p.denomination}*${p.codigo ? ` (${p.codigo})` : ""}`,
      p.city ? `📍 ${p.city}` : "",
      `💰 ${preco}`,
      link ? `🔗 ${link}` : "",
      ``,
      `Quer que eu te mande mais detalhes ou marque uma visita?`,
    ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0)).join("\n");
    const { enviarTexto } = await import("../leads/zapiClient");
    try {
      await enviarTexto(lead.phone, msg);
    } catch (e: any) {
      throw new Error(`WhatsApp não enviou: ${e?.message || e}`);
    }
    await db.insert(leadInteresses).values({ leadId: lead.id, propertyId: p.id } as any).catch(() => {});
    return { enviado: { id: p.id, codigo: p.codigo, titulo: p.denomination } };
  }),

  /** Proprietário captado → cria o imóvel (inativo, sem preço público) e gera o IMV */
  cadastrarImovel: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const lead = await leadOuErro(db, input.id);
    if (funilDo(lead) !== "proprietario") throw new Error("Só para leads do funil proprietário");
    const dados = imovelDoProprietario(lead);
    const res: any = await db.insert(properties).values({
      ...dados,
      publicSlug: `${dados.denomination.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-${Date.now().toString(36)}`,
    } as any);
    const propertyId = Number(res?.[0]?.insertId ?? res?.lastInsertRowid);
    const { formatCodigoImovel } = await import("../_core/migrations/addLeadsV1");
    const codigo = formatCodigoImovel(propertyId);
    await db.update(properties).set({ codigo } as any).where(eq(properties.id, propertyId));
    await db.update(leadQualifications).set({ etapa: "captado", updatedAt: new Date() } as any).where(and(eq(leadQualifications.id, lead.id)));
    return { propertyId, codigo };
  }),
  /**
   * Lista de interesse do lançamento (ex.: Bom Jardims): quem pediu informação do
   * empreendimento. Só interesse — sem reserva nem sinal até o registro do condomínio.
   * Base legal por contato: consentimento do formulário ou conversa iniciada pelo cliente.
   */
  listaInteresse: protectedProcedure
    .input(z.object({ slug: z.string().max(80).default("bom-jardims") }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const rows: any[] = await db.select().from(leadQualifications).where(eq(leadQualifications.empreendimentoSlug, input.slug)).orderBy(desc(leadQualifications.createdAt));
      const campIds = Array.from(new Set(rows.map(r => r.origemCampanhaId).filter(Boolean))) as number[];
      const camps: any[] = campIds.length ? await db.select({ id: leadCampanhas.id, codigo: leadCampanhas.codigo }).from(leadCampanhas).where(inArray(leadCampanhas.id, campIds)) : [];
      const agora = Date.now();
      const pessoas = rows.map(r => {
        const ans = (r.answers || {}) as Record<string, string>;
        const saiu = !!r.blockedUntil && new Date(r.blockedUntil).getTime() > agora;
        return {
          id: r.id,
          nome: r.nome || ans.nome || "Sem nome",
          phone: r.phone,
          cidade: ans.cidade || null,
          chacara: r.loteCodigo || ans.chacara || null,
          prazo: ans.prazo || null,
          pagamento: ans.pagamento || null,
          canal: rotuloCanal(r.origemCanal || r.origem || "whatsapp"),
          campanha: camps.find(c => c.id === r.origemCampanhaId)?.codigo ?? null,
          classe: r.score,
          base: r.consentimento ? "Consentimento no formulário" : "Iniciou a conversa",
          saiu,
          entrouEm: r.createdAt,
        };
      });
      return { total: pessoas.length, ativos: pessoas.filter(p => !p.saiu).length, pessoas };
    }),

  /** Relatório por canal e campanha (§12.4): leads criados no período, atribuição pelo 1º ou último toque */
  relatorio: protectedProcedure
    .input(z.object({
      de: z.string().regex(DATA_ISO).optional(),
      ate: z.string().regex(DATA_ISO).optional(),
      toque: z.enum(["primeiro", "ultimo"]).default("primeiro"),
    }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      // Datas do filtro no fuso de Imperatriz (UTC-3), "até" inclusive
      const de = input.de ? new Date(`${input.de}T00:00:00-03:00`) : null;
      const ate = input.ate ? new Date(`${input.ate}T23:59:59.999-03:00`) : null;
      const periodo = (col: any) => and(...[de ? gte(col, de) : undefined, ate ? lte(col, ate) : undefined].filter(Boolean) as any[]);
      const leads = await db.select({
        id: leadQualifications.id, funil: leadQualifications.funil, origem: leadQualifications.origem,
        origemCanal: leadQualifications.origemCanal, origemCampanhaId: leadQualifications.origemCampanhaId,
        ultimoCanal: leadQualifications.ultimoCanal, ultimaCampanhaId: leadQualifications.ultimaCampanhaId,
        propertyId: leadQualifications.propertyId, etapa: leadQualifications.etapa, stage: leadQualifications.stage,
        score: leadQualifications.score, slots: leadQualifications.slots, createdAt: leadQualifications.createdAt,
      }).from(leadQualifications).where(periodo(leadQualifications.createdAt));
      const ids = leads.map((l: any) => l.id);
      const [campanhas, interessesRows, eventos, mensagens, imoveis] = await Promise.all([
        db.select({ id: leadCampanhas.id, codigo: leadCampanhas.codigo, nome: leadCampanhas.nome, canal: leadCampanhas.canal, gastoTotal: leadCampanhas.gastoTotal }).from(leadCampanhas),
        ids.length ? db.select({ leadId: leadInteresses.leadId, propertyId: leadInteresses.propertyId }).from(leadInteresses).where(inArray(leadInteresses.leadId, ids)) : Promise.resolve([]),
        db.select({ tipo: leadEventos.tipo, campanhaId: leadEventos.campanhaId, propertyId: leadEventos.propertyId, leadId: leadEventos.leadId })
          .from(leadEventos).where(and(inArray(leadEventos.tipo, ["clique_whatsapp", "scan_qr", "view_imovel"]), periodo(leadEventos.createdAt))),
        ids.length ? db.select({ leadId: leadMensagens.leadId, direcao: leadMensagens.direcao, createdAt: leadMensagens.createdAt }).from(leadMensagens).where(inArray(leadMensagens.leadId, ids)) : Promise.resolve([]),
        // Sem preço: o relatório não mostra valores de imóveis (respeita exibirPreco = false)
        db.select({ id: properties.id, codigo: properties.codigo, denomination: properties.denomination, propertyType: properties.propertyType }).from(properties),
      ]);
      const interesses = new Map<number, number[]>();
      for (const r of interessesRows as any[]) interesses.set(r.leadId, [...(interesses.get(r.leadId) ?? []), r.propertyId]);
      const rel = montarRelatorio({ leads: leads as any, campanhas, interesses, eventos, mensagens: mensagens as any, imoveis, toque: input.toque });
      // Série diária para o gráfico do painel (últimos 30 dias, fuso do Maranhão)
      const porDia = serieLeadsPorDia(leads.map((l: any) => l.createdAt), 30);
      return { ...rel, porDia, csv: relatorioCsv(rel), periodo: { de: input.de ?? null, ate: input.ate ?? null } };
    }),
});
