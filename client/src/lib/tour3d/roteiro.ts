/**
 * Tour 3D a partir de fotos — roteiro do vídeo (regras puras, sem navegador).
 * Define a ordem das cenas, o movimento de câmera de cada foto, as transições e o cartão final.
 */

export type Movimento = "aproximar" | "afastar" | "deslizar-esquerda" | "deslizar-direita" | "subir" | "orbitar";
export type Formato = "reel" | "paisagem" | "quadrado";
export type Transicao =
  | "dissolver" | "flash" | "escurecer" | "deslizar-cima" | "deslizar-baixo" | "deslizar-esquerda" | "deslizar-direita" | "girar" | "zoom";

export const TRANSICOES: Record<Transicao, string> = {
  dissolver: "Dissolver",
  flash: "Flash (clarão)",
  escurecer: "Escurecer",
  "deslizar-cima": "Deslizar para cima",
  "deslizar-baixo": "Deslizar para baixo",
  "deslizar-esquerda": "Deslizar para a esquerda",
  "deslizar-direita": "Deslizar para a direita",
  girar: "Girar",
  zoom: "Zoom",
};

/** Sequência do modo "variado": cada troca de foto usa um efeito diferente. */
const CICLO_TRANSICAO: Transicao[] = ["dissolver", "deslizar-esquerda", "zoom", "flash", "deslizar-cima", "girar", "escurecer", "deslizar-direita", "deslizar-baixo"];

export function transicaoVariada(indice: number): Transicao {
  return CICLO_TRANSICAO[indice % CICLO_TRANSICAO.length];
}

export const FORMATOS: Record<Formato, { rotulo: string; largura: number; altura: number; uso: string }> = {
  reel: { rotulo: "Reel / Status (9:16)", largura: 1080, altura: 1920, uso: "Instagram, TikTok, status do WhatsApp" },
  paisagem: { rotulo: "Apresentação (16:9)", largura: 1920, altura: 1080, uso: "YouTube, TV, apresentação ao cliente" },
  quadrado: { rotulo: "Feed (1:1)", largura: 1080, altura: 1080, uso: "Feed do Instagram e Facebook" },
};

export const MOVIMENTOS: Record<Movimento, string> = {
  aproximar: "Aproximar",
  afastar: "Afastar",
  "deslizar-esquerda": "Deslizar para a esquerda",
  "deslizar-direita": "Deslizar para a direita",
  subir: "Subir",
  orbitar: "Girar em volta",
};

/** Sequência usada quando o corretor não escolhe: alterna para o vídeo não ficar repetitivo. */
const CICLO: Movimento[] = ["aproximar", "deslizar-direita", "orbitar", "afastar", "deslizar-esquerda", "subir"];

export const TRANSICAO_S = 0.7;
export const CARTAO_FINAL_S = 3;
export const FPS = 30;

export interface CenaRoteiro {
  movimento: Movimento;
  duracao: number;
  /** como esta foto entra (a primeira foto não tem transição) */
  transicao?: Transicao;
}

export interface Roteiro {
  cenas: CenaRoteiro[];
  /** instante (s) em que cada cena começa */
  inicios: number[];
  cartaoFinal: boolean;
  /** instante em que o cartão final começa a aparecer */
  inicioCartao: number;
  duracaoTotal: number;
}

/**
 * Movimento automático de uma foto: foto bem mais larga que o quadro (paisagem num reel)
 * desliza para mostrar a largura toda; as demais seguem o ciclo.
 */
export function movimentoAutomatico(indice: number, aspectoFoto: number, aspectoQuadro: number): Movimento {
  if (aspectoFoto / aspectoQuadro > 1.25) return indice % 2 === 0 ? "deslizar-direita" : "deslizar-esquerda";
  return CICLO[indice % CICLO.length];
}

export function montarRoteiro(cenas: CenaRoteiro[], cartaoFinal: boolean): Roteiro {
  const inicios: number[] = [];
  let t = 0;
  cenas.forEach((c, i) => {
    inicios.push(t);
    t += c.duracao - (i < cenas.length - 1 ? TRANSICAO_S : 0);
  });
  const fimFotos = t;
  const inicioCartao = cartaoFinal ? Math.max(0, fimFotos - TRANSICAO_S) : fimFotos;
  const duracaoTotal = cartaoFinal ? inicioCartao + CARTAO_FINAL_S : fimFotos;
  return { cenas, inicios, cartaoFinal, inicioCartao, duracaoTotal };
}

export interface CenaNoQuadro {
  indice: number;
  /** 0..1 dentro da cena */
  progresso: number;
  /** 0..1 — quanto a cena já entrou (1 = transição concluída) */
  opacidade: number;
  transicao: Transicao;
}

export interface Quadro {
  cenas: CenaNoQuadro[];
  /** 0..1 — opacidade do cartão final */
  cartao: number;
}

const suave = (x: number) => x * x * (3 - 2 * x);

/** O que aparece no instante t (segundos). */
export function quadroEm(r: Roteiro, t: number): Quadro {
  const cenas: CenaNoQuadro[] = [];
  r.cenas.forEach((c, i) => {
    const ini = r.inicios[i];
    const fim = ini + c.duracao;
    if (t < ini || t > fim) return;
    const progresso = Math.min(1, Math.max(0, (t - ini) / c.duracao));
    let opacidade = 1;
    if (i > 0 && t < ini + TRANSICAO_S) opacidade = suave((t - ini) / TRANSICAO_S);
    cenas.push({ indice: i, progresso, opacidade, transicao: c.transicao ?? "dissolver" });
  });
  const cartao = r.cartaoFinal && t >= r.inicioCartao ? suave(Math.min(1, (t - r.inicioCartao) / TRANSICAO_S)) : 0;
  return { cenas, cartao };
}

export interface PoseCamera {
  /** posição relativa ao centro da foto, em alturas de quadro */
  x: number;
  y: number;
  /** distância relativa (1 = enquadramento normal; menor = mais perto) */
  distancia: number;
  /** quanto o alvo acompanha a câmera (0 = sempre olha o centro, 1 = olha reto) */
  seguir: number;
}

/**
 * Pose da câmera em cada momento da cena. `folga` é quanto a foto sobra para os lados
 * (em alturas de quadro), usado para o deslize mostrar a foto inteira.
 */
export function poseCamera(m: Movimento, progresso: number, folga = 0.12): PoseCamera {
  const p = suave(Math.min(1, Math.max(0, progresso)));
  const lado = Math.max(0.08, folga);
  switch (m) {
    case "aproximar": return { x: 0, y: -0.02 * p, distancia: 1 - 0.16 * p, seguir: 0.5 };
    case "afastar": return { x: 0, y: 0.02 * (1 - p), distancia: 0.84 + 0.16 * p, seguir: 0.5 };
    case "deslizar-direita": return { x: -lado + 2 * lado * p, y: 0, distancia: 0.95, seguir: 0.75 };
    case "deslizar-esquerda": return { x: lado - 2 * lado * p, y: 0, distancia: 0.95, seguir: 0.75 };
    case "subir": return { x: 0, y: -0.08 + 0.16 * p, distancia: 0.93, seguir: 0.6 };
    case "orbitar": {
      const a = (p - 0.5) * 0.5;
      return { x: Math.sin(a) * 0.3, y: 0, distancia: 0.92 + 0.04 * Math.cos(a * 2), seguir: 0.15 };
    }
  }
}

export function totalDeQuadros(r: Roteiro, fps = FPS): number {
  return Math.max(1, Math.round(r.duracaoTotal * fps));
}

/** Nome do arquivo baixado: tour-3d-<titulo>-<formato>.mp4 */
export function nomeArquivo(titulo: string, formato: Formato, extensao: string): string {
  const base = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `tour-3d-${base || "imovel"}-${formato}.${extensao}`;
}
