/**
 * Boleto de TESTE da integração CRM × Asaas (só administrador): cria o pagador (o próprio administrador, com os dados
 * do cadastro dele), uma cobrança de R$ 5,00 (mínimo do Asaas) sem multa/juros e com as notificações do Asaas
 * desligadas, busca linha digitável, código de barras e PIX e monta o nosso PDF com o beneficiário da conta.
 * Não vira cobrança de contrato: o webhook ignora (não está na tabela de cobranças). Cancelar só vale para "crm-teste-".
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../../drizzle/schema';
import { AsaasErro, asaasReq, beneficiarioDaConta, buscarOuCriarCliente, cancelarCobranca, dadosDePagamento, exigirConfigAsaas, obterCobranca, payloadCliente } from './asaas';
import { docMascarado } from './dados';
import { renderBoletoA4 } from './render/documentos';

export const VALOR_TESTE = 5;
const PREFIXO = 'crm-teste-';
const hojeBrasil = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const maisDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Cria a cobrança de teste em nome do administrador */
export async function criarBoletoTeste(usuarioId: number, valorPedido = VALOR_TESTE) {
  // Valor escolhido pelo administrador (R$ 1,00 a R$ 50,00); abaixo do mínimo da conta, o próprio Asaas recusa e a mensagem volta
  const valor = Math.round(Math.min(50, Math.max(1, Number(valorPedido) || VALOR_TESTE)) * 100) / 100;
  const cfg = exigirConfigAsaas();
  const d: any = await getDb();
  const [u] = await d.select().from(users).where(eq(users.id, usuarioId)).limit(1);
  const cpf = String(u?.cpf ?? '').replace(/\D/g, '');
  if (cpf.length !== 11) throw new AsaasErro('SEM_CPF', 'Para o teste, preencha o seu CPF em Meu cadastro (o boleto sai em seu nome)', 409);
  const customer = await buscarOuCriarCliente(cfg, {
    ...payloadCliente({
      nome: u.name ?? 'Administrador', cpfCnpj: cpf, telefone: u.telefone ?? '', email: u.email ?? '', cep: u.enderecoCep ?? '',
      logradouro: u.enderecoLogradouro ?? '', numero: u.enderecoNumero ?? '', complemento: u.enderecoComplemento ?? '', bairro: u.enderecoBairro ?? '', contratoId: 0,
    } as any),
    externalReference: `${PREFIXO}pagador-${usuarioId}`,
  } as any);
  const vencimento = maisDias(hojeBrasil(), 3);
  const cobranca = await asaasReq<{ id: string; invoiceUrl?: string; bankSlipUrl?: string }>(cfg, 'POST', '/payments', {
    customer, billingType: 'UNDEFINED', value: valor, dueDate: vencimento,
    description: 'TESTE da integração Romatec CRM × Asaas — não é cobrança de contrato (pode cancelar)',
    externalReference: `${PREFIXO}${Date.now()}`, fine: { value: 0 }, interest: { value: 0 },
  });
  return { paymentId: cobranca.id, valor, vencimento, ambiente: cfg.ambiente, faturaAsaas: cobranca.invoiceUrl ?? null };
}

async function deTeste(id: string) {
  const cfg = exigirConfigAsaas();
  if (!/^pay_[A-Za-z0-9]+$/.test(id)) throw new AsaasErro('ID', 'Cobrança inválida', 400);
  const c: any = await obterCobranca(cfg, id);
  if (!String(c?.externalReference ?? '').startsWith(PREFIXO)) throw new AsaasErro('NAO_E_TESTE', 'Esta cobrança não é um boleto de teste', 403);
  return { cfg, c };
}

/** PDF no layout do CRM, com linha, código de barras e PIX do Asaas e o beneficiário da conta */
export async function pdfBoletoTeste(id: string): Promise<Buffer> {
  const { cfg, c } = await deTeste(id);
  const [pag, benef, cli] = await Promise.all([
    dadosDePagamento(cfg, id), beneficiarioDaConta(cfg),
    asaasReq<{ name?: string; cpfCnpj?: string; address?: string; addressNumber?: string; province?: string; city?: string; cityName?: string; state?: string; postalCode?: string }>(cfg, 'GET', `/customers/${encodeURIComponent(c.customer)}`),
  ]);
  const endereco = [cli?.address && `${cli.address}${cli.addressNumber ? `, ${cli.addressNumber}` : ''}`, cli?.province, cli?.cityName, cli?.state].filter(Boolean).join(' · ') || '—';
  return renderBoletoA4({
    contratoNumero: 'TESTE', loteCodigo: '—', parcela: 'Teste da integração', vencimento: c.dueDate, valor: Number(c.value),
    nossoNumero: pag.nossoNumero, linhaDigitavel: pag.identificationField, codigoBarras: pag.barCode, pixPayload: pag.pixPayload, pixQrBase64: pag.pixQrBase64,
    beneficiario: benef.cpfCnpj ? `${benef.nome} — ${docMascarado(benef.cpfCnpj)}` : benef.nome, agenciaCodigo: benef.agenciaConta || '—',
    numeroDocumento: `TESTE-${id.slice(-6).toUpperCase()}`, dataDocumento: hojeBrasil(),
    pagadorNome: String(cli?.name ?? '').toUpperCase(), pagadorDoc: cli?.cpfCnpj ? docMascarado(cli.cpfCnpj) : '', pagadorEndereco: endereco,
    instrucoes: ['Boleto de TESTE da integração Romatec CRM × Asaas — não é parcela de contrato.', 'Pode ser pago para conferir a baixa, ou cancelado no CRM.'],
    loteResumo: '—', saldoApos: null, parcelasRestantes: '—',
  });
}

export async function situacaoBoletoTeste(id: string) {
  const { c } = await deTeste(id);
  return { paymentId: id, status: String(c.status), valor: Number(c.value), vencimento: c.dueDate, pagoEm: c.clientPaymentDate ?? c.paymentDate ?? null };
}

export async function cancelarBoletoTeste(id: string) {
  const { cfg } = await deTeste(id);
  await cancelarCobranca(cfg, id);
  return { ok: true };
}
