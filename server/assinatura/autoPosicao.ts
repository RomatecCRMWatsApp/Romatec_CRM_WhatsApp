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

/** Papel escrito embaixo do traço no lugar do nome (ex.: Anexo VIII "VENDEDORA" / "COMPRADOR(A)") — vale só a linha exata */
export const ROTULOS_PAPEL: Record<string, string[]> = {
  comprador: ['COMPRADOR A', 'COMPRADOR', 'COMPRADORA', 'PROMISSARIO A COMPRADOR A', 'PROMISSARIA COMPRADORA', 'PROMISSARIO COMPRADOR'],
  conjuge: ['CONJUGE', 'CONJUGE COMPANHEIRO A', 'CONJUGE COMPANHEIRO A ANUENTE'],
  vendedora: ['VENDEDORA', 'PROMITENTE VENDEDORA', 'PROPRIETARIA'],
  intermediadora: ['GESTORA', 'INTERMEDIADORA', 'GESTORA DE VENDAS E INTERMEDIADORA'],
};

export const normalizar = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Altura máxima/mínima da caixa, folgas e largura mínima (pontos do PDF) */
export const ALTURA_MAX = 40, ALTURA_MIN = 22, FOLGA = 2, LARGURA_MIN = 150;
/** Distância máxima entre o traço e a linha do nome logo abaixo */
const TRACO_ATE_NOME = 22;
/** Faixa do topo/rodapé da página onde não entra caixa (cabeçalho e rodapé com a marca) */
const MARGEM_TOPO = 0.13, MARGEM_RODAPE = 0.07;

export interface Trecho { x: number; y: number; w: number; fs: number; txt: string; vetor?: boolean }

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
export interface Faixa { x: number; y: number; w: number; h: number }

export function caixasDaPagina(ls: Trecho[], W: number, H: number, alvos: { papel: string; nome: string; apelidos: string[] }[], faixas: Faixa[] | null = null): { papel: string; x: number; y: number; w: number; h: number }[] {
  const tracos = ls.filter(ehTraco);
  const out: { papel: string; x: number; y: number; w: number; h: number }[] = [];
  const usados = new Set<Trecho>();
  for (const l of ls) {
    if (ehTraco(l)) continue;
    const txt = normalizar(l.txt);
    const s = alvos.find(a => txt === a.nome) ?? alvos.find(a => a.apelidos.some(ap => txt === ap || txt.startsWith(`${ap} `)))
      ?? alvos.find(a => (ROTULOS_PAPEL[a.papel] ?? []).includes(txt));
    if (!s) continue;
    // O traço logo acima do nome, na mesma coluna
    const traco = tracos.filter(t => !usados.has(t) && t.y > l.y && t.y - l.y <= TRACO_ATE_NOME && sobrepoeX(t, l)).sort((a, b) => a.y - b.y)[0];
    if (!traco) continue;
    usados.add(traco);
    const base = traco.y + FOLGA;
    // Espaço livre: até o texto mais baixo que esteja acima do traço, na mesma faixa horizontal (ou o cabeçalho)
    const x = traco.x, w = Math.min(Math.max(traco.w, LARGURA_MIN), W - traco.x - 4);
    // Cabeçalho: as faixas de imagem (marca) acima do traço; sem a lista (testes), a margem fixa do topo
    const topoLivre = faixas ? Math.min(H - 6, ...faixas.filter(f => f.y >= traco.y && sobrepoeX(f, { x, w })).map(f => f.y)) : H * (1 - MARGEM_TOPO);
    const teto = Math.min(topoLivre, ...ls.filter(o => o !== traco && o.y > traco.y + 1 && sobrepoeX(o, { x, w })).map(o => o.y - o.fs * 0.3));
    const h = Math.min(ALTURA_MAX, teto - base - FOLGA);
    if (h >= ALTURA_MIN && base >= H * MARGEM_RODAPE) { out.push({ papel: s.papel, x, y: base, w, h }); continue; }
    // Sem espaço em cima do traço (PDF antigo, bloco colado no cabeçalho): a caixa vai logo abaixo do bloco da
    // assinatura (nome, papel, documento), se ali houver espaço livre — nunca por cima de texto
    const bloco = [l, ...ls.filter(o => o !== l && o.y < l.y && l.y - o.y <= 40 && sobrepoeX(o, { x, w }) && !ehTraco(o))];
    const fundo = Math.min(...bloco.map(o => o.y - o.fs * 0.3)) - FOLGA;
    const piso = Math.max(H * MARGEM_RODAPE, ...(faixas ?? []).filter(f => f.y + f.h <= fundo && sobrepoeX(f, { x, w })).map(f => f.y + f.h), ...ls.filter(o => !bloco.includes(o) && o.y < fundo && sobrepoeX(o, { x, w })).map(o => o.y + o.fs));
    const h2 = Math.min(ALTURA_MAX, fundo - piso - FOLGA);
    if (h2 >= ALTURA_MIN) out.push({ papel: s.papel, x, y: fundo - h2, w, h: h2 });
  }
  return out;
}

/** Largura máxima de um traço de assinatura desenhado (bordas de tabela ocupam a largura da página e ficam de fora) */
const TRACO_VETOR_MIN = 90, TRACO_VETOR_MAX = 320;

/**
 * Traços de assinatura desenhados como linha (PDFs gerados antes da âncora de texto invisível): segmentos horizontais
 * de 90 a 320 pt, viram "traços" de texto para a mesma regra.
 */
async function tracosVetoriais(p: any, OPS: any, x0: number, y0: number, faixas: Faixa[] = [], W = 595, H = 842): Promise<Trecho[]> {
  const ol = await p.getOperatorList();
  type M = number[];
  const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const pilha: M[] = [];
  const out: Trecho[] = [];
  const ap = (x: number, y: number) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) pilha.push(ctm);
    else if (fn === OPS.restore) ctm = pilha.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      // Faixas de imagem largas e baixas (cabeçalho/rodapé da marca) são obstáculo; a marca-d'água (grande) não
      const c1 = ap(0, 0), c2 = ap(1, 1);
      const fx = Math.min(c1[0], c2[0]) - x0, fy = Math.min(c1[1], c2[1]) - y0, fw = Math.abs(c2[0] - c1[0]), fh = Math.abs(c2[1] - c1[1]);
      if (fw >= W * 0.3 && fh <= H * 0.25) faixas.push({ x: fx, y: fy, w: fw, h: fh });
    }
    else if (fn === OPS.constructPath) {
      const [ops, co] = a as [number[], number[]];
      // Contorno de caixa/carimbo (caminho com 3+ segmentos) não é traço de assinatura: só o traço solto conta
      const caixaFechada = ops.filter(o => o === OPS.lineTo).length >= 3;
      if (caixaFechada) {
        // …a não ser que seja um retângulo fino (traço desenhado como retângulo preenchido)
        const pts: number[][] = [];
        for (let j = 0; j + 1 < co.length; j += 2) pts.push(ap(co[j], co[j + 1]));
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
        if (ops.every(o => o === OPS.moveTo || o === OPS.lineTo || o === OPS.closePath) && h <= 2 && w >= TRACO_VETOR_MIN && w <= TRACO_VETOR_MAX) {
          out.push({ x: Math.min(...xs) - x0, y: Math.max(...ys) - y0, w, fs: 8, txt: '_'.repeat(20), vetor: true });
        }
        continue;
      }
      let k = 0, cur: number[] | null = null;
      for (const o of ops) {
        if (o === OPS.moveTo) { cur = ap(co[k], co[k + 1]); k += 2; }
        else if (o === OPS.lineTo) {
          const nx = ap(co[k], co[k + 1]); k += 2;
          const w = cur ? Math.abs(nx[0] - cur[0]) : 0;
          if (cur && !caixaFechada && Math.abs(nx[1] - cur[1]) < 0.5 && w >= TRACO_VETOR_MIN && w <= TRACO_VETOR_MAX) {
            out.push({ x: Math.min(cur[0], nx[0]) - x0, y: cur[1] - y0, w, fs: 8, txt: '_'.repeat(20), vetor: true });
          }
          cur = nx;
        } else if (o === OPS.rectangle) {
          // Traço feito com retângulo fino preenchido (ex.: Anexo VIII)
          const [rx, ry, rw, rh] = co.slice(k, k + 4); k += 4;
          const a1 = ap(rx, ry), a2 = ap(rx + rw, ry + rh);
          const w = Math.abs(a2[0] - a1[0]), h = Math.abs(a2[1] - a1[1]);
          if (h <= 2 && w >= TRACO_VETOR_MIN && w <= TRACO_VETOR_MAX) out.push({ x: Math.min(a1[0], a2[0]) - x0, y: Math.max(a1[1], a2[1]) - y0, w, fs: 8, txt: '_'.repeat(20), vetor: true });
        }
        else if (o === OPS.curveTo) k += 6;
        else if (o === OPS.curveTo2 || o === OPS.curveTo3) k += 4;
      }
    }
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
      const ls = linhas(itens);
      // Traços desenhados que não têm já um traço de texto no mesmo lugar
      const faixas: Faixa[] = [];
      const vet = (await tracosVetoriais(p, pdfjs.OPS, x0, y0, faixas, W, H).catch(() => [] as Trecho[]))
        .filter(v => !ls.some(t => ehTraco(t) && Math.abs(t.y - v.y) <= 3 && sobrepoeX(t, v)));
      for (const c of caixasDaPagina([...ls, ...vet], W, H, alvos, faixas)) caixas.push({ papel: c.papel, pagina: n, x: c.x / W, y: c.y / H, w: c.w / W, h: c.h / H });
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
