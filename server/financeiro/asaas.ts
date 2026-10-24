/**
 * Cliente da API do Asaas (v3) — mesmo cliente que já roda em produção no ZAYRA (RomatecVoiceAgent,
 * src/services/pa/asaas.ts), adaptado ao CRM: split da comissão, atualização da cobrança na 2ª via.
 *
 * DORMENTE sem chave: configAsaas() devolve null e nada é emitido nem cobrado.
 *   ASAAS_API_KEY_BOMJARDIMS  chave da conta que recebe (na falta, ASAAS_API_KEY — a mesma variável do ZAYRA)
 *   ASAAS_AMBIENTE            'producao' | 'sandbox' (opcional — deduzido pelo prefixo da chave: $aact_prod_ / $aact_hmlg_)
 *   ASAAS_BASE_URL            opcional, sobrescreve a URL da API
 *   ASAAS_WALLET_COMISSAO     walletId da Romatec para o split da comissão (sem ele, não há split)
 *
 * Fidelidade do boleto: linha digitável, código de barras, nosso número e PIX vêm SEMPRE daqui
 * (/identificationField e /pixQrCode) — o CRM nunca calcula esses dados.
 */
export class AsaasErro extends Error {
  constructor(public codigo: string, mensagem: string, public status = 502, public detalhe?: unknown) { super(mensagem); }
}

export interface AsaasConfig { apiKey: string; baseUrl: string; ambiente: 'producao' | 'sandbox'; walletComissao: string | null }

/** 'bom-jardims' → 'BOM_JARDIMS' (sufixo das variáveis por empreendimento) */
export const sufixoEnv = (slug: string) => slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Chave do empreendimento: ASAAS_API_KEY_<SLUG> (ex.: ASAAS_API_KEY_BOM_JARDIMS); aceita também o nome do spec
 * sem separador (ASAAS_API_KEY_BOMJARDIMS) e, por último, ASAAS_API_KEY (a mesma do ZAYRA).
 * Trocar a chave troca a conta — e com ela o beneficiário de todos os documentos.
 */
export function chaveDoEmpreendimento(slug: string, env: NodeJS.ProcessEnv = process.env): string {
  const s = sufixoEnv(slug);
  return (env[`ASAAS_API_KEY_${s}`] || env[`ASAAS_API_KEY_${s.replace(/_/g, '')}`] || env.ASAAS_API_KEY || '').trim();
}

export function configAsaas(env: NodeJS.ProcessEnv = process.env, slug = 'bom-jardims'): AsaasConfig | null {
  const apiKey = chaveDoEmpreendimento(slug, env);
  if (!apiKey) return null;
  const amb = (env.ASAAS_AMBIENTE || '').toLowerCase();
  const ambiente: AsaasConfig['ambiente'] =
    amb === 'producao' || amb === 'production' ? 'producao' : amb === 'sandbox' ? 'sandbox' : apiKey.includes('_prod_') ? 'producao' : 'sandbox';
  const baseUrl = (env.ASAAS_BASE_URL || (ambiente === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3')).replace(/\/+$/, '');
  return { apiKey, baseUrl, ambiente, walletComissao: (env.ASAAS_WALLET_COMISSAO || '').trim() || null };
}

export function exigirConfigAsaas(env: NodeJS.ProcessEnv = process.env, slug = 'bom-jardims'): AsaasConfig {
  const c = configAsaas(env, slug);
  if (!c) throw new AsaasErro('ASAAS_NAO_CONFIGURADO', `Cobrança desligada: defina ASAAS_API_KEY_${sufixoEnv(slug)} no Railway`, 503);
  return c;
}

/** Beneficiário dos boletos = dono da conta Asaas da chave (nome + CPF/CNPJ) e agência/conta */
export interface BeneficiarioAsaas { nome: string; cpfCnpj: string; agenciaConta: string; atualizadoEm: string }

export async function beneficiarioDaConta(cfg: AsaasConfig, fetchFn?: FetchFn): Promise<BeneficiarioAsaas> {
  const info = await asaasReq<{ name?: string; companyName?: string; cpfCnpj?: string }>(cfg, 'GET', '/myAccount/commercialInfo', undefined, fetchFn);
  const conta = await numeroConta(cfg, fetchFn).catch(() => null);
  const nome = (info?.companyName || info?.name || '').trim();
  if (!nome) throw new AsaasErro('ASAAS_SEM_BENEFICIARIO', 'Asaas não devolveu o titular da conta', 502);
  return {
    nome, cpfCnpj: (info?.cpfCnpj || '').replace(/\D/g, ''),
    agenciaConta: conta?.agency ? `${conta.agency} / ${conta.account ?? ''}${conta.accountDigit ? `-${conta.accountDigit}` : ''}` : '',
    atualizadoEm: new Date().toISOString(),
  };
}

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

/** Chamada à API com timeout de 15 s e 1 retentativa em 429/5xx/rede */
export async function asaasReq<T>(cfg: AsaasConfig, method: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, body?: unknown,
  fetchFn: FetchFn = fetch as unknown as FetchFn, esperaMs = 800): Promise<T> {
  let ultimo: unknown = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const r = await fetchFn(`${cfg.baseUrl}${caminho}`, {
        method,
        headers: { access_token: cfg.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'Romatec-CRM/1.0' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const txt = await r.text();
      let json: unknown = null;
      try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
      if (r.status >= 200 && r.status < 300) return json as T;
      const desc = ((json as { errors?: Array<{ description?: string; code?: string }> } | null)?.errors ?? [])
        .map(e => e.description || e.code).filter(Boolean).join('; ');
      if (r.status === 401) throw new AsaasErro('ASAAS_CHAVE_INVALIDA', 'Asaas recusou a chave de API', 502);
      if (r.status === 404) throw new AsaasErro('ASAAS_NAO_ENCONTRADO', desc || 'Registro não encontrado no Asaas', 404);
      if (r.status === 429 || r.status >= 500) { ultimo = new Error(`Asaas HTTP ${r.status} ${desc}`); continue; }
      throw new AsaasErro('ASAAS_RECUSOU', `Asaas: ${desc || `requisição recusada (HTTP ${r.status})`}`, 422, json);
    } catch (err) {
      if (err instanceof AsaasErro) throw err;
      ultimo = err;
    } finally {
      clearTimeout(t);
    }
    if (esperaMs) await new Promise(res => setTimeout(res, esperaMs));
  }
  throw new AsaasErro('ASAAS_INDISPONIVEL', `Asaas indisponível (${(ultimo as Error)?.message || 'falha de rede'})`, 502);
}

const soDigitos = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');

// ─── Montadores puros ─────────────────────────────────────────────────────
export interface ClienteContrato {
  nome: string; cpfCnpj: string; email?: string | null; telefone?: string | null;
  cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null;
  contratoId: number;
}

export function payloadCliente(p: ClienteContrato) {
  const tel = soDigitos(p.telefone).replace(/^55(?=\d{10,11}$)/, '');
  const email = p.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email) ? p.email.trim() : undefined;
  return {
    name: p.nome.slice(0, 100),
    cpfCnpj: soDigitos(p.cpfCnpj),
    mobilePhone: tel.length === 11 ? tel : undefined,
    email,
    postalCode: soDigitos(p.cep) || undefined,
    address: p.logradouro?.slice(0, 100) || undefined,
    addressNumber: p.numero || 'S/N',
    complement: p.complemento?.slice(0, 60) || undefined,
    province: p.bairro?.slice(0, 60) || undefined,
    externalReference: `crm-contrato-${p.contratoId}`,
    // O CRM faz a comunicação (WhatsApp); o Asaas não manda SMS/e-mail próprios
    notificationDisabled: true,
  };
}

export function payloadCobranca(i: {
  customerId: string; cobrancaId: number; valor: number; vencimento: string; descricao: string;
  splitValor?: number; walletComissao?: string | null;
}) {
  if (!(i.valor > 0)) throw new AsaasErro('SEM_VALOR', 'Parcela sem valor para cobrar', 409);
  const split = i.splitValor && i.splitValor > 0 && i.walletComissao ? [{ walletId: i.walletComissao, fixedValue: Math.round(i.splitValor * 100) / 100 }] : undefined;
  return {
    customer: i.customerId,
    // UNDEFINED: o pagador escolhe boleto ou PIX na mesma cobrança
    billingType: 'UNDEFINED',
    value: Math.round(i.valor * 100) / 100,
    dueDate: i.vencimento,
    description: i.descricao.slice(0, 500),
    externalReference: `crm-cobranca-${i.cobrancaId}`,
    // Quem pagar o boleto original atrasado paga multa/juros nativos do Asaas (CPCV, Cláusula 7ª); IPCA só na 2ª via
    fine: { value: 2 },
    interest: { value: 1 },
    ...(split ? { split } : {}),
  };
}

/** 2ª via: valor já com os encargos embutidos — multa/juros do Asaas zerados para não cobrar em dobro */
export function payloadSegundaVia(valor: number, vencimento: string) {
  return { value: Math.round(valor * 100) / 100, dueDate: vencimento, fine: { value: 0 }, interest: { value: 0 } };
}

export type StatusCobranca = 'prevista' | 'emitida' | 'paga' | 'vencida' | 'cancelada' | 'estornada';

/** Status do Asaas → status local */
export function statusLocal(statusAsaas: string | null | undefined): StatusCobranca {
  switch (String(statusAsaas || '').toUpperCase()) {
    case 'RECEIVED': case 'CONFIRMED': case 'RECEIVED_IN_CASH': return 'paga';
    case 'OVERDUE': return 'vencida';
    case 'REFUNDED': case 'REFUND_REQUESTED': case 'CHARGEBACK_REQUESTED': case 'CHARGEBACK_DISPUTE': return 'estornada';
    case 'DELETED': return 'cancelada';
    default: return 'emitida';
  }
}

// ─── Chamadas ─────────────────────────────────────────────────────────────
export interface AsaasCobranca {
  id: string; status: string; value: number; dueDate: string; bankSlipUrl?: string | null; invoiceUrl?: string | null;
  nossoNumero?: string | null; billingType?: string; externalReference?: string | null;
  paymentDate?: string | null; clientPaymentDate?: string | null; confirmedDate?: string | null;
}
export interface DadosPagamentoAsaas { identificationField: string; barCode: string; nossoNumero: string; pixPayload: string | null; pixQrBase64: string | null }

export async function buscarOuCriarCliente(cfg: AsaasConfig, payload: ReturnType<typeof payloadCliente>, fetchFn?: FetchFn): Promise<string> {
  const lista = await asaasReq<{ data?: Array<{ id: string; deleted?: boolean }> }>(cfg, 'GET', `/customers?cpfCnpj=${payload.cpfCnpj}`, undefined, fetchFn);
  const existente = (lista?.data ?? []).find(c => !c.deleted);
  if (existente) return existente.id;
  return (await asaasReq<{ id: string }>(cfg, 'POST', '/customers', payload, fetchFn)).id;
}

export const criarCobranca = (cfg: AsaasConfig, payload: ReturnType<typeof payloadCobranca>, fetchFn?: FetchFn) =>
  asaasReq<AsaasCobranca>(cfg, 'POST', '/payments', payload, fetchFn);

export const atualizarCobranca = (cfg: AsaasConfig, id: string, payload: ReturnType<typeof payloadSegundaVia>, fetchFn?: FetchFn) =>
  asaasReq<AsaasCobranca>(cfg, 'PUT', `/payments/${encodeURIComponent(id)}`, payload, fetchFn);

export const obterCobranca = (cfg: AsaasConfig, id: string, fetchFn?: FetchFn) =>
  asaasReq<AsaasCobranca>(cfg, 'GET', `/payments/${encodeURIComponent(id)}`, undefined, fetchFn);

export const cancelarCobranca = (cfg: AsaasConfig, id: string, fetchFn?: FetchFn) =>
  asaasReq<{ deleted?: boolean }>(cfg, 'DELETE', `/payments/${encodeURIComponent(id)}`, undefined, fetchFn);

/** Linha digitável, código de barras, nosso número e PIX exatamente como o Asaas devolve */
export async function dadosDePagamento(cfg: AsaasConfig, id: string, fetchFn?: FetchFn): Promise<DadosPagamentoAsaas> {
  const enc = encodeURIComponent(id);
  const linha = await asaasReq<{ identificationField?: string; nossoNumero?: string; barCode?: string }>(cfg, 'GET', `/payments/${enc}/identificationField`, undefined, fetchFn);
  const pix = await asaasReq<{ payload?: string; encodedImage?: string }>(cfg, 'GET', `/payments/${enc}/pixQrCode`, undefined, fetchFn).catch(() => null);
  if (!linha?.identificationField || !linha.barCode) throw new AsaasErro('ASAAS_SEM_LINHA', 'Asaas não devolveu a linha digitável/código de barras', 502);
  return {
    identificationField: linha.identificationField, barCode: linha.barCode, nossoNumero: linha.nossoNumero ?? '',
    pixPayload: pix?.payload ?? null, pixQrBase64: pix?.encodedImage ?? null,
  };
}

/** Agência/conta do beneficiário (campo "Agência / Código do beneficiário" da ficha) */
export const numeroConta = (cfg: AsaasConfig, fetchFn?: FetchFn) =>
  asaasReq<{ agency?: string; account?: string; accountDigit?: string }>(cfg, 'GET', '/myAccount/accountNumber', undefined, fetchFn);
