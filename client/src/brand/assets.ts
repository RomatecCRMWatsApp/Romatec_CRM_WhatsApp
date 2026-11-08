import rDourado from "./assets/r-dourado.webp";
import wordmarkDourado from "./assets/wordmark-dourado.webp";
import rosaDark from "./assets/rosa-dark.webp";

/** Recortes oficiais do LOGO_ROMATEC_ATUAL — nunca substituir por texto. Na tela vão em WebP sem perda (mesma arte, no tamanho de exibição); os PNG originais ficam para os PDFs do servidor. */
export const brandAssets = {
  /** R oficial com a aba, dourado (518x457) */
  r: rDourado,
  /** ROMATEC + CONSULTORIA TOTAL dourado (1664x465) */
  wordmark: wordmarkDourado,
  /** Rosa dos ventos com estação total, versão dark (636x627) */
  rosa: rosaDark,
} as const;

export const BRAND_RATIOS = {
  r: 518 / 457,
  wordmark: 1664 / 465,
  rosa: 636 / 627,
} as const;
