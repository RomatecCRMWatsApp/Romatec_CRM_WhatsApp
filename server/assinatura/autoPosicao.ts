/**
 * Posições de assinatura automáticas, ancoradas na LINHA DE ASSINATURA (o traço), não só no nome:
 *  - vale a linha que traz SÓ o nome do signatário (ou a razão social/fantasia da gestora) e que está logo abaixo de um
 *    traço de assinatura ("_____" — nos documentos do sistema desenhados com traço vetorial há um traço invisível de
 *    texto no mesmo lugar, para servir de âncora);
 *  - o nome numa tabela (Quadro-Resumo), num parágrafo ou num documento anexado (conta de luz, RG…) não tem traço em
 *    cima: não conta;
 *  - a caixa fica em cima do traço, na largura dele, e a altura se ajusta ao espaço livre até o texto de cima — nunca
 *    cobre texto, cabeçalho nem outra caixa;
 *  - uma caixa por traço (o mesmo traço não recebe duas pessoas nem dois carimbos).
 */
import type { Caixa } from './pdf';

/** apelidos: outros nomes da mesma parte que valem pelo começo da linha (ex.: razão social da gestora) */
export interface SignatarioNome { papel: string; nome: string; apelidos?: string[] }

export const normalizar = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Altura máxima/mínima da caixa, folgas e largura mínima (pontos do PDF) */
export const ALTURA_MAX = 40, ALTURA_MIN = 22, FOLGA = 2, LARGURA_MIN = 150;
/** Distância máxima entre o traço e a linha do nome logo abaixo */
const TRACO_ATE_NOME = 22;
/** Faixa do topo/rodapé da página onde não entra caixa (cabeçalho e rodapé com a marca) */
const MARGEM_TOPO = 0.13, MARGEM_RODAPE = 0.07;

export interface Trecho { x: number; y: number; w: number; fs: number; txt: string }

/** Agrupa os pedaços de texto da mesma linha (mesma altura) que estão encostados, separando colunas */
export function linhas(itens: Trecho[]): Trecho[] {
  const porY = new Map<number, Trecho[]>();
  for (const t of itens) {
    const k = Math.round(t.y);
    const chave = Array.from(porY.keys()).find(y => Math.abs(y - k) <= 1.5) ?? k;
    porY.set(chave, [...(porY.get(chave) ?? []), t]);
  }
  const out: Trecho[] = [];
  for (const grupo of Array.from(porY.values())) {
    const g = [...grupo].sort((a, b) => a.x - b.x);
    const linha: Trecho[] = [];
    for (const t of g) {
      const ant = linha.length ? linha[linha.length - 1] : undefined;
      const gap = ant ? t.x - (ant.x + ant.w) : Infinity;
      if (ant && gap <= Math.max(8, t.fs * 1.2)) {
        linha[linha.length - 1] = { x: ant.x, y: ant.y, w: Math.max(ant.w, t.x + t.w - ant.x), txt: `${ant.txt}${gap > t.fs * 0.15 ? ' ' : ''}${t.txt}`, fs: Math.max(ant.fs, t.fs) };
      } else linha.push({ ...t });
    }
    out.push(...linha);
  }
  return out;
}

const ehTraco = (t: Trecho) => /^_{12,}$/.test(t.txt.replace(/\s+/g, ''));
const sobrepoeX = (a: { x: number; w: number }, b: { x: number; w: number }) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 4;

/**
 * Caixas de uma página (coordenadas em pontos, origem embaixo à esquerda) a partir das linhas de texto.
 * Exportada para os testes: recebe as linhas já agrupadas.
 */
export function caixasDaPagina(ls: Trecho[], W: number, H: number, alvos: { papel: string; nome: string; apelidos: string[] }[]): { papel: string; x: number; y: number; w: number; h: number }[] {
  const tracos = ls.filter(ehTraco);
  const out: { papel: string; x: number; y: number; w: number; h: number }[] = [];
  const usados = new Set<Trecho>();
  for (const l of ls) {
    if (ehTraco(l)) continue;
    const txt = normalizar(l.txt);
    const s = alvos.find(a => txt === a.nome) ?? alvos.find(a => a.apelidos.some(ap => txt === ap || txt.startsWith(`${ap} `)));
    if (!s) continue;
    // O traço logo acima do nome, na mesma coluna
    const traco = tracos.filter(t => !usados.has(t) && t.y > l.y && t.y - l.y <= TRACO_ATE_NOME && sobrepoeX(t, l)).sort((a, b) => a.y - b.y)[0];
    if (!traco) continue;
    usados.add(traco);
    const base = traco.y + FOLGA;
    // Espaço livre: até o texto mais baixo que esteja acima do traço, na mesma faixa horizontal (ou o cabeçalho)
    const x = traco.x, w = Math.min(Math.max(traco.w, LARGURA_MIN), W - traco.x - 4);
    const teto = Math.min(H * (1 - MARGEM_TOPO), ...ls.filter(o => o !== traco && o.y > traco.y + 1 && sobrepoeX(o, { x, w })).map(o => o.y - o.fs * 0.3));
    const h = Math.min(ALTURA_MAX, teto - base - FOLGA);
    if (h >= ALTURA_MIN && base >= H * MARGEM_RODAPE) { out.push({ papel: s.papel, x, y: base, w, h }); continue; }
    // Sem espaço em cima do traço (PDF antigo, bloco colado no cabeçalho): a caixa vai logo abaixo do bloco da
    // assinatura (nome, papel, documento), se ali houver espaço livre — nunca por cima de texto
    const bloco = [l, ...ls.filter(o => o !== l && o.y < l.y && l.y - o.y <= 40 && sobrepoeX(o, { x, w }) && !ehTraco(o))];
    const fundo = Math.min(...bloco.map(o => o.y - o.fs * 0.3)) - FOLGA;
    const piso = Math.max(H * MARGEM_RODAPE, ...ls.filter(o => !bloco.includes(o) && o.y < fundo && sobrepoeX(o, { x, w })).map(o => o.y + o.fs));
    const h2 = Math.min(ALTURA_MAX, fundo - piso - FOLGA);
    if (h2 >= ALTURA_MIN) out.push({ papel: s.papel, x, y: fundo - h2, w, h: h2 });
  }
  return out;
}

export async function localizarAssinaturas(pdf: Buffer, sigs: SignatarioNome[]): Promise<Caixa[]> {
  const alvos = sigs.map(s => ({ papel: s.papel, nome: normalizar(s.nome), apelidos: (s.apelidos ?? []).map(normalizar).filter(a => a.split(' ').length >= 2) })).filter(s => s.nome.split(' ').length >= 2 || s.apelidos.length);
  if (!alvos.length) return [];
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableFontFace: true, isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  const caixas: Caixa[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const [x0, y0, x1, y1] = p.view as number[];
      const W = x1 - x0, H = y1 - y0;
      const t = await p.getTextContent();
      const itens: Trecho[] = t.items.filter((i: any) => typeof i.str === 'string' && i.str.trim())
        .map((i: any) => ({ x: i.transform[4] - x0, y: i.transform[5] - y0, w: i.width, fs: Math.abs(i.transform[0]) || 10, txt: i.str }));
      for (const c of caixasDaPagina(linhas(itens), W, H, alvos)) caixas.push({ papel: c.papel, pagina: n, x: c.x / W, y: c.y / H, w: c.w / W, h: c.h / H });
      p.cleanup?.();
    }
  } finally { await doc.destroy?.(); }
  return caixas;
}

/**
 * Limpa uma lista de caixas: tira as repetidas (mesma página, sobrepostas — o mesmo lugar marcado duas vezes, ou pela
 * mesma pessoa, ou por duas) e as fora da página. Vale para as salvas à mão e para as automáticas.
 */
export function caixasSemSobreposicao(cxs: Caixa[]): Caixa[] {
  const area = (c: Caixa) => c.w * c.h;
  const inter = (a: Caixa, b: Caixa) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const out: Caixa[] = [];
  for (const c of cxs) {
    if (!(c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.001 && c.y + c.h <= 1.001)) continue;
    if (out.some(o => o.pagina === c.pagina && inter(o, c) > 0.15 * Math.min(area(o), area(c)))) continue;
    out.push(c);
  }
  return out;
}
