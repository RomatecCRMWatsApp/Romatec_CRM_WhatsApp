/**
 * Ficha completa do cliente: tudo de uma pessoa numa tela — quem é, de onde veio, conversa, visitas, encaminhamentos,
 * contratos com as parcelas e documentos — numa linha do tempo única.
 *
 * Entra por um lead ou por um comprador (pessoa) e junta o que estiver ligado:
 *   lead ↔ pessoa por pessoas.leadId, por contratos.leadId e pelo telefone; pessoa ↔ contrato por contratoPessoas.
 * Quem pode abrir: administrador e secretária, tudo. Corretor: se é o responsável pelo lead ou o corretor de algum
 * contrato dessa pessoa — e vê só os contratos dele. Empreendedor: não abre (usa o portal dele).
 */
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "./db";
import {
  contratoAnexos, contratoPessoas, contratos, empreendimentos, leadEncaminhamentos, leadMensagens, leadQualifications, leadVisitas,
  pessoaDocumentos, pessoas, users,
} from "../drizzle/schema";
import { perfilDe } from "../shared/equipe";
import {
  foneComparavel, ordenarLinhaDoTempo, resumoParcelas, ROTULO_DESFECHO, ROTULO_STATUS_CONTRATO, ROTULO_VISITA, type EventoFicha,
} from "../shared/fichaCliente";
import type { PermissoesUsuario } from "./permissoes";

export class FichaErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = "FichaErro"; } }

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const t = new Date(v as any).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const LIMITE_MENSAGENS = 40;

type Ator = { id: number; perfil?: string | null; role?: string | null };

export async function fichaDoCliente(ref: { leadId?: number; pessoaId?: number }, ator: Ator, p: PermissoesUsuario) {
  const db: any = await getDb();
  if (!db) throw new FichaErro("Banco indisponível", 503);
  const perfil = p.perfil ?? perfilDe(ator as any);
  if (perfil === "empreendedor") throw new FichaErro("A ficha do cliente é da equipe de vendas e do escritório", 403);
  const escritorio = perfil === "admin" || perfil === "secretario";

  // ─── 1. Quem é: junta leads e pessoas ligados ───
  const leadIds = new Set<number>(), pessoaIds = new Set<number>();
  if (ref.leadId) leadIds.add(ref.leadId);
  if (ref.pessoaId) pessoaIds.add(ref.pessoaId);

  const pessoasRows = async () => pessoaIds.size ? db.select().from(pessoas).where(inArray(pessoas.id, Array.from(pessoaIds))) : [];
  const leadsRows = async () => leadIds.size ? db.select().from(leadQualifications).where(inArray(leadQualifications.id, Array.from(leadIds))) : [];

  // Lead → pessoas (pessoas.leadId e contratos do lead)
  if (leadIds.size) {
    const ls = Array.from(leadIds);
    for (const x of await db.select({ id: pessoas.id }).from(pessoas).where(inArray(pessoas.leadId, ls))) pessoaIds.add(Number(x.id));
    const cs = await db.select({ id: contratos.id }).from(contratos).where(inArray(contratos.leadId, ls));
    if (cs.length) for (const x of await db.select({ pessoaId: contratoPessoas.pessoaId }).from(contratoPessoas)
      .where(and(inArray(contratoPessoas.contratoId, cs.map((c: any) => Number(c.id))), or(eq(contratoPessoas.papel, "comprador"), eq(contratoPessoas.papel, "comprador2"))))) pessoaIds.add(Number(x.pessoaId));
  }
  // Lead → pessoas pelo telefone (o cadastro do comprador guarda com máscara: compara só os dígitos)
  if (leadIds.size && !pessoaIds.size) {
    const fonesLeads = (await leadsRows()).map((l: any) => foneComparavel(l.phone)).filter((f: string) => f.length >= 10);
    for (const f of fonesLeads) {
      const fim = f.slice(-4);
      const cand = await db.select({ id: pessoas.id, t1: pessoas.telefone1, t2: pessoas.telefone2 }).from(pessoas)
        .where(or(like(pessoas.telefone1, `%${fim}`), like(pessoas.telefone2, `%${fim}`)));
      for (const c of cand) if ([c.t1, c.t2].some(t => foneComparavel(t) === f)) pessoaIds.add(Number(c.id));
    }
  }
  // Pessoa → leads (pessoas.leadId, contratos.leadId e o telefone)
  let listaPessoas: any[] = await pessoasRows();
  for (const pe of listaPessoas) if (pe.leadId) leadIds.add(Number(pe.leadId));
  if (pessoaIds.size) {
    const cps = await db.select({ contratoId: contratoPessoas.contratoId }).from(contratoPessoas).where(inArray(contratoPessoas.pessoaId, Array.from(pessoaIds)));
    if (cps.length) for (const c of await db.select({ leadId: contratos.leadId }).from(contratos).where(inArray(contratos.id, cps.map((x: any) => Number(x.contratoId))))) if (c.leadId) leadIds.add(Number(c.leadId));
  }
  let listaLeads: any[] = await leadsRows();
  // Telefone: lead sem vínculo formal com o comprador (mesmo número)
  const fonesPessoas = new Set(listaPessoas.flatMap(pe => [pe.telefone1, pe.telefone2]).map(foneComparavel).filter(f => f.length >= 10));
  if (fonesPessoas.size && !listaLeads.length) {
    const candidatos = await db.select({ id: leadQualifications.id, phone: leadQualifications.phone }).from(leadQualifications)
      .where(or(...Array.from(fonesPessoas).map(f => eq(leadQualifications.phone, `55${f}`)), ...Array.from(fonesPessoas).map(f => eq(leadQualifications.phone, f))));
    for (const c of candidatos) leadIds.add(Number(c.id));
    listaLeads = await leadsRows();
  }
  if (!listaPessoas.length && pessoaIds.size) listaPessoas = await pessoasRows();
  if (!listaLeads.length && !listaPessoas.length) throw new FichaErro("Cliente não encontrado", 404);

  // ─── 2. Contratos dessa pessoa ───
  const contratoIds = new Set<number>();
  if (pessoaIds.size) for (const x of await db.select({ contratoId: contratoPessoas.contratoId }).from(contratoPessoas).where(inArray(contratoPessoas.pessoaId, Array.from(pessoaIds)))) contratoIds.add(Number(x.contratoId));
  if (leadIds.size) for (const x of await db.select({ id: contratos.id }).from(contratos).where(inArray(contratos.leadId, Array.from(leadIds)))) contratoIds.add(Number(x.id));
  let listaContratos: any[] = contratoIds.size ? await db.select().from(contratos).where(inArray(contratos.id, Array.from(contratoIds))) : [];

  // ─── 3. Permissão ───
  const responsavelDoLead = listaLeads.some(l => Number(l.responsavelId) === ator.id);
  const corretorDeContrato = listaContratos.some(c => Number(c.corretorUserId) === ator.id);
  if (!escritorio && !(perfil === "corretor" && (responsavelDoLead || corretorDeContrato))) throw new FichaErro("Este cliente não está com você", 403);
  if (!escritorio) {
    listaContratos = listaContratos.filter(c => Number(c.corretorUserId) === ator.id);
    listaLeads = listaLeads.filter(l => Number(l.responsavelId) === ator.id);
  }
  const verLead = listaLeads.length > 0;

  // ─── 4. Dados ligados ───
  const ls = listaLeads.map(l => Number(l.id)), cs = listaContratos.map(c => Number(c.id)), ps = listaPessoas.map(x => Number(x.id));
  const { cobrancasDoContrato, hojeBrasil } = await import("./financeiro/servico");
  const [mensagens, visitas, encaminhamentos, docsPessoa, anexos, emps, parcelasPorContrato] = await Promise.all([
    verLead ? db.select().from(leadMensagens).where(inArray(leadMensagens.leadId, ls)).orderBy(desc(leadMensagens.createdAt), desc(leadMensagens.id)).limit(LIMITE_MENSAGENS) : [],
    verLead ? db.select().from(leadVisitas).where(inArray(leadVisitas.leadId, ls)).orderBy(desc(leadVisitas.quando)) : [],
    verLead ? db.select().from(leadEncaminhamentos).where(inArray(leadEncaminhamentos.leadId, ls)).orderBy(desc(leadEncaminhamentos.criadoEm)) : [],
    ps.length && (escritorio || cs.length) ? db.select({ id: pessoaDocumentos.id, pessoaId: pessoaDocumentos.pessoaId, tipo: pessoaDocumentos.tipo, validadoEm: pessoaDocumentos.validadoEm, enviadoEm: pessoaDocumentos.enviadoEm })
      .from(pessoaDocumentos).where(inArray(pessoaDocumentos.pessoaId, ps)) : [],
    cs.length ? db.select({ id: contratoAnexos.id, contratoId: contratoAnexos.contratoId, tipo: contratoAnexos.tipo, nome: contratoAnexos.nome, enviadoEm: contratoAnexos.enviadoEm })
      .from(contratoAnexos).where(inArray(contratoAnexos.contratoId, cs)) : [],
    db.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos),
    Promise.all(cs.map(id => cobrancasDoContrato(id).catch(() => []))),
  ]);

  // Nomes da equipe (responsável, corretores, encaminhamentos)
  const idsEquipe = new Set<number>();
  for (const l of listaLeads) if (l.responsavelId) idsEquipe.add(Number(l.responsavelId));
  for (const c of listaContratos) idsEquipe.add(Number(c.corretorUserId));
  for (const e of encaminhamentos as any[]) { if (e.paraId) idsEquipe.add(Number(e.paraId)); if (e.deId) idsEquipe.add(Number(e.deId)); }
  for (const v of visitas as any[]) if (v.responsavelId) idsEquipe.add(Number(v.responsavelId));
  const equipe: any[] = idsEquipe.size ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, Array.from(idsEquipe))) : [];
  const nome = (id: unknown) => (id ? equipe.find(u => Number(u.id) === Number(id))?.name ?? null : null);
  const empNome = (id: unknown) => emps.find((e: any) => Number(e.id) === Number(id))?.nome ?? null;
  const hoje = hojeBrasil();

  // ─── 5. Montagem ───
  const lead = listaLeads.sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0))[0] ?? null;
  const pessoa = listaPessoas[0] ?? null;
  const contratosOut = listaContratos.map((c, i) => {
    const parcelas = (parcelasPorContrato[i] as any[]).map(x => ({
      id: x.id, tipo: x.tipo, numero: x.numero, total: x.total, vencimento: x.vencimento, valor: x.valor, status: x.status,
      pagoEm: x.pagoEm || null, valorPago: x.valorPago, boleto: x.bankSlipUrl ?? null,
    }));
    return {
      id: Number(c.id), numero: c.numero, chacara: c.loteCodigo, empreendimento: empNome(c.empreendimentoId), status: c.status,
      rotuloStatus: ROTULO_STATUS_CONTRATO[c.status] ?? c.status, corretor: nome(c.corretorUserId), criadoEm: iso(c.criadoEm),
      pdf: c.pdfAtual ? `/api/contratos/${c.id}/atual.pdf` : null, resumo: resumoParcelas(parcelas, hoje), parcelas,
    };
  });
  const todasParcelas = contratosOut.filter(c => !["cancelado", "distratado"].includes(c.status)).flatMap(c => c.parcelas);

  const linha: EventoFicha[] = [];
  for (const l of listaLeads) linha.push({ tipo: "lead", quando: iso(l.createdAt)!, titulo: "Chegou como lead", detalhe: [l.origem, l.campanhaOrigem].filter(Boolean).join(", ") || null, url: `/leads/lead/${l.id}` });
  for (const v of visitas as any[]) linha.push({ tipo: "visita", quando: iso(v.quando)!, titulo: `Visita ${ROTULO_VISITA[v.status] ?? v.status}`, detalhe: [v.local, nome(v.responsavelId) ? `com ${nome(v.responsavelId)}` : null].filter(Boolean).join(", ") || null });
  for (const e of encaminhamentos as any[]) {
    linha.push({ tipo: "encaminhamento", quando: iso(e.criadoEm)!, titulo: `Encaminhado para ${nome(e.paraId) ?? "corretor"}`, detalhe: e.origem === "automatico" ? "automático" : "pelo escritório" });
    if (e.desfecho && e.desfechoEm) linha.push({ tipo: "encaminhamento", quando: iso(e.desfechoEm)!, titulo: `Atendimento encerrado: ${ROTULO_DESFECHO[e.desfecho] ?? e.desfecho}`, detalhe: e.desfechoMotivo ?? null });
  }
  for (const c of contratosOut) {
    if (c.criadoEm) linha.push({ tipo: "contrato", quando: c.criadoEm, titulo: `Contrato ${c.numero}, chácara ${c.chacara}`, detalhe: [c.empreendimento, c.rotuloStatus].filter(Boolean).join(", "), url: `/contratos/${c.id}` });
    for (const x of c.parcelas) if (x.status === "paga" && x.pagoEm) linha.push({ tipo: "pagamento", quando: `${String(x.pagoEm).slice(0, 10)}T12:00:00.000Z`, titulo: `Pagou ${x.tipo === "entrada" ? "a entrada" : `a parcela ${x.numero}/${x.total}`}`, detalhe: `R$ ${Number(x.valorPago ?? x.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, contrato ${c.numero}`, url: `/contratos/${c.id}` });
  }
  const ultimaMsg = (mensagens as any[])[0];
  if (ultimaMsg) linha.push({ tipo: "mensagem", quando: iso(ultimaMsg.createdAt)!, titulo: ultimaMsg.direcao === "in" ? "Última mensagem do cliente" : "Última mensagem enviada", detalhe: String(ultimaMsg.texto ?? "").slice(0, 120) });

  const fones = Array.from(new Set([lead?.phone, pessoa?.telefone1, pessoa?.telefone2].map(foneComparavel).filter(f => f.length >= 10)));
  return {
    nome: pessoa?.nome || lead?.nome || "Cliente",
    leadId: lead ? Number(lead.id) : null,
    pessoaId: pessoa ? Number(pessoa.id) : null,
    contato: {
      telefones: fones,
      whatsapp: fones[0] ? `55${fones[0]}` : null,
      email: pessoa?.email ?? null,
      cidade: pessoa?.cidade ? `${pessoa.cidade}${pessoa.uf ? `/${pessoa.uf}` : ""}` : null,
      // CPF completo só para o escritório; o corretor vê mascarado
      documento: pessoa?.cpfCnpj ? (escritorio ? pessoa.cpfCnpj : `***${String(pessoa.cpfCnpj).slice(3, 9)}**`) : null,
    },
    lead: lead ? {
      id: Number(lead.id), score: lead.score ?? null, leadScore: lead.leadScore ?? null, etapa: lead.etapa ?? lead.stage ?? null,
      origem: lead.origem ?? null, campanha: lead.campanhaOrigem ?? null, empreendimento: lead.empreendimentoSlug ? emps.find((e: any) => e.slug === lead.empreendimentoSlug)?.nome ?? null : null,
      chacara: lead.loteCodigo ?? null, responsavel: nome(lead.responsavelId), criadoEm: iso(lead.createdAt), ultimaAtividade: iso(lead.lastActivityAt ?? lead.updatedAt),
    } : null,
    resumo: { contratos: contratosOut.length, ...resumoParcelas(todasParcelas, hoje) },
    contratos: contratosOut,
    visitas: (visitas as any[]).map(v => ({ id: Number(v.id), quando: iso(v.quando), status: v.status, rotulo: ROTULO_VISITA[v.status] ?? v.status, local: v.local ?? null, com: nome(v.responsavelId) })),
    conversa: (mensagens as any[]).slice().reverse().map(m => ({ id: Number(m.id), direcao: m.direcao as "in" | "out", autor: m.autor ?? null, texto: String(m.texto ?? ""), quando: iso(m.createdAt) })),
    documentos: [
      ...(docsPessoa as any[]).map(d => ({ id: `p${d.id}`, nome: d.tipo.replace(/_/g, " "), validado: !!d.validadoEm, quando: iso(d.enviadoEm), url: null as string | null })),
      ...(anexos as any[]).map(a => ({ id: `a${a.id}`, nome: a.nome || a.tipo, validado: true, quando: iso(a.enviadoEm), url: `/api/contratos/${a.contratoId}/anexos/${a.id}` })),
      ...contratosOut.filter(c => c.pdf).map(c => ({ id: `c${c.id}`, nome: `Contrato ${c.numero} (PDF)`, validado: true, quando: c.criadoEm, url: c.pdf })),
    ],
    linhaDoTempo: ordenarLinhaDoTempo(linha),
  };
}
