/**
 * Renegociação de parcelas por termo aditivo ao CPCV.
 *
 * 1. O administrador (com a senha) escolhe as parcelas em aberto, o desconto, o número de parcelas, a taxa e o 1º
 *    vencimento → o sistema gera o Termo Aditivo em PDF e manda ao comprador, no WhatsApp, o link /aditivo/:token.
 * 2. O comprador lê, pede o código (6 dígitos, WhatsApp, 10 min), marca o aceite e assina: assinatura eletrônica com
 *    manifesto de evidências (código, IP, navegador, data/hora e SHA-256 do termo) anexado ao PDF (Lei 14.063/2020).
 * 3. Assinado, aplica sozinho: cancela as parcelas renegociadas (também no Asaas) e cria as novas (tipo
 *    "renegociacao"), emitindo boleto + PIX no Asaas quando a conta do empreendimento está configurada.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb } from '../db';
import { cobrancas, contratoAditivos, contratos, empreendimentos } from '../../drizzle/schema';
import { montarRenegociacao, ROTULO_STATUS_ADITIVO, type ItemRenegociado, type Renegociacao, type StatusAditivo } from '../../shared/renegociacao';
import { calcularEncargos } from './encargos';
import { rotuloParcela } from './dados';
import { auditar, cobrancasDoContrato, FinanceiroErro, hojeBrasil, indicesIpcaMap, pessoasDoContrato, slugDoContrato, urlPublica } from './servico';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const pctTaxa = (i: number) => `${(i * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}% ao mês`;
const fone = (v: unknown) => { const s = String(v ?? '').replace(/\D/g, ''); return s.length < 10 ? null : s.startsWith('55') && s.length >= 12 ? s : `55${s}`; };
const OTP_MIN = 10;
const EXTENSO = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'];
const parcelasPorExtenso = (n: number) => (n <= 20 ? `${n} (${EXTENSO[n]}) ${n === 1 ? 'parcela mensal' : 'parcelas mensais'}` : `${n} parcelas mensais`);

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  return d;
}

export type Enviador = (telefone: string, texto: string) => Promise<unknown>;
let enviador: Enviador = async (tel, txt) => { const { enviarTexto } = await import('../leads/zapiClient'); return enviarTexto(tel, txt); };
/** Testes trocam o envio do WhatsApp */
export const definirEnviador = (e: Enviador | null) => { enviador = e ?? (async (tel, txt) => { const { enviarTexto } = await import('../leads/zapiClient'); return enviarTexto(tel, txt); }); };

export interface PedidoRenegociacao { ids: number[]; desconto: number; parcelas: number; taxaMensal: number; primeiroVencimento: string }

/** Parcelas em aberto que podem entrar na renegociação */
async function abertas(contratoId: number) {
  const cobs = await cobrancasDoContrato(contratoId);
  return cobs.filter((x: any) => !['paga', 'cancelada', 'estornada'].includes(x.status) && x.tipo !== 'antecipacao');
}

/** Simulação (sem gravar nada): encargos de mora das vencidas até hoje (IPCA + multa + juros do CPCV) */
export async function simularRenegociacao(contratoId: number, p: PedidoRenegociacao, hoje = hojeBrasil()): Promise<Renegociacao> {
  if (!p.ids.length) throw new FinanceiroErro('PARCELAS', 'Escolha as parcelas a renegociar', 400);
  if (!(p.parcelas >= 1 && p.parcelas <= 120)) throw new FinanceiroErro('PARCELAS', 'Número de parcelas entre 1 e 120', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.primeiroVencimento) || p.primeiroVencimento < hoje) throw new FinanceiroErro('VENCIMENTO', 'O 1º vencimento deve ser hoje ou depois', 400);
  if (!(p.taxaMensal >= 0 && p.taxaMensal <= 0.05)) throw new FinanceiroErro('TAXA', 'Taxa mensal entre 0% e 5%', 400);
  const lista = await abertas(contratoId);
  const escolhidas = lista.filter((x: any) => p.ids.includes(Number(x.id)));
  if (escolhidas.length !== new Set(p.ids).size) throw new FinanceiroErro('PARCELAS', 'Alguma parcela escolhida já foi paga ou cancelada — atualize a tela', 409);
  const indices = await indicesIpcaMap().catch(() => new Map());
  const itens: ItemRenegociado[] = escolhidas.map((x: any) => {
    const venc = String(x.vencimento).slice(0, 10);
    const e = calcularEncargos(Number(x.valor), venc, hoje, indices);
    return { id: Number(x.id), rotulo: rotuloParcela(x), vencimento: venc, valor: Number(x.valor), atualizado: e.total, diasAtraso: e.dias };
  });
  return montarRenegociacao(itens, p);
}

// ─── Termo aditivo (PDF) ──────────────────────────────────────────────────────

async function termoPdf(contratoId: number, numero: number, r: Renegociacao, hoje: string): Promise<Buffer> {
  const { juridicoDe } = await import('../contratos/servico');
  const { escritor } = await import('../contratos/docsComissao');
  const d = await banco();
  const [ct]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, ct.empreendimentoId)).limit(1);
  const j: any = await juridicoDe(Number(ct.empreendimentoId));
  const { comprador } = await pessoasDoContrato(contratoId);
  const s = (v: unknown) => String(v ?? '').trim();
  const v = j.vendedora as Record<string, unknown>;
  const end = comprador ? [s(comprador.logradouro), s(comprador.numero) && `n.º ${s(comprador.numero)}`, s(comprador.bairro), [s(comprador.cidade), s(comprador.uf)].filter(Boolean).join('/')].filter(Boolean).join(', ') : '';
  const cpfComp = s(comprador?.cpfCnpj).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const c = {
    ctr_numero: ct.numero, emp_nome: emp?.nome ?? '', lote_codigo: ct.loteCodigo, comp_nome: comprador?.nome ?? '', comp_cpf: cpfComp, comp_endereco: end,
    vend_pj: j.vendedoraTipo === 'PJ', vend_razao_social: v.vend_razao_social, vend_nome: v.vend_nome, vend_cnpj: v.vend_cnpj, vend_cpf: v.vend_cpf,
  };
  const vendedora = s(c.vend_pj ? c.vend_razao_social : c.vend_nome);
  const vendDoc = c.vend_pj ? `inscrita no CNPJ sob o n.º ${s(c.vend_cnpj)}` : `inscrita no CPF sob o n.º ${s(c.vend_cpf)}`;
  const marca = String(j.marcaSlug ?? 'bomjardims');
  const w = await escritor(`Termo Aditivo n.º ${numero} — CPCV ${s(c.ctr_numero)}`, marca, `Termo Aditivo n.º ${numero} ao CPCV n.º ${s(c.ctr_numero)} · Renegociação de parcelas`);
  w.cabecalho(`TERMO ADITIVO N.º ${numero} AO INSTRUMENTO PARTICULAR DE COMPROMISSO DE COMPRA E VENDA N.º ${s(c.ctr_numero)}`,
    `Renegociação de parcelas · ${s(c.emp_nome)} · Chácara ${s(c.lote_codigo)}`);
  w.paragrafo([{ t: 'Pelo presente instrumento particular, de um lado, ' }, { t: vendedora, b: true }, { t: `, ${vendDoc}, doravante denominada ` }, { t: 'PROMITENTE VENDEDORA', b: true },
    { t: '; e, de outro lado, ' }, { t: s(c.comp_nome), b: true }, { t: `, inscrito(a) no CPF sob o n.º ${s(c.comp_cpf)}${s(c.comp_endereco) ? `, residente e domiciliado(a) na ${s(c.comp_endereco)}` : ''}, doravante denominado(a) ` },
    { t: 'PROMISSÁRIO(A) COMPRADOR(A)', b: true },
    { t: `, partes no Instrumento Particular de Compromisso de Compra e Venda n.º ${s(c.ctr_numero)} (o "CPCV"), relativo à Chácara ${s(c.lote_codigo)} do ${s(c.emp_nome)}, Açailândia/MA, resolvem celebrar o presente Termo Aditivo, que se regerá pelas cláusulas seguintes.` }]);

  w.clausula('CLÁUSULA 1ª — DO OBJETO');
  w.paragrafo('1.1. O presente Termo Aditivo tem por objeto a renegociação das parcelas do CPCV abaixo relacionadas, que ficam substituídas pelo novo parcelamento previsto na Cláusula 3ª:');
  for (const i of r.itens) {
    w.paragrafo(`• ${i.rotulo}, vencimento em ${br(i.vencimento)}, valor original de ${brl(i.valor)}${i.diasAtraso > 0 ? `, em atraso há ${i.diasAtraso} dia(s), valor atualizado de ${brl(i.atualizado)}` : ''};`, { recuo: 14, depois: 1 });
  }

  w.clausula('CLÁUSULA 2ª — DO VALOR RENEGOCIADO E DO RECONHECIMENTO DO DÉBITO');
  w.paragrafo([{ t: `2.1. As parcelas da Cláusula 1ª somam ${brl(r.totalOriginal)} de valor original` },
    { t: r.encargos > 0 ? `, acrescidos de ${brl(r.encargos)} de encargos moratórios (atualização monetária, multa e juros de mora previstos no CPCV) apurados até ${br(hoje)}` : '' },
    { t: r.desconto > 0 ? `, deduzido o desconto de ${brl(r.desconto)} concedido pela PROMITENTE VENDEDORA por liberalidade` : '' },
    { t: ', resultando no ' }, { t: `valor renegociado de ${brl(r.valorRenegociado)}`, b: true }, { t: '.' }]);
  w.paragrafo('2.2. O(A) PROMISSÁRIO(A) COMPRADOR(A) reconhece como líquido, certo e exigível o valor renegociado, que será pago na forma da Cláusula 3ª.');

  w.clausula('CLÁUSULA 3ª — DA NOVA FORMA DE PAGAMENTO');
  w.paragrafo([{ t: '3.1. O valor renegociado será pago em ' }, { t: parcelasPorExtenso(r.parcelas.length), b: true },
    { t: r.taxaMensal > 0 ? `, calculadas pela Tabela Price com juros remuneratórios de ${pctTaxa(r.taxaMensal)}` : ', sem juros remuneratórios' },
    { t: `, no total de ${brl(r.totalAPagar)}, com os seguintes vencimentos:` }]);
  for (const p of r.parcelas) w.paragrafo(`• Parcela ${p.numero}/${r.parcelas.length}: vencimento em ${br(p.vencimento)}, valor de ${brl(p.valor)};`, { recuo: 14, depois: 1 });
  w.paragrafo('3.2. As parcelas serão pagas exclusivamente por boleto bancário ou PIX emitidos pela plataforma de pagamentos do empreendimento, em nome da PROMITENTE VENDEDORA, vedado o pagamento em espécie ou a terceiros.', { antes: 4 });
  w.paragrafo('3.3. Assinado este Termo, as parcelas da Cláusula 1ª serão canceladas na plataforma de pagamentos e substituídas pelas da Cláusula 3.1, que poderão ser consultadas no portal do comprador.');

  w.clausula('CLÁUSULA 4ª — DO INADIMPLEMENTO');
  w.paragrafo('4.1. O atraso no pagamento de qualquer parcela deste Termo sujeita o(a) PROMISSÁRIO(A) COMPRADOR(A) aos encargos moratórios e às demais consequências previstas no CPCV, inclusive à constituição em mora e à resolução do contrato nos termos do art. 32 da Lei n.º 6.766/1979.');

  w.clausula('CLÁUSULA 5ª — DA RATIFICAÇÃO E DA AUSÊNCIA DE NOVAÇÃO');
  w.paragrafo('5.1. Este Termo não importa novação (Código Civil, arts. 360 e 361). Permanecem em pleno vigor todas as demais cláusulas e condições do CPCV e de seus anexos, que as partes ratificam, salvo no que for expressamente alterado por este instrumento.');

  w.clausula('CLÁUSULA 6ª — DAS DISPOSIÇÕES GERAIS');
  w.paragrafo('6.1. As partes reconhecem a validade da assinatura eletrônica deste instrumento, realizada mediante código de confirmação enviado ao WhatsApp cadastrado do(a) PROMISSÁRIO(A) COMPRADOR(A), com registro de evidências anexado a este documento (Medida Provisória n.º 2.200-2/2001, art. 10, § 2º; Lei n.º 14.063/2020). Os dados pessoais são tratados exclusivamente para a execução do contrato (Lei n.º 13.709/2018, art. 7º, V).');
  w.paragrafo('6.2. Fica eleito o foro da Comarca de Açailândia/MA para dirimir quaisquer controvérsias oriundas deste Termo, com renúncia a qualquer outro, por mais privilegiado que seja.');
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [ano, mes, dia] = hoje.split('-').map(Number);
  w.paragrafo(`Açailândia/MA, ${dia} de ${meses[mes - 1]} de ${ano}.`, { antes: 8, depois: 4 });
  w.assinaturas([
    { papel: 'PROMITENTE VENDEDORA', nome: vendedora, doc: c.vend_pj ? `CNPJ ${s(c.vend_cnpj)}` : `CPF ${s(c.vend_cpf)}` },
    { papel: 'PROMISSÁRIO(A) COMPRADOR(A) — assinatura eletrônica', nome: s(c.comp_nome), doc: `CPF ${s(c.comp_cpf)}` },
  ]);
  return w.salvar();
}

/** Página final com as evidências da assinatura eletrônica do comprador */
async function anexarManifesto(pdf: Buffer, ev: { aditivo: string; nome: string; cpf: string; telefone: string; em: Date; ip: string; ua: string; hashOriginal: string }): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.addPage([595.28, 841.89]);
  const verde = rgb(0.05, 0.2, 0.13);
  let y = 780;
  const linha = (t: string, o: { b?: boolean; size?: number; cor?: ReturnType<typeof rgb> } = {}) => {
    const size = o.size ?? 10;
    const fonte = o.b ? fb : f;
    const palavras = t.split(' ');
    let atual = '';
    const sai = (txt: string) => { p.drawText(txt, { x: 56, y, size, font: fonte, color: o.cor ?? rgb(0.1, 0.1, 0.1) }); y -= size * 1.5; };
    for (const w of palavras) {
      const teste = atual ? `${atual} ${w}` : w;
      if (fonte.widthOfTextAtSize(teste, size) > 483) { sai(atual); atual = w; } else atual = teste;
    }
    if (atual) sai(atual);
  };
  const cpf = ev.cpf.replace(/\D/g, '').replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2');
  const tel = ev.telefone.replace(/^(\d{4})\d+(\d{4})$/, '$1*****$2');
  const quando = ev.em.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
  linha('MANIFESTO DE ASSINATURA ELETRÔNICA', { b: true, size: 14, cor: verde });
  y -= 6;
  linha(`Documento: ${ev.aditivo}`);
  linha(`SHA-256 do documento assinado (páginas anteriores): ${ev.hashOriginal}`, { size: 8.5 });
  y -= 8;
  linha('Signatário', { b: true, cor: verde });
  linha(`Nome: ${ev.nome}`);
  linha(`CPF: ${cpf}`);
  linha('Papel: PROMISSÁRIO(A) COMPRADOR(A)');
  y -= 8;
  linha('Evidências', { b: true, cor: verde });
  linha(`Método: código de confirmação de 6 dígitos enviado ao WhatsApp cadastrado (${tel}) e aceite expresso ("Li o Termo Aditivo e concordo com as condições").`);
  linha(`Data e hora da assinatura: ${quando} (horário de Brasília/Açailândia).`);
  linha(`Endereço IP: ${ev.ip || 'não informado'}`);
  linha(`Navegador / aparelho: ${(ev.ua || 'não informado').slice(0, 220)}`, { size: 8.5 });
  y -= 8;
  linha('Fundamento: assinatura eletrônica admitida pelas partes (Medida Provisória n.º 2.200-2/2001, art. 10, § 2º; Lei n.º 14.063/2020, art. 4º). A integridade do documento pode ser conferida pelo SHA-256 acima.', { size: 9 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

// ─── Escritório ──────────────────────────────────────────────────────────────

export async function criarAditivo(contratoId: number, p: PedidoRenegociacao, autorId: number, hoje = hojeBrasil()) {
  const d = await banco();
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new FinanceiroErro('NAO_ENCONTRADO', 'Contrato não encontrado', 404);
  if (!['ativo', 'assinado'].includes(c.status)) throw new FinanceiroErro('STATUS', 'A renegociação é para contrato assinado/ativo', 409);
  const todos: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.contratoId, contratoId));
  if (todos.some(a => a.status === 'aguardando')) throw new FinanceiroErro('PENDENTE', 'Já existe um termo aditivo aguardando a assinatura do comprador. Cancele-o antes de fazer outro.', 409);
  const r = await simularRenegociacao(contratoId, p, hoje);
  const numero = todos.reduce((m, a) => Math.max(m, Number(a.numero)), 0) + 1;
  const pdf = await termoPdf(contratoId, numero, r, hoje);
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `aditivos/${contratoId}/aditivo-${numero}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const token = randomBytes(16).toString('hex');
  await d.insert(contratoAditivos).values({
    contratoId, numero, tipo: 'renegociacao', status: 'aguardando', dadosJson: JSON.stringify({ ...r, pedido: p, data: hoje }),
    pdfArquivo: chave, pdfSha256: sha(pdf), token, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  await auditar('aditivo_criado', { contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { numero, valor: r.valorRenegociado, parcelas: r.parcelas.length, ids: p.ids } });
  const envio = await enviarLink(contratoId, token, numero).catch(() => ({ enviado: false }));
  return { ok: true as const, numero, link: linkAditivo(token), enviado: envio.enviado };
}

export const linkAditivo = (token: string) => `${urlPublica()}/aditivo/${token}`;

async function enviarLink(contratoId: number, token: string, numero: number) {
  const { comprador } = await pessoasDoContrato(contratoId);
  const tel = fone(comprador?.telefone1);
  if (!tel) return { enviado: false };
  const nome = String(comprador?.nome ?? '').trim().split(/\s+/)[0] || 'cliente';
  await enviador(tel, `Olá, ${nome}! O Termo Aditivo n.º ${numero} com a renegociação das suas parcelas está pronto. Leia e assine por aqui (você recebe um código de confirmação no WhatsApp): ${linkAditivo(token)}`);
  return { enviado: true };
}

export async function reenviarLink(aditivoId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a || a.status !== 'aguardando') throw new FinanceiroErro('STATUS', 'Este termo não está aguardando assinatura', 409);
  return enviarLink(Number(a.contratoId), a.token, Number(a.numero));
}

export async function cancelarAditivo(aditivoId: number, autorId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a) throw new FinanceiroErro('NAO_ENCONTRADO', 'Termo não encontrado', 404);
  if (a.status !== 'aguardando') throw new FinanceiroErro('STATUS', 'Só se cancela termo ainda não assinado', 409);
  await d.update(contratoAditivos).set({ status: 'cancelado', canceladoPor: autorId } as any).where(and(eq(contratoAditivos.id, aditivoId), eq(contratoAditivos.status, 'aguardando')));
  await auditar('aditivo_cancelado', { contratoId: Number(a.contratoId), usuarioId: autorId, origem: 'perfil', detalhe: { numero: a.numero } });
  return { ok: true as const };
}

export async function aditivosDo(contratoId: number) {
  const d = await banco();
  const rs: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.contratoId, contratoId)).orderBy(desc(contratoAditivos.numero));
  return rs.map(a => {
    const r = JSON.parse(a.dadosJson) as Renegociacao;
    const res = a.resultadoJson ? JSON.parse(a.resultadoJson) : null;
    return {
      id: Number(a.id), numero: Number(a.numero), status: a.status as StatusAditivo, rotuloStatus: ROTULO_STATUS_ADITIVO[a.status as StatusAditivo] ?? a.status,
      valorRenegociado: r.valorRenegociado, parcelas: r.parcelas.length, valorParcela: r.parcelas[0]?.valor ?? 0, itens: r.itens.map(i => i.rotulo),
      link: a.status === 'aguardando' ? linkAditivo(a.token) : null, assinadoEm: a.assinadoEm ? new Date(a.assinadoEm).toISOString() : null,
      criadoEm: new Date(a.criadoEm).toISOString(), resultado: res as null | { canceladas: number; criadas: number; emitidas: number; falhasAsaas: string[] },
    };
  });
}

/** PDF do termo para o escritório (assinado, se houver) */
export async function pdfDoAditivo(aditivoId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a) return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(a.pdfAssinadoArquivo || a.pdfArquivo);
  return f ? { buf: f.buf, nome: `Termo-Aditivo-${a.numero}${a.pdfAssinadoArquivo ? '-assinado' : ''}.pdf`, contratoId: Number(a.contratoId) } : null;
}

// ─── Comprador (/aditivo/:token) ─────────────────────────────────────────────

async function aditivoDoToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new FinanceiroErro('TOKEN', 'Link inválido', 404);
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.token, token)).limit(1);
  if (!a) throw new FinanceiroErro('TOKEN', 'Link inválido ou expirado', 404);
  return { d, a };
}

export async function paginaAditivo(token: string) {
  const { d, a } = await aditivoDoToken(token);
  const [c]: any[] = await d.select({ numero: contratos.numero, lote: contratos.loteCodigo }).from(contratos).where(eq(contratos.id, a.contratoId)).limit(1);
  const { comprador } = await pessoasDoContrato(Number(a.contratoId));
  const r = JSON.parse(a.dadosJson) as Renegociacao;
  const tel = fone(comprador?.telefone1);
  return {
    numero: Number(a.numero), contrato: c?.numero ?? '', lote: c?.lote ?? '', status: a.status as StatusAditivo,
    comprador: String(comprador?.nome ?? '').trim().split(/\s+/)[0] || 'Cliente', telefone: tel ? tel.replace(/^(\d{4})\d+(\d{4})$/, '($1) •••••-$2').replace(/^\((\d{2})(\d{2})\)/, '(+$1 $2)') : null,
    resumo: { itens: r.itens, totalOriginal: r.totalOriginal, encargos: r.encargos, desconto: r.desconto, valorRenegociado: r.valorRenegociado, parcelas: r.parcelas, totalAPagar: r.totalAPagar, taxaMensal: r.taxaMensal },
    assinadoEm: a.assinadoEm ? new Date(a.assinadoEm).toISOString() : null,
  };
}

export async function pdfDoToken(token: string) {
  const { a } = await aditivoDoToken(token);
  if (a.status === 'cancelado') return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(a.pdfAssinadoArquivo || a.pdfArquivo);
  return f ? { buf: f.buf, nome: `Termo-Aditivo-${a.numero}.pdf` } : null;
}

const hashOtp = (token: string, codigo: string) => sha(`${token}:${codigo}`);

/** Código de 6 dígitos no WhatsApp do comprador (até 5 envios por termo; vale 10 minutos) */
export async function enviarCodigo(token: string) {
  const { d, a } = await aditivoDoToken(token);
  if (a.status !== 'aguardando') throw new FinanceiroErro('STATUS', a.status === 'assinado' ? 'Este termo já foi assinado' : 'Este termo foi cancelado', 409);
  if (Number(a.otpEnvios) >= 5) throw new FinanceiroErro('LIMITE', 'Limite de códigos atingido. Fale com a administração.', 429);
  const { comprador } = await pessoasDoContrato(Number(a.contratoId));
  const tel = fone(comprador?.telefone1);
  if (!tel) throw new FinanceiroErro('TELEFONE', 'Sem WhatsApp cadastrado no contrato. Fale com a administração.', 409);
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await d.update(contratoAditivos).set({ otpHash: hashOtp(token, codigo), otpExpira: new Date(Date.now() + OTP_MIN * 60_000), otpTentativas: 0, otpEnvios: Number(a.otpEnvios) + 1 } as any).where(eq(contratoAditivos.id, a.id));
  await enviador(tel, `Código para assinar o Termo Aditivo n.º ${a.numero}: ${codigo}\nVale por ${OTP_MIN} minutos. Não compartilhe este código.`);
  return { ok: true as const };
}

/** Assina com o código + aceite; anexa o manifesto e aplica a renegociação nas cobranças */
export async function assinarAditivo(token: string, codigo: string, o: { aceite: boolean; ip: string; ua: string }) {
  const { d, a } = await aditivoDoToken(token);
  if (a.status !== 'aguardando') throw new FinanceiroErro('STATUS', a.status === 'assinado' ? 'Este termo já foi assinado' : 'Este termo foi cancelado', 409);
  if (!o.aceite) throw new FinanceiroErro('ACEITE', 'Marque que leu e concorda com o termo', 400);
  if (!a.otpHash || !a.otpExpira || new Date(a.otpExpira).getTime() < Date.now()) throw new FinanceiroErro('CODIGO', 'Código expirado. Peça um novo.', 400);
  if (Number(a.otpTentativas) >= 5) throw new FinanceiroErro('CODIGO', 'Muitas tentativas. Peça um novo código.', 429);
  const ok = /^\d{6}$/.test(codigo) && timingSafeEqual(Buffer.from(hashOtp(token, codigo)), Buffer.from(String(a.otpHash)));
  if (!ok) {
    await d.update(contratoAditivos).set({ otpTentativas: Number(a.otpTentativas) + 1 } as any).where(eq(contratoAditivos.id, a.id));
    throw new FinanceiroErro('CODIGO', 'Código incorreto', 400);
  }
  const em = new Date();
  // Trava: só uma assinatura passa (corrida de dois cliques)
  const upd: any = await d.update(contratoAditivos).set({ status: 'assinado', assinadoEm: em, assinaturaIp: o.ip.slice(0, 64), assinaturaUa: o.ua.slice(0, 300), otpHash: null } as any)
    .where(and(eq(contratoAditivos.id, a.id), eq(contratoAditivos.status, 'aguardando')));
  const afetadas = Number(upd?.[0]?.affectedRows ?? upd?.affectedRows ?? upd?.changes ?? 1);
  if (!afetadas) throw new FinanceiroErro('STATUS', 'Este termo já foi assinado', 409);
  const { lerArquivo, salvarArquivo } = await import('../contratos/arquivos');
  const original = await lerArquivo(a.pdfArquivo);
  const { comprador } = await pessoasDoContrato(Number(a.contratoId));
  const [c]: any[] = await d.select({ numero: contratos.numero, lote: contratos.loteCodigo, empreendimentoId: contratos.empreendimentoId }).from(contratos).where(eq(contratos.id, a.contratoId)).limit(1);
  if (original) {
    const assinado = await anexarManifesto(original.buf, {
      aditivo: `Termo Aditivo n.º ${a.numero} ao CPCV n.º ${c?.numero ?? ''}`, nome: String(comprador?.nome ?? ''), cpf: String(comprador?.cpfCnpj ?? ''),
      telefone: fone(comprador?.telefone1) ?? '', em, ip: o.ip, ua: o.ua, hashOriginal: String(a.pdfSha256),
    });
    const chave = `aditivos/${a.contratoId}/aditivo-${a.numero}-assinado-${Date.now()}.pdf`;
    await salvarArquivo(chave, assinado, 'application/pdf');
    await d.update(contratoAditivos).set({ pdfAssinadoArquivo: chave } as any).where(eq(contratoAditivos.id, a.id));
  }
  await auditar('aditivo_assinado', { contratoId: Number(a.contratoId), origem: 'publico', ip: o.ip, detalhe: { numero: a.numero } });
  const resultado = await aplicarAditivo(Number(a.id));
  const { notificarChamado } = await import('../notificacoes');
  notificarChamado({ contrato: String(c?.numero ?? ''), lote: String(c?.lote ?? ''), empreendimentoId: Number(c?.empreendimentoId ?? 0), empreendimentoSlug: '', tipo: 'financeiro',
    assunto: `Termo Aditivo n.º ${a.numero} assinado pelo comprador — ${resultado.criadas} parcela(s) nova(s)${resultado.falhasAsaas.length ? `, ${resultado.falhasAsaas.length} falha(s) no Asaas` : ''}` }).catch(() => {});
  return { ok: true as const, resultado };
}

/** Cancela as parcelas antigas e cria as novas (idempotente pelo resultado gravado) */
export async function aplicarAditivo(aditivoId: number) {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a || a.status !== 'assinado') throw new FinanceiroErro('STATUS', 'Termo não assinado', 409);
  if (a.resultadoJson) return JSON.parse(a.resultadoJson) as { canceladas: number; criadas: number; emitidas: number; falhasAsaas: string[] };
  const r = JSON.parse(a.dadosJson) as Renegociacao;
  const contratoId = Number(a.contratoId);
  const slug = await slugDoContrato(contratoId).catch(() => 'bom-jardims');
  const { cancelarCobrancaInterna } = await import('../contratos/cancelamento');
  const falhasAsaas: string[] = [];
  const antigas: any[] = await d.select().from(cobrancas).where(inArray(cobrancas.id, r.itens.map(i => i.id)));
  let canceladas = 0;
  for (const cob of antigas) {
    if (['paga', 'cancelada'].includes(cob.status)) continue;
    const x = await cancelarCobrancaInterna(cob, slug);
    if (x.asaas === 'erro') falhasAsaas.push(`cancelar ${rotuloParcela({ tipo: cob.tipo, numero: Number(cob.numero), total: Number(cob.total) } as any)}: ${x.erro}`);
    else canceladas++;
  }
  // Numeração contínua entre renegociações (índice único contrato + tipo + número)
  const jaReneg: any[] = await d.select({ numero: cobrancas.numero }).from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'renegociacao')));
  const base = jaReneg.reduce((m, x) => Math.max(m, Number(x.numero)), 0);
  const total = base + r.parcelas.length;
  for (const p of r.parcelas) {
    await d.insert(cobrancas).values({
      contratoId, tipo: 'renegociacao', numero: base + p.numero, total, vencimento: p.vencimento, valor: String(p.valor),
      jurosParcela: String(p.juros), amortizacao: String(p.amortizacao), saldoDevedor: String(p.saldo), splitValor: '0', status: 'prevista',
    } as any);
  }
  const emitidas = await emitirRenegociadas(contratoId, falhasAsaas);
  const resultado = { canceladas, criadas: r.parcelas.length, emitidas, falhasAsaas };
  await d.update(contratoAditivos).set({ resultadoJson: JSON.stringify(resultado) } as any).where(eq(contratoAditivos.id, aditivoId));
  await auditar('aditivo_aplicado', { contratoId, origem: 'sistema', detalhe: { numero: a.numero, ...resultado } });
  return resultado;
}

/** Emite no Asaas as parcelas de renegociação ainda previstas (sem conta configurada, ficam previstas) */
export async function emitirRenegociadas(contratoId: number, falhas: string[] = []): Promise<number> {
  const d = await banco();
  const slug = await slugDoContrato(contratoId).catch(() => 'bom-jardims');
  const { configAsaas, buscarOuCriarCliente, payloadCliente, criarCobranca, payloadCobranca, dadosDePagamento } = await import('./asaas');
  const cfg = configAsaas(process.env, slug);
  if (!cfg) return 0;
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c || c.status !== 'ativo') return 0;
  const { comprador } = await pessoasDoContrato(contratoId);
  if (!comprador) return 0;
  let emitidas = 0;
  try {
    const customerId = c.asaasCustomerId || await buscarOuCriarCliente(cfg, payloadCliente({ ...comprador, telefone: comprador.telefone1, contratoId } as any));
    if (!c.asaasCustomerId) await d.update(contratos).set({ asaasCustomerId: customerId } as any).where(eq(contratos.id, contratoId));
    const prev: any[] = await d.select().from(cobrancas).where(and(eq(cobrancas.contratoId, contratoId), eq(cobrancas.tipo, 'renegociacao'), eq(cobrancas.status, 'prevista')));
    const hoje = hojeBrasil();
    for (const l of prev) {
      try {
        const venc = String(l.vencimento).slice(0, 10) >= hoje ? String(l.vencimento).slice(0, 10) : hoje;
        const pay = await criarCobranca(cfg, payloadCobranca({
          customerId, cobrancaId: l.id, valor: Number(l.valor), vencimento: venc,
          descricao: `${c.numero} · Chácara ${c.loteCodigo} · ${rotuloParcela({ tipo: 'renegociacao', numero: Number(l.numero), total: Number(l.total) } as any)} (termo aditivo)`,
          splitValor: 0, walletComissao: cfg.walletComissao,
        }));
        const snap = await dadosDePagamento(cfg, pay.id);
        await d.update(cobrancas).set({
          asaasPaymentId: pay.id, status: 'emitida', bankSlipUrl: pay.bankSlipUrl ?? null, linhaDigitavel: snap.identificationField,
          codigoBarras: snap.barCode, nossoNumero: snap.nossoNumero, pixPayload: snap.pixPayload, asaasSnapshot: snap as any,
        } as any).where(and(eq(cobrancas.id, l.id), eq(cobrancas.status, 'prevista')));
        emitidas++;
      } catch (e: any) { falhas.push(`emitir parcela ${l.numero}: ${String(e?.message ?? e).slice(0, 160)}`); }
    }
  } catch (e: any) { falhas.push(`cliente no Asaas: ${String(e?.message ?? e).slice(0, 160)}`); }
  return emitidas;
}
