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

  // 1. Ficha cadastral do comprador
  const a = nova();
  a.p.drawText(`TALÃO Nº ${num}`, { x: X0, y: a.y, size: 10, font: fb, color: DOURADO }); a.y -= 18;
  titulo(a, '1. FICHA CADASTRAL DO COMPRADOR');
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
  titulo(b, '2. QUADRO DE CONDIÇÕES DE PAGAMENTO');
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

export interface ItemSumario { titulo: string; detalhe: string; inicio: number; fim: number }

/** Capa (página 1) e sumário (página 2) — o sumário recebe as páginas já contadas */
async function capaESumario(marca: string, numero: number | null, itens: ItemSumario[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const m = await embutirMarca(doc, marca);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const num = numero != null ? String(numero).padStart(6, '0') : '______';
  const nova = (): Pena => { const p = doc.addPage(A4); const r = desenharMarca(p, m); return { p, y: r.topo - 6, f, fb }; };
  const centro = (pn: Pena, t: string, tam: number, fonte: PDFFont, cor = VERDE) => {
    pn.p.drawText(t, { x: (A4[0] - fonte.widthOfTextAtSize(t, tam)) / 2, y: pn.y, size: tam, font: fonte, color: cor }); pn.y -= tam + 8;
  };

  // Capa
  const c = nova();
  c.y -= 70;
  centro(c, 'TALÃO DE CONTRATO', 30, fb);
  centro(c, 'Compromisso de Compra e Venda de Chácara', 13, f, CINZA);
  c.y -= 14;
  c.p.drawRectangle({ x: A4[0] / 2 - 120, y: c.y - 16, width: 240, height: 40, borderColor: DOURADO, borderWidth: 1.5 });
  centro(c, `Nº ${num}`, 22, fb, VERDE);
  c.y -= 40;
  const linhaCapa = (rot: string) => {
    c.p.drawText(rot, { x: X0 + 30, y: c.y, size: 10, font: fb, color: VERDE });
    c.p.drawLine({ start: { x: X0 + 170, y: c.y - 2 }, end: { x: X1 - 30, y: c.y - 2 }, thickness: 0.6, color: CINZA });
    c.y -= 30;
  };
  ['Comprador(a)', 'CPF do comprador(a)', 'Chácara (código)', 'Corretor(a) intermediador(a)', 'CRECI do corretor(a)', 'Data da assinatura'].forEach(linhaCapa);
  c.y -= 10;
  c.p.drawRectangle({ x: X0, y: c.y - 92, width: X1 - X0, height: 100, color: rgb(0.96, 0.94, 0.88) });
  c.y -= 8; const x0 = X0 + 12;
  c.p.drawText('Como usar', { x: x0, y: c.y, size: 10, font: fb, color: VERDE }); c.y -= 14;
  const instr = [
    'Para atendimento sem sistema (falta de energia ou de internet). Preencha com letra de forma, sem rasuras.',
    'Risque o que não se aplica (à vista ou parcelado; cônjuge, se solteiro). Comprador e corretor rubricam todas as páginas.',
    'Ao final, siga o checklist de anexos: cópias dos documentos do comprador e o comprovante do sinal.',
    'Na volta ao escritório: lance esta folha em Talonários (com a cópia digitalizada) e cadastre o contrato no sistema.',
  ];
  for (const t of instr) { c.p.drawText(`•  ${t}`, { x: x0, y: c.y, size: 8.3, font: f, color: rgb(0.15, 0.15, 0.15) }); c.y -= 14; }
  c.y -= 30;
  centro(c, LINHA_PUBLICIDADE, 10, fb, VERDE);
  centro(c, `CNPJ ${ESCRITORIO.cnpj} · Corretor responsável: ${ESCRITORIO.creciResponsavel}`, 8, f, CINZA);

  // Sumário
  const s2 = nova();
  s2.p.drawText(`TALÃO Nº ${num}`, { x: X0, y: s2.y, size: 10, font: fb, color: DOURADO }); s2.y -= 18;
  titulo(s2, 'SUMÁRIO');
  for (const it of itens) {
    const pag = it.inicio === it.fim ? `pág. ${it.inicio}` : `págs. ${it.inicio} a ${it.fim}`;
    s2.p.drawText(it.titulo, { x: X0, y: s2.y, size: 11, font: fb, color: rgb(0.1, 0.1, 0.1) });
    const wPag = f.widthOfTextAtSize(pag, 10);
    const ini = X0 + fb.widthOfTextAtSize(it.titulo, 11) + 6, fim = X1 - wPag - 6;
    if (fim > ini) s2.p.drawLine({ start: { x: ini, y: s2.y + 2 }, end: { x: fim, y: s2.y + 2 }, thickness: 0.5, color: DOURADO, dashArray: [1, 3] });
    s2.p.drawText(pag, { x: X1 - wPag, y: s2.y, size: 10, font: f, color: VERDE });
    s2.y -= 14;
    texto(s2, it.detalhe, 8.5);
    s2.y -= 8;
  }
  return Buffer.from(await doc.save());
}

/** Último item: checklist de anexos + folha para grampear as cópias dos documentos e o comprovante do sinal */
async function checklistAnexos(marca: string, numero: number | null): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const m = await embutirMarca(doc, marca);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const num = numero != null ? String(numero).padStart(6, '0') : '______';
  const nova = (): Pena => { const p = doc.addPage(A4); const r = desenharMarca(p, m); return { p, y: r.topo - 6, f, fb }; };
  const item = (pn: Pena, t: string, sub?: string) => {
    pn.p.drawRectangle({ x: X0, y: pn.y - 2, width: 10, height: 10, borderColor: VERDE, borderWidth: 0.9 });
    pn.p.drawText(t, { x: X0 + 18, y: pn.y, size: 9.5, font: f, color: rgb(0.1, 0.1, 0.1) });
    pn.y -= 13;
    if (sub) { pn.p.drawText(sub, { x: X0 + 18, y: pn.y, size: 7.8, font: f, color: CINZA }); pn.y -= 12; }
    pn.y -= 3;
  };
  const a = nova();
  a.p.drawText(`TALÃO Nº ${num}`, { x: X0, y: a.y, size: 10, font: fb, color: DOURADO }); a.y -= 18;
  titulo(a, '7. ANEXAÇÃO DE DOCUMENTOS — CHECKLIST');
  texto(a, 'Marque cada item conferido e grampeie as cópias a partir da próxima página. O contrato só é cadastrado no sistema com os itens obrigatórios (*) completos.', 8.5);
  a.y -= 4;
  a.y -= 8; titulo(a, 'Documentos do(a) comprador(a)', 10.5);
  item(a, '* Documento de identidade com foto: RG ou CNH (cópia da frente e do verso)');
  item(a, '* CPF (se não constar no documento de identidade)');
  item(a, '* Comprovante de residência atualizado (até 90 dias)', 'Conta de água, energia, telefone ou internet; em nome de terceiro, com declaração de residência');
  item(a, '* Certidão de nascimento ou de casamento / escritura de união estável', 'Se casado(a): com averbações e, se houver, o pacto antenupcial');
  item(a, 'Comprovante de renda (no parcelado: contracheque, extrato ou declaração do IR)');
  a.y -= 8; titulo(a, 'Cônjuge / companheiro(a) (se houver)', 10.5);
  item(a, '* RG ou CNH e CPF do cônjuge / companheiro(a)');
  a.y -= 8; titulo(a, 'Comprador pessoa jurídica (se for o caso)', 10.5);
  item(a, 'Contrato social e última alteração, cartão CNPJ e documentos do representante legal');
  a.y -= 8; titulo(a, 'Documentos do(a) corretor(a) intermediador(a)', 10.5);
  item(a, '* Carteira do CRECI com validade vigente (frente e verso)', 'A carteira já vale como documento pessoal do corretor: tem foto, CPF e o número do CRECI');
  item(a, 'Ou: certidão de regularidade do CRECI (dentro da validade) + RG ou CNH do(a) corretor(a)', 'Use quando não tiver a carteira em mãos');
  a.y -= 8; titulo(a, 'Pagamento', 10.5);
  item(a, '* Comprovante de pagamento do sinal / entrada', 'Pix, transferência ou depósito; em dinheiro, o recibo do talão de recibos nº __________');
  a.y -= 8; titulo(a, 'Assinaturas', 10.5);
  item(a, '* Contrato (CPCV) assinado e rubricado em todas as páginas: comprador(a), cônjuge, corretor(a) e 2 testemunhas');
  item(a, '* Contrato de Intermediação assinado pelo(a) comprador(a) e pelo(a) corretor(a) intermediador(a)');
  item(a, '* Ficha cadastral e quadro de condições preenchidos e assinados');
  a.y -= 10;
  campos(a, [['Conferido por (escritório)', 2], ['Data', 0.8], ['Lançado no sistema — contrato nº', 1.4]]);

  // Folha para grampear as cópias
  const b = nova();
  b.p.drawText(`TALÃO Nº ${num}`, { x: X0, y: b.y, size: 10, font: fb, color: DOURADO }); b.y -= 18;
  titulo(b, 'CÓPIAS: COMPRADOR(A), CORRETOR(A) E COMPROVANTE DO SINAL', 11);
  const quadro = (rot: string, h: number) => {
    b.p.drawRectangle({ x: X0, y: b.y - h, width: X1 - X0, height: h, borderColor: DOURADO, borderWidth: 1, borderDashArray: [6, 4] });
    b.p.drawText(rot, { x: X0 + 10, y: b.y - 16, size: 9, font: fb, color: VERDE });
    b.y -= h + 12;
  };
  quadro('Comprador(a): documento de identidade (RG/CNH) — frente', 118);
  quadro('Comprador(a): documento de identidade (RG/CNH) — verso', 118);
  quadro('Corretor(a): carteira do CRECI com validade vigente (ou certidão de regularidade + RG/CNH)', 118);
  quadro('Comprovante de pagamento do sinal / entrada', 128);
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

/** Uma folha do talão: capa + sumário + ficha/condições + CPCV + Estatuto + Diretrizes + Intermediação + checklist de anexos */
export async function folhaDoTalao(slug: string, numero: number | null): Promise<Buffer> {
  const { ctx, modelo, marca } = await contextoTalao(slug, numero);
  const opcoes = { minuta: false, marca };
  const [frente, principal, estatuto, diretrizes, intermediacao, checklist] = await Promise.all([
    paginasDoTalao(marca, numero),
    mergeDocx(modelo, ctx, opcoes).then(docxParaPdf),
    anexoEstatuto(ctx, opcoes),
    anexoDiretrizes(ctx, marca),
    docIntermediacao(ctx, marca),
    checklistAnexos(marca, numero),
  ]);
  const paginas = async (b: Buffer) => (await PDFDocument.load(b)).getPageCount();
  const [nf, np, ne, nd, ni, nc] = await Promise.all([frente, principal, estatuto, diretrizes, intermediacao, checklist].map(paginas));
  let pag = 3; // 1 = capa, 2 = sumário
  const faixa = (n: number) => { const r = { inicio: pag, fim: pag + n - 1 }; pag += n; return r; };
  const fFicha = faixa(1), fCond = faixa(nf - 1);
  const itens: ItemSumario[] = [
    { titulo: '1. Ficha cadastral', detalhe: 'Comprador(a), cônjuge, chácara escolhida e corretor(a) intermediador(a) com o percentual da intermediação.', ...fFicha },
    { titulo: '2. Quadro de condições de pagamento', detalhe: 'Modalidade (à vista, parcelado ou planos de lançamento), entrada, saldo, vencimentos e observações.', ...fCond },
    { titulo: '3. Contrato (CPCV)', detalhe: 'Instrumento Particular de Compromisso de Compra e Venda, com todas as cláusulas e o quadro-resumo.', ...faixa(np) },
    { titulo: '4. Anexo III — Estatuto da Associação', detalhe: 'Estatuto social da associação dos proprietários do condomínio.', ...faixa(ne) },
    { titulo: '5. Anexo IV — Diretrizes de Uso', detalhe: 'O que é permitido, permitido com condições e proibido nas chácaras.', ...faixa(nd) },
    { titulo: '6. Contrato de Intermediação', detalhe: 'Preenchido pelo(a) corretor(a); assinam o(a) comprador(a) e o(a) corretor(a) intermediador(a).', ...faixa(ni) },
    { titulo: '7. Anexação de documentos — checklist', detalhe: 'Cópias dos documentos do(a) comprador(a) e do cônjuge, carteira do CRECI do(a) corretor(a) (ou certidão), comprovante do sinal e conferência.', ...faixa(nc) },
  ];
  const capa = await capaESumario(marca, numero, itens);
  const junto = await anexar(capa, [frente, principal, estatuto, diretrizes, intermediacao, checklist]);
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
