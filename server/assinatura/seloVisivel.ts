/**
 * Selo visível da assinatura ICP-Brasil, acrescentado por ATUALIZAÇÃO INCREMENTAL (os bytes anteriores não mudam):
 * - em cima do TRAÇO de assinatura de quem assina (o nome embaixo do traço; a empreendedora no da vendedora; sem o nome,
 *   o primeiro traço ainda sem selo), como anotação com aparência própria: nome, CPF mascarado, data/hora;
 * - sem traço no documento, numa página "Assinaturas digitais" criada no fim (marcada com /RomatecAssinaturas).
 * Anotações depois de uma assinatura são alteração permitida: as assinaturas anteriores seguem válidas.
 * O selo entra ANTES do placeholder da assinatura, então fica coberto pela assinatura de quem o recebe.
 */
import * as readPdfMod from '@signpdf/placeholder-plain/dist/readPdf';
import * as findObjectMod from '@signpdf/placeholder-plain/dist/findObject';
import { removeTrailingNewLine } from '@signpdf/utils';

export interface DadosSelo {
  nome: string; cpf?: string | null; emissor?: string | null; motivo?: string | null; quando?: Date;
  /** Outros nomes com que a pessoa aparece embaixo do traço (nome do cadastro, razão social da vendedora…) */
  apelidos?: string[];
  /** Nomes de outros signatários previstos: os traços deles não são ocupados por quem não tem o nome no documento */
  reservados?: string[];
}

// Módulos CommonJS com "exports.default": a função fica em .default (ou .default.default, conforme o empacotador)
const padrao = (m: any) => (typeof m === 'function' ? m : typeof m?.default === 'function' ? m.default : m?.default?.default);
const readPdf: (pdf: Buffer) => any = padrao(readPdfMod);
const findObject: (pdf: Buffer, xref: any, ref: string) => Buffer = padrao(findObjectMod);

const MARCA_PAGINA = '/RomatecAssinaturas true';
const MARCA_SELO = '/RomatecSelo true';
const A4: [number, number] = [595.28, 841.89];
const MARGEM = 48, ALTURA_SELO = 74, ESPACO = 10, TOPO = 150;

/** Texto PDF literal em WinAnsi, com escapes; caracteres fora do latin-1 viram equivalentes */
function literal(t: string): string {
  const troca: Record<string, number> = { '—': 0x97, '–': 0x96, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95, '…': 0x85 };
  let out = '';
  for (const ch of t) {
    const c = troca[ch] ?? ch.codePointAt(0)!;
    if (c === 0x28 || c === 0x29 || c === 0x5c) out += `\\${ch}`;
    else if (c >= 0x20 && c < 0x7f) out += ch;
    else if (c <= 0xff) out += `\\${c.toString(8).padStart(3, '0')}`;
    else out += '?';
  }
  return `(${out})`;
}

const cpfMascarado = (cpf?: string | null) => {
  const d = String(cpf ?? '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
};

const dataHoraBrasilia = (d: Date) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(d);

/** Corta por largura aproximada (Helvetica ~0,5 em) */
const caber = (t: string, larguraPt: number, tamanho: number) => {
  const max = Math.max(8, Math.floor(larguraPt / (tamanho * 0.5)));
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function stream(dicionario: string, conteudo: string): string {
  const bytes = Buffer.from(conteudo, 'latin1');
  return `<< ${dicionario} /Length ${bytes.length} >>\nstream\n${conteudo}\nendstream`;
}

/** Selo compacto em cima do traço (cabe em 22–40 pt de altura) */
function aparenciaNoTraco(w: number, h: number, d: DadosSelo): string {
  const quando = dataHoraBrasilia(d.quando ?? new Date());
  const cpf = cpfMascarado(d.cpf);
  const linhas = [
    ...(h >= 30 ? [{ f: 'F1', s: 6.5, t: 'ASSINADO DIGITALMENTE · ICP-Brasil', cor: '0.04 0.45 0.28' }] : []),
    { f: 'F1', s: 8.5, t: d.nome.toUpperCase(), cor: '0.05 0.2 0.35' },
    { f: 'F2', s: 6, t: [cpf && `CPF ${cpf}`, quando].filter(Boolean).join(' · '), cor: '0.25 0.25 0.25' },
  ];
  const altura = linhas.reduce((a, l) => a + l.s + 2, 0);
  let y = Math.max(3, (h - altura) / 2) + altura - linhas[0].s;
  const textos = linhas.map(l => {
    const cmd = `BT /${l.f} ${l.s} Tf ${l.cor} rg 8 ${y.toFixed(2)} Td ${literal(caber(l.t, w - 14, l.s))} Tj ET`;
    y -= l.s + 2;
    return cmd;
  }).join('\n');
  return [`q 0.9 0.97 0.93 rg 0.04 0.45 0.28 RG 0.6 w 0.5 0.5 ${(w - 1).toFixed(2)} ${(h - 1).toFixed(2)} re B`, `0.04 0.45 0.28 rg 0.5 0.5 3 ${(h - 1).toFixed(2)} re f Q`, textos].join('\n');
}

/** Desenho do carimbo (XObject de formulário), com moldura verde e textos */
function aparencia(w: number, h: number, d: DadosSelo): string {
  const quando = dataHoraBrasilia(d.quando ?? new Date());
  const linhas = [
    { f: 'F1', s: 8, t: 'ASSINADO DIGITALMENTE · ICP-Brasil (MP n.º 2.200-2/2001)', cor: '0.04 0.45 0.28' },
    { f: 'F1', s: 11, t: d.nome.toUpperCase(), cor: '0.1 0.1 0.1' },
    { f: 'F2', s: 8, t: [cpfMascarado(d.cpf) && `CPF ${cpfMascarado(d.cpf)}`, d.emissor && `Certificado: ${d.emissor}`].filter(Boolean).join(' · '), cor: '0.25 0.25 0.25' },
    { f: 'F2', s: 8, t: `Data/hora: ${quando} (horário de Brasília)${d.motivo ? ` · Motivo: ${d.motivo}` : ''}`, cor: '0.25 0.25 0.25' },
  ];
  let y = h - 16;
  const textos = linhas.filter(l => l.t).map(l => {
    const cmd = `BT /${l.f} ${l.s} Tf ${l.cor} rg 14 ${y.toFixed(2)} Td ${literal(caber(l.t, w - 28, l.s))} Tj ET`;
    y -= l.s + 6;
    return cmd;
  }).join('\n');
  return [
    'q 0.96 0.99 0.97 rg 0.04 0.45 0.28 RG 1.2 w',
    `1 1 ${(w - 2).toFixed(2)} ${(h - 2).toFixed(2)} re B`,
    `0.04 0.45 0.28 rg 1 1 5 ${(h - 2).toFixed(2)} re f Q`,
    textos,
  ].join('\n');
}

const FONTES = '<< /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >>';

const mediaBox = (dict: string): [number, number] => {
  const m = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(dict);
  return m ? [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])] : A4;
};

/** Índice do objeto mais recente que contém a marca (página de assinaturas) */
function objetoComMarca(pdf: Buffer, marca: string): number | null {
  const texto = pdf.toString('latin1');
  let fim = texto.lastIndexOf(marca);
  if (fim < 0) return null;
  const ini = texto.lastIndexOf(' 0 obj', fim);
  const m = /(\d+)$/.exec(texto.slice(Math.max(0, ini - 12), ini));
  return m ? Number(m[1]) : null;
}

interface Escrita { pdf: Buffer; info: any; novos: Map<number, number>; proximo: number }

function iniciar(original: Buffer): Escrita {
  const pdf: Buffer = removeTrailingNewLine(original);
  const info: any = readPdf(pdf);
  return { pdf, info, novos: new Map(), proximo: info.xref.maxIndex };
}
const escrever = (e: Escrita, indice: number, corpo: string) => {
  e.novos.set(indice, e.pdf.length + 1);
  e.pdf = Buffer.concat([e.pdf, Buffer.from(`\n${indice} 0 obj\n${corpo}\nendobj\n`, 'latin1')]);
};
const novo = (e: Escrita) => ++e.proximo;

/** Texto cru de um objeto (dicionário ou array) na versão mais recente */
function objetoCru(e: Escrita, indice: number): string {
  const off = e.info.xref.offsets.get(indice);
  if (off == null) throw new Error(`objeto ${indice} não encontrado`);
  const t = e.pdf.subarray(off, e.pdf.indexOf('endobj', off)).toString('latin1');
  return t.slice(t.indexOf('obj') + 3).trim();
}

/** Páginas (folhas da árvore), em ordem */
function folhas(e: Escrita, ref: string): string[] {
  const dict = findObject(e.pdf, e.info.xref, ref).toString('latin1');
  if (!/\/Type\s*\/Pages\b/.test(dict)) return [ref];
  const kids = /\/Kids\s*\[([^\]]*)\]/.exec(dict)?.[1]?.match(/\d+\s+\d+\s+R/g) ?? [];
  return kids.flatMap(k => folhas(e, k));
}

/** Acrescenta a anotação ao /Annots da página (array no dicionário ou objeto à parte) */
function anotar(e: Escrita, paginaIdx: number, annotIdx: number, dictPagina?: string) {
  const dict = dictPagina ?? findObject(e.pdf, e.info.xref, `${paginaIdx} 0 R`).toString('latin1');
  const indireto = /\/Annots\s+(\d+)\s+0\s+R/.exec(dict);
  if (indireto) {
    const idx = Number(indireto[1]);
    const arr = objetoCru(e, idx).replace(/\]\s*$/, ` ${annotIdx} 0 R]`);
    escrever(e, idx, arr);
    if (dictPagina) escrever(e, paginaIdx, `<< ${dict.trim()} >>`);
    return;
  }
  const comAnnot = /\/Annots\s*\[/.test(dict)
    ? dict.replace(/\/Annots\s*\[([^\]]*)\]/, (_m, a) => `/Annots [${String(a).trim()} ${annotIdx} 0 R]`)
    : `${dict.trim()} /Annots [${annotIdx} 0 R]`;
  escrever(e, paginaIdx, `<< ${comAnnot.trim()} >>`);
}

function fechar(e: Escrita): Buffer {
  const linhas = ['xref', '0 1', '0000000000 65535 f '];
  for (const [i, off] of Array.from(e.novos.entries()).sort((a, b) => a[0] - b[0])) linhas.push(`${i} 1`, `${String(off).padStart(10, '0')} 00000 n `);
  const posXref = e.pdf.length + 1;
  const trailer = `${linhas.join('\n')}\ntrailer\n<<\n/Size ${e.proximo + 1}\n/Root ${e.info.rootRef}\n${e.info.infoRef ? `/Info ${e.info.infoRef}\n` : ''}/Prev ${e.info.xRefPosition}\n>>\nstartxref\n${posXref}\n%%EOF`;
  return Buffer.concat([e.pdf, Buffer.from(`\n${trailer}`, 'latin1')]);
}

function selo(e: Escrita, paginaIdx: number, rect: [number, number, number, number], d: DadosSelo, compacto: boolean, dictPagina?: string) {
  const [x1, y1, x2, y2] = rect;
  const w = x2 - x1, h = y2 - y1;
  const apIdx = novo(e);
  escrever(e, apIdx, stream(`/Type /XObject /Subtype /Form /BBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /Font ${FONTES} >>`, compacto ? aparenciaNoTraco(w, h, d) : aparencia(w, h, d)));
  const annotIdx = novo(e);
  const descricao = `Assinado digitalmente por ${d.nome}${d.quando ? ` em ${dataHoraBrasilia(d.quando)}` : ''}`;
  escrever(e, annotIdx, `<< /Type /Annot /Subtype /Stamp /Rect [${rect.map(n => n.toFixed(2)).join(' ')}] /F 4 /P ${paginaIdx} 0 R /AP << /N ${apIdx} 0 R >> /Contents ${literal(descricao)} /Name /Approved ${MARCA_SELO} >>`);
  anotar(e, paginaIdx, annotIdx, dictPagina);
}

/** Retângulos dos selos já postos, por índice da página */
function selosExistentes(pdf: Buffer): { pagina: number; r: number[] }[] {
  const out: { pagina: number; r: number[] }[] = [];
  const re = /\/Rect \[([-\d. ]+)\] \/F 4 \/P (\d+) 0 R[^\n]*\/RomatecSelo true/g;
  const t = pdf.toString('latin1');
  for (let m = re.exec(t); m; m = re.exec(t)) out.push({ pagina: Number(m[2]), r: m[1].trim().split(/\s+/).map(Number) });
  return out;
}
const sobrepoe = (a: number[], b: number[]) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 4 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 4;

/** Selo sobre o traço da pessoa; null quando o documento não tem traço livre para ela */
async function noTraco(e: Escrita, d: DadosSelo, pagesRef: string): Promise<boolean> {
  const { localizarAssinaturas } = await import('./autoPosicao');
  const nomes = [d.nome, ...(d.apelidos ?? [])].filter(Boolean);
  let caixas = await localizarAssinaturas(e.pdf, [{ papel: 'signatario', nome: d.nome, apelidos: nomes }]).catch(() => []);
  // Com o nome embaixo do traço, o lugar é dele: se outro selo já ocupa, o dele sobe logo acima
  const doNome = caixas.length > 0;
  if (!caixas.length) {
    const livres = await localizarAssinaturas(e.pdf, [{ papel: 'signatario', nome: '', qualquer: true }]).catch(() => []);
    const reservados = (d.reservados ?? []).filter(Boolean);
    const deOutros = reservados.length ? await localizarAssinaturas(e.pdf, reservados.map(n => ({ papel: 'outro', nome: n, apelidos: [n] }))).catch(() => []) : [];
    const mesmoLugar = (a: { pagina: number; x: number; y: number; w: number; h: number }, b: typeof a) => a.pagina === b.pagina && Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02;
    caixas = livres.filter(c => !deOutros.some(o => mesmoLugar(o, c)));
  }
  if (!caixas.length) return false;
  const paginas = folhas(e, pagesRef);
  const ja = selosExistentes(e.pdf);
  for (const c of caixas) {
    const ref = paginas[c.pagina - 1];
    if (!ref) continue;
    const idx = Number(ref.split(' ')[0]);
    const [W, H] = mediaBox(findObject(e.pdf, e.info.xref, ref).toString('latin1'));
    let r: [number, number, number, number] = [c.x * W, c.y * H, (c.x + c.w) * W, (c.y + c.h) * H];
    const ocupado = (q: number[]) => ja.some(s => s.pagina === idx && sobrepoe(s.r, q));
    if (ocupado(r) && doNome) {
      const alt = r[3] - r[1];
      for (let k = 0; k < 3 && ocupado(r); k++) r = [r[0], r[1] + alt + 3, r[2], r[3] + alt + 3];
    }
    if (ocupado(r) || r[3] > H - 20) continue;
    selo(e, idx, r, d, true);
    return true;
  }
  return false;
}

/** Página "Assinaturas digitais" (criada na primeira vez) com o selo grande do signatário */
function naPaginaDeAssinaturas(e: Escrita, d: DadosSelo, pagesRef: string) {
  let paginaIdx = objetoComMarca(e.pdf, MARCA_PAGINA);
  let dictNova: string | undefined;
  let tamanho: [number, number];
  if (paginaIdx != null && e.info.xref.offsets.has(paginaIdx)) {
    tamanho = mediaBox(findObject(e.pdf, e.info.xref, `${paginaIdx} 0 R`).toString('latin1'));
  } else {
    const todas = folhas(e, pagesRef);
    tamanho = mediaBox(findObject(e.pdf, e.info.xref, todas[todas.length - 1]).toString('latin1'));
    const [w, h] = tamanho;
    const conteudo = [
      `BT /F1 15 Tf 0.04 0.45 0.28 rg ${MARGEM} ${(h - 70).toFixed(2)} Td ${literal('Assinaturas digitais')} Tj ET`,
      `BT /F2 9 Tf 0.3 0.3 0.3 rg ${MARGEM} ${(h - 88).toFixed(2)} Td ${literal('Este documento foi assinado com certificados digitais ICP-Brasil. A validade jurídica está nas assinaturas')} Tj ET`,
      `BT /F2 9 Tf 0.3 0.3 0.3 rg ${MARGEM} ${(h - 100).toFixed(2)} Td ${literal('eletrônicas embutidas no arquivo (confira no painel de assinaturas do leitor de PDF ou em validar.iti.gov.br).')} Tj ET`,
      `0.04 0.45 0.28 RG 0.8 w ${MARGEM} ${(h - 112).toFixed(2)} m ${(w - MARGEM).toFixed(2)} ${(h - 112).toFixed(2)} l S`,
    ].join('\n');
    const conteudoIdx = novo(e);
    escrever(e, conteudoIdx, stream('', conteudo));
    paginaIdx = novo(e);
    dictNova = `/Type /Page /Parent ${pagesRef} /MediaBox [0 0 ${w} ${h}] /Resources << /Font ${FONTES} >> /Contents ${conteudoIdx} 0 R /Annots [] ${MARCA_PAGINA}`;
    const pagesIdx = Number(pagesRef.split(' ')[0]);
    const raiz = findObject(e.pdf, e.info.xref, pagesRef).toString('latin1')
      .replace(/\/Kids\s*\[([^\]]*)\]/, (_m, k) => `/Kids [${String(k).trim()} ${paginaIdx} 0 R]`)
      .replace(/\/Count\s+(\d+)/, (_m, n) => `/Count ${Number(n) + 1}`);
    escrever(e, pagesIdx, `<<${raiz}>>`);
  }
  const [w, h] = tamanho;
  const naPagina = selosExistentes(e.pdf).filter(s => s.pagina === paginaIdx).length;
  const porPagina = Math.max(1, Math.floor((h - TOPO - MARGEM) / (ALTURA_SELO + ESPACO)));
  const linha = naPagina % porPagina, coluna = Math.floor(naPagina / porPagina);
  const x1 = MARGEM + coluna * 6, y2 = h - TOPO - linha * (ALTURA_SELO + ESPACO) - coluna * 6;
  selo(e, paginaIdx!, [x1, y2 - ALTURA_SELO, x1 + w - 2 * MARGEM, y2], d, false, dictNova);
}

/** Acrescenta o selo visível do signatário (no traço dele ou na página de assinaturas), com os bytes anteriores intactos */
export async function acrescentarSeloVisivel(original: Buffer, d: DadosSelo): Promise<Buffer> {
  const e = iniciar(original);
  const pagesRef = /\/Pages\s+(\d+\s+\d+\s+R)/.exec(e.info.root)?.[1];
  if (!pagesRef) throw new Error('PDF sem árvore de páginas');
  if (!(await noTraco(e, d, pagesRef))) naPaginaDeAssinaturas(e, d, pagesRef);
  return fechar(e);
}
