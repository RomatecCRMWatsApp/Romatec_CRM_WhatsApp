/**
 * Termo aditivo livre ao Compromisso de Compra e Venda (CPCV), pelo motor de aditivos: o administrador escreve o objeto
 * e as alterações; o termo entra no fluxo de assinatura que já existe (contratoAditivos, tipo "livre"): número seguinte do
 * contrato, PDF guardado com hash, link no WhatsApp do comprador, código de confirmação e manifesto de evidências.
 * Depois da assinatura nada é aplicado automaticamente (não mexe em parcelas): o termo vale pelo que está escrito.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contratoAditivos, contratos, empreendimentos } from '../../drizzle/schema';
import { blocosAditivo, paragrafosDe, type TermoAditivo } from './motor';

export const TIPO_LIVRE = 'livre';
const STATUS_ACEITOS = ['assinado', 'ativo', 'quitado'];

export class AditivoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ContratoErro'; } }

const s = (v: unknown) => String(v ?? '').trim();
const cpfFmt = (x: unknown) => s(x).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const hojeBr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });

export interface DadosAditivoLivre { objeto: string; texto: string; valor?: number | null; valorDescricao?: string | null }

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new AditivoErro('Banco indisponível', 503);
  return d;
}

/** Termo (estrutura do motor) de um aditivo livre ao CPCV */
export async function termoLivre(contratoId: number, numero: number, dados: DadosAditivoLivre, data: string): Promise<{ termo: TermoAditivo; marca: string; contrato: any }> {
  const d = await banco();
  const [ct]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!ct) throw new AditivoErro('Contrato não encontrado', 404);
  const [emp]: any[] = await d.select({ nome: empreendimentos.nome, municipio: empreendimentos.municipio, uf: empreendimentos.uf }).from(empreendimentos).where(eq(empreendimentos.id, ct.empreendimentoId)).limit(1);
  const { juridicoDe } = await import('../contratos/servico');
  const j: any = await juridicoDe(Number(ct.empreendimentoId));
  const { pessoasDoContrato } = await import('../financeiro/servico');
  const { comprador, conjuge } = await pessoasDoContrato(contratoId);
  const v = (j.vendedora ?? {}) as Record<string, unknown>;
  const pj = j.vendedoraTipo === 'PJ';
  const vendedora = s(pj ? v.vend_razao_social : v.vend_nome) || 'PROMITENTE VENDEDORA';
  const vendDoc = pj ? (s(v.vend_cnpj) ? `inscrita no CNPJ sob o n.º ${s(v.vend_cnpj)}` : '') : (s(v.vend_cpf) ? `inscrita no CPF sob o n.º ${s(v.vend_cpf)}` : '');
  const end = comprador ? [s(comprador.logradouro), s(comprador.numero) && `n.º ${s(comprador.numero)}`, s(comprador.bairro), [s(comprador.cidade), s(comprador.uf)].filter(Boolean).join('/')].filter(Boolean).join(', ') : '';
  const lote = s(ct.loteCodigo);
  const local = `${s(emp?.municipio) || 'Açailândia'}/${s(emp?.uf) || 'MA'}`;
  const qualComprador = [cpfFmt(comprador?.cpfCnpj) && `inscrito(a) no CPF sob o n.º ${cpfFmt(comprador?.cpfCnpj)}`, end && `residente e domiciliado(a) na ${end}`,
    conjuge?.nome && `e seu cônjuge/companheiro(a) ${s(conjuge.nome)}, CPF n.º ${cpfFmt(conjuge.cpfCnpj)}`].filter(Boolean).join(', ');
  const termo: TermoAditivo = {
    numero,
    instrumento: `Instrumento Particular de Compromisso de Compra e Venda n.º ${s(ct.numero)}`,
    contexto: `${s(emp?.nome)} · Chácara ${lote}`,
    partes: [
      { papel: 'PROMITENTE VENDEDORA', nome: vendedora, qualif: vendDoc, doc: pj ? `CNPJ ${s(v.vend_cnpj)}` : `CPF ${s(v.vend_cpf)}` },
      { papel: 'PROMISSÁRIO(A) COMPRADOR(A)', nome: s(comprador?.nome) || 'COMPRADOR(A)', qualif: qualComprador, doc: `CPF ${cpfFmt(comprador?.cpfCnpj)}`, rotuloAssinatura: 'PROMISSÁRIO(A) COMPRADOR(A) — assinatura eletrônica' },
    ],
    objeto: `${dados.objeto.replace(/\.$/, '')}, relativo à Chácara ${lote} do ${s(emp?.nome)}`,
    texto: dados.texto,
    valor: dados.valor ? { valor: dados.valor, descricao: s(dados.valorDescricao) || 'ajustado por este termo' } : null,
    local, data,
    assinaturaEletronica: 'As partes reconhecem a validade da assinatura eletrônica deste instrumento, realizada mediante código de confirmação enviado ao WhatsApp cadastrado do(a) PROMISSÁRIO(A) COMPRADOR(A), com registro de evidências anexado a este documento (Medida Provisória n.º 2.200-2/2001, art. 10, § 2º; Lei n.º 14.063/2020).',
  };
  return { termo, marca: String(j.marcaSlug ?? 'bomjardims'), contrato: ct };
}

/** Pontos do termo (página de assinatura do comprador e lista do escritório) */
export function pontosLivre(dados: DadosAditivoLivre): string[] {
  return [
    dados.objeto.replace(/\.$/, ''),
    ...paragrafosDe(dados.texto).slice(0, 5).map(p => (p.length > 220 ? `${p.slice(0, 217)}…` : p)),
    'As demais cláusulas do contrato continuam valendo',
  ];
}

export async function criarAditivoLivre(contratoId: number, dados: DadosAditivoLivre, autorId: number, o: { enviarWhatsapp?: boolean } = {}) {
  if (s(dados.objeto).length < 5) throw new AditivoErro('Descreva o objeto do termo aditivo.');
  if (!paragrafosDe(dados.texto).length && !dados.valor) throw new AditivoErro('Escreva as alterações do termo (uma por linha).');
  const d = await banco();
  const [ct]: any[] = await d.select({ status: contratos.status }).from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!ct) throw new AditivoErro('Contrato não encontrado', 404);
  if (!STATUS_ACEITOS.includes(String(ct.status))) throw new AditivoErro('Termo aditivo só em contrato assinado, ativo ou quitado.', 409);
  const todos: any[] = await d.select({ numero: contratoAditivos.numero }).from(contratoAditivos).where(eq(contratoAditivos.contratoId, contratoId));
  const numero = todos.reduce((m, a) => Math.max(m, Number(a.numero)), 0) + 1;
  const data = hojeBr();
  const { termo, marca, contrato } = await termoLivre(contratoId, numero, dados, data);
  const { blocosParaPdf } = await import('../gestao/contrato');
  const pdf = await blocosParaPdf(blocosAditivo(termo), `Termo Aditivo n.º ${numero} — CPCV ${s(contrato.numero)}`, `Termo Aditivo n.º ${numero} ao CPCV n.º ${s(contrato.numero)}`, marca);
  const { salvarArquivo } = await import('../contratos/arquivos');
  const chave = `aditivos/${contratoId}/aditivo-${numero}-livre-${Date.now()}.pdf`;
  await salvarArquivo(chave, pdf, 'application/pdf');
  const { enviarLink, linkAditivo, shaAditivo } = await import('../financeiro/renegociacao');
  const token = randomBytes(16).toString('hex');
  const pontos = pontosLivre(dados);
  await d.insert(contratoAditivos).values({
    contratoId, numero, tipo: TIPO_LIVRE, status: 'aguardando',
    dadosJson: JSON.stringify({ tipo: TIPO_LIVRE, titulo: dados.objeto.replace(/\.$/, '').slice(0, 120), resumo: pontos[0], pontos, dados, data, lote: s(contrato.loteCodigo) }),
    pdfArquivo: chave, pdfSha256: shaAditivo(pdf), token, criadoPor: autorId, criadoEm: new Date(),
  } as any);
  const { auditar } = await import('../financeiro/servico');
  await auditar('aditivo_criado', { contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { numero, tipo: TIPO_LIVRE } });
  let enviado = false;
  if (o.enviarWhatsapp !== false) enviado = (await enviarLink(contratoId, token, numero, TIPO_LIVRE).catch(() => ({ enviado: false }))).enviado;
  return { ok: true as const, numero, enviado, link: linkAditivo(token) };
}

/** Word (.docx) do termo livre, refeito a partir dos dados gravados (o PDF guardado continua sendo o oficial) */
export async function docxAditivoLivre(aditivoId: number): Promise<{ docx: Buffer; nome: string }> {
  const d = await banco();
  const [a]: any[] = await d.select().from(contratoAditivos).where(eq(contratoAditivos.id, aditivoId)).limit(1);
  if (!a || a.tipo !== TIPO_LIVRE) throw new AditivoErro('Termo aditivo livre não encontrado', 404);
  const x = JSON.parse(a.dadosJson);
  const { termo, contrato } = await termoLivre(Number(a.contratoId), Number(a.numero), x.dados, x.data);
  const { blocosParaDocx } = await import('../gestao/contrato');
  return { docx: blocosParaDocx(blocosAditivo(termo)), nome: `Termo-Aditivo-${a.numero}-CPCV-${s(contrato.numero)}.docx` };
}
