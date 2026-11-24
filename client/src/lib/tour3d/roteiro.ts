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

/**
 * Curva cúbica de Bézier (como o cubic-bezier do CSS): devolve y para um x de 0 a 1.
 * As curvas usadas são as do guia de animação (Emil Kowalski) — nada inventado.
 */
export function curvaBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const xEm = (u: number) => ((ax * u + bx) * u + cx) * u;
  const yEm = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const erro = xEm(u) - x;
      if (Math.abs(erro) < 1e-6) break;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= erro / d;
    }
    // reforço por bisseção quando a derivada é pequena (pontas da curva)
    let lo = 0, hi = 1;
    for (let i = 0; i < 20 && Math.abs(xEm(u) - x) > 1e-5; i++) {
      if (xEm(u) < x) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return yEm(u);
  };
}

/** Entrar/sair e textos: --ease-out forte. */
export const EASE_OUT = curvaBezier(0.23, 1, 0.32, 1);
/** Algo se movendo na tela (deslizes das transições): --ease-in-out. */
export const EASE_IN_OUT = curvaBezier(0.77, 0, 0.175, 1);

/**
 * Progresso da câmera dentro da cena: chega rápido ao enquadramento e desacelera,
 * mas nunca para (parte linear) — câmera parada parece vídeo travado.
 */
export function progressoCamera(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  return 0.7 * EASE_OUT(x) + 0.3 * x;
}

/**
 * Duração da foto encaixada no ritmo da música: cada troca de foto começa numa batida.
 * Mantém o tempo pedido o mais perto possível (mínimo de 2 batidas por foto).
 */
export function segundosNoRitmo(segundos: number, bpm: number): number {
  if (!(bpm > 0)) return segundos;
  const batida = 60 / bpm;
  const passos = Math.max(2, Math.round((segundos - TRANSICAO_S) / batida));
  return TRANSICAO_S + passos * batida;
}

/** Texto entrando: sobe um pouco e aparece, em cascata (`ordem` × 60 ms), ease-out de 0,6 s. */
export const TEXTO_ENTRADA_S = 0.6;
export const TEXTO_CASCATA_S = 0.06;
export function entradaTexto(tempo: number, ordem: number): { alfa: number; subida: number } {
  const x = (tempo - ordem * TEXTO_CASCATA_S) / TEXTO_ENTRADA_S;
  const e = EASE_OUT(Math.min(1, Math.max(0, x)));
  return { alfa: e, subida: 1 - e };
}

/** Tremida de impacto nas trocas com zoom ou clarão: começa no meio da troca e some em 7 quadros. */
const TREMIDA_QUADROS = 7;
export function impactoEm(r: Roteiro, t: number, fps = FPS): { x: number; y: number } {
  for (let i = 1; i < r.cenas.length; i++) {
    const tr = r.cenas[i].transicao;
    if (tr !== "zoom" && tr !== "flash") continue;
    const dt = t - (r.inicios[i] + TRANSICAO_S / 2);
    const q = dt * fps;
    if (q < 0 || q >= TREMIDA_QUADROS) continue;
    const forca = 0.008 * (1 - q / TREMIDA_QUADROS);
    return { x: Math.sin(q * 2.1) * forca, y: Math.cos(q * 2.7) * forca };
  }
  return { x: 0, y: 0 };
}

/** O que aparece no instante t (segundos). */
export function quadroEm(r: Roteiro, t: number): Quadro {
  const cenas: CenaNoQuadro[] = [];
  r.cenas.forEach((c, i) => {
    const ini = r.inicios[i];
    const fim = ini + c.duracao;
    if (t < ini || t > fim) return;
    const progresso = Math.min(1, Math.max(0, (t - ini) / c.duracao));
    let opacidade = 1;
    if (i > 0 && t < ini + TRANSICAO_S) opacidade = EASE_IN_OUT((t - ini) / TRANSICAO_S);
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
  const p = progressoCamera(progresso);
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
