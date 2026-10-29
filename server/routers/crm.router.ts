/**
 * Painel de leads v1: kanban por funil (§12.1) e tela do lead (§12.2).
 */
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { leadQualifications, leadInteresses, leadEventos, leadCampanhas, leadMensagens, properties, users } from "../../drizzle/schema";
import { ETAPAS, ROTULO_ETAPA, MOTIVOS_PERDA, ROTULO_MOTIVO, etapaDoLead, validarMovimento, escolherSimilar, imovelDoProprietario, resumoProprietario } from "../leads/kanban";
import { mesclarSlots, slotsDoFunil, slotsPendentes, tagsDoLead, tipoImovelDe, type SlotsLead } from "../leads/slots";
import { rotuloCanal } from "../leads/inbound";
import { classificarOrigem, linhaOrigem } from "../../shared/origemTrafego";
import { appUrl } from "../leads/config";
import type { Funil } from "../leads/atribuicao";
import { montarRelatorio, relatorioCsv, DATA_ISO } from "../leads/relatorio";
import { serieLeadsPorDia } from "../leads/painelEmpreendedor";
import { exigirDistribuicao, exigirLead, leadsVisiveis, type PermissoesUsuario } from "../permissoes";

const funilSchema = z.enum(["comprador", "proprietario"]);

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db;
}

type Ctx = { user: { id: number }; permissoes: PermissoesUsuario };

/** Lead que o usuário pode ver/mexer (corretor: só os leads em que é o responsável) */
async function leadOuErro(db: any, id: number, ctx: Ctx) {
  const [lead] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, id)).limit(1);
  if (!lead) throw new Error("Lead não encontrado");
  exigirLead(ctx.permissoes, ctx.user.id, lead);
  return lead;
}

async function comErroMensagem<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e: any) {
    if (e?.name === "MensagemErro") {
      const code = e.status === 404 ? "NOT_FOUND" : e.status === 412 ? "PRECONDITION_FAILED" : e.status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";
      throw new TRPCError({ code, message: e.message });
    }
    throw e;
  }
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

  /** Follow-up e alerta de atendimento estão rodando? (faixa de aviso no topo) */
  saudeRotinas: protectedProcedure.query(async () => (await import("../leads/rotinas")).estadoRotinas()),

  kanban: protectedProcedure.input(z.object({ funil: funilSchema })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const rows = leadsVisiveis(ctx.permissoes, ctx.user.id, await db.select().from(leadQualifications).orderBy(desc(leadQualifications.updatedAt)))
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
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const lead = await leadOuErro(db, input.id, ctx);
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

  /**
   * "Atender agora": leads visíveis em ordem de prioridade (shared/atenderAgora.ts) — esperando corretor, fila de espera
   * com a chácara livre, visita hoje, mensagem sem resposta, lead novo, temperatura e esfriando. Até 60 leads.
   */
  atenderAgora: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const { prioridadeDoLead, ETAPAS_ENCERRADAS } = await import("../../shared/atenderAgora");
    const { leadVisitas, loteFilaEspera } = await import("../../drizzle/schema");
    const agora = Date.now();
    const ts = (v: any) => (v ? new Date(v).getTime() : null);
    const todos = leadsVisiveis(ctx.permissoes, ctx.user.id, await db.select().from(leadQualifications)) as any[];
    const vivos = todos.filter(l => !ETAPAS_ENCERRADAS.includes(etapaDoLead(l)));
    const ids = vivos.map(l => Number(l.id));
    if (!ids.length) return { itens: [], total: 0 };
    // Mensagens dos últimos 21 dias: última do cliente e última nossa
    const msgs: any[] = await db.select({ leadId: leadMensagens.leadId, direcao: leadMensagens.direcao, em: leadMensagens.createdAt })
      .from(leadMensagens).where(and(inArray(leadMensagens.leadId, ids), gte(leadMensagens.createdAt, new Date(agora - 21 * 86_400_000)))).catch(() => []);
    const ultCli = new Map<number, number>(), ultNossa = new Map<number, number>();
    for (const m of msgs) {
      const alvo = m.direcao === "in" ? ultCli : ultNossa;
      const t = new Date(m.em).getTime();
      if (t > (alvo.get(Number(m.leadId)) ?? 0)) alvo.set(Number(m.leadId), t);
    }
    const vis: any[] = await db.select({ leadId: leadVisitas.leadId, quando: leadVisitas.quando, status: leadVisitas.status }).from(leadVisitas)
      .where(and(inArray(leadVisitas.leadId, ids), gte(leadVisitas.quando, new Date(agora - 2 * 3_600_000)), lte(leadVisitas.quando, new Date(agora + 2 * 86_400_000)))).catch(() => []);
    const proxVisita = new Map<number, number>();
    for (const v of vis) if (["agendada", "confirmada"].includes(v.status)) {
      const t = new Date(v.quando).getTime();
      if (!proxVisita.has(Number(v.leadId)) || t < proxVisita.get(Number(v.leadId))!) proxVisita.set(Number(v.leadId), t);
    }
    const fila: any[] = await db.select({ leadId: loteFilaEspera.leadId, codigo: loteFilaEspera.loteCodigo }).from(loteFilaEspera)
      .where(and(inArray(loteFilaEspera.leadId, ids), eq(loteFilaEspera.status, "avisado"))).catch(() => []);
    const filaAvisado = new Map<number, string>(fila.map(f => [Number(f.leadId), String(f.codigo)]));
    const nomes = new Map<number, string>(((await db.select({ id: users.id, name: users.name }).from(users)) as any[]).map(u => [Number(u.id), String(u.name ?? "—")]));
    const itens = vivos.map(l => {
      const id = Number(l.id);
      const p = prioridadeDoLead({
        score: l.leadScore ?? null, classe: l.score ?? null, etapa: etapaDoLead(l), criadoEm: ts(l.createdAt) ?? agora, ultimaAtividade: ts(l.lastActivityAt) ?? ts(l.updatedAt),
        aguardandoDesde: ts(l.aguardandoCorretorDesde), atendidoEm: ts(l.atendidoAt), ultimaDoCliente: ultCli.get(id) ?? null, ultimaNossa: ultNossa.get(id) ?? null,
        proximaVisita: proxVisita.get(id) ?? null, filaAvisado: filaAvisado.get(id) ?? null, bloqueadoAte: ts(l.blockedUntil),
      }, agora);
      if (!p) return null;
      return {
        id, nome: l.nome || (l.answers as any)?.nome || "Sem nome", phone: String(l.phone ?? ""), score: l.leadScore ?? null, classe: l.score ?? "frio",
        etapa: etapaDoLead(l), rotuloEtapa: ROTULO_ETAPA[etapaDoLead(l)] ?? etapaDoLead(l), chacara: l.loteCodigo ?? null,
        responsavel: l.responsavelId ? nomes.get(Number(l.responsavelId)) ?? null : null, ...p,
      };
    }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.pontos - a.pontos);
    return { itens: itens.slice(0, 60), total: itens.length };
  }),

  /** Resumo da conversa e próxima mensagem sugerida pela IA (server/leads/iaResumo.ts) — só quando o corretor pede */
  resumoIa: protectedProcedure.input(z.object({ id: z.number().int(), forcar: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
    await leadOuErro(await dbOrThrow(), input.id, ctx);
    const { resumoDoLead, IaResumoErro } = await import("../leads/iaResumo");
    try { return await resumoDoLead(input.id, !!input.forcar); } catch (e: any) {
      if (e instanceof IaResumoErro) throw new TRPCError({ code: e.status === 404 ? "NOT_FOUND" : e.status === 412 ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR", message: e.message });
      throw e;
    }
  }),

  /** Abriu o WhatsApp do cliente pelo CRM: conta como atendido (encerra o alerta e tira o card de "Novo") */
  abriuWhatsApp: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    await leadOuErro(await dbOrThrow(), input.id, ctx);
    if ((ctx as any).verComo) return { success: true }; // "ver como" do admin é só leitura
    const { registrarAtendimento } = await import("../leads/sla");
    await registrarAtendimento(input.id, { como: "whatsapp_crm", usuarioId: ctx.user.id });
    return { success: true };
  }),

  /** "Já atendi" pela tela do lead (encerra o alerta de 5 minutos) */
  marcarAtendido: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    await leadOuErro(await dbOrThrow(), input.id, ctx);
    const { marcarAtendido } = await import("../leads/sla");
    await marcarAtendido(input.id);
    return { success: true };
  }),

  // ─── Agenda de visitas (server/leads/visitas.ts) ─────────────────────────
  visitasDoLead: protectedProcedure.input(z.object({ leadId: z.number().int() })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    await leadOuErro(db, input.leadId, ctx);
    const { leadVisitas, properties } = await import("../../drizzle/schema");
    const rows: any[] = await db.select().from(leadVisitas).where(eq(leadVisitas.leadId, input.leadId));
    const props = new Map<number, string>();
    for (const pid of Array.from(new Set(rows.map(r => r.propertyId).filter(Boolean)))) {
      const [p]: any[] = await db.select({ t: properties.denomination }).from(properties).where(eq(properties.id, pid)).limit(1);
      if (p) props.set(pid, p.t);
    }
    return rows
      .map(r => ({ id: r.id, quando: r.quando, local: r.local, status: r.status, observacao: r.observacao, imovel: r.propertyId ? props.get(r.propertyId) ?? null : null, lembreteEnviado: !!r.lembreteClienteAt, confirmadaPeloCliente: !!r.confirmadaAt, doLink: !!r.pedidoJson, confirmacaoEnviada: !!r.confirmacaoEnviadaAt }))
      .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
  }),

  /** Pedido do link de agendamento: confirmação do cliente e resumo do corretor (modelos atuais), wa.me e Z-API */
  mensagensAgendamento: protectedProcedure.input(z.object({ visitaId: z.number().int() })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const { leadVisitas } = await import("../../drizzle/schema");
    const [v]: any[] = await db.select({ leadId: leadVisitas.leadId }).from(leadVisitas).where(eq(leadVisitas.id, input.visitaId)).limit(1);
    if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
    await leadOuErro(db, v.leadId, ctx);
    const M = await import("../leads/mensagensAgendamento");
    return comErroMensagem(() => M.mensagensDaVisita(input.visitaId));
  }),
  /** (Re)envia a confirmação ao cliente pelo WhatsApp do sistema, com o texto editado */
  enviarConfirmacaoAgendamento: protectedProcedure.input(z.object({ visitaId: z.number().int(), texto: z.string().trim().min(1).max(3000) })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const { leadVisitas } = await import("../../drizzle/schema");
    const [v]: any[] = await db.select({ leadId: leadVisitas.leadId }).from(leadVisitas).where(eq(leadVisitas.id, input.visitaId)).limit(1);
    if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
    await leadOuErro(db, v.leadId, ctx);
    const M = await import("../leads/mensagensAgendamento");
    return comErroMensagem(() => M.enviarConfirmacao(input.visitaId, input.texto));
  }),
  /** Modelos das mensagens do agendamento (Configurações) */
  modelosMensagem: protectedProcedure.query(async () => {
    const M = await import("../leads/mensagensAgendamento");
    return M.listarModelos();
  }),
  salvarModeloMensagem: protectedProcedure.input(z.object({ chave: z.enum(["agendamento_cliente", "agendamento_corretor"]), texto: z.string().max(3000) })).mutation(async ({ input, ctx }) => {
    if (ctx.permissoes.perfil !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o administrador edita as mensagens." });
    const M = await import("../leads/mensagensAgendamento");
    return M.salvarModelo(input.chave, input.texto, ctx.user.id);
  }),

  agenda: protectedProcedure.input(z.object({ diasAtras: z.number().int().min(0).max(60).default(7), diasFrente: z.number().int().min(1).max(120).default(30) }).optional()).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const { leadVisitas, properties } = await import("../../drizzle/schema");
    const { gte, lte, and: e } = await import("drizzle-orm");
    const agora = Date.now();
    const de = new Date(agora - (input?.diasAtras ?? 7) * 86400_000), ate = new Date(agora + (input?.diasFrente ?? 30) * 86400_000);
    let rows: any[] = await db.select().from(leadVisitas).where(e(gte(leadVisitas.quando, de), lte(leadVisitas.quando, ate)));
    const leadIds = Array.from(new Set(rows.map(r => r.leadId)));
    const leads: any[] = leadIds.length ? await db.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(inArray(leadQualifications.id, leadIds)) : [];
    // Corretor: só as visitas dos leads dele
    const visiveis = new Set(leadsVisiveis(ctx.permissoes, ctx.user.id, leads).map(l => l.id));
    rows = rows.filter(r => visiveis.has(r.leadId));
    const propIds = Array.from(new Set(rows.map(r => r.propertyId).filter(Boolean))) as number[];
    const props: any[] = propIds.length ? await db.select({ id: properties.id, t: properties.denomination }).from(properties).where(inArray(properties.id, propIds)) : [];
    const pessoas: any[] = await db.select({ id: users.id, name: users.name }).from(users);
    const L = new Map(leads.map(l => [l.id, l])), P = new Map(props.map(p => [p.id, p.t])), U = new Map(pessoas.map(u => [u.id, u.name]));
    return rows.map(r => ({
      id: r.id, leadId: r.leadId, nome: L.get(r.leadId)?.nome || "Lead", telefone: L.get(r.leadId)?.phone || "",
      quando: r.quando, local: r.local, status: r.status, observacao: r.observacao ?? null, imovel: r.propertyId ? P.get(r.propertyId) ?? null : null,
      responsavel: r.responsavelId ? U.get(r.responsavelId) ?? null : null,
      lembreteEnviado: !!r.lembreteClienteAt, confirmadaPeloCliente: !!r.confirmadaAt, doLink: !!r.pedidoJson, confirmacaoEnviada: !!r.confirmacaoEnviadaAt,
      semResultado: ["agendada", "confirmada"].includes(r.status) && new Date(r.quando).getTime() < agora,
    })).sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime());
  }),

  agendarVisita: protectedProcedure
    .input(z.object({
      leadId: z.number().int(), quando: z.string().datetime(), local: z.string().trim().max(200).optional(),
      propertyId: z.number().int().nullable().optional(), observacao: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const lead = await leadOuErro(db, input.leadId, ctx);
      const quando = new Date(input.quando);
      if (quando.getTime() < Date.now() - 10 * 60_000) throw new Error("A data da visita já passou");
      const { leadVisitas } = await import("../../drizzle/schema");
      const r: any = await db.insert(leadVisitas).values({
        leadId: lead.id, quando, local: input.local || null, propertyId: input.propertyId ?? null, observacao: input.observacao || null,
        status: "agendada", responsavelId: lead.responsavelId ?? ctx.user.id, criadoPor: ctx.user.id,
      } as any);
      const id = Number(r?.[0]?.insertId ?? r?.lastInsertRowid ?? 0);
      const { etapaDepoisDaVisita, avisarVisitaAgendada } = await import("../leads/visitas");
      const etapa = funilDo(lead) === "comprador" ? etapaDepoisDaVisita(etapaDoLead(lead), "agendada") : null;
      if (etapa) await db.update(leadQualifications).set({ etapa, updatedAt: new Date() } as any).where(eq(leadQualifications.id, lead.id));
      // Visita marcada: conta como atendimento e pausa o follow-up automático
      await import("../leads/sla").then(m => m.marcarAtendido(lead.id)).catch(() => {});
      await import("../leads/followup").then(m => m.cancelarFollowUp(lead.phone)).catch(() => {});
      if (id) await avisarVisitaAgendada(id).catch(e => console.warn("[Visitas] Aviso de agendamento falhou:", e?.message));
      return { id };
    }),

  statusVisita: protectedProcedure
    .input(z.object({ id: z.number().int(), status: z.enum(["solicitada", "agendada", "confirmada", "realizada", "nao_veio", "cancelada"]) }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const { leadVisitas } = await import("../../drizzle/schema");
      const [v]: any[] = await db.select().from(leadVisitas).where(eq(leadVisitas.id, input.id)).limit(1);
      if (!v) throw new Error("Visita não encontrada");
      await db.update(leadVisitas).set({ status: input.status, updatedAt: new Date() } as any).where(eq(leadVisitas.id, input.id));
      const lead = await leadOuErro(db, v.leadId, ctx);
      const { etapaDepoisDaVisita } = await import("../leads/visitas");
      const etapa = funilDo(lead) === "comprador" ? etapaDepoisDaVisita(etapaDoLead(lead), input.status) : null;
      if (etapa) await db.update(leadQualifications).set({ etapa, updatedAt: new Date() } as any).where(eq(leadQualifications.id, lead.id));
      return { success: true };
    }),

  remarcarVisita: protectedProcedure
    .input(z.object({ id: z.number().int(), quando: z.string().datetime() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const quando = new Date(input.quando);
      if (quando.getTime() < Date.now() - 10 * 60_000) throw new Error("A nova data já passou");
      const { leadVisitas } = await import("../../drizzle/schema");
      const [v]: any[] = await db.select({ leadId: leadVisitas.leadId }).from(leadVisitas).where(eq(leadVisitas.id, input.id)).limit(1);
      if (!v) throw new Error("Visita não encontrada");
      await leadOuErro(db, v.leadId, ctx);
      // Nova data: os avisos automáticos valem de novo
      await db.update(leadVisitas).set({
        quando, status: "agendada", lembreteClienteAt: null, avisoCorretorAt: null, resultadoPedidoAt: null, confirmadaAt: null, updatedAt: new Date(),
      } as any).where(eq(leadVisitas.id, input.id));
      const { avisarVisitaAgendada } = await import("../leads/visitas");
      await avisarVisitaAgendada(input.id).catch(() => {});
      return { success: true };
    }),

  /**
   * Responsável pelo lead — trocar manualmente (distribuição): administrador e secretária. Encaminhar para outra
   * pessoa conta como "encaminhado para atendimento" e avisa quem recebeu (sininho, push e WhatsApp com o link de atender).
   */
  definirResponsavel: protectedProcedure
    .input(z.object({ id: z.number().int(), responsavelId: z.number().int().nullable() }))
    .mutation(async ({ input, ctx }) => {
      exigirDistribuicao(ctx.permissoes);
      const db = await dbOrThrow();
      const lead = await leadOuErro(db, input.id, ctx);
      await db.update(leadQualifications).set({ responsavelId: input.responsavelId, updatedAt: new Date() } as any).where(eq(leadQualifications.id, input.id));
      const para = input.responsavelId;
      if (para && para !== lead.responsavelId && para !== ctx.user.id) {
        const { registrarAtendimento } = await import("../leads/sla");
        await registrarAtendimento(input.id, { como: "encaminhado", usuarioId: ctx.user.id, paraId: para });
        const { avisarEncaminhamento } = await import("../leads/encaminhamento");
        avisarEncaminhamento({ leadId: input.id, paraId: para, porNome: String((ctx.user as any).name ?? "o escritório") }).catch(e => console.warn("[Leads] aviso de encaminhamento:", e?.message));
      }
      return { success: true, encaminhado: !!para && para !== lead.responsavelId && para !== ctx.user.id };
    }),

  /** Quem pode ser responsável (equipe e administrador ativos) */
  responsaveis: protectedProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows: any[] = await db.select({ id: users.id, name: users.name, perfil: users.perfil, role: users.role, ativo: users.ativo, recebeLeads: users.recebeLeads }).from(users);
    return rows.filter(u => u.ativo !== false && u.ativo !== 0 && u.perfil !== "empreendedor").map(u => ({ id: u.id, nome: u.name || "Sem nome", recebeLeads: !!u.recebeLeads }));
  }),

  lead: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const l = await leadOuErro(db, input.id, ctx);
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
      // Último atendimento (abriu o WhatsApp, mexeu no lead ou foi encaminhado a um corretor)
      atendidoEm: l.atendidoAt ?? null,
      ultimoAtendimento: await db.select({ tipo: leadEventos.tipo }).from(leadEventos)
        .where(and(eq(leadEventos.leadId, l.id), inArray(leadEventos.tipo, ["encaminhado", "atendido_whatsapp"])))
        .orderBy(desc(leadEventos.createdAt)).limit(1).then((r: any[]) => (r[0]?.tipo as string | undefined) ?? null).catch(() => null),
      cliqueAnuncio: (() => {
        const u = (l.utm || {}) as Record<string, string | undefined>;
        return u.gclid ? "Google Ads" : u.fbclid ? "Meta (Facebook/Instagram)" : null;
      })(),
      // Follow-up automático: passo enviado (de 5), quando sai o próximo e o último erro de envio
      followUp: {
        passo: Number(l.followUpPasso) || 0,
        proximoEm: l.proximoFollowUpAt ?? null,
        tentativas: Number(l.followUpTentativas) || 0,
        erro: l.followUpErro ?? null,
      },
      modoQualificacao: l.modoQualificacao ?? "ia",
      perguntasIa: l.perguntasIa ?? 0,
      avalieImob: funil === "proprietario" ? linksAvalieImob(l) : null,
      imovelProprietario: funil === "proprietario" ? resumoProprietario(slots) : null,
    };
  }),

  /** Edição manual dos slots (fonte manual); null apaga o slot. Recalcula o score. */
  salvarSlots: protectedProcedure
    .input(z.object({ id: z.number().int(), slots: z.record(z.string().max(40), z.string().max(255).nullable()) }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const lead = await leadOuErro(db, input.id, ctx);
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
  assumir: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    await leadOuErro(db, input.id, ctx);
    await db.update(leadQualifications).set({ humano: true, updatedAt: new Date() } as any).where(eq(leadQualifications.id, input.id));
    await import("../leads/sla").then(m => m.marcarAtendido(input.id)).catch(() => {});
    return { success: true };
  }),

  /** Devolver ao bot (comprador). Proprietário segue com o corretor: não há bot de captação. */
  devolver: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const lead = await leadOuErro(db, input.id, ctx);
    if (funilDo(lead) === "proprietario") throw new Error("Lead de proprietário é atendido pelo corretor (não há bot de captação)");
    await db.update(leadQualifications).set({
      humano: false,
      ...(lead.stage === "atendimento_humano" ? { stage: "abordagem_enviada" } : {}),
      updatedAt: new Date(),
    } as any).where(eq(leadQualifications.id, input.id));
    return { success: true };
  }),

  /** Envia pelo WhatsApp um imóvel parecido (mesmo tipo, preço ±20%) */
  enviarSimilar: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const lead = await leadOuErro(db, input.id, ctx);
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
  cadastrarImovel: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const lead = await leadOuErro(db, input.id, ctx);
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
    .query(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const rows: any[] = leadsVisiveis(ctx.permissoes, ctx.user.id,
        await db.select().from(leadQualifications).where(eq(leadQualifications.empreendimentoSlug, input.slug)).orderBy(desc(leadQualifications.createdAt)));
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
    .query(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      // Datas do filtro no fuso de Imperatriz (UTC-3), "até" inclusive
      const de = input.de ? new Date(`${input.de}T00:00:00-03:00`) : null;
      const ate = input.ate ? new Date(`${input.ate}T23:59:59.999-03:00`) : null;
      const periodo = (col: any) => and(...[de ? gte(col, de) : undefined, ate ? lte(col, ate) : undefined].filter(Boolean) as any[]);
      // Corretor: o relatório (e os cards do painel) contam só os leads dele
      const leads = leadsVisiveis(ctx.permissoes, ctx.user.id, await db.select({
        id: leadQualifications.id, funil: leadQualifications.funil, origem: leadQualifications.origem,
        origemCanal: leadQualifications.origemCanal, origemCampanhaId: leadQualifications.origemCampanhaId,
        ultimoCanal: leadQualifications.ultimoCanal, ultimaCampanhaId: leadQualifications.ultimaCampanhaId,
        propertyId: leadQualifications.propertyId, etapa: leadQualifications.etapa, stage: leadQualifications.stage,
        score: leadQualifications.score, slots: leadQualifications.slots, createdAt: leadQualifications.createdAt,
        responsavelId: leadQualifications.responsavelId, aguardandoCorretorDesde: leadQualifications.aguardandoCorretorDesde, atendidoAt: leadQualifications.atendidoAt,
      }).from(leadQualifications).where(periodo(leadQualifications.createdAt)));
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
      // Visitas realizadas (agenda) e nomes dos corretores
      const { leadVisitas } = await import("../../drizzle/schema");
      const realizadasRows: any[] = ids.length ? await db.select({ leadId: leadVisitas.leadId }).from(leadVisitas).where(and(inArray(leadVisitas.leadId, ids), eq(leadVisitas.status, "realizada"))) : [];
      const pessoas: any[] = await db.select({ id: users.id, name: users.name }).from(users);
      const rel = montarRelatorio({
        leads: leads as any, campanhas, interesses, eventos, mensagens: mensagens as any, imoveis, toque: input.toque,
        visitasRealizadas: new Set(realizadasRows.map(r => r.leadId)),
        responsaveis: new Map(pessoas.map(p => [p.id, p.name || `Usuário ${p.id}`])),
      });
      // Série diária para o gráfico do painel (últimos 30 dias, fuso do Maranhão)
      const porDia = serieLeadsPorDia(leads.map((l: any) => l.createdAt), 30);
      return { ...rel, porDia, csv: relatorioCsv(rel), periodo: { de: input.de ?? null, ate: input.ate ?? null } };
    }),
});
