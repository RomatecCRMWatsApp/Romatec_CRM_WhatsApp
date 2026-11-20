/**
 * Canal do titular (LGPD art. 18): pedido sem conta, com protocolo, verificação proporcional do contato,
 * responsável, prazo configurável e trilha mínima.
 *
 * Verificação: código de 6 dígitos enviado ao telefone/e-mail INFORMADO pela pessoa (prova que ela controla aquele
 * canal). O envio é injetável (testes nunca enviam). Sem envio configurado, o pedido fica "aguardando verificação" e o
 * escritório confirma manualmente, com justificativa registrada. A resposta pública é sempre a mesma, exista ou não a
 * pessoa na base (sem enumeração).
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { privacidadePedidos, privacidadePedidoEventos } from '../../drizzle/schema';
import { normalizarContato, STATUS_PEDIDO, TIPOS_PEDIDO, type StatusPedido, type TipoPedido } from '../../shared/privacidade';
import { createRateLimiter } from '../lead-intake';
import { prazoDias, segredo } from './config';

export class PrivacidadeErro extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'PrivacidadeErro'; }
}

export type EnviarCodigo = (destino: { contato: string; tipo: 'telefone' | 'email' }, mensagem: string) => Promise<boolean>;

const CODIGO_VALIDADE_MS = 30 * 60 * 1000;
const MAX_TENTATIVAS = 5;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// 5 pedidos por hora por IP e 3 por dia para o mesmo contato (anti-abuso do canal)
const limiteIp = createRateLimiter(5, 60 * 60 * 1000);
const limiteContato = createRateLimiter(3, 24 * 60 * 60 * 1000);
const limiteConsulta = createRateLimiter(30, 60 * 60 * 1000);

const resumo = (s: string) => createHash('sha256').update(`${segredo()}|${s}`).digest('hex');
const hashCodigo = (protocolo: string, codigo: string) => createHmac('sha256', segredo()).update(`priv|${protocolo}|${codigo}`).digest('hex');

function novoProtocolo(agora: number): string {
  const b = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALFABETO[b[i] % ALFABETO.length];
  return `LGPD-${new Date(agora).getUTCFullYear()}-${s}`;
}

async function db() {
  const d = await getDb();
  if (!d) throw new PrivacidadeErro('Sistema indisponível no momento. Tente de novo mais tarde.', 503);
  return d as any;
}

export async function registrarEvento(pedidoId: number, evento: string, usuarioId: number | null, detalhe: Record<string, unknown> | null = null, agora = Date.now()) {
  const d = await db();
  await d.insert(privacidadePedidoEventos).values({ pedidoId, evento, usuarioId, detalheJson: detalhe ? JSON.stringify(detalhe) : null, criadoEm: agora });
}

export interface NovoPedido { tipo: string; nome: string; contato: string; descricao?: string | null }

/** Cria o pedido e (se houver envio) manda o código. Retorno público: só o protocolo e se o código saiu. */
export async function criarPedido(input: NovoPedido, o: { ip: string; enviar?: EnviarCodigo | null; agora?: number }) {
  const agora = o.agora ?? Date.now();
  if (!Object.hasOwn(TIPOS_PEDIDO, input.tipo)) throw new PrivacidadeErro('Escolha o tipo do pedido.');
  const nome = String(input.nome ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 3 || nome.length > 160) throw new PrivacidadeErro('Informe o seu nome completo.');
  const c = normalizarContato(input.contato);
  if (!c) throw new PrivacidadeErro('Informe um celular com DDD ou um e-mail válido.');
  const descricao = String(input.descricao ?? '').trim().slice(0, 2000) || null;
  const ipHash = resumo(`ip|${o.ip}`);
  if (!limiteIp(ipHash, agora) || !limiteContato(resumo(`c|${c.contato}`), agora)) {
    throw new PrivacidadeErro('Muitos pedidos em pouco tempo. Tente de novo mais tarde.', 429);
  }
  const protocolo = novoProtocolo(agora);
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const d = await db();
  await d.insert(privacidadePedidos).values({
    protocolo, tipo: input.tipo, nome, contato: c.contato, contatoTipo: c.tipo, descricao, status: 'aguardando_verificacao',
    codigoHash: hashCodigo(protocolo, codigo), codigoExpira: agora + CODIGO_VALIDADE_MS, tentativas: 0, ipHash, criadoEm: agora, atualizadoEm: agora,
  });
  const [p] = await d.select({ id: privacidadePedidos.id }).from(privacidadePedidos).where(eq(privacidadePedidos.protocolo, protocolo)).limit(1);
  let enviado = false;
  if (o.enviar) {
    try { enviado = await o.enviar(c, `Romatec — código para confirmar o seu pedido de privacidade ${protocolo}: ${codigo}. Vale por 30 minutos. Se não foi você, ignore.`); }
    catch { enviado = false; }
  }
  await registrarEvento(p.id, 'criado', null, { tipo: input.tipo, codigoEnviado: enviado }, agora);
  return { protocolo, codigoEnviado: enviado };
}

/** Confirma o contato com o código; o prazo de resposta começa a contar aqui */
export async function verificarCodigo(protocolo: string, codigo: string, agora = Date.now()) {
  const d = await db();
  const [p]: any[] = await d.select().from(privacidadePedidos).where(eq(privacidadePedidos.protocolo, String(protocolo).toUpperCase().trim())).limit(1);
  const erro = new PrivacidadeErro('Código inválido ou vencido.');
  if (!p || p.status !== 'aguardando_verificacao' || !p.codigoHash) throw erro;
  if ((p.tentativas ?? 0) >= MAX_TENTATIVAS) throw new PrivacidadeErro('Muitas tentativas. Faça um novo pedido ou aguarde o contato do escritório.', 429);
  await d.update(privacidadePedidos).set({ tentativas: (p.tentativas ?? 0) + 1 }).where(eq(privacidadePedidos.id, p.id));
  const esperado = Buffer.from(p.codigoHash, 'hex');
  const recebido = Buffer.from(hashCodigo(p.protocolo, String(codigo ?? '').trim()), 'hex');
  if (agora > Number(p.codigoExpira) || esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    await registrarEvento(p.id, 'codigo_incorreto', null, { tentativa: (p.tentativas ?? 0) + 1 }, agora);
    throw erro;
  }
  await d.update(privacidadePedidos).set({ status: 'aberto', verificadoEm: agora, prazoEm: agora + prazoDias() * 86_400_000, codigoHash: null, atualizadoEm: agora }).where(eq(privacidadePedidos.id, p.id));
  await registrarEvento(p.id, 'contato_verificado', null, { como: 'codigo' }, agora);
  return { ok: true as const };
}

/** Consulta pública pelo protocolo: só situação e datas, nunca nome/contato */
export async function consultarPedido(protocolo: string, ip: string, agora = Date.now()) {
  if (!limiteConsulta(resumo(`q|${ip}`), agora)) throw new PrivacidadeErro('Muitas consultas. Tente mais tarde.', 429);
  const d = await db();
  const [p]: any[] = await d.select().from(privacidadePedidos).where(eq(privacidadePedidos.protocolo, String(protocolo).toUpperCase().trim())).limit(1);
  if (!p) return null;
  return { protocolo: p.protocolo, tipo: p.tipo as TipoPedido, status: p.status as StatusPedido, criadoEm: Number(p.criadoEm), prazoEm: p.prazoEm ? Number(p.prazoEm) : null, concluidoEm: p.concluidoEm ? Number(p.concluidoEm) : null };
}

// ─── Escritório (administrador) ──────────────────────────────────────────────

export async function listarPedidos(filtro: { status?: string } = {}) {
  const d = await db();
  const q = d.select().from(privacidadePedidos);
  const rows: any[] = filtro.status ? await q.where(eq(privacidadePedidos.status, filtro.status)).orderBy(desc(privacidadePedidos.id)) : await q.orderBy(desc(privacidadePedidos.id));
  const agora = Date.now();
  return rows.map(p => ({
    id: p.id, protocolo: p.protocolo, tipo: p.tipo, nome: p.nome, contato: p.contato, contatoTipo: p.contatoTipo, descricao: p.descricao,
    status: p.status, responsavelId: p.responsavelId, prazoEm: p.prazoEm ? Number(p.prazoEm) : null, criadoEm: Number(p.criadoEm),
    verificadoEm: p.verificadoEm ? Number(p.verificadoEm) : null, concluidoEm: p.concluidoEm ? Number(p.concluidoEm) : null, resposta: p.resposta,
    atrasado: !!p.prazoEm && !p.concluidoEm && Number(p.prazoEm) < agora,
  }));
}

export async function pedidoPorId(id: number) {
  const d = await db();
  const [p]: any[] = await d.select().from(privacidadePedidos).where(eq(privacidadePedidos.id, id)).limit(1);
  if (!p) throw new PrivacidadeErro('Pedido não encontrado.', 404);
  return p;
}

export async function eventosDoPedido(id: number) {
  const d = await db();
  return (await d.select().from(privacidadePedidoEventos).where(eq(privacidadePedidoEventos.pedidoId, id)).orderBy(privacidadePedidoEventos.id))
    .map((e: any) => ({ ...e, criadoEm: Number(e.criadoEm), detalhe: e.detalheJson ? JSON.parse(e.detalheJson) : null }));
}

/** Verificação manual (ex.: o titular ligou e foi identificado por outro meio): exige justificativa, fica na trilha */
export async function verificarManual(id: number, justificativa: string, usuarioId: number, agora = Date.now()) {
  const j = String(justificativa ?? '').trim();
  if (j.length < 10) throw new PrivacidadeErro('Descreva como a identidade foi confirmada (mín. 10 caracteres).');
  const p = await pedidoPorId(id);
  if (p.status !== 'aguardando_verificacao') throw new PrivacidadeErro('O pedido já foi verificado.', 409);
  const d = await db();
  await d.update(privacidadePedidos).set({ status: 'aberto', verificadoEm: agora, prazoEm: agora + prazoDias() * 86_400_000, codigoHash: null, atualizadoEm: agora }).where(eq(privacidadePedidos.id, id));
  await registrarEvento(id, 'contato_verificado', usuarioId, { como: 'manual', justificativa: j.slice(0, 500) }, agora);
}

export async function atualizarPedido(id: number, mudanca: { status?: string; responsavelId?: number | null; resposta?: string | null }, usuarioId: number, agora = Date.now()) {
  const p = await pedidoPorId(id);
  const set: Record<string, unknown> = { atualizadoEm: agora };
  if (mudanca.status !== undefined) {
    if (!Object.hasOwn(STATUS_PEDIDO, mudanca.status) || mudanca.status === 'aguardando_verificacao') throw new PrivacidadeErro('Situação inválida.');
    if (p.status === 'aguardando_verificacao') throw new PrivacidadeErro('Confirme a identidade antes de atender o pedido.', 409);
    if ((mudanca.status === 'concluido' || mudanca.status === 'indeferido') && !String(mudanca.resposta ?? p.resposta ?? '').trim()) {
      throw new PrivacidadeErro('Registre a resposta/justificativa dada ao titular antes de encerrar.');
    }
    set.status = mudanca.status;
    set.concluidoEm = mudanca.status === 'concluido' || mudanca.status === 'indeferido' ? agora : null;
  }
  if (mudanca.responsavelId !== undefined) set.responsavelId = mudanca.responsavelId;
  if (mudanca.resposta !== undefined) set.resposta = mudanca.resposta ? String(mudanca.resposta).slice(0, 4000) : null;
  const d = await db();
  await d.update(privacidadePedidos).set(set).where(and(eq(privacidadePedidos.id, id)));
  await registrarEvento(id, 'atualizado', usuarioId, { status: mudanca.status, responsavelId: mudanca.responsavelId, comResposta: mudanca.resposta !== undefined }, agora);
}

/** Envio padrão do código: só quando PRIVACIDADE_ENVIO_CODIGO=whatsapp e o contato é telefone (Z-API do escritório) */
export async function enviadorPadrao(env: Record<string, string | undefined> = process.env): Promise<EnviarCodigo | null> {
  if (String(env.PRIVACIDADE_ENVIO_CODIGO ?? '').toLowerCase() !== 'whatsapp') return null;
  return async (destino, mensagem) => {
    if (destino.tipo !== 'telefone') return false;
    const { getCompanyConfig } = await import('../db');
    const config: any = await getCompanyConfig();
    if (!config?.zApiInstanceId || !config?.zApiToken) return false;
    const { sendMessageViaZAPI } = await import('../zapi-integration');
    const r: any = await sendMessageViaZAPI({ instanceId: config.zApiInstanceId, token: config.zApiToken, clientToken: config.zApiClientToken || undefined, phone: destino.contato, message: mensagem });
    return !!r?.success;
  };
}
