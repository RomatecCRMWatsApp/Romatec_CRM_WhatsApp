/**
 * Régua de cobrança no WhatsApp do comprador (shared/reguaCobranca.ts tem as etapas e os textos):
 * 3 dias antes, no dia, 3 dias depois e 10 dias depois do vencimento, com o link de pagamento e o carnê digital.
 *
 * - Só roda ligada (Financeiro › Cobrança automática; começa desligada) e entre 9h e 19h de Brasília.
 * - Só contratos assinados/ativos e parcelas já emitidas no Asaas (com boleto/Pix); cada parcela recebe cada etapa uma vez.
 * - Sem telefone no cadastro do comprador: registra a falha e não tenta de novo.
 */
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import { cobrancaAvisos, cobrancas, contratos, empreendimentos } from "../../drizzle/schema";
import { telefoneWhatsApp } from "../../shared/contratos";
import { urlPixDaCobranca } from "./dados";
import {
  CONTRATOS_COM_REGUA, DIA_DA_ETAPA, ETAPAS_REGUA, JANELA_DIAS, ROTULO_ETAPA, STATUS_COBRAVEIS, etapaDeHoje, rotuloParcelaAviso, textoAviso,
  type EtapaRegua,
} from "../../shared/reguaCobranca";

const CHAVE_LIGADA = "regua_cobranca_ligada";
const HORA_INICIO = 9, HORA_FIM = 19;
const DIA_MS = 86_400_000;

export type Enviador = (telefone: string, texto: string) => Promise<unknown>;

const hojeBr = (agora: number) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

export async function reguaLigada(): Promise<boolean> {
  const { lerConfig } = await import("../configSistema");
  return (await lerConfig(CHAVE_LIGADA)) === "1";
}
export async function definirReguaLigada(ligada: boolean, usuarioId: number) {
  const { gravarConfig } = await import("../configSistema");
  await gravarConfig(CHAVE_LIGADA, ligada ? "1" : "0", usuarioId);
}

export interface AvisoPlanejado {
  cobrancaId: number; contratoId: number; contratoNumero: string; etapa: EtapaRegua; rotuloEtapa: string;
  comprador: string; telefone: string | null; parcela: string; valor: number; vencimento: string; texto: string;
}

/** O que sai hoje (sem enviar): usado na prévia da tela e pela rotina */
export async function avisosDeHoje(agora = Date.now()): Promise<AvisoPlanejado[]> {
  const db: any = await getDb();
  if (!db) return [];
  const hoje = hojeBr(agora);
  // Janela de vencimentos que podem cair em alguma etapa hoje
  const min = Math.min(...ETAPAS_REGUA.map(e => DIA_DA_ETAPA[e])), max = Math.max(...ETAPAS_REGUA.map(e => DIA_DA_ETAPA[e])) + JANELA_DIAS;
  const de = somaDias(hoje, -max), ate = somaDias(hoje, -min);
  const parcelas: any[] = await db.select().from(cobrancas)
    .where(and(inArray(cobrancas.status, [...STATUS_COBRAVEIS]), isNotNull(cobrancas.asaasPaymentId), gte(cobrancas.vencimento, de), lte(cobrancas.vencimento, ate)));
  if (!parcelas.length) return [];
  const idsContrato = Array.from(new Set(parcelas.map(p => Number(p.contratoId))));
  const [cts, emps, ja]: any[][] = await Promise.all([
    db.select().from(contratos).where(and(inArray(contratos.id, idsContrato), inArray(contratos.status, [...CONTRATOS_COM_REGUA]))),
    db.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos),
    db.select({ cobrancaId: cobrancaAvisos.cobrancaId, etapa: cobrancaAvisos.etapa }).from(cobrancaAvisos).where(inArray(cobrancaAvisos.cobrancaId, parcelas.map(p => Number(p.id)))),
  ]);
  const contrato = new Map(cts.map(c => [Number(c.id), c]));
  const { pessoasDoContrato, urlPublica } = await import("./servico");
  const compradores = new Map<number, any>();
  for (const id of Array.from(contrato.keys())) compradores.set(id, (await pessoasDoContrato(id).catch(() => ({ comprador: null }))).comprador);

  const out: AvisoPlanejado[] = [];
  for (const p of parcelas) {
    const c = contrato.get(Number(p.contratoId));
    if (!c) continue;
    const vencimento = String(p.vencimento).slice(0, 10);
    const etapa = etapaDeHoje(vencimento, hoje, ja.filter(a => Number(a.cobrancaId) === Number(p.id)).map(a => a.etapa));
    if (!etapa) continue;
    const comp = compradores.get(Number(c.id));
    const valor = Number(p.valor) || 0;
    const parcela = rotuloParcelaAviso({ tipo: p.tipo, numero: Number(p.numero), total: Number(p.total) });
    out.push({
      cobrancaId: Number(p.id), contratoId: Number(c.id), contratoNumero: c.numero, etapa, rotuloEtapa: ROTULO_ETAPA[etapa],
      comprador: comp?.nome ?? "Comprador", telefone: telefoneWhatsApp(comp?.telefone1) ?? telefoneWhatsApp(comp?.telefone2), parcela, valor, vencimento,
      texto: textoAviso(etapa, {
        nome: comp?.nome ?? "", parcela, valor, vencimento,
        empreendimento: emps.find(e => Number(e.id) === Number(c.empreendimentoId))?.nome ?? "Bom Jardims", chacara: c.loteCodigo,
        linkPagamento: p.bankSlipUrl ?? null, linkPortal: `${urlPublica()}/c/${c.codigoVerificacao}`,
        pixCopiaECola: etapa === "antes" || etapa === "dia" ? p.pixPayload ?? null : null,
        linkPix: (etapa === "antes" || etapa === "dia") && p.pixPayload ? urlPixDaCobranca(Number(p.id)) : null,
      }),
    });
  }
  return out.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Envia os avisos de hoje (ligada, dentro do horário). Grava cada envio para não repetir. */
export async function processarRegua(agora = Date.now(), enviar?: Enviador, forcar = false) {
  const horaBr = new Date(agora - 3 * 3600_000).getUTCHours();
  if (!forcar && (horaBr < HORA_INICIO || horaBr >= HORA_FIM)) return { enviados: 0, falhas: 0, motivo: "fora do horário" };
  if (!forcar && !(await reguaLigada())) return { enviados: 0, falhas: 0, motivo: "desligada" };
  const db: any = await getDb();
  const envia: Enviador = enviar ?? (async (tel, txt) => (await import("../leads/zapiClient")).enviarTexto(tel, txt));
  let enviados = 0, falhas = 0;
  for (const a of await avisosDeHoje(agora)) {
    // Reserva a etapa antes de enviar (UNIQUE cobrancaId+etapa): dois servidores ao mesmo tempo não mandam duas vezes
    try {
      await db.insert(cobrancaAvisos).values({ cobrancaId: a.cobrancaId, contratoId: a.contratoId, etapa: a.etapa, telefone: a.telefone, ok: false, erro: "enviando", enviadoEm: new Date(agora) } as any);
    } catch { continue; }
    let erro: string | null = null;
    if (!a.telefone) erro = "comprador sem telefone no cadastro";
    else {
      try { await envia(a.telefone, a.texto); } catch (e: any) { erro = String(e?.message ?? "falha no envio").slice(0, 250); }
    }
    await db.update(cobrancaAvisos).set({ ok: !erro, erro } as any).where(and(eq(cobrancaAvisos.cobrancaId, a.cobrancaId), eq(cobrancaAvisos.etapa, a.etapa)));
    if (erro) falhas++; else enviados++;
  }
  if (enviados || falhas) console.log(`[Régua de cobrança] ${enviados} enviado(s), ${falhas} falha(s)`);
  return { enviados, falhas, motivo: null };
}

/** Últimos avisos (tela do Financeiro) */
export async function historicoAvisos(limite = 60) {
  const db: any = await getDb();
  if (!db) return [];
  const rs: any[] = await db.select().from(cobrancaAvisos).orderBy(desc(cobrancaAvisos.enviadoEm)).limit(limite);
  if (!rs.length) return [];
  const cts: any[] = await db.select({ id: contratos.id, numero: contratos.numero, loteCodigo: contratos.loteCodigo }).from(contratos)
    .where(inArray(contratos.id, Array.from(new Set(rs.map(r => Number(r.contratoId))))));
  const { pessoasDoContrato } = await import("./servico");
  const nomes = new Map<number, string>();
  for (const c of cts) nomes.set(Number(c.id), (await pessoasDoContrato(Number(c.id)).catch(() => ({ comprador: null }))).comprador?.nome ?? "—");
  return rs.map(r => {
    const c = cts.find(x => Number(x.id) === Number(r.contratoId));
    return {
      id: Number(r.id), quando: r.enviadoEm ? new Date(r.enviadoEm).toISOString() : null, etapa: r.etapa as EtapaRegua, rotuloEtapa: ROTULO_ETAPA[r.etapa as EtapaRegua] ?? r.etapa,
      contratoId: Number(r.contratoId), contrato: c?.numero ?? "—", chacara: c?.loteCodigo ?? "—", comprador: nomes.get(Number(r.contratoId)) ?? "—",
      ok: r.ok === true || r.ok === 1, erro: r.erro ?? null,
    };
  });
}

let iniciado = false;
export function iniciarReguaCobranca() {
  if (iniciado) return;
  iniciado = true;
  const tick = () => processarRegua().catch(e => console.warn("[Régua de cobrança]", e?.message));
  setInterval(tick, 30 * 60_000).unref?.();
  setTimeout(tick, 120_000).unref?.();
}
