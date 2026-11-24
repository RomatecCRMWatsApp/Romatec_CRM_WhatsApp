/**
 * Ciência da proprietária nas despesas (Financeiro › Despesas).
 *
 * Para cada saída de recursos de um empreendimento, o escritório pede a ciência da proprietária: o sistema gera a
 * "Comunicação de saída de recursos" (destino, valor, data, forma, comprovante anexado), manda no WhatsApp dela o
 * resumo com o link /aditivo/:token (a mesma página das autorizações de venda) e ela confirma com o código que recebe
 * no WhatsApp. O PDF confirmado recebe o manifesto de evidências (data, hora, IP, aparelho e hash do original).
 * Tudo fica auditável: quem pediu, o que ela viu, quando confirmou.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { getDb } from '../db';
import { despesaCiencias, empreendimentos, financeiroDespesas } from '../../drizzle/schema';
import { ROTULO_CATEGORIA, type CategoriaDespesa } from '../../shared/despesas';
import { auditar, FinanceiroErro } from './servico';

const OTP_MIN = 10;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const fone = (v: unknown) => { const s = String(v ?? '').replace(/\D/g, ''); return s.length < 10 ? null : s.startsWith('55') && s.length >= 12 ? s : `55${s}`; };
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const json = (s: unknown): any => { try { return typeof s === 'string' ? JSON.parse(s) : s ?? {}; } catch { return {}; } };
const FORMA: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', TRANSFERENCIA: 'Transferência', DINHEIRO: 'Dinheiro', CARTAO: 'Cartão', OUTRO: 'Outro' };

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  return d;
}

export interface RetratoDespesa {
  id: number; descricao: string; categoria: string; fornecedor: string | null; valor: number; valorPago: number | null;
  vencimento: string; pagoEm: string | null; forma: string | null; observacao: string | null; comprovanteUrl: string | null; status: string;
}

export interface Proprietaria { nome: string; documento: string; empresa: string; telefone: string }

/** Texto do WhatsApp para a proprietária: destino, valor e o link para confirmar */
export function mensagemCiencia(p: { proprietaria: Proprietaria; empreendimento: string; despesa: RetratoDespesa; link: string }): string {
  const d = p.despesa;
  const nome = p.proprietaria.nome.split(/\s+/)[0] || 'tudo bem';
  const valor = d.valorPago ?? d.valor;
  return [
    `Olá, ${nome}! Saída de recursos do ${p.empreendimento} para a sua ciência:`,
    '',
    `💸 Valor: R$ ${brl(valor)}`,
    `🎯 Destino: ${d.fornecedor || 'não informado'}`,
    `📝 Referente a: ${d.descricao} (${ROTULO_CATEGORIA[d.categoria as CategoriaDespesa] ?? d.categoria})`,
    d.pagoEm ? `📅 Pago em ${br(d.pagoEm)}${d.forma ? ` por ${FORMA[d.forma] ?? d.forma}` : ''}` : `📅 Vencimento: ${br(d.vencimento)}`,
    d.comprovanteUrl ? '📎 O comprovante está no documento.' : null,
    '',
    `Confira e confirme por aqui (você recebe um código no WhatsApp): ${p.link}`,
  ].filter(l => l !== null).join('\n');
}

/** Pontos da página de confirmação (o que ela está confirmando) */
export function pontosCiencia(d: RetratoDespesa, empreendimento: string): string[] {
  const valor = d.valorPago ?? d.valor;
  return [
    `Valor: R$ ${brl(valor)}${d.valorPago != null && d.valorPago !== d.valor ? ` (previsto R$ ${brl(d.valor)})` : ''}`,
    `Destino: ${d.fornecedor || 'não informado'}`,
    `Referente a: ${d.descricao} · ${ROTULO_CATEGORIA[d.categoria as CategoriaDespesa] ?? d.categoria} · ${empreendimento}`,
    d.pagoEm ? `Pago em ${br(d.pagoEm)}${d.forma ? ` por ${FORMA[d.forma] ?? d.forma}` : ''}` : `Ainda não paga (vencimento ${br(d.vencimento)})`,
    d.comprovanteUrl ? 'Comprovante de pagamento anexado ao documento' : 'Sem comprovante anexado',
  ];
}

function retrato(x: any): RetratoDespesa {
  return {
    id: Number(x.id), descricao: String(x.descricao), categoria: String(x.categoria), fornecedor: x.fornecedor ?? null, valor: Number(x.valor),
    valorPago: x.valorPago != null ? Number(x.valorPago) : null, vencimento: String(x.vencimento), pagoEm: x.pagoEm ?? null,
    forma: x.formaPagamento ?? null, observacao: x.observacao ?? null, comprovanteUrl: x.comprovanteUrl ?? null, status: String(x.status),
  };
}

/** Anexa o comprovante (imagem ou PDF) ao final do documento; se não der para baixar, segue sem ele */
async function anexarComprovante(pdf: Buffer, url: string | null): Promise<Buffer> {
  if (!url) return pdf;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return pdf;
    const buf = Buffer.from(await r.arrayBuffer());
    const doc = await PDFDocument.load(pdf);
    const tipo = String(r.headers.get('content-type') ?? '');
    if (tipo.includes('pdf') || buf.subarray(0, 4).toString() === '%PDF') {
      const fonte = await PDFDocument.load(buf, { ignoreEncryption: true });
      const paginas = await doc.copyPages(fonte, fonte.getPageIndices().slice(0, 5));
      paginas.forEach(p => doc.addPage(p));
    } else {
      const img = tipo.includes('png') || buf[0] === 0x89 ? await doc.embedPng(buf) : await doc.embedJpg(buf);
      const pg = doc.addPage([595.28, 841.89]);
      const max = { w: 595.28 - 80, h: 841.89 - 110 };
      const esc = Math.min(max.w / img.width, max.h / img.height, 1);
      const w = img.width * esc, h = img.height * esc;
      pg.drawText('ANEXO — COMPROVANTE DE PAGAMENTO', { x: 40, y: 841.89 - 50, size: 11 });
      pg.drawImage(img, { x: (595.28 - w) / 2, y: 841.89 - 70 - h, width: w, height: h });
    }
    return Buffer.from(await doc.save());
  } catch (e: any) {
    console.warn('[Ciência despesa] Comprovante não anexado ao PDF:', e?.message);
    return pdf;
  }
}

/** Carimbo da assinatura eletrônica (vai acima da linha da proprietária no documento confirmado) */
export function seloCiencia(nome: string, em: Date, ip: string, hash: string): string[] {
  const quando = em.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return [
    `Assinado eletronicamente por ${nome.toUpperCase()}`,
    `em ${quando} (Brasília) · IP ${ip || 'não informado'}`,
    `Código no WhatsApp · SHA-256 ${hash.slice(0, 16)}… · MP 2.200-2/2001`,
  ];
}

async function documentoPdf(numero: number, emp: { nome: string; slug: string }, prop: Proprietaria, d: RetratoDespesa, o: { data?: Date; selo?: string[] } = {}): Promise<Buffer> {
  const { escritor } = await import('../contratos/docsComissao');
  const marca = String(emp.slug ?? 'bom-jardims').replace(/-/g, '');
  const titulo = `Comunicação de saída n.º ${numero}`;
  const w0 = await escritor(titulo, marca, `${titulo} · ${emp.nome}`);
  const w = { ...w0, paragrafo: (t: Parameters<typeof w0.paragrafo>[0], o: Parameters<typeof w0.paragrafo>[1] = {}) => w0.paragrafo(t, { size: 9.6, ...o }) };
  const valor = d.valorPago ?? d.valor;
  w.cabecalho('COMUNICAÇÃO DE SAÍDA DE RECURSOS', `${titulo} · ${emp.nome}`);
  w.paragrafo([{ t: 'O escritório gestor comunica à ' }, { t: prop.empresa || prop.nome, b: true },
    { t: `${prop.empresa ? `, neste ato representada por ${prop.nome}` : ''}, proprietária do empreendimento ${emp.nome}, a saída de recursos abaixo, para a sua ciência e o registro na prestação de contas.` }]);
  w.clausula('1. DADOS DA SAÍDA');
  w.tabela(['Campo', 'Informação'], [
    ['Valor', `R$ ${brl(valor)}${d.valorPago != null && d.valorPago !== d.valor ? ` (previsto R$ ${brl(d.valor)})` : ''}`],
    ['Destino (quem recebeu)', d.fornecedor || 'não informado'],
    ['Referente a', d.descricao],
    ['Categoria', ROTULO_CATEGORIA[d.categoria as CategoriaDespesa] ?? d.categoria],
    ['Pagamento', d.pagoEm ? `${br(d.pagoEm)}${d.forma ? ` · ${FORMA[d.forma] ?? d.forma}` : ''}` : `Não paga · vencimento ${br(d.vencimento)}`],
    ['Despesa no sistema', `n.º ${d.id}`],
  ], { pesos: [1, 3], size: 8.6 });
  if (d.observacao?.trim()) w.paragrafo(`Observações e dados do comprovante: ${d.observacao.trim().replace(/\n+/g, ' · ')}`);
  w.clausula('2. CIÊNCIA');
  w.paragrafo([{ t: 'A PROPRIETÁRIA declara ' }, { t: 'ter ciência desta saída de recursos', b: true },
    { t: `${d.comprovanteUrl ? ', conferida com o comprovante anexo,' : ''} para registro na prestação de contas e no rateio das despesas do empreendimento. A ciência não substitui a conferência da prestação de contas mensal. Confirmação eletrônica com código enviado ao seu WhatsApp e manifesto de evidências (MP n.º 2.200-2/2001, art. 10; Lei n.º 14.063/2020).` }]);
  const doc = prop.documento ? (prop.documento.replace(/\D/g, '').length > 11 ? `CNPJ ${prop.documento}` : `CPF ${prop.documento}`) : undefined;
  w.assinaturas([{ papel: prop.empresa ? `PROPRIETÁRIA — ${prop.empresa}` : 'PROPRIETÁRIA', nome: prop.nome, doc, selo: o.selo }], { local: `Açailândia/MA, ${br(new Date((o.data ?? new Date()).getTime() - 3 * 3600_000).toISOString())}.` });
  return anexarComprovante(await w.salvar(), d.comprovanteUrl);
}

const linkDe = async (token: string) => (await import('./renegociacao')).linkAditivo(token);
async function enviador() { return (await import('./renegociacao')).enviarMensagemAditivo; }

export type EnviadorPdf = (tel: string, pdf: Buffer, nome: string, legenda: string) => Promise<unknown>;
let enviadorPdf: EnviadorPdf = async (tel, pdf, nome, legenda) => {
  const { enviarDocumento } = await import('../leads/zapiClient');
  return enviarDocumento(tel, { base64: pdf.toString('base64'), extensao: 'pdf', mime: 'application/pdf', nomeArquivo: nome, legenda });
};
/** Testes trocam o envio do PDF */
export const definirEnviadorPdf = (e: EnviadorPdf | null) => { if (e) enviadorPdf = e; };
async function enviarPdf(tel: string, pdf: Buffer, nome: string, legenda: string): Promise<boolean> {
  try { await enviadorPdf(tel, pdf, nome, legenda); return true; } catch (e: any) { console.warn('[Ciência despesa] PDF não enviado:', e?.message); return false; }
}

/** Pede a ciência da proprietária: gera o documento, troca o link anterior (se houver) e manda no WhatsApp dela */
export async function pedirCiencia(despesaId: number, autorId: number, proprietariaInformada?: Partial<Proprietaria>) {
  const d = await banco();
  const [x]: any[] = await d.select().from(financeiroDespesas).where(eq(financeiroDespesas.id, despesaId)).limit(1);
  if (!x) throw new FinanceiroErro('NAO_ENCONTRADA', 'Despesa não encontrada', 404);
  if (x.status === 'cancelada') throw new FinanceiroErro('STATUS', 'Despesa cancelada não vai para a proprietária', 409);
  if (!x.empreendimentoId) throw new FinanceiroErro('SEM_EMPREENDIMENTO', 'Despesa do escritório (sem empreendimento) não tem proprietária para dar ciência', 400);
  const [emp]: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, x.empreendimentoId)).limit(1);
  if (!emp) throw new FinanceiroErro('NAO_ENCONTRADO', 'Empreendimento não encontrado', 404);
  const { proprietariaPadrao } = await import('../autorizacoes/servico');
  const prop = await proprietariaPadrao(Number(emp.id), proprietariaInformada as any) as Proprietaria;
  const tel = fone(prop.telefone);
  if (!tel) throw new FinanceiroErro('TELEFONE', 'A proprietária está sem WhatsApp no cadastro jurídico do empreendimento', 409);

  const ret = retrato(x);
  // Um pedido válido por despesa: o anterior (aguardando) deixa de valer
  await d.update(despesaCiencias).set({ status: 'cancelada', otpHash: null } as any).where(and(eq(despesaCiencias.despesaId, despesaId), eq(despesaCiencias.status, 'aguardando')));
  const pdf = await documentoPdf(despesaId, emp, prop, ret);
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `despesas/ciencia-${despesaId}-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const token = randomBytes(16).toString('hex');
  await d.insert(despesaCiencias).values({
    despesaId, empreendimentoId: Number(emp.id), dadosJson: JSON.stringify({ proprietaria: prop, empreendimento: emp.nome, despesa: ret, pontos: pontosCiencia(ret, emp.nome) }),
    status: 'aguardando', pdfArquivo: chave, pdfSha256: sha(pdf), token, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  const link = await linkDe(token);
  let enviado = false;
  let erroEnvio: string | null = null;
  try {
    await (await enviador())(tel, mensagemCiencia({ proprietaria: prop, empreendimento: emp.nome, despesa: ret, link }));
    enviado = true;
  } catch (e: any) { erroEnvio = String(e?.message ?? e).slice(0, 200); console.warn('[Ciência despesa] WhatsApp não enviado:', erroEnvio); }
  // O comunicado em PDF vai junto (se o texto saiu): ela confere antes de abrir o link
  if (enviado) await enviarPdf(tel, pdf, `Comunicado-saida-${despesaId}.pdf`, `Comunicação de saída n.º ${despesaId} · ${emp.nome}`);
  await auditar('despesa_ciencia_pedida', { usuarioId: autorId, origem: 'perfil', detalhe: { despesaId, valor: ret.valorPago ?? ret.valor, destino: ret.fornecedor, enviado } });
  return { ok: true as const, link, enviado, erroEnvio, proprietaria: prop.nome };
}

/** Reenvia o mesmo link (sem gerar outro documento) */
export async function reenviarCiencia(despesaId: number) {
  const d = await banco();
  const [c]: any[] = await d.select().from(despesaCiencias).where(and(eq(despesaCiencias.despesaId, despesaId), eq(despesaCiencias.status, 'aguardando'))).orderBy(desc(despesaCiencias.id)).limit(1);
  if (!c) throw new FinanceiroErro('STATUS', 'Não há pedido de ciência aguardando para esta despesa', 409);
  const dd = json(c.dadosJson);
  const tel = fone(dd.proprietaria?.telefone);
  if (!tel) throw new FinanceiroErro('TELEFONE', 'A proprietária está sem WhatsApp', 409);
  await (await enviador())(tel, mensagemCiencia({ proprietaria: dd.proprietaria, empreendimento: dd.empreendimento, despesa: dd.despesa, link: await linkDe(c.token) }));
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(c.pdfArquivo).catch(() => null);
  if (f) await enviarPdf(tel, f.buf, `Comunicado-saida-${despesaId}.pdf`, `Comunicação de saída n.º ${despesaId} · ${dd.empreendimento ?? ''}`);
  return { ok: true as const };
}

export type SituacaoCiencia = { status: 'aguardando' | 'ciente'; em: string | null; id: number };

/** Situação da ciência de cada despesa (a mais recente que não foi cancelada) */
export async function cienciasDas(ids: number[]): Promise<Map<number, SituacaoCiencia>> {
  const m = new Map<number, SituacaoCiencia>();
  if (!ids.length) return m;
  const d = await banco();
  const xs: any[] = await d.select({ id: despesaCiencias.id, despesaId: despesaCiencias.despesaId, status: despesaCiencias.status, assinadoEm: despesaCiencias.assinadoEm })
    .from(despesaCiencias).where(and(inArray(despesaCiencias.despesaId, ids), inArray(despesaCiencias.status, ['aguardando', 'ciente']))).orderBy(desc(despesaCiencias.id));
  for (const c of xs) {
    const k = Number(c.despesaId);
    const atual = m.get(k);
    if (atual?.status === 'ciente') continue;
    if (!atual || c.status === 'ciente') m.set(k, { status: c.status, em: c.assinadoEm ? new Date(c.assinadoEm).toISOString() : null, id: Number(c.id) });
  }
  return m;
}

/** PDF da ciência (o confirmado, se houver) para o escritório */
export async function pdfDaCiencia(despesaId: number) {
  const d = await banco();
  const [c]: any[] = await d.select().from(despesaCiencias).where(and(eq(despesaCiencias.despesaId, despesaId), inArray(despesaCiencias.status, ['aguardando', 'ciente'])))
    .orderBy(desc(despesaCiencias.id)).limit(5).then((xs: any[]) => [xs.find(y => y.status === 'ciente') ?? xs[0]]);
  if (!c) return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(c.pdfAssinadoArquivo || c.pdfArquivo);
  return f ? { buf: f.buf, nome: `Ciencia-despesa-${despesaId}${c.status === 'ciente' ? '-confirmada' : ''}.pdf` } : null;
}

// ─── Página pública (/aditivo/:token) ────────────────────────────────────────

export async function porToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const d = await banco();
  const [c]: any[] = await d.select().from(despesaCiencias).where(eq(despesaCiencias.token, token)).limit(1);
  return c ?? null;
}

const STATUS_PAGINA: Record<string, string> = { aguardando: 'aguardando', ciente: 'assinado', cancelada: 'cancelado' };
const mascara = (tel: string | null) => (tel ? tel.replace(/^(\d{4})\d+(\d{4})$/, '($1) •••••-$2').replace(/^\((\d{2})(\d{2})\)/, '(+$1 $2)') : null);

export async function paginaPublica(c: any) {
  const dd = json(c.dadosJson);
  return {
    numero: Number(c.despesaId), contrato: `Comunicação de saída n.º ${c.despesaId}`, lote: String(dd.empreendimento ?? ''), status: STATUS_PAGINA[c.status] ?? c.status,
    tipo: 'ciencia_despesa', titulo: 'Ciência de saída de recursos', comprador: String(dd.proprietaria?.nome ?? '').split(/\s+/)[0] || 'Proprietária',
    telefone: mascara(fone(dd.proprietaria?.telefone)), resumo: null, pontos: (dd.pontos ?? []) as string[], assinadoEm: c.assinadoEm ? new Date(c.assinadoEm).toISOString() : null,
  };
}

export async function pdfPublico(c: any) {
  if (c.status === 'cancelada') return null;
  const { lerArquivo } = await import('../contratos/arquivos');
  const f = await lerArquivo(c.pdfAssinadoArquivo || c.pdfArquivo);
  return f ? { buf: f.buf, nome: `Saida-de-recursos-${c.despesaId}.pdf` } : null;
}

const hashOtp = (token: string, codigo: string) => sha(`${token}:${codigo}`);
const ERRO_STATUS = (s: string) => new FinanceiroErro('STATUS', s === 'ciente' ? 'Esta saída já foi confirmada' : 'Este link foi substituído ou cancelado. Use o link mais recente.', 409);

export async function enviarCodigoPublico(c: any) {
  const d = await banco();
  if (c.status !== 'aguardando') throw ERRO_STATUS(c.status);
  if (Number(c.otpEnvios) >= 5) throw new FinanceiroErro('LIMITE', 'Limite de códigos atingido. Fale com o escritório.', 429);
  const tel = fone(json(c.dadosJson).proprietaria?.telefone);
  if (!tel) throw new FinanceiroErro('TELEFONE', 'Sem WhatsApp cadastrado. Fale com o escritório.', 409);
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await d.update(despesaCiencias).set({ otpHash: hashOtp(c.token, codigo), otpExpira: new Date(Date.now() + OTP_MIN * 60_000), otpTentativas: 0, otpEnvios: Number(c.otpEnvios) + 1 } as any).where(eq(despesaCiencias.id, c.id));
  await (await enviador())(tel, `Seu código para confirmar a ciência da saída de recursos n.º ${c.despesaId} é:\n\n${codigo}\n\nVale por ${OTP_MIN} minutos. Este código substitui os anteriores. Não compartilhe.`);
  return { ok: true as const };
}

/** Monta a via confirmada (documento com o carimbo da assinatura + manifesto), grava e, se pedido, manda ao WhatsApp dela */
async function gerarViaConfirmada(c: any, enviar: boolean): Promise<{ enviado: boolean }> {
  const d = await banco();
  const dd = json(c.dadosJson);
  const prop = dd.proprietaria ?? {};
  const em = new Date(c.assinadoEm);
  const ip = String(c.assinaturaIp ?? ''), ua = String(c.assinaturaUa ?? '');
  const { lerArquivo, salvarArquivo } = await import('../contratos/arquivos');
  const original = await lerArquivo(c.pdfArquivo);
  if (!original) return { enviado: false };
  const { anexarManifesto } = await import('./renegociacao');
  // O mesmo documento, agora com o carimbo da assinatura eletrônica dela na linha de assinatura
  let base = original.buf;
  try {
    const [emp]: any[] = await d.select({ nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(eq(empreendimentos.id, Number(c.empreendimentoId))).limit(1);
    if (emp && dd.despesa) base = await documentoPdf(Number(c.despesaId), emp, prop as Proprietaria, dd.despesa as RetratoDespesa,
      { data: c.criadoEm ? new Date(c.criadoEm) : em, selo: seloCiencia(String(prop.nome ?? ''), em, ip, String(c.pdfSha256)) });
  } catch (e: any) { console.warn('[Ciência despesa] carimbo não aplicado:', e?.message); }
  const assinado = await anexarManifesto(base, {
    aditivo: `Comunicação de saída n.º ${c.despesaId} (${dd.empreendimento ?? ''})`, nome: String(prop.nome ?? ''), cpf: String(prop.documento ?? ''), telefone: fone(prop.telefone) ?? '',
    em, ip, ua, hashOriginal: String(c.pdfSha256), papel: 'PROPRIETÁRIA DO EMPREENDIMENTO', aceite: 'Li a comunicação de saída de recursos e estou ciente',
  });
  const chave = `despesas/ciencia-${c.despesaId}-confirmada-${Date.now()}.pdf`;
  await salvarArquivo(chave, assinado, 'application/pdf');
  await d.update(despesaCiencias).set({ pdfAssinadoArquivo: chave } as any).where(eq(despesaCiencias.id, c.id));
  const tel = fone(prop.telefone);
  const enviado = enviar && !!tel && await enviarPdf(tel, assinado, `Ciencia-saida-${c.despesaId}-confirmada.pdf`, `Sua ciência foi registrada. Comunicação de saída n.º ${c.despesaId} · ${dd.empreendimento ?? ''}`);
  return { enviado };
}

/** Escritório: refaz a via confirmada (com o carimbo) e manda de novo no WhatsApp da proprietária */
export async function reenviarViaConfirmada(despesaId: number) {
  const d = await banco();
  const [c]: any[] = await d.select().from(despesaCiencias).where(and(eq(despesaCiencias.despesaId, despesaId), eq(despesaCiencias.status, 'ciente'))).orderBy(desc(despesaCiencias.id)).limit(1);
  if (!c) throw new FinanceiroErro('STATUS', 'A proprietária ainda não confirmou a ciência desta despesa', 409);
  const r = await gerarViaConfirmada(c, true);
  if (!r.enviado) throw new FinanceiroErro('WHATSAPP', 'Via refeita com o carimbo, mas o WhatsApp não saiu. Confira a conexão do WhatsApp e tente de novo.', 502);
  return { ok: true as const };
}

export async function assinarPublico(c: any, codigo: string, o: { aceite: boolean; ip: string; ua: string }) {
  const d = await banco();
  if (c.status !== 'aguardando') throw ERRO_STATUS(c.status);
  if (!o.aceite) throw new FinanceiroErro('ACEITE', 'Marque que leu e está ciente', 400);
  if (!c.otpHash || !c.otpExpira || new Date(c.otpExpira).getTime() < Date.now()) throw new FinanceiroErro('CODIGO', 'Código expirado. Peça um novo.', 400);
  if (Number(c.otpTentativas) >= 5) throw new FinanceiroErro('CODIGO', 'Muitas tentativas. Peça um novo código.', 429);
  await d.update(despesaCiencias).set({ otpTentativas: Number(c.otpTentativas) + 1 } as any).where(eq(despesaCiencias.id, c.id));
  const ok = /^\d{6}$/.test(codigo) && timingSafeEqual(Buffer.from(hashOtp(c.token, codigo)), Buffer.from(String(c.otpHash)));
  if (!ok) throw new FinanceiroErro('CODIGO', 'Código incorreto', 400);
  const em = new Date();
  const upd: any = await d.update(despesaCiencias).set({ status: 'ciente', assinadoEm: em, assinaturaIp: o.ip.slice(0, 64), assinaturaUa: o.ua.slice(0, 300), otpHash: null } as any)
    .where(and(eq(despesaCiencias.id, c.id), eq(despesaCiencias.status, 'aguardando')));
  if (!Number(upd?.[0]?.affectedRows ?? upd?.affectedRows ?? upd?.changes ?? 1)) throw ERRO_STATUS('ciente');
  const dd = json(c.dadosJson);
  await gerarViaConfirmada({ ...c, assinadoEm: em, assinaturaIp: o.ip, assinaturaUa: o.ua }, true);
  await auditar('despesa_ciencia_confirmada', { usuarioId: null, origem: 'proprietaria', ip: o.ip, detalhe: { despesaId: Number(c.despesaId), cienciaId: Number(c.id) } }).catch(() => {});
  const valor = dd.despesa?.valorPago ?? dd.despesa?.valor;
  import('../notificacoes').then(N => N.notificarChamado({ contrato: `Saída n.º ${c.despesaId}`, lote: String(dd.empreendimento ?? ''), empreendimentoId: Number(c.empreendimentoId), empreendimentoSlug: '', tipo: 'contrato',
    assunto: `Proprietária confirmou ciência da saída de R$ ${typeof valor === 'number' ? brl(valor) : valor} para ${dd.despesa?.fornecedor ?? 'destino não informado'}` })).catch(() => {});
  return { ok: true as const, resultado: { canceladas: 0, criadas: 0, emitidas: 0, falhasAsaas: [] as string[] } };
}
