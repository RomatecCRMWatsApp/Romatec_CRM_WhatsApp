// Tipos mínimos do pacote "qrcode" (sem depender de @types/qrcode)
declare module 'qrcode' {
  interface QROptions { type?: 'svg' | 'utf8' | 'terminal'; margin?: number; width?: number; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; color?: { dark?: string; light?: string } }
  export function toString(text: string, options?: QROptions): Promise<string>;
  export function toDataURL(text: string, options?: Omit<QROptions, 'type'>): Promise<string>;
  const _default: { toString: typeof toString; toDataURL: typeof toDataURL };
  export default _default;
}
