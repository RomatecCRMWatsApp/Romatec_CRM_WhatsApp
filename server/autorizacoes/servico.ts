/**
 * Autorizações de venda fora do padrão (antes do contrato): o escritório monta a proposta — uma ou várias chácaras do
 * mesmo empreendimento, cada uma com o seu plano negociado — com a comparação automática com a tabela; a proprietária
 * (pessoa ou empresa, pelo representante) assina pelo link /aditivo/:token com código no WhatsApp e manifesto de
 * evidências. Autorizada, cada chácara vira um contrato individual no Novo contrato, que puxa o plano dela (sem
 * redigitar) e leva o PDF assinado como anexo. Numeração própria: Autorização n.º 1, 2, 3…
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { autorizacoesVenda, empreendimentos, lotes } from '../../drizzle/schema';
import { simular } from '../../shared/simulador';
import { assinaturaDoPlano, compararComTabela, type Comparativo } from '../../shared/autorizacaoProprietaria';
import { planoDoContrato, type PlanoContrato, type PlanoPersonalizado } from '../contratos/plano';
import { ContratoErro, condicoesDe, juridicoDe } from '../contratos/servico';

const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string) => String(iso).slice(0, 10).split('-').reverse().join('/');
const sinal = (v: number) => `${v >= 0 ? '+' : '-'} R$ ${brl(Math.abs(v))}`;
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const fone = (v: unknown) => { const s = String(v ?? '').replace(/\D/g, ''); return s.length < 10 ? null : s.startsWith('55') && s.length >= 12 ? s : `55${s}`; };
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const OTP_MIN = 10;
export const MAX_CHACARAS = 20;

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ContratoErro('DB', 'Banco indisponível', 503);
  return d;
}

export interface ItemPedido { loteCodigo: string; personalizado: PlanoPersonalizado; dataPrimeiroPagamento: string }
export interface PedidoAutorizacao {
  empreendimentoSlug: string; clienteNome: string; itens: ItemPedido[]; observacao?: string;
  /** Proprietário(a) que autoriza: vazio = o do cadastro jurídico do empreendimento */
  proprietario?: { nome?: string; documento?: string; empresa?: string; telefone?: string } | null;
}
export interface ItemCalculado {
  loteCodigo: string; areaM2: number; escolha: { modalidade: 'financiado'; dataPrimeiroPagamento: string; personalizado: PlanoPersonalizado };
  plano: PlanoContrato; comparativo: Comparativo; assinaturaPlano: string;
}

async function empreendimentoPorSlug(slug: string) {
  const d = await banco();
  const [e]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, slug)).limit(1);
  if (!e) throw new ContratoErro('NAO_ENCONTRADO', 'Empreendimento não encontrado', 404);
  return e;
}

/** Proprietária do cadastro jurídico (PF ou representante da PJ), com o que o escritório informou por cima */
export async function proprietariaPadrao(empreendimentoId: number, o?: PedidoAutorizacao['proprietario']) {
  const j = await juridicoDe(empreendimentoId);
  const v = j.vendedora as Record<string, string>;
  const pj = j.vendedoraTipo === 'PJ';
  return {
    nome: String(o?.nome || (pj ? v.vend_rep_nome : v.vend_nome) || v.vend_nome || 'Proprietária').trim(),
    documento: String(o?.documento || (pj ? v.vend_rep_cpf : v.vend_cpf) || '').trim(),
    empresa: String(o?.empresa ?? (pj ? v.vend_razao_social || '' : '')).trim(),
    telefone: String(o?.telefone || v.vend_telefone || '').trim(),
  };
}

/** Calcula cada chácara: plano negociado sobre o preço de tabela dela e comparação com a tabela */
export async function calcularItens(empreendimentoId: number, itens: ItemPedido[]): Promise<ItemCalculado[]> {
  if (!itens.length) throw new ContratoErro('ITENS', 'Inclua ao menos uma chácara', 400);
  if (itens.length > MAX_CHACARAS) throw new ContratoErro('ITENS', `Até ${MAX_CHACARAS} chácaras por autorização`, 400);
  const codigos = itens.map(i => String(i.loteCodigo).trim().toUpperCase());
  if (new Set(codigos).size !== codigos.length) throw new ContratoErro('ITENS', 'A mesma chácara aparece duas vezes', 400);
  const d = await banco();
  const ls: any[] = await d.select().from(lotes).where(and(eq(lotes.empreendimentoId, empreendimentoId), inArray(lotes.codigo, codigos)));
  const cond = await condicoesDe(empreendimentoId);
  return itens.map((it, k) => {
    const cod = codigos[k];
    const l = ls.find(x => String(x.codigo).toUpperCase() === cod);
    if (!l) throw new ContratoErro('LOTE', `Chácara ${cod} não encontrada`, 404);
    const escolha = { modalidade: 'financiado' as const, dataPrimeiroPagamento: it.dataPrimeiroPagamento, personalizado: it.personalizado };
    let plano: PlanoContrato;
    try { plano = planoDoContrato(simular(Number(l.areaM2), 1, cond, l.precoTabela != null ? Number(l.precoTabela) : null), escolha, cond, true); }
    catch (e: any) { throw new ContratoErro('PLANO', `Chácara ${cod}: ${e.message}`, 400); }
    const comparativo = compararComTabela({
      precoTabela: Number(plano.preco_tabela_original ?? plano.preco_tabela), precoProposta: Number(plano.preco_tabela), entrada: Number(plano.entrada_valor),
      prazo: Number(plano.saldo_qtd), taxaTabelaAa: Number(cond.jurosAaEfetivo), linhas: plano.parcelas.map(p => ({ vencimento: p.vencimento, valor: Number(p.valor) })), taxaPropostaAm: Number(plano.taxa_am),
    });
    return { loteCodigo: cod, areaM2: Number(l.areaM2), escolha, plano, comparativo, assinaturaPlano: assinaturaDoPlano(plano) };
  });
}

export function totais(xs: ItemCalculado[]) {
  const s = (f: (c: Comparativo) => number) => Math.round(xs.reduce((a, x) => a + f(x.comparativo), 0) * 100) / 100;
  return { precoTabela: s(c => c.precoTabela), totalTabela: s(c => c.totalTabela), totalProposta: s(c => c.totalProposta), diferencaNominal: s(c => c.diferencaNominal), diferencaVp: s(c => c.diferencaVp),
    parcelaMensal: Math.round(xs.reduce((a, x) => a + Number(x.plano.saldo_parcela), 0) * 100) / 100, parcelaMensalTabela: s(c => c.parcelaTabela) };
}

/** Prévia para a tela: cálculo sem gravar */
export async function simularPedido(p: PedidoAutorizacao) {
  const e = await empreendimentoPorSlug(p.empreendimentoSlug);
  const xs = await calcularItens(Number(e.id), p.itens);
  return { itens: xs.map(x => ({ loteCodigo: x.loteCodigo, areaM2: x.areaM2, comparativo: x.comparativo, entrada: x.plano.entrada_valor, entradaQtd: x.plano.entrada_qtd, parcela: x.plano.saldo_parcela, prazo: x.plano.saldo_qtd, venc1: x.plano.saldo_venc1, taxaAa: x.plano.taxa_aa })), totais: totais(xs) };
}

async function pedidoPdf(numero: number, emp: any, prop: Awaited<ReturnType<typeof proprietariaPadrao>>, cliente: string, xs: ItemCalculado[], observacao: string): Promise<Buffer> {
  const { escritor } = await import('../contratos/docsComissao');
  const marca = String(emp.slug ?? 'bom-jardims').replace(/-/g, '');
  const w0 = await escritor(`Autorização n.º ${numero}`, marca, `Autorização n.º ${numero} · ${xs.map(x => x.loteCodigo).join(', ')}`);
  const w = { ...w0, paragrafo: (t: Parameters<typeof w0.paragrafo>[0], o: Parameters<typeof w0.paragrafo>[1] = {}) => w0.paragrafo(t, { size: 9.6, ...o }) };
  const tot = totais(xs);
  const plural = xs.length > 1;
  w.cabecalho('AUTORIZAÇÃO DE VENDA EM CONDIÇÕES FORA DO PADRÃO', `Autorização n.º ${numero} · ${emp.nome} · ${plural ? 'Chácaras' : 'Chácara'} ${xs.map(x => x.loteCodigo).join(', ')}`);
  w.paragrafo([{ t: 'O escritório gestor de vendas submete à ' }, { t: prop.empresa || prop.nome, b: true }, { t: `${prop.empresa ? `, neste ato representada por ${prop.nome}` : ''}, proprietária e promitente vendedora, a proposta de ` },
    { t: cliente, b: true }, { t: ` para ${plural ? `as chácaras ${xs.map(x => x.loteCodigo).join(', ')}` : `a Chácara ${xs[0].loteCodigo}`}, em condições fora da tabela de vendas. Cada chácara terá contrato individual com o plano abaixo.` }]);
  w.clausula('1. PROPOSTA POR CHÁCARA');
  w.tabela(['Chácara', 'Preço', 'Entrada', 'Saldo', 'Taxa', 'Total'], xs.map(x => [
    `${x.loteCodigo} (${x.areaM2.toLocaleString('pt-BR')} m²)`,
    `R$ ${brl(x.comparativo.precoProposta)}`,
    x.plano.entrada_qtd > 1 ? `${x.plano.entrada_qtd}× R$ ${brl(x.plano.entrada_parcela)}` : `R$ ${brl(x.plano.entrada_valor)}`,
    `${x.plano.saldo_qtd}× R$ ${brl(x.plano.saldo_parcela)} de ${br(x.plano.saldo_venc1)}`,
    x.comparativo.taxaPropostaAa != null ? `${pct(x.comparativo.taxaPropostaAa)} a.a.` : '—',
    `R$ ${brl(x.comparativo.totalProposta)}`,
  ]), { pesos: [1.3, 1.1, 1.2, 1.9, 0.8, 1.1], direita: [1, 5], size: 8 });
  w.clausula('2. COMPARAÇÃO COM A TABELA');
  w.tabela(['Chácara', 'Parcela tabela', 'Total tabela', 'Total proposta', 'Diferença', 'Valor presente'], [
    ...xs.map(x => [x.loteCodigo, `R$ ${brl(x.comparativo.parcelaTabela)}`, `R$ ${brl(x.comparativo.totalTabela)}`, `R$ ${brl(x.comparativo.totalProposta)}`, sinal(x.comparativo.diferencaNominal), `${sinal(x.comparativo.diferencaVp)} (${x.comparativo.diferencaVpPct.toLocaleString('pt-BR')}%)`]),
    ...(plural ? [['TOTAL', `R$ ${brl(tot.parcelaMensalTabela)}/mês`, `R$ ${brl(tot.totalTabela)}`, `R$ ${brl(tot.totalProposta)}`, sinal(tot.diferencaNominal), sinal(tot.diferencaVp)]] : []),
  ], { pesos: [0.9, 1.1, 1.2, 1.2, 1.1, 1.5], direita: [1, 2, 3, 4, 5], size: 8 });
  w.paragrafo([{ t: 'Resultado: ', b: true }, { t: tot.diferencaVp >= 0
    ? `a proposta não traz perda para a proprietária: em valor presente fica ${sinal(tot.diferencaVp)} em relação à tabela (no total recebido: ${sinal(tot.diferencaNominal)}).`
    : `a proposta representa ${tot.diferencaNominal < 0 ? `deixar de receber R$ ${brl(-tot.diferencaNominal)} no total e ` : ''}uma perda de R$ ${brl(-tot.diferencaVp)} em valor presente, à taxa da tabela.` }], { antes: 4 });
  if (observacao.trim()) w.paragrafo(`Observação do escritório: ${observacao.trim()}`);
  w.clausula('3. AUTORIZAÇÃO');
  w.paragrafo([{ t: 'A PROPRIETÁRIA, ciente da comparação acima, ' }, { t: `AUTORIZA a venda ${plural ? 'das chácaras' : 'da chácara'} nas condições desta proposta`, b: true },
    { t: ', que integrarão o contrato de cada unidade como condição negociada, e reconhece que a diferença em relação à tabela foi por ela aceita, não cabendo reclamação ao escritório gestor por esse motivo. Assinatura eletrônica com código enviado ao seu WhatsApp e manifesto de evidências (MP n.º 2.200-2/2001, art. 10; Lei n.º 14.063/2020). Valores nominais, sem correção monetária, calculados pelo sistema.' }]);
  const doc = prop.documento ? (prop.documento.replace(/\D/g, '').length > 11 ? `CNPJ ${prop.documento}` : `CPF ${prop.documento}`) : undefined;
  w.assinaturas([{ papel: prop.empresa ? `PROPRIETÁRIA — ${prop.empresa}` : 'PROPRIETÁRIA (promitente vendedora)', nome: prop.nome, doc }], { local: `Açailândia/MA, ${br(new Date(Date.now() - 3 * 3600_000).toISOString())}.` });
  return w.salvar();
}

const linkDe = async (token: string) => (await import('../financeiro/renegociacao')).linkAditivo(token);
async function enviador() { return (await import('../financeiro/renegociacao')).enviarMensagemAditivo; }

/** Gera a autorização (PDF) e manda o link à proprietária */
export async function criarAutorizacao(p: PedidoAutorizacao, autorId: number) {
  const d = await banco();
  const emp = await empreendimentoPorSlug(p.empreendimentoSlug);
  const cliente = String(p.clienteNome ?? '').trim();
  if (cliente.length < 3) throw new ContratoErro('CLIENTE', 'Informe o nome do interessado', 400);
  const xs = await calcularItens(Number(emp.id), p.itens);
  const prop = await proprietariaPadrao(Number(emp.id), p.proprietario);
  const todas: any[] = await d.select({ numero: autorizacoesVenda.numero }).from(autorizacoesVenda);
  const numero = todas.reduce((m, a) => Math.max(m, Number(a.numero)), 0) + 1;
  const pdf = await pedidoPdf(numero, emp, prop, cliente, xs, String(p.observacao ?? ''));
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `autorizacoes/autorizacao-${numero}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const tot = totais(xs);
  const token = randomBytes(16).toString('hex');
  const pontos = [
    `Interessado: ${cliente}.`,
    ...xs.map(x => `Chácara ${x.loteCodigo}: entrada ${x.plano.entrada_qtd > 1 ? `${x.plano.entrada_qtd}× R$ ${brl(x.plano.entrada_parcela)}` : `R$ ${brl(x.plano.entrada_valor)}`} + ${x.plano.saldo_qtd}× R$ ${brl(x.plano.saldo_parcela)} (tabela: R$ ${brl(x.comparativo.parcelaTabela)}); diferença em valor presente ${sinal(x.comparativo.diferencaVp)}.`),
    ...(xs.length > 1 ? [`Total: R$ ${brl(tot.totalProposta)} (tabela R$ ${brl(tot.totalTabela)}); em valor presente ${sinal(tot.diferencaVp)}.`] : []),
    'Ao assinar, você autoriza a venda nessas condições.',
  ];
  await d.insert(autorizacoesVenda).values({
    numero, empreendimentoId: Number(emp.id), loteCodigos: xs.map(x => x.loteCodigo).join(', ').slice(0, 255), clienteNome: cliente.slice(0, 160),
    escolhaJson: JSON.stringify({ itens: xs.map(x => ({ loteCodigo: x.loteCodigo, escolha: x.escolha })) }),
    dadosJson: JSON.stringify({ proprietaria: prop, itens: xs.map(x => ({ loteCodigo: x.loteCodigo, areaM2: x.areaM2, comparativo: x.comparativo, assinaturaPlano: x.assinaturaPlano, entrada: x.plano.entrada_valor, entradaQtd: x.plano.entrada_qtd, parcela: x.plano.saldo_parcela, prazo: x.plano.saldo_qtd, contratoId: null })), totais: tot, pontos }),
    observacao: String(p.observacao ?? '').slice(0, 600) || null, status: 'aguardando', pdfArquivo: chave, pdfSha256: sha(pdf), token, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  const envio = await enviarLink(numero, token, prop, emp.nome).catch(() => ({ enviado: false }));
  return { ok: true as const, numero, link: await linkDe(token), enviado: envio.enviado, totais: tot };
}

async function enviarLink(numero: number, token: string, prop: { nome: string; telefone: string }, empNome: string) {
  const tel = fone(prop.telefone);
  if (!tel) return { enviado: false };
  const nome = prop.nome.split(/\s+/)[0] || 'proprietária';
  await (await enviador())(tel, `Olá, ${nome}! O pedido de Autorização n.º ${numero} de venda em condições fora do padrão (${empNome}) está pronto. Leia e autorize por aqui (você recebe um código de confirmação no WhatsApp): ${await linkDe(token)}`);
  return { enviado: true };
}

export async function listarAutorizacoes() {
  const d = await banco();
  const rs: any[] = await d.select().from(autorizacoesVenda).orderBy(desc(autorizacoesVenda.numero));
  const emps: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos);
  return await Promise.all(rs.map(async a => {
    const dd = json(a.dadosJson);
    const e = emps.find(x => Number(x.id) === Number(a.empreendimentoId));
    return {
      id: Number(a.id), numero: Number(a.numero), empreendimento: e?.nome ?? '', slug: e?.slug ?? '', chacaras: String(a.loteCodigos), cliente: String(a.clienteNome),
      proprietaria: dd.proprietaria?.empresa || dd.proprietaria?.nome || '', status: String(a.status), totais: dd.totais ?? null,
      itens: (dd.itens ?? []).map((i: any) => ({ loteCodigo: i.loteCodigo, contratoId: i.contratoId ?? null, parcela: i.parcela, prazo: i.prazo, entrada: i.entrada, entradaQtd: i.entradaQtd, diferencaVp: i.comparativo?.diferencaVp ?? 0 })),
      link: a.status === 'aguardando' ? await linkDe(a.token) : null, assinadoEm: a.assinadoEm ? new Date(a.assinadoEm).toISOString() : null, criadoEm: new Date(a.criadoEm).toISOString(),
    };
  }));
}

export async function cancelarAutorizacao(id: number, autorId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a) throw new ContratoErro('NAO_ENCONTRADO', 'Autorização não encontrada', 404);
  if (a.status !== 'aguardando') throw new ContratoErro('STATUS', 'Só se cancela autorização ainda não assinada', 409);
  await d.update(autorizacoesVenda).set({ status: 'cancelada', canceladoPor: autorId } as any).where(and(eq(autorizacoesVenda.id, id), eq(autorizacoesVenda.status, 'aguardando')));
  return { ok: true as const };
}

export async function reenviarAutorizacao(id: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a || a.status !== 'aguardando') throw new ContratoErro('STATUS', 'Esta autorização não está aguardando assinatura', 409);
  const [e]: any[] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, a.empreendimentoId)).limit(1);
  return enviarLink(Number(a.numero), a.token, json(a.dadosJson).proprietaria ?? {}, e?.nome ?? '');
}

export async function pdfDaAutorizacao(id: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a) return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(a.pdfAssinadoArquivo || a.pdfArquivo);
  return f ? { buf: f.buf, nome: `AUTORIZACAO-${a.numero}${a.pdfAssinadoArquivo ? '-assinada' : ''}.pdf` } : null;
}

// ─── Novo contrato: autorizações disponíveis para a chácara e vínculo ───────────────────

/** Autorizadas com a chácara ainda sem contrato */
export async function disponiveisPara(empreendimentoSlug: string, loteCodigo: string) {
  const d = await banco();
  const e = await empreendimentoPorSlug(empreendimentoSlug);
  const rs: any[] = await d.select().from(autorizacoesVenda).where(and(eq(autorizacoesVenda.empreendimentoId, Number(e.id)), eq(autorizacoesVenda.status, 'autorizada')));
  const cod = loteCodigo.toUpperCase();
  return rs.map(a => ({ a, item: (json(a.dadosJson).itens ?? []).find((i: any) => i.loteCodigo === cod && !i.contratoId), escolha: (json(a.escolhaJson).itens ?? []).find((i: any) => i.loteCodigo === cod)?.escolha }))
    .filter(x => x.item && x.escolha)
    .map(x => ({ id: Number(x.a.id), numero: Number(x.a.numero), cliente: String(x.a.clienteNome), escolha: x.escolha, parcela: x.item.parcela, prazo: x.item.prazo, entrada: x.item.entrada, entradaQtd: x.item.entradaQtd, diferencaVp: x.item.comparativo?.diferencaVp ?? 0 }));
}

/** Escolha do plano da chácara na autorização (para criar o contrato) — confere status e se ainda está livre */
export async function escolhaDaAutorizacao(id: number, empreendimentoId: number, loteCodigo: string) {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a || Number(a.empreendimentoId) !== empreendimentoId) throw new ContratoErro('AUTORIZACAO', 'Autorização não encontrada para este empreendimento', 404);
  if (a.status !== 'autorizada') throw new ContratoErro('AUTORIZACAO', `A Autorização n.º ${a.numero} ainda não foi assinada pela proprietária`, 409);
  const cod = loteCodigo.toUpperCase();
  const item = (json(a.dadosJson).itens ?? []).find((i: any) => i.loteCodigo === cod);
  const esc = (json(a.escolhaJson).itens ?? []).find((i: any) => i.loteCodigo === cod)?.escolha;
  if (!item || !esc) throw new ContratoErro('AUTORIZACAO', `A Autorização n.º ${a.numero} não inclui a chácara ${cod}`, 409);
  if (item.contratoId) throw new ContratoErro('AUTORIZACAO', `A chácara ${cod} da Autorização n.º ${a.numero} já tem contrato`, 409);
  return { numero: Number(a.numero), escolha: esc };
}

/** Marca o contrato na chácara da autorização */
export async function vincularContrato(id: number, loteCodigo: string, contratoId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a) return;
  const dd = json(a.dadosJson);
  dd.itens = (dd.itens ?? []).map((i: any) => (i.loteCodigo === loteCodigo.toUpperCase() ? { ...i, contratoId } : i));
  await d.update(autorizacoesVenda).set({ dadosJson: JSON.stringify(dd) } as any).where(eq(autorizacoesVenda.id, id));
}

/** Para o contrato: a autorização vinculada vale para o plano atual? (e o PDF assinado, para o anexo) */
export async function autorizacaoDoContrato(contratoId: number, plano: PlanoContrato & { autorizacao_venda?: { id: number; numero: number } }) {
  const ref = plano?.autorizacao_venda;
  if (!ref?.id) return null;
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, ref.id)).limit(1);
  if (!a || a.status !== 'autorizada') return { numero: ref.numero, valida: false, pdf: null as string | null };
  const item = (json(a.dadosJson).itens ?? []).find((i: any) => Number(i.contratoId) === contratoId);
  return { numero: Number(a.numero), valida: !!item && item.assinaturaPlano === assinaturaDoPlano(plano), pdf: (a.pdfAssinadoArquivo || a.pdfArquivo) as string };
}

// ─── Proprietária (/aditivo/:token — mesma página de assinatura dos termos) ───────────────

export async function porToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.token, token)).limit(1);
  return a ?? null;
}
const STATUS_PAGINA: Record<string, string> = { aguardando: 'aguardando', autorizada: 'assinado', cancelada: 'cancelado' };
const mascara = (tel: string | null) => (tel ? tel.replace(/^(\d{4})\d+(\d{4})$/, '($1) •••••-$2').replace(/^\((\d{2})(\d{2})\)/, '(+$1 $2)') : null);

export async function paginaPublica(a: any) {
  const dd = json(a.dadosJson);
  return {
    numero: Number(a.numero), contrato: `Autorização n.º ${a.numero}`, lote: String(a.loteCodigos), status: STATUS_PAGINA[a.status] ?? a.status, tipo: 'autorizacao_venda',
    titulo: 'Autorização de venda fora do padrão', comprador: String(dd.proprietaria?.nome ?? '').split(/\s+/)[0] || 'Proprietária', telefone: mascara(fone(dd.proprietaria?.telefone)),
    resumo: null, pontos: (dd.pontos ?? []) as string[], assinadoEm: a.assinadoEm ? new Date(a.assinadoEm).toISOString() : null,
  };
}

export async function pdfPublico(a: any) {
  if (a.status === 'cancelada') return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(a.pdfAssinadoArquivo || a.pdfArquivo);
  return f ? { buf: f.buf, nome: `Autorizacao-${a.numero}.pdf` } : null;
}

const hashOtp = (token: string, codigo: string) => sha(`${token}:${codigo}`);

export async function enviarCodigoPublico(a: any) {
  const d = await banco();
  if (a.status !== 'aguardando') throw new ContratoErro('STATUS', a.status === 'autorizada' ? 'Esta autorização já foi assinada' : 'Esta autorização foi cancelada', 409);
  if (Number(a.otpEnvios) >= 5) throw new ContratoErro('LIMITE', 'Limite de códigos atingido. Fale com o escritório.', 429);
  const tel = fone(json(a.dadosJson).proprietaria?.telefone);
  if (!tel) throw new ContratoErro('TELEFONE', 'Sem WhatsApp cadastrado. Fale com o escritório.', 409);
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await d.update(autorizacoesVenda).set({ otpHash: hashOtp(a.token, codigo), otpExpira: new Date(Date.now() + OTP_MIN * 60_000), otpTentativas: 0, otpEnvios: Number(a.otpEnvios) + 1 } as any).where(eq(autorizacoesVenda.id, a.id));
  await (await enviador())(tel, `Seu código para assinar a Autorização n.º ${a.numero} é:\n\n${codigo}\n\nVale por ${OTP_MIN} minutos. Este código substitui os anteriores. Não compartilhe.`);
  return { ok: true as const };
}

export async function assinarPublico(a: any, codigo: string, o: { aceite: boolean; ip: string; ua: string }) {
  const d = await banco();
  if (a.status !== 'aguardando') throw new ContratoErro('STATUS', a.status === 'autorizada' ? 'Esta autorização já foi assinada' : 'Esta autorização foi cancelada', 409);
  if (!o.aceite) throw new ContratoErro('ACEITE', 'Marque que leu e concorda', 400);
  if (!a.otpHash || !a.otpExpira || new Date(a.otpExpira).getTime() < Date.now()) throw new ContratoErro('CODIGO', 'Código expirado. Peça um novo.', 400);
  if (Number(a.otpTentativas) >= 5) throw new ContratoErro('CODIGO', 'Muitas tentativas. Peça um novo código.', 429);
  await d.update(autorizacoesVenda).set({ otpTentativas: Number(a.otpTentativas) + 1 } as any).where(eq(autorizacoesVenda.id, a.id));
  const ok = /^\d{6}$/.test(codigo) && timingSafeEqual(Buffer.from(hashOtp(a.token, codigo)), Buffer.from(String(a.otpHash)));
  if (!ok) throw new ContratoErro('CODIGO', 'Código incorreto', 400);
  const em = new Date();
  const upd: any = await d.update(autorizacoesVenda).set({ status: 'autorizada', assinadoEm: em, assinaturaIp: o.ip.slice(0, 64), assinaturaUa: o.ua.slice(0, 300), otpHash: null } as any)
    .where(and(eq(autorizacoesVenda.id, a.id), eq(autorizacoesVenda.status, 'aguardando')));
  if (!Number(upd?.[0]?.affectedRows ?? upd?.affectedRows ?? upd?.changes ?? 1)) throw new ContratoErro('STATUS', 'Esta autorização já foi assinada', 409);
  const { lerArquivo, salvarArquivo } = await import('../contratos/arquivos');
  const original = await lerArquivo(a.pdfArquivo);
  const prop = json(a.dadosJson).proprietaria ?? {};
  if (original) {
    const { anexarManifesto } = await import('../financeiro/renegociacao');
    const assinado = await anexarManifesto(original.buf, { aditivo: `Autorização n.º ${a.numero} (${a.loteCodigos})`, nome: String(prop.nome ?? ''), cpf: String(prop.documento ?? ''), telefone: fone(prop.telefone) ?? '', em, ip: o.ip, ua: o.ua, hashOriginal: String(a.pdfSha256) });
    const chave = `autorizacoes/autorizacao-${a.numero}-assinada-${Date.now()}.pdf`;
    await salvarArquivo(chave, assinado, 'application/pdf');
    await d.update(autorizacoesVenda).set({ pdfAssinadoArquivo: chave } as any).where(eq(autorizacoesVenda.id, a.id));
  }
  import('../notificacoes').then(N => N.notificarChamado({ contrato: `Autorização n.º ${a.numero}`, lote: String(a.loteCodigos), empreendimentoId: Number(a.empreendimentoId), empreendimentoSlug: '', tipo: 'contrato',
    assunto: `Proprietária assinou a Autorização n.º ${a.numero} (${a.loteCodigos}) — os contratos podem ser gerados` })).catch(() => {});
  return { ok: true as const, resultado: { canceladas: 0, criadas: 0, emitidas: 0, falhasAsaas: [] as string[] } };
}

// ─── Via do cliente (só depois da autorização): condições aprovadas, sem a comparação com a tabela ───────

/**
 * Via para entregar ao interessado: as condições de cada chácara aprovadas pela proprietária, com o selo da assinatura
 * eletrônica dela (nome, documento, data/hora, IP e código de verificação) sobre a linha de assinatura. Não traz a
 * comparação com a tabela nem valores internos. Só existe com a autorização assinada.
 */
export async function viaDoCliente(id: number): Promise<{ buf: Buffer; nome: string } | null> {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a) return null;
  if (a.status !== 'autorizada') throw new ContratoErro('STATUS', 'A via do cliente só sai depois que a proprietária assina a autorização', 409);
  const [emp]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, a.empreendimentoId)).limit(1);
  const dd = json(a.dadosJson);
  const prop = dd.proprietaria ?? {};
  const escolhas: any[] = json(a.escolhaJson).itens ?? [];
  // Recalcula o plano de cada chácara a partir da escolha autorizada (as mesmas parcelas do contrato)
  const xs = await calcularItens(Number(a.empreendimentoId), escolhas.map(e => ({ loteCodigo: e.loteCodigo, dataPrimeiroPagamento: e.escolha.dataPrimeiroPagamento, personalizado: e.escolha.personalizado })));
  const { escritor } = await import('../contratos/docsComissao');
  const marca = String(emp?.slug ?? 'bom-jardims').replace(/-/g, '');
  const plural = xs.length > 1;
  const w0 = await escritor(`Condições aprovadas — Autorização n.º ${a.numero}`, marca, `Condições aprovadas pela proprietária · Autorização n.º ${a.numero}`);
  const w = { ...w0, paragrafo: (t: Parameters<typeof w0.paragrafo>[0], o: Parameters<typeof w0.paragrafo>[1] = {}) => w0.paragrafo(t, { size: 9.8, ...o }) };
  w.cabecalho('CONDIÇÕES DE PAGAMENTO APROVADAS', `${emp?.nome ?? ''} · ${plural ? 'Chácaras' : 'Chácara'} ${xs.map(x => x.loteCodigo).join(', ')} · Autorização n.º ${a.numero}`);
  w.paragrafo([{ t: 'A ' }, { t: prop.empresa || prop.nome || 'proprietária', b: true }, { t: `${prop.empresa ? `, representada por ${prop.nome}` : ''}, proprietária e promitente vendedora, ` },
    { t: `aprovou as condições de pagamento abaixo para ${a.clienteNome}`, b: true }, { t: `, referentes ${plural ? 'às chácaras' : 'à chácara'} ${xs.map(x => x.loteCodigo).join(', ')} do ${emp?.nome ?? 'empreendimento'}.` }]);
  w.clausula(plural ? 'CONDIÇÕES POR CHÁCARA' : 'CONDIÇÕES');
  w.tabela(['Chácara', 'Preço', 'Entrada', 'Parcelas', 'Total'], xs.map(x => [
    `${x.loteCodigo} (${x.areaM2.toLocaleString('pt-BR')} m²)`,
    `R$ ${brl(Number(x.plano.preco_tabela))}`,
    x.plano.entrada_qtd > 1 ? `${x.plano.entrada_qtd}× R$ ${brl(x.plano.entrada_parcela)}, de ${br(x.plano.entrada_venc1)}` : `R$ ${brl(x.plano.entrada_valor)} em ${br(x.plano.entrada_venc1)}`,
    `${x.plano.saldo_qtd}× R$ ${brl(x.plano.saldo_parcela)}, de ${br(x.plano.saldo_venc1)}`,
    `R$ ${brl(Number(x.plano.total_pagar))}`,
  ]), { pesos: [1.3, 1.1, 1.8, 1.9, 1.1], direita: [1, 4], size: 8.4 });
  if (plural) {
    const totalGeral = xs.reduce((s, x) => s + Number(x.plano.total_pagar), 0);
    const mensal = xs.reduce((s, x) => s + Number(x.plano.saldo_parcela), 0);
    w.paragrafo(`Total das ${xs.length} chácaras: R$ ${brl(totalGeral)} · parcelas do saldo somadas: R$ ${brl(mensal)} por mês.`, { antes: 4 });
  }
  w.paragrafo([{ t: 'Observações: ', b: true }, { t: `parcelas mensais fixas, por boleto bancário ou PIX, nos vencimentos indicados. Cada chácara será formalizada por contrato individual (Instrumento Particular de Compromisso de Compra e Venda), que trará estas condições e as demais cláusulas do empreendimento. Valores nominais, sem correção monetária.` }], { antes: 4 });
  w.paragrafo(`Aprovação registrada eletronicamente pela proprietária em ${new Date(a.assinadoEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}, com código de confirmação enviado ao seu WhatsApp (MP n.º 2.200-2/2001, art. 10; Lei n.º 14.063/2020).`);
  const doc = prop.documento ? (String(prop.documento).replace(/\D/g, '').length > 11 ? `CNPJ ${prop.documento}` : `CPF ${prop.documento}`) : undefined;
  w.assinaturas([{ papel: prop.empresa ? `PROPRIETÁRIA — ${prop.empresa}` : 'PROPRIETÁRIA (promitente vendedora)', nome: String(prop.nome ?? ''), doc }], { local: `Açailândia/MA, ${br(new Date(a.assinadoEm).toISOString())}.` });
  let pdf: Buffer = await w.salvar();
  // Selo da assinatura eletrônica dela sobre a linha de assinatura (o mesmo dos contratos)
  try {
    const { localizarAssinaturas } = await import('../assinatura/autoPosicao');
    const { carimbarAvancada } = await import('../assinatura/pdf');
    const [cx] = await localizarAssinaturas(pdf, [{ papel: 'vendedora', nome: String(prop.nome ?? '') }]);
    if (cx) pdf = await carimbarAvancada(pdf, cx, { nome: prop.empresa ? `${prop.empresa} — por ${prop.nome}` : String(prop.nome ?? ''), cpf: String(prop.documento ?? '').replace(/\D/g, ''), quando: new Date(a.assinadoEm), ip: String(a.assinaturaIp ?? ''), codigo: `AUT-${a.numero}-${String(a.pdfSha256).slice(0, 8).toUpperCase()}` });
  } catch (e: any) { console.warn('[Autorizações] selo na via do cliente:', e?.message ?? e); }
  return { buf: pdf, nome: `CONDICOES-APROVADAS-AUTORIZACAO-${a.numero}.pdf` };
}

// ─── Edição (antes de qualquer contrato): mesmo número, PDF novo, nova assinatura da proprietária ───────────

/**
 * Corrige a autorização (chácaras, planos, interessado, proprietária): só sem contrato gerado. Refaz o PDF com o mesmo
 * número, troca o link (o anterior deixa de valer), zera o código e, se já estava autorizada, volta a aguardar a
 * proprietária — a assinatura anterior não vale para o texto novo. O link novo vai ao WhatsApp dela.
 */
export async function editarAutorizacao(id: number, p: PedidoAutorizacao, autorId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a) throw new ContratoErro('NAO_ENCONTRADO', 'Autorização não encontrada', 404);
  if (a.status === 'cancelada') throw new ContratoErro('STATUS', 'Autorização cancelada: faça uma nova', 409);
  if ((json(a.dadosJson).itens ?? []).some((i: any) => i.contratoId)) throw new ContratoErro('STATUS', 'Esta autorização já tem contrato gerado: para mudar, faça uma nova autorização', 409);
  const emp = await empreendimentoPorSlug(p.empreendimentoSlug);
  if (Number(emp.id) !== Number(a.empreendimentoId)) throw new ContratoErro('EMPREENDIMENTO', 'O empreendimento da autorização não muda: faça uma nova', 400);
  const cliente = String(p.clienteNome ?? '').trim();
  if (cliente.length < 3) throw new ContratoErro('CLIENTE', 'Informe o nome do interessado', 400);
  const xs = await calcularItens(Number(emp.id), p.itens);
  const prop = await proprietariaPadrao(Number(emp.id), p.proprietario);
  const numero = Number(a.numero);
  const pdf = await pedidoPdf(numero, emp, prop, cliente, xs, String(p.observacao ?? ''));
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `autorizacoes/autorizacao-${numero}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const tot = totais(xs);
  const token = randomBytes(16).toString('hex');
  const pontos = [
    `Interessado: ${cliente}.`,
    ...xs.map(x => `Chácara ${x.loteCodigo}: entrada ${x.plano.entrada_qtd > 1 ? `${x.plano.entrada_qtd}× R$ ${brl(x.plano.entrada_parcela)}` : `R$ ${brl(x.plano.entrada_valor)}`} + ${x.plano.saldo_qtd}× R$ ${brl(x.plano.saldo_parcela)} (tabela: R$ ${brl(x.comparativo.parcelaTabela)}); diferença em valor presente ${sinal(x.comparativo.diferencaVp)}.`),
    ...(xs.length > 1 ? [`Total: R$ ${brl(tot.totalProposta)} (tabela R$ ${brl(tot.totalTabela)}); em valor presente ${sinal(tot.diferencaVp)}.`] : []),
    'Ao assinar, você autoriza a venda nessas condições.',
  ];
  const historico = [...(json(a.dadosJson).historico ?? []), { em: new Date().toISOString(), por: autorId, statusAnterior: a.status, chacarasAnteriores: a.loteCodigos }];
  await d.update(autorizacoesVenda).set({
    loteCodigos: xs.map(x => x.loteCodigo).join(', ').slice(0, 255), clienteNome: cliente.slice(0, 160),
    escolhaJson: JSON.stringify({ itens: xs.map(x => ({ loteCodigo: x.loteCodigo, escolha: x.escolha })) }),
    dadosJson: JSON.stringify({ proprietaria: prop, itens: xs.map(x => ({ loteCodigo: x.loteCodigo, areaM2: x.areaM2, comparativo: x.comparativo, assinaturaPlano: x.assinaturaPlano, entrada: x.plano.entrada_valor, entradaQtd: x.plano.entrada_qtd, parcela: x.plano.saldo_parcela, prazo: x.plano.saldo_qtd, contratoId: null })), totais: tot, pontos, historico }),
    observacao: String(p.observacao ?? '').slice(0, 600) || null, status: 'aguardando', pdfArquivo: chave, pdfSha256: sha(pdf), pdfAssinadoArquivo: null,
    token, otpHash: null, otpExpira: null, otpTentativas: 0, otpEnvios: 0, assinadoEm: null, assinaturaIp: null, assinaturaUa: null,
  } as any).where(eq(autorizacoesVenda.id, id));
  const envio = await enviarLink(numero, token, prop, emp.nome).catch(() => ({ enviado: false }));
  return { ok: true as const, numero, link: await linkDe(token), enviado: envio.enviado, totais: tot };
}

/** Dados da autorização no formato do formulário (para editar) */
export async function pedidoDaAutorizacao(id: number): Promise<PedidoAutorizacao & { id: number; numero: number; status: string }> {
  const d = await banco();
  const [a]: any[] = await d.select().from(autorizacoesVenda).where(eq(autorizacoesVenda.id, id)).limit(1);
  if (!a) throw new ContratoErro('NAO_ENCONTRADO', 'Autorização não encontrada', 404);
  const [e]: any[] = await d.select({ slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, a.empreendimentoId)).limit(1);
  const dd = json(a.dadosJson);
  return {
    id: Number(a.id), numero: Number(a.numero), status: String(a.status), empreendimentoSlug: String(e?.slug ?? ''), clienteNome: String(a.clienteNome), observacao: a.observacao ?? '',
    proprietario: dd.proprietaria ?? null,
    itens: (json(a.escolhaJson).itens ?? []).map((i: any) => ({ loteCodigo: i.loteCodigo, dataPrimeiroPagamento: i.escolha.dataPrimeiroPagamento, personalizado: i.escolha.personalizado })),
  };
}
