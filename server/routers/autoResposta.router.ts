/** Respostas automáticas no WhatsApp (server/autoresposta/motor.ts) — configuração só do administrador e da secretária */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { perfilDe } from "../../shared/equipe";
import { classificar, INTENCOES, MIDIAS, ROTULO_INTENCAO, ROTULO_MIDIA, TEXTOS_PADRAO } from "../../shared/autoresposta";
import { autoRespostaConfig, autoRespostaMidias, autoRespostaTextos, empreendimentos, leadEventos } from "../../drizzle/schema";

const M = () => import("../autoresposta/motor");

function escritorio(ctx: any) {
  if (!["admin", "secretario"].includes(perfilDe(ctx.user as any) ?? "")) throw new TRPCError({ code: "FORBIDDEN", message: "Respostas automáticas são configuradas pelo escritório." });
}
async function banco() {
  const { getDb } = await import("../db");
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  return d as any;
}
async function empPorSlug(slug: string) {
  const d = await banco();
  const [e] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
  return e as { id: number; slug: string; nome: string };
}

const slugIn = z.object({ slug: z.string().min(1).max(80) });

export const autoRespostaRouter = router({
  empreendimentos: protectedProcedure.query(async ({ ctx }) => {
    escritorio(ctx);
    const d = await banco();
    const es: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos);
    const cs: any[] = await d.select().from(autoRespostaConfig);
    return es.map(e => ({ ...e, ativo: cs.some(c => Number(c.empreendimentoId) === Number(e.id) && (c.ativo === true || c.ativo === 1)) }));
  }),

  /** Tudo da tela: configuração, textos (cadastrados ou padrão), mídias e números da oferta */
  obter: protectedProcedure.input(slugIn).query(async ({ ctx, input }) => {
    escritorio(ctx);
    const m = await M();
    const c = await m.contextoDoEmpreendimento(input.slug);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
    const d = await banco();
    const ts: any[] = await d.select().from(autoRespostaTextos).where(eq(autoRespostaTextos.empreendimentoId, c.emp.id));
    return {
      emp: c.emp, cfg: c.cfg, temCondicoes: !!c.cond,
      disponiveis: c.lotes.filter(l => l.situacao === "disponivel").length,
      lotes: c.lotes.map(l => l.codigo).sort(),
      textos: INTENCOES.map(i => ({ intencao: i, rotulo: ROTULO_INTENCAO[i], ...c.textos[i]!, personalizado: ts.some(t => t.intencao === i), padrao: TEXTOS_PADRAO[i] })),
      midias: MIDIAS.map(k => ({ codigo: k, rotulo: ROTULO_MIDIA[k], ...(c.midias[k] ?? { tipo: null, url: null, nomeArquivo: null, legenda: null }) })),
    };
  }),

  salvarConfig: protectedProcedure.input(slugIn.extend({
    ativo: z.boolean(),
    condicaoValidaAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    avisoLegal: z.string().trim().max(1000).nullable(),
    loteAncora: z.string().trim().max(20).nullable(),
    entradaParcelas: z.number().int().min(1).max(12),
  })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const e = await empPorSlug(input.slug);
    const d = await banco();
    const valores = {
      ativo: input.ativo, condicaoValidaAte: input.condicaoValidaAte || null, avisoLegal: input.avisoLegal || null,
      loteAncora: input.loteAncora ? input.loteAncora.toUpperCase() : null, entradaParcelas: input.entradaParcelas, atualizadoPor: ctx.user.id, updatedAt: new Date(),
    };
    const [ja] = await d.select().from(autoRespostaConfig).where(eq(autoRespostaConfig.empreendimentoId, e.id)).limit(1);
    if (ja) await d.update(autoRespostaConfig).set(valores as any).where(eq(autoRespostaConfig.empreendimentoId, e.id));
    else await d.insert(autoRespostaConfig).values({ empreendimentoId: e.id, ...valores } as any);
    console.log(`[Auto-resposta] ${e.slug}: robô ${input.ativo ? "LIGADO" : "desligado"} por usuário ${ctx.user.id}`);
    return { success: true };
  }),

  /** Texto de uma intenção; restaurar = volta ao padrão (apaga o personalizado) */
  salvarTexto: protectedProcedure.input(slugIn.extend({
    intencao: z.enum(INTENCOES),
    texto: z.string().trim().min(1).max(3000),
    midias: z.array(z.enum(MIDIAS)).max(MIDIAS.length),
    ativo: z.boolean(),
    restaurar: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const e = await empPorSlug(input.slug);
    const d = await banco();
    const onde = and(eq(autoRespostaTextos.empreendimentoId, e.id), eq(autoRespostaTextos.intencao, input.intencao));
    const [ja] = await d.select().from(autoRespostaTextos).where(onde).limit(1);
    if (input.restaurar) { if (ja) await d.delete(autoRespostaTextos).where(onde); return { success: true }; }
    const valores = { texto: input.texto, midias: input.midias.join(","), ativo: input.ativo, updatedAt: new Date() };
    if (ja) await d.update(autoRespostaTextos).set(valores as any).where(onde);
    else await d.insert(autoRespostaTextos).values({ empreendimentoId: e.id, intencao: input.intencao, ...valores } as any);
    return { success: true };
  }),

  /** Troca a mídia (PNG/JPG até 5 MB ou PDF até 10 MB) — vai para o Cloudinary */
  enviarMidia: protectedProcedure.input(slugIn.extend({
    codigo: z.enum(MIDIAS),
    nomeArquivo: z.string().trim().min(1).max(120),
    mime: z.enum(["image/png", "image/jpeg", "application/pdf"]),
    base64: z.string().min(10).max(14_000_000),
    legenda: z.string().trim().max(500).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const e = await empPorSlug(input.slug);
    const buf = Buffer.from(input.base64, "base64");
    const pdf = input.mime === "application/pdf";
    if (buf.length > (pdf ? 10 : 5) * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: `Arquivo grande demais (máx. ${pdf ? 10 : 5} MB)` });
    const { uploadToCloudinary } = await import("../cloudinary");
    const up = await uploadToCloudinary(buf, input.mime, input.nomeArquivo, { folder: `autoresposta/${e.slug}` });
    const d = await banco();
    const onde = and(eq(autoRespostaMidias.empreendimentoId, e.id), eq(autoRespostaMidias.codigo, input.codigo));
    const valores = { tipo: pdf ? "pdf" : "imagem", url: up.url, nomeArquivo: input.nomeArquivo, legenda: input.legenda || null, ativo: true, updatedAt: new Date() };
    const [ja] = await d.select().from(autoRespostaMidias).where(onde).limit(1);
    if (ja) await d.update(autoRespostaMidias).set(valores as any).where(onde);
    else await d.insert(autoRespostaMidias).values({ empreendimentoId: e.id, codigo: input.codigo, ...valores } as any);
    return { url: up.url };
  }),

  /** Volta a mídia ao arquivo de partida (ou tira, se não houver) */
  restaurarMidia: protectedProcedure.input(slugIn.extend({ codigo: z.enum(MIDIAS) })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const e = await empPorSlug(input.slug);
    const d = await banco();
    await d.delete(autoRespostaMidias).where(and(eq(autoRespostaMidias.empreendimentoId, e.id), eq(autoRespostaMidias.codigo, input.codigo)));
    return { success: true };
  }),

  /** Prévia: simula a mensagem de um cliente e mostra o que o robô responderia (nada é enviado) */
  previa: protectedProcedure.input(slugIn.extend({ mensagem: z.string().trim().min(1).max(500), primeira: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    escritorio(ctx);
    const m = await M();
    const c = await m.contextoDoEmpreendimento(input.slug);
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Empreendimento não encontrado" });
    const r = classificar(input.mensagem, !!input.primeira, new Set(c.lotes.map(l => l.codigo)));
    if (r.intencao === "indefinida") return { intencao: "indefinida" as const, chacara: null, envios: [], obs: "Nenhuma regra casou: o Claude escolhe a intenção; se nem ele entender, a conversa passa para o corretor." };
    const corretor = { nome: (ctx.user as any).name ? String((ctx.user as any).name).split(/\s+/).slice(0, 2).join(" ") : "Corretor", creci: null, telefone: null };
    const envios = m.montarResposta(c, { intencao: r.intencao, chacara: r.chacara ?? null, nome: "Maria", corretor });
    const obs = r.intencao === "fechar" ? "Depois de responder, passa a conversa para o corretor (atendimento humano + aviso)." : r.intencao === "optout" ? "Descadastra o cliente: o robô não fala mais com ele." : null;
    return { intencao: r.intencao, chacara: r.chacara ?? null, envios, obs };
  }),

  /** Números do robô no período: conversas, respostas, régua, links abertos e passagens para o corretor */
  metricas: protectedProcedure.input(slugIn.extend({ dias: z.number().int().min(1).max(365).default(30) })).query(async ({ ctx, input }) => {
    escritorio(ctx);
    const e = await empPorSlug(input.slug);
    const d = await banco();
    const { leadQualifications, linksOferta, autoRespostaRegua } = await import("../../drizzle/schema");
    const { gte, inArray } = await import("drizzle-orm");
    const desde = new Date(Date.now() - input.dias * 86_400_000);
    const tipos = ["auto_resposta", "regua", "handoff", "pediu_visita", "abriu_oferta", "fora_horario"];
    const evs: any[] = await d.select({ leadId: leadEventos.leadId, tipo: leadEventos.tipo, dados: leadEventos.dados })
      .from(leadEventos).where(and(inArray(leadEventos.tipo, tipos), gte(leadEventos.createdAt, desde)));
    const ids = Array.from(new Set(evs.map(x => Number(x.leadId)).filter(Boolean)));
    const doEmp = new Set<number>(ids.length
      ? (await d.select({ id: leadQualifications.id }).from(leadQualifications).where(and(inArray(leadQualifications.id, ids), eq(leadQualifications.empreendimentoSlug, e.slug)))).map((l: any) => Number(l.id))
      : []);
    const meus = evs.filter(x => doEmp.has(Number(x.leadId)));
    const dadosDe = (x: any) => (typeof x.dados === "string" ? (() => { try { return JSON.parse(x.dados); } catch { return {}; } })() : (x.dados ?? {}));
    const conta = (tipo: string, f?: (dd: any) => boolean) => meus.filter(x => x.tipo === tipo && (!f || f(dadosDe(x)))).length;
    const leadsCom = (tipo: string) => new Set(meus.filter(x => x.tipo === tipo).map(x => Number(x.leadId))).size;
    const porIntencao: Record<string, number> = {};
    for (const x of meus.filter(y => y.tipo === "auto_resposta")) { const i = dadosDe(x).intencao ?? "—"; porIntencao[i] = (porIntencao[i] ?? 0) + 1; }
    const links: any[] = await d.select({ aberturas: linksOferta.aberturas, primeira: linksOferta.primeiraAberturaAt }).from(linksOferta).where(eq(linksOferta.empreendimentoId, e.id));
    const regua: any[] = await d.select({ leadId: autoRespostaRegua.leadId }).from(autoRespostaRegua).where(eq(autoRespostaRegua.empreendimentoId, e.id));
    return {
      dias: input.dias,
      conversas: leadsCom("auto_resposta"),
      respostas: conta("auto_resposta"),
      regua: conta("regua"),
      emRegua: regua.length,
      linksEnviados: links.length,
      linksAbertos: links.filter(l => Number(l.aberturas) > 0).length,
      aberturas: conta("abriu_oferta"),
      passaram: leadsCom("handoff"),
      querFechar: conta("auto_resposta", dd => dd.intencao === "fechar"),
      visitas: conta("pediu_visita"),
      optout: conta("auto_resposta", dd => dd.intencao === "optout"),
      foraHorario: conta("fora_horario"),
      porIntencao,
    };
  }),

  /** Últimas respostas do robô (para conferir o que saiu) */
  historico: protectedProcedure.input(slugIn).query(async ({ ctx, input }) => {
    escritorio(ctx);
    await empPorSlug(input.slug);
    const d = await banco();
    const { leadQualifications } = await import("../../drizzle/schema");
    const { desc, inArray } = await import("drizzle-orm");
    const evs: any[] = await d.select({ id: leadEventos.id, leadId: leadEventos.leadId, tipo: leadEventos.tipo, dados: leadEventos.dados, createdAt: leadEventos.createdAt })
      .from(leadEventos).where(inArray(leadEventos.tipo, ["auto_resposta", "handoff", "fora_horario", "regua", "abriu_oferta"])).orderBy(desc(leadEventos.id)).limit(200);
    const ids = Array.from(new Set(evs.map(e => e.leadId).filter(Boolean)));
    const leads: any[] = ids.length ? await d.select({ id: leadQualifications.id, nome: leadQualifications.nome, slug: leadQualifications.empreendimentoSlug }).from(leadQualifications).where(inArray(leadQualifications.id, ids)) : [];
    const porId = new Map(leads.map(l => [Number(l.id), l]));
    return evs.filter(e => porId.get(Number(e.leadId))?.slug === input.slug).slice(0, 50).map(e => {
      const dados = typeof e.dados === "string" ? (() => { try { return JSON.parse(e.dados); } catch { return {}; } })() : (e.dados ?? {});
      return { id: e.id, leadId: e.leadId, nome: porId.get(Number(e.leadId))?.nome ?? null, tipo: e.tipo, intencao: dados.intencao ?? null, motivo: dados.motivo ?? null, passo: dados.passo ?? null, createdAt: e.createdAt };
    });
  }),
});
