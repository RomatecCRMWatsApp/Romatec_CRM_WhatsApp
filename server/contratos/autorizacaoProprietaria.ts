/**
 * Autorização da proprietária para venda em condições fora do padrão (plano negociado, parcela fixada, preço negociado):
 * o escritório gera o pedido com a comparação automática com a tabela (ganho/perda nominal e em valor presente), a
 * proprietária assina pelo link /aditivo/:token com código no WhatsApp (mesmo fluxo dos termos aditivos, com manifesto
 * de evidências) e o PDF assinado vai como anexo do contrato. Sem a autorização válida do plano ATUAL, o definitivo não sai.
 */
import { randomBytes, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contratoAditivos } from '../../drizzle/schema';
import { assinaturaDoPlano, compararComTabela, type Comparativo } from '../../shared/autorizacaoProprietaria';
import type { PlanoContrato } from './plano';
import { ContratoErro, condicoesDe, contratoPorId, juridicoDe, pessoasDe } from './servico';

export const TIPO_AUTORIZACAO = 'autorizacao_prop';
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const sinal = (v: number) => `${v >= 0 ? '+' : '−'} R$ ${brl(Math.abs(v))}`;
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const ANTES_DA_ASSINATURA = ['rascunho', 'minuta', 'apto_assinatura'];

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ContratoErro('DB', 'Banco indisponível', 503);
  return d;
}

/** Quem assina pela proprietária: representante (PJ) ou a própria (PF), com o WhatsApp do cadastro jurídico */
export async function proprietariaDoContrato(contratoId: number) {
  const c = await contratoPorId(contratoId);
  const j = await juridicoDe(c.empreendimentoId);
  const v = j.vendedora as Record<string, string>;
  const pj = j.vendedoraTipo === 'PJ';
  return { nome: (pj ? v.vend_rep_nome : v.vend_nome) || v.vend_nome || 'Proprietária', cpfCnpj: (pj ? v.vend_rep_cpf : v.vend_cpf) || '', telefone1: v.vend_telefone || null, razao: pj ? v.vend_razao_social || '' : '' };
}

/** O plano foge do padrão e precisa da autorização da proprietária? */
export const precisaAutorizacao = (p: Partial<PlanoContrato> | null | undefined) => !!p && !p.concessao && (!!p.plano_autorizado || !!p.parcela_personalizada);

async function comparativoDe(c: any, plano: PlanoContrato): Promise<Comparativo> {
  const cond = await condicoesDe(c.empreendimentoId);
  return compararComTabela({
    precoTabela: Number(plano.preco_tabela_original ?? plano.preco_tabela), precoProposta: Number(plano.preco_tabela),
    entrada: Number(plano.entrada_valor), prazo: Number(plano.saldo_qtd), taxaTabelaAa: Number(cond.jurosAaEfetivo),
    linhas: plano.parcelas.map(p => ({ vencimento: p.vencimento, valor: Number(p.valor) })), taxaPropostaAm: Number(plano.taxa_am),
  });
}

/** Situação da autorização do contrato: nao_precisa | pendente (sem autorização válida do plano atual) | valida */
export async function situacaoAutorizacao(contratoId: number, plano?: PlanoContrato | null): Promise<{ situacao: 'nao_precisa' | 'pendente' | 'valida'; aditivoId: number | null; pdf: string | null }> {
  const d = await banco();
  const p = plano ?? json((await contratoPorId(contratoId)).simulacaoJson);
  if (!precisaAutorizacao(p)) return { situacao: 'nao_precisa', aditivoId: null, pdf: null };
  const ass = assinaturaDoPlano(p);
  const as: any[] = await d.select().from(contratoAditivos).where(and(eq(contratoAditivos.contratoId, contratoId), eq(contratoAditivos.tipo, TIPO_AUTORIZACAO), eq(contratoAditivos.status, 'assinado')));
  const valida = as.sort((a, b) => Number(b.numero) - Number(a.numero)).find(a => json(a.dadosJson).assinaturaPlano === ass);
  return valida ? { situacao: 'valida', aditivoId: Number(valida.id), pdf: valida.pdfAssinadoArquivo || valida.pdfArquivo } : { situacao: 'pendente', aditivoId: null, pdf: null };
}

/** PDF assinado da autorização válida (anexo do contrato) */
export async function pdfAutorizacaoValida(contratoId: number, plano?: PlanoContrato | null): Promise<Buffer | null> {
  const s = await situacaoAutorizacao(contratoId, plano);
  if (s.situacao !== 'valida' || !s.pdf) return null;
  const { lerArquivo } = await import('./arquivos');
  return (await lerArquivo(s.pdf))?.buf ?? null;
}

async function pedidoPdf(c: any, plano: PlanoContrato, k: Comparativo, numero: number, prop: { nome: string; cpfCnpj: string; razao: string }, cliente: string, observacao: string): Promise<Buffer> {
  const { escritor } = await import('./docsComissao');
  const { slugDoContrato } = await import('../financeiro/servico');
  const marca = (await slugDoContrato(Number(c.id)).catch(() => 'bom-jardims')).replace(/-/g, '');
  const w0 = await escritor(`Autorização da proprietária — ${c.numero}`, marca, `Autorização n.º ${numero} · contrato ${c.numero} · Chácara ${c.loteCodigo}`);
  const w = { ...w0, paragrafo: (t: Parameters<typeof w0.paragrafo>[0], o: Parameters<typeof w0.paragrafo>[1] = {}) => w0.paragrafo(t, { size: 9.6, ...o }) };
  w.cabecalho('AUTORIZAÇÃO DE VENDA EM CONDIÇÕES FORA DO PADRÃO', `Documento n.º ${numero} do contrato ${c.numero} · Chácara ${c.loteCodigo} · ${Number(plano.area_m2).toLocaleString('pt-BR')} m²`);
  const ent = plano.entrada_qtd > 1 ? `${plano.entrada_qtd} parcelas mensais de R$ ${brl(plano.entrada_parcela)} (total R$ ${brl(plano.entrada_valor)})` : `R$ ${brl(plano.entrada_valor)} no ato`;
  w.paragrafo([{ t: 'O escritório gestor de vendas submete à ' }, { t: prop.razao || prop.nome, b: true }, { t: `, proprietária e promitente vendedora, a proposta de ` }, { t: cliente || 'cliente', b: true },
    { t: ` para a Chácara ${c.loteCodigo}, em condições fora da tabela de vendas, com a comparação abaixo.` }]);
  w.clausula('1. PROPOSTA');
  w.tabela(['Item', 'Proposta'], [
    ['Preço da venda', `R$ ${brl(k.precoProposta)}${k.precoProposta !== k.precoTabela ? ` (tabela: R$ ${brl(k.precoTabela)})` : ''}`],
    ['Entrada', ent],
    ['Saldo', `${plano.saldo_qtd} parcelas mensais de R$ ${brl(plano.saldo_parcela)}, a partir de ${br(plano.saldo_venc1)}`],
    ['Taxa efetiva da proposta', k.taxaPropostaAa != null ? `${pct(k.taxaPropostaAa)} a.a.` : '—'],
    ['Total a receber', `R$ ${brl(k.totalProposta)}`],
  ], { pesos: [1, 2.4] });
  w.clausula('2. COMPARAÇÃO COM A TABELA');
  w.tabela(['Item', 'Pela tabela', 'Proposta', 'Diferença'], [
    ['Preço', `R$ ${brl(k.precoTabela)}`, `R$ ${brl(k.precoProposta)}`, sinal(k.precoProposta - k.precoTabela)],
    [`Parcela (${k.prazo}×)`, `R$ ${brl(k.parcelaTabela)}`, `R$ ${brl(plano.saldo_parcela)}`, sinal(plano.saldo_parcela - k.parcelaTabela)],
    ['Juros', `R$ ${brl(k.jurosTabela)}`, `R$ ${brl(k.jurosProposta)}`, sinal(k.jurosProposta - k.jurosTabela)],
    ['Total recebido', `R$ ${brl(k.totalTabela)}`, `R$ ${brl(k.totalProposta)}`, sinal(k.diferencaNominal)],
    ['Valor presente (taxa da tabela)', `R$ ${brl(k.precoTabela)}`, `R$ ${brl(k.vpProposta)}`, `${sinal(k.diferencaVp)} (${k.diferencaVpPct.toLocaleString('pt-BR')}%)`],
  ], { pesos: [1.6, 1.2, 1.2, 1.3], direita: [1, 2, 3] });
  const ganho = k.diferencaVp >= 0;
  w.paragrafo([{ t: 'Resultado: ', b: true }, { t: ganho
    ? `a proposta não traz perda para a proprietária: em valor presente fica ${sinal(k.diferencaVp)} em relação à tabela (nominal: ${sinal(k.diferencaNominal)}).`
    : `a proposta representa ${ k.diferencaNominal < 0 ? `deixar de receber R$ ${brl(-k.diferencaNominal)} no total e ` : ''}uma perda de R$ ${brl(-k.diferencaVp)} em valor presente (${k.diferencaVpPct.toLocaleString('pt-BR')}% do preço de tabela).` }], { antes: 4 });
  if (observacao.trim()) w.paragrafo(`Observação do escritório: ${observacao.trim()}`);
  w.clausula('3. AUTORIZAÇÃO');
  w.paragrafo([{ t: 'A PROPRIETÁRIA, ciente da comparação acima, ' }, { t: 'AUTORIZA a venda da unidade nas condições desta proposta', b: true },
    { t: `, que passam a integrar o contrato ${c.numero} como condição negociada, e reconhece que a diferença em relação à tabela foi por ela aceita, não cabendo reclamação ao escritório gestor por esse motivo. Assinatura eletrônica com código enviado ao seu WhatsApp e manifesto de evidências (MP n.º 2.200-2/2001, art. 10; Lei n.º 14.063/2020). Valores nominais, sem correção monetária, calculados pelo sistema.` }]);
  const doc = prop.cpfCnpj ? (prop.cpfCnpj.replace(/\D/g, '').length === 11 ? `CPF ${prop.cpfCnpj}` : `CNPJ ${prop.cpfCnpj}`) : undefined;
  w.assinaturas([{ papel: prop.razao ? `PROPRIETÁRIA — ${prop.razao}` : 'PROPRIETÁRIA (promitente vendedora)', nome: prop.nome, doc }], { local: `Açailândia/MA, ${br(new Date(Date.now() - 3 * 3600_000).toISOString())}.` });
  return w.salvar();
}

/** Gera o pedido (PDF) e manda o link de assinatura ao WhatsApp da proprietária */
export async function solicitarAutorizacao(contratoId: number, o: { observacao?: string }, autorId: number) {
  const d = await banco();
  const c = await contratoPorId(contratoId);
  if (!ANTES_DA_ASSINATURA.includes(String(c.status))) throw new ContratoErro('STATUS', 'A autorização é pedida antes de o contrato ir para assinatura', 409);
  const plano = json(c.simulacaoJson) as PlanoContrato;
  if (plano.modalidade !== 'financiado') throw new ContratoErro('PLANO', 'A autorização é para plano financiado fora do padrão', 400);
  const todos: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.contratoId, contratoId));
  if (todos.some(a => a.tipo === TIPO_AUTORIZACAO && a.status === 'aguardando')) throw new ContratoErro('PENDENTE', 'Já existe um pedido aguardando a proprietária. Cancele-o antes de fazer outro.', 409);
  const prop = await proprietariaDoContrato(contratoId);
  const { comprador } = await pessoasDe(contratoId);
  const k = await comparativoDe(c, plano);
  const numero = todos.reduce((m, a) => Math.max(m, Number(a.numero)), 0) + 1;
  const pdf = await pedidoPdf(c, plano, k, numero, prop, String(comprador?.nome ?? ''), String(o.observacao ?? ''));
  const { salvarArquivo } = await import('./arquivos');
  const chave = `aditivos/${contratoId}/autorizacao-${numero}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const token = randomBytes(16).toString('hex');
  const pontos = [
    `Cliente: ${String(comprador?.nome ?? '—')} · Chácara ${c.loteCodigo}.`,
    `Preço: R$ ${brl(k.precoProposta)}${k.precoProposta !== k.precoTabela ? ` (tabela R$ ${brl(k.precoTabela)})` : ''}.`,
    `Entrada: R$ ${brl(plano.entrada_valor)}${plano.entrada_qtd > 1 ? ` em ${plano.entrada_qtd}×` : ''}. Saldo: ${plano.saldo_qtd}× de R$ ${brl(plano.saldo_parcela)} (tabela: R$ ${brl(k.parcelaTabela)}).`,
    `Total a receber: R$ ${brl(k.totalProposta)} (tabela: R$ ${brl(k.totalTabela)}; diferença ${sinal(k.diferencaNominal)}).`,
    `Em valor presente: ${sinal(k.diferencaVp)} (${k.diferencaVpPct.toLocaleString('pt-BR')}%) em relação à tabela.`,
    'Ao assinar, você autoriza a venda nessas condições.',
  ];
  await d.insert(contratoAditivos).values({
    contratoId, numero, tipo: TIPO_AUTORIZACAO, status: 'aguardando',
    dadosJson: JSON.stringify({ titulo: 'Autorização de venda fora do padrão', resumo: `${plano.saldo_qtd}× de R$ ${brl(plano.saldo_parcela)} · ${k.diferencaVp >= 0 ? 'sem perda' : `perda de R$ ${brl(-k.diferencaVp)} (VP)`}`, pontos, comparativo: k, assinaturaPlano: assinaturaDoPlano(plano), observacao: o.observacao ?? '' }),
    pdfArquivo: chave, pdfSha256: createHash('sha256').update(pdf).digest('hex'), token, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  const R = await import('../financeiro/renegociacao');
  const envio = await R.enviarLink(contratoId, token, numero, TIPO_AUTORIZACAO).catch(() => ({ enviado: false }));
  return { ok: true as const, numero, link: R.linkAditivo(token), enviado: envio.enviado, comparativo: k };
}

/** Para a tela do contrato: se precisa, situação, comparação do plano atual e pedidos feitos */
export async function painelAutorizacao(contratoId: number) {
  const c = await contratoPorId(contratoId);
  const plano = json(c.simulacaoJson) as PlanoContrato;
  const sit = await situacaoAutorizacao(contratoId, plano);
  const R = await import('../financeiro/renegociacao');
  const pedidos = (await R.aditivosDo(contratoId)).filter(a => a.tipo === TIPO_AUTORIZACAO);
  const k = plano.modalidade === 'financiado' && plano.parcelas?.length ? await comparativoDe(c, plano) : null;
  const prop = await proprietariaDoContrato(contratoId).catch(() => null);
  return { precisa: precisaAutorizacao(plano), situacao: sit.situacao, aditivoValido: sit.aditivoId, comparativo: k, pedidos, proprietaria: prop ? { nome: prop.nome, temWhatsapp: !!prop.telefone1 } : null };
}
