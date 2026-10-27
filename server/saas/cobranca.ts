/**
 * Camada SaaS — fase 2: cobrança pelo Mercado Pago (portada do AvalieImob, backend/routes/payments.py).
 * - Checkout: cartão recorrente (POST /preapproval) ou fatura Pix/boleto (POST /v1/payments).
 * - Webhook do painel (assinado): grava o evento uma vez (idempotência), responde 200 e processa em seguida;
 *   SEMPRE consulta o MP antes de agir (nunca confia no payload). Erro: o evento fica para a rotina de retry.
 * - Aprovado: fatura PAGA, período estendido, desbloqueio na hora; cupom conta o uso no 1º pagamento e,
 *   acabados os ciclos, a recorrência volta ao preço normal. Estorno/chargeback só derruba o acesso se não
 *   houver pagamento aprovado posterior (regra do AvalieImob).
 * Modo TESTE por padrão (saasConfig.mp_modo); produção só quando o administrador liga.
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb, transacao } from '../db';
import { empreendimentos, saasAssinaturas, saasConfig, saasCupons, saasEventosPagamento, saasFaturas, users } from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';
import { cupomValePara, precoComCupom, problemaCupom, valorUpgrade } from '../../shared/saas';
import { assinaturaValida, mp, type ModoMp } from './mercadopago';
import { sincronizarFilaNfse } from './nfse';
import * as S from './servico';

export class CobrancaErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'CobrancaErro'; } }

const banco = async () => {
  const d = await getDb();
  if (!d) throw new CobrancaErro('Banco indisponível', 503);
  return d as any;
};
const urlBase = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const r2 = (n: number) => Math.round(n * 100) / 100;
const json = <T>(v: unknown): T | null => { if (v == null || v === '') return null; try { return typeof v === 'string' ? JSON.parse(v) : (v as T); } catch { return null; } };
const hojeIso = (agora = Date.now()) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
const competenciaDe = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 7);
const proximaComp = (c: string) => { const [y, m] = c.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const somarMeses = (base: number, meses: number) => { const d = new Date(base); d.setMonth(d.getMonth() + meses); return d; };

export async function modoMp(): Promise<ModoMp> {
  const d = await banco();
  const [c]: any[] = await d.select().from(saasConfig).where(eq(saasConfig.chave, 'mp_modo')).limit(1);
  return c?.valor === 'producao' ? 'producao' : 'teste';
}

export async function definirModoMp(modo: ModoMp, autorId: number) {
  const d = await banco();
  await d.delete(saasConfig).where(eq(saasConfig.chave, 'mp_modo'));
  await d.insert(saasConfig).values({ chave: 'mp_modo', valor: modo, atualizadoPor: autorId, updatedAt: new Date() } as any);
  return { modo };
}

// ─── Checkout ─────────────────────────────────────────────────────────────

export interface ResultadoCheckout {
  tipo: 'redirecionar' | 'pix' | 'boleto'; url?: string; copiaCola?: string | null; qrBase64?: string | null; valor: number; modo: ModoMp; faturaId?: number;
}

async function garantirAssinatura(u: any, planoId: number, agora: number) {
  const atual = await S.assinaturaDoUsuario(u);
  if (atual) return atual;
  const d = await banco();
  let empId: number | null = null;
  if (perfilDe(u) === 'empreendedor' && u.empreendimentoSlug) {
    const [e]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.slug, u.empreendimentoSlug)).limit(1);
    empId = e?.id ?? null;
  }
  const chave = `${u.id}:${empId ?? 0}`;
  await d.insert(saasAssinaturas).values({ usuarioId: u.id, planoId, empreendimentoId: empId, chave, origem: 'PAGA', ciclo: 'MENSAL', status: 'BLOQUEADO', diasTolerancia: 3, motivo: 'Aguardando o 1º pagamento', createdAt: new Date(agora), updatedAt: new Date(agora) } as any);
  const [a]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.chave, chave)).limit(1);
  return a;
}

/** Implantação (empreendedor avulso): cobrada na 1ª fatura, uma vez só */
async function implantacaoPendente(a: any, planoCodigo: string): Promise<number> {
  if (planoCodigo !== 'EMPREENDEDOR_AVULSO') return 0;
  const d = await banco();
  const pagas: any[] = await d.select().from(saasFaturas).where(eq(saasFaturas.assinaturaId, a.id));
  if (pagas.some(f => f.status === 'PAGA' && (f.incluiImplantacao === true || f.incluiImplantacao === 1))) return 0;
  const impl = (await S.listarPlanos()).find(p => p.codigo === 'IMPLANTACAO');
  return impl?.ativo ? impl.precoMensal : 0;
}

/** O que o assinante escolheu no checkout; só vai para a assinatura com o pagamento aprovado */
type Escolha = { planoId: number; ciclo: 'MENSAL' | 'ANUAL'; metodo: string; cupomId: number | null; preapprovalId?: string };
const escolhaDe = (v: unknown): Escolha | null => {
  const e = json(v) as Escolha | null;
  return e && Number(e.planoId) > 0 && (e.ciclo === 'MENSAL' || e.ciclo === 'ANUAL') ? e : null;
};

export async function iniciarCheckout(u: any, p: { plano: string; ciclo: 'MENSAL' | 'ANUAL'; metodo: 'CARTAO_RECORRENTE' | 'PIX' | 'BOLETO'; cupom?: string | null }, agora = Date.now()): Promise<ResultadoCheckout> {
  const perfil = perfilDe(u);
  const planos = await S.listarPlanos();
  const plano = planos.find(x => x.codigo === p.plano && x.ativo && !x.unico && x.codigo !== 'EMPREENDEDOR_PACOTE');
  if (!plano || plano.publico !== (perfil === 'empreendedor' ? 'EMPREENDEDOR' : 'CORRETOR')) throw new CobrancaErro('Plano indisponível para o seu perfil');
  const preco = p.ciclo === 'ANUAL' && plano.precoAnual != null ? plano.precoAnual : plano.precoMensal;
  const d = await banco();
  let cupom: any = null;
  if (p.cupom?.trim()) {
    const [c]: any[] = await d.select().from(saasCupons).where(eq(saasCupons.codigo, p.cupom.trim().toUpperCase())).limit(1);
    const lin = c ? { ...c, valor: Number(c.valor), limiteUsos: Number(c.limiteUsos), usosRealizados: Number(c.usosRealizados), precosFixos: json(c.precosFixosJson) } : null;
    const erro = problemaCupom(lin, plano.codigo, agora);
    if (erro) throw new CobrancaErro(erro);
    cupom = lin;
  }
  const valorCiclo = precoComCupom(preco, cupom, plano.codigo);
  const a = await garantirAssinatura(u, plano.id, agora);
  const impl = await implantacaoPendente(a, plano.codigo);
  if (impl && p.metodo === 'CARTAO_RECORRENTE') throw new CobrancaErro('A primeira fatura (com a implantação) é por Pix ou boleto; o cartão recorrente fica para as seguintes.');
  const modo = await modoMp();
  // A escolha (plano, ciclo, forma, cupom) NÃO vai para a assinatura agora: fica na fatura (Pix/boleto) ou pendente da
  // assinatura nova do MP (cartão) e só vale quando o pagamento for aprovado (aplicarAprovado)
  const escolha: Escolha = { planoId: plano.id, ciclo: p.ciclo, metodo: p.metodo, cupomId: cupom?.id ?? null };
  await S.auditar(u.id, 'CHECKOUT_INICIADO', { plano: plano.codigo, ciclo: p.ciclo, metodo: p.metodo, cupom: cupom?.codigo ?? null, valor: valorCiclo + impl, modo });

  if (p.metodo === 'CARTAO_RECORRENTE') {
    if (!u.email || /@cadastro\.local$/.test(u.email)) throw new CobrancaErro('Cadastre o seu e-mail em "Meu cadastro" antes de assinar com cartão');
    const pre: any = await mp.req(modo, 'POST', '/preapproval', {
      reason: `Romatec CRM — ${plano.nome}`, external_reference: `saas:${a.id}`, payer_email: u.email, back_url: `${urlBase()}/assinatura?retorno=1`, status: 'pending',
      auto_recurring: { frequency: p.ciclo === 'ANUAL' ? 12 : 1, frequency_type: 'months', transaction_amount: valorCiclo, currency_id: 'BRL' },
    });
    await d.update(saasAssinaturas).set({ checkoutPendenteJson: JSON.stringify({ ...escolha, preapprovalId: String(pre.id) }), updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
    const url = modo === 'teste' ? pre.sandbox_init_point || pre.init_point : pre.init_point || pre.sandbox_init_point;
    if (!url) throw new CobrancaErro('O Mercado Pago não devolveu o link da assinatura', 502);
    return { tipo: 'redirecionar', url, valor: valorCiclo, modo };
  }
  const fatura = await gerarFatura(a, u, { valor: r2(valorCiclo + impl), metodo: p.metodo, incluiImplantacao: impl > 0, competencia: competenciaDe(agora), descricao: `Romatec CRM — ${plano.nome}${impl ? ' + implantação' : ''}`, modo, escolha }, agora);
  return { tipo: p.metodo === 'PIX' ? 'pix' : 'boleto', url: fatura.link ?? undefined, copiaCola: fatura.copiaCola, qrBase64: fatura.qrBase64, valor: fatura.valor, modo, faturaId: fatura.id };
}

// ─── Upgrade de plano (ex.: Essencial → Pro) com a diferença proporcional ──

/** Preço do ciclo que o assinante paga de fato: preço negociado (só no plano atual) > cupom em vigor > tabela */
async function precoDoCiclo(a: any, plano: { codigo: string; precoMensal: number; precoAnual: number | null }, atual: boolean): Promise<number> {
  if (atual && a.precoOverride != null) return Number(a.precoOverride);
  const lista = a.ciclo === 'ANUAL' && plano.precoAnual != null ? plano.precoAnual : plano.precoMensal;
  const cupomVigente = a.cupomId && (a.ciclosCupomRestantes == null || Number(a.ciclosCupomRestantes) > 0);
  if (!cupomVigente) return lista;
  const d = await banco();
  const [c]: any[] = await d.select().from(saasCupons).where(eq(saasCupons.id, a.cupomId)).limit(1);
  const lin = c ? { ...c, valor: Number(c.valor), precosFixos: json(c.precosFixosJson) } : null;
  return cupomValePara(lin, plano.codigo) ? precoComCupom(lista, lin, plano.codigo) : lista;
}

/** Prévia do upgrade: só com assinatura paga e ativa, com dias a vencer, de plano sem o AvalieImob para o que inclui */
export async function previaUpgrade(u: any, agora = Date.now()) {
  const a = await S.assinaturaDoUsuario(u);
  if (!a || a.status !== 'ATIVA' || a.origem !== 'PAGA') return null;
  const planos = await S.listarPlanos();
  const atual = planos.find(p => p.id === a.planoId);
  const novo = planos.find(p => p.ativo && !p.unico && p.incluiAvalieimob && p.publico === atual?.publico && p.id !== atual?.id);
  if (!atual || !novo || atual.incluiAvalieimob) return null;
  const precoAtual = await precoDoCiclo(a, atual, true);
  const precoNovo = await precoDoCiclo(a, novo, false);
  const v = valorUpgrade({ precoAtual, precoNovo, ciclo: a.ciclo, periodoFim: a.periodoFim, agora });
  if (!v) return null;
  return { de: atual.nome, para: novo.nome, planoCodigo: novo.codigo, planoId: novo.id, ...v, precoNovoCiclo: precoNovo, ciclo: a.ciclo as string, periodoFim: new Date(a.periodoFim).toISOString(), assinaturaId: a.id };
}

/** Fatura Pix/boleto do upgrade (competência U+AAMMDD); paga, o plano troca na hora sem mudar o vencimento */
export async function iniciarUpgrade(u: any, p: { metodo: 'PIX' | 'BOLETO' }, agora = Date.now()): Promise<ResultadoCheckout> {
  const prev = await previaUpgrade(u, agora);
  if (!prev) throw new CobrancaErro('Upgrade indisponível: é preciso ter o plano Essencial pago e em dia.');
  const a = await S.assinaturaDoUsuario(u);
  const modo = await modoMp();
  const competencia = `U${hojeIso(agora).slice(2).replace(/-/g, '')}`;
  await S.auditar(u.id, 'UPGRADE_INICIADO', { de: prev.de, para: prev.para, valor: prev.valor, dias: prev.diasRestantes, metodo: p.metodo, modo });
  const fatura = await gerarFatura(a, u, { valor: prev.valor, metodo: p.metodo, incluiImplantacao: false, competencia, descricao: `Romatec CRM — upgrade para ${prev.para} (${prev.diasRestantes} dias)`, modo, upgradePlanoId: prev.planoId }, agora);
  return { tipo: p.metodo === 'PIX' ? 'pix' : 'boleto', url: fatura.link ?? undefined, copiaCola: fatura.copiaCola, qrBase64: fatura.qrBase64, valor: fatura.valor, modo, faturaId: fatura.id };
}

/** Cria (ou refaz) a fatura Pix/boleto da competência no MP */
async function gerarFatura(a: any, u: any, p: { valor: number; metodo: 'PIX' | 'BOLETO'; incluiImplantacao: boolean; competencia: string; descricao: string; modo: ModoMp; upgradePlanoId?: number | null; escolha?: Escolha | null }, agora: number) {
  const d = await banco();
  const cpf = soDig(u.cpf);
  if (cpf.length !== 11) throw new CobrancaErro('Cadastre o seu CPF em "Meu cadastro" para gerar Pix ou boleto');
  const email = u.email && !/@cadastro\.local$/.test(u.email) ? u.email : `cobranca+${u.id}@romateccrm.com`;
  const [nome, ...resto] = String(u.name || 'Cliente').trim().split(/\s+/);
  let [f]: any[] = await d.select().from(saasFaturas).where(and(eq(saasFaturas.assinaturaId, a.id), eq(saasFaturas.competencia, p.competencia))).limit(1);
  if (f?.status === 'PAGA') {
    // Competência já paga (pagamento adiantado): vai para a seguinte
    p.competencia = proximaComp(p.competencia);
    [f] = await d.select().from(saasFaturas).where(and(eq(saasFaturas.assinaturaId, a.id), eq(saasFaturas.competencia, p.competencia))).limit(1);
  }
  const vencimento = new Date(agora + 3 * 86_400_000);
  const dados = { valor: p.valor.toFixed(2), metodo: p.metodo, status: 'ABERTA', vencimento: hojeIso(vencimento.getTime()), incluiImplantacao: p.incluiImplantacao ? 1 : 0, modo: p.modo, mpPaymentId: null, linkPagamento: null, pixCopiaCola: null, upgradePlanoId: p.upgradePlanoId ?? null, escolhaJson: p.escolha ? JSON.stringify(p.escolha) : null };
  let faturaId: number;
  if (f) { faturaId = f.id; await d.update(saasFaturas).set(dados as any).where(eq(saasFaturas.id, f.id)); }
  else {
    const r: any = await d.insert(saasFaturas).values({ assinaturaId: a.id, competencia: p.competencia, ...dados, createdAt: new Date(agora) } as any);
    faturaId = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
  }
  const corpo: any = {
    transaction_amount: p.valor, description: p.descricao, payment_method_id: p.metodo === 'PIX' ? 'pix' : 'bolbradesco',
    external_reference: `saas:${a.id}:${faturaId}`, date_of_expiration: vencimento.toISOString().replace('Z', '-00:00'),
    payer: { email, first_name: nome, last_name: resto.join(' ') || nome, identification: { type: 'CPF', number: cpf } },
  };
  if (p.metodo === 'BOLETO') {
    if (!soDig(u.enderecoCep) || !u.enderecoLogradouro) throw new CobrancaErro('Cadastre o seu endereço em "Meu cadastro" para gerar boleto');
    corpo.payer.address = { zip_code: soDig(u.enderecoCep), street_name: u.enderecoLogradouro, street_number: String(u.enderecoNumero || 'S/N'), neighborhood: u.enderecoBairro || '', city: u.enderecoCidade || '', federal_unit: u.enderecoUf || '' };
  }
  const pg: any = await mp.req(p.modo, 'POST', '/v1/payments', corpo, `saas-fatura-${faturaId}-${agora}`);
  const td = pg?.point_of_interaction?.transaction_data ?? {};
  const link = p.metodo === 'PIX' ? td.ticket_url ?? null : pg?.transaction_details?.external_resource_url ?? null;
  await d.update(saasFaturas).set({ mpPaymentId: String(pg.id), linkPagamento: link, pixCopiaCola: td.qr_code ?? null } as any).where(eq(saasFaturas.id, faturaId));
  return { id: faturaId, valor: p.valor, link, copiaCola: (td.qr_code ?? null) as string | null, qrBase64: (td.qr_code_base64 ?? null) as string | null };
}

/** Cancelar: vale até o fim do período pago; o cartão recorrente é cancelado no MP */
export async function cancelarAssinatura(u: any) {
  const a = await S.assinaturaDoUsuario(u);
  if (!a || a.origem !== 'PAGA' || !['ATIVA', 'INADIMPLENTE'].includes(a.status)) throw new CobrancaErro('Não há assinatura paga ativa para cancelar');
  if (a.mpPreapprovalId) await mp.req(await modoMp(), 'PUT', `/preapproval/${a.mpPreapprovalId}`, { status: 'cancelled' });
  const d = await banco();
  await d.update(saasAssinaturas).set({ cancelarNoFim: 1, updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
  S.limparCaches();
  await S.auditar(u.id, 'CANCELAMENTO_SOLICITADO', { assinaturaId: a.id, ate: a.periodoFim });
  return { ok: true as const, ate: a.periodoFim };
}

// ─── Webhook ──────────────────────────────────────────────────────────────

/** Grava o evento (uma vez) depois de validar a assinatura x-signature. Devolve se é novo. */
export async function registrarEvento(h: { xSignature?: string; xRequestId?: string }, dataId: string, corpo: any) {
  if (!assinaturaValida(h.xSignature, h.xRequestId, dataId, process.env.MP_WEBHOOK_SECRET)) throw new CobrancaErro('Assinatura do webhook inválida', 401);
  const tipo = String(corpo?.type ?? corpo?.topic ?? 'desconhecido').slice(0, 60);
  const eventoId = `${tipo}:${dataId}:${String(corpo?.action ?? '').slice(0, 40)}`.slice(0, 120);
  const d = await banco();
  const [ja]: any[] = await d.select({ id: saasEventosPagamento.id }).from(saasEventosPagamento).where(eq(saasEventosPagamento.eventoId, eventoId)).limit(1);
  if (ja) {
    // Pagamento: o estorno/chargeback chega com o mesmo id e ação da aprovação ("payment.updated") — reprocessa.
    // É seguro: processarPagamento consulta o status no MP, e aprovação e estorno não se aplicam duas vezes.
    if (tipo === 'payment') {
      await d.update(saasEventosPagamento).set({ processado: 0, payloadJson: JSON.stringify(corpo ?? {}).slice(0, 20_000) } as any).where(eq(saasEventosPagamento.id, ja.id));
      return { novo: true, eventoId };
    }
    return { novo: false, eventoId };
  }
  try {
    await d.insert(saasEventosPagamento).values({ eventoId, tipo, recursoId: dataId.slice(0, 64), payloadJson: JSON.stringify(corpo ?? {}).slice(0, 20_000), processado: 0, tentativas: 0, recebidoEm: new Date() } as any);
  } catch (e: any) {
    if (/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message))) return { novo: false, eventoId };
    throw e;
  }
  return { novo: true, eventoId };
}

/** Busca no modo atual e, se não achar (404), no outro (evento de teste com o sistema já em produção, ou vice-versa) */
async function buscarMp(caminho: string): Promise<{ dado: any; modo: ModoMp }> {
  const atual = await modoMp();
  try { return { dado: await mp.req(atual, 'GET', caminho), modo: atual }; } catch (e: any) {
    const outro: ModoMp = atual === 'teste' ? 'producao' : 'teste';
    if (e?.detalhe?.status === 404 || /\(404\)/.test(e?.message ?? '')) return { dado: await mp.req(outro, 'GET', caminho), modo: outro };
    throw e;
  }
}

const refSaas = (ref: unknown) => { const m = /^saas:(\d+)(?::(\d+))?$/.exec(String(ref ?? '')); return m ? { assinaturaId: Number(m[1]), faturaId: m[2] ? Number(m[2]) : null } : null; };

export async function processarEvento(eventoId: string, agora = Date.now()) {
  const d = await banco();
  const [ev]: any[] = await d.select().from(saasEventosPagamento).where(eq(saasEventosPagamento.eventoId, eventoId)).limit(1);
  if (!ev || ev.processado === true || ev.processado === 1) return { ok: true as const, acao: 'ja_processado' };
  try {
    let acao = 'ignorado';
    if (ev.tipo === 'payment') acao = await processarPagamento(String(ev.recursoId), agora);
    else if (ev.tipo === 'subscription_authorized_payment') {
      const { dado } = await buscarMp(`/authorized_payments/${ev.recursoId}`);
      acao = dado?.payment?.id ? await processarPagamento(String(dado.payment.id), agora) : 'sem_pagamento';
    } else if (ev.tipo === 'subscription_preapproval') acao = await processarPreapproval(String(ev.recursoId));
    await d.update(saasEventosPagamento).set({ processado: 1, erro: null, processadoEm: new Date(agora), tentativas: (Number(ev.tentativas) || 0) + 1 } as any).where(eq(saasEventosPagamento.id, ev.id));
    return { ok: true as const, acao };
  } catch (e: any) {
    await d.update(saasEventosPagamento).set({ erro: String(e?.message ?? e).slice(0, 1000), tentativas: (Number(ev.tentativas) || 0) + 1 } as any).where(eq(saasEventosPagamento.id, ev.id));
    console.warn(`[MP] evento ${eventoId}:`, e?.message);
    return { ok: false as const, erro: e?.message };
  }
}

async function processarPreapproval(id: string) {
  const { dado: pre } = await buscarMp(`/preapproval/${id}`);
  const ref = refSaas(pre?.external_reference);
  if (!ref) return 'nao_e_do_crm';
  const d = await banco();
  const [a]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.id, ref.assinaturaId)).limit(1);
  if (!a) return 'assinatura_inexistente';
  const pendente = escolhaDe(a.checkoutPendenteJson);
  if (pre.status === 'cancelled') {
    // Só a assinatura do MP em uso cancela a renovação; a de um checkout não concluído só descarta a escolha
    if (String(pre.id) === String(a.mpPreapprovalId)) await d.update(saasAssinaturas).set({ cancelarNoFim: 1, updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
    else if (pendente?.preapprovalId === String(pre.id)) await d.update(saasAssinaturas).set({ checkoutPendenteJson: null, updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
  } else if (!a.mpPreapprovalId && !pendente) {
    // Assinatura antiga sem o id guardado: registra (a escolha de um checkout novo só vale no 1º pagamento — aplicarAprovado)
    await d.update(saasAssinaturas).set({ mpPreapprovalId: String(pre.id), updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
  }
  S.limparCaches();
  return `preapproval_${pre.status}`;
}

async function processarPagamento(paymentId: string, agora: number): Promise<string> {
  const { dado: pg, modo } = await buscarMp(`/v1/payments/${paymentId}`);
  const ref = refSaas(pg?.external_reference);
  if (!ref) return 'nao_e_do_crm'; // a conta MP pode receber pagamentos de outros sistemas
  const status = String(pg.status);
  if (status === 'approved') return aplicarAprovado(ref, pg, modo, agora);
  if (['refunded', 'charged_back'].includes(status)) return aplicarEstorno(ref, pg);
  if (['rejected', 'cancelled'].includes(status)) {
    const d = await banco();
    if (ref.faturaId) await d.update(saasFaturas).set({ status: status === 'cancelled' ? 'CANCELADA' : 'VENCIDA' } as any).where(and(eq(saasFaturas.id, ref.faturaId), eq(saasFaturas.status, 'ABERTA')));
    const [a]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.id, ref.assinaturaId)).limit(1);
    // Cartão recorrente recusado: inadimplente (a tolerância conta a partir do fim do período)
    if (a && !ref.faturaId && a.status === 'ATIVA' && a.origem === 'PAGA') {
      await d.update(saasAssinaturas).set({ status: 'INADIMPLENTE', version: (Number(a.version) || 0) + 1, updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
      S.limparCaches();
    }
    return `pagamento_${status}`;
  }
  return `pagamento_${status}`; // pending / in_process: aguarda o próximo aviso
}

async function aplicarAprovado(ref: { assinaturaId: number; faturaId: number | null }, pg: any, modo: ModoMp, agora: number): Promise<string> {
  const d = await banco();
  const mpId = String(pg.id);
  // Cartão: a escolha de um checkout novo só vale se este pagamento é da assinatura nova do MP (a antiga pode seguir cobrando)
  let pendenteCartao: Escolha | null = null;
  if (!ref.faturaId) {
    const [a0]: any[] = await d.select({ checkoutPendenteJson: saasAssinaturas.checkoutPendenteJson }).from(saasAssinaturas).where(eq(saasAssinaturas.id, ref.assinaturaId)).limit(1);
    const p = escolhaDe(a0?.checkoutPendenteJson);
    if (p?.preapprovalId) {
      const doPagamento = String(pg?.metadata?.preapproval_id ?? '');
      const daNova = doPagamento ? doPagamento === p.preapprovalId
        : (await buscarMp(`/preapproval/${p.preapprovalId}`).catch(() => null))?.dado?.status === 'authorized';
      if (daNova) pendenteCartao = p;
    }
  }
  const resultado = await transacao(d, async (tx: any) => {
    const [ja]: any[] = await tx.select().from(saasFaturas).where(eq(saasFaturas.mpPaymentId, mpId)).limit(1);
    if (ja?.status === 'PAGA') return { acao: 'ja_aplicado' as const };
    const [atual]: any[] = await tx.select().from(saasAssinaturas).where(eq(saasAssinaturas.id, ref.assinaturaId)).limit(1);
    if (!atual) return { acao: 'assinatura_inexistente' as const };
    // Escolha do checkout (plano, ciclo, forma, cupom) passa a valer agora, com o pagamento aprovado
    let escolha: Escolha | null = pendenteCartao;
    if (ref.faturaId) {
      const [fe]: any[] = await tx.select({ escolhaJson: saasFaturas.escolhaJson }).from(saasFaturas).where(eq(saasFaturas.id, ref.faturaId)).limit(1);
      escolha = escolhaDe(fe?.escolhaJson);
    }
    const a = escolha ? {
      ...atual, planoId: Number(escolha.planoId), ciclo: escolha.ciclo, metodo: escolha.metodo, cupomId: escolha.cupomId ?? null,
      // Cupom trocado: a contagem de ciclos recomeça no 1º pagamento dele
      ciclosCupomRestantes: Number(escolha.cupomId ?? 0) === Number(atual.cupomId ?? 0) ? atual.ciclosCupomRestantes : null,
      ...(escolha.preapprovalId ? { mpPreapprovalId: escolha.preapprovalId } : {}),
    } : atual;
    const valor = Number(pg.transaction_amount) || 0;
    const pagoEm = pg.date_approved ? new Date(pg.date_approved) : new Date(agora);
    // Upgrade (diferença proporcional): troca o plano e NÃO estende o período nem conta ciclo de cupom
    if (ref.faturaId) {
      const [fu]: any[] = await tx.select({ upgradePlanoId: saasFaturas.upgradePlanoId }).from(saasFaturas).where(eq(saasFaturas.id, ref.faturaId)).limit(1);
      if (fu?.upgradePlanoId) {
        await tx.update(saasFaturas).set({ status: 'PAGA', pagoEm, mpPaymentId: mpId, modo } as any).where(eq(saasFaturas.id, ref.faturaId));
        const r: any = await tx.update(saasAssinaturas).set({ planoId: Number(fu.upgradePlanoId), version: (Number(a.version) || 0) + 1, updatedAt: new Date(agora) } as any)
          .where(and(eq(saasAssinaturas.id, a.id), eq(saasAssinaturas.version, Number(a.version) || 0)));
        if (!Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? 1)) throw new CobrancaErro('Assinatura alterada ao mesmo tempo — tenta de novo no retry', 409);
        return { acao: 'upgrade' as const, a, valor, novoPlanoId: Number(fu.upgradePlanoId) };
      }
    }
    // Fatura: a do Pix/boleto (ref) ou uma nova para a cobrança do cartão recorrente
    if (ref.faturaId) {
      await tx.update(saasFaturas).set({ status: 'PAGA', pagoEm, mpPaymentId: mpId, modo } as any).where(eq(saasFaturas.id, ref.faturaId));
    } else {
      const comps: any[] = await tx.select({ competencia: saasFaturas.competencia }).from(saasFaturas).where(eq(saasFaturas.assinaturaId, a.id));
      let comp = competenciaDe(pagoEm.getTime());
      while (comps.some(f => f.competencia === comp)) comp = proximaComp(comp);
      await tx.insert(saasFaturas).values({ assinaturaId: a.id, competencia: comp, valor: valor.toFixed(2), metodo: 'CARTAO_RECORRENTE', status: 'PAGA', vencimento: hojeIso(pagoEm.getTime()), pagoEm, mpPaymentId: mpId, modo, createdAt: new Date(agora) } as any);
    }
    const base = Math.max(agora, a.periodoFim ? new Date(a.periodoFim).getTime() : 0);
    const periodoFim = somarMeses(base, a.ciclo === 'ANUAL' ? 12 : 1);
    // Cupom: o uso conta no 1º pagamento; depois, um ciclo a menos por pagamento
    let ciclos: number | null = a.ciclosCupomRestantes == null ? null : Number(a.ciclosCupomRestantes);
    let voltarPrecoNormal = false;
    if (a.cupomId) {
      if (ciclos == null) {
        const [c]: any[] = await tx.select().from(saasCupons).where(eq(saasCupons.id, a.cupomId)).limit(1);
        if (c) {
          const usos = Number(c.usosRealizados) + 1;
          await tx.update(saasCupons).set({ usosRealizados: usos, status: usos >= Number(c.limiteUsos) ? 'utilizado' : c.status, updatedAt: new Date(agora) } as any).where(eq(saasCupons.id, c.id));
          ciclos = Math.max(0, (Number(c.duracaoCiclos) || 1) - 1);
        } else ciclos = 0;
      } else ciclos = Math.max(0, ciclos - 1);
      voltarPrecoNormal = ciclos === 0 && !!a.mpPreapprovalId;
    }
    // Controle de versão: se outro processo mexeu na assinatura no meio, este evento volta para o retry
    const r: any = await tx.update(saasAssinaturas).set({
      status: 'ATIVA', origem: 'PAGA', periodoFim, trialFim: null, motivo: null, ciclosCupomRestantes: ciclos,
      // Escolha do checkout gravada só agora; pagou de novo pelo checkout = a renovação volta a valer
      ...(escolha ? {
        planoId: a.planoId, ciclo: a.ciclo, metodo: a.metodo, cupomId: a.cupomId, cancelarNoFim: 0,
        ...(escolha.preapprovalId ? { mpPreapprovalId: escolha.preapprovalId, checkoutPendenteJson: null } : {}),
      } : {}),
      ...(ciclos === 0 && a.cupomId ? { cupomId: null } : {}), version: (Number(a.version) || 0) + 1, updatedAt: new Date(agora),
    } as any).where(and(eq(saasAssinaturas.id, a.id), eq(saasAssinaturas.version, Number(a.version) || 0)));
    const afetadas = Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? 1);
    if (!afetadas) throw new CobrancaErro('Assinatura alterada ao mesmo tempo — tenta de novo no retry', 409);
    // Assinatura nova do MP no lugar da antiga: a antiga é cancelada (senão as duas cobram)
    const preapprovalAntigo = escolha?.preapprovalId && atual.mpPreapprovalId && String(atual.mpPreapprovalId) !== escolha.preapprovalId ? String(atual.mpPreapprovalId) : null;
    return { acao: 'aprovado' as const, a, periodoFim, valor, voltarPrecoNormal, preapprovalAntigo };
  });
  if (resultado.acao === 'upgrade') return posUpgrade(resultado.a, resultado.novoPlanoId, resultado.valor, modo, mpId, agora);
  if (resultado.acao !== 'aprovado') return resultado.acao;
  const { a, periodoFim, valor, voltarPrecoNormal, preapprovalAntigo } = resultado;
  S.limparCaches();
  if (preapprovalAntigo) {
    await mp.req(modo, 'PUT', `/preapproval/${preapprovalAntigo}`, { status: 'cancelled' })
      .catch((e: any) => console.warn(`[MP] cancelar a assinatura antiga ${preapprovalAntigo}:`, e?.message));
  }
  await sincronizarFilaNfse(agora).catch((e: any) => console.warn('[NFS-e] fila:', e?.message)); // a rotina repete se falhar
  await S.auditar(a.usuarioId, 'PAGAMENTO_CONFIRMADO', { assinaturaId: a.id, mpPaymentId: mpId, valor, modo, ate: periodoFim.toISOString() });
  if (a.status !== 'ATIVA') await S.auditar(a.usuarioId, 'DESBLOQUEIO', { assinaturaId: a.id, por: 'webhook' });
  if (voltarPrecoNormal) {
    try {
      const plano = (await S.listarPlanos()).find(p => p.id === a.planoId);
      const normal = a.precoOverride != null ? Number(a.precoOverride) : a.ciclo === 'ANUAL' && plano?.precoAnual != null ? plano.precoAnual : plano?.precoMensal;
      if (normal) await mp.req(modo, 'PUT', `/preapproval/${a.mpPreapprovalId}`, { auto_recurring: { transaction_amount: normal, currency_id: 'BRL' } });
    } catch (e: any) { console.warn('[MP] volta ao preço normal:', e?.message); }
  }
  const d2 = await banco();
  const [u]: any[] = await d2.select({ name: users.name, telefone: users.telefone }).from(users).where(eq(users.id, a.usuarioId)).limit(1);
  if (u?.telefone && S.envio.disponivel()) {
    const fim = periodoFim.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' });
    await S.envio.texto(`55${soDig(u.telefone).replace(/^55/, '')}`, `✅ Pagamento confirmado — ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Sua assinatura do Romatec CRM está ativa até ${fim}. Obrigado!`).catch(() => {});
  }
  return 'aprovado';
}

/**
 * Preço do plano mudou: o Pix/boleto já sai com o valor novo na próxima fatura, mas o cartão recorrente guarda o valor
 * na assinatura do Mercado Pago — aqui cada uma passa a cobrar o preço do ciclo (preço negociado e cupom em vigor
 * continuam valendo; precoDoCiclo decide). Falha numa não para as outras; tudo fica na auditoria.
 */
export async function reajustarRecorrencias(planoId: number, autorId: number, agora = Date.now()) {
  const plano = (await S.listarPlanos()).find(p => p.id === planoId);
  if (!plano) return { atualizadas: 0, falhas: [] as string[] };
  const d = await banco();
  const as: any[] = (await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.planoId, planoId)))
    .filter((a: any) => a.mpPreapprovalId && a.status !== 'CANCELADA');
  if (!as.length) return { atualizadas: 0, falhas: [] as string[] };
  const modo = await modoMp();
  let atualizadas = 0;
  const falhas: string[] = [];
  for (const a of as) {
    try {
      const preco = await precoDoCiclo(a, plano, true);
      await mp.req(modo, 'PUT', `/preapproval/${a.mpPreapprovalId}`, { auto_recurring: { transaction_amount: preco, currency_id: 'BRL' } });
      await S.auditar(a.usuarioId, 'REAJUSTE_RECORRENCIA', { assinaturaId: a.id, plano: plano.codigo, valor: preco, por: autorId, modo });
      atualizadas++;
    } catch (e: any) {
      falhas.push(`assinatura ${a.id}: ${String(e?.message ?? e).slice(0, 120)}`);
      console.warn(`[MP] reajuste da recorrência ${a.id}:`, e?.message);
    }
  }
  void agora;
  return { atualizadas, falhas };
}

/** Depois do upgrade pago: cartão recorrente passa a cobrar o plano novo, NFS-e na fila, AvalieImob liberado e aviso ao assinante */
async function posUpgrade(a: any, novoPlanoId: number, valor: number, modo: ModoMp, mpId: string, agora: number): Promise<string> {
  S.limparCaches();
  const planos = await S.listarPlanos();
  const novo = planos.find(p => p.id === novoPlanoId);
  await S.auditar(a.usuarioId, 'UPGRADE_PLANO', { assinaturaId: a.id, para: novo?.codigo ?? novoPlanoId, valor, mpPaymentId: mpId, modo });
  await sincronizarFilaNfse(agora).catch((e: any) => console.warn('[NFS-e] fila:', e?.message));
  if (a.mpPreapprovalId && novo) {
    try {
      const preco = await precoDoCiclo({ ...a, planoId: novo.id }, novo, false);
      await mp.req(modo, 'PUT', `/preapproval/${a.mpPreapprovalId}`, { reason: `Romatec CRM — ${novo.nome}`, auto_recurring: { transaction_amount: preco, currency_id: 'BRL' } });
    } catch (e: any) { console.warn('[MP] upgrade da recorrência:', e?.message); }
  }
  await (await import('./avalieimob')).sincronizarAvalieimob(agora).catch((e: any) => console.warn('[AvalieImob] após upgrade:', e?.message));
  const d = await banco();
  const [u]: any[] = await d.select({ telefone: users.telefone }).from(users).where(eq(users.id, a.usuarioId)).limit(1);
  if (u?.telefone && S.envio.disponivel()) {
    await S.envio.texto(`55${soDig(u.telefone).replace(/^55/, '')}`, `🚀 Upgrade confirmado — ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Seu plano agora é o ${novo?.nome ?? 'Pro'}${novo?.incluiAvalieimob ? ', com o AvalieImob incluído (botão "Abrir AvalieImob" em Sua assinatura)' : ''}. Obrigado!`).catch(() => {});
  }
  return 'upgrade';
}

/** Estorno/chargeback: só derruba se não houver pagamento aprovado posterior (renovação) — regra do AvalieImob */
async function aplicarEstorno(ref: { assinaturaId: number }, pg: any): Promise<string> {
  const d = await banco();
  const mpId = String(pg.id);
  const [f]: any[] = await d.select().from(saasFaturas).where(eq(saasFaturas.mpPaymentId, mpId)).limit(1);
  // Aviso repetido do mesmo estorno: já aplicado (não empurra o fim do período nem audita de novo)
  if (f?.status === 'ESTORNADA') return 'ja_estornado';
  if (f) {
    await d.update(saasFaturas).set({ status: 'ESTORNADA' } as any).where(eq(saasFaturas.id, f.id));
    await sincronizarFilaNfse().catch((e: any) => console.warn('[NFS-e] fila:', e?.message));
  }
  const pagas: any[] = (await d.select().from(saasFaturas).where(eq(saasFaturas.assinaturaId, ref.assinaturaId)).orderBy(desc(saasFaturas.pagoEm)))
    .filter((x: any) => x.status === 'PAGA' && x.mpPaymentId !== mpId);
  const posterior = f?.pagoEm && pagas.some(x => x.pagoEm && new Date(x.pagoEm).getTime() > new Date(f.pagoEm).getTime());
  if (posterior) return 'estorno_ignorado_ha_pagamento_posterior';
  const [a]: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.id, ref.assinaturaId)).limit(1);
  if (!a) return 'assinatura_inexistente';
  await d.update(saasAssinaturas).set({ status: 'INADIMPLENTE', periodoFim: new Date(), version: (Number(a.version) || 0) + 1, motivo: `Pagamento ${pg.status === 'charged_back' ? 'contestado' : 'estornado'}`, updatedAt: new Date() } as any).where(eq(saasAssinaturas.id, a.id));
  S.limparCaches();
  await S.auditar(a.usuarioId, 'PAGAMENTO_ESTORNADO', { assinaturaId: a.id, mpPaymentId: mpId, status: pg.status });
  return 'estornado';
}

// ─── Rotinas (a cada 10 min) ──────────────────────────────────────────────

/** Reprocessa eventos que falharam (até 10 tentativas) */
export async function retryEventos(agora = Date.now()) {
  const d = await banco();
  const pendentes: any[] = (await d.select().from(saasEventosPagamento).where(eq(saasEventosPagamento.processado, false as any)))
    // Só do Mercado Pago (a tabela também guarda os eventos da Spedy, reconciliados pela consulta em acompanharEnviadas)
    .filter((e: any) => (e.provedor ?? 'mercadopago') === 'mercadopago' && (Number(e.tentativas) || 0) < 10 && agora - new Date(e.recebidoEm).getTime() > 60_000);
  let ok = 0;
  for (const e of pendentes) if ((await processarEvento(e.eventoId, agora)).ok) ok++;
  return { pendentes: pendentes.length, ok };
}

/** Pix/boleto mensal: gera a fatura do próximo ciclo 5 dias antes do vencimento e manda o link; cancelada no fim do período vira CANCELADA */
export async function rotinaFaturas(agora = Date.now()) {
  const cfg = await S.lerConfig(agora);
  if (!cfg.licenciamentoAtivo) return { geradas: 0 };
  const d = await banco();
  const as: any[] = await d.select().from(saasAssinaturas).where(eq(saasAssinaturas.origem, 'PAGA'));
  let geradas = 0;
  for (const a of as) {
    const fim = a.periodoFim ? new Date(a.periodoFim).getTime() : null;
    if (!fim) continue;
    if ((a.cancelarNoFim === true || a.cancelarNoFim === 1) && fim <= agora && a.status !== 'CANCELADA') {
      await d.update(saasAssinaturas).set({ status: 'CANCELADA', motivo: 'Cancelada pelo assinante', updatedAt: new Date(agora) } as any).where(eq(saasAssinaturas.id, a.id));
      S.limparCaches();
      continue;
    }
    if (a.status !== 'ATIVA' || !['PIX', 'BOLETO'].includes(a.metodo) || a.cancelarNoFim === true || a.cancelarNoFim === 1) continue;
    if (fim - agora > 5 * 86_400_000) continue;
    const comp = competenciaDe(fim);
    const [ja]: any[] = await d.select({ id: saasFaturas.id }).from(saasFaturas).where(and(eq(saasFaturas.assinaturaId, a.id), eq(saasFaturas.competencia, comp))).limit(1);
    if (ja) continue;
    const [u]: any[] = await d.select().from(users).where(eq(users.id, a.usuarioId)).limit(1);
    const plano = (await S.listarPlanos()).find(p => p.id === a.planoId);
    if (!u || !plano) continue;
    const valor = a.precoOverride != null ? Number(a.precoOverride) : a.ciclo === 'ANUAL' && plano.precoAnual != null ? plano.precoAnual : plano.precoMensal;
    try {
      const f = await gerarFatura(a, u, { valor, metodo: a.metodo, incluiImplantacao: false, competencia: comp, descricao: `Romatec CRM — ${plano.nome}`, modo: await modoMp() }, agora);
      geradas++;
      if (u.telefone && S.envio.disponivel()) {
        await S.envio.texto(`55${soDig(u.telefone).replace(/^55/, '')}`, `🧾 Sua fatura do Romatec CRM (${plano.nome}) de ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} está disponível.${f.copiaCola ? `\nPix copia e cola:\n${f.copiaCola}` : ''}${f.link ? `\n${f.link}` : ''}`).catch(() => {});
      }
    } catch (e: any) { console.warn('[MP] fatura automática:', e?.message); }
  }
  return { geradas };
}

/**
 * Rede de segurança do webhook: consulta no MP as faturas Pix/boleto ainda ABERTAS (últimos 35 dias) e aplica as pagas,
 * vencidas ou canceladas — aviso perdido ou painel do MP sem o webhook configurado não deixam pagamento parado.
 * Idempotente (aplicarAprovado não aplica duas vezes o mesmo pagamento).
 */
export async function conciliarFaturasAbertas(agora = Date.now()) {
  const d = await banco();
  const abertas: any[] = (await d.select().from(saasFaturas).where(eq(saasFaturas.status, 'ABERTA')))
    .filter((f: any) => f.mpPaymentId && agora - new Date(f.createdAt).getTime() < 35 * 86_400_000);
  const res = { conferidas: 0, aplicadas: 0, erros: [] as string[] };
  for (const f of abertas) {
    try {
      const acao = await processarPagamento(String(f.mpPaymentId), agora);
      res.conferidas++;
      if (acao === 'aprovado' || acao === 'upgrade') res.aplicadas++;
    } catch (e: any) { res.erros.push(`fatura ${f.id}: ${String(e?.message ?? e).slice(0, 200)}`); }
  }
  return res;
}

/**
 * Estornos e chargebacks das faturas já pagas (até 180 dias, prazo de contestação do cartão): o aviso do MP pode não
 * chegar ao CRM, e a conciliação acima só olha as abertas. processarPagamento consulta o status no MP; aprovado de
 * novo não muda nada e estorno se aplica uma vez só.
 */
export async function conferirEstornos(agora = Date.now()) {
  const d = await banco();
  const pagas: any[] = (await d.select().from(saasFaturas).where(eq(saasFaturas.status, 'PAGA')))
    .filter((f: any) => f.mpPaymentId && f.pagoEm && agora - new Date(f.pagoEm).getTime() < 180 * 86_400_000);
  const res = { conferidas: 0, estornadas: 0, erros: [] as string[] };
  for (const f of pagas) {
    try {
      const acao = await processarPagamento(String(f.mpPaymentId), agora);
      res.conferidas++;
      if (acao === 'estornado') res.estornadas++;
    } catch (e: any) { res.erros.push(`fatura ${f.id}: ${String(e?.message ?? e).slice(0, 200)}`); }
  }
  return res;
}

/** Admin: eventos recentes do webhook (diagnóstico) */
export async function eventosRecentes() {
  const d = await banco();
  const es: any[] = await d.select().from(saasEventosPagamento).orderBy(desc(saasEventosPagamento.recebidoEm)).limit(50);
  return es.map(e => ({ id: e.id, eventoId: e.eventoId, tipo: e.tipo, processado: e.processado === true || e.processado === 1, tentativas: Number(e.tentativas) || 0, erro: e.erro ?? null, recebidoEm: e.recebidoEm }));
}

let rodando = false;
let ultimaConferenciaEstornos = 0;
export function iniciarJobsCobranca() {
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await retryEventos(); await conciliarFaturasAbertas(); await rotinaFaturas(); await sincronizarFilaNfse();
      // Estornos das faturas pagas: uma vez por hora (a conciliação de 10 em 10 min só olha as abertas)
      if (Date.now() - ultimaConferenciaEstornos >= 60 * 60_000) { ultimaConferenciaEstornos = Date.now(); await conferirEstornos(); }
      await (await import('./avalieimob')).sincronizarAvalieimob();
      // NFS-e enviadas à Spedy: reconcilia o status (webhook perdido ou ainda não configurado)
      await (await import('./spedy')).acompanharEnviadas();
    } catch (e: any) { console.warn('[MP] rotina:', e?.message); } finally { rodando = false; }
  };
  setTimeout(tick, 90_000).unref?.();
  setInterval(tick, 10 * 60_000).unref?.();
}
