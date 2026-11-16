/**
 * Concessão: a comissão de gestão e corretagem (Termo Aditivo de Concessão, cláusula 4ª) passa a ser paga pelo(a)
 * beneficiário(a), em 1 a 4 parcelas. O administrador gera a proposta (termo de ciência e assunção de dívida — CC
 * art. 299, com o consentimento da gestora credora), que segue no WhatsApp com o mesmo fluxo de assinatura dos termos
 * aditivos (link /aditivo/:token, código de 6 dígitos, manifesto). Assinada, as parcelas viram cobranças "comissao"
 * no Asaas da conta do empreendimento com 100% de split para a carteira da Romatec.
 */
import { randomBytes, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratoAditivos, contratos } from '../../drizzle/schema';
import { parcelasComissao, type ParcelaComissao } from '../../shared/comissaoBeneficiario';
import { auditar, FinanceiroErro, hojeBrasil, pessoasDoContrato, slugDoContrato } from './servico';

export const TIPO_ADITIVO_COMISSAO = 'comissao_benef';
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string) => iso.split('-').reverse().join('/');
const EXT = ['', 'uma', 'duas', 'três', 'quatro'];

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  return d;
}

export interface PedidoComissao { parcelas: number; primeiroVencimento: string; valor?: number | null; /** boleto/PIX (padrão) ou link de pagamento no cartão */ forma?: 'boleto' | 'cartao' }
const ABERTAS = ['prevista', 'emitida', 'vencida'];

async function contratoConcessao(contratoId: number) {
  const d = await banco();
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new FinanceiroErro('NAO_ENCONTRADO', 'Contrato não encontrado', 404);
  const plano = json(c.simulacaoJson);
  if (!plano?.concessao) throw new FinanceiroErro('CONCESSAO', 'Só contrato de concessão tem a comissão paga pelo beneficiário', 400);
  if (['cancelado', 'distratado'].includes(String(c.status))) throw new FinanceiroErro('STATUS', 'Contrato cancelado', 409);
  return { d, c, plano };
}

/** Cobranças da comissão já lançadas (para a tela) */
export async function cobrancasComissao(contratoId: number) {
  const d = await banco();
  const ls: any[] = await d.select().from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'comissao')));
  // Boleto/PIX: o PDF no modelo do CRM (o mesmo das parcelas); cartão: o link de pagamento do Asaas
  const boletos = await Promise.all(ls.map(l => (l.linhaDigitavel ? caminhoBoletoCrm(Number(l.id)) : null)));
  const boletoCrm = (l: any) => boletos[ls.indexOf(l)];
  return ls.sort((a, b) => Number(a.numero) - Number(b.numero)).map(l => ({
    id: Number(l.id), numero: Number(l.numero), total: Number(l.total), vencimento: String(l.vencimento).slice(0, 10), valor: Number(l.valor),
    status: String(l.status), boleto: boletoCrm(l) ?? l.bankSlipUrl ?? null, pagoEm: l.pagoEm ? String(l.pagoEm).slice(0, 10) : null,
  }));
}

/** PDF da proposta (termo de ciência e assunção) */
async function propostaPdf(c: any, plano: any, numero: number, valor: number, ps: ParcelaComissao[], hoje: string, forma: 'boleto' | 'cartao' = 'boleto', pago = 0): Promise<Buffer> {
  const { escritor } = await import('../contratos/docsComissao');
  const { comprador, conjuge } = await pessoasDoContrato(Number(c.id));
  const { ESCRITORIO } = await import('../../shared/escritorio');
  const { reaisExtenso } = await import('../contratos/formato');
  const nome = String(comprador?.nome ?? '').trim() || 'BENEFICIÁRIO(A)';
  const cpf = String(comprador?.cpfCnpj ?? '');
  const marca = (await slugDoContrato(Number(c.id)).catch(() => 'bom-jardims')).replace(/-/g, '');
  const w0 = await escritor(`Proposta de parcelamento da comissão — ${c.numero}`, marca, `Termo Aditivo n.º ${numero} · comissão da concessão · CPCV n.º ${c.numero}`);
  // Corpo um pouco menor: a proposta e as assinaturas cabem numa página
  const w = { ...w0, paragrafo: (t: Parameters<typeof w0.paragrafo>[0], o: Parameters<typeof w0.paragrafo>[1] = {}) => w0.paragrafo(t, { size: 9.8, ...o }) };
  w.cabecalho('PROPOSTA DE PARCELAMENTO DA COMISSÃO', `Comissão de gestão e corretagem · Termo Aditivo n.º ${numero} ao CPCV n.º ${c.numero} · Concessão da Chácara ${c.loteCodigo}`);
  w.paragrafo([{ t: 'Pelo presente termo, ' }, { t: nome, b: true }, { t: `${cpf ? `, inscrito(a) no CPF sob o n.º ${cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}` : ''}, BENEFICIÁRIO(A) da concessão da Chácara ${c.loteCodigo}, e ` },
    { t: `${ESCRITORIO.razaoSocial} (${ESCRITORIO.fantasia})`, b: true }, { t: `, ${ESCRITORIO.creciJ}, inscrita no CNPJ sob o n.º ${ESCRITORIO.cnpj}, GESTORA, ajustam:` }]);
  w.clausula('1. DO OBJETO');
  w.paragrafo([{ t: `1.1. A comissão de gestão e corretagem da concessão, prevista na cláusula 4ª do Termo Aditivo de Concessão do CPCV n.º ${c.numero}, calculada sobre o valor de referência da unidade (R$ ${brl(Number(plano.preco_avista ?? 0))}), é de ` },
    { t: `R$ ${brl(Number(plano.concessao.comissaoValor ?? valor))} (${reaisExtenso(Number(plano.concessao.comissaoValor ?? valor))})`, b: true },
    { t: pago > 0 ? `, da qual já foram pagos R$ ${brl(pago)}; esta proposta trata do saldo de R$ ${brl(valor)} (${reaisExtenso(valor)}), substituindo as parcelas anteriores não pagas, que ficam canceladas.` : '.' }]);
  w.clausula('2. DA ASSUNÇÃO DO PAGAMENTO');
  w.paragrafo([{ t: '2.1. O(A) BENEFICIÁRIO(A) ' }, { t: 'assume, perante a GESTORA, o pagamento da comissão da cláusula 1', b: true },
    { t: ', com o consentimento expresso da GESTORA, credora, que o manifesta ao emitir esta proposta (Código Civil, art. 299). Com a assunção, a PROMITENTE VENDEDORA fica desobrigada do pagamento dessa comissão, permanecendo inalteradas as demais cláusulas do CPCV e do Termo Aditivo de Concessão.' }]);
  w.clausula('3. DA FORMA DE PAGAMENTO');
  w.paragrafo(`3.1. O valor será pago em ${ps.length === 1 ? 'parcela única' : `${ps.length} (${EXT[ps.length]}) parcelas mensais`}, ${forma === 'cartao' ? 'por cartão de crédito, pelo link de pagamento' : 'por boleto bancário ou PIX'} emitido pela GESTORA e enviado ao WhatsApp do(a) BENEFICIÁRIO(A):`);
  w.tabela(['Parcela', 'Vencimento', 'Valor'], ps.map(p => [`${p.numero}/${ps.length}`, br(p.vencimento), `R$ ${brl(p.valor)}`]), { pesos: [1, 1.4, 1.4], direita: [2] });
  w.paragrafo('3.2. Após o vencimento: multa de 2% e juros de mora de 1% ao mês; o valor em aberto poderá ser cobrado pelos meios legais.', { antes: 4 });
  w.clausula('4. DISPOSIÇÕES GERAIS');
  w.paragrafo('4.1. O(A) BENEFICIÁRIO(A) declara estar ciente do valor, das parcelas e dos vencimentos e com eles concordar. Assinatura eletrônica com código enviado ao seu WhatsApp e manifesto de evidências (MP n.º 2.200-2/2001, art. 10; Lei n.º 14.063/2020). Foro: Comarca de Açailândia/MA.');
  const blocos = [{ papel: 'BENEFICIÁRIO(A)', nome, doc: cpf ? `CPF ${cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}` : undefined }];
  if (conjuge?.nome) blocos.push({ papel: 'Cônjuge/companheiro(a) — ciente', nome: String(conjuge.nome), doc: conjuge.cpfCnpj ? `CPF ${String(conjuge.cpfCnpj).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}` : undefined });
  blocos.push({ papel: 'GESTORA (emitente da proposta)', nome: `${ESCRITORIO.fantasia} — ${ESCRITORIO.responsavel}`, doc: `${ESCRITORIO.creciJ} · ${ESCRITORIO.creciResponsavel}` });
  w.assinaturas(blocos, { local: `Açailândia/MA, ${br(hoje).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$1/$2/$3')}.` });
  return w.salvar();
}

/** Gera a proposta e manda o link ao WhatsApp do(a) beneficiário(a) */
export async function proporComissaoBeneficiario(contratoId: number, p: PedidoComissao, autorId: number, hoje = hojeBrasil()) {
  const { d, c, plano } = await contratoConcessao(contratoId);
  const existentes = await cobrancasComissao(contratoId);
  if (existentes.some(x => ABERTAS.includes(x.status))) throw new FinanceiroErro('EM_ABERTO', 'Há boletos da comissão em aberto. Revogue-os antes de gerar uma nova proposta (subdividir, juntar ou trocar a forma).', 409);
  // Sem valor informado: o que falta pagar da comissão (total menos as parcelas já pagas)
  const pago = existentes.filter(x => x.status === 'paga').reduce((s, x) => s + x.valor, 0);
  const valor = Math.round(Number(p.valor ?? (Number(plano.concessao.comissaoValor ?? 0) - pago)) * 100) / 100;
  const forma = p.forma === 'cartao' ? 'cartao' : 'boleto';
  if (p.primeiroVencimento < hoje) throw new FinanceiroErro('DATA', 'O 1º vencimento não pode ser antes de hoje', 400);
  let ps: ParcelaComissao[];
  try { ps = parcelasComissao(valor, Number(p.parcelas), p.primeiroVencimento); } catch (e: any) { throw new FinanceiroErro('PARCELAS', e.message, 400); }
  const todos: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.contratoId, contratoId));
  if (todos.some(a => a.tipo === TIPO_ADITIVO_COMISSAO && a.status === 'aguardando')) throw new FinanceiroErro('PENDENTE', 'Já existe uma proposta de comissão aguardando assinatura. Cancele-a antes de fazer outra.', 409);
  const numero = todos.reduce((m, a) => Math.max(m, Number(a.numero)), 0) + 1;
  const pdf = await propostaPdf(c, plano, numero, valor, ps, hoje, forma, pago);
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `aditivos/${contratoId}/comissao-${numero}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const token = randomBytes(16).toString('hex');
  const pontos = [
    `Comissão de gestão e corretagem da concessão: R$ ${brl(valor)}.`,
    `Você assume o pagamento dessa comissão perante a Romatec (a proprietária fica desobrigada dela).`,
    ...(pago > 0 ? [`Já pago da comissão: R$ ${brl(pago)}. Esta proposta trata do saldo.`] : []),
    ...ps.map(x => `Parcela ${x.numero}/${ps.length}: R$ ${brl(x.valor)}, vencimento em ${br(x.vencimento)} (${forma === 'cartao' ? 'cartão de crédito' : 'boleto ou PIX'}).`),
    'Atraso: multa de 2% e juros de 1% ao mês.',
  ];
  await d.insert(contratoAditivos).values({
    contratoId, numero, tipo: TIPO_ADITIVO_COMISSAO, status: 'aguardando',
    dadosJson: JSON.stringify({ titulo: 'Parcelamento da comissão da concessão', resumo: `R$ ${brl(valor)} em ${ps.length}× (${forma === 'cartao' ? 'cartão' : 'boleto/PIX'})`, pontos, valor, parcelas: ps, forma, data: hoje }),
    pdfArquivo: chave, pdfSha256: createHash('sha256').update(pdf).digest('hex'), token, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  await auditar('comissao_beneficiario_proposta', { contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { numero, valor, parcelas: ps.length } });
  const R = await import('./renegociacao');
  const envio = await R.enviarLink(contratoId, token, numero, TIPO_ADITIVO_COMISSAO).catch(() => ({ enviado: false }));
  return { ok: true as const, numero, link: R.linkAditivo(token), enviado: envio.enviado, parcelas: ps };
}

/** Assinada a proposta: lança as cobranças da comissão e emite no Asaas (idempotente pelo resultado gravado) */
export async function aplicarComissaoBeneficiario(aditivoId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a || a.status !== 'assinado') throw new FinanceiroErro('STATUS', 'Proposta não assinada', 409);
  if (a.resultadoJson) return json(a.resultadoJson) as { criadas: number; emitidas: number; falhasAsaas: string[] };
  const dados = json(a.dadosJson) as { valor: number; parcelas: ParcelaComissao[]; forma?: 'boleto' | 'cartao' };
  const contratoId = Number(a.contratoId);
  // Numeração contínua (índice único contrato + tipo + número): a 2ª proposta continua depois da 1ª
  const ja: any[] = await d.select({ numero: cobrancas.numero }).from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'comissao')));
  const base = ja.reduce((m, x) => Math.max(m, Number(x.numero)), 0);
  let criadas = 0;
  for (const p of dados.parcelas) {
    try {
      await d.insert(cobrancas).values({
        contratoId, tipo: 'comissao', numero: base + p.numero, total: base + dados.parcelas.length, vencimento: p.vencimento, valor: String(p.valor),
        jurosParcela: '0', amortizacao: String(p.valor), saldoDevedor: '0', splitValor: String(p.valor), status: 'prevista',
        ...(dados.forma === 'cartao' ? { formaPagamento: 'CARTAO' } : {}),
      } as any);
      criadas++;
    } catch (e: any) { if (!/unique|duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ''))) throw e; }
  }
  // O contrato passa a registrar que a comissão é do beneficiário (sai da conta "a receber da proprietária")
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  const plano = json(c?.simulacaoJson);
  if (plano?.concessao) {
    plano.concessao = { ...plano.concessao, comissaoPagador: 'beneficiario', comissaoParcelas: dados.parcelas.length, comissaoPrazo: `${dados.forma === 'cartao' ? 'Cartão' : 'Boletos'} do beneficiário (${dados.parcelas.length}×)` };
    await d.update(contratos).set({ simulacaoJson: plano, atualizadoEm: new Date() } as any).where(eq(contratos.id, contratoId));
  }
  const falhasAsaas: string[] = [];
  const emitidas = await emitirComissao(contratoId, falhasAsaas);
  const resultado = { criadas, emitidas, falhasAsaas };
  await d.update(contratoAditivos).set({ resultadoJson: JSON.stringify(resultado) } as any).where(eq(contratoAditivos.id, aditivoId));
  await auditar('comissao_beneficiario_aplicada', { contratoId, origem: 'sistema', detalhe: { numero: a.numero, ...resultado } });
  return resultado;
}

/** Emite no Asaas as parcelas da comissão ainda previstas (100% de split para a Romatec) e manda os boletos no WhatsApp */
export async function emitirComissao(contratoId: number, falhas: string[] = []): Promise<number> {
  const d = await banco();
  const slug = await slugDoContrato(contratoId).catch(() => 'bom-jardims');
  const { configAsaas, buscarOuCriarCliente, payloadCliente, criarCobranca, payloadCobranca, dadosDePagamento } = await import('./asaas');
  const cfg = configAsaas(process.env, slug);
  if (!cfg) { falhas.push('Asaas não configurado: boletos ficam previstos'); return 0; }
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c || ['cancelado', 'distratado'].includes(String(c.status))) return 0;
  const { comprador } = await pessoasDoContrato(contratoId);
  if (!comprador) { falhas.push('Contrato sem beneficiário cadastrado'); return 0; }
  let emitidas = 0;
  const links: string[] = [];
  try {
    const customerId = c.asaasCustomerId || await buscarOuCriarCliente(cfg, payloadCliente({ ...comprador, telefone: comprador.telefone1, contratoId } as any));
    if (!c.asaasCustomerId) await d.update(contratos).set({ asaasCustomerId: customerId } as any).where(eq(contratos.id, contratoId));
    const prev: any[] = await d.select().from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'comissao'), eq(cobrancas.status, 'prevista')));
    const hoje = hojeBrasil();
    for (const l of prev.sort((a, b) => Number(a.numero) - Number(b.numero))) {
      try {
        const venc = String(l.vencimento).slice(0, 10) >= hoje ? String(l.vencimento).slice(0, 10) : hoje;
        const cartao = String(l.formaPagamento ?? '') === 'CARTAO';
        const pay = await criarCobranca(cfg, payloadCobranca({
          customerId, cobrancaId: l.id, valor: Number(l.valor), vencimento: venc, billingType: cartao ? 'CREDIT_CARD' : 'UNDEFINED',
          descricao: `${c.numero} · Chácara ${c.loteCodigo} · Comissão de gestão ${l.numero}/${l.total} (concessão)`,
          splitPercentual: 100, walletComissao: cfg.walletComissao,
        }));
        if (cartao) {
          await d.update(cobrancas).set({ asaasPaymentId: pay.id, status: 'emitida', bankSlipUrl: pay.invoiceUrl ?? null, asaasSnapshot: { invoiceUrl: pay.invoiceUrl ?? null, billingType: 'CREDIT_CARD' } as any } as any)
            .where(and(eq(cobrancas.id, l.id), eq(cobrancas.status, 'prevista')));
          if (pay.invoiceUrl) links.push(`Parcela ${l.numero}/${l.total} — R$ ${brl(Number(l.valor))} no cartão: ${pay.invoiceUrl}`);
          emitidas++;
          continue;
        }
        const snap = await dadosDePagamento(cfg, pay.id);
        await d.update(cobrancas).set({
          asaasPaymentId: pay.id, status: 'emitida', bankSlipUrl: pay.bankSlipUrl ?? null, linhaDigitavel: snap.identificationField,
          codigoBarras: snap.barCode, nossoNumero: snap.nossoNumero, pixPayload: snap.pixPayload, asaasSnapshot: snap as any,
        } as any).where(and(eq(cobrancas.id, l.id), eq(cobrancas.status, 'prevista')));
        const linhaCrm = snap.identificationField ? await linhaBoletoComissao({ id: Number(l.id), numero: Number(l.numero), total: Number(l.total), valor: Number(l.valor), vencimento: venc, pix: !!snap.pixPayload }) : null;
        if (linhaCrm) links.push(linhaCrm);
        else if (pay.bankSlipUrl) links.push(`Parcela ${l.numero}/${l.total} — R$ ${brl(Number(l.valor))}, venc. ${br(venc)}: ${pay.bankSlipUrl}`);
        emitidas++;
      } catch (e: any) { falhas.push(`emitir parcela ${l.numero}: ${String(e?.message ?? e).slice(0, 160)}`); }
    }
  } catch (e: any) { falhas.push(`cliente no Asaas: ${String(e?.message ?? e).slice(0, 160)}`); }
  if (links.length) await enviarBoletosComissao(c, comprador, links, falhas);
  return emitidas;
}

const DIAS_LINK_BOLETO = 60;

/** Caminho assinado do boleto A4 do CRM; null se o servidor não tiver a chave de assinatura */
async function caminhoBoletoCrm(id: number): Promise<string | null> {
  const { assinarLink } = await import('./links');
  try { return assinarLink(`/api/financeiro/cobrancas/${id}/boleto-a4.pdf`, Date.now(), DIAS_LINK_BOLETO); } catch { return null; }
}

/** Uma parcela da comissão na mensagem: boleto A4 no modelo do CRM (link assinado) e a página de copiar o PIX */
async function linhaBoletoComissao(l: { id: number; numero: number; total: number; valor: number; vencimento: string; pix: boolean }): Promise<string | null> {
  const caminho = await caminhoBoletoCrm(l.id);
  if (!caminho) return null; // sem chave para assinar o link: a mensagem cai no boleto do Asaas
  const { urlPixDaCobranca } = await import('./dados');
  const base = (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
  const boleto = `${base}${caminho}`;
  let pix: string | null = null;
  try { pix = l.pix ? urlPixDaCobranca(l.id) : null; } catch { pix = null; }
  return `Parcela ${l.numero}/${l.total} — R$ ${brl(l.valor)}, venc. ${br(l.vencimento)}\nBoleto (PDF): ${boleto}${pix ? `\nPagar por Pix: ${pix}` : ''}`;
}

async function enviarBoletosComissao(c: any, comprador: any, linhas: string[], falhas: string[]): Promise<boolean> {
  const tel = String(comprador.telefone1 ?? '').replace(/\D/g, '');
  const fone = tel.length >= 10 ? (tel.startsWith('55') && tel.length >= 12 ? tel : `55${tel}`) : null;
  if (!fone) { falhas.push('Beneficiário(a) sem WhatsApp cadastrado'); return false; }
  const { enviarMensagem } = await import('../assinatura/servico');
  const nome = String(comprador.nome ?? '').trim().split(/\s+/)[0] || 'cliente';
  const emp = await nomeDoEmpreendimento(Number(c.empreendimentoId));
  try {
    await enviarMensagem(fone, `Olá, ${nome}! Seguem os boletos da comissão de gestão da concessão da chácara ${c.loteCodigo} do ${emp} (contrato ${c.numero}). Cada um pode ser pago pelo boleto ou pelo PIX:\n\n${linhas.join('\n\n')}\n\nDúvidas: (99) 9 9101-1970.`);
    return true;
  } catch (e: any) { falhas.push(`WhatsApp: ${String(e?.message ?? e).slice(0, 120)}`); return false; }
}

async function nomeDoEmpreendimento(id: number): Promise<string> {
  const d = await banco();
  const { empreendimentos } = await import('../../drizzle/schema');
  const [e]: any[] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, id)).limit(1);
  return String(e?.nome ?? 'Condomínio de Chácaras Bom Jardims');
}

/**
 * Reenvia ao WhatsApp do(a) beneficiário(a) os boletos da comissão já emitidos e ainda não pagos, no modelo do CRM
 * (boleto A4 + página do PIX). As cobranças no Asaas não mudam: mesmo nosso número, mesma linha digitável e mesmo PIX.
 */
export async function reenviarBoletosComissao(contratoId: number): Promise<{ enviados: number; falhas: string[] }> {
  const d = await banco();
  const falhas: string[] = [];
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) return { enviados: 0, falhas: ['Contrato não encontrado'] };
  const { comprador } = await pessoasDoContrato(contratoId);
  if (!comprador) return { enviados: 0, falhas: ['Contrato sem beneficiário cadastrado'] };
  const ls: any[] = await d.select().from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'comissao'), eq(cobrancas.status, 'emitida')));
  const linhas: string[] = [];
  for (const l of ls.sort((a, b) => Number(a.numero) - Number(b.numero))) {
    if (String(l.formaPagamento ?? '') === 'CARTAO') { if (l.bankSlipUrl) linhas.push(`Parcela ${l.numero}/${l.total} — R$ ${brl(Number(l.valor))} no cartão: ${l.bankSlipUrl}`); continue; }
    if (!l.linhaDigitavel) continue;
    const venc = String(l.vencimento).slice(0, 10);
    const linha = await linhaBoletoComissao({ id: Number(l.id), numero: Number(l.numero), total: Number(l.total), valor: Number(l.valor), vencimento: venc, pix: !!l.pixPayload });
    if (linha) linhas.push(linha);
    else if (l.bankSlipUrl) linhas.push(`Parcela ${l.numero}/${l.total} — R$ ${brl(Number(l.valor))}, venc. ${br(venc)}: ${l.bankSlipUrl}`);
  }
  if (!linhas.length) return { enviados: 0, falhas: ['Nenhum boleto da comissão em aberto'] };
  const ok = await enviarBoletosComissao(c, comprador, linhas, falhas);
  return { enviados: ok ? linhas.length : 0, falhas };
}

/** Revoga os boletos da comissão ainda não pagos (cancela também no Asaas): abre caminho para nova proposta — subdividir, juntar ou trocar a forma */
export async function revogarComissao(contratoId: number, autorId: number) {
  const { d } = await contratoConcessao(contratoId);
  const ls: any[] = await d.select().from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'comissao')));
  const abertas = ls.filter(l => ABERTAS.includes(String(l.status)));
  if (!abertas.length) throw new FinanceiroErro('SEM_ABERTAS', 'Não há boletos da comissão em aberto', 409);
  const slug = await slugDoContrato(contratoId).catch(() => 'bom-jardims');
  const { cancelarCobrancaInterna } = await import('../contratos/cancelamento');
  const falhas: string[] = [];
  let canceladas = 0;
  for (const l of abertas) {
    const x = await cancelarCobrancaInterna(l, slug);
    if (x.asaas === 'erro') falhas.push(`parcela ${l.numero}: ${x.erro}`); else canceladas++;
  }
  await auditar('comissao_beneficiario_revogada', { contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { canceladas, falhas } });
  return { canceladas, falhas };
}
