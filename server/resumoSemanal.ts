/**
 * Resumo semanal no WhatsApp do administrador: toda segunda, a partir das 8h (Brasília), com os números da semana
 * anterior. Liga/desliga e "enviar agora" em Configurações. O envio fica registrado em configSistema
 * (resumo_semanal_ultimo = segunda da semana), então reiniciar o servidor não manda de novo.
 */
import { and, eq, gte, inArray, isNull, lt, lte, ne } from "drizzle-orm";
import { getDb } from "./db";
import { cobrancas, contratos, leadQualifications, leadVisitas, lotes, solicitacaoAcesso, users } from "../drizzle/schema";
import { perfilDe } from "../shared/equipe";
import { semanaAnterior, textoResumoSemanal, type DadosResumoSemanal } from "../shared/resumoSemanal";

const CHAVE_LIGADO = "resumo_semanal_ligado";
const CHAVE_ULTIMO = "resumo_semanal_ultimo";
const HORA_ENVIO = 8;
const DIA = 86_400_000;

const dataHora = (dia: string, fimDoDia = false) => new Date(`${dia}T${fimDoDia ? "23:59:59" : "00:00:00"}-03:00`);

/** Junta os números da semana (inicio..fim, dias de Brasília) */
export async function dadosDaSemana(inicio: string, fim: string, agora = Date.now()): Promise<DadosResumoSemanal> {
  const db: any = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const de = dataHora(inicio), ate = dataHora(fim, true);
  const caiu = (nome: string) => (e: any) => { console.warn(`[Resumo semanal] ${nome}:`, e?.message); return [] as any[]; };

  const [leadsSemana, semResp, visitasFeitas, visitasProx, contratosNovos, cancelados, reservadas, pagas, abertas, pedidos] = await Promise.all([
    db.select({ origem: leadQualifications.origem, score: leadQualifications.score }).from(leadQualifications)
      .where(and(gte(leadQualifications.createdAt, de), lte(leadQualifications.createdAt, ate))).catch(caiu("leads")),
    db.select({ id: leadQualifications.id, stage: leadQualifications.stage, discardReason: leadQualifications.discardReason }).from(leadQualifications)
      .where(isNull(leadQualifications.responsavelId)).catch(caiu("sem responsável")),
    db.select({ id: leadVisitas.id }).from(leadVisitas).where(and(eq(leadVisitas.status, "realizada"), gte(leadVisitas.quando, de), lte(leadVisitas.quando, ate))).catch(caiu("visitas")),
    db.select({ id: leadVisitas.id }).from(leadVisitas).where(and(inArray(leadVisitas.status, ["agendada", "confirmada"]), gte(leadVisitas.quando, new Date(agora)), lt(leadVisitas.quando, new Date(agora + 7 * DIA)))).catch(caiu("visitas próximas")),
    db.select({ loteCodigo: contratos.loteCodigo, status: contratos.status }).from(contratos)
      .where(and(gte(contratos.criadoEm, de), lte(contratos.criadoEm, ate), ne(contratos.status, "cancelado"))).catch(caiu("contratos")),
    db.select({ id: contratos.id }).from(contratos).where(and(gte(contratos.canceladoEm, de as any), lte(contratos.canceladoEm, ate as any))).catch(caiu("cancelados")),
    db.select({ id: lotes.id }).from(lotes).where(eq(lotes.status, "reservado")).catch(caiu("reservas")),
    db.select({ valorPago: cobrancas.valorPago, valor: cobrancas.valor }).from(cobrancas)
      .where(and(eq(cobrancas.status, "paga"), gte(cobrancas.pagoEm, inicio), lte(cobrancas.pagoEm, fim))).catch(caiu("recebido")),
    db.select({ contratoId: cobrancas.contratoId, valor: cobrancas.valor, vencimento: cobrancas.vencimento, status: cobrancas.status }).from(cobrancas)
      .where(inArray(cobrancas.status, ["prevista", "emitida", "vencida"])).catch(caiu("em aberto")),
    db.select({ id: solicitacaoAcesso.id }).from(solicitacaoAcesso).where(eq(solicitacaoAcesso.status, "PENDENTE")).catch(caiu("pedidos")),
  ]);

  const { leadInativo } = await import("./leads/inativo");
  const porOrigem = new Map<string, number>();
  for (const l of leadsSemana) porOrigem.set(l.origem || "sem_origem", (porOrigem.get(l.origem || "sem_origem") ?? 0) + 1);

  const hoje = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
  const daqui7 = new Date(agora - 3 * 3600_000 + 7 * DIA).toISOString().slice(0, 10);
  const venc = (v: any) => String(v.vencimento ?? "").slice(0, 10);
  const vencidas = (abertas as any[]).filter(x => venc(x) && venc(x) < hoje);

  // Equipe e licenças: o mesmo cálculo do Controle de acessos
  let equipe: DadosResumoSemanal["equipe"] = { ativos: 0, usando: 0, parados: [], maisMateriais: [] };
  let licencas: DadosResumoSemanal["licencas"] = { vencendo7dias: [], bloqueados: 0, pedidosPendentes: (pedidos as any[]).length };
  try {
    const { listarControleAcessos } = await import("./controleAcessos");
    const { linhas } = await listarControleAcessos(agora);
    const ativos = linhas.filter(l => l.ativo && l.perfil === "corretor");
    equipe = {
      ativos: ativos.length,
      usando: ativos.filter(l => l.uso === "usando").length,
      parados: ativos.filter(l => l.uso === "parado" || l.uso === "nunca").map(l => primeiroNome(l.nome)),
      maisMateriais: ativos.filter(l => l.midias.total > 0).sort((a, b) => b.midias.total - a.midias.total).slice(0, 3).map(l => ({ nome: primeiroNome(l.nome), n: l.midias.total })),
    };
    licencas = {
      vencendo7dias: linhas.filter(l => l.ativo && l.diasRestantes != null && l.diasRestantes >= 0 && l.diasRestantes <= 7 && ["pago", "cortesia", "teste", "atrasado"].includes(l.pagamento)).map(l => primeiroNome(l.nome)),
      bloqueados: linhas.filter(l => l.ativo && l.pagamento === "bloqueado").length,
      pedidosPendentes: (pedidos as any[]).length,
    };
  } catch (e: any) { console.warn("[Resumo semanal] equipe:", e?.message); }

  return {
    inicio, fim,
    leads: {
      novos: leadsSemana.length,
      quentes: leadsSemana.filter((l: any) => l.score === "quente").length,
      semResponsavel: (semResp as any[]).filter(l => !leadInativo(l)).length,
      porOrigem: Array.from(porOrigem, ([origem, n]) => ({ origem, n })).sort((a, b) => b.n - a.n).slice(0, 4),
    },
    visitas: { realizadas: visitasFeitas.length, proximas7dias: visitasProx.length },
    vendas: {
      contratos: contratosNovos.length, chacaras: (contratosNovos as any[]).map(c => c.loteCodigo).filter(Boolean),
      cancelados: cancelados.length, reservadasAgora: reservadas.length,
    },
    dinheiro: {
      recebido: Math.round((pagas as any[]).reduce((s, x) => s + Number(x.valorPago ?? x.valor ?? 0), 0) * 100) / 100,
      vencidoTotal: Math.round(vencidas.reduce((s, x) => s + Number(x.valor ?? 0), 0) * 100) / 100,
      parcelasVencidas: vencidas.length,
      clientesEmAtraso: new Set(vencidas.map(x => x.contratoId)).size,
      vencendo7dias: (abertas as any[]).filter(x => venc(x) >= hoje && venc(x) <= daqui7).length,
    },
    equipe, licencas,
  };
}

const primeiroNome = (n: string) => String(n || "").trim().split(/\s+/).slice(0, 2).join(" ");

/** Administradores ativos com telefone (quem recebe) */
async function destinatarios(): Promise<{ id: number; nome: string; telefone: string }[]> {
  const db: any = await getDb();
  if (!db) return [];
  const us: any[] = await db.select({ id: users.id, name: users.name, telefone: users.telefone, perfil: users.perfil, role: users.role, ativo: users.ativo }).from(users);
  return us.filter(u => perfilDe(u) === "admin" && !(u.ativo === false || u.ativo === 0))
    .map(u => ({ id: Number(u.id), nome: String(u.name || "").split(/\s+/)[0] || "José", telefone: String(u.telefone || "").replace(/\D/g, "") }))
    .filter(u => u.telefone.length >= 10);
}

const comDdi = (t: string) => (t.startsWith("55") && t.length >= 12 ? t : `55${t}`);

export async function previaResumo(agora = Date.now()) {
  const s = semanaAnterior(agora);
  const dados = await dadosDaSemana(s.inicio, s.fim, agora);
  const quem = await destinatarios();
  return { texto: textoResumoSemanal(dados, quem[0]?.nome), dados, destinatarios: quem.map(q => ({ nome: q.nome, telefone: q.telefone })) };
}

/** Envia agora para os administradores (botão em Configurações ou a rotina de segunda) */
export async function enviarResumo(agora = Date.now(), enviar?: (tel: string, texto: string) => Promise<unknown>) {
  const s = semanaAnterior(agora);
  const dados = await dadosDaSemana(s.inicio, s.fim, agora);
  const quem = await destinatarios();
  if (!quem.length) throw new Error("Nenhum administrador com telefone cadastrado para receber o resumo");
  const envia = enviar ?? (async (tel: string, texto: string) => (await import("./leads/zapiClient")).enviarTexto(tel, texto));
  const resultado: { nome: string; ok: boolean; erro?: string }[] = [];
  for (const q of quem) {
    try { await envia(comDdi(q.telefone), textoResumoSemanal(dados, q.nome)); resultado.push({ nome: q.nome, ok: true }); }
    catch (e: any) { resultado.push({ nome: q.nome, ok: false, erro: e?.message ?? "falha no envio" }); }
  }
  return { semana: `${s.inicio} a ${s.fim}`, resultado };
}

export async function resumoLigado(): Promise<boolean> {
  const { lerConfig } = await import("./configSistema");
  return (await lerConfig(CHAVE_LIGADO)) !== "0";
}

export async function definirResumoLigado(ligado: boolean, usuarioId: number) {
  const { gravarConfig } = await import("./configSistema");
  await gravarConfig(CHAVE_LIGADO, ligado ? "1" : "0", usuarioId);
}

/** Segunda, a partir das 8h de Brasília, uma vez por semana (registrado no banco) */
export async function rotinaResumoSemanal(agora = Date.now(), enviar?: (tel: string, texto: string) => Promise<unknown>) {
  const s = semanaAnterior(agora);
  if (!s.ehSegunda || s.horaBrasilia < HORA_ENVIO) return { enviado: false, motivo: "fora do horário" };
  if (!(await resumoLigado())) return { enviado: false, motivo: "desligado" };
  const { lerConfig, gravarConfig } = await import("./configSistema");
  if ((await lerConfig(CHAVE_ULTIMO)) === s.chave) return { enviado: false, motivo: "já enviado" };
  // Marca antes de enviar: se dois servidores rodarem juntos, só um manda
  await gravarConfig(CHAVE_ULTIMO, s.chave, null);
  const r = await enviarResumo(agora, enviar);
  console.log(`[Resumo semanal] ${r.semana}:`, r.resultado.map(x => `${x.nome} ${x.ok ? "ok" : x.erro}`).join(", "));
  return { enviado: true, ...r };
}

let iniciado = false;
export function iniciarResumoSemanal() {
  if (iniciado) return;
  iniciado = true;
  const tick = () => rotinaResumoSemanal().catch(e => console.warn("[Resumo semanal]", e?.message));
  setInterval(tick, 30 * 60_000).unref?.();
  setTimeout(tick, 90_000).unref?.();
}
