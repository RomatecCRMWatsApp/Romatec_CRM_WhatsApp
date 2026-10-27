/**
 * NFS-e pela Spedy (https://docs.spedy.com.br) sobre a fila saasNfse: o administrador clica "Emitir" numa nota PENDENTE
 * (ou REJEITADA), a nota vai para POST /v1/service-invoices e fica ENVIADA; a autorização chega pelo webhook
 * (invoice.status_changed, assinado no padrão Standard Webhooks) ou pela consulta da rotina — e a nota vira EMITIDA com
 * número e links do PDF/XML, ou REJEITADA com a mensagem da prefeitura.
 *
 * Tudo por variável de ambiente (nada no código): SPEDY_API_KEY, SPEDY_AMBIENTE (sandbox | producao, padrão sandbox),
 * SPEDY_BASE_URL (opcional), SPEDY_EMPRESA_ID (opcional), SPEDY_ISS_ALIQUOTA (opcional). A chave nunca vai ao navegador
 * nem ao log. Em sandbox, recusa emitir se a empresa na Spedy estiver configurada com NFS-e em "production"
 * (a Spedy permite produção dentro do sandbox — nota com validade fiscal real).
 *
 * Açailândia/MA emite pelo Sig ISS: autenticação por usuário e senha da prefeitura (configurados no painel da Spedy,
 * serviceInvoice.userName/password) e sem certificado A1. O código de serviço enviado é o federalServiceCode (LC 116).
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { saasEventosPagamento, saasFaturas, saasNfse, users } from '../../drizzle/schema';
import { NfseErro } from './nfse';

const SANDBOX = 'https://sandbox-api.spedy.com.br/v1';
const PRODUCAO = 'https://api.spedy.com.br/v1';

export interface ConfigSpedy {
  apiKey: string | null; ambiente: 'sandbox' | 'producao'; baseUrl: string; empresaId: string | null; issAliquota: number | null; configurada: boolean; erro: string | null;
}

export function configSpedy(env: Record<string, string | undefined> = process.env): ConfigSpedy {
  const apiKey = env.SPEDY_API_KEY?.trim() || null;
  const ambiente = env.SPEDY_AMBIENTE?.trim().toLowerCase() === 'producao' ? 'producao' : 'sandbox';
  const baseUrl = (env.SPEDY_BASE_URL?.trim() || (ambiente === 'producao' ? PRODUCAO : SANDBOX)).replace(/\/+$/, '');
  const aliq = Number(String(env.SPEDY_ISS_ALIQUOTA ?? '').replace(',', '.'));
  // Trava: o host precisa bater com o ambiente (sandbox nunca aponta para a API de produção, e vice-versa)
  const hostSandbox = /sandbox-api\.spedy\.com\.br/.test(baseUrl);
  const erro = !apiKey ? 'SPEDY_API_KEY não configurada'
    : ambiente === 'sandbox' && !hostSandbox ? 'SPEDY_AMBIENTE=sandbox, mas SPEDY_BASE_URL não é o sandbox da Spedy'
    : ambiente === 'producao' && hostSandbox ? 'SPEDY_AMBIENTE=producao, mas SPEDY_BASE_URL aponta para o sandbox' : null;
  return { apiKey, ambiente, baseUrl, empresaId: env.SPEDY_EMPRESA_ID?.trim() || null, issAliquota: aliq > 0 && aliq <= 5 ? aliq : null, configurada: !erro, erro };
}

/** Transporte HTTP (injetável nos testes) */
export const http = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };

export class SpedyErro extends NfseErro { constructor(msg: string, status = 502, public detalhe?: unknown) { super(msg, status); this.name = 'NfseErro'; } }

async function chamar<T = any>(cfg: ConfigSpedy, metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown): Promise<T> {
  if (!cfg.configurada) throw new SpedyErro(cfg.erro ?? 'Spedy não configurada', 503);
  let r: Response;
  try {
    r = await http.fetch(`${cfg.baseUrl}${caminho}`, {
      method: metodo, signal: AbortSignal.timeout(30_000),
      headers: { 'X-Api-Key': cfg.apiKey!, Accept: 'application/json', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch (e: any) { throw new SpedyErro(`Spedy fora do ar: ${String(e?.message ?? e).slice(0, 120)}`, 503); }
  const texto = await r.text();
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
  if (!r.ok) {
    const msg = r.status === 403 ? 'Chave da Spedy inválida ou de outro ambiente (403)'
      : r.status === 429 ? 'Limite de requisições da Spedy atingido; tente em instantes'
      : mensagemErro(json) || `HTTP ${r.status}`;
    throw new SpedyErro(`Spedy: ${msg}`.slice(0, 400), r.status >= 500 ? 502 : 400, json);
  }
  return json as T;
}

/** Mensagem legível do corpo de erro da Spedy (formatos variam: message, errors[], title) */
export function mensagemErro(j: any): string {
  if (!j) return '';
  if (typeof j === 'string') return j;
  const lista = Array.isArray(j.errors) ? j.errors.map((e: any) => e?.message ?? e?.description ?? (typeof e === 'string' ? e : '')).filter(Boolean)
    : j.errors && typeof j.errors === 'object' ? Object.values(j.errors).flat().map(String) : [];
  return [j.message ?? j.title ?? j.detail, ...lista].filter(Boolean).join(' · ').slice(0, 400);
}

const banco = async () => { const d = await getDb(); if (!d) throw new NfseErro('Banco indisponível', 503); return d as any; };
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Código da nota no nosso lado (idempotência da Spedy: reenvio com o mesmo integrationId atualiza, não duplica) */
export const integrationIdDe = (nfseId: number) => `romatec-nfse-${nfseId}`;

/** Corpo do POST /v1/service-invoices a partir da nota da fila + cadastro atual do tomador (endereço estruturado) */
export function montarNota(n: any, u: any | null, cfg: Pick<ConfigSpedy, 'issAliquota'>, agora = Date.now()) {
  const doc = soDig(n.tomadorDoc) || soDig(u?.cpf);
  const endereco = u && (u.enderecoLogradouro || u.enderecoCep) ? {
    street: String(u.enderecoLogradouro ?? '').slice(0, 100) || undefined,
    number: String(u.enderecoNumero ?? 'S/N').slice(0, 10),
    additionalInformation: u.enderecoComplemento ? String(u.enderecoComplemento).slice(0, 150) : undefined,
    district: String(u.enderecoBairro ?? '').slice(0, 100) || undefined,
    postalCode: soDig(u.enderecoCep) || undefined,
    city: u.enderecoCidade ? { name: String(u.enderecoCidade), state: String(u.enderecoUf ?? '').toUpperCase() || undefined } : undefined,
  } : undefined;
  const valor = Math.round(Number(n.valor) * 100) / 100;
  return {
    integrationId: integrationIdDe(Number(n.id)),
    effectiveDate: new Date(agora - 3 * 3600_000).toISOString().slice(0, 10),
    description: String(n.discriminacao).slice(0, 2000),
    federalServiceCode: String(n.itemServico || '1.05'),
    taxationType: 'taxationInMunicipality',
    sendEmailToCustomer: !!(n.tomadorEmail || u?.email),
    receiver: {
      name: String(n.tomadorNome).slice(0, 115),
      ...(doc ? { federalTaxNumber: doc } : {}),
      ...(n.tomadorEmail || u?.email ? { email: String(n.tomadorEmail || u?.email) } : {}),
      ...(soDig(n.tomadorTelefone || u?.telefone) ? { phoneNumber: soDig(n.tomadorTelefone || u?.telefone) } : {}),
      ...(endereco ? { address: endereco } : {}),
    },
    total: { invoiceAmount: valor, ...(cfg.issAliquota ? { issRate: cfg.issAliquota } : {}) },
  };
}

/** Status fiscal da Spedy → status da fila */
export function statusDaFila(s: string | null | undefined): 'ENVIADA' | 'EMITIDA' | 'REJEITADA' | 'CANCELADA' | null {
  switch (s) {
    case 'created': case 'enqueued': case 'received': case 'inContingent': return 'ENVIADA';
    case 'authorized': return 'EMITIDA';
    case 'rejected': case 'denied': return 'REJEITADA';
    case 'canceled': return 'CANCELADA';
    default: return null;
  }
}

/** Confere, antes de emitir, se a NFS-e da empresa na Spedy não está em "production" quando o CRM está em sandbox */
export async function conferirAmbienteDaEmpresa(cfg: ConfigSpedy): Promise<{ empresaId: string | null; ambienteNfse: string | null }> {
  let empresaId = cfg.empresaId;
  if (!empresaId) {
    // Sem SPEDY_EMPRESA_ID: a chave da empresa titular lista as empresas da conta; com uma só, é ela
    const r: any = await chamar(cfg, 'GET', '/companies?page=1&pageSize=5').catch(() => null);
    const lista: any[] = Array.isArray(r) ? r : r?.items ?? r?.data ?? [];
    if (lista.length === 1) empresaId = String(lista[0].id);
  }
  if (!empresaId) {
    if (cfg.ambiente === 'sandbox') throw new SpedyErro('Informe SPEDY_EMPRESA_ID para o CRM conferir o ambiente da NFS-e antes de emitir', 412);
    return { empresaId: null, ambienteNfse: null };
  }
  const s: any = await chamar(cfg, 'GET', `/companies/${encodeURIComponent(empresaId)}/settings`);
  const ambienteNfse = s?.serviceInvoice?.environmentType ?? null;
  if (cfg.ambiente === 'sandbox' && ambienteNfse === 'production') {
    throw new SpedyErro('A empresa na Spedy está com a NFS-e em PRODUÇÃO dentro do sandbox. Troque para "simulation" ou "development" no painel antes de testar.', 412);
  }
  return { empresaId, ambienteNfse };
}

const urls = (cfg: ConfigSpedy, id: string) => ({ pdfUrl: `${cfg.baseUrl}/service-invoices/${id}/pdf`, xmlUrl: `${cfg.baseUrl}/service-invoices/${id}/xml` });

/** Grava na fila o que a Spedy devolveu (POST, GET ou webhook). Não regride: EMITIDA/CANCELADA não voltam a ENVIADA. */
export async function aplicarRetorno(nfseId: number, inv: any, cfg: ConfigSpedy, agora = Date.now()) {
  const d = await banco();
  const [n]: any[] = await d.select().from(saasNfse).where(eq(saasNfse.id, nfseId)).limit(1);
  if (!n) return null;
  const novo = statusDaFila(inv?.status);
  const finais = ['EMITIDA', 'CANCELADA'];
  if (novo === 'ENVIADA' && finais.includes(n.status)) return n.status;
  const id = inv?.id ? String(inv.id) : n.externoId;
  const msg = inv?.processingDetail?.message ?? null;
  const set: Record<string, unknown> = {
    provedor: 'spedy', externoId: id, externoStatus: String(inv?.status ?? '').slice(0, 20) || n.externoStatus,
    ambiente: String(inv?.environmentType ?? n.ambiente ?? '').slice(0, 12) || null, mensagem: msg ? String(msg).slice(0, 500) : n.mensagem, updatedAt: new Date(agora),
  };
  if (novo) set.status = novo;
  if (novo === 'EMITIDA') {
    Object.assign(set, id ? urls(cfg, id) : {}, {
      numero: inv?.number != null && Number(inv.number) > 0 ? String(inv.number).slice(0, 30) : (inv?.rps?.number != null ? `RPS ${inv.rps.number}` : n.numero),
      codigoVerificacao: inv?.authorization?.protocol ? String(inv.authorization.protocol).slice(0, 60) : n.codigoVerificacao,
      emitidaEm: n.emitidaEm ?? new Date(agora),
    });
  }
  if (novo === 'CANCELADA') set.observacao = (n.observacao ? `${n.observacao} · ` : '') + 'Cancelada na Spedy/prefeitura';
  await d.update(saasNfse).set(set as any).where(eq(saasNfse.id, nfseId));
  return novo ?? n.status;
}

/** Emite (ou reenvia a rejeitada) a NFS-e da fila pela Spedy */
export async function emitirPelaSpedy(nfseId: number, autorId: number, agora = Date.now(), env: Record<string, string | undefined> = process.env) {
  const cfg = configSpedy(env);
  if (!cfg.configurada) throw new SpedyErro(cfg.erro!, 503);
  const d = await banco();
  const [n]: any[] = await d.select().from(saasNfse).where(eq(saasNfse.id, nfseId)).limit(1);
  if (!n) throw new NfseErro('Nota não encontrada', 404);
  if (!['PENDENTE', 'REJEITADA'].includes(n.status)) throw new NfseErro(n.status === 'ENVIADA' ? 'Esta nota já foi enviada e aguarda a prefeitura' : `Nota ${n.status.toLowerCase()} não pode ser emitida`, 409);
  const [f]: any[] = await d.select({ status: saasFaturas.status }).from(saasFaturas).where(eq(saasFaturas.id, n.faturaId)).limit(1);
  if (f && f.status !== 'PAGA') throw new NfseErro('A fatura desta nota não está paga', 409);
  const [u]: any[] = await d.select().from(users).where(eq(users.id, n.usuarioId)).limit(1);
  const corpo = montarNota(n, u ?? null, cfg, agora);
  if (!corpo.receiver.federalTaxNumber) throw new NfseErro('Tomador sem CPF/CNPJ: complete o cadastro e clique em "Atualizar tomador"', 400);
  const amb = await conferirAmbienteDaEmpresa(cfg);
  const inv: any = await chamar(cfg, 'POST', '/service-invoices', corpo);
  await d.update(saasNfse).set({ emitidaPor: autorId, enviadaEm: new Date(agora), updatedAt: new Date(agora) } as any).where(eq(saasNfse.id, nfseId));
  const status = await aplicarRetorno(nfseId, { ...inv, status: inv?.status ?? 'enqueued', environmentType: inv?.environmentType ?? amb.ambienteNfse }, cfg, agora);
  console.log(`[Spedy] NFS-e ${nfseId} enviada (${cfg.ambiente}${amb.ambienteNfse ? `/${amb.ambienteNfse}` : ''}): ${inv?.id ?? '?'} → ${status}`);
  return { status, externoId: inv?.id ?? null, ambiente: cfg.ambiente, ambienteNfse: amb.ambienteNfse };
}

/** Consulta o status na Spedy (GET; não aciona a prefeitura) e atualiza a fila */
export async function consultarNaSpedy(nfseId: number, agora = Date.now(), env: Record<string, string | undefined> = process.env) {
  const cfg = configSpedy(env);
  const d = await banco();
  const [n]: any[] = await d.select().from(saasNfse).where(eq(saasNfse.id, nfseId)).limit(1);
  if (!n?.externoId) throw new NfseErro('Esta nota ainda não foi enviada à Spedy', 409);
  const inv = await chamar(cfg, 'GET', `/service-invoices/${encodeURIComponent(n.externoId)}`);
  return { status: await aplicarRetorno(nfseId, inv, cfg, agora), externoStatus: inv?.status ?? null, mensagem: inv?.processingDetail?.message ?? null };
}

/** Rotina (junto da cobrança): reconcilia as notas ENVIADAS — cobre webhook perdido ou não configurado */
export async function acompanharEnviadas(agora = Date.now(), env: Record<string, string | undefined> = process.env) {
  const cfg = configSpedy(env);
  if (!cfg.configurada) return 0;
  const d = await banco();
  const enviadas: any[] = (await d.select().from(saasNfse).where(eq(saasNfse.status, 'ENVIADA'))).filter((n: any) => n.provedor === 'spedy' && n.externoId).slice(0, 20);
  let n = 0;
  for (const x of enviadas) { try { await consultarNaSpedy(x.id, agora, env); n++; } catch (e: any) { console.warn(`[Spedy] consulta da NFS-e ${x.id}:`, e?.message); } }
  return n;
}

// ─── Webhook ────────────────────────────────────────────────────────────────

let segredoCache: { valor: string; em: number } | null = null;
/** Segredo de assinatura da conta (GET /v1/webhooks/secret, com a própria chave); 1 h em memória */
async function segredoWebhook(cfg: ConfigSpedy, agora = Date.now()): Promise<string | null> {
  if (process.env.SPEDY_WEBHOOK_SECRET?.trim()) return process.env.SPEDY_WEBHOOK_SECRET.trim();
  if (segredoCache && agora - segredoCache.em < 3600_000) return segredoCache.valor;
  const r: any = await chamar(cfg, 'GET', '/webhooks/secret').catch(() => null);
  if (!r?.secret) return null;
  segredoCache = { valor: String(r.secret), em: agora };
  return segredoCache.valor;
}
export function limparSegredoCache() { segredoCache = null; }

/** Standard Webhooks: HMAC-SHA256 de "{id}.{timestamp}.{corpo cru}" com o segredo (base64, sem "whsec_"); tolerância de 5 min */
export function assinaturaValida(secret: string, h: { id?: string; timestamp?: string; signature?: string }, corpoCru: string, agora = Date.now()): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  if (Math.abs(Math.floor(agora / 1000) - Number(h.timestamp)) > 300) return false;
  const chave = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const esperada = Buffer.from(createHmac('sha256', chave).update(`${h.id}.${h.timestamp}.${corpoCru}`).digest('base64'));
  return h.signature.split(' ').some(parte => {
    const [v, sig] = parte.split(',');
    if (v !== 'v1' || !sig) return false;
    const a = Buffer.from(sig);
    return a.length === esperada.length && timingSafeEqual(a, esperada);
  });
}

/**
 * Recebe o evento da Spedy. Assinatura conferida (sem segredo disponível, recusa); idempotente pelo id do evento
 * (saasEventosPagamento, provedor 'spedy'); acha a nota pelo integrationId e reconcilia o status.
 */
export async function receberWebhook(corpoCru: string, headers: Record<string, string | undefined>, agora = Date.now(), env: Record<string, string | undefined> = process.env) {
  const cfg = configSpedy(env);
  const secret = cfg.configurada ? await segredoWebhook(cfg, agora) : null;
  if (!secret) return { ok: false as const, status: 503, motivo: 'sem_segredo' };
  const h = { id: headers['webhook-id'], timestamp: headers['webhook-timestamp'], signature: headers['webhook-signature'] };
  if (!assinaturaValida(secret, h, corpoCru, agora)) return { ok: false as const, status: 401, motivo: 'assinatura' };
  let ev: any;
  try { ev = JSON.parse(corpoCru); } catch { return { ok: false as const, status: 400, motivo: 'json' }; }
  const d = await banco();
  const eventoId = `spedy:${String(ev?.id ?? h.id).slice(0, 110)}`;
  const [ja]: any[] = await d.select().from(saasEventosPagamento).where(eq(saasEventosPagamento.eventoId, eventoId)).limit(1);
  if (ja?.processado) return { ok: true as const, status: 200, motivo: 'duplicado' };
  if (!ja) {
    await d.insert(saasEventosPagamento).values({ provedor: 'spedy', eventoId, tipo: String(ev?.event ?? '').slice(0, 60), recursoId: String(ev?.data?.id ?? '').slice(0, 64) || null,
      payloadJson: corpoCru.slice(0, 60_000), recebidoEm: new Date(agora) } as any).catch(() => {});
  }
  const inv = ev?.data;
  const integ = String(inv?.integrationId ?? '');
  let nfseId = /^romatec-nfse-(\d+)$/.exec(integ)?.[1] ? Number(/^romatec-nfse-(\d+)$/.exec(integ)![1]) : null;
  if (!nfseId && inv?.id) {
    const [n]: any[] = await d.select({ id: saasNfse.id }).from(saasNfse).where(eq(saasNfse.externoId, String(inv.id))).limit(1);
    nfseId = n?.id ?? null;
  }
  let resultado: string | null = null;
  if (nfseId && inv?.model !== 'productInvoice') resultado = await aplicarRetorno(nfseId, inv, cfg, agora);
  await d.update(saasEventosPagamento).set({ processado: true, processadoEm: new Date(agora), erro: nfseId ? null : 'nota não encontrada no CRM' } as any)
    .where(eq(saasEventosPagamento.eventoId, eventoId));
  if (resultado) console.log(`[Spedy] webhook ${ev?.event}: NFS-e ${nfseId} → ${resultado}`);
  return { ok: true as const, status: 200, motivo: nfseId ? 'aplicado' : 'ignorado', nfseId, resultado };
}

/** Situação da integração para a tela (sem segredo): ambiente, empresa, webhook cadastrado */
export async function situacaoSpedy(env: Record<string, string | undefined> = process.env) {
  const cfg = configSpedy(env);
  const base = { configurada: cfg.configurada, erro: cfg.erro, ambiente: cfg.ambiente, empresaId: cfg.empresaId, issAliquota: cfg.issAliquota, webhookUrl: urlWebhook() };
  if (!cfg.configurada) return { ...base, conectada: false, ambienteNfse: null, webhook: null, falha: null };
  try {
    const amb = await conferirAmbienteDaEmpresa(cfg).catch((e: any) => ({ empresaId: cfg.empresaId, ambienteNfse: null, falha: e?.message as string }));
    const ws: any = await chamar(cfg, 'GET', '/webhooks?page=1&pageSize=50').catch(() => null);
    const lista: any[] = Array.isArray(ws) ? ws : ws?.items ?? ws?.data ?? [];
    const meu = lista.find(w => w?.url === urlWebhook()) ?? null;
    return { ...base, conectada: true, empresaId: amb.empresaId, ambienteNfse: amb.ambienteNfse, webhook: meu ? { event: meu.event, enabled: meu.enabled !== false } : null, falha: (amb as any).falha ?? null };
  } catch (e: any) {
    return { ...base, conectada: false, ambienteNfse: null, webhook: null, falha: e?.message ?? 'falha' };
  }
}

export function urlWebhook() {
  return `${(process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '')}/api/webhook/spedy`;
}

/** Cadastra (ou reativa) o webhook invoice.status_changed da conta apontando para o CRM */
export async function configurarWebhook(env: Record<string, string | undefined> = process.env) {
  const cfg = configSpedy(env);
  const url = urlWebhook();
  const ws: any = await chamar(cfg, 'GET', '/webhooks?page=1&pageSize=50');
  const lista: any[] = Array.isArray(ws) ? ws : ws?.items ?? ws?.data ?? [];
  const meu = lista.find(w => w?.url === url && w?.event === 'invoice.status_changed');
  if (meu) {
    if (meu.enabled === false) await chamar(cfg, 'PUT', `/webhooks/${encodeURIComponent(meu.id)}/enable`);
    return { criado: false, reativado: meu.enabled === false, url };
  }
  await chamar(cfg, 'POST', '/webhooks', { event: 'invoice.status_changed', url });
  limparSegredoCache();
  return { criado: true, reativado: false, url };
}
