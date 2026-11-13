/**
 * Emissão automática das cobranças no Asaas (Financeiro › Cobrança automática; começa DESLIGADA).
 *
 * - Contrato fica ativo (todos assinaram): emite o carnê 1 (entrada + parcelas dos primeiros 12 meses).
 * - Rotina diária: emite o próximo carnê quando a 1ª parcela dele vence em até 45 dias.
 * - Travas: Asaas configurado; cadastro do comprador completo (CPF, endereço, telefone); "entrada paga no ato" não vira
 *   boleto; parcela prevista que já venceu NUNCA é emitida sozinha (alguém confere se foi paga por fora).
 * - Tudo que trava vira aviso no sino do escritório (uma vez por dia por motivo) e o botão "Emitir no Asaas" continua.
 */
import { linhasDoAto } from "../../shared/entradaAto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { cobrancas, contratos } from "../../drizzle/schema";
import { blocoDoCarne } from "./dados";
import { configAsaas, type FetchFn } from "./asaas";
import { hojeBrasil, pessoasDoContrato, slugDoContrato } from "./servico";

const CHAVE_LIGADA = "emissao_auto_ligada";
export const DIAS_ANTECEDENCIA = 45;
const HORA_INICIO = 8, HORA_FIM = 20;
const DIA_MS = 86_400_000;

export async function emissaoAutoLigada(): Promise<boolean> {
  const { lerConfig } = await import("../configSistema");
  return (await lerConfig(CHAVE_LIGADA)) === "1";
}
export async function definirEmissaoAuto(ligada: boolean, usuarioId: number) {
  const { gravarConfig } = await import("../configSistema");
  await gravarConfig(CHAVE_LIGADA, ligada ? "1" : "0", usuarioId);
}

const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
const dia = (v: unknown) => String(v ?? "").slice(0, 10);

/** O que falta no cadastro do comprador para o Asaas aceitar o boleto */
export function faltasDoCadastro(p: Record<string, any> | null | undefined): string[] {
  if (!p) return ["comprador"];
  const f: string[] = [];
  if (String(p.cpfCnpj ?? "").replace(/\D/g, "").length < 11) f.push("CPF/CNPJ");
  if (!p.cep || !p.logradouro || !p.cidade || !p.uf) f.push("endereço completo (CEP, rua, cidade e UF)");
  if (String(p.telefone1 ?? p.telefone2 ?? "").replace(/\D/g, "").length < 10) f.push("telefone");
  return f;
}

export interface PlanoEmissao {
  /** Carnês a emitir agora, com as linhas de cada um */
  blocos: { bloco: number; ids: number[] }[];
  /** Previstas que já venceram sem boleto (não emitidas sozinhas) */
  vencidasSemBoleto: number;
  /** Id da entrada paga no ato (pulada), se houver */
  entradaNoAto: number | null;
}

/**
 * Regras puras: dadas as linhas do contrato e hoje, quais carnês saem agora.
 * Um carnê sai quando tem parcela prevista que vence de hoje até hoje+45; dele saem só as previstas de hoje em diante.
 */
export function planejarEmissao(linhas: { id: number; tipo: string; numero: number; vencimento: string; status: string }[], hoje: string, entradaPagaNoAto: boolean): PlanoEmissao {
  const ordem = blocoDoCarne(linhas.map(l => ({ ...l, numero: Number(l.numero), vencimento: dia(l.vencimento) })), "completo");
  const entradaNoAto = entradaPagaNoAto && ordem[0] && ordem[0].status === "prevista" ? ordem[0].id : null;
  // Entrada recebida no ato: nenhuma parte dela (boleto/PIX e cartão, se dividida) vira cobrança
  const doAto = new Set(entradaPagaNoAto ? linhasDoAto(ordem).filter(l => l.status === "prevista").map(l => l.id) : []);
  const limite = somaDias(hoje, DIAS_ANTECEDENCIA);
  const elegivel = (l: { id: number; status: string; vencimento: string }) => l.status === "prevista" && l.id !== entradaNoAto && !doAto.has(l.id) && l.vencimento >= hoje;
  const vencidasSemBoleto = ordem.filter(l => l.status === "prevista" && l.id !== entradaNoAto && !doAto.has(l.id) && l.vencimento < hoje).length;
  const blocos: PlanoEmissao["blocos"] = [];
  const totalBlocos = Math.ceil(ordem.length / 12);
  for (let b = 1; b <= totalBlocos; b++) {
    const doBloco = blocoDoCarne(ordem, b);
    if (!doBloco.some(l => elegivel(l) && l.vencimento <= limite)) continue;
    blocos.push({ bloco: b, ids: doBloco.filter(elegivel).map(l => l.id) });
  }
  return { blocos, vencidasSemBoleto, entradaNoAto };
}

/** Aviso no sino do escritório, no máximo uma vez por dia por contrato e motivo */
async function avisar(contratoId: number, numero: string, motivoChave: string, motivo: string, hoje: string) {
  try {
    const { lerConfig, gravarConfig } = await import("../configSistema");
    const k = `emissao_aviso:${contratoId}:${motivoChave}`;
    if ((await lerConfig(k)) === hoje) return;
    await gravarConfig(k, hoje, null);
    const { notificarEmissaoCobranca } = await import("../notificacoes");
    await notificarEmissaoCobranca({ contratoId, contrato: numero, motivo, chave: `${k}:${hoje}` });
  } catch (e: any) { console.warn("[Emissão automática] aviso:", e?.message); }
}

export type ResultadoEmissao = { contratoId: number; emitidas: number; motivo: string | null };

/** Emite o que cabe agora para um contrato (ativação ou rotina). `forcar` ignora a chave liga/desliga */
export async function emitirAutomatico(contratoId: number, o: { agora?: number; fetchFn?: FetchFn; forcar?: boolean } = {}): Promise<ResultadoEmissao> {
  if (!o.forcar && !(await emissaoAutoLigada())) return { contratoId, emitidas: 0, motivo: "desligada" };
  const db: any = await getDb();
  if (!db) return { contratoId, emitidas: 0, motivo: "sem banco" };
  const hoje = o.agora ? new Date(o.agora - 3 * 3600_000).toISOString().slice(0, 10) : hojeBrasil();
  const [c]: any[] = await db.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c || c.status !== "ativo") return { contratoId, emitidas: 0, motivo: "contrato não ativo" };
  const linhas: any[] = await db.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  const plano = planejarEmissao(linhas, hoje, c.entradaPagaNoAto === true || c.entradaPagaNoAto === 1);

  if (plano.vencidasSemBoleto) {
    await avisar(contratoId, c.numero, "vencidas", `${plano.vencidasSemBoleto} parcela(s) já vencida(s) sem boleto no contrato ${c.numero}. Confira se foram pagas por fora: registre o pagamento ou emita a cobrança na tela do contrato.`, hoje);
  }
  if (!plano.blocos.length) return { contratoId, emitidas: 0, motivo: "nada a emitir agora" };

  const slug = await slugDoContrato(contratoId);
  if (!configAsaas(process.env, slug)) {
    await avisar(contratoId, c.numero, "asaas", `O Asaas não está configurado: as cobranças do contrato ${c.numero} não foram emitidas.`, hoje);
    return { contratoId, emitidas: 0, motivo: "Asaas não configurado" };
  }
  const { comprador } = await pessoasDoContrato(contratoId);
  const faltas = faltasDoCadastro(comprador);
  if (faltas.length) {
    await avisar(contratoId, c.numero, "cadastro", `Cobranças do contrato ${c.numero} paradas: falta ${faltas.join(", ")} no cadastro do comprador. Complete o cadastro e elas saem sozinhas (ou use "Emitir no Asaas").`, hoje);
    return { contratoId, emitidas: 0, motivo: `cadastro incompleto: ${faltas.join(", ")}` };
  }

  const { emitirCarneNoAsaas } = await import("./emissao");
  let emitidas = 0;
  for (const b of plano.blocos) {
    const ids = new Set(b.ids);
    try {
      emitidas += (await emitirCarneNoAsaas(contratoId, b.bloco, { fetchFn: o.fetchFn, filtro: l => ids.has(Number(l.id)), origem: "automatica" })).emitidas;
    } catch (e: any) {
      await avisar(contratoId, c.numero, `erro${b.bloco}`, `Falha ao emitir o carnê ${b.bloco} do contrato ${c.numero} no Asaas: ${String(e?.message ?? e).slice(0, 200)}. Tente pelo botão "Emitir no Asaas".`, hoje);
      return { contratoId, emitidas, motivo: "erro no Asaas" };
    }
  }
  if (emitidas) {
    await avisar(contratoId, c.numero, `ok${plano.blocos.map(b => b.bloco).join("-")}`,
      `${emitidas} cobrança(s) do contrato ${c.numero} emitida(s) no Asaas (carnê ${plano.blocos.map(b => b.bloco).join(", ")}).${plano.entradaNoAto ? " A entrada foi marcada como paga no ato: registre o pagamento dela." : ""}`, hoje);
  }
  return { contratoId, emitidas, motivo: null };
}

/** Logo depois da ativação do contrato: não trava a assinatura (erro vira aviso) */
export function aposAtivarContrato(contratoId: number) {
  emitirAutomatico(contratoId).catch(e => console.warn("[Emissão automática] ativação:", e?.message));
}

/** Rotina: todos os contratos ativos (ligada e em horário comercial) */
export async function rotinaEmissaoAuto(agora = Date.now(), fetchFn?: FetchFn) {
  const hora = new Date(agora - 3 * 3600_000).getUTCHours();
  if (hora < HORA_INICIO || hora >= HORA_FIM) return { contratos: 0, emitidas: 0, motivo: "fora do horário" };
  if (!(await emissaoAutoLigada())) return { contratos: 0, emitidas: 0, motivo: "desligada" };
  const db: any = await getDb();
  if (!db) return { contratos: 0, emitidas: 0, motivo: "sem banco" };
  const ativos: any[] = await db.select({ id: contratos.id }).from(contratos).where(eq(contratos.status, "ativo"));
  let emitidas = 0;
  for (const c of ativos) emitidas += (await emitirAutomatico(Number(c.id), { agora, fetchFn }).catch(() => ({ emitidas: 0 }))).emitidas;
  if (emitidas) console.log(`[Emissão automática] ${emitidas} cobrança(s) emitida(s)`);
  return { contratos: ativos.length, emitidas, motivo: null };
}

/** Prévia da tela: o que sairia hoje, por contrato (sem emitir) */
export async function previaEmissao(agora = Date.now()) {
  const db: any = await getDb();
  if (!db) return [];
  const hoje = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
  const ativos: any[] = await db.select().from(contratos).where(eq(contratos.status, "ativo"));
  const out = [];
  for (const c of ativos) {
    const linhas: any[] = await db.select().from(cobrancas).where(and(eq(cobrancas.contratoId, Number(c.id))));
    const p = planejarEmissao(linhas, hoje, c.entradaPagaNoAto === true || c.entradaPagaNoAto === 1);
    if (!p.blocos.length && !p.vencidasSemBoleto) continue;
    const { comprador } = await pessoasDoContrato(Number(c.id)).catch(() => ({ comprador: null as any }));
    out.push({
      contratoId: Number(c.id), contrato: c.numero, chacara: c.loteCodigo, comprador: comprador?.nome ?? "—",
      carnes: p.blocos.map(b => b.bloco), parcelas: p.blocos.reduce((s, b) => s + b.ids.length, 0),
      vencidasSemBoleto: p.vencidasSemBoleto, faltas: faltasDoCadastro(comprador), entradaNoAto: !!p.entradaNoAto,
    });
  }
  return out;
}

let iniciado = false;
export function iniciarEmissaoAuto() {
  if (iniciado) return;
  iniciado = true;
  const tick = () => rotinaEmissaoAuto().catch(e => console.warn("[Emissão automática]", e?.message));
  setInterval(tick, 6 * 3600_000).unref?.();
  setTimeout(tick, 150_000).unref?.();
}
