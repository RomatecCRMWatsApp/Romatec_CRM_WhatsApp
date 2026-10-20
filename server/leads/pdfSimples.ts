/**
 * Gerador de PDF mínimo (sem dependência): tabela de texto em A4 paisagem,
 * fontes padrão Helvetica/Helvetica-Bold com WinAnsiEncoding (acentos do português).
 * Usado para a lista de leads que vai por download e como documento no WhatsApp.
 */

export interface ColunaPdf { titulo: string; largura: number }
export interface TabelaPdf {
  titulo: string;
  subtitulo: string;
  rodape: string;
  colunas: ColunaPdf[];
  linhas: string[][];
}

const LARGURA = 842;
const ALTURA = 595;
const MARGEM = 32;
const FONTE = 9;
const LINHA = 16;

// Larguras AFM da Helvetica (ASCII 32–126), em 1/1000 do tamanho da fonte
const AFM = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

/** Largura aproximada do texto em pontos (acentos medidos pela letra base) */
export function larguraTexto(texto: string, tamanho = FONTE, negrito = false): number {
  const base = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
  let w = 0;
  for (const ch of base) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? AFM[c - 32] : 556;
  }
  return (w / 1000) * tamanho * (negrito ? 1.06 : 1);
}

/** Corta o texto para caber na largura (termina em "…") */
export function caber(texto: string, largura: number, tamanho = FONTE, negrito = false): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (larguraTexto(t, tamanho, negrito) <= largura) return t;
  let s = t;
  while (s.length > 1 && larguraTexto(`${s}…`, tamanho, negrito) > largura) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// WinAnsi: Latin-1 direto + alguns símbolos do bloco 0x80–0x9F
const WIN_ANSI_EXTRA: Record<string, number> = { '€': 0x80, '…': 0x85, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95 };

/** Texto → string literal do PDF (bytes WinAnsi; fora do conjunto vira "?", emoji some) */
function literal(texto: string): string {
  let out = '';
  for (const ch of texto.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    let b: number;
    if (WIN_ANSI_EXTRA[ch] !== undefined) b = WIN_ANSI_EXTRA[ch];
    else if ((c >= 32 && c <= 126) || (c >= 0xa0 && c <= 0xff)) b = c;
    else if (c > 0xffff || (c >= 0x2600 && c <= 0x27bf) || c === 0xfe0f) continue; // emoji
    else b = 63;
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return `(${out})`;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

function texto(x: number, y: number, t: string, fonte: 'F1' | 'F2', tamanho: number, cor = '0.13 0.16 0.14'): string {
  return `BT ${cor} rg /${fonte} ${tamanho} Tf ${num(x)} ${num(y)} Td ${literal(t)} Tj ET`;
}

function retangulo(x: number, y: number, w: number, h: number, cor: string): string {
  return `${cor} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`;
}

/** Monta o PDF da tabela (quebra de página automática, cabeçalho repetido) */
export function gerarPdfTabela(tab: TabelaPdf): Buffer {
  const larguraUtil = LARGURA - 2 * MARGEM;
  const soma = tab.colunas.reduce((a, c) => a + c.largura, 0);
  const cols = tab.colunas.map(c => ({ ...c, largura: (c.largura / soma) * larguraUtil }));

  const topoTabela = ALTURA - MARGEM - 78;
  const porPagina = Math.max(1, Math.floor((topoTabela - MARGEM - 24) / LINHA) - 1);
  const paginas: string[][][] = [];
  for (let i = 0; i < Math.max(1, tab.linhas.length); i += porPagina) paginas.push(tab.linhas.slice(i, i + porPagina));

  const conteudos = paginas.map((linhas, p) => {
    const ops: string[] = [];
    // Cabeçalho com a marca
    ops.push(retangulo(0, ALTURA - 56, LARGURA, 56, '0.06 0.35 0.2'));
    ops.push(texto(MARGEM, ALTURA - 30, 'ROMATEC', 'F2', 18, '1 1 1'));
    ops.push(texto(MARGEM + larguraTexto('ROMATEC', 18, true) + 10, ALTURA - 30, 'Consultoria Total', 'F1', 12, '0.85 0.95 0.88'));
    ops.push(texto(MARGEM, ALTURA - 46, 'CRECI/MA 4.705 · romateccrm.com', 'F1', 8, '0.8 0.92 0.84'));
    const t2 = tab.titulo;
    ops.push(texto(LARGURA - MARGEM - larguraTexto(t2, 13, true), ALTURA - 30, t2, 'F2', 13, '1 1 1'));
    ops.push(texto(LARGURA - MARGEM - larguraTexto(tab.subtitulo, 8), ALTURA - 46, tab.subtitulo, 'F1', 8, '0.85 0.95 0.88'));

    // Cabeçalho da tabela
    let y = topoTabela;
    ops.push(retangulo(MARGEM, y - 5, larguraUtil, LINHA, '0.88 0.94 0.9'));
    let x = MARGEM;
    for (const c of cols) {
      ops.push(texto(x + 4, y, caber(c.titulo, c.largura - 8, FONTE, true), 'F2', FONTE, '0.06 0.3 0.17'));
      x += c.largura;
    }
    // Linhas (zebradas)
    linhas.forEach((linha, i) => {
      y -= LINHA;
      if (i % 2 === 1) ops.push(retangulo(MARGEM, y - 5, larguraUtil, LINHA, '0.96 0.97 0.96'));
      let cx = MARGEM;
      cols.forEach((c, j) => {
        ops.push(texto(cx + 4, y, caber(linha[j] ?? '', c.largura - 8), 'F1', FONTE));
        cx += c.largura;
      });
    });
    if (!tab.linhas.length) ops.push(texto(MARGEM + 4, y - LINHA, 'Nenhum lead neste filtro.', 'F1', FONTE));

    // Rodapé
    ops.push(texto(MARGEM, MARGEM - 12, tab.rodape, 'F1', 7, '0.45 0.5 0.47'));
    const pag = `Página ${p + 1} de ${paginas.length}`;
    ops.push(texto(LARGURA - MARGEM - larguraTexto(pag, 7), MARGEM - 12, pag, 'F1', 7, '0.45 0.5 0.47'));
    return ops.join('\n');
  });

  // Objetos: 1 catálogo, 2 páginas, 3 Helvetica, 4 Helvetica-Bold, depois (página, conteúdo) por página
  const objs: string[] = [];
  const idsPaginas = conteudos.map((_, i) => 5 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${idsPaginas.map(id => `${id} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  conteudos.forEach((c, i) => {
    const id = idsPaginas[i];
    objs[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objs[id + 1] = `<< /Length ${Buffer.byteLength(c, 'latin1')} >>\nstream\n${c}\nendstream`;
  });

  // Tudo em latin1: os literais já estão em bytes WinAnsi
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
