/**
 * Utilitários para desenhar documentos (folder, memorial) num canvas de largura fixa,
 * independente da tela de quem gera — sai igual no celular e no computador.
 */

export const SANS = "Inter, Arial, Helvetica, sans-serif";
export const SERIF = "'Playfair Display', Georgia, serif";

export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error(`imagem não carregou: ${src}`));
    img.src = src;
  });
}

/** Primeira imagem que carregar; nenhuma → null */
export async function primeiraQueCarrega(srcs: string[]): Promise<HTMLImageElement | null> {
  for (const s of srcs) {
    try { return await carregarImagem(s); } catch { /* tenta a próxima */ }
  }
  return null;
}

/** SVG em linha (mapa) → imagem na largura pedida, com fonte que não depende da página */
export async function svgParaImagem(svg: SVGSVGElement, largura: number): Promise<{ img: HTMLImageElement; altura: number }> {
  const vb = svg.viewBox.baseVal;
  const altura = Math.round(largura * (vb && vb.width ? vb.height / vb.width : 0.6));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(largura));
  clone.setAttribute("height", String(altura));
  clone.setAttribute("font-family", SANS);
  clone.removeAttribute("class");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    return { img: await carregarImagem(url), altura };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}

/** Quebra o texto em linhas que cabem na largura (com a fonte atual do contexto) */
export function quebrar(ctx: CanvasRenderingContext2D, texto: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tenta = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tenta).width <= max || !atual) atual = tenta;
    else { linhas.push(atual); atual = palavra; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Fonte que faz o texto caber numa linha (reduz até 14px) */
export function fonteQueCabe(ctx: CanvasRenderingContext2D, texto: string, max: number, peso: string, tamanho: number, familia: string) {
  let t = tamanho;
  do { ctx.font = `${peso} ${t}px ${familia}`; t -= 2; } while (ctx.measureText(texto).width > max && t > 14);
}

/** Retângulo arredondado preenchido (cai num retângulo comum se o navegador não tiver roundRect) */
export function retanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, raio: number, cor: string) {
  ctx.fillStyle = cor;
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, w, h, raio); else ctx.rect(x, y, w, h);
  ctx.fill();
}

/**
 * Duas passadas: mede a altura com compor(..., false) e desenha com compor(..., true).
 * Devolve o JPEG como data URL.
 */
export async function renderizarJpeg(largura: number, compor: (ctx: CanvasRenderingContext2D, desenhar: boolean) => number): Promise<string> {
  try { await (document as any).fonts?.ready; } catch { /* segue com a fonte do sistema */ }
  const medida = document.createElement("canvas").getContext("2d");
  if (!medida) throw new Error("Navegador sem suporte a canvas");
  const altura = compor(medida, false);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte a canvas");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, largura, altura);
  compor(ctx, true);
  return canvas.toDataURL("image/jpeg", 0.9);
}
