/**
 * Talonário de contratos (modo arcaico: sem internet, sem energia, atendimento no campo): o CPCV completo, com as
 * mesmas cláusulas do contrato gerado pelo sistema (mesmo modelo DOCX), para preencher à mão.
 *
 * - Sai preenchido o que é do empreendimento e da vendedora (registro, licença, obras, associação, recebedor…).
 * - Saem EM BRANCO: comprador, cônjuge, chácara, condições de pagamento, corretor intermediador e o percentual da
 *   intermediação, data e testemunhas.
 * - Antes do contrato: capa com instruções, ficha cadastral do comprador e quadro de condições (para lançar no sistema
 *   depois). Depois do contrato: Anexo III (Estatuto), Anexo IV (Diretrizes) e o Contrato de Intermediação.
 * - Cada página leva o número da folha do talão no topo ("TALÃO Nº 000123 · pág. x/y").
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { montarContexto, type Ctx } from '../contratos/contexto';
import { prepararModelo } from '../contratos/modelo';
import { modeloDaCondicao } from '../contratos/plano';
import { anexar, docxParaPdf, mergeDocx, pastaTemplates } from '../contratos/render';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import PizZip from 'pizzip';
import { anexoDiretrizes, anexoEstatuto, desenharMarca, embutirMarca } from '../contratos/anexos';
import { docIntermediacao } from '../contratos/docsComissao';
import { ESCRITORIO, LINHA_PUBLICIDADE } from '../../shared/escritorio';

export const MAX_FOLHAS_POR_PDF = 10;
const VERDE = rgb(0.047, 0.2, 0.125);
const DOURADO = rgb(0.788, 0.651, 0.275);
const CINZA = rgb(0.35, 0.35, 0.35);
const A4: [number, number] = [595.28, 841.89];
const X0 = 56, X1 = A4[0] - 56;

const LONGO = '_'.repeat(48), MEDIO = '_'.repeat(26), CURTO = '_'.repeat(14);
/** Campos que o corretor preenche à mão (prefixos das tags do modelo) */
const EM_BRANCO = /^(comp_|conj_|comp2_|lote_|plano_|com_|intermed_|corr_parceiro|test[12]_)/;

/** Linha em branco do tamanho do campo */
function linhaDoCampo(tag: string): string {
  if (/(nome|endereco|qualificacao|descricao|extenso|denominacao|forma|regime|pacto|via_frente|beneficiario)/.test(tag)) return LONGO;
  if (/(cpf|rg|telefone|email|profissao|nacionalidade|estado_civil|nascimento|valor|preco|parcela|total|creci|certidao|venc|data)/.test(tag)) return MEDIO;
  return CURTO;
}

/** Campos do modelo DOCX ({{tag}}), inclusive os que o contexto não traz (ex.: corretor parceiro, testemunhas) */
async function tagsDoModelo(modelo: string): Promise<string[]> {
  const zip = new PizZip(await readFile(path.join(pastaTemplates(), modelo)));
  const xml = (zip.file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
  return Array.from(new Set(Array.from(xml.matchAll(/\{\{([^}]+)\}\}/g), m => m[1].trim()))).filter(t => !/^[#/^]/.test(t));
}

/** Contexto do contrato em branco: o do empreendimento (real) com os campos do negócio trocados por linhas */
export async function contextoTalao(slug: string, numero: number | null): Promise<{ ctx: Ctx; modelo: string; marca: string }> {
  const { j, entrada } = await prepararModelo(slug, 'A01', null, 'padrao');
  const base = montarContexto(entrada);
  const modelo = modeloDaCondicao(j.modeloCpcv, 'padrao');
  const ctx: Ctx = { ...base };
  for (const t of await tagsDoModelo(modelo)) if (!(t in base) && EM_BRANCO.test(t)) base[t] = '';
  for (const [k, v] of Object.entries(base)) {
    if (!EM_BRANCO.test(k)) continue;
    if (typeof v === 'boolean') continue;
    if (k.endsWith('_resumo')) { ctx[k] = ''; continue; }
    ctx[k] = linhaDoCampo(k);
  }
  const num = numero != null ? String(numero).padStart(6, '0') : '______';
  Object.assign(ctx, {
    ctr_numero: `TALÃO ${num}`, ctr_codigo_verificacao: `TALÃO ${num} (lançar no sistema)`,
    ctr_data_extenso: 'Açailândia/MA, ______ de ______________________ de 20_____',
    ctr_condicoes_especificas: `${LONGO}\n${LONGO}\n${LONGO}`,
    lote_descricao: `${LONGO}\n${LONGO}\n${LONGO}`,
    // Mostra as cláusulas de todas as situações: quem preenche risca o que não se aplica
    comp_casado: true, comp2_existe: false, corr_parceiro: true, pagamento_avista: true, pagamento_financiado: true, assinatura_manuscrita: true,
    intermed_lancamento: false,
  });
  return { ctx, modelo, marca: j.marcaSlug };
}

// ─── Páginas próprias do talão (capa + ficha + quadro de condições) ──────────────

interface Pena { p: PDFPage; y: number; f: PDFFont; fb: PDFFont }

function titulo(pn: Pena, t: string, tam = 13) {
  pn.p.drawText(t, { x: X0, y: pn.y, size: tam, font: pn.fb, color: VERDE });
  pn.y -= tam + 4;
  pn.p.drawLine({ start: { x: X0, y: pn.y + 2 }, end: { x: X1, y: pn.y + 2 }, thickness: 1, color: DOURADO });
  pn.y -= 12;
}
function texto(pn: Pena, t: string, tam = 9.5, cor = CINZA) {
  // quebra simples por largura
  const palavras = t.split(/\s+/);
  let linha = '';
  for (const w of palavras) {
    const tenta = linha ? `${linha} ${w}` : w;
    if (pn.f.widthOfTextAtSize(tenta, tam) > X1 - X0) { pn.p.drawText(linha, { x: X0, y: pn.y, size: tam, font: pn.f, color: cor }); pn.y -= tam + 3.5; linha = w; }
    else linha = tenta;
  }
  if (linha) { pn.p.drawText(linha, { x: X0, y: pn.y, size: tam, font: pn.f, color: cor }); pn.y -= tam + 3.5; }
}
/** Linha de campos lado a lado: [rótulo, peso da largura] */
function campos(pn: Pena, itens: [string, number][], alt = 26) {
  const total = itens.reduce((s, [, w]) => s + w, 0);
  let x = X0;
  const larg = X1 - X0 - (itens.length - 1) * 8;
  for (const [rot, w] of itens) {
    const lw = (larg * w) / total;
    pn.p.drawText(rot, { x, y: pn.y, size: 7.5, font: pn.fb, color: VERDE });
    pn.p.drawLine({ start: { x, y: pn.y - alt + 8 }, end: { x: x + lw, y: pn.y - alt + 8 }, thickness: 0.6, color: CINZA });
    x += lw + 8;
  }
  pn.y -= alt;
}
function caixas(pn: Pena, opcoes: string[], tam = 9.5) {
  let x = X0;
  for (const o of opcoes) {
    pn.p.drawRectangle({ x, y: pn.y - 2, width: 9, height: 9, borderColor: VERDE, borderWidth: 0.8 });
    pn.p.drawText(o, { x: x + 13, y: pn.y, size: tam, font: pn.f, color: rgb(0.1, 0.1, 0.1) });
    x += 13 + pn.f.widthOfTextAtSize(o, tam) + 22;
  }
  pn.y -= 18;
}

async function paginasDoTalao(marca: string, numero: number | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('Talonário de contrato — ficha e condições');
  const m = await embutirMarca(doc, marca);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const nova = (): Pena => { const p = doc.addPage(A4); const r = desenharMarca(p, m); return { p, y: r.topo - 6, f, fb }; };
  const num = numero != null ? String(numero).padStart(6, '0') : '______';

  // 1. Capa: instruções + ficha cadastral do comprador
  const a = nova();
  a.p.drawText(`TALÃO DE CONTRATO Nº ${num}`, { x: X0, y: a.y, size: 16, font: fb, color: VERDE }); a.y -= 20;
  texto(a, 'Uso no campo, sem sistema (falta de energia ou de internet). Preencha com letra de forma, sem rasuras. Risque o que não se aplica (à vista ou parcelado; cônjuge, se solteiro). Ao voltar ao escritório, lance esta folha em Talonários (anexe a cópia digitalizada) e cadastre o contrato no sistema: só então saem a tabela de pagamento, o memorial e o mapa da chácara (Anexos I, II, V e VI).', 9);
  a.y -= 6;
  titulo(a, 'FICHA CADASTRAL DO COMPRADOR');
  campos(a, [['Nome completo', 3], ['CPF/CNPJ', 1.3]]);
  campos(a, [['RG', 1], ['Órgão/UF', 0.6], ['Data de nascimento', 0.9], ['Nacionalidade', 1], ['Profissão', 1.3]]);
  a.p.drawText('Estado civil:', { x: X0, y: a.y, size: 9, font: fb, color: VERDE }); a.y -= 14;
  caixas(a, ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)']);
  a.p.drawText('Regime de bens:', { x: X0, y: a.y, size: 9, font: fb, color: VERDE }); a.y -= 14;
  caixas(a, ['Comunhão parcial', 'Comunhão universal', 'Separação total', 'Participação final']);
  campos(a, [['Endereço (rua, nº, complemento)', 3], ['Bairro', 1.2]]);
  campos(a, [['CEP', 0.8], ['Cidade', 1.6], ['UF', 0.4], ['WhatsApp', 1.1], ['E-mail', 1.8]]);
  a.y -= 4;
  titulo(a, 'CÔNJUGE / COMPANHEIRO(A)  (se houver)', 11);
  campos(a, [['Nome completo', 3], ['CPF', 1.3]]);
  campos(a, [['RG / Órgão', 1.2], ['Nacionalidade', 1], ['Profissão', 1.3], ['WhatsApp', 1.1]]);
  a.y -= 4;
  titulo(a, 'CHÁCARA', 11);
  campos(a, [['Código (ex.: B13)', 1], ['Quadra', 0.7], ['Área (m²)', 1], ['Preço de tabela (R$)', 1.4]]);
  a.y -= 4;
  titulo(a, 'CORRETOR(A) INTERMEDIADOR(A)', 11);
  campos(a, [['Nome completo', 3], ['CPF', 1.3]]);
  campos(a, [['CRECI/UF (ex.: CRECI/MA F-0000)', 1.6], ['WhatsApp', 1.1]]);
  campos(a, [['Intermediação: % sobre a venda', 1], ['Valor da intermediação (R$)', 1], ['Forma de pagamento da intermediação', 1.6]]);
  texto(a, 'A intermediação é paga conforme o Contrato de Intermediação anexo; o percentual e o valor acima devem ser os mesmos dele.', 8);

  // 2. Quadro de condições de pagamento
  const b = nova();
  b.p.drawText(`TALÃO Nº ${num}`, { x: X0, y: b.y, size: 10, font: fb, color: DOURADO }); b.y -= 18;
  titulo(b, 'QUADRO DE CONDIÇÕES DE PAGAMENTO');
  b.p.drawText('Modalidade:', { x: X0, y: b.y, size: 9, font: fb, color: VERDE }); b.y -= 14;
  caixas(b, ['À vista', 'Parcelado (entrada + saldo)', 'Plano de lançamento A', 'Plano B', 'Plano C']);
  campos(b, [['Preço de tabela (R$)', 1], ['Desconto à vista (R$)', 1], ['Preço final à vista (R$)', 1]]);
  b.y -= 2;
  titulo(b, 'ENTRADA', 11);
  campos(b, [['Valor total da entrada (R$)', 1.2], ['% do preço', 0.6], ['Nº de parcelas', 0.7], ['Valor de cada parcela (R$)', 1.2]]);
  campos(b, [['1º vencimento', 1], ['Forma (Pix, boleto, dinheiro, cartão)', 2]]);
  b.p.drawText('Entrada paga no ato da assinatura?', { x: X0, y: b.y, size: 9, font: fb, color: VERDE }); b.y -= 14;
  caixas(b, ['Sim — recibo nº __________', 'Não']);
  titulo(b, 'SALDO', 11);
  campos(b, [['Valor do saldo (R$)', 1.2], ['Nº de parcelas', 0.7], ['Valor da parcela (R$)', 1.2], ['1º vencimento', 1]]);
  campos(b, [['Dia do vencimento', 0.8], ['Juros (% a.a.)', 0.8], ['Total a pagar (R$)', 1.2], ['Reforços anuais (se houver)', 1.5]]);
  titulo(b, 'OBSERVAÇÕES / CONDIÇÕES ESPECÍFICAS', 11);
  for (let i = 0; i < 4; i++) campos(b, [['', 1]], 20);
  b.y -= 10;
  texto(b, 'Os valores definitivos, a tabela de pagamento (Anexo II) e o carnê saem quando o contrato for cadastrado no sistema, a partir destas condições. Em divergência, valem as condições assinadas pelas partes neste quadro.', 8);
  b.y -= 24;
  const ass = (rot: string, x: number) => {
    b.p.drawLine({ start: { x, y: b.y }, end: { x: x + 220, y: b.y }, thickness: 0.6, color: CINZA });
    b.p.drawText(rot, { x, y: b.y - 11, size: 8, font: f, color: CINZA });
  };
  ass('COMPRADOR(A)', X0); ass('CORRETOR(A) INTERMEDIADOR(A)', X1 - 220);
  b.y -= 44;
  ass('CÔNJUGE (se houver)', X0); ass(`${ESCRITORIO.fantasia} · ${ESCRITORIO.creciJ}`, X1 - 220);

  return Buffer.from(await doc.save());
}

/** Número da folha no topo de cada página e o total no rodapé */
async function numerar(pdf: Buffer, numero: number | null): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const num = numero != null ? String(numero).padStart(6, '0') : '______';
  const pags = doc.getPages();
  pags.forEach((p, i) => {
    const { width, height } = p.getSize();
    const t = `TALÃO Nº ${num}`;
    p.drawRectangle({ x: width - 150, y: height - 26, width: 132, height: 16, color: rgb(1, 1, 1), borderColor: DOURADO, borderWidth: 0.8 });
    p.drawText(t, { x: width - 144, y: height - 21, size: 9, font: fb, color: VERDE });
    p.drawText(`pág. ${i + 1}/${pags.length} · ${LINHA_PUBLICIDADE}`, { x: 20, y: 6, size: 6.5, font: f, color: CINZA });
  });
  return Buffer.from(await doc.save());
}

/** Uma folha do talão: capa/ficha + condições + CPCV completo + Estatuto + Diretrizes + Intermediação */
export async function folhaDoTalao(slug: string, numero: number | null): Promise<Buffer> {
  const { ctx, modelo, marca } = await contextoTalao(slug, numero);
  const opcoes = { minuta: false, marca };
  const [frente, principal, estatuto, diretrizes, intermediacao] = await Promise.all([
    paginasDoTalao(marca, numero),
    mergeDocx(modelo, ctx, opcoes).then(docxParaPdf),
    anexoEstatuto(ctx, opcoes),
    anexoDiretrizes(ctx, marca),
    docIntermediacao(ctx, marca),
  ]);
  const junto = await anexar(frente, [principal, estatuto, diretrizes, intermediacao]);
  return numerar(junto, numero);
}

/** Várias folhas (números do bloco) num PDF só, para imprimir de uma vez */
export async function folhasDoTalao(slug: string, numeros: (number | null)[]): Promise<Buffer> {
  if (!numeros.length) throw new Error('Nenhuma folha');
  if (numeros.length > MAX_FOLHAS_POR_PDF) throw new Error(`No máximo ${MAX_FOLHAS_POR_PDF} folhas por arquivo`);
  const saida = await PDFDocument.create();
  saida.setTitle(numeros.length === 1 ? `Talão de contrato ${numeros[0] ?? 'em branco'}` : `Talão de contratos ${numeros[0]}–${numeros[numeros.length - 1]}`);
  for (const n of numeros) {
    const um = await PDFDocument.load(await folhaDoTalao(slug, n));
    (await saida.copyPages(um, um.getPageIndices())).forEach(p => saida.addPage(p));
  }
  return Buffer.from(await saida.save());
}
