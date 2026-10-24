import rDourado from "./assets/r-dourado.png";
import wordmarkDourado from "./assets/wordmark-dourado.png";
import rosaDark from "./assets/rosa-dark.png";

/** Recortes oficiais do LOGO_ROMATEC_ATUAL — nunca substituir por texto. */
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
