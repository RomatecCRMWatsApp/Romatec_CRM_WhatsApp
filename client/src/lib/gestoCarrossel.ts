/** Gesto no carrossel de fotos de Materiais: para o lado troca de foto, para cima baixa, para baixo envia no WhatsApp */
export type AcaoGesto = "anterior" | "proxima" | "baixar" | "enviar";

/** Distância mínima (px) para valer como gesto: abaixo disso é só um toque */
export const LIMIAR_LADO_PX = 60;
export const LIMIAR_VERTICAL_PX = 90;

export function acaoDoGesto(dx: number, dy: number, limites: { inicio: boolean; fim: boolean } = { inicio: false, fim: false }): AcaoGesto | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= ay) {
    if (ax < LIMIAR_LADO_PX) return null;
    if (dx < 0) return limites.fim ? null : "proxima";
    return limites.inicio ? null : "anterior";
  }
  if (ay < LIMIAR_VERTICAL_PX) return null;
  return dy < 0 ? "baixar" : "enviar";
}
