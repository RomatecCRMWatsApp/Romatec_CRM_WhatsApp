/**
 * Posições de assinatura automáticas: procura no PDF cada linha que traz SÓ o nome do signatário (o nome impresso
 * embaixo da linha de assinatura, no CPCV, no contrato de intermediação, nos anexos…) e põe a caixa logo acima dela.
 * O nome no meio de um parágrafo (qualificação) não conta: a linha tem de ser exatamente o nome.
 */
import type { Caixa } from './pdf';

/** apelidos: outros nomes da mesma parte que valem pelo começo da linha (ex.: razão social da gestora) */
export interface SignatarioNome { papel: string; nome: string; apelidos?: string[] }

const normalizar = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Altura e folga da caixa (pontos do PDF) */
const ALTURA = 34, FOLGA = 2, LARGURA_MIN = 150;

interface Trecho { x: number; y: number; w: number; fs: number; txt: string }

/** Agrupa os pedaços de texto da mesma linha (mesma altura) que estão encostados, separando colunas */
function linhas(itens: Trecho[]): Trecho[] {
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
        linha[linha.length - 1] = { x: ant.x, y: ant.y, w: t.x + t.w - ant.x, txt: `${ant.txt}${gap > t.fs * 0.15 ? ' ' : ''}${t.txt}`, fs: Math.max(ant.fs, t.fs) };
      } else linha.push({ ...t });
    }
    out.push(...linha);
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
      for (const l of linhas(itens)) {
        const txt = normalizar(l.txt);
        const s = alvos.find(a => txt === a.nome) ?? alvos.find(a => a.apelidos.some(ap => txt === ap || txt.startsWith(`${ap} `)));
        if (!s) continue;
        const w = Math.min(Math.max(l.w, LARGURA_MIN), W - l.x - 4);
        const base = l.y + l.fs + FOLGA;
        if (base + ALTURA > H) continue;
        caixas.push({ papel: s.papel, pagina: n, x: l.x / W, y: base / H, w: w / W, h: ALTURA / H });
      }
      p.cleanup?.();
    }
  } finally { await doc.destroy?.(); }
  return caixas;
}
