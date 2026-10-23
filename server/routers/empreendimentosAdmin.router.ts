/**
 * Empreendimentos (tela interna): mapa temático e controle de vendas dos lotes,
 * histórico, arquivos, importação do DXF do projeto e memoriais descritivos.
 * Equipe e administrador; o empreendedor não acessa (shared/equipe.ts).
 */
import { z } from "zod";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { empreendimentos, lotes, loteHistorico, empreendimentoArquivos, leadQualifications, users } from "../../drizzle/schema";
import { SITUACOES_LOTE, problemaVenda, statusPublicoDe, etapaDoLeadPelaVenda, situacaoValida, type SituacaoLote } from "../../shared/lotes";
import { etapaDoLead } from "../leads/kanban";
import { exigirAcesso, type PermissoesUsuario } from "../permissoes";
import { temAcesso } from "../../shared/permissoes";

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  return db as any;
}

async function empreendimentoOuErro(db: any, slug: string) {
  const [emp] = await db.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!emp) throw new Error("Empreendimento não encontrado");
  return emp;
}

/** Empreendimento que o usuário pode abrir (corretor: só os habilitados para ele) */
async function empreendimentoAutorizado(db: any, slug: string, ctx: { permissoes: PermissoesUsuario }) {
  const emp = await empreendimentoOuErro(db, slug);
  exigirAcesso(ctx.permissoes, "empreendimento", emp.id, emp.nome);
  return emp;
}

/** Lote de um empreendimento habilitado para o usuário */
async function loteAutorizado(db: any, loteId: number, ctx: { permissoes: PermissoesUsuario }) {
  const [lote]: any[] = await db.select().from(lotes).where(eq(lotes.id, loteId)).limit(1);
  if (!lote) throw new Error("Lote não encontrado");
  exigirAcesso(ctx.permissoes, "empreendimento", lote.empreendimentoId);
  return lote;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const json = <T,>(v: unknown): T | null => (v == null ? null : typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : (v as T));

/** Ordem do funil comprador: só avança o lead, nunca volta */
export const ORDEM_FUNIL = ["novo", "qualificando", "qualificado", "visita_agendada", "visitou", "proposta", "fechado"];

export const empreendimentosAdminRouter = router({
  lista: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const emps: any[] = await db.select().from(empreendimentos);
    const ls: any[] = await db.select({ empreendimentoId: lotes.empreendimentoId, situacao: lotes.situacao }).from(lotes);
    return emps.map(e => {
      const meus = ls.filter(l => l.empreendimentoId === e.id);
      const por = (s: string) => meus.filter(l => (l.situacao || "disponivel") === s).length;
      return {
        slug: e.slug, nome: e.nome, municipio: e.municipio, uf: e.uf, totalLotes: meus.length,
        disponiveis: por("disponivel"), vendidos: por("vendido_parcelado") + por("vendido_avista") + por("quitado"),
        semRegistro: !e.registroMatricula,
        /** Corretor: os não habilitados aparecem na lista, mas não abrem */
        acesso: temAcesso(ctx.permissoes.perfil, ctx.permissoes.acessos, "empreendimento", e.id),
      };
    });
  }),

  detalhe: protectedProcedure.input(z.object({ slug: z.string().max(80) })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const emp = await empreendimentoAutorizado(db, input.slug, ctx);
    const rows: any[] = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
    const leadIds = Array.from(new Set(rows.map(r => r.leadId).filter(Boolean))) as number[];
    const leads: any[] = leadIds.length ? await db.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone }).from(leadQualifications).where(inArray(leadQualifications.id, leadIds)) : [];
    const pessoas: any[] = await db.select({ id: users.id, name: users.name }).from(users);
    const L = new Map(leads.map(l => [l.id, l])), U = new Map(pessoas.map(p => [p.id, p.name]));
    const arquivos: any[] = await db.select({
      id: empreendimentoArquivos.id, nome: empreendimentoArquivos.nome, categoria: empreendimentoArquivos.categoria,
      mime: empreendimentoArquivos.mime, tamanhoBytes: empreendimentoArquivos.tamanhoBytes, createdAt: empreendimentoArquivos.createdAt,
    }).from(empreendimentoArquivos).where(eq(empreendimentoArquivos.empreendimentoId, emp.id)).orderBy(desc(empreendimentoArquivos.createdAt));
    const lotesOut = rows.map(r => {
      const situacao: SituacaoLote = situacaoValida(r.situacao) ? r.situacao : "disponivel";
      return {
        id: r.id, codigo: r.codigo, quadra: r.quadra, numero: r.numero, areaM2: num(r.areaM2), perimetroM: num(r.perimetroM),
        situacao, leadId: r.leadId, leadNome: r.leadId ? L.get(r.leadId)?.nome ?? null : null, leadTelefone: r.leadId ? L.get(r.leadId)?.phone ?? null : null,
        clienteNome: r.clienteNome, corretorId: r.corretorId, corretorNome: r.corretorId ? U.get(r.corretorId) ?? null : null,
        valorVenda: num(r.valorVenda), valorEntrada: num(r.valorEntrada), numParcelas: r.numParcelas, dataSituacao: r.dataSituacao,
        observacao: r.observacao, poligono: json<[number, number][]>(r.poligono), centro: r.lonCentro != null ? [num(r.lonCentro), num(r.latCentro)] : null,
        temVertices: !!json<unknown[]>(r.verticesUtm)?.length,
      };
    }).sort((a, b) => String(a.quadra).localeCompare(String(b.quadra)) || (a.numero ?? 0) - (b.numero ?? 0));
    const resumo = Object.fromEntries(SITUACOES_LOTE.map(s => [s, lotesOut.filter(l => l.situacao === s).length])) as Record<SituacaoLote, number>;
    return {
      empreendimento: {
        slug: emp.slug, nome: emp.nome, municipio: emp.municipio, uf: emp.uf, endereco: emp.endereco, areaHa: num(emp.areaHa),
        registroMatricula: emp.registroMatricula, registroCartorio: emp.registroCartorio, responsavelTecnico: emp.responsavelTecnico,
        utmFuso: emp.utmFuso ?? 23, precosPublicos: !!emp.precosPublicos,
      },
      ruas: (json<{ nome: string; lon: number; lat: number; angulo: number }[]>(emp.ruas) ?? []).map(r => ({ nome: r.nome, lon: r.lon, lat: r.lat, angulo: r.angulo ?? 0 })),
      perimetro: (() => {
        const p = json<{ poligono: [number, number][]; areaM2: number; perimetroM: number }>(emp.perimetro);
        return p?.poligono?.length ? { poligono: p.poligono, areaM2: p.areaM2, perimetroM: p.perimetroM } : null;
      })(),
      /** WhatsApp que recebe os leads (folder de divulgação) */
      whatsapp: (await import("../leads/config")).numeroWhatsAppLeads(),
      /** Sugestão no envio pelo WhatsApp (número do José); o usuário digita o destino */
      destinoSugerido: (await import("../leads/config")).telefonesNotificacao()[0] || "",
      lotes: lotesOut, resumo, arquivos,
      valorVendido: lotesOut.filter(l => ["vendido_parcelado", "vendido_avista", "quitado"].includes(l.situacao)).reduce((s, l) => s + (l.valorVenda ?? 0), 0),
    };
  }),

  /** Mudar a situação de um lote (reserva, entrada, venda…) — grava no histórico e avança o lead no funil */
  atualizarLote: protectedProcedure
    .input(z.object({
      loteId: z.number().int(),
      situacao: z.enum(SITUACOES_LOTE),
      leadId: z.number().int().nullable().optional(),
      clienteNome: z.string().trim().max(160).nullable().optional(),
      corretorId: z.number().int().nullable().optional(),
      valorVenda: z.number().nonnegative().max(1e10).nullable().optional(),
      valorEntrada: z.number().nonnegative().max(1e10).nullable().optional(),
      numParcelas: z.number().int().min(1).max(600).nullable().optional(),
      observacao: z.string().trim().max(500).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const lote = await loteAutorizado(db, input.loteId, ctx);
      const livre = input.situacao === "disponivel" || input.situacao === "bloqueado";
      const dados = {
        situacao: input.situacao,
        leadId: livre ? null : input.leadId ?? null,
        clienteNome: livre ? null : input.clienteNome || null,
        corretorId: livre ? null : input.corretorId ?? null,
        valorVenda: livre ? null : input.valorVenda ?? null,
        valorEntrada: livre ? null : input.valorEntrada ?? null,
        numParcelas: livre ? null : input.numParcelas ?? null,
      };
      const problema = problemaVenda(dados);
      if (problema) throw new Error(problema);
      const agora = new Date();
      await db.update(lotes).set({
        ...dados, observacao: input.observacao ?? lote.observacao ?? null, dataSituacao: agora,
        status: statusPublicoDe(input.situacao), comercializavel: input.situacao !== "bloqueado",
      } as any).where(eq(lotes.id, lote.id));
      const partes = [
        dados.clienteNome && `cliente: ${dados.clienteNome}`,
        dados.valorVenda != null && `venda R$ ${dados.valorVenda.toLocaleString("pt-BR")}`,
        dados.valorEntrada != null && `entrada R$ ${dados.valorEntrada.toLocaleString("pt-BR")}`,
        dados.numParcelas && `${dados.numParcelas}x`,
        input.observacao,
      ].filter(Boolean).join(" · ");
      await db.insert(loteHistorico).values({
        loteId: lote.id, de: lote.situacao ?? null, para: input.situacao, leadId: dados.leadId, corretorId: dados.corretorId,
        usuarioId: ctx.user.id, detalhe: partes.slice(0, 500) || null,
      } as any);
      // Lead vinculado: guarda o lote de interesse e avança no funil (reserva → proposta; venda → fechado)
      if (dados.leadId) {
        const [lead]: any[] = await db.select().from(leadQualifications).where(eq(leadQualifications.id, dados.leadId)).limit(1);
        if (lead) {
          const [emp]: any[] = await db.select({ slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, lote.empreendimentoId)).limit(1);
          const alvo = etapaDoLeadPelaVenda(input.situacao);
          const atual = etapaDoLead(lead);
          const avanca = alvo && lead.funil !== "proprietario" && atual !== "perdido" && ORDEM_FUNIL.indexOf(atual) < ORDEM_FUNIL.indexOf(alvo);
          await db.update(leadQualifications).set({
            loteCodigo: lote.codigo, empreendimentoSlug: lead.empreendimentoSlug || emp?.slug || null,
            ...(avanca ? { etapa: alvo } : {}), updatedAt: agora,
          } as any).where(eq(leadQualifications.id, lead.id));
        }
      }
      return { success: true };
    }),

  historico: protectedProcedure.input(z.object({ loteId: z.number().int() })).query(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    await loteAutorizado(db, input.loteId, ctx);
    const rows: any[] = await db.select().from(loteHistorico).where(eq(loteHistorico.loteId, input.loteId)).orderBy(desc(loteHistorico.createdAt)).limit(50);
    const pessoas: any[] = await db.select({ id: users.id, name: users.name }).from(users);
    const U = new Map(pessoas.map(p => [p.id, p.name]));
    return rows.map(r => ({ id: r.id, de: r.de, para: r.para, detalhe: r.detalhe, quem: r.usuarioId ? U.get(r.usuarioId) ?? null : null, corretor: r.corretorId ? U.get(r.corretorId) ?? null : null, em: r.createdAt }));
  }),

  /** Leads para vincular ao lote (nome ou telefone) */
  buscarLeads: protectedProcedure.input(z.object({ q: z.string().trim().min(2).max(60) })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const digitos = input.q.replace(/\D/g, "");
    const rows: any[] = await db.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone })
      .from(leadQualifications)
      .where(or(like(leadQualifications.nome, `%${input.q}%`), ...(digitos.length >= 4 ? [like(leadQualifications.phone, `%${digitos}%`)] : [])))
      .limit(10);
    return rows;
  }),

  salvarRegistro: adminProcedure
    .input(z.object({ slug: z.string().max(80), registroMatricula: z.string().trim().max(60).nullable(), registroCartorio: z.string().trim().max(160).nullable(), responsavelTecnico: z.string().trim().max(200).nullable() }))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const emp = await empreendimentoOuErro(db, input.slug);
      await db.update(empreendimentos).set({
        registroMatricula: input.registroMatricula || null, registroCartorio: input.registroCartorio || null, responsavelTecnico: input.responsavelTecnico || null,
      } as any).where(eq(empreendimentos.id, emp.id));
      return { success: true };
    }),

  excluirArquivo: adminProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    await db.delete(empreendimentoArquivos).where(eq(empreendimentoArquivos.id, input.id));
    return { success: true };
  }),

  /** Prévia da importação de um DXF já enviado em Arquivos: o que entra, o que muda */
  previaDxf: adminProcedure.input(z.object({ slug: z.string().max(80), arquivoId: z.number().int() })).query(async ({ input }) => {
    const { db, emp, resultado, existentes } = await lerDxfDoArquivo(input.slug, input.arquivoId);
    const novos = resultado.lotes.filter(l => !existentes.has(l.codigo)).map(l => ({ codigo: l.codigo, areaM2: l.areaM2 }));
    const alterados = resultado.lotes.filter(l => existentes.has(l.codigo)).map(l => {
      const e = existentes.get(l.codigo);
      return { codigo: l.codigo, antes: num(e.areaM2), depois: l.areaM2 };
    }).filter(x => x.antes == null || Math.abs((x.antes ?? 0) - x.depois) >= 0.01);
    const ausentes = Array.from(existentes.keys()).filter(c => !resultado.lotes.some(l => l.codigo === c));
    void db; void emp;
    const ruas = Array.from(new Set(resultado.ruas.map(r => r.nome)));
    const perimetro = resultado.perimetro ? { areaM2: resultado.perimetro.areaM2, perimetroM: resultado.perimetro.perimetroM } : null;
    return { total: resultado.lotes.length, novos, alterados, ausentes, ruas, perimetro, avisos: resultado.avisos };
  }),

  /** Aplica o DXF: atualiza área, perímetro, desenho e centro; lotes novos entram bloqueados para revisão */
  aplicarDxf: adminProcedure.input(z.object({ slug: z.string().max(80), arquivoId: z.number().int() })).mutation(async ({ input, ctx }) => {
    const { db, emp, resultado, existentes } = await lerDxfDoArquivo(input.slug, input.arquivoId);
    let atualizados = 0, criados = 0;
    for (const l of resultado.lotes) {
      const geo = {
        areaM2: String(l.areaM2), perimetroM: String(l.perimetroM),
        verticesUtm: l.verticesUtm, poligono: l.poligono, lonCentro: String(l.centro[0]), latCentro: String(l.centro[1]),
      };
      const e = existentes.get(l.codigo);
      if (e) {
        await db.update(lotes).set(geo as any).where(eq(lotes.id, e.id));
        atualizados++;
      } else {
        await db.insert(lotes).values({
          empreendimentoId: emp.id, codigo: l.codigo, quadra: l.quadra, numero: l.numero, destinacao: "chacara",
          comercializavel: false, status: "nao_comercializavel", situacao: "bloqueado",
          observacao: "Novo no DXF — revisar antes de liberar para venda", ...geo,
        } as any);
        criados++;
      }
    }
    await db.update(empreendimentos).set({
      totalLotes: resultado.lotes.length,
      // Nomes das ruas do desenho (mapa e confrontações do memorial); sem rótulos no DXF, mantém os anteriores
      ...(resultado.ruas.length ? { ruas: resultado.ruas } : {}),
      // Perímetro oficial e área do empreendimento
      ...(resultado.perimetro ? { perimetro: resultado.perimetro, areaHa: String(Math.round(resultado.perimetro.areaM2) / 10000) } : {}),
    } as any).where(eq(empreendimentos.id, emp.id));
    console.log(`[Lotes] DXF aplicado em ${emp.slug} por usuário ${ctx.user.id}: ${atualizados} atualizados, ${criados} novos`);
    return { atualizados, criados, avisos: resultado.avisos };
  }),

  /** Envia o folder inteiro (imagem ou PDF de uma página) só para o número digitado no painel */
  enviarWhatsApp: protectedProcedure
    .input(z.object({
      slug: z.string().max(80),
      codigo: z.string().max(10).optional(),
      telefone: z.string().trim().min(8).max(25),
      imagem: z.string().max(12_000_000),
      formato: z.enum(["imagem", "pdf"]).default("imagem"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const emp = await empreendimentoAutorizado(db, input.slug, ctx);
      const rows: any[] = await db.select({ codigo: lotes.codigo, quadra: lotes.quadra, areaM2: lotes.areaM2, situacao: lotes.situacao }).from(lotes).where(eq(lotes.empreendimentoId, emp.id));
      const lote = input.codigo ? rows.find(r => r.codigo === input.codigo) : null;
      if (input.codigo && !lote) throw new Error(`Chácara ${input.codigo} não encontrada`);
      const { legendaChacara, enviarFolderWhatsApp, nomeArquivoFolder } = await import("../empreendimentoWhatsApp");
      const legenda = legendaChacara({
        empreendimento: emp.nome, municipio: emp.municipio, uf: emp.uf,
        lote: lote ? { codigo: lote.codigo, quadra: lote.quadra, areaM2: num(lote.areaM2) } : null,
        disponiveis: rows.filter(r => (r.situacao || "disponivel") === "disponivel").length,
      });
      const telefone = await enviarFolderWhatsApp({
        telefone: input.telefone, imagem: input.imagem, legenda, formato: input.formato,
        nomeArquivo: nomeArquivoFolder(input.slug, lote?.codigo),
      });
      console.log(`[Empreendimento] Folder ${input.slug}${lote ? ` chácara ${lote.codigo}` : ""} (${input.formato}) enviado para ${telefone}`);
      return { success: true, telefone, formato: input.formato };
    }),

  /** Envia o link público da chácara (fotos, mapa e localização exata) só para o número digitado */
  enviarLinkChacara: protectedProcedure
    .input(z.object({ slug: z.string().max(80), codigo: z.string().max(10), telefone: z.string().trim().min(8).max(25) }))
    .mutation(async ({ input, ctx }) => {
      const { SLUG_BOM_JARDIMS, codigoChacaraValido, linkChacara, mensagemLinkChacara } = await import("../../shared/chacaraLink");
      if (input.slug !== SLUG_BOM_JARDIMS || !codigoChacaraValido(input.codigo)) throw new Error("Link disponível só para as chácaras do Bom Jardims");
      const { normalizePhoneBR } = await import("../../shared/telefone");
      const telefone = normalizePhoneBR(input.telefone);
      if (!telefone) throw new Error("Número inválido: informe um celular com DDD, ex.: (99) 99181-1246");
      const db = await dbOrThrow();
      const emp = await empreendimentoAutorizado(db, input.slug, ctx);
      const [lote]: any[] = await db.select({ codigo: lotes.codigo, quadra: lotes.quadra, areaM2: lotes.areaM2 }).from(lotes)
        .where(and(eq(lotes.empreendimentoId, emp.id), eq(lotes.codigo, input.codigo))).limit(1);
      if (!lote) throw new Error(`Chácara ${input.codigo} não encontrada`);
      const { appUrl } = await import("../leads/config");
      const link = linkChacara(appUrl(), lote.codigo);
      const { enviarTexto, ZApiError } = await import("../leads/zapiClient");
      try {
        await enviarTexto(telefone, mensagemLinkChacara({ codigo: lote.codigo, quadra: lote.quadra, areaM2: num(lote.areaM2) }, link));
      } catch (e: any) {
        const msg = e instanceof ZApiError ? `${e.codigo}: ${e.message}` : (e?.message || "falha no envio");
        throw new Error(`WhatsApp não enviou o link (${msg})`);
      }
      console.log(`[Empreendimento] Link da chácara ${lote.codigo} enviado para ${telefone}`);
      return { success: true, telefone, link };
    }),

  /** Envia o memorial descritivo (rascunho, página inteira em imagem ou PDF) só para o número digitado */
  enviarMemorialWhatsApp: protectedProcedure
    .input(z.object({
      slug: z.string().max(80),
      codigo: z.string().max(10),
      telefone: z.string().trim().min(8).max(25),
      imagem: z.string().max(12_000_000),
      formato: z.enum(["imagem", "pdf"]).default("imagem"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const emp = await empreendimentoAutorizado(db, input.slug, ctx);
      const [lote]: any[] = await db.select({ codigo: lotes.codigo, quadra: lotes.quadra, numero: lotes.numero }).from(lotes)
        .where(and(eq(lotes.empreendimentoId, emp.id), eq(lotes.codigo, input.codigo))).limit(1);
      if (!lote) throw new Error(`Lote ${input.codigo} não encontrado`);
      const { nomeLoteMemorial } = await import("../lotes/memorial");
      const { legendaMemorial, enviarFolderWhatsApp, nomeArquivoFolder } = await import("../empreendimentoWhatsApp");
      const telefone = await enviarFolderWhatsApp({
        telefone: input.telefone, imagem: input.imagem, formato: input.formato,
        legenda: legendaMemorial({ lote: nomeLoteMemorial(lote), empreendimento: emp.nome, municipio: emp.municipio, uf: emp.uf }),
        nomeArquivo: nomeArquivoFolder(input.slug, lote.codigo, "memorial"),
      });
      console.log(`[Empreendimento] Memorial ${input.slug} lote ${lote.codigo} (${input.formato}) enviado para ${telefone}`);
      return { success: true, telefone, formato: input.formato };
    }),

  /** Memoriais descritivos (rascunho) dos lotes escolhidos */
  memoriais: protectedProcedure
    .input(z.object({ slug: z.string().max(80), filtro: z.enum(["disponiveis", "todos"]).default("disponiveis"), codigos: z.array(z.string().max(10)).max(500).optional() }))
    .query(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const emp = await empreendimentoAutorizado(db, input.slug, ctx);
      const rows: any[] = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
      const { memorialDoLote } = await import("../lotes/memorial");
      const todos = rows.map(r => ({ codigo: r.codigo, quadra: r.quadra, numero: r.numero, areaM2: num(r.areaM2) ?? 0, perimetroM: num(r.perimetroM) ?? 0, verticesUtm: json<[number, number][]>(r.verticesUtm) ?? [], situacao: r.situacao || "disponivel" }));
      const escolhidos = todos
        .filter(l => l.verticesUtm.length >= 3)
        .filter(l => input.codigos?.length ? input.codigos.includes(l.codigo) : input.filtro === "todos" || l.situacao === "disponivel")
        .sort((a, b) => String(a.quadra).localeCompare(String(b.quadra)) || (a.numero ?? 0) - (b.numero ?? 0));
      const base = { nome: emp.nome, municipio: emp.municipio, uf: emp.uf, fuso: emp.utmFuso ?? 23, matricula: emp.registroMatricula, ruas: json<{ nome: string; e: number; n: number; angulo: number }[]>(emp.ruas) ?? [],
        perimetroUtm: json<{ verticesUtm: [number, number][] }>(emp.perimetro)?.verticesUtm ?? null };
      return {
        empreendimento: { nome: emp.nome, municipio: emp.municipio, uf: emp.uf, registroMatricula: emp.registroMatricula, responsavelTecnico: emp.responsavelTecnico },
        semGeometria: todos.filter(l => l.verticesUtm.length < 3).length,
        memoriais: escolhidos.map(l => ({ codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: l.areaM2, perimetroM: l.perimetroM, situacao: l.situacao, ...memorialDoLote(l, todos, base) })),
      };
    }),
});

async function lerDxfDoArquivo(slug: string, arquivoId: number) {
  const db = await dbOrThrow();
  const emp = await empreendimentoOuErro(db, slug);
  const [arq]: any[] = await db.select().from(empreendimentoArquivos)
    .where(and(eq(empreendimentoArquivos.id, arquivoId), eq(empreendimentoArquivos.empreendimentoId, emp.id))).limit(1);
  if (!arq) throw new Error("Arquivo não encontrado");
  if (!/\.dxf$/i.test(arq.nome)) throw new Error("Escolha um arquivo .DXF");
  const conteudo = Buffer.from(arq.conteudoBase64, "base64").toString("latin1");
  const rows: any[] = await db.select().from(lotes).where(eq(lotes.empreendimentoId, emp.id));
  const existentes = new Map(rows.map(r => [r.codigo, r]));
  const { importarLotesDxf, manterCodigosPorPosicao } = await import("../lotes/dxf");
  // Reimportação: a quadra vem do lote já cadastrado no mesmo lugar (mantém os códigos)
  const comCentro = rows.filter(r => r.latCentro != null && r.lonCentro != null);
  const resultado = importarLotesDxf(conteudo, {
    fuso: emp.utmFuso ?? 23,
    quadraDoLote: comCentro.length ? (c, numero) => {
      const perto = comCentro.map(r => ({ r, d: Math.hypot((Number(r.lonCentro) - c[0]) * 111320 * Math.cos((c[1] * Math.PI) / 180), (Number(r.latCentro) - c[1]) * 111320) }))
        .filter(x => x.d < 15 && Number(x.r.numero) === numero).sort((a, b) => a.d - b.d)[0];
      return perto?.r.quadra ?? null;
    } : undefined,
  });
  // Lote no mesmo lugar de um já cadastrado mantém o código do cadastro (numeração corrigida não volta à do DXF)
  resultado.lotes = manterCodigosPorPosicao(resultado.lotes, rows);
  return { db, emp, resultado, existentes };
}
